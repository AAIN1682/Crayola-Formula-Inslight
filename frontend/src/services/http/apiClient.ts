import { ServiceError } from '../contracts';

export function apiBaseUrl(): string | undefined {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed.replace(/\/$/, '') : undefined;
}

export function isApiMode(): boolean {
  return apiBaseUrl() !== undefined;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string | { msg?: string }[] };
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail) && body.detail[0]?.msg) return body.detail[0].msg;
  } catch {
    /* fall through */
  }
  return response.statusText || 'The API request failed.';
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = apiBaseUrl();
  if (!base) throw new ServiceError('API base URL is not configured.', false);

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await parseError(response);
    throw new ServiceError(message, response.status >= 500 || response.status === 429);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
