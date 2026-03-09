// Ollama Cloud client (backend-only)
// Uses Node's built-in fetch (no axios dependency)
const config = require('../config');

const OLLAMA_CLOUD_BASE_URL = 'https://api.ollama.com';

function initOllama(opts = {}) {
  const apiKey = (opts.apiKey || config.OLLAMA_API_KEY || '').trim();
  const defaultModel = (opts.model || config.OLLAMA_MODEL || '').trim();

  if (!apiKey) {
    throw new Error('Missing OLLAMA_API_KEY for Ollama Cloud');
  }

  async function generate(prompt, options = {}) {
    const model = (options.model || defaultModel || '').trim();
    if (!model) {
      throw new Error('No model specified. Set OLLAMA_MODEL or pass options.model');
    }

    const body = {
      model,
      prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
      stream: false,
      ...(options.system ? { system: options.system } : {}),
      ...(options.format ? { format: options.format } : {}),
      ...(options.options ? { options: options.options } : {})
    };

    const res = await fetch(`${OLLAMA_CLOUD_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const detail = data?.error || data?.message || text || `HTTP ${res.status}`;
      throw new Error(`Ollama Cloud request failed (${res.status}): ${detail}`);
    }

    if (typeof data?.response === 'string') return data.response;
    if (typeof data?.output === 'string') return data.output;
    if (typeof data?.text === 'string') return data.text;

    return data;
  }

  return { generate };
}

module.exports = { initOllama };
