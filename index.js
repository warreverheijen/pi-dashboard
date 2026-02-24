async function fetchStack() {
  try {
    const res = await fetch('/api/stack');
    if (!res.ok) {
      console.error('Failed to fetch stack: HTTP', res.status);
      return [];
    }
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.error('Failed to fetch stack:', err);
    return [];
  }
}

let ramHistory = Array(30).fill(0);
let cpuHistory = Array(30).fill(0);
let cpuTempHistory = Array(30).fill(0);
let netDownHistory = Array(30).fill(0);
let netUpHistory = Array(30).fill(0);

function updateBar(containerId, history, percent) {
  const container = document.getElementById(containerId);
  if (!container) return;
  history.shift();
  history.push(Math.max(0, Math.min(100, percent || 0)));
  const segments = container.querySelectorAll('div');
  const MIN_VISUAL_PCT = 2; // show a tiny bar even at 0
  segments.forEach((seg, idx) => {
    const val = history[idx] || 0;
    const visual = val === 0 ? MIN_VISUAL_PCT : val;
    seg.style.height = `${visual}%`;
  });
}

function updateRamBar(percent) {
  updateBar('ramBar', ramHistory, percent);
}

function updateCpuBar(percent) {
  updateBar('cpuBar', cpuHistory, percent);
}

function updateCpuTempBar(tempC) {
  // Normalize temperature to 0-100 scale (assuming 0-100C)
  const normalized = Math.max(0, Math.min(100, tempC || 0));
  updateBar('cpuTempBar', cpuTempHistory, normalized);
}

function updateNetDownBar(percent) {
  updateBar('netDownBar', netDownHistory, percent);
}

function updateNetUpBar(percent) {
  updateBar('netUpBar', netUpHistory, percent);
}

function renderStack(items) {
  const container = document.querySelector('.stack-overview > div');
  if (!container) return;
  container.innerHTML = '';

  if (!items.length) {
    const el = document.createElement('div');
    el.className = 'stack-empty';
    el.textContent = 'No running items found.';
    container.appendChild(el);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'stack-list';

  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'stack-item';

    const thumb = document.createElement('div');
    thumb.className = 'stack-thumb';
    thumb.style.backgroundImage = 'url(MEDIA/ICONS/' + (it.name) + '.svg)';

    const info = document.createElement('div');
    info.className = 'stack-info';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'stack-name';
    var name = it.name || it.containerId || '';
    name = name.split("/").pop().charAt(0).toUpperCase() + name.slice(2);
    nameDiv.textContent = name;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'stack-meta';
    metaDiv.textContent = `${it.endpointName || ''}${it.endpointName && it.image ? ' • ' : ''}${it.image || ''}`;

    info.appendChild(nameDiv);
    info.appendChild(metaDiv);

    li.appendChild(thumb);
    li.appendChild(info);

    list.appendChild(li);
  }

  container.appendChild(list);
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) {
      console.error('Failed to fetch stats: HTTP', res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch stats:', err);
    return null;
  }
}

function renderStats(stats) {
  const cpuCard = document.querySelector('.stats1-overview');
  const storageCard = document.querySelector('.stats2-overview');
  const networkCard = document.querySelector('.stats3-overview');

  if (!cpuCard || !storageCard || !networkCard) return;

  // CPU/RAM
  const cpuRamContent = document.getElementById('cpuRamContent');
  if (cpuRamContent) {
    const loadingContainer = cpuRamContent.querySelector('.loading-container');
    if (loadingContainer) {
      if (!stats) {
        loadingContainer.style.display = 'flex';
      } else {
        loadingContainer.style.display = 'none';
      }
    }

    if (stats) {
      const cpuUsageNum = Number(stats.cpu && stats.cpu.usage);
      const cpuTempNum = Number(stats.cpu && stats.cpu.temp);
      const ramPercentNum = Number(stats.ram && stats.ram.percent);

      const cpuUsageVal = Number.isFinite(cpuUsageNum) ? cpuUsageNum : 0;
      const cpuTempVal = Number.isFinite(cpuTempNum) ? cpuTempNum : 0;
      const ramPercent = Number.isFinite(ramPercentNum) ? ramPercentNum : 0;

      const cpuUsage = Number.isFinite(cpuUsageNum) ? `${cpuUsageNum.toFixed(1)}%` : 'N/A';
      const cpuTemp = Number.isFinite(cpuTempNum) && cpuTempNum > 0 ? `${cpuTempNum.toFixed(1)}°C` : 'N/A';
      const ramUsed = stats.ram ? formatBytes(stats.ram.used) : 'N/A';
      const ramTotal = stats.ram ? formatBytes(stats.ram.total) : 'N/A';
      const ramPercentText = Number.isFinite(ramPercentNum) ? `${ramPercentNum.toFixed(1)}%` : 'N/A';

      const cpuUsageSpan = document.getElementById('cpuUsageValue');
      const cpuTempSpan = document.getElementById('cpuTempValue');
      const ramUsageSpan = document.getElementById('ramUsageValue');

      if (cpuUsageSpan) cpuUsageSpan.textContent = cpuUsage;
      if (cpuTempSpan) cpuTempSpan.textContent = cpuTemp;
      if (ramUsageSpan) ramUsageSpan.textContent = `${ramUsed} / ${ramTotal} (${ramPercentText})`;

      updateRamBar(ramPercent);
      updateCpuBar(cpuUsageVal);
      updateCpuTempBar(cpuTempVal);
    }
  }

  // Storage
  const storageCharts = document.getElementById('storageCharts');
  const storageContent = document.getElementById('storageContent');
  if (storageCharts && storageContent) {
    if (!stats) {
      storageCharts.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Loading...</p></div>';
      storageContent.innerHTML = '';
    } else {
      const sd = stats.storage && stats.storage.sd ? stats.storage.sd : null;
      const ext = stats.storage && stats.storage.external ? stats.storage.external : null;

      const sdPercentUsed = sd && sd.size ? ((sd.size - sd.free) / sd.size) * 100 : null;
      const extPercentUsed = ext && ext.size ? ((ext.size - ext.free) / ext.size) * 100 : null;

      storageCharts.innerHTML = `
        <div class="disk-chart" id="diskChart1" style="--percent: ${Number.isFinite(sdPercentUsed) ? sdPercentUsed.toFixed(1) : 0}">
          <div class="disk-inner">
            <div class="disk-percent">${Number.isFinite(sdPercentUsed) ? `${sdPercentUsed.toFixed(1)}%` : 'N/A'}</div>
          </div>
        </div>
        <div class="disk-chart" id="diskChart2" style="--percent: ${Number.isFinite(extPercentUsed) ? extPercentUsed.toFixed(1) : 0}">
          <div class="disk-inner">
            <div class="disk-percent">${Number.isFinite(extPercentUsed) ? `${extPercentUsed.toFixed(1)}%` : 'N/A'}</div>
          </div>
        </div>
      `;

      const sdUsed = sd ? (sd.size - sd.free) : null;
      const extUsed = ext ? (ext.size - ext.free) : null;

      storageContent.innerHTML = `
        <div class="stat-line"><span>SD</span><span><span style="color: var(--highlight-color)">${sd ? formatGB(sdUsed) : 'N/A'}</span>${sd ? ` / ${formatGB(sd.size)} GB` : ''}</span></div>
        <div class="stat-line"><span>External</span><span><span style="color: var(--green-color)">${ext ? formatGB(extUsed) : 'N/A'}</span>${ext ? ` / ${formatGB(ext.size)} GB` : ''}</span></div>
      `;
    }
  }

  // Network
  const networkContent = document.getElementById('networkContent');
  if (networkContent) {
    const loadingContainer = networkContent.querySelector('.loading-container');
    if (loadingContainer) {
      if (!stats) {
        loadingContainer.style.display = 'flex';
      } else {
        loadingContainer.style.display = 'none';
      }
    }

    if (stats) {
      const iface = stats.network && stats.network.iface ? stats.network.iface : 'N/A';
      const downBytes = stats.network ? stats.network.rx_sec : 0;
      const upBytes = stats.network ? stats.network.tx_sec : 0;

      const downSpeed = formatSpeed(downBytes);
      const upSpeed = formatSpeed(upBytes);

      const netIfaceSpan = document.getElementById('netIfaceValue');
      const netDownSpan = document.getElementById('netDownValue');
      const netUpSpan = document.getElementById('netUpValue');

      if (netIfaceSpan) netIfaceSpan.textContent = iface;
      if (netDownSpan) netDownSpan.textContent = downSpeed;
      if (netUpSpan) netUpSpan.textContent = upSpeed;

      // Normalize to 0-100 based on a 100 MB/s max for display
      const downPercent = Math.min(100, (downBytes / (100 * 1024 * 1024)) * 100);
      const upPercent = Math.min(100, (upBytes / (100 * 1024 * 1024)) * 100);

      updateNetDownBar(downPercent);
      updateNetUpBar(upPercent);
    }
  }
}

function formatBytes(bytes) {
  if (bytes === null || typeof bytes === 'undefined') return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let b = Math.max(0, bytes);
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(1)} ${units[i]}`;
}

function formatGB(bytes) {
  if (bytes === null || typeof bytes === 'undefined') return 'N/A';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb.toFixed(1);
}

function formatSpeed(bytesPerSec) {
  if (bytesPerSec === null || typeof bytesPerSec === 'undefined') return 'N/A';
  return `${formatBytes(bytesPerSec)}/s`;
}

async function refresh() {
  const items = await fetchStack();
  renderStack(items);
  const stats = await fetchStats();
  renderStats(stats);
}

function addRefreshButton() {
  const container = document.querySelector('.stack-overview > div');
  if (!container) return;
  const btn = document.createElement('button');
  btn.textContent = 'Refresh';
  btn.className = 'stack-refresh-btn';
  btn.addEventListener('click', refresh);
  container.insertBefore(btn, container.firstChild);
}

// Page Navigation
let currentPage = 'overview';
const pageOrder = ['overview', 'storage', 'stack', 'media', 'settings'];

function switchPage(pageName) {
  // Hide current page with slide out
  const currentPageEl = document.querySelector(`.page[data-page="${currentPage}"]`);
  if (currentPageEl) {
    currentPageEl.classList.remove('active');
    // Determine if sliding up or down
    const currentIndex = pageOrder.indexOf(currentPage);
    const newIndex = pageOrder.indexOf(pageName);
    if (newIndex > currentIndex) {
      // Going forward: slide current page up
      currentPageEl.classList.add('slide-out-up');
    } else {
      // Going backward: slide current page down
      currentPageEl.classList.remove('slide-out-up');
    }
  }

  // Show new page
  const newPageEl = document.querySelector(`.page[data-page="${pageName}"]`);
  if (newPageEl) {
    newPageEl.classList.remove('slide-out-up');
    newPageEl.classList.add('active');
  }

  currentPage = pageName;
}

// Menu item click handlers
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', () => {
    const pageName = item.getAttribute('data-page');
    switchPage(pageName);
  });
});

window.addEventListener('DOMContentLoaded', () => {
  switchPage('overview');
  addRefreshButton();
  refresh();
  setInterval(refresh, 1000); // update stats/ram bar every 5s
});
