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

// ===== UI 状态（多 Session 架构） =====
var sessions = {};       // { [sessionId]: SessionState }
var activeSessionId = null;

// 默认 Session 状态模板
function defaultSession() {
  return {
    id: null,
    windowId: '',
    fileName: '',
    columns: [],
    selectedXCol: null,
    selectedYCols: [],
    signalGroups: [],
    rawColumns: [],
    numericColumns: [],
    fileLoaded: false,
    timeRange: null,
    vin: null,
    // 日期区间筛选
    dateRangeStart: null,
    dateRangeEnd: null,
    dateRangeOrigStart: null,
    dateRangeOrigEnd: null,
    // 图表缓存
    chartData: null,
    chartMarkers: [],
    dataZoom: { start: 0, end: 100 },
  };
}

function currentSession() {
  return sessions[activeSessionId] || null;
}

function createSession() {
  var id = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  var sess = defaultSession();
  sess.id = id;
  sessions[id] = sess;
  return sess;
}

function removeSession(id) {
  var sess = sessions[id];
  if (sess && sess.windowId) {
    invoke('close_window', { windowId: sess.windowId }).catch(function () {});
  }
  delete sessions[id];
}

var _sessIdCounter = 0;

function ensureTab() {
  var ids = Object.keys(sessions);
  if (ids.length === 0) {
    var s = createSession();
    activeSessionId = s.id;
    renderTabBar();
  }
}

// ===== 信号选择辅助函数（操作当前 Session） =====
function addSelectedSignal(name) {
  var sess = currentSession();
  if (!sess) return;
  if (!sess.selectedYCols.includes(name)) {
    sess.selectedYCols.push(name);
  }
}
function removeSelectedSignal(name) {
  var sess = currentSession();
  if (!sess) return;
  for (var i = 0; i < sess.signalGroups.length; i++) {
    var idx = sess.signalGroups[i].signals.indexOf(name);
    if (idx !== -1) {
      sess.signalGroups[i].signals.splice(idx, 1);
      if (sess.signalGroups[i].signals.length < 2) {
        sess.signalGroups.splice(i, 1);
      }
      break;
    }
  }
  var idx = sess.selectedYCols.indexOf(name);
  if (idx !== -1) sess.selectedYCols.splice(idx, 1);
}
function hasSelectedSignal(name) {
  var sess = currentSession();
  return sess ? sess.selectedYCols.includes(name) : false;
}
function getSignalGroup(name) {
  var sess = currentSession();
  if (!sess) return null;
  for (var i = 0; i < sess.signalGroups.length; i++) {
    if (sess.signalGroups[i].signals.includes(name)) return sess.signalGroups[i];
  }
  return null;
}
function flatSelected() {
  var sess = currentSession();
  var arr = [];
  if (sess) arr = arr.concat(sess.selectedYCols);
  return arr;
}
function subplotCount() {
  var sess = currentSession();
  if (!sess) return 0;
  var merged = 0;
  sess.signalGroups.forEach(function (g) { merged += g.signals.length - 1; });
  return sess.selectedYCols.length - merged;
}

// ===== 搜索式下拉框实例 =====
var signalADropdown = createSearchableDropdown({
  inputId: 'signalAInput',
  listId: 'signalAList',
  containerId: 'signalADropdown',
  placeholder: '— 信号 A —',
  onSelect: function () {
    updateComputeAutoName();
    updateComputeButton();
  },
});

var signalBDropdown = createSearchableDropdown({
  inputId: 'signalBInput',
  listId: 'signalBList',
  containerId: 'signalBDropdown',
  placeholder: '— 信号 B —',
  onSelect: function () {
    updateComputeAutoName();
    updateComputeButton();
  },
});

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

// ===== 搜索式下拉框组件 =====
function createSearchableDropdown(config) {
  const { inputId, listId, containerId, placeholder, onSelect } = config;
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  const container = document.getElementById(containerId);

  let items = [];
  let selectedValue = '';
  let highlightedIndex = -1;
  let isOpen = false;

  function renderList(filtered) {
    if (!filtered || filtered.length === 0) {
      list.innerHTML = '<div class="dropdown-empty">无匹配信号</div>';
      isOpen = true;
      list.style.display = 'block';
      return;
    }
    list.innerHTML = filtered.map((item, i) => {
      const hl = i === highlightedIndex ? ' highlighted' : '';
      const sel = item.name === selectedValue ? ' selected' : '';
      return `<div class="dropdown-item${hl}${sel}" data-value="${item.name}">${escapeHtml(item.name)}</div>`;
    }).join('');
    if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
      const el = list.children[highlightedIndex];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
    isOpen = true;
    list.style.display = 'block';
  }

  function filterItems(query) {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(item => item.name.toLowerCase().includes(q));
  }

  function openDropdown() {
    if (input.disabled) return;
    highlightedIndex = -1;
    // 打开时显示全部信号，不按已有值过滤，方便切换选择
    renderList(items);
  }

  function closeDropdown() {
    isOpen = false;
    list.style.display = 'none';
  }

  function selectItem(value) {
    selectedValue = value;
    input.value = value;
    closeDropdown();
    if (onSelect) onSelect(value);
  }

  function populate(newItems) {
    items = newItems || [];
    if (!selectedValue || !items.some(i => i.name === selectedValue)) {
      selectedValue = '';
      input.value = '';
    }
    input.placeholder = placeholder;
  }

  // 输入框焦点
  input.addEventListener('focus', openDropdown);
  input.addEventListener('click', openDropdown);

  // 输入过滤
  input.addEventListener('input', function () {
    highlightedIndex = -1;
    selectedValue = '';
    renderList(filterItems(this.value));
  });

  // 键盘导航
  input.addEventListener('keydown', function (e) {
    const visibleItems = list.querySelectorAll('.dropdown-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) { openDropdown(); return; }
      highlightedIndex = Math.min(highlightedIndex + 1, visibleItems.length - 1);
      renderList(filterItems(input.value));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      renderList(filterItems(input.value));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && visibleItems[highlightedIndex]) {
        selectItem(visibleItems[highlightedIndex].dataset.value);
      } else if (visibleItems.length === 1) {
        selectItem(visibleItems[0].dataset.value);
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
      input.blur();
    }
  });

  // 点击列表项
  list.addEventListener('mousedown', function (e) {
    const item = e.target.closest('.dropdown-item');
    if (item && item.dataset.value) {
      selectItem(item.dataset.value);
    }
  });

  // 点击外部关闭
  document.addEventListener('mousedown', function (e) {
    if (!container.contains(e.target)) {
      closeDropdown();
    }
  });

  return {
    populate,
    getValue: function () { return selectedValue; },
    setValue: function (name) { selectItem(name); },
    enable: function () { input.disabled = false; },
    disable: function () { input.disabled = true; input.value = ''; selectedValue = ''; closeDropdown(); },
    getInput: function () { return input; },
  };
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
    currentSession().selectedXCol = candidates[0].name;
  }
}

function onXSelectChange() {
  const select = document.getElementById('xSelect');
  currentSession().selectedXCol = select.value || null;
  updateGenerateButton();
  updateStatusBar();
}

// ===== 日期区间选择器 =====
function populateDateRange(timeRange) {
  const section = document.getElementById('dateRangeSection');
  const startInput = document.getElementById('dateRangeStart');
  const endInput = document.getElementById('dateRangeEnd');
  const info = document.getElementById('dateRangeInfo');

  if (!timeRange || !timeRange.start || !timeRange.end) {
    section.style.display = 'none';
    return;
  }

  // 将 Unix 时间戳转为 "YYYY-MM-DD HH:MM:SS" 格式（本地时间）
  function tsToLocal(ts) {
    const d = new Date(ts * 1000);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  const startVal = tsToLocal(timeRange.start);
  const endVal = tsToLocal(timeRange.end);

  startInput.value = startVal;
  endInput.value = endVal;

  // 存储原始值 + 重置已确认的时间戳
  var sess = currentSession();
  if (sess) {
    sess.dateRangeOrigStart = startVal;
    sess.dateRangeOrigEnd = endVal;
    sess.dateRangeStart = null;  // 未确认
    sess.dateRangeEnd = null;
  }

  // 显示数据时间范围
  const fmtDate = d => `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const startDate = new Date(timeRange.start * 1000);
  const endDate = new Date(timeRange.end * 1000);
  info.textContent = `数据范围: ${fmtDate(startDate)} ~ ${fmtDate(endDate)}`;

  section.style.display = 'block';
}

// 解析 "YYYY-MM-DD HH:MM:SS" 为 Unix 时间戳
function parseDateTimeStr(s) {
  const match = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, sec] = match;
  const dt = new Date(
    parseInt(y), parseInt(mo) - 1, parseInt(d),
    parseInt(h), parseInt(mi), parseInt(sec || '0')
  );
  return dt.getTime() / 1000;
}

function onDateRangeConfirm() {
  var sess = currentSession();
  if (!sess) return;

  const startInput = document.getElementById('dateRangeStart');
  const endInput = document.getElementById('dateRangeEnd');
  const info = document.getElementById('dateRangeInfo');

  const startTs = parseDateTimeStr(startInput.value);
  const endTs = parseDateTimeStr(endInput.value);

  if (startTs === null || endTs === null) {
    showToast('日期格式无效，请使用 YYYY-MM-DD HH:MM:SS', 'error');
    return;
  }

  if (startTs >= endTs) {
    showToast('开始时间必须早于结束时间', 'error');
    return;
  }

  // 存储已确认的时间戳
  sess.dateRangeStart = startTs;
  sess.dateRangeEnd = endTs;

  const fmtDate = d => `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  info.textContent = `已筛选: ${fmtDate(new Date(startTs * 1000))} ~ ${fmtDate(new Date(endTs * 1000))}`;

  showToast('日期区间已确认，请点击"生成图表"', 'success');
}

function onDateRangeReset() {
  var sess = currentSession();
  if (!sess || !sess.timeRange) return;

  populateDateRange(sess.timeRange);
  showToast('日期区间已重置', 'info');
}

// ===== Tab 栏 =====
function renderTabBar() {
  var bar = document.getElementById('tabBar');
  if (!bar) return;
  var ids = Object.keys(sessions);
  var html = '';
  ids.forEach(function (id) {
    var s = sessions[id];
    var isActive = id === activeSessionId;
    var name = s.fileName || '未命名';
    html += '<div class="tab' + (isActive ? ' active' : '') + '" data-session="' + id + '">' +
      '<span class="tab-name">' + escapeHtml(name) + '</span>' +
      (ids.length > 1 ? '<span class="tab-close" data-session="' + id + '">×</span>' : '') +
      '</div>';
  });
  html += '<div class="tab-add" id="tabAddBtn">+</div>';
  bar.innerHTML = html;

  // Tab 点击切换
  bar.querySelectorAll('.tab[data-session]').forEach(function (tab) {
    tab.addEventListener('click', function (e) {
      if (e.target.closest('.tab-close')) return;
      switchSession(this.dataset.session);
    });
  });
  // Tab 关闭
  bar.querySelectorAll('.tab-close').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeTab(this.dataset.session);
    });
  });
  // Tab 添加
  var addBtn = document.getElementById('tabAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      startNewTab();
    });
  }
}

function switchSession(id) {
  if (id === activeSessionId || !sessions[id]) return;
  // 保存当前 session 的缩放位置
  var cur = currentSession();
  if (cur && chart) {
    try {
      var opt = chart.getModel().getComponent('dataZoom', 0);
      if (opt) {
        cur.dataZoom = { start: opt.option.start, end: opt.option.end };
      }
    } catch (_) {}
  }
  activeSessionId = id;
  updateUIForSession();
  renderTabBar();
}

function closeTab(id) {
  var ids = Object.keys(sessions);
  if (ids.length <= 1) return;
  var wasActive = id === activeSessionId;
  removeSession(id);
  if (wasActive) {
    var remaining = Object.keys(sessions);
    activeSessionId = remaining[remaining.length - 1];
  }
  updateUIForSession();
  renderTabBar();
}

function startNewTab() {
  // 先弹出文件选择器，选中后再创建 tab
  invoke('pick_file').then(function (selected) {
    if (!selected) return;
    var cur = currentSession();
    var inheritCols = cur ? cur.selectedYCols.slice() : [];
    var sess = createSession();
    if (inheritCols.length > 0) {
      sess.selectedYCols = inheritCols.slice();
    }
    activeSessionId = sess.id;
    loadFileIntoSession(sess.id, selected);
  }).catch(function (err) {
    showToast('打开文件失败: ' + err, 'error');
  });
}

function updateUIForSession() {
  var sess = currentSession();
  if (!sess) return;
  // 检查空状态
  if (!sess.fileLoaded) {
    document.getElementById('chartPlaceholder').style.display = 'flex';
    document.getElementById('chartPlaceholder').innerHTML = '<p>📊 请打开 Excel 文件，选择信号后生成图表</p>';
    document.getElementById('chartContainer').style.display = 'none';
    // 隐藏日期区间选择器
    document.getElementById('dateRangeSection').style.display = 'none';
  }
  populateXSelect(sess.columns);
  // 恢复日期区间选择器状态
  if (sess.timeRange) {
    populateDateRange(sess.timeRange);
  }
  renderSignalTags();
  updateGenerateButton();
  updateStatusBar();
  // 如果缓存了图表数据，恢复渲染
  if (sess.chartData) {
    // 更新全局引用
    window.__chartData = sess.chartData;
    window.__chartGroups = sess.signalGroups.slice();
    chartMarkers = sess.chartMarkers || [];
    updateClearMarkersBtn();
    document.getElementById('chartPlaceholder').style.display = 'none';
    document.getElementById('chartContainer').style.display = 'block';
    document.getElementById('menuMarkerList').style.display = 'inline-block';
    document.getElementById('menuClearMarkers').style.display = chartMarkers.length > 0 ? 'inline-block' : 'none';
    renderChart(sess.chartData, chartMarkers, window.__chartGroups);
    // 恢复 dataZoom
    try {
      if (sess.dataZoom && chart) {
        chart.setOption({ dataZoom: [{ start: sess.dataZoom.start, end: sess.dataZoom.end }] });
      }
    } catch (_) {}
  } else {
    chartMarkers = [];
    updateClearMarkersBtn();
    document.getElementById('menuMarkerList').style.display = 'none';
  }
  // 信号运算区
  if (sess.fileLoaded) {
    enableComputeSection();
  }
}

function loadFileIntoSession(sessionId, filePath) {
  var sess = sessions[sessionId];
  if (!sess) return;
  var prevSessionId = activeSessionId;
  activeSessionId = sessionId;
  loadFile(filePath, null, null);
}

function renderSignalTags() {
  const container = document.getElementById('signalTags');
  const countEl = document.getElementById('signalCount');
  container.innerHTML = '';
  var len = currentSession().selectedYCols.length;
  var totalSignals = 0;
  currentSession().selectedYCols.forEach(function (name) {
    var group = getSignalGroup(name);
    if (group) {
      if (group.signals[0] === name) {
        // 每组只渲染一次，显示合并名
        renderTag(container, group.signals, group.signals[0], len);
        totalSignals += group.signals.length;
      }
    } else {
      renderTag(container, name, name, len);
      totalSignals++;
    }
  });
  countEl.textContent = '已选 ' + totalSignals + ' 个信号 / ' + subplotCount() + ' 子图';
}

function renderTag(container, names, key, totalLen) {
  var isGroup = Array.isArray(names);
  var nameStr = isGroup ? names.join(', ') : names;
  var tag = document.createElement('span');
  tag.className = 'signal-tag' + (isGroup ? ' group-tag' : '');
  tag.dataset.name = key;
  tag.dataset.names = isGroup ? JSON.stringify(names) : names;

  var upBtn = '';
  var downBtn = '';
  if (totalLen > 1) {
    upBtn = '<span class="tag-move" data-dir="up">▲</span>';
    downBtn = '<span class="tag-move" data-dir="dn">▼</span>';
  }
  tag.innerHTML = upBtn + ' ' + escapeHtml(nameStr) + ' <span class="tag-remove" data-names="' + escapeHtml(isGroup ? JSON.stringify(names) : names) + '">×</span> ' + downBtn;

  // 上移/下移按钮
  tag.querySelectorAll('.tag-move').forEach(function(btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var dir = this.dataset.dir;
      var currIdx = currentSession().selectedYCols.indexOf(key);
      if (dir === 'up' && currIdx > 0) {
        swapSignals(currIdx, currIdx - 1);
      } else if (dir === 'dn' && currIdx < currentSession().selectedYCols.length - 1) {
        swapSignals(currIdx, currIdx + 1);
      }
      renderSignalTags();
      showToast('信号顺序已更新，点击"生成图表"刷新', 'info');
    });
  });

  // 删除按钮
  tag.querySelector('.tag-remove').addEventListener('click', function (e) {
    e.stopPropagation();
    // 从父标签的 dataset.names 读取（JS 设置，无转义问题）
    var parentTag = this.closest('.signal-tag');
    if (!parentTag) return;
    var raw = parentTag.dataset.names;
    var removeNames = raw.indexOf('[') === 0 ? JSON.parse(raw) : [raw];
    removeNames.forEach(function (n) { removeSelectedSignal(n); });
    renderSignalTags();
    updateGenerateButton();
    updateStatusBar();
  });

  // 鼠标拖拽
  tag.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    if (e.target.closest('.tag-move')) return;
    if (e.target.closest('.tag-remove')) return;
    // 如果拖拽源在合并组内，用组内第一个信号作为 key
    var dragNames = this.dataset.names.indexOf('[') === 0 ? JSON.parse(this.dataset.names) : [this.dataset.name];
    _dragState = {
      fromNames: dragNames,
      fromName: dragNames[0],
      tag: this,
      startX: e.clientX,
      startY: e.clientY,
      clone: null,
      started: false,
      hoverTarget: null,
      dropZone: null,
    };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    e.preventDefault();
  });

  container.appendChild(tag);
}

function computeDropZone(tagEl, clientX) {
  var rect = tagEl.getBoundingClientRect();
  var relX = clientX - rect.left;
  var w = rect.width;
  if (relX < w * 0.35) return 'before';
  if (relX > w * 0.65) return 'after';
  return 'merge';
}

function swapSignals(i, j) {
  var arr = currentSession().selectedYCols;
  var tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
}

function moveSignal(fromName, toName) {
  var arr = currentSession().selectedYCols;
  var fromIdx = arr.indexOf(fromName);
  var toIdx = arr.indexOf(toName);
  if (fromIdx === -1 || toIdx === -1) return;
  arr.splice(fromIdx, 1);
  var newToIdx = arr.indexOf(toName);
  arr.splice(newToIdx + (fromIdx < toIdx ? 1 : 0), 0, fromName);
}

// ===== 鼠标拖拽排序 =====
var _dragState = null;

function onDragMove(e) {
  var s = _dragState;
  if (!s) return;

  if (!s.started) {
    var dx = e.clientX - s.startX;
    var dy = e.clientY - s.startY;
    if (dx * dx + dy * dy < 25) return;
    s.started = true;

    var rect = s.tag.getBoundingClientRect();
    s.clone = s.tag.cloneNode(true);
    s.clone.style.position = 'fixed';
    s.clone.style.left = rect.left + 'px';
    s.clone.style.top = rect.top + 'px';
    s.clone.style.width = rect.width + 'px';
    s.clone.style.pointerEvents = 'none';
    s.clone.style.zIndex = 10000;
    s.clone.style.opacity = '0.85';
    s.clone.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    s.clone.style.transform = 'rotate(2deg)';
    s.clone.style.borderRadius = '4px';
    s.tag.style.opacity = '0.3';
    document.body.appendChild(s.clone);
  }

  var dx = e.clientX - s.startX;
  var dy = e.clientY - s.startY;
  s.clone.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) rotate(2deg)';

  // 清除所有旧高亮
  document.querySelectorAll('#signalTags .signal-tag').forEach(function (t) {
    t.classList.remove('drop-before', 'drop-merge', 'drop-after');
  });

  // 检测鼠标下方的标签和投放区域
  var el = document.elementFromPoint(e.clientX, e.clientY);
  while (el && el !== document) {
    if (el.classList && el.classList.contains('signal-tag') && el !== s.tag) {
      var zone = computeDropZone(el, e.clientX);
      if (zone === 'before') el.classList.add('drop-before');
      else if (zone === 'merge') el.classList.add('drop-merge');
      else el.classList.add('drop-after');
      s.hoverTarget = el.dataset.name;
      s.dropZone = zone;
      return;
    }
    el = el.parentElement;
  }
  s.hoverTarget = null;
  s.dropZone = null;
}

function onDragEnd(e) {
  var s = _dragState;
  if (!s) return;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);

  if (s.clone) document.body.removeChild(s.clone);
  document.querySelectorAll('#signalTags .signal-tag').forEach(function (t) {
    t.classList.remove('drop-before', 'drop-merge', 'drop-after');
  });
  if (s.tag) s.tag.style.opacity = '';

  var fromNames = s.fromNames;
  var fromName = s.fromName;
  var targetName = s.hoverTarget;
  var zone = s.dropZone;
  _dragState = null;

  if (!targetName || fromName === targetName) return;

  if (zone === 'before' || zone === 'after') {
    // 调序：从合并组或单独信号移动到目标前/后
    // 先从原位置移除 fromNames 中所有信号
    var flat = currentSession().selectedYCols;
    var removed = [];
    fromNames.forEach(function (n) {
      var idx = flat.indexOf(n);
      if (idx !== -1) { removed.push({ name: n, idx: idx }); }
    });
    // 从后往前删，索引不变
    removed.sort(function (a, b) { return b.idx - a.idx; });
    removed.forEach(function (r) { flat.splice(r.idx, 1); });

    // 在减掉 group 后找目标信号的新位置
    var toIdx = flat.indexOf(targetName);
    if (toIdx === -1) { renderSignalTags(); return; }

    var insertAt = zone === 'before' ? toIdx : toIdx + 1;
    // 将被拖信号全部插入
    fromNames.forEach(function (n) {
      flat.splice(insertAt, 0, n);
      insertAt++;
    });

    // 拖出合并组后，检查原组是否需要解散
    for (var gi = currentSession().signalGroups.length - 1; gi >= 0; gi--) {
      var g = currentSession().signalGroups[gi];
      for (var fi = 0; fi < fromNames.length; fi++) {
        var si = g.signals.indexOf(fromNames[fi]);
        if (si !== -1) g.signals.splice(si, 1);
      }
      if (g.signals.length < 2) currentSession().signalGroups.splice(gi, 1);
    }
  } else if (zone === 'merge') {
    // 合并：不修改平铺列表 selectedYCols，只更新 signalGroups
    // 先将 fromNames 从原组中拆除
    for (var gi = currentSession().signalGroups.length - 1; gi >= 0; gi--) {
      var g = currentSession().signalGroups[gi];
      for (var fi = 0; fi < fromNames.length; fi++) {
        var si = g.signals.indexOf(fromNames[fi]);
        if (si !== -1) g.signals.splice(si, 1);
      }
      if (g.signals.length < 2) currentSession().signalGroups.splice(gi, 1);
    }

    // 找到目标信号所在的组，或创建新组
    var targetGroup = getSignalGroup(targetName);
    if (targetGroup) {
      fromNames.forEach(function (n) {
        if (n !== targetName && !targetGroup.signals.includes(n)) targetGroup.signals.push(n);
      });
    } else {
      var newGroup = { signals: [targetName] };
      fromNames.forEach(function (n) {
        if (n !== targetName && !newGroup.signals.includes(n)) newGroup.signals.push(n);
      });
      currentSession().signalGroups.push(newGroup);
    }
  }

  renderSignalTags();
  updateGenerateButton();
  updateStatusBar();
  showToast(zone === 'merge' ? '信号已合并到同一子图' : '信号顺序已更新', 'info');
}

function updateGenerateButton() {
  const btn = document.getElementById('generateBtn');
  btn.disabled = !(
    currentSession().fileLoaded &&
    currentSession().selectedXCol &&
    currentSession().selectedYCols.length > 0
  );
}

// ===== 信号运算 =====
function populateComputeSelectors() {
  const currentA = signalADropdown.getValue();
  const currentB = signalBDropdown.getValue();

  signalADropdown.populate(currentSession().numericColumns);
  signalBDropdown.populate(currentSession().numericColumns);

  if (currentA && currentSession().numericColumns.some(c => c.name === currentA)) signalADropdown.setValue(currentA);
  if (currentB && currentSession().numericColumns.some(c => c.name === currentB)) signalBDropdown.setValue(currentB);

  updateComputeAutoName();
  updateComputeButton();
}

function updateComputeAutoName() {
  const a = signalADropdown.getValue();
  const b = signalBDropdown.getValue();
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
  const a = signalADropdown.getValue();
  const b = signalBDropdown.getValue();
  const name = document.getElementById('computeResultName').value.trim();
  const btn = document.getElementById('computeBtn');
  btn.disabled = !(a && b && name);
}

function enableComputeSection() {
  document.getElementById('computeSection').style.display = 'block';
  signalADropdown.enable();
  signalBDropdown.enable();
  document.getElementById('computeOp').disabled = false;
  document.getElementById('computeResultName').disabled = false;
  document.getElementById('computeBtn').disabled = true;
  populateComputeSelectors();
}

async function onComputeSignal() {
  const windowId = currentSession().windowId;
  const signalA = signalADropdown.getValue();
  const signalB = signalBDropdown.getValue();
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

    currentSession().numericColumns.push({
      name: colInfo.name,
      col_type: 'Numeric',
      min: colInfo.min,
      max: colInfo.max,
      sample_count: colInfo.sample_count,
    });
    currentSession().selectedYCols.push(colInfo.name);

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
  var sess = currentSession();
  if (sess) sess.fileName = fileName;

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

    currentSession().windowId = result.window_id;
    currentSession().columns = result.columns;
    currentSession().rawColumns = result.columns.filter(c => c.col_type === 'Time');
    currentSession().numericColumns = result.columns.filter(c => c.col_type === 'Numeric');
    currentSession().fileLoaded = true;
    currentSession().timeRange = result.time_range || null;

    // 填充日期区间选择器
    populateDateRange(result.time_range);

    // 显示 VIN/车架号
    var vinBanner = document.getElementById('vinBanner');
    if (result.vin) {
      vinBanner.textContent = '🚗 ' + result.vin;
      vinBanner.style.display = 'block';
    } else {
      vinBanner.style.display = 'none';
    }

    document.getElementById('fileLabel').textContent = `📁 ${fileName}`;
    renderTabBar();
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
        if (currentSession().numericColumns.some(c => c.name === name)) {
          addSelectedSignal(name);
        } else {
          showToast(`信号 "${name}" 在当前文件中不存在，已跳过`, 'info');
        }
      });
      renderSignalTags();
      updateGenerateButton();
    }

    // 清除新文件中不存在的信号
    var removed = [];
    var kept = [];
    currentSession().selectedYCols.forEach(function (name) {
      if (currentSession().numericColumns.some(function (c) { return c.name === name; })) {
        kept.push(name);
      } else {
        removed.push(name);
      }
    });
    currentSession().selectedYCols = kept;
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
  if (!currentSession().selectedXCol || currentSession().selectedYCols.length === 0) {
    showToast('请选择 X 轴和至少一个信号', 'error');
    return;
  }

  if (currentSession().selectedYCols.length > 20) {
    showToast(`最多选择 20 个信号（当前 ${currentSession().selectedYCols.length} 个）`, 'error');
    return;
  }

  showToast('正在生成图表...', 'info');

  try {
    // 获取已确认的日期区间
    var sess = currentSession();
    const startTs = sess.dateRangeStart || null;
    const endTs = sess.dateRangeEnd || null;

    var data = await TauriBridge.getSeries(
      sess.windowId,
      sess.selectedYCols,
      startTs,
      endTs
    );

    // 缓存到当前 session
    var sess = currentSession();
    if (sess) {
      sess.chartData = data;
      sess.chartMarkers = [];
    }
    window.__chartData = data;
    window.__chartGroups = sess ? sess.signalGroups.slice() : [];
    chartMarkers = [];
    updateClearMarkersBtn();

    document.getElementById('chartPlaceholder').style.display = 'none';
    document.getElementById('chartContainer').style.display = 'block';
    document.getElementById('menuMarkerList').style.display = 'inline-block';
    document.getElementById('menuClearMarkers').style.display = 'none';
    renderChart(data, chartMarkers, window.__chartGroups);
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
  var sess = currentSession();
  if (sess) sess.chartMarkers = chartMarkers.slice();
  updateClearMarkersBtn();
  applyMarkers(window.__chartData, chartMarkers);
  showToast('已添加记号 M' + chartMarkers.length, 'success');
  // 通知 RTM 模块更新记号列表
  if (typeof RtmModule !== 'undefined' && RtmModule.refreshMarkers) {
    RtmModule.refreshMarkers();
  }
}

function clearMarkers() {
  chartMarkers = [];
  var sess = currentSession();
  if (sess) sess.chartMarkers = [];
  updateClearMarkersBtn();
  if (window.__chartData) {
    applyMarkers(window.__chartData, chartMarkers);
  }
  showToast('记号已清空', 'info');
  // 通知 RTM 模块更新记号列表
  if (typeof RtmModule !== 'undefined' && RtmModule.refreshMarkers) {
    RtmModule.refreshMarkers();
  }
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
// ===== 状态栏 =====
function updateStatusBar() {
  let left = '就绪';
  if (currentSession().fileLoaded) {
    left = `已选 ${currentSession().selectedYCols.length} 个信号 | X轴: ${currentSession().selectedXCol || '未选择'}`;
    if (currentSession().timeRange && currentSession().selectedXCol) {
      left += ` | ${formatTimestamp(currentSession().timeRange.start)} ~ ${formatTimestamp(currentSession().timeRange.end)}`;
    }
  }
  document.getElementById('statusLeft').textContent = left;
}

// ===== 空状态检查 =====
function checkEmptyState() {
  if (!currentSession().fileLoaded) {
    document.getElementById('chartPlaceholder').style.display = 'flex';
    document.getElementById('chartPlaceholder').innerHTML = '<p>📊 请打开 Excel 文件，选择信号后生成图表</p>';
    document.getElementById('chartContainer').style.display = 'none';
  }
}

// ===== 窗口关闭时清理 =====
window.addEventListener('beforeunload', () => {
  Object.keys(sessions).forEach(function (id) {
    var s = sessions[id];
    if (s && s.windowId) {
      TauriBridge.closeWindow(s.windowId).catch(function () {});
    }
  });
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
  document.getElementById('menuClearMarkers').addEventListener('click', clearMarkers);
  document.getElementById('menuMarkerList').addEventListener('click', showMarkerList);
  // RTM 分析按钮事件由 rtm.js 中的 RtmModule.init() 处理
  document.getElementById('markerDialogCloseBtn').addEventListener('click', closeMarkerList);
  document.getElementById('markerDialogOverlay').addEventListener('click', function (e) {
    if (e.target === e.currentTarget) closeMarkerList();
  });
  document.getElementById('selectSignalBtn').addEventListener('click', openSignalDialog);
  document.getElementById('generateBtn').addEventListener('click', generateChart);
  document.getElementById('xSelect').addEventListener('change', onXSelectChange);

  // 日期区间事件
  document.getElementById('dateRangeConfirm').addEventListener('click', onDateRangeConfirm);
  document.getElementById('dateRangeReset').addEventListener('click', onDateRangeReset);

  // 对话框按钮事件
  document.getElementById('dialogCloseBtn').addEventListener('click', closeSignalDialog);
  document.getElementById('dialogCancelBtn').addEventListener('click', closeSignalDialog);
  document.getElementById('dialogConfirmBtn').addEventListener('click', confirmSignalSelection);
  document.getElementById('dialogSelectAll').addEventListener('click', selectAllFiltered);
  document.getElementById('dialogClearAll').addEventListener('click', clearAllFiltered);

  // 信号运算事件
  document.getElementById('computeBtn').addEventListener('click', onComputeSignal);
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
    if (e.key === 'F12') {
      e.preventDefault();
    }
  });

  // 初始化第一个 Session
  ensureTab();
  updateUIForSession();

  // 初始化图表占位
  checkEmptyState();
  initChart();
  document.getElementById('chartContainer').style.display = 'none';
  document.getElementById('chartPlaceholder').style.display = 'flex';
});
