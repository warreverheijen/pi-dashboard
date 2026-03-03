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

/*-----Overview Page Logic-----*/
let ramHistory = Array(30).fill(0);
let cpuHistory = Array(30).fill(0);
let cpuTempHistory = Array(30).fill(0);
let netDownHistory = Array(30).fill(0);
let netUpHistory = Array(30).fill(0);

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
        <div class="stat-line"><span>SD</span><span><span style="color: var(--color-storage-sd)">${sd ? formatGB(sdUsed) : 'N/A'}</span>${sd ? ` / ${formatGB(sd.size)} GB` : ''}</span></div>
        <div class="stat-line"><span>External</span><span><span style="color: var(--color-storage-external)">${ext ? formatGB(extUsed) : 'N/A'}</span>${ext ? ` / ${formatGB(ext.size)} GB` : ''}</span></div>
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

      // Normalize to 2-100 based on a 10 MB/s max for display (scales to typical home network speeds)
      const maxBytesPerSec = 10 * 1024 * 1024; // 10 MB/s baseline
      const downPercent = Math.max(2, Math.min(100, (downBytes / maxBytesPerSec) * 100));
      const upPercent = Math.max(2, Math.min(100, (upBytes / maxBytesPerSec) * 100));

      updateNetDownBar(downPercent);
      updateNetUpBar(upPercent);
    }
  }
}

async function fetchFact() {
  try {
    const res = await fetch('/api/fact');
    if (!res.ok) return null;
    const data = await res.json();
    return data.fact || null;
  } catch (err) {
    console.error('Failed to fetch fact:', err);
    return null;
  }
}

async function renderFact() {
  const textEl = document.querySelector('.welcome-text');
  if (!textEl) return;
  const fact = await fetchFact();
  textEl.textContent = "Fact: " + fact || 'Insert text...';
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

function initOverview() {
  refresh();
  renderFact();
  setInterval(refresh, 1000);
}

/*-----File Browser Logic-----*/
// File browser state
let currentFilePath = '';
let selectedFiles = [];
let clipboardFiles = [];

const btnUpload = document.getElementById('btnUpload');
const btnDownload = document.getElementById('btnDownload');
const btnCopy = document.getElementById('btnCopy');
const btnPaste = document.getElementById('btnPaste');
const btnDelete = document.getElementById('btnDelete');
const btnRename = document.getElementById('btnRename');
const fileUploadInput = document.getElementById('fileUploadInput');

async function fetchFiles(path = '') {
  try {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    const res = await fetch(`/api/files${query}`);
    if (!res.ok) {
      console.error('Failed to fetch files: HTTP', res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch files:', err);
    return null;
  }
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function renderFileList(data) {
  if (!data) {
    return '<div class="loading-container"><div class="loading-spinner"></div><p>Failed to load files</p></div>';
  }

  if (!data.items || data.items.length === 0) {
    return '<div style="padding: 20px; text-align: center; color: #999;">Empty directory</div>';
  }

  return data.items.map(item => `
    <div class="file-item" data-path="${item.path}" data-type="${item.type}" data-name="${item.name}">
      <div class="file-icon">
        <img src="MEDIA/ICONS/${item.type === 'folder' ? 'folder' : 'file'}.svg" alt="${item.type}" onerror="this.style.display='none'">
      </div>
      <div class="file-info">
        <div class="file-name">${item.name}</div>
        <div class="file-meta">${new Date(item.modified).toLocaleDateString()}</div>
      </div>
      <div class="file-size">${formatFileSize(item.size)}</div>
    </div>
  `).join('');
}

function updateBreadcrumb(path) {
  const breadcrumb = document.getElementById('breadcrumb');
  if (!breadcrumb) return;

  const parts = path ? path.split('/').filter(p => p) : [];
  let html = '<span class="breadcrumb-item" data-path="">root</span>';

  let cumPath = '';
  for (const part of parts) {
    cumPath += (cumPath ? '/' : '') + part;
    html += `<span class="breadcrumb-separator">/</span><span class="breadcrumb-item" data-path="${cumPath}">${part}</span>`;
  }

  breadcrumb.innerHTML = html;

  // Add click handlers
  document.querySelectorAll('.breadcrumb-item').forEach(item => {
    item.addEventListener('click', () => {
      const path = item.getAttribute('data-path');
      navigateToPath(path);
    });
  });
}

async function navigateToPath(path) {
  currentFilePath = path;
  selectedFiles = [];
  updateToolbarState();

  const fileList = document.getElementById('fileList');
  if (!fileList) return;

  fileList.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Loading...</p></div>';

  const data = await fetchFiles(path);
  updateBreadcrumb(data?.currentPath || '');

  // This will replace the entire fileList content including the loading container
  fileList.innerHTML = renderFileList(data);

  // Add click handlers to file items
  document.querySelectorAll('.file-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        item.classList.toggle('selected');
        const itemPath = item.getAttribute('data-path');
        if (selectedFiles.includes(itemPath)) {
          selectedFiles = selectedFiles.filter(p => p !== itemPath);
        } else {
          selectedFiles.push(itemPath);
        }
      } else {
        document.querySelectorAll('.file-item').forEach(fi => fi.classList.remove('selected'));
        item.classList.add('selected');
        selectedFiles = [item.getAttribute('data-path')];

        const itemType = item.getAttribute('data-type');
        if (itemType === 'folder') {
          navigateToPath(item.getAttribute('data-path'));
        }
      }
      updateToolbarState();
    });
  });
}

function updateToolbarState() {
  document.getElementById('btnDownload').disabled = selectedFiles.length === 0;
  document.getElementById('btnCopy').disabled = selectedFiles.length === 0;
  document.getElementById('btnDelete').disabled = selectedFiles.length === 0;
  document.getElementById('btnRename').disabled = selectedFiles.length !== 1;
  document.getElementById('btnPaste').disabled = clipboardFiles.length === 0;
}

function initializeFileBrowser() {
// Initialize file browser
  if (btnUpload) {
    btnUpload.addEventListener('click', () => {
      fileUploadInput.click();
    });
  }

  if (fileUploadInput) {
    fileUploadInput.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (files.length === 0) return;

      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', currentFilePath);

        try {
          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          if (res.ok) {
            console.log('Uploaded:', file.name);
          } else {
            alert('Failed to upload: ' + file.name);
          }
        } catch (err) {
          console.error('Upload error:', err);
        }
      }

      fileUploadInput.value = '';
      navigateToPath(currentFilePath);
    });
  }

  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      selectedFiles.forEach(filePath => {
        const a = document.createElement('a');
        a.href = `/api/download?path=${encodeURIComponent(filePath)}`;
        a.download = filePath.split('/').pop();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    });
  }

  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      clipboardFiles = [...selectedFiles];
      updateToolbarState();
      alert('Copied ' + clipboardFiles.length + ' file(s)');
    });
  }

  if (btnPaste) {
    btnPaste.addEventListener('click', async () => {
      for (const file of clipboardFiles) {
        try {
          const res = await fetch('/api/copy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: file, dest: currentFilePath })
          });
          if (!res.ok) {
            alert('Failed to paste: ' + file);
          }
        } catch (err) {
          console.error('Paste error:', err);
        }
      }
      navigateToPath(currentFilePath);
    });
  }

  if (btnDelete) {
    btnDelete.addEventListener('click', async () => {
      if (!confirm('Delete ' + selectedFiles.length + ' file(s)?')) return;

      for (const file of selectedFiles) {
        try {
          const res = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: file })
          });
          if (!res.ok) {
            alert('Failed to delete: ' + file);
          }
        } catch (err) {
          console.error('Delete error:', err);
        }
      }
      selectedFiles = [];
      navigateToPath(currentFilePath);
    });
  }

  if (btnRename) {
    btnRename.addEventListener('click', async () => {
      const filePath = selectedFiles[0];
      const name = filePath.split('/').pop();
      const newName = prompt('Rename to:', name);
      if (!newName || newName === name) return;

      try {
        const res = await fetch('/api/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, newName })
        });
        if (res.ok) {
          navigateToPath(currentFilePath);
        } else {
          alert('Failed to rename');
        }
      } catch (err) {
        console.error('Rename error:', err);
      }
    });
  }

  // Load initial file browser
  navigateToPath('');}

// THEME: light/dark toggle
const THEME_KEY = 'theme';

function applyTheme(theme) {
  if (!theme || theme === 'light') {
    document.body.classList.remove('dark');
  } else {
    document.body.classList.add('dark');
  }
  updateThemeButtonLabel();
}

function updateThemeButtonLabel() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const isDark = document.body.classList.contains('dark');
  btn.textContent = isDark ? 'Switch to Light' : 'Switch to Dark';
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark');
  const theme = isDark ? 'dark' : 'light';
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    console.warn('Could not persist theme:', e);
  }
  updateThemeButtonLabel();
}

// Toolbar event listeners and initialization
document.addEventListener('DOMContentLoaded', () => {
  // Apply saved theme early
  try {
    const saved = localStorage.getItem(THEME_KEY) || 'light';
    applyTheme(saved);
  } catch (e) {
    applyTheme('light');
  }

  // Wire settings theme button
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleTheme();
    });
  }

  // Initialize overview page
  switchPage('overview');
  initOverview();
  initializeFileBrowser()
});
