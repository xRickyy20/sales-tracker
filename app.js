const $ = (id) => document.getElementById(id);

window.calculateCommission = function(sales) {
  const rate = Number(localStorage.getItem('user_commission_rate')) || 10;
  return sales * (rate / 100);
};

// Aggiorna simultaneamente i testi della percentuale sia nell'header che nel form
function updateCommissionBadges(rate) {
  const cb = $('commission-rate-badge');
  const hb = $('header-rate-badge');
  if (cb) cb.textContent = rate;
  if (hb) hb.textContent = rate;
}

const screens = document.querySelectorAll('.screen');
const navButtons = document.querySelectorAll('.nav-btn');
const entryForm = $('entry-form');
const entryDate = $('entry-date');
const entryAmount = $('entry-amount');
const commissionPreview = $('commission-preview');
const saveStatus = $('save-status');
const historyList = $('history-list');
const historyEmpty = $('history-empty');
const editModal = $('edit-modal');
const editForm = $('edit-form');
const editId = $('edit-id');
const editDate = $('edit-date');
const editAmount = $('edit-amount');
const editCommissionPreview = $('edit-commission-preview');
const backupStatus = $('backup-status');

const summaryEls = {
  allSales: $('summary-all-sales'),
  allCommission: $('summary-all-commission'),
  count: $('summary-count'),
  average: $('summary-average'),
  monthLabel: $('summary-month-label'),
  monthSales: $('summary-month-sales'),
  monthCommission: $('summary-month-commission')
};

let dbReady = false;

function showScreen(screenId) {
  const screen = $(screenId);
  const navBtn = document.querySelector(`[data-screen="${screenId}"]`);
  if (!screen || !navBtn) return;

  screens.forEach((s) => s.classList.remove('active'));
  navButtons.forEach((b) => b.classList.remove('active'));
  screen.classList.add('active');
  navBtn.classList.add('active');

  if (screenId === 'screen-history') renderHistory();
  if (screenId === 'screen-summary') renderSummary();
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

function updateCommissionPreview(inputEl, previewEl) {
  if (!inputEl || !previewEl) return;
  const value = Number(inputEl.value);
  if (!Number.isNaN(value) && value >= 0) {
    previewEl.textContent = formatMoney(calculateCommission(value));
  } else {
    previewEl.textContent = '—';
  }
}

entryAmount.addEventListener('input', () => {
  updateCommissionPreview(entryAmount, commissionPreview);
});

editAmount.addEventListener('input', () => {
  updateCommissionPreview(editAmount, editCommissionPreview);
});

// Gestione sicura dell'input della percentuale della commissione
const entryRate = $('entry-rate');
if (entryRate) {
  entryRate.addEventListener('input', () => {
    const rateValue = entryRate.value || '0';
    // Salva la scelta nel browser
    localStorage.setItem('user_commission_rate', rateValue);
    // Aggiorna l'interfaccia (Header + Form)
    updateCommissionBadges(rateValue);
    // Ricalcola l'anteprima monetaria corrente
    updateCommissionPreview(entryAmount, commissionPreview);
  });
}

function showStatus(message, type) {
  saveStatus.textContent = message;
  saveStatus.className = `save-status ${type || ''}`;
  if (type === 'success') {
    setTimeout(() => {
      saveStatus.textContent = '';
      saveStatus.className = 'save-status';
    }, 2500);
  }
}

function showBackupStatus(message, type) {
  if (!backupStatus) return;
  backupStatus.textContent = message;
  backupStatus.className = `save-status ${type || ''}`;
}

async function refreshAllViews() {
  if (!dbReady) return;
  await Promise.all([renderHistory(), renderSummary()]);
}

entryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!dbReady) {
    showStatus('Database not ready. Refresh the page.', 'error');
    return;
  }

  const date = entryDate.value;
  const amount = Number(entryAmount.value);

  if (!date || Number.isNaN(amount) || amount < 0) {
    showStatus('Enter a valid amount.', 'error');
    return;
  }

  try {
    await addEntry(date, amount);
    await refreshAllViews();
    showStatus('Saved!', 'success');
    entryAmount.value = '';
    commissionPreview.textContent = '—';
    entryAmount.focus();
  } catch (err) {
    console.error(err);
    showStatus('Save failed. Try again.', 'error');
  }
});

async function renderHistory() {
  try {
    const entries = await getAllEntries();
    historyList.innerHTML = '';

    if (entries.length === 0) {
      historyEmpty.textContent = 'No entries yet.';
      historyEmpty.hidden = false;
      return;
    }

    historyEmpty.hidden = true;

    const fragment = document.createDocumentFragment();
    entries.forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `
        <div class="history-main">
          <span class="history-date">${formatDisplayDate(entry.date)}</span>
          <span class="history-sales">${formatMoney(entry.sales)}</span>
        </div>
        <div class="history-sub">
          <span class="history-commission">Commission: ${formatMoney(entry.commission)}</span>
          <div class="history-actions">
            <button type="button" class="btn-small" data-action="edit" data-id="${entry.id}">Edit</button>
            <button type="button" class="btn-small btn-danger" data-action="delete" data-id="${entry.id}">Delete</button>
          </div>
        </div>
      `;
      fragment.appendChild(li);
    });
    historyList.appendChild(fragment);
  } catch (err) {
    console.error('renderHistory:', err);
    historyEmpty.hidden = false;
    historyEmpty.textContent = 'Could not load history. Refresh the page.';
  }
}

historyList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || !dbReady) return;

  const id = Number(btn.dataset.id);
  if (btn.dataset.action === 'edit') {
    await openEditModal(id);
  } else if (btn.dataset.action === 'delete') {
    await confirmDelete(id);
  }
});

async function openEditModal(id) {
  const entries = await getAllEntries();
  const entry = entries.find((e) => Number(e.id) === id);
  if (!entry) return;

  editId.value = entry.id;
  editDate.value = normalizeDate(entry.date);
  editAmount.value = entry.sales;
  updateCommissionPreview(editAmount, editCommissionPreview);
  editModal.hidden = false;
}

function closeEditModal() {
  editModal.hidden = true;
  editForm.reset();
}

$('edit-cancel').addEventListener('click', closeEditModal);
editModal.querySelector('.modal-backdrop').addEventListener('click', closeEditModal);

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = Number(editId.value);
  const date = editDate.value;
  const amount = Number(editAmount.value);
  if (!date || Number.isNaN(amount) || amount < 0) return;

  try {
    await updateEntry(id, date, amount);
    closeEditModal();
    await refreshAllViews();
    showStatus('Updated!', 'success');
  } catch (err) {
    console.error(err);
    alert('Could not update entry.');
  }
});

async function confirmDelete(id) {
  const entries = await getAllEntries();
  const entry = entries.find((e) => Number(e.id) === id);
  if (!entry) return;

  const msg = `Delete ${formatDisplayDate(entry.date)} — ${formatMoney(entry.sales)}?`;
  if (!confirm(msg)) return;

  try {
    await deleteEntry(id);
    await refreshAllViews();
  } catch (err) {
    console.error(err);
    alert('Could not delete entry.');
  }
}

async function renderSummary() {
  try {
    const entries = await getAllEntries();
    const stats = computeStats(entries);

    summaryEls.allSales.textContent = formatMoney(stats.allSales);
    summaryEls.allCommission.textContent = formatMoney(stats.allCommission);
    summaryEls.count.textContent = String(stats.count);
    summaryEls.average.textContent =
      stats.count > 0 ? formatMoney(stats.average) : '—';
    summaryEls.monthLabel.textContent = currentMonthLabel();
    summaryEls.monthSales.textContent = formatMoney(stats.monthSales);
    summaryEls.monthCommission.textContent = formatMoney(stats.monthCommission);
  } catch (err) {
    console.error('renderSummary:', err);
  }
}

$('btn-export-json').addEventListener('click', async () => {
  if (!dbReady) {
    showBackupStatus('Database not ready.', 'error');
    return;
  }

  try {
    const entries = await getAllEntries();
    const backup = createBackupPayload(entries);
    downloadFile(
      JSON.stringify(backup, null, 2),
      `sales-backup-${todayISO()}.json`,
      'application/json'
    );
    showBackupStatus(`Exported ${entries.length} entries.`, 'success');
  } catch (err) {
    console.error(err);
    showBackupStatus('Export failed.', 'error');
  }
});

$('btn-export-csv').addEventListener('click', async () => {
  if (!dbReady) {
    showBackupStatus('Database not ready.', 'error');
    return;
  }

  try {
    const entries = await getAllEntries();
    const header = 'date,sales,commission\n';
    const rows = entries
      .map((e) => `${normalizeDate(e.date)},${e.sales},${e.commission}`)
      .join('\n');
    downloadFile(header + rows, `sales-export-${todayISO()}.csv`, 'text/csv');
    showBackupStatus(`Exported ${entries.length} rows to CSV.`, 'success');
  } catch (err) {
    console.error(err);
    showBackupStatus('CSV export failed.', 'error');
  }
});

$('btn-import-json').addEventListener('click', () => {
  $('import-file').click();
});

$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !dbReady) return;

  try {
    const data = JSON.parse(await file.text());
    const validated = parseBackupFile(data);
    const current = await getAllEntries();

    if (
      !confirm(
        `Replace ${current.length} saved entries with ${validated.length} from backup?`
      )
    ) {
      return;
    }

    await replaceAllEntries(validated);
    await refreshAllViews();
    showBackupStatus(`Restored ${validated.length} entries.`, 'success');
    alert(`Import complete. ${validated.length} entries restored.`);
  } catch (err) {
    console.error(err);
    showBackupStatus(err.message || 'Import failed.', 'error');
    alert(err.message || 'Import failed. Use a valid JSON backup file.');
  }
});

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register('./service-worker.js')
    .then((reg) => {
      reg.update();
    })
    .catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
}

async function initApp() {
  entryDate.value = todayISO();

  // RECUPERO MEMORIA: Legge la percentuale salvata e aggiorna i badge all'avvio
  const savedRate = localStorage.getItem('user_commission_rate') || '10';
  const rInput = $('entry-rate');
  if (rInput) rInput.value = savedRate;
  updateCommissionBadges(savedRate);

  entryAmount.focus();

  try {
    await openDB();
    dbReady = true;
    registerServiceWorker();
    await refreshAllViews();
  } catch (err) {
    console.error(err);
    dbReady = false;
    alert('Could not open local database. Use localhost or HTTPS, then refresh.');
  }
}

initApp();