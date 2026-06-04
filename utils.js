/**
 * Shared helpers — no DOM, no IndexedDB.
 */

const COMMISSION_RATE = 0.1;
const BACKUP_VERSION = 1;

function calculateCommission(sales) {
  return Math.round(Number(sales) * COMMISSION_RATE * 100) / 100;
}

function normalizeDate(dateStr) {
  return String(dateStr).slice(0, 10);
}

function isValidISODate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeDate(dateStr));
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function currentMonthPrefix() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function isInCurrentMonth(dateStr) {
  return normalizeDate(dateStr).startsWith(currentMonthPrefix());
}

function formatMoney(amount) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
}

function formatDisplayDate(dateStr) {
  const iso = normalizeDate(dateStr);
  const [y, m, d] = iso.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function currentMonthLabel() {
  return new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * @param {Array<{sales:number,commission:number,date:string}>} entries
 */
function computeStats(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const count = list.length;

  let allSales = 0;
  let allCommission = 0;
  let monthSales = 0;
  let monthCommission = 0;

  list.forEach((e) => {
    const sales = Number(e.sales);
    const commission = Number(e.commission);
    allSales += sales;
    allCommission += commission;
    if (isInCurrentMonth(e.date)) {
      monthSales += sales;
      monthCommission += commission;
    }
  });

  return {
    count,
    allSales,
    allCommission,
    monthSales,
    monthCommission,
    average: count > 0 ? allSales / count : 0
  };
}

function createBackupPayload(entries) {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entries: entries.map((e) => ({
      id: e.id,
      date: normalizeDate(e.date),
      sales: Number(e.sales),
      commission: Number(e.commission),
      createdAt: e.createdAt || 0
    }))
  };
}

/**
 * Parse and validate JSON backup. Returns normalized records for import.
 */
function parseBackupFile(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid backup file.');
  }

  const rawList = Array.isArray(data.entries) ? data.entries : Array.isArray(data) ? data : null;
  if (!rawList) {
    throw new Error('Backup must contain an "entries" array.');
  }

  if (data.version != null && Number(data.version) !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version (expected ${BACKUP_VERSION}).`);
  }

  return rawList.map((item, index) => {
    const label = `Entry ${index + 1}`;
    if (!item || typeof item !== 'object') {
      throw new Error(`${label}: invalid record.`);
    }

    const date = normalizeDate(item.date);
    if (!isValidISODate(date)) {
      throw new Error(`${label}: invalid date.`);
    }

    const sales = Number(item.sales != null ? item.sales : item.totalSales);
    if (Number.isNaN(sales) || sales < 0) {
      throw new Error(`${label}: invalid sales amount.`);
    }

    let commission = Number(item.commission);
    if (Number.isNaN(commission) || commission < 0) {
      commission = calculateCommission(sales);
    }

    return {
      date,
      sales,
      commission,
      createdAt: Number(item.createdAt) || Date.now()
    };
  });
}
