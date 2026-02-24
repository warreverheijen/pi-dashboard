const axios = require('axios');

function createAxiosInstance({ baseUrl, apiKey }) {
  const headers = {};
  if (apiKey) headers['X-Api-Key'] = apiKey;

  return axios.create({
    baseURL: baseUrl,
    headers,
    timeout: 10_000,
  });
}

class ApiError extends Error {
  constructor(service, status, message, body) {
    super(message);
    this.service = service;
    this.status = status;
    this.body = body;
  }
}

function withRetries(fn, retries = 2) {
  return async (...args) => {
    let attempt = 0;
    let lastErr;
    while (attempt <= retries) {
      try {
        return await fn(...args);
      } catch (err) {
        lastErr = err;
        const status = err && err.response && err.response.status;
        if (status && status < 500) throw err;
        attempt++;
        const backoff = 200 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
    throw lastErr;
  };
}

async function detectApiPrefix(client) {
  try {
    const res = await client.get('/api');
    if (res && res.data && res.data.current) {
      return `/api/${res.data.current}`;
    }
    return '/api';
  } catch (err) {
    // If detection fails, fall back to /api
    return '/api';
  }
}

async function initSonarr({ baseUrl, apiKey } = {}) {
  if (!baseUrl) throw new Error('baseUrl is required');
  const client = createAxiosInstance({ baseUrl, apiKey });

  // Detect API prefix once during init
  const apiPrefix = await detectApiPrefix(client);

  async function getSystemStatus() {
    try {
      const res = await client.get(`${apiPrefix}/system/status`);
      return res.data;
    } catch (err) {
      throw new ApiError('sonarr', err.response && err.response.status, 'Failed to get system status', err.response && err.response.data);
    }
  }

  async function getSeries(params = {}) {
    try {
      const res = await client.get(`${apiPrefix}/series`, { params });
      return res.data;
    } catch (err) {
      throw new ApiError('sonarr', err.response && err.response.status, 'Failed to get series', err.response && err.response.data);
    }
  }

  async function addSeries(payload) {
    try {
      const res = await client.post(`${apiPrefix}/series`, payload);
      return res.data;
    } catch (err) {
      throw new ApiError('sonarr', err.response && err.response.status, 'Failed to add series', err.response && err.response.data);
    }
  }

  return {
    getSystemStatus: withRetries(getSystemStatus),
    getSeries: withRetries(getSeries),
    addSeries: withRetries(addSeries),
  };
}

module.exports = { initSonarr, ApiError };
