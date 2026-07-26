// ===== 信号选择弹窗 =====

function openSignalDialog() {
  if (!state.fileLoaded) return;
  const dialog = document.getElementById('signalDialogOverlay');
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
