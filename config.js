// Lightweight config loader for local testing
require('dotenv').config();
const os = require('os');

module.exports = {
  PORTAINER_URL: process.env.PORTAINER_URL || '',
  PORTAINER_KEY: process.env.PORTAINER_KEY || '',
  PORTAINER_AUTH_HEADER: process.env.PORTAINER_AUTH_HEADER || '', // optional: 'Authorization' or 'X-API-Key'
  SONARR_URL: process.env.SONARR_URL || '',
  SONARR_API_KEY: process.env.SONARR_API_KEY || '',
  STORAGE_ROOT: process.env.STORAGE_ROOT || os.homedir() // Mount point for file browser
};

