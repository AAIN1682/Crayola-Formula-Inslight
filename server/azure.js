import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AzureOpenAI } from 'openai';
import { loadAzureConfig, sanitizeLog } from './config.js';

const PROMPT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'prompts', 'assessment_explanation_v1.txt');
const TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 2;

export function validateExplanation(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.summary !== 'string' || !value.summary.trim()) return null;
  if (!Array.isArray(value.finding_explanations) || !Array.isArray(value.alerts) || !Array.isArray(value.next_steps)) {
    return null;
  }
  const finding_explanations = value.finding_explanations.map((item) => ({
    check_id: String(item?.check_id ?? ''),
    explanation: String(item?.explanation ?? ''),
    recommended_action: String(item?.recommended_action ?? ''),
    evidence_ids: Array.isArray(item?.evidence_ids) ? item.evidence_ids.map((id) => String(id)) : [],
  }));
  return {
    summary: value.summary.trim(),
    finding_explanations,
    alerts: value.alerts.map((item) => String(item)),
    next_steps: value.next_steps.map((item) => String(item)),
  };
}

function extractJson(text) {
  const trimmed = String(text ?? '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function createClient(config) {
  return new AzureOpenAI({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    apiVersion: config.apiVersion,
    deployment: config.deployment,
  });
}

async function complete(client, deployment, messages, signal, jsonMode, maxTokens) {
  const request = {
    model: deployment,
    messages,
    max_completion_tokens: maxTokens,
  };
  if (jsonMode) request.response_format = { type: 'json_object' };
  return client.chat.completions.create(request, { signal });
}

export async function explainWithAzure(payload) {
  const config = loadAzureConfig();
  if (!config.ok) {
    throw new Error('Azure OpenAI is not configured.');
  }
  const client = createClient(config);
  const instructions = readFileSync(PROMPT_PATH, 'utf8');
  const messages = [
    { role: 'system', content: instructions },
    { role: 'user', content: JSON.stringify(payload) },
  ];
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await complete(
        client,
        config.deployment,
        messages,
        AbortSignal.timeout(TIMEOUT_MS),
        attempt === 0,
        2500,
      );
      const explanation = validateExplanation(extractJson(response.choices?.[0]?.message?.content));
      if (!explanation) throw new Error('Explanation did not match the expected structure.');
      return { explanation, explanation_source: 'azure' };
    } catch (error) {
      lastError = error;
      console.error(sanitizeLog(error));
    }
  }
  throw lastError ?? new Error('Azure OpenAI did not return an explanation.');
}

/** Minimal connection check. Returns status only. */
export async function pingAzure() {
  const config = loadAzureConfig();
  if (!config.ok) return { ok: false, reason: 'missing_configuration' };
  try {
    const client = createClient(config);
    const response = await complete(
      client,
      config.deployment,
      [{ role: 'user', content: 'Reply with the single word ready.' }],
      AbortSignal.timeout(TIMEOUT_MS),
      false,
      200,
    );
    return { ok: Boolean(response?.choices?.length), reason: response?.choices?.length ? 'response_received' : 'empty_response' };
  } catch (error) {
    console.error(sanitizeLog(error));
    return { ok: false, reason: 'request_failed' };
  }
}
