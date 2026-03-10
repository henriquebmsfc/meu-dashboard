import * as Papa from "papaparse";

// Converte URL do Google Sheets para link de exportação CSV
function toCSVExport(url) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return url;
  if (url.includes("export") || url.includes("/pub?")) return url;
  const gid = url.match(/gid=(\d+)/)?.[1] || "0";
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

const RAW_URL = import.meta.env.VITE_SHEET_URL || "";

export function loadSheet(onProgress) {
  return new Promise((resolve, reject) => {
    const url = toCSVExport(RAW_URL);
    if (!url) return reject(new Error("VITE_SHEET_URL não configurado"));

    const rows = [];
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      chunk: (results) => {
        rows.push(...results.data);
        onProgress?.(Math.min(80, rows.length / 100));
      },
      complete: () => resolve({ rows, fileName: "Google Sheets" }),
      error: (err) => reject(new Error("Não foi possível carregar a planilha. Verifique se está compartilhada como 'qualquer pessoa com o link pode ver'.")),
    });
  });
}
