import * as Papa from "papaparse";

const CACHE_KEY  = "sheet_data_v1";
const CACHE_TIME = "sheet_time_v1";
const CACHE_TTL  = 8 * 60 * 60 * 1000; // 8 horas

function toCSVExport(url) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return url;
  if (url.includes("export") || url.includes("/pub?")) return url;
  const gid = url.match(/gid=(\d+)/)?.[1] || "0";
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

const RAW_URL = import.meta.env.VITE_SHEET_URL || "";

function readCache() {
  try {
    const t = localStorage.getItem(CACHE_TIME);
    if (!t || Date.now() - parseInt(t) > CACHE_TTL) return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function writeCache(rows) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rows));
    localStorage.setItem(CACHE_TIME, Date.now().toString());
  } catch { /* localStorage cheio — ignora */ }
}

export function getCacheAge() {
  try {
    const t = localStorage.getItem(CACHE_TIME);
    if (!t) return null;
    const mins = Math.floor((Date.now() - parseInt(t)) / 60000);
    if (mins < 60) return `${mins} min atrás`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h atrás`;
  } catch { return null; }
}

export function clearCache() {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_TIME);
}

export function loadSheet(onProgress, forceRefresh = false) {
  return new Promise((resolve, reject) => {
    if (!RAW_URL) return reject(new Error("VITE_SHEET_URL não configurado"));

    // Tenta cache primeiro (a não ser que forceRefresh)
    if (!forceRefresh) {
      const cached = readCache();
      if (cached) {
        onProgress?.(100);
        return resolve({ rows: cached, fileName: "Google Sheets", fromCache: true });
      }
    }

    // Busca do Google Sheets
    const url = toCSVExport(RAW_URL);
    const rows = [];
    let tick = 0;

    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      chunk: (results) => {
        rows.push(...results.data);
        tick++;
        // Progresso mais suave: 10% → 78% durante o download
        onProgress?.(Math.min(78, 10 + tick * 3));
      },
      complete: () => {
        writeCache(rows);
        resolve({ rows, fileName: "Google Sheets", fromCache: false });
      },
      error: () => reject(new Error(
        "Não foi possível carregar a planilha. Verifique se está compartilhada como 'qualquer pessoa com o link pode ver'."
      )),
    });
  });
}
