// ===== RTM 数据分析 =====
var RtmModule = (function () {
  'use strict';

  var rtmChart = null;
  var timeListData = [];
  var groupColumns = [];
  var currentColumn = '';
  var markerTimeMap = {};
  var currentSnapData = null;    // current snapshot values for marker label lookup

  // RTM chart markers: array of { index: cellNumber, value: voltage }
  var rtmChartMarkers = [];

  // ECharts RTM colors
  var LINE_COLOR = '#2b5fa8';
  var POINT_COLOR = '#2b5fa8';
  var MAX_COLOR = '#d32f2f';
  var MIN_COLOR = '#1565c0';
  var MARKER_COLORS = ['#d32f2f', '#e65100', '#2e7d32', '#6a1b9a', '#00838f', '#f57f17', '#4e342e', '#37474f'];

  function invoke(cmd, args) {
    if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) {
      console.warn('[RTM] Tauri IPC 不可用');
      return Promise.reject('Tauri 运行时不可用');
    }
    return window.__TAURI_INTERNALS__.invoke(cmd, args);
  }

  function init() {
    var menuBtn = document.getElementById('menuRtmAnalysis');
    if (menuBtn) menuBtn.addEventListener('click', onMenuClick);

    document.getElementById('rtmDialogCloseBtn').addEventListener('click', closeDialog);
    document.getElementById('rtmDialogOverlay').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) closeDialog();
    });
    document.getElementById('rtmGroupColSelect').addEventListener('change', onColumnChange);
    document.getElementById('rtmMarkerSelect').addEventListener('change', onMarkerSelect);
    document.getElementById('rtmDatetimePicker').addEventListener('change', onDatetimePick);
    document.getElementById('rtmOpenTimeListBtn').addEventListener('click', openTimeList);
    document.getElementById('rtmTimeListCloseBtn').addEventListener('click', closeTimeList);
    document.getElementById('rtmTimeListOverlay').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) closeTimeList();
    });
    document.getElementById('rtmTimeSearch').addEventListener('input', renderTimeTable);
    document.getElementById('rtmClearRtmMarkers').addEventListener('click', clearRtmMarkers);

    initRtmChart();
  }

  function initRtmChart() {
    var container = document.getElementById('rtmChartContainer');
    if (rtmChart) rtmChart.dispose();
    rtmChart = echarts.init(container, undefined, { renderer: 'canvas' });
    // Click to add marker
    rtmChart.on('click', onRtmChartClick);
  }

  // ===== Chart click: add marker =====
  function onRtmChartClick(params) {
    if (params.componentType !== 'series') return;
    if (!currentSnapData) return;

    // Get the cell index (1-based) from the click
    var cellIdx = Math.round(params.value[0]);
    if (cellIdx < 1 || cellIdx > currentSnapData.values.length) return;

    var voltage = currentSnapData.values[cellIdx - 1];

    // Check if already marked
    var existing = rtmChartMarkers.findIndex(function (m) { return m.index === cellIdx; });
    if (existing !== -1) {
      showToast('电池 ' + cellIdx + ' 已添加记号', 'info');
      return;
    }

    rtmChartMarkers.push({ index: cellIdx, value: voltage });
    showToast('已添加记号 M' + rtmChartMarkers.length + ' (电池' + cellIdx + ')', 'success');

    // Re-render snapshot with markers
    renderSnapshotWithMarkers(currentSnapData);
  }

  function clearRtmMarkers() {
    rtmChartMarkers = [];
    if (currentSnapData) renderSnapshotWithMarkers(currentSnapData);
    showToast('RTM 记号已清空', 'info');
  }

  // ===== Dialog open/close =====
  function onMenuClick() {
    var sess = currentSession && currentSession();
    if (!sess || !sess.fileLoaded) {
      showToast('请先加载文件', 'error');
      return;
    }

    rtmChartMarkers = [];
    currentSnapData = null;
    loadMarkers();

    invoke('rtm_list_group_columns', { windowId: sess.windowId })
      .then(function (cols) {
        groupColumns = cols || [];
        populateColumnSelect();
        if (groupColumns.length > 0) {
          document.getElementById('rtmGroupColSelect').value = groupColumns[0].name;
          onColumnChange();
        }
        document.getElementById('rtmDialogOverlay').style.display = 'flex';
        showRtmNoData('请选择数据分析列和时间点');
      })
      .catch(function (err) {
        showToast('获取分析列失败: ' + err, 'error');
      });
  }

  function closeDialog() {
    document.getElementById('rtmDialogOverlay').style.display = 'none';
    closeTimeList();
  }

  function loadMarkers() {
    markerTimeMap = {};
    var markers = window.chartMarkers || [];
    var select = document.getElementById('rtmMarkerSelect');
    select.innerHTML = '<option value="">— 选择记号 —</option>';
    markers.forEach(function (m, i) {
      var label = 'M' + (i + 1) + ' (' + formatMarkerTime(m.time) + ')';
      var opt = document.createElement('option');
      opt.value = label;
      opt.textContent = label;
      select.appendChild(opt);
      markerTimeMap[label] = m.time;
    });
    select.disabled = markers.length === 0;
  }

  function formatMarkerTime(isoStr) {
    try {
      var d = new Date(isoStr);
      return String(d.getHours()).padStart(2, '0') + ':' +
             String(d.getMinutes()).padStart(2, '0') + ':' +
             String(d.getSeconds()).padStart(2, '0');
    } catch (_) {
      return isoStr;
    }
  }

  function populateColumnSelect() {
    var select = document.getElementById('rtmGroupColSelect');
    select.innerHTML = '';
    groupColumns.forEach(function (col) {
      var opt = document.createElement('option');
      opt.value = col.name;
      opt.textContent = col.name + ' (' + col.element_count + ' 元素)';
      select.appendChild(opt);
    });
    if (groupColumns.length === 0) {
      var opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '— 无可用数据列 —';
      select.appendChild(opt);
    }
  }

  function onColumnChange() {
    currentColumn = document.getElementById('rtmGroupColSelect').value;
    if (!currentColumn) { showRtmNoData('请选择数据分析列'); return; }
    rtmChartMarkers = [];
    currentSnapData = null;
    loadTimeList(currentColumn);
  }

  function loadTimeList(column) {
    var sess = currentSession && currentSession();
    if (!sess) return;
    invoke('rtm_get_time_list', { windowId: sess.windowId, column: column })
      .then(function (entries) {
        timeListData = entries || [];
        if (timeListData.length > 0) {
          loadSnapshot(timeListData[timeListData.length - 1].time_str);
        } else {
          showRtmNoData('该列无数据');
        }
      })
      .catch(function (err) {
        showToast('获取时间列表失败: ' + err, 'error');
        showRtmNoData('数据加载失败');
      });
  }

  // ===== Snapshot loading =====
  function loadSnapshot(timeStr) {
    var sess = currentSession && currentSession();
    if (!sess || !timeStr) return;

    updatePickers(timeStr);

    invoke('rtm_get_snapshot', {
      windowId: sess.windowId,
      column: currentColumn,
      timeStr: timeStr,
    })
      .then(function (snap) {
        currentSnapData = snap;
        rtmChartMarkers = [];  // clear RTM markers when changing time
        renderSnapshotWithMarkers(snap);
      })
      .catch(function (err) {
        showToast('获取快照失败: ' + err, 'error');
        showRtmNoData('数据加载失败');
      });
  }

  function updatePickers(timeStr) {
    var picker = document.getElementById('rtmDatetimePicker');
    var dtVal = timeStr.replace(' ', 'T');
    if (dtVal.indexOf('.') > 0) dtVal = dtVal.split('.')[0];
    picker.value = dtVal;
  }

  // ===== Render snapshot with markers =====
  function renderSnapshotWithMarkers(snap) {
    if (!snap) return;
    document.getElementById('rtmNoData').style.display = 'none';
    document.getElementById('rtmChartContainer').style.display = 'block';

    document.getElementById('rtmStatMax').textContent = snap.max_val.toFixed(4) + 'V';
    document.getElementById('rtmStatMin').textContent = snap.min_val.toFixed(4) + 'V';
    document.getElementById('rtmStatAvg').textContent = snap.avg_val.toFixed(4) + 'V';
    document.getElementById('rtmStatCount').textContent = snap.element_count;

    var indices = [];
    var values = [];
    for (var i = 0; i < snap.values.length; i++) {
      indices.push(i + 1);
      values.push(snap.values[i]);
    }

    var maxIdx = snap.max_index + 1;
    var minIdx = snap.min_index + 1;

    // Build markPoint data for user-clicked markers
    var markerPoints = rtmChartMarkers.map(function (m, i) {
      var c = MARKER_COLORS[i % MARKER_COLORS.length];
      return {
        name: 'M' + (i + 1),
        coord: [m.index, m.value],
        value: 'M' + (i + 1) + ' #' + m.index + '=' + m.value.toFixed(4) + 'V',
        symbol: 'circle',
        symbolSize: 14,
        itemStyle: { color: c, borderColor: '#fff', borderWidth: 2 },
        label: {
          show: true,
          formatter: 'M' + (i + 1) + ': #' + m.index + '\n' + m.value.toFixed(4) + 'V',
          fontSize: 9,
          color: '#fff',
          fontWeight: 'bold',
          position: 'top',
          lineHeight: 13,
          backgroundColor: c,
          padding: [3, 6],
          borderRadius: 4,
        },
      };
    });

    var option = {
      tooltip: {
        trigger: 'axis',
        formatter: function (params) {
          if (!params || params.length === 0) return '';
          var p = params[0];
          var idx = Math.round(p.data[0]);
          return '<div style="font-size:12px;">电池序号: <strong>' + idx + '</strong></div>' +
            '<div style="font-size:13px;color:' + LINE_COLOR + ';">电压: <strong>' + p.data[1].toFixed(4) + ' V</strong></div>';
        },
        backgroundColor: '#ffffff',
        borderColor: '#d0d5dd',
        borderWidth: 1,
        padding: [8, 12],
      },
      grid: {
        left: 60,
        right: 60,
        top: 40,
        bottom: 32,
      },
      xAxis: {
        type: 'category',
        data: indices,
        name: '电池序号',
        nameLocation: 'middle',
        nameGap: 28,
        nameTextStyle: { fontSize: 12, color: '#5f6b7a' },
        axisLine: { lineStyle: { color: '#d0d5dd' } },
        axisLabel: { fontSize: 10, color: '#5f6b7a' },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: '电压(V)',
        nameTextStyle: { fontSize: 12, color: '#5f6b7a' },
        axisLine: { show: false },
        axisLabel: { fontSize: 10, color: '#5f6b7a' },
        splitLine: { lineStyle: { color: '#e5e7eb', type: 'solid' } },
      },
      series: [
        {
          type: 'line',
          data: indices.map(function (idx, i) { return [idx, values[i]]; }),
          smooth: false,
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 3,
          lineStyle: { width: 1.5, color: LINE_COLOR },
          itemStyle: { color: POINT_COLOR },
          connectNulls: false,
          markPoint: {
            data: [
              {
                name: '最高',
                coord: [maxIdx, snap.max_val],
                value: snap.max_val.toFixed(4) + 'V',
                symbol: 'pin',
                symbolSize: 45,
                itemStyle: { color: MAX_COLOR },
                label: { show: true, formatter: '↓ 最高\n{c}', fontSize: 9, color: '#fff', position: 'bottom', lineHeight: 12 },
              },
              {
                name: '最低',
                coord: [minIdx, snap.min_val],
                value: snap.min_val.toFixed(4) + 'V',
                symbol: 'pin',
                symbolSize: 45,
                itemStyle: { color: MIN_COLOR },
                label: { show: true, formatter: '↑ 最低\n{c}', fontSize: 9, color: '#fff', position: 'top', lineHeight: 12 },
              },
            ].concat(markerPoints),
          },
        },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0], start: 0, end: 100 },
        { type: 'inside', yAxisIndex: [0], start: 0, end: 100 },
        {
          type: 'slider', xAxisIndex: [0], start: 0, end: 100, bottom: 0, height: 20,
          borderColor: '#d0d5dd', backgroundColor: '#f5f6f8',
          fillerColor: 'rgba(43, 95, 168, 0.15)',
          handleStyle: { color: '#2b5fa8' },
          textStyle: { color: '#5f6b7a', fontSize: 10 },
        },
      ],
    };

    rtmChart.setOption(option, true);
    rtmChart.resize();
  }

  function showRtmNoData(msg) {
    document.getElementById('rtmNoData').style.display = 'flex';
    document.getElementById('rtmNoData').textContent = msg || '请选择数据列和时间点';
    document.getElementById('rtmChartContainer').style.display = 'none';
    document.getElementById('rtmStatMax').textContent = '—';
    document.getElementById('rtmStatMin').textContent = '—';
    document.getElementById('rtmStatAvg').textContent = '—';
    document.getElementById('rtmStatCount').textContent = '—';
  }

  // ===== Marker select (from main chart) =====
  function onMarkerSelect() {
    var select = document.getElementById('rtmMarkerSelect');
    var val = select.value;
    if (!val || !markerTimeMap[val]) return;
    var timeStr = markerTimeMap[val];
    try {
      var d = new Date(timeStr);
      var pad = function (n) { return String(n).padStart(2, '0'); };
      timeStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    } catch (_) {}
    loadSnapshot(timeStr);
  }

  // ===== Datetime picker =====
  function onDatetimePick() {
    var picker = document.getElementById('rtmDatetimePicker');
    var val = picker.value;
    if (!val) return;
    var timeStr = val.replace('T', ' ');
    if (timeStr.split(':').length === 2) timeStr += ':00';
    else if (timeStr.split(':').length === 1) timeStr += ':00:00';
    loadSnapshot(timeStr);
  }

  // ===== Time list dialog =====
  var timeListSortKey = 'time';
  var timeListSortAsc = true;

  function openTimeList() {
    if (timeListData.length === 0) { showToast('暂无时间数据', 'info'); return; }
    document.getElementById('rtmTimeSearch').value = '';
    timeListSortKey = 'time';
    timeListSortAsc = true;
    renderTimeTable();
    document.getElementById('rtmTimeListOverlay').style.display = 'flex';
  }

  function closeTimeList() {
    document.getElementById('rtmTimeListOverlay').style.display = 'none';
  }

  function renderTimeTable() {
    var search = document.getElementById('rtmTimeSearch').value.toLowerCase();
    var tbody = document.getElementById('rtmTimeTableBody');
    var countEl = document.getElementById('rtmTimeCount');

    var filtered = timeListData;
    if (search) {
      filtered = timeListData.filter(function (e) {
        return e.time_str.toLowerCase().indexOf(search) !== -1;
      });
    }

    var sorted = filtered.slice().sort(function (a, b) {
      var cmp = 0;
      switch (timeListSortKey) {
        case 'time':  cmp = a.timestamp - b.timestamp; break;
        case 'max':   cmp = a.max_val - b.max_val; break;
        case 'min':   cmp = a.min_val - b.min_val; break;
        case 'range': cmp = a.range_val - b.range_val; break;
        case 'avg':   cmp = a.avg_val - b.avg_val; break;
      }
      return timeListSortAsc ? cmp : -cmp;
    });

    var html = '';
    var markerKeys = Object.keys(markerTimeMap);
    sorted.forEach(function (entry) {
      var markerLabel = '';
      var isMarker = false;
      markerKeys.forEach(function (mk) {
        var markerTime = markerTimeMap[mk];
        try {
          var md = new Date(markerTime);
          var pad = function (n) { return String(n).padStart(2, '0'); };
          var mt = md.getFullYear() + '-' + pad(md.getMonth() + 1) + '-' + pad(md.getDate()) +
            ' ' + pad(md.getHours()) + ':' + pad(md.getMinutes()) + ':' + pad(md.getSeconds());
          if (mt === entry.time_str) {
            markerLabel = '<span class="rtm-marker-badge">' + mk + '</span>';
            isMarker = true;
          }
        } catch (_) {}
      });
      html += '<tr class="' + (isMarker ? 'rtm-marker-row' : '') + '" data-time="' + escapeHtml(entry.time_str) + '">' +
        '<td>' + escapeHtml(entry.time_str) + '</td>' +
        '<td style="font-family:var(--font-mono);text-align:right;">' + entry.max_val.toFixed(4) + '</td>' +
        '<td style="font-family:var(--font-mono);text-align:right;">' + entry.min_val.toFixed(4) + '</td>' +
        '<td style="font-family:var(--font-mono);text-align:right;">' + entry.range_val.toFixed(4) + '</td>' +
        '<td style="font-family:var(--font-mono);text-align:right;">' + entry.avg_val.toFixed(4) + '</td>' +
        '<td>' + markerLabel + '</td></tr>';
    });
    tbody.innerHTML = html;

    tbody.querySelectorAll('tr[data-time]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        closeTimeList();
        loadSnapshot(this.dataset.time);
      });
    });

    countEl.textContent = '显示 ' + sorted.length + ' / ' + timeListData.length + ' 行';
    document.querySelectorAll('#rtmTimeTable th.sortable').forEach(function (th) {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === timeListSortKey) th.classList.add(timeListSortAsc ? 'sort-asc' : 'sort-desc');
    });
  }

  document.addEventListener('click', function (e) {
    var th = e.target.closest('#rtmTimeTable th.sortable');
    if (!th) return;
    var key = th.dataset.sort;
    if (key === timeListSortKey) timeListSortAsc = !timeListSortAsc;
    else { timeListSortKey = key; timeListSortAsc = true; }
    renderTimeTable();
  });

  window.addEventListener('resize', function () {
    if (rtmChart && document.getElementById('rtmDialogOverlay').style.display === 'flex') rtmChart.resize();
  });

  return {
    init: init,
    refreshMarkers: function () {
      if (document.getElementById('rtmDialogOverlay').style.display === 'flex') loadMarkers();
    },
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  if (typeof RtmModule !== 'undefined') RtmModule.init();
});

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
