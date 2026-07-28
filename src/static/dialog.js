// ===== 信号选择弹窗 =====

function openSignalDialog() {
  if (!currentSession() || !currentSession().fileLoaded) return;
  const dialog = document.getElementById('signalDialogOverlay');
  const search = document.getElementById('signalSearch');

  search.value = '';
  dialog.style.display = 'flex';
  renderSignalList(currentSession() ? currentSession().numericColumns : []);
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
    const checked = hasSelectedSignal(col.name);
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
        addSelectedSignal(col.name);
      } else {
        removeSelectedSignal(col.name);
      }
      updateDialogCount();
    });
    list.appendChild(item);
  });
}

function onSignalSearch(keyword) {
  var cols = currentSession() ? currentSession().numericColumns : [];
  var filtered = cols.filter(function (col) {
    return col.name.toLowerCase().includes(keyword.toLowerCase());
  });
  renderSignalList(filtered);
  updateDialogCount();
}

function selectAllFiltered() {
  const checkboxes = document.querySelectorAll('#signalList input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = true;
    addSelectedSignal(cb.value);
  });
  updateDialogCount();
}

function clearAllFiltered() {
  const checkboxes = document.querySelectorAll('#signalList input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = false;
    removeSelectedSignal(cb.value);
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
  var sess = currentSession();
  var selected = sess ? sess.selectedYCols.length : 0;
  var total = sess ? sess.numericColumns.length : 0;
  document.getElementById('dialogCount').textContent = '已选 ' + selected + ' / ' + total + ' 个信号';
}
