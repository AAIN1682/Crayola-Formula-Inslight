import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV_NAMES = [
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_DEPLOYMENT',
  'AZURE_OPENAI_API_VERSION',
];

function readEnvFile() {
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'backend', '.env');
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const name = trimmed.slice(0, separator).trim();
    const raw = trimmed.slice(separator + 1).trim();
    values[name] = raw.replace(/^['"]|['"]$/g, '');
  }
  return values;
}

export function loadAzureConfig() {
  const file = readEnvFile();
  const value = (name) => {
    const fromProcess = process.env[name];
    if (typeof fromProcess === 'string' && fromProcess.trim()) return fromProcess.trim();
    const fromFile = file[name];
    return typeof fromFile === 'string' ? fromFile.trim() : '';
  };
  const missing = ENV_NAMES.filter((name) => !value(name));
  return {
    ok: missing.length === 0,
    missing,
    endpoint: value('AZURE_OPENAI_ENDPOINT'),
    apiKey: value('AZURE_OPENAI_API_KEY'),
    deployment: value('AZURE_OPENAI_DEPLOYMENT'),
    apiVersion: value('AZURE_OPENAI_API_VERSION'),
  };
}

export function sanitizeLog(error) {
  const status = error?.status ?? error?.code ?? 'unknown';
  const message = String(error?.message ?? 'request failed')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/api[-_ ]?key[=:]\s*\S+/gi, 'api_key=[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 180);
  return `azure_request_failed status=${status} message=${message}`;
}
