const { AbortController } = global;

function buildHeaders({ apiKey, authHeader }) {
  const headers = {};
  if (apiKey) {
    if (authHeader) {
      headers[authHeader] = apiKey;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }
  return headers;
}

function createHttpClient({ baseUrl, apiKey, authHeader }) {
  if (!baseUrl) throw new Error('baseUrl is required');
  const headers = buildHeaders({ apiKey, authHeader });

  async function request(method, path, body) {
    const url = new URL(path, baseUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          ...headers,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();
      let data = text;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // non-JSON response
      }

      if (!res.ok) {
        throw new ApiError('portainer', res.status, 'Request failed', data);
      }

      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
  };
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


function initPortainer({ baseUrl, apiKey, authHeader } = {}) {
  if (!baseUrl) throw new Error('baseUrl is required');
  const client = createHttpClient({ baseUrl, apiKey, authHeader });

  async function getStatus() {
    try {
      const data = await client.get('/api/status');
      return data;
    } catch (err) {
      throw new ApiError('portainer', err.status || err.response?.status, 'Failed to get status', err.body || err.response?.data);
    }
  }

  async function listEndpoints() {
    try {
      const data = await client.get('/api/endpoints');
      return data;
    } catch (err) {
      throw new ApiError('portainer', err.status || err.response?.status, 'Failed to list endpoints', err.body || err.response?.data);
    }
  }

  async function listContainers(endpointId) {
    try {
      const data = await client.get(`/api/endpoints/${endpointId}/docker/containers/json`);
      return data;
    } catch (err) {
      throw new ApiError('portainer', err.status || err.response?.status, 'Failed to list containers', err.body || err.response?.data);
    }
  }

  async function startContainer(endpointId, containerId) {
    try {
      const data = await client.post(`/api/endpoints/${endpointId}/docker/containers/${containerId}/start`);
      return data;
    } catch (err) {
      throw new ApiError('portainer', err.status || err.response?.status, 'Failed to start container', err.body || err.response?.data);
    }
  }

  async function stopContainer(endpointId, containerId) {
    try {
      const data = await client.post(`/api/endpoints/${endpointId}/docker/containers/${containerId}/stop`);
      return data;
    } catch (err) {
      throw new ApiError('portainer', err.status || err.response?.status, 'Failed to stop container', err.body || err.response?.data);
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
