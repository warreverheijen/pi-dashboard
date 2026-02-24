const si = require('systeminformation');
const os = require('os');

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

function initServerStats() {
  // No configuration required for local stats

  async function getCpu() {
    const load = await si.currentLoad();
    const currentLoad = (typeof load.currentLoad === 'number')
      ? load.currentLoad
      : (typeof load.currentload === 'number' ? load.currentload : null);

    // return useful CPU metrics
    return {
      avgLoad: load.avgload,
      currentLoad,
      currentload: typeof load.currentload === 'number' ? load.currentload : currentLoad,
      currentLoadUser: typeof load.currentLoadUser === 'number' ? load.currentLoadUser : load.currentload_user,
      currentLoadSystem: typeof load.currentLoadSystem === 'number' ? load.currentLoadSystem : load.currentload_system,
      cores: load.cpus ? load.cpus.map((c, i) => ({ core: i, load: c.load })) : [],
    };
  }

  async function getCpuUsage() {
    const load = await si.currentLoad();
    const sysInfoUsage = (typeof load.currentLoad === 'number') ? load.currentLoad : (typeof load.currentload === 'number' ? load.currentload : null);
    if (typeof sysInfoUsage === 'number') return sysInfoUsage;

    // Fallback: compute usage from OS cpu times
    const sample1 = sampleCpuTimes();
    const baseSample = lastCpuSample || sample1;

    if (!lastCpuSample) {
      lastCpuSample = sample1;
      // short delay to compute a delta on first call
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

  async function getCpuTemp() {
    const temp = await si.cpuTemperature();
    return {
      main: temp.main,
      max: temp.max,
      cores: temp.cores || [],
    };
  }

  async function getMemory() {
    const mem = await si.mem();
    return {
      total: mem.total,
      free: mem.free,
      used: mem.used,
      active: mem.active,
      available: mem.available,
      swapTotal: mem.swaptotal,
      swapUsed: mem.swapused,
    };
  }

  async function getDisk() {
    // Returns array of disk partitions with size/used
    const fs = await si.fsSize();
    return fs.map(d => ({ fs: d.fs, type: d.type, size: d.size, used: d.used, use: d.use, mount: d.mount, label: d.label }));
  }

  async function getNetwork() {
    const ifaces = await si.networkInterfaces();
    const activeIface = ifaces.find(i => i.operstate === 'up' && !i.internal) || ifaces.find(i => !i.internal) || ifaces[0];
    if (!activeIface) return { iface: '', ip4: '', rx_sec: 0, tx_sec: 0 };

    const statsArr = await si.networkStats(activeIface.iface);
    const stats = statsArr && statsArr[0] ? statsArr[0] : {};
    return {
      iface: activeIface.iface,
      ip4: activeIface.ip4 || '',
      rx_sec: stats.rx_sec || 0,
      tx_sec: stats.tx_sec || 0,
      rx_bytes: stats.rx_bytes || 0,
      tx_bytes: stats.tx_bytes || 0,
    };
  }

  async function getOverview() {
    const [cpu, cpuTemp, memory, disk, network] = await Promise.all([getCpu(), getCpuTemp(), getMemory(), getDisk(), getNetwork()]);
    return { cpu, cpuTemp, memory, disk, network, timestamp: Date.now() };
  }

  function monitor(intervalMs = 5000, cb = () => {}) {
    // Start a periodic monitor, returns a stop function
    const id = setInterval(async () => {
      try {
        const data = await getOverview();
        cb(null, data);
      } catch (err) {
        cb(err);
      }
    }, intervalMs);

    return () => clearInterval(id);
  }

  return { getCpu, getCpuUsage, getCpuTemp, getMemory, getDisk, getNetwork, getOverview, monitor };
}

module.exports = { initServerStats };
