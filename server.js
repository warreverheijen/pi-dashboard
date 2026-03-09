const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const fileUpload = require('express-fileupload');
const config = require('./config');
const { initPortainer } = require('./CLIENTS/portainerClient');
const { initServerStats } = require('./CLIENTS/serverStatsClient');
const { initOllama } = require('./CLIENTS/ollamaClient');

// Initialize Ollama Cloud client (may throw if OLLAMA_API_KEY missing)
let ollamaClient = null;
try {
  ollamaClient = initOllama();
  console.log('Ollama client initialized');
} catch (e) {
  console.warn('Ollama client not initialized:', e.message);
  ollamaClient = null;
}

const app = express();
const PORT = process.env.PORT || 8001;

// Cache for OS CPU usage fallback
let lastCpuSample = null;
function sampleCpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  cpus.forEach(cpu => {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  });
  return { idle, total };
}

async function getCpuUsageFromOs() {
  const sample1 = sampleCpuTimes();
  const baseSample = lastCpuSample || sample1;
  if (!lastCpuSample) {
    lastCpuSample = sample1;
    await new Promise(r => setTimeout(r, 200));
  }
  const sample2 = sampleCpuTimes();
  const idleDelta = sample2.idle - baseSample.idle;
  const totalDelta = sample2.total - baseSample.total;
  lastCpuSample = sample2;
  if (totalDelta <= 0) return null;
  const usage = (1 - idleDelta / totalDelta) * 100;
  return Math.max(0, Math.min(100, usage));
}

// Middleware
app.use(express.json());
app.use(fileUpload());

// Safe mount point for file browsing from config
const STORAGE_ROOT = config.STORAGE_ROOT;

// Helper function to safely resolve paths
function resolveSafePath(basePath, requestPath) {
  const resolved = path.resolve(basePath, requestPath || '');
  const normalized = path.normalize(resolved);

  // Normalize basePath with trailing separator for comparison
  const normalizedBase = path.normalize(basePath);
  const baseWithSep = normalizedBase + path.sep;

  // Ensure the resolved path is within the base path (prevent directory traversal)
  // Check both with and without trailing separator for edge case where path equals basePath
  if (normalized !== normalizedBase && !normalized.startsWith(baseWithSep)) {
    throw new Error('Path traversal attempt detected');
  }

  return normalized;
}

// Serve static front-end files from project root
app.use(express.static(path.join(__dirname)));

// ----- API endpoints ------ //

// Overview API
app.get('/api/stack', async (req, res) => {
  if (!config.PORTAINER_URL || !config.PORTAINER_KEY) {
    return res.status(500).json({ error: 'Portainer config missing (PORTAINER_URL or PORTAINER_KEY)' });
  }

  try {
    const portainer = initPortainer({ baseUrl: config.PORTAINER_URL, apiKey: config.PORTAINER_KEY, authHeader: config.PORTAINER_AUTH_HEADER || 'Authorization' });
    const endpoints = await portainer.listEndpoints();

    const results = [];
    for (const ep of endpoints) {
      const endpointId = ep.Id || ep.id || ep.EndpointID || ep.ID || ep.EndpointId;
      const endpointName = ep.Name || ep.name || ep.EndpointName || ep.Name;
      if (!endpointId) continue;
      let containers = [];
      try {
        containers = await portainer.listContainers(endpointId);
      } catch (e) {
        console.error('Portainer listContainers error:', {
          endpointId,
          status: e?.response?.status,
          data: e?.response?.data,
          message: e?.message,
        });
        continue;
      }

      for (const c of containers) {
        const state = c.State || (c.State && c.State.toLowerCase && c.State.toLowerCase()) || c.status || c.Status || '';
        const isRunning = (typeof state === 'string' && state.toLowerCase().includes('up')) || state === 'running' || (c.State && c.State === 'running');
        if (isRunning) {
          results.push({
            endpointId,
            endpointName,
            containerId: c.Id || c.Id || c.Id || c.Id || c.Id || c.Id || c.Id || c.Id,
            name: Array.isArray(c.Names) ? c.Names.join(', ') : (c.Names || c.Name || c.Names || c.Names),
            image: c.Image || c.ImageName || c.Config && c.Config.Image || '',
            state,
            status: c.Status || '',
          });
        }
      }
    }

    res.json({ items: results });
  } catch (err) {
    const status = err?.response?.status || 500;
    const data = err?.response?.data || null;
    console.error('Error in /api/stack:', { status, data, message: err?.message });
    res.status(status).json({ error: err?.message || 'unknown error', status, data });
  }
});
app.get('/api/stats', async (req, res) => {
  try {
    const stats = initServerStats();
    const overview = await stats.getOverview();

    let cpuUsageValue = (overview.cpu && typeof overview.cpu.currentLoad === 'number')
      ? overview.cpu.currentLoad
      : (overview.cpu && typeof overview.cpu.currentload === 'number')
        ? overview.cpu.currentload
        : null;

    if (cpuUsageValue === null) {
      cpuUsageValue = await stats.getCpuUsage();
    }

    if (cpuUsageValue === null) {
      cpuUsageValue = await getCpuUsageFromOs();
    }

    const tempCandidates = [
      overview.cpuTemp && typeof overview.cpuTemp.main === 'number' ? overview.cpuTemp.main : null,
      overview.cpuTemp && typeof overview.cpuTemp.max === 'number' ? overview.cpuTemp.max : null,
      overview.cpuTemp && Array.isArray(overview.cpuTemp.cores) && overview.cpuTemp.cores.length
        ? (overview.cpuTemp.cores.reduce((a, b) => a + b, 0) / overview.cpuTemp.cores.length)
        : null,
    ].filter(v => typeof v === 'number' && !Number.isNaN(v) && v > 0);

    const cpu = {
      usage: cpuUsageValue,
      temp: tempCandidates.length ? tempCandidates[0] : null,
    };

    const ram = {
      total: overview.memory.total,
      used: overview.memory.used,
      percent: overview.memory.total ? (overview.memory.used / overview.memory.total) * 100 : null,
    };

    const disks = Array.isArray(overview.disk) ? overview.disk : [];
    const sdDisk = disks.find(d => d.mount === '/' || d.mount === 'C:' || d.fs === 'C:' || d.mount === 'C:\\') || disks[0];
    const externalDisk = disks.find(d => d !== sdDisk) || null;

    const storage = {
      sd: sdDisk ? { mount: sdDisk.mount || sdDisk.fs, label: sdDisk.label || '', free: sdDisk.size - sdDisk.used, size: sdDisk.size } : null,
      external: externalDisk ? { mount: externalDisk.mount || externalDisk.fs, label: externalDisk.label || '', free: externalDisk.size - externalDisk.used, size: externalDisk.size } : null,
    };

    const network = {
      iface: overview.network.iface || '',
      ip4: overview.network.ip4 || '',
      rx_sec: overview.network.rx_sec || 0,
      tx_sec: overview.network.tx_sec || 0,
    };

    res.json({ cpu, ram, storage, network, timestamp: overview.timestamp });
  } catch (err) {
    console.error('Error in /api/stats:', err);
    res.status(500).json({ error: err.message || 'unknown error' });
  }
});
app.get('/api/fact', (req, res) => {
  try {
    const factsPath = path.join(__dirname, 'facts.json');
    const raw = fs.readFileSync(factsPath, 'utf-8');
    const facts = JSON.parse(raw);
    if (!Array.isArray(facts) || facts.length === 0) {
      return res.status(500).json({ error: 'No facts found' });
    }
    const fact = facts[Math.floor(Math.random() * facts.length)];
    res.json({ fact });
  } catch (err) {
    console.error('Error in /api/fact:', err);
    res.status(500).json({ error: err.message || 'unknown error' });
  }
});


// File browser API
app.get('/api/files', (req, res) => {
  try {
    const requestPath = req.query.path || '';

    console.log('File browser request:', { STORAGE_ROOT, requestPath });

    // Check if STORAGE_ROOT exists first
    if (!fs.existsSync(STORAGE_ROOT)) {
      console.error('STORAGE_ROOT does not exist:', STORAGE_ROOT);
      return res.status(500).json({ error: `STORAGE_ROOT path does not exist: ${STORAGE_ROOT}` });
    }

    const dirPath = resolveSafePath(STORAGE_ROOT, requestPath);

    console.log('Resolved directory path:', dirPath);

    // Check if path exists and is a directory
    if (!fs.existsSync(dirPath)) {
      console.error('Directory path does not exist:', dirPath);
      return res.status(404).json({ error: `Path not found: ${dirPath}` });
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      console.error('Path is not a directory:', dirPath);
      return res.status(400).json({ error: 'Not a directory' });
    }

    // Read directory contents
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = files.map(file => {
      const filePath = path.join(dirPath, file.name);
      const fileStat = fs.statSync(filePath);

      return {
        name: file.name,
        type: file.isDirectory() ? 'folder' : 'file',
        size: fileStat.size,
        modified: fileStat.mtime,
        path: path.relative(STORAGE_ROOT, filePath),
      };
    }).sort((a, b) => {
      // Folders first, then alphabetical
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      currentPath: path.relative(STORAGE_ROOT, dirPath) || '/',
      items,
      root: STORAGE_ROOT,
    });
  } catch (err) {
    console.error('Error in /api/files:', err);
    res.status(500).json({ error: err.message || 'Failed to read directory' });
  }
});
app.get('/api/debug/storage', (req, res) => {
  const candidates = [
    '/home/warre',
    '/home',
    '/root',
    '/mnt',
    '/media',
    os.homedir()
  ];

  const existing = candidates.filter(p => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  });

  res.json({
    STORAGE_ROOT: config.STORAGE_ROOT,
    STORAGE_ROOT_exists: fs.existsSync(config.STORAGE_ROOT),
    existingCandidates: existing,
    homeDir: os.homedir()
  });
});
app.get('/api/download', (req, res) => {
  try {
    const filePath = resolveSafePath(STORAGE_ROOT, req.query.path || '');

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }

    res.download(filePath);
  } catch (err) {
    console.error('Error in /api/download:', err);
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/upload', (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const destPath = resolveSafePath(STORAGE_ROOT, req.body.path || '');
    const uploadedFile = req.files.file;

    if (!fs.existsSync(destPath) || !fs.statSync(destPath).isDirectory()) {
      return res.status(400).json({ error: 'Destination is not a directory' });
    }

    const filePath = path.join(destPath, uploadedFile.name);
    uploadedFile.mv(filePath, (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, path: path.relative(STORAGE_ROOT, filePath) });
    });
  } catch (err) {
    console.error('Error in /api/upload:', err);
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/delete', (req, res) => {
  try {
    const filePath = resolveSafePath(STORAGE_ROOT, req.body.path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/delete:', err);
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/copy', (req, res) => {
  try {
    const sourcePath = resolveSafePath(STORAGE_ROOT, req.body.source);
    const destDir = resolveSafePath(STORAGE_ROOT, req.body.dest);

    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Source not found' });
    }

    if (!fs.existsSync(destDir) || !fs.statSync(destDir).isDirectory()) {
      return res.status(400).json({ error: 'Destination is not a directory' });
    }

    const fileName = path.basename(sourcePath);
    const destPath = path.join(destDir, fileName);

    const stat = fs.statSync(sourcePath);
    if (stat.isDirectory()) {
      fs.cpSync(sourcePath, destPath, { recursive: true });
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/copy:', err);
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/rename', (req, res) => {
  try {
    const filePath = resolveSafePath(STORAGE_ROOT, req.body.path);
    const newName = req.body.newName;

    if (!newName || typeof newName !== 'string') {
      return res.status(400).json({ error: 'Invalid new name' });
    }

    if (newName.includes('/') || newName.includes('\\')) {
      return res.status(400).json({ error: 'Invalid file name' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const dir = path.dirname(filePath);
    const newPath = path.join(dir, newName);

    fs.renameSync(filePath, newPath);
    res.json({ success: true });

  } catch (err) {
    console.error('Error in /api/rename:', err);
    res.status(500).json({ error: err.message });
  }
});

// AI generate endpoint for RaspPy (backend-only)
app.post('/api/ai/generate', async (req, res) => {
  try {
    if (!ollamaClient) {
      return res.status(500).json({ error: 'Ollama client not configured on server (missing OLLAMA_API_KEY)' });
    }

    const { prompt, model, system, format, options } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid `prompt` in request body' });
    }

    // Call Ollama Cloud
    const result = await ollamaClient.generate(prompt, { model, system, format, options });

    res.json({ ok: true, result });
  } catch (err) {
    console.error('Error in /api/ai/generate:', err);
    // If the error has an HTTP-like status, bubble it; otherwise return 500
    res.status(500).json({ error: err.message || 'AI generation failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
