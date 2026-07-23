// ===== 运行时检测 =====
function hasTauriIPC() {
  return typeof window !== 'undefined' && window.__TAURI_INTERNALS__;
}
const invoke = (cmd, args) => {
  if (!hasTauriIPC()) {
    console.warn('[DEV] Tauri IPC 不可用，返回 mock');
    return Promise.reject('Tauri 运行时不可用');
  }
  return window.__TAURI_INTERNALS__.invoke(cmd, args);
};

// ===== UI 状态 =====
const state = {
  windowId: '',
  columns: [],           // ColumnInfo[] from Rust
  selectedXCol: null,    // string | null
  selectedYCols: new Set(), // Set<string>
  rawColumns: [],        // 备选时间列
  numericColumns: [],    // 数值信号列
  fileLoaded: false,
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

// ===== Tauri IPC 封装 =====
const TauriBridge = {
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

// ===== URL 参数解析 =====
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    wid: params.get('wid') || '',
    inheritColumns: params.get('inherit') || '',
    inheritFrom: params.get('from') || '',
  };
}

// ===== 信号选择弹窗 =====
function openSignalDialog() {
  if (!state.fileLoaded) return;
  const dialog = document.getElementById('signalDialogOverlay');
  const list = document.getElementById('signalList');
  const search = document.getElementById('signalSearch');

  search.value = '';
  dialog.style.display = 'flex';
  renderSignalList(state.numericColumns);
  updateDialogCount();
  search.focus();
}

function closeSignalDialog() {
  document.getElementById('signalDialogOverlay').style.display = 'none';
}

function renderSignalList(columns) {
  const list = document.getElementById('signalList');
  list.innerHTML = '';
  columns.forEach((col, idx) => {
    const checked = state.selectedYCols.has(col.name);
    const item = document.createElement('div');
    item.className = 'signal-item';
    item.innerHTML = `
      <input type="checkbox" id="sig_${idx}" value="${escapeHtml(col.name)}"
        ${checked ? 'checked' : ''}>
      <label for="sig_${idx}">${escapeHtml(col.name)}</label>
      <span class="signal-range">${formatNum(col.min)} ~ ${formatNum(col.max)}</span>
    `;
    item.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) {
        state.selectedYCols.add(col.name);
      } else {
        state.selectedYCols.delete(col.name);
      }
      updateDialogCount();
    });
    list.appendChild(item);
  });
}

function onSignalSearch(keyword) {
  const filtered = state.numericColumns.filter(col =>
    col.name.toLowerCase().includes(keyword.toLowerCase())
  );
  renderSignalList(filtered);
  updateDialogCount();
}

function selectAllFiltered() {
  const checkboxes = document.querySelectorAll('#signalList input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = true;
    state.selectedYCols.add(cb.value);
  });
  updateDialogCount();
}

function clearAllFiltered() {
  const checkboxes = document.querySelectorAll('#signalList input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = false;
    state.selectedYCols.delete(cb.value);
  });
  updateDialogCount();
}

function confirmSignalSelection() {
  closeSignalDialog();
  renderSignalTags();
  updateGenerateButton();
  updateStatusBar();
}

function updateDialogCount() {
  document.getElementById('dialogCount').textContent =
    `已选 ${state.selectedYCols.size} / ${state.numericColumns.length} 个信号`;
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

// ===== 左面板交互 =====
function populateXSelect(columns) {
  const select = document.getElementById('xSelect');
  select.innerHTML = '<option value="">— 选择时间列 —</option>';
  const timeCols = columns.filter(c => c.col_type === 'Time');
  // 如果无时间列，显示所有数值列
  const candidates = timeCols.length > 0 ? timeCols : columns.filter(c => c.col_type === 'Numeric');

  candidates.forEach(col => {
    const opt = document.createElement('option');
    opt.value = col.name;
    opt.textContent = col.name;
    select.appendChild(opt);
  });
  select.disabled = false;

  // 自动选择第一个
  if (candidates.length > 0) {
    select.value = candidates[0].name;
    state.selectedXCol = candidates[0].name;
  }
}

function onXSelectChange() {
  const select = document.getElementById('xSelect');
  state.selectedXCol = select.value || null;
  updateGenerateButton();
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

// ===== ECharts 管理 =====
let chart = null;
const CANAPE_COLORS = [
  '#5470C6', '#91CC75', '#FAC858', '#EE6666', '#73C0DE',
  '#3BA272', '#FC8452', '#9A60B4', '#EA7CCC', '#00E5FF',
  '#FF6B6B', '#69F0AE', '#FFD740', '#40C4FF', '#FF80AB',
  '#B388FF',
];

function initChart() {
  if (chart) {
    chart.dispose();
    chart = null;
  }
  const container = document.getElementById('chartContainer');
  container.style.display = 'block';
  chart = echarts.init(container, undefined, {
    renderer: 'canvas',
  });
  // Resize 监听
  window.addEventListener('resize', () => {
    chart && chart.resize();
  });
}

function renderChart(chartData) {
  if (!chart) initChart();

  const count = chartData.series.length;
  const xData = chartData.x.map(ts => new Date(ts));

  // 每个子图高度 150px，底部 dataZoom 30px
  // 子图高度：最多显示 10 个在可见区域
  const SUBPLOT_VISIBLE = Math.min(count, 10);
  const availHeight = window.innerHeight - 170; // 减去菜单、状态栏、padding、zoom
  const PANEL_HEIGHT = Math.max(75, Math.floor(availHeight / SUBPLOT_VISIBLE));
  const GAP = 4;
  const ZOOM_HEIGHT = 30;
  const totalHeight = count * PANEL_HEIGHT + (count - 1) * GAP + ZOOM_HEIGHT;

  // 容器高度设为全部子图总高，父级 chartArea 负责滚动
  const container = document.getElementById('chartContainer');
  container.style.height = totalHeight + 'px';

  const grids = [];
  const xAxes = [];
  const yAxes = [];

  chartData.series.forEach((s, idx) => {
    const top = idx * (PANEL_HEIGHT + GAP);
    const isLast = idx === count - 1;
    const onLeft = idx % 2 === 0;

    grids.push({
      left: onLeft ? 50 : 16,
      right: onLeft ? 16 : 50,
      top: top + 2,
      height: PANEL_HEIGHT - 16,
    });

    // X 轴 — 每个子图独立，只有最后显示标签
    xAxes.push({
      type: 'time',
      gridIndex: idx,
      show: isLast,
      axisLine: isLast ? { lineStyle: { color: '#d0d5dd' } } : { show: false },
      axisTick: { show: false },
      axisLabel: isLast ? { color: '#5f6b7a', fontSize: 10 } : { show: false },
      splitLine: { show: false },
    });

    // Y 轴 — 左右交替放置以免干涉
    yAxes.push({
      type: 'value',
      gridIndex: idx,
      name: s.name,
      nameLocation: 'middle',
      nameGap: onLeft ? 28 : 12,
      nameRotate: 90,
      nameTextStyle: { fontSize: 10, color: '#5f6b7a', fontWeight: 'bold' },
      position: onLeft ? 'left' : 'right',
      splitNumber: 2,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 8, color: '#9aa0a6' },
      splitLine: isLast ? { lineStyle: { color: '#e5e7eb', type: 'solid' } } : { show: false },
    });
  });

  // 构建 series — 每个 series 用自己 grid 的 xAxis
  const series = chartData.series.map((s, idx) => ({
    name: s.name,
    type: 'line',
    data: s.y.map((v, i) => [xData[i], v]),
    symbol: 'circle',
    symbolSize: 2.5,
    lineStyle: { width: 1.5 },
    xAxisIndex: idx,
    yAxisIndex: idx,
    connectNulls: false,
    itemStyle: { color: CANAPE_COLORS[idx % CANAPE_COLORS.length] },
    emphasis: {
      itemStyle: { color: CANAPE_COLORS[idx % CANAPE_COLORS.length] },
      lineStyle: { width: 2 },
    },
  }));

  // Tooltip：显示时间 + 所有信号值
  chart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: '#ffffff',
      borderColor: '#d0d5dd',
      borderWidth: 1,
      padding: [8, 12],
      formatter: function(params) {
        if (!params || params.length === 0) return '';
        const time = params[0].axisValue;
        const d = new Date(time);
        const ts = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        let html = `<div style="font-size:11px;color:#5f6b7a;margin-bottom:3px;">${ts}</div>`;
        params.forEach(p => {
          if (p.value && p.value[1] != null) {
            const v = typeof p.value[1] === 'number' ? p.value[1].toFixed(2) : p.value[1];
            html += `<div style="font-size:12px;line-height:1.5;display:flex;justify-content:space-between;gap:12px;">
              <span style="color:#1a1a2e;">${p.marker} ${p.seriesName}</span>
              <span style="font-family:Consolas,monospace;color:#2b5fa8;font-weight:bold;">${v}</span>
            </div>`;
          }
        });
        return html;
      },
    },
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    series,
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: chartData.series.map((_, i) => i),
        start: 0,
        end: 100,
      },
      {
        type: 'slider',
        xAxisIndex: chartData.series.map((_, i) => i),
        start: 0,
        end: 100,
        bottom: 0,
        height: 20,
        borderColor: '#d0d5dd',
        backgroundColor: '#f5f6f8',
        fillerColor: 'rgba(43, 95, 168, 0.15)',
        handleStyle: { color: '#2b5fa8' },
        textStyle: { color: '#5f6b7a', fontSize: 10 },
      },
    ],
  });

  chart.resize();
}

// ===== 文件打开 =====
async function onOpenFile() {
  try {
    const selected = await invoke('pick_file');
    if (!selected) return;

    await loadFile(selected);
  } catch (e) {
    // Tauri IPC 不可用，用 fallback prompt（开发环境）
    console.warn('pick_file 失败，使用 prompt fallback:', e);
    const path = prompt('输入 Excel 文件路径:');
    if (path) await loadFile(path);
  }
}

async function loadFile(path) {
  showToast('正在加载文件...', 'info');

  try {
    const urlParams = getUrlParams();
    const inheritFrom = urlParams.from || null;
    const result = await TauriBridge.openFile(path, inheritFrom);

    if (!result || !result.columns) {
      showToast('文件加载失败：返回数据异常', 'error');
      return;
    }

    state.windowId = result.window_id;
    state.columns = result.columns;
    state.rawColumns = result.columns.filter(c => c.col_type === 'Time');
    state.numericColumns = result.columns.filter(c => c.col_type === 'Numeric');
    state.fileLoaded = true;

    // 更新 UI
    const fileName = path.split(/[/\\]/).pop();
    document.getElementById('fileLabel').textContent = `📁 ${fileName}`;
    document.getElementById('menuNewWindow').style.display = 'inline-block';
    document.getElementById('selectSignalBtn').disabled = false;

    populateXSelect(result.columns);
    updateGenerateButton();
    updateStatusBar();

    // 信号选择弹窗恢复已选
    document.getElementById('signalSearch').value = '';

    // 处理继承信号
    if (urlParams.inheritColumns) {
      const inherited = urlParams.inheritColumns.split(',');
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

    showToast(`已加载: ${fileName} (${result.row_count} 行, ${result.columns.length} 列)`, 'success');

    // 更新状态栏
    document.getElementById('statusRight').textContent =
      `${result.row_count} 行 × ${result.columns.length} 列`;

  } catch (err) {
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
    const data = await TauriBridge.getSeries(
      state.windowId,
      Array.from(state.selectedYCols),
      null,
      null
    );

    document.getElementById('chartPlaceholder').style.display = 'none';
    document.getElementById('chartContainer').style.display = 'block';
    renderChart(data);
    showToast('图表已生成', 'success');
    updateStatusBar();
  } catch (err) {
    showToast(`图表生成失败: ${err}`, 'error');
    console.error(err);
    checkEmptyState();
  }
}

// ===== 多窗口 =====
async function onNewWindow() {
  try {
    const selected = await invoke('pick_file');
    if (!selected) return;

    // 编码已选信号为 URL 参数
    const inheritCols = Array.from(state.selectedYCols).join(',');
    const newWindowUrl = `index.html?wid=${uuid()}&inherit=${encodeURIComponent(inheritCols)}&from=${state.windowId}`;

    await invoke('create_window', {
      url: newWindowUrl,
      title: '信号查看器',
      width: 1400,
      height: 900,
    });

    showToast('新窗口已创建', 'success');
  } catch (err) {
    showToast(`打开新窗口失败: ${err}`, 'error');
  }
}

// ===== 状态栏 =====
function updateStatusBar() {
  if (state.fileLoaded) {
    document.getElementById('statusLeft').textContent =
      `已选 ${state.selectedYCols.size} 个信号 | X轴: ${state.selectedXCol || '未选择'}`;
  }
}

// ===== UUID =====
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
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
  // 绑定按钮事件（替代内联 onclick，避免 CSP 限制）
  document.getElementById('menuOpenFile').addEventListener('click', onOpenFile);
  document.getElementById('menuNewWindow').addEventListener('click', onNewWindow);
  document.getElementById('selectSignalBtn').addEventListener('click', openSignalDialog);
  document.getElementById('generateBtn').addEventListener('click', generateChart);
  document.getElementById('xSelect').addEventListener('change', onXSelectChange);

  // 对话框按钮事件（替代内联 onclick）
  document.getElementById('dialogCloseBtn').addEventListener('click', closeSignalDialog);
  document.getElementById('dialogCancelBtn').addEventListener('click', closeSignalDialog);
  document.getElementById('dialogConfirmBtn').addEventListener('click', confirmSignalSelection);
  document.getElementById('dialogSelectAll').addEventListener('click', selectAllFiltered);
  document.getElementById('dialogClearAll').addEventListener('click', clearAllFiltered);

  // 信号搜索框输入过滤
  document.getElementById('signalSearch').addEventListener('input', (e) => {
    onSignalSearch(e.target.value);
  });

  // 监听 Enter 键在搜索框中
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
});
