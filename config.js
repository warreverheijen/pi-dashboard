// Lightweight config loader for local testing
require('dotenv').config();
const os = require('os');

module.exports = {
  PORTAINER_URL: process.env.PORTAINER_URL || '',
  PORTAINER_KEY: process.env.PORTAINER_KEY || '',
  PORTAINER_AUTH_HEADER: process.env.PORTAINER_AUTH_HEADER || '', // optional: 'Authorization' or 'X-API-Key'
  SONARR_URL: process.env.SONARR_URL || '',
  SONARR_API_KEY: process.env.SONARR_API_KEY || '',
  STORAGE_ROOT: process.env.STORAGE_ROOT || os.homedir(), // Mount point for file browser

  // Ollama (cloud or self-hosted) configuration
  // Set OLLAMA_URL to the base URL for Ollama API (e.g. https://api.ollama.com or http://localhost:11434)
  // Set OLLAMA_API_KEY when using Ollama Cloud (Bearer token). Leave empty for local Ollama instances.
  // Set OLLAMA_MODEL to your desired model name (optional). If empty, the client will require a model when generating.
  OLLAMA_URL: process.env.OLLAMA_URL || '',
  OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || '',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || ''
};

