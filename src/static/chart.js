// ===== ECharts 管理 =====

var chart = null;
var chartResizeHandler = null;

var CANAPE_COLORS = [
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
  // Resize 监听（debounce 150ms）
  if (chartResizeHandler) {
    window.removeEventListener('resize', chartResizeHandler);
  }
  let resizeTimer;
  chartResizeHandler = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => chart && chart.resize(), 150);
  };
  window.addEventListener('resize', chartResizeHandler);
}

function renderChart(chartData, markers) {
  markers = markers || [];
  initChart();

  const count = chartData.series.length;
  const xData = chartData.x.map(ts => new Date(ts));

  // 子图高度：最多显示 10 个在可见区域，最高不超过 200px
  const SUBPLOT_VISIBLE = Math.min(count, 10);
  const availHeight = window.innerHeight - 170;
  const PANEL_HEIGHT = Math.max(75, Math.min(200, Math.floor(availHeight / SUBPLOT_VISIBLE)));
  const GAP = 4;
  const ZOOM_HEIGHT = 30;
  const totalHeight = count * PANEL_HEIGHT + (count - 1) * GAP + ZOOM_HEIGHT;

  const container = document.getElementById('chartContainer');
  container.style.height = totalHeight + 'px';

  const grids = [];
  const xAxes = [];
  const yAxes = [];

  chartData.series.forEach((s, idx) => {
    const top = idx * (PANEL_HEIGHT + GAP);
    const isLast = idx === count - 1;

    grids.push({
      show: true,
      left: 56,
      right: 16,
      top: top + 2,
      height: PANEL_HEIGHT - 16,
      borderWidth: 1,
      borderColor: '#d0d5dd',
    });

    xAxes.push({
      type: 'time',
      gridIndex: idx,
      show: isLast,
      axisLine: isLast ? { lineStyle: { color: '#d0d5dd' } } : { show: false },
      axisTick: { show: false },
      axisLabel: isLast ? { color: '#5f6b7a', fontSize: 10 } : { show: false },
      splitLine: { show: false },
    });

    yAxes.push({
      type: 'value',
      gridIndex: idx,
      name: s.name,
      nameLocation: 'middle',
      nameGap: 18,
      nameRotate: 90,
      nameTextStyle: {
        fontSize: 10,
        color: '#5f6b7a',
        fontWeight: 'bold',
        overflow: 'break',
        width: Math.max(30, PANEL_HEIGHT - 16),
        lineHeight: 14,
      },
      position: 'left',
      splitNumber: 5,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 8, color: '#9aa0a6' },
      splitLine: { show: true, lineStyle: { color: '#e5e7eb', type: 'solid' } },
    });
  });

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
    markLine: {
      silent: true,
      symbol: 'none',
      label: { show: false },
      lineStyle: { color: '#a0a4ac', width: 1.5, type: 'solid' },
      data: [
        { yAxis: 0 },
      ].concat(markers.map(function (m, mi) {
        var val = m.values[s.name];
        var labelText = (val != null && isFinite(val)) ? (idx === 0 ? 'M' + (mi + 1) + ' ' + formatNum(val) : formatNum(val)) : (idx === 0 ? 'M' + (mi + 1) : '');
        return {
          xAxis: m.time,
          lineStyle: { color: '#d32f2f', type: 'dashed', width: 1.5 },
          label: { show: true, position: 'insideEndTop', formatter: labelText, fontSize: 9, color: '#d32f2f', backgroundColor: '#fff' },
        };
      })),
    },
  }));

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
        const ts = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
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
      label: {
        backgroundColor: '#f0f1f3',
        color: '#1a1a2e',
        padding: [3, 8],
        borderRadius: 4,
        fontSize: 11,
      },
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

  // 点击信号添加记号标记
  chart.off('click');
  chart.on('click', function (params) {
    if (params.componentType === 'series' && params.value && params.value[0]) {
      if (typeof onChartClicked === 'function') {
        onChartClicked(new Date(params.value[0]).toISOString());
      }
    }
  });

  chart.resize();
}

// 原地更新记号标记线，不重建 chart，不丢失缩放状态
function applyMarkers(chartData, markers) {
  if (!chart) return;
  markers = markers || [];

  var seriesUpdate = chartData.series.map(function (s, idx) {
    var markerLines = markers.map(function (m, mi) {
      var val = m.values[s.name];
      var labelText = '';
      if (val != null && isFinite(val)) {
        var numStr = Math.abs(val) >= 10000 ? val.toExponential(2) : (Number.isInteger(val) ? val.toString() : val.toFixed(2));
        labelText = idx === 0 ? 'M' + (mi + 1) + ' ' + numStr : numStr;
      } else {
        labelText = idx === 0 ? 'M' + (mi + 1) : '';
      }
      return {
        xAxis: m.time,
        lineStyle: { color: '#d32f2f', type: 'dashed', width: 1.5 },
        label: { show: true, position: 'insideEndTop', formatter: labelText, fontSize: 9, color: '#d32f2f', backgroundColor: '#fff' },
      };
    });

    return {
      markLine: {
        data: [{ yAxis: 0 }].concat(markerLines),
      },
    };
  });

  chart.setOption({ series: seriesUpdate });
}
