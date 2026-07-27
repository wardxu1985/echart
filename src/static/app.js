// ===== Tauri IPC 桥接 =====
function hasTauriIPC() {
  return typeof window !== 'undefined' && window.__TAURI_INTERNALS__;
}

function invoke(cmd, args) {
  if (!hasTauriIPC()) {
    console.warn('[DEV] Tauri IPC 不可用，返回 mock');
    return Promise.reject('Tauri 运行时不可用');
  }
  return window.__TAURI_INTERNALS__.invoke(cmd, args);
}

var TauriBridge = {
  async openFile(path, inheritFrom = null) {
    const args = { path };
    if (inheritFrom) args.inherit_from = inheritFrom;
    return invoke('open_file', args);
  },

  async getSeries(windowId, columns, timeStart = null, timeEnd = null) {
    const args = { windowId, columns };
    if (timeStart !== null) args.time_start = timeStart;
    if (timeEnd !== null) args.time_end = timeEnd;
    return invoke('get_series', args);
  },

  async closeWindow(windowId) {
    return invoke('close_window', { windowId });
  },
};

// ===== UI 状态 =====
var state = {
  windowId: '',
  columns: [],
  selectedXCol: null,
  selectedYCols: new Set(),
  rawColumns: [],
  numericColumns: [],
  fileLoaded: false,
  timeRange: null,
};

// ===== Toast 系统 =====
function showToast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ===== URL 参数解析 =====
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    wid: params.get('wid') || '',
    inheritColumns: params.get('inherit') || '',
    inheritFrom: params.get('from') || '',
    filePath: params.get('file') || '',
  };
}

// ===== 工具函数 =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatNum(v) {
  if (v === undefined || v === null || !isFinite(v)) return '—';
  if (Math.abs(v) >= 10000) return v.toExponential(2);
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2);
}

function formatTimestamp(ts) {
  if (ts == null || !isFinite(ts)) return '—';
  const d = new Date(ts * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ===== 左面板交互 =====
function populateXSelect(columns) {
  const select = document.getElementById('xSelect');
  select.innerHTML = '<option value="">— 选择时间列 —</option>';
  const timeCols = columns.filter(c => c.col_type === 'Time');
  const candidates = timeCols.length > 0 ? timeCols : columns.filter(c => c.col_type === 'Numeric');

  candidates.forEach(col => {
    const opt = document.createElement('option');
    opt.value = col.name;
    opt.textContent = col.name;
    select.appendChild(opt);
  });
  select.disabled = false;

  if (candidates.length > 0) {
    select.value = candidates[0].name;
    state.selectedXCol = candidates[0].name;
  }
}

function onXSelectChange() {
  const select = document.getElementById('xSelect');
  state.selectedXCol = select.value || null;
  updateGenerateButton();
  updateStatusBar();
}

function renderSignalTags() {
  const container = document.getElementById('signalTags');
  const countEl = document.getElementById('signalCount');
  container.innerHTML = '';
  state.selectedYCols.forEach(name => {
    const tag = document.createElement('span');
    tag.className = 'signal-tag';
    tag.innerHTML = `${escapeHtml(name)} <span class="tag-remove" data-name="${escapeHtml(name)}">×</span>`;
    tag.querySelector('.tag-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      const colName = e.target.getAttribute('data-name');
      state.selectedYCols.delete(colName);
      renderSignalTags();
      updateGenerateButton();
      updateStatusBar();
    });
    container.appendChild(tag);
  });
  countEl.textContent = `已选 ${state.selectedYCols.size} 个信号`;
}

function updateGenerateButton() {
  const btn = document.getElementById('generateBtn');
  btn.disabled = !(
    state.fileLoaded &&
    state.selectedXCol &&
    state.selectedYCols.size > 0
  );
}

// ===== 信号运算 =====
function populateComputeSelectors() {
  const selA = document.getElementById('computeSignalA');
  const selB = document.getElementById('computeSignalB');
  const currentA = selA.value;
  const currentB = selB.value;

  selA.innerHTML = '<option value="">— 信号 A —</option>';
  selB.innerHTML = '<option value="">— 信号 B —</option>';

  state.numericColumns.forEach(col => {
    const optA = document.createElement('option');
    optA.value = col.name;
    optA.textContent = col.name;
    selA.appendChild(optA);

    const optB = document.createElement('option');
    optB.value = col.name;
    optB.textContent = col.name;
    selB.appendChild(optB);
  });

  if (currentA && state.numericColumns.some(c => c.name === currentA)) selA.value = currentA;
  if (currentB && state.numericColumns.some(c => c.name === currentB)) selB.value = currentB;

  updateComputeAutoName();
  updateComputeButton();
}

function updateComputeAutoName() {
  const a = document.getElementById('computeSignalA').value;
  const b = document.getElementById('computeSignalB').value;
  const op = document.getElementById('computeOp').value;
  const nameInput = document.getElementById('computeResultName');

  if (a && b && a !== b) {
    nameInput.placeholder = `${a}${op}${b}`;
    if (!nameInput.value || nameInput.dataset.auto === 'true') {
      nameInput.value = `${a}${op}${b}`;
      nameInput.dataset.auto = 'true';
    }
  }
}

function updateComputeButton() {
  const a = document.getElementById('computeSignalA').value;
  const b = document.getElementById('computeSignalB').value;
  const name = document.getElementById('computeResultName').value.trim();
  const btn = document.getElementById('computeBtn');
  btn.disabled = !(a && b && name);
}

function enableComputeSection() {
  document.getElementById('computeSection').style.display = 'block';
  document.getElementById('computeSignalA').disabled = false;
  document.getElementById('computeSignalB').disabled = false;
  document.getElementById('computeOp').disabled = false;
  document.getElementById('computeResultName').disabled = false;
  document.getElementById('computeBtn').disabled = true;
  populateComputeSelectors();
}

async function onComputeSignal() {
  const windowId = state.windowId;
  const signalA = document.getElementById('computeSignalA').value;
  const signalB = document.getElementById('computeSignalB').value;
  const operation = document.getElementById('computeOp').value;
  let resultName = document.getElementById('computeResultName').value.trim();

  if (!signalA || !signalB || !resultName) {
    showToast('请选择两个信号并输入结果名称', 'error');
    return;
  }

  showToast(`正在运算: ${signalA} ${operation} ${signalB}`, 'info');

  try {
    const colInfo = await invoke('compute_signal', {
      windowId,
      signalA,
      signalB,
      operation,
      resultName,
    });

    state.numericColumns.push({
      name: colInfo.name,
      col_type: 'Numeric',
      min: colInfo.min,
      max: colInfo.max,
      sample_count: colInfo.sample_count,
    });
    state.selectedYCols.add(colInfo.name);

    populateComputeSelectors();
    renderSignalTags();
    updateGenerateButton();
    updateStatusBar();

    document.getElementById('computeResultName').value = '';
    document.getElementById('computeResultName').dataset.auto = 'false';
    updateComputeButton();

    showToast(`已添加运算信号: ${resultName}`, 'success');
  } catch (err) {
    showToast(`运算失败: ${err}`, 'error');
    console.error(err);
  }
}

// ===== 文件打开 =====
async function onOpenFile() {
  try {
    const selected = await invoke('pick_file');
    if (!selected) return;

    await loadFile(selected);
  } catch (e) {
    console.warn('pick_file 失败，使用 prompt fallback:', e);
    const path = prompt('输入文件路径（xlsx/xls/csv）:');
    if (path) await loadFile(path);
  }
}

async function loadFile(path, inheritFrom, inheritColumns) {
  const fileName = path.split(/[/\\]/).pop();

  const overlay = document.getElementById('loadingOverlay');
  document.getElementById('loadingText').textContent = `正在加载 ${fileName}…`;
  overlay.style.display = 'flex';

  try {
    const result = await TauriBridge.openFile(path, inheritFrom || null);

    if (!result || !result.columns) {
      overlay.style.display = 'none';
      showToast('文件加载失败：返回数据异常', 'error');
      return;
    }

    state.windowId = result.window_id;
    state.columns = result.columns;
    state.rawColumns = result.columns.filter(c => c.col_type === 'Time');
    state.numericColumns = result.columns.filter(c => c.col_type === 'Numeric');
    state.fileLoaded = true;
    state.timeRange = result.time_range || null;

    // 显示 VIN/车架号
    var vinBanner = document.getElementById('vinBanner');
    if (result.vin) {
      vinBanner.textContent = '🚗 ' + result.vin;
      vinBanner.style.display = 'block';
    } else {
      vinBanner.style.display = 'none';
    }

    document.getElementById('fileLabel').textContent = `📁 ${fileName}`;
    document.getElementById('menuNewWindow').style.display = 'inline-block';
    document.getElementById('selectSignalBtn').disabled = false;
    enableComputeSection();

    populateXSelect(result.columns);
    updateGenerateButton();
    updateStatusBar();

    document.getElementById('signalSearch').value = '';

    // 处理继承信号
    if (inheritColumns) {
      const inherited = inheritColumns.split(',');
      inherited.forEach(name => {
        if (state.numericColumns.some(c => c.name === name)) {
          state.selectedYCols.add(name);
        } else {
          showToast(`信号 "${name}" 在当前文件中不存在，已跳过`, 'info');
        }
      });
      renderSignalTags();
      updateGenerateButton();
    }

    // 清除新文件中不存在的信号
    const removed = [];
    state.selectedYCols.forEach(name => {
      if (!state.numericColumns.some(c => c.name === name)) {
        state.selectedYCols.delete(name);
        removed.push(name);
      }
    });
    if (removed.length > 0) {
      renderSignalTags();
      updateGenerateButton();
      showToast(`信号 "${removed.join('、')}" 在新文件中不存在，已移除`, 'info');
    }

    overlay.style.display = 'none';

    showToast(`已加载: ${fileName} (${result.row_count} 行, ${result.columns.length} 列)`, 'success');

    document.getElementById('statusFileInfo').textContent =
      `${result.row_count} 行 × ${result.columns.length} 列`;

  } catch (err) {
    overlay.style.display = 'none';
    showToast(`加载失败: ${err}`, 'error');
    console.error(err);
  }
}

// ===== 生成图表 =====
async function generateChart() {
  if (!state.selectedXCol || state.selectedYCols.size === 0) {
    showToast('请选择 X 轴和至少一个信号', 'error');
    return;
  }

  if (state.selectedYCols.size > 20) {
    showToast(`最多选择 20 个信号（当前 ${state.selectedYCols.size} 个）`, 'error');
    return;
  }

  showToast('正在生成图表...', 'info');

  try {
    var data = await TauriBridge.getSeries(
      state.windowId,
      Array.from(state.selectedYCols),
      null,
      null
    );

    // 保存当前数据供记号标记用
    window.__chartData = data;
    chartMarkers = [];
    updateClearMarkersBtn();

    document.getElementById('chartPlaceholder').style.display = 'none';
    document.getElementById('chartContainer').style.display = 'block';
    document.getElementById('menuMarkerList').style.display = 'inline-block';
    document.getElementById('menuClearMarkers').style.display = 'none';
    renderChart(data, chartMarkers);
    showToast('图表已生成', 'success');
    updateStatusBar();
  } catch (err) {
    showToast(`图表生成失败: ${err}`, 'error');
    console.error(err);
    checkEmptyState();
  }
}

// ===== 记号标记 =====
var chartMarkers = [];

// 点击图表数据点时添加记号
function onChartClicked(isoTime) {
  if (!window.__chartData) return;

  var marker = {
    time: isoTime,
    values: {}
  };

  // 为每个信号查找该时刻最近的值
  var xData = window.__chartData.x;
  var closestIdx = 0;
  var closestDist = Infinity;
  for (var i = 0; i < xData.length; i++) {
    var dist = Math.abs(new Date(xData[i]).getTime() - new Date(isoTime).getTime());
    if (dist < closestDist) { closestDist = dist; closestIdx = i; }
  }

  window.__chartData.series.forEach(function (s) {
    marker.values[s.name] = s.y[closestIdx];
  });

  chartMarkers.push(marker);
  updateClearMarkersBtn();
  applyMarkers(window.__chartData, chartMarkers);
  showToast('已添加记号 M' + chartMarkers.length, 'success');
}

function clearMarkers() {
  chartMarkers = [];
  updateClearMarkersBtn();
  if (window.__chartData) {
    applyMarkers(window.__chartData, chartMarkers);
  }
  showToast('记号已清空', 'info');
}

function updateClearMarkersBtn() {
  var btn = document.getElementById('menuClearMarkers');
  if (btn) btn.style.display = chartMarkers.length > 0 ? 'inline-block' : 'none';
}

function showMarkerList() {
  if (chartMarkers.length === 0) {
    showToast('暂无记号', 'info');
    return;
  }

  var dialog = document.getElementById('markerDialogOverlay');
  var thead = document.getElementById('markerTableHead');
  var tbody = document.getElementById('markerTableBody');

  // 表头：时间 | 信号1 | 信号2 | ...
  var signalNames = Object.keys(chartMarkers[0].values);
  thead.innerHTML = '<tr><th>记号</th><th>时间</th>' +
    signalNames.map(function (n) { return '<th>' + escapeHtml(n) + '</th>'; }).join('') +
    '</tr>';

  // 表体
  tbody.innerHTML = chartMarkers.map(function (m, i) {
    var d = new Date(m.time);
    var timeStr = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0') + ':' +
      String(d.getSeconds()).padStart(2, '0');

    return '<tr><td>M' + (i + 1) + '</td><td>' + timeStr + '</td>' +
      signalNames.map(function (n) {
        var v = m.values[n];
        return '<td style="font-family:Consolas,monospace;text-align:right;">' + (v != null ? formatNum(v) : '—') + '</td>';
      }).join('') +
      '</tr>';
  }).join('');

  dialog.style.display = 'flex';
}

function closeMarkerList() {
  document.getElementById('markerDialogOverlay').style.display = 'none';
}

// ===== 多窗口 =====
async function onNewWindow() {
  try {
    const selected = await invoke('pick_file');
    if (!selected) return;

    const inheritCols = Array.from(state.selectedYCols).join(',');

    // 创建窗口（不传 URL 查询参数），通过 Rust 中转文件信息
    await invoke('create_window', {
      title: '信号查看器',
      width: 1400,
      height: 900,
      filePath: selected,
      inheritFrom: state.windowId,
      inheritColumns: inheritCols,
    });

    showToast('新窗口已创建', 'success');
  } catch (err) {
    showToast(`打开新窗口失败: ${err}`, 'error');
  }
}

// ===== 状态栏 =====
function updateStatusBar() {
  let left = '就绪';
  if (state.fileLoaded) {
    left = `已选 ${state.selectedYCols.size} 个信号 | X轴: ${state.selectedXCol || '未选择'}`;
    if (state.timeRange && state.selectedXCol) {
      left += ` | ${formatTimestamp(state.timeRange.start)} ~ ${formatTimestamp(state.timeRange.end)}`;
    }
  }
  document.getElementById('statusLeft').textContent = left;
}

// ===== 空状态检查 =====
function checkEmptyState() {
  if (!state.fileLoaded) {
    document.getElementById('chartPlaceholder').style.display = 'flex';
    document.getElementById('chartPlaceholder').innerHTML = '<p>📊 请打开 Excel 文件，选择信号后生成图表</p>';
    document.getElementById('chartContainer').style.display = 'none';
  }
}

// ===== 窗口关闭时清理 =====
window.addEventListener('beforeunload', () => {
  if (state.windowId) {
    TauriBridge.closeWindow(state.windowId).catch(() => {});
  }
});

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  // 确保加载遮罩层初始隐藏（多重保障）
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) loadingOverlay.style.display = 'none';

  // 从 Rust 获取版本号
  invoke('get_version').then(v => {
    document.getElementById('menuVersion').textContent = v;
  }).catch(() => {});

  // 绑定按钮事件
  document.getElementById('menuOpenFile').addEventListener('click', onOpenFile);
  document.getElementById('menuNewWindow').addEventListener('click', onNewWindow);
  document.getElementById('menuClearMarkers').addEventListener('click', clearMarkers);
  document.getElementById('menuMarkerList').addEventListener('click', showMarkerList);
  document.getElementById('markerDialogCloseBtn').addEventListener('click', closeMarkerList);
  document.getElementById('markerDialogOverlay').addEventListener('click', function (e) {
    if (e.target === e.currentTarget) closeMarkerList();
  });
  document.getElementById('selectSignalBtn').addEventListener('click', openSignalDialog);
  document.getElementById('generateBtn').addEventListener('click', generateChart);
  document.getElementById('xSelect').addEventListener('change', onXSelectChange);

  // 对话框按钮事件
  document.getElementById('dialogCloseBtn').addEventListener('click', closeSignalDialog);
  document.getElementById('dialogCancelBtn').addEventListener('click', closeSignalDialog);
  document.getElementById('dialogConfirmBtn').addEventListener('click', confirmSignalSelection);
  document.getElementById('dialogSelectAll').addEventListener('click', selectAllFiltered);
  document.getElementById('dialogClearAll').addEventListener('click', clearAllFiltered);

  // 信号运算事件
  document.getElementById('computeBtn').addEventListener('click', onComputeSignal);
  document.getElementById('computeSignalA').addEventListener('change', () => {
    updateComputeAutoName();
    updateComputeButton();
  });
  document.getElementById('computeSignalB').addEventListener('change', () => {
    updateComputeAutoName();
    updateComputeButton();
  });
  document.getElementById('computeOp').addEventListener('change', updateComputeAutoName);
  document.getElementById('computeResultName').addEventListener('input', () => {
    document.getElementById('computeResultName').dataset.auto = 'false';
    updateComputeButton();
  });

  // 信号搜索框输入过滤
  document.getElementById('signalSearch').addEventListener('input', (e) => {
    onSignalSearch(e.target.value);
  });

  // Enter/Escape 在搜索框中
  document.getElementById('signalSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmSignalSelection();
    if (e.key === 'Escape') closeSignalDialog();
  });

  // 弹窗点击外部关闭
  document.getElementById('signalDialogOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSignalDialog();
  });

  // 快捷键
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      onOpenFile();
    }
    if (e.key === 'Escape' && document.getElementById('signalDialogOverlay').style.display === 'flex') {
      closeSignalDialog();
    }
  });

  // 初始化图表占位
  checkEmptyState();
  initChart();
  document.getElementById('chartContainer').style.display = 'none';
  document.getElementById('chartPlaceholder').style.display = 'flex';

  // 检查是否有来自父窗口的待加载文件（新窗口打开时）
  // 通过 Tauri 事件机制通知，避免在 init 中异步调用干扰主界面
  window.__pendingFile = null;
  (async function checkPendingFile() {
    try {
      const pending = await invoke('get_pending_file');
      window.__pendingFile = pending;
    } catch (_) {}
  })();
});

// 延迟检查待加载文件，确保主界面初始化完成后才执行
setTimeout(async function() {
  if (window.__pendingFile && window.__pendingFile.path) {
    const pf = window.__pendingFile;
    window.__pendingFile = null;
    await loadFile(pf.path, pf.inherit_from, pf.inherit_columns);
  }
}, 200);
