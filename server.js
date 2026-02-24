const express = require('express');
const path = require('path');
const os = require('os');
const config = require('./config');
const { initPortainer } = require('./CLIENTS/portainerClient');
const { initServerStats } = require('./CLIENTS/serverStatsClient');

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

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static front-end files from project root
app.use(express.static(path.join(__dirname)));

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
        // skip endpoints we cannot query
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
    console.error('Error in /api/stack:', err);
    res.status(500).json({ error: err.message || 'unknown error' });
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
