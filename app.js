const $ = (id) => document.getElementById(id);

window.calculateCommission = function(sales) {
  const rate = Number(localStorage.getItem('user_commission_rate')) || 10;
  return sales * (rate / 100);
};

window.formatMoney = function(amount) {
  const currency = localStorage.getItem('user_currency') || '€';
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
    return '—';
  }
  return `${currency} ${Number(amount).toFixed(2)}`;
};

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
  monthSales: $('summary-month-sales'),
  monthCommission: $('summary-month-commission')
};

let dbReady = false;
let historyHighlight = null;

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

const entryRate = $('entry-rate');
if (entryRate) {
  entryRate.addEventListener('input', () => {
    const rateValue = entryRate.value || '0';
    localStorage.setItem('user_commission_rate', rateValue);
    updateCommissionBadges(rateValue);
    updateCommissionPreview(entryAmount, commissionPreview);
  });
}

const entryCurrency = $('entry-currency');
if (entryCurrency) {
  entryCurrency.addEventListener('change', () => {
    const currencyValue = entryCurrency.value || '€';
    localStorage.setItem('user_currency', currencyValue);
    updateCommissionPreview(entryAmount, commissionPreview);
    refreshAllViews();
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

    const ySelect = $('history-filter-year');
    const savedYear = ySelect.value;
    const uniqueYears = new Set();
    entries.forEach(e => {
      const [y] = e.date.split('-');
      uniqueYears.add(y);
    });
    ySelect.innerHTML = '<option value="">All Years</option>';
    Array.from(uniqueYears).sort().reverse().forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      ySelect.appendChild(opt);
    });
    if (Array.from(ySelect.options).some(o => o.value === savedYear)) {
      ySelect.value = savedYear;
    } else {
      ySelect.value = '';
    }

    let filtered = entries;
    const selY = ySelect.value;
    const selM = $('history-filter-month').value;
    const selD = $('history-filter-day').value;

    if (selY) filtered = filtered.filter(e => e.date.split('-')[0] === selY);
    if (selM) filtered = filtered.filter(e => e.date.split('-')[1] === selM);
    if (selD) filtered = filtered.filter(e => e.date.split('-')[2] === selD);

    if (historyHighlight === 'highest' && filtered.length > 0) {
      const maxC = Math.max(...filtered.map(e => e.commission));
      filtered = filtered.filter(e => e.commission === maxC);
    } else if (historyHighlight === 'lowest' && filtered.length > 0) {
      const minC = Math.min(...filtered.map(e => e.commission));
      filtered = filtered.filter(e => e.commission === minC);
    }

    if (filtered.length === 0) {
      historyEmpty.textContent = 'No entries found.';
      historyEmpty.hidden = false;
      return;
    }

    historyEmpty.hidden = true;

    const fragment = document.createDocumentFragment();
    filtered.forEach((entry) => {
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

$('history-filter-year').addEventListener('change', renderHistory);
$('history-filter-month').addEventListener('change', renderHistory);
$('history-filter-day').addEventListener('change', renderHistory);

$('btn-high-comm').addEventListener('click', () => {
  if (historyHighlight === 'highest') {
    historyHighlight = null;
    $('btn-high-comm').classList.remove('active');
  } else {
    historyHighlight = 'highest';
    $('btn-high-comm').classList.add('active');
    $('btn-low-comm').classList.remove('active');
  }
  renderHistory();
});

$('btn-low-comm').addEventListener('click', () => {
  if (historyHighlight === 'lowest') {
    historyHighlight = null;
    $('btn-low-comm').classList.remove('active');
  } else {
    historyHighlight = 'lowest';
    $('btn-low-comm').classList.add('active');
    $('btn-high-comm').classList.remove('active');
  }
  renderHistory();
});

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
    
    const now = new Date();
    const currentYearStr = String(now.getFullYear());
    const currentMonthStr = String(now.getMonth() + 1).padStart(2, '0');
    const currentPeriodKey = `${currentYearStr}-${currentMonthStr}`;
    
    let mSales = 0, mComm = 0;
    const uniquePeriods = new Set();
    const monthSalesGrid = Array(12).fill(0);
    const monthCountsGrid = Array(12).fill(0);
    
    entries.forEach(e => {
      const [y, m] = e.date.split('-');
      const periodKey = `${y}-${m}`;
      uniquePeriods.add(periodKey);
      
      if (periodKey === currentPeriodKey) {
        mSales += e.sales;
        mComm += e.commission;
      }
      
      const mIdx = parseInt(m, 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        monthSalesGrid[mIdx] += e.sales;
        monthCountsGrid[mIdx]++;
      }
    });
    
    summaryEls.monthSales.textContent = formatMoney(mSales);
    summaryEls.monthCommission.textContent = formatMoney(mComm);
    
    const pSelect = $('summary-period-select');
    const savedVal = pSelect.value;
    pSelect.innerHTML = '<option value="all">All time</option>';
    const sortedPeriods = Array.from(uniquePeriods).sort().reverse();
    const monthNamesEng = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    sortedPeriods.forEach(p => {
      const [y, m] = p.split('-');
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = `${monthNamesEng[parseInt(m,10)-1]} ${y}`;
      pSelect.appendChild(opt);
    });
    
    if (Array.from(pSelect.options).some(o => o.value === savedVal)) {
      pSelect.value = savedVal;
    } else {
      pSelect.value = 'all';
    }
    
    let filteredEntries = entries;
    if (pSelect.value !== 'all') {
      filteredEntries = entries.filter(e => {
        const [y, m] = e.date.split('-');
        return `${y}-${m}` === pSelect.value;
      });
    }
    
    let totalSales = 0, totalComm = 0, count = filteredEntries.length;
    filteredEntries.forEach(e => {
      totalSales += e.sales;
      totalComm += e.commission;
    });
    
    summaryEls.allSales.textContent = formatMoney(totalSales);
    summaryEls.allCommission.textContent = formatMoney(totalComm);
    summaryEls.count.textContent = String(count);
    summaryEls.average.textContent = count > 0 ? formatMoney(totalSales / count) : '—';
    
    let bMonth = "—", wMonth = "—";
    let maxS = -1, minS = Infinity;
    for (let i = 0; i < 12; i++) {
      if (monthCountsGrid[i] > 0) {
        if (monthSalesGrid[i] > maxS) { maxS = monthSalesGrid[i]; bMonth = monthNamesEng[i]; }
        if (monthSalesGrid[i] < minS) { minS = monthSalesGrid[i]; wMonth = monthNamesEng[i]; }
      }
    }
    $('summary-stat-best').textContent = bMonth;
    $('summary-stat-worst').textContent = wMonth;
    
  } catch (err) {
    console.error('renderSummary:', err);
  }
}

$('summary-period-select').addEventListener('change', renderSummary);

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

  const savedRate = localStorage.getItem('user_commission_rate') || '10';
  const rInput = $('entry-rate');
  if (rInput) rInput.value = savedRate;
  updateCommissionBadges(savedRate);

  const savedCurrency = localStorage.getItem('user_currency') || '€';
  const cInput = $('entry-currency');
  if (cInput) cInput.value = savedCurrency;

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
