const SHEET_ID = import.meta.env.VITE_SHEET_ID;

export async function loadGoogleSheet(accessToken) {
  if (!SHEET_ID) throw new Error("VITE_SHEET_ID não configurado nas variáveis de ambiente do Vercel");

  // 1. Busca metadados para pegar o nome da primeira aba
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (metaRes.status === 401) throw new Error("401 - Sessão expirada. Faça login novamente.");
  if (metaRes.status === 403) throw new Error("403 - Você não tem acesso a esta planilha. Solicite permissão ao administrador.");
  if (metaRes.status === 404) throw new Error("404 - Planilha não encontrada. Verifique o VITE_SHEET_ID.");
  if (!metaRes.ok) throw new Error(`Erro ${metaRes.status} ao acessar a planilha`);

  const meta = await metaRes.json();
  const sheetName = meta.sheets?.[0]?.properties?.title;
  if (!sheetName) throw new Error("Planilha vazia ou sem abas");

  // 2. Busca todos os valores da primeira aba
  const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}`;
  const dataRes = await fetch(dataUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!dataRes.ok) throw new Error(`Erro ${dataRes.status} ao ler dados da planilha`);

  const json = await dataRes.json();
  const [headers, ...rows] = json.values || [];

  if (!headers?.length) throw new Error("Planilha sem cabeçalhos na primeira linha");

  // Converte para o mesmo formato do PapaParse (array de objetos)
  const parsed = rows
    .filter(row => row.some(cell => cell?.toString().trim()))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
      return obj;
    });

  return { rows: parsed, fileName: sheetName };
}
