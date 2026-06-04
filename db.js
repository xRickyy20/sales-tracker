/**
 * IndexedDB — single source of truth for sales entries.
 * Record shape: { id, date, sales, commission, createdAt }
 */

const DB_NAME = 'SalesCommissionDB';
const DB_VERSION = 1;
const STORE_NAME = 'sales';

let db = null;
let openPromise = null;

function openDB() {
  if (db) return Promise.resolve(db);
  if (openPromise) return openPromise;

  openPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      openPromise = null;
      reject(request.error);
    };

    request.onblocked = () => {
      openPromise = null;
      reject(new Error('Database blocked. Close other tabs using this app.'));
    };

    request.onsuccess = () => {
      db = request.result;
      db.onversionchange = () => {
        db.close();
        db = null;
        openPromise = null;
      };
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });

  return openPromise;
}

function normalizeStoredEntry(raw) {
  if (!raw || raw.id == null) return null;

  const sales = Number(raw.sales != null ? raw.sales : raw.totalSales);
  const date = normalizeDate(raw.date);
  const commission =
    raw.commission != null && !Number.isNaN(Number(raw.commission))
      ? Number(raw.commission)
      : calculateCommission(sales);

  return {
    id: raw.id,
    date,
    sales: Number.isNaN(sales) ? 0 : sales,
    commission,
    createdAt: Number(raw.createdAt) || 0
  };
}

function runTransaction(mode, work) {
  return openDB().then(
    () =>
      new Promise((resolve, reject) => {
        let settled = false;
        let result;

        function done(value) {
          if (settled) return;
          settled = true;
          resolve(value);
        }

        function fail(error) {
          if (settled) return;
          settled = true;
          reject(error || new Error('Database transaction failed'));
        }

        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);

        tx.oncomplete = () => done(result);
        tx.onerror = () => fail(tx.error);
        tx.onabort = () => fail(tx.error || new Error('Transaction aborted'));

        try {
          work(store, (value) => {
            result = value;
          }, fail, tx);
        } catch (err) {
          fail(err);
        }
      })
  );
}

function sortEntries(entries) {
  return entries.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

function addEntry(date, sales) {
  const record = {
    date: normalizeDate(date),
    sales: Number(sales),
    commission: calculateCommission(sales),
    createdAt: Date.now()
  };

  return runTransaction('readwrite', (store, setResult, reject) => {
    const request = store.add(record);
    request.onsuccess = () => {
      record.id = request.result;
      setResult(normalizeStoredEntry(record));
    };
    request.onerror = () => reject(request.error);
  });
}

function getAllEntries() {
  return runTransaction('readonly', (store, setResult, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = (request.result || [])
        .map(normalizeStoredEntry)
        .filter(Boolean);
      setResult(sortEntries(entries));
    };
    request.onerror = () => reject(request.error);
  });
}

function updateEntry(id, date, sales) {
  return runTransaction('readwrite', (store, setResult, reject, tx) => {
    const getRequest = store.get(Number(id));

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) {
        tx.abort();
        reject(new Error('Entry not found'));
        return;
      }

      existing.date = normalizeDate(date);
      existing.sales = Number(sales);
      existing.commission = calculateCommission(sales);
      delete existing.totalSales;

      const putRequest = store.put(existing);
      putRequest.onsuccess = () => setResult(normalizeStoredEntry(existing));
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

function deleteEntry(id) {
  return runTransaction('readwrite', (store, setResult, reject) => {
    const request = store.delete(Number(id));
    request.onsuccess = () => setResult();
    request.onerror = () => reject(request.error);
  });
}

function replaceAllEntries(records) {
  const list = Array.isArray(records) ? records : [];

  return runTransaction('readwrite', (store, setResult, reject) => {
    const clearRequest = store.clear();

    clearRequest.onsuccess = () => {
      if (list.length === 0) {
        setResult([]);
        return;
      }

      let remaining = list.length;

      list.forEach((item) => {
        const record = {
          date: normalizeDate(item.date),
          sales: Number(item.sales),
          commission: Number(item.commission),
          createdAt: Number(item.createdAt) || Date.now()
        };

        const addRequest = store.add(record);
        addRequest.onsuccess = () => {
          remaining -= 1;
          if (remaining === 0) setResult();
        };
        addRequest.onerror = () => reject(addRequest.error);
      });
    };

    clearRequest.onerror = () => reject(clearRequest.error);
  });
}
