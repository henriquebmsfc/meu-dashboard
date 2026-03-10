import * as Papa from "papaparse";

const CACHE_TTL = 8 * 60 * 60 * 1000; // 8 horas
const DB_NAME   = "dashboard_cache_v1";
const STORE     = "sheets";

function toCSVExport(url) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return url;
  if (url.includes("export") || url.includes("/pub?")) return url;
  const gid = url.match(/gid=(\d+)/)?.[1] || "0";
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

const RAW_URL = import.meta.env.VITE_SHEET_URL || "";

// ── IndexedDB (sem limite prático de tamanho) ──────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
    req.onsuccess  = e  => resolve(e.target.result);
    req.onerror    = () => reject(req.error);
  });
}
async function idbGet() {
  try {
    const db = await openDB();
    return new Promise(resolve => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get("main");
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => resolve(null);
    });
  } catch { return null; }
}
async function idbSet(rows) {
  try {
    const db = await openDB();
    await new Promise(resolve => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ rows, time: Date.now() }, "main");
      tx.oncomplete = resolve;
      tx.onerror    = () => resolve();
    });
  } catch { /* ignora */ }
}
async function idbDel() {
  try {
    const db = await openDB();
    await new Promise(resolve => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete("main");
      tx.oncomplete = resolve;
      tx.onerror    = () => resolve();
    });
  } catch { /* ignora */ }
}

function formatAge(ms) {
  const mins = Math.floor((Date.now() - ms) / 60000);
  return mins < 60 ? `${mins} min atrás` : `${Math.floor(mins / 60)}h atrás`;
}

// ── API pública ───────────────────────────────────────────────────────────
export async function clearCache() { await idbDel(); }

export async function loadSheet(onProgress, forceRefresh = false) {
  if (!RAW_URL) throw new Error("VITE_SHEET_URL não configurado");

  // Cache hit
  if (!forceRefresh) {
    const cached = await idbGet();
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      onProgress?.(100);
      return { rows: cached.rows, fileName: "Google Sheets", fromCache: true, cacheAge: formatAge(cached.time) };
    }
  }

  // Fetch + parse em Web Worker (não trava a UI)
  const url = toCSVExport(RAW_URL);
  onProgress?.(5);

  return new Promise((resolve, reject) => {
    const rows = [];
    let tick = 0;

    Papa.parse(url, {
      download:      true,
      header:        true,
      skipEmptyLines:true,
      worker:        true,          // parse em background thread
      chunkSize:     1024 * 1024,   // 1MB por chunk
      chunk: (results) => {
        rows.push(...results.data);
        tick++;
        onProgress?.(Math.min(82, 5 + tick * 2));
      },
      complete: () => {
        onProgress?.(90);
        idbSet(rows);               // salva no IndexedDB (async, não bloqueia)
        onProgress?.(100);
        resolve({ rows, fileName: "Google Sheets", fromCache: false, cacheAge: null });
      },
      error: () => reject(new Error(
        "Não foi possível carregar. Verifique se a planilha está compartilhada como 'qualquer pessoa com o link pode ver'."
      )),
    });
  });
}
