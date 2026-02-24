const axios = require('axios');

function createAxiosInstance({ baseUrl, apiKey, authHeader }) {
  const headers = {};
  if (apiKey) {
    // support common header names
    if (authHeader) {
      headers[authHeader] = apiKey;
    } else {
      // default to Authorization: Bearer <key>
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }

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
        // only retry on network or 5xx
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

function initPortainer({ baseUrl, apiKey, authHeader } = {}) {
  if (!baseUrl) throw new Error('baseUrl is required');
  const client = createAxiosInstance({ baseUrl, apiKey, authHeader });

  async function getStatus() {
    try {
      const res = await client.get('/api/status');
      return res.data;
    } catch (err) {
      throw new ApiError('portainer', err.response && err.response.status, 'Failed to get status', err.response && err.response.data);
    }
  }

  async function listEndpoints() {
    try {
      const res = await client.get('/api/endpoints');
      return res.data;
    } catch (err) {
      throw new ApiError('portainer', err.response && err.response.status, 'Failed to list endpoints', err.response && err.response.data);
    }
  }

  async function listContainers(endpointId) {
    try {
      const res = await client.get(`/api/endpoints/${endpointId}/docker/containers/json`);
      return res.data;
    } catch (err) {
      throw new ApiError('portainer', err.response && err.response.status, 'Failed to list containers', err.response && err.response.data);
    }
  }

  async function startContainer(endpointId, containerId) {
    try {
      const res = await client.post(`/api/endpoints/${endpointId}/docker/containers/${containerId}/start`);
      return res.data;
    } catch (err) {
      throw new ApiError('portainer', err.response && err.response.status, 'Failed to start container', err.response && err.response.data);
    }
  }

  async function stopContainer(endpointId, containerId) {
    try {
      const res = await client.post(`/api/endpoints/${endpointId}/docker/containers/${containerId}/stop`);
      return res.data;
    } catch (err) {
      throw new ApiError('portainer', err.response && err.response.status, 'Failed to stop container', err.response && err.response.data);
    }
  }

  return {
    getStatus: withRetries(getStatus),
    listEndpoints: withRetries(listEndpoints),
    listContainers: withRetries(listContainers),
    startContainer: withRetries(startContainer),
    stopContainer: withRetries(stopContainer),
  };
}

module.exports = { initPortainer, ApiError };

