import * as Papa from "papaparse";

const CACHE_TTL = 8 * 60 * 60 * 1000; // 8 horas
const DB_NAME   = "dashboard_cache_v1";
const STORE     = "sheets";

// ── IndexedDB ─────────────────────────────────────────────────────────────────
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

// ── API pública ───────────────────────────────────────────────────────────────
export async function clearCache() { await idbDel(); }

export async function loadSheet(onProgress, forceRefresh = false) {
  // Cache hit
  if (!forceRefresh) {
    const cached = await idbGet();
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      onProgress?.(100);
      return { rows: cached.rows, fileName: "data.csv", fromCache: true, cacheAge: formatAge(cached.time) };
    }
  }

  onProgress?.(5);

  // ── Passo 1: download com fetch (mesma origem, sem CORS, com progresso real) ──
  const response = await fetch("/data.csv").catch(() => null);
  if (!response || !response.ok) {
    throw new Error(
      `Arquivo não encontrado${response ? ` (HTTP ${response.status})` : ""}. ` +
      `Certifique-se de que data.csv está na pasta public/ do projeto.`
    );
  }

  const contentLength = response.headers.get("Content-Length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    // progresso de 5% a 70% durante o download
    onProgress?.(total
      ? Math.min(70, 5 + (received / total) * 65)
      : Math.min(50, 5 + received / 500_000)
    );
  }

  onProgress?.(72);
  const blob = new Blob(chunks, { type: "text/csv" });

  // ── Passo 2: parse em Web Worker (não trava a UI) ─────────────────────────
  return new Promise((resolve, reject) => {
    const rows = [];
    let tick = 0;

    Papa.parse(blob, {
      header:         true,
      skipEmptyLines: true,
      worker:         true,        // parse em background thread
      chunkSize:      1024 * 1024, // 1 MB por chunk
      chunk: (results) => {
        rows.push(...results.data);
        tick++;
        // progresso de 72% a 90% durante o parse
        onProgress?.(Math.min(90, 72 + tick * 2));
      },
      complete: () => {
        onProgress?.(95);
        idbSet(rows);              // salva no IndexedDB (não bloqueia)
        onProgress?.(100);
        resolve({ rows, fileName: "data.csv", fromCache: false, cacheAge: null });
      },
      error: (err) => reject(new Error(
        `Erro ao processar o arquivo CSV: ${err?.message || "formato inválido"}.`
      )),
    });
  });
}
