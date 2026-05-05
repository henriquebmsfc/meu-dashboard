import fs from 'fs';
import path from 'path';

// Mapeamento: coluna do data.csv -> coluna nos arquivos novos
const COLUMN_MAP = {
  'Número - PEDIDO':           'Número - PEDIDO',
  'Data - PEDIDO':             'Data - PEDIDO',
  'Hora - PEDIDO':             'Hora - PEDIDO',
  'Código - CLIENTE':          'Código - CLIENTE',
  'Nome - CLIENTE':            'Nome - CLIENTE',
  'Tipo Pessoa - CLIENTE':     'Tipo Pessoa - CLIENTE',
  'E-mail - CLIENTE':          'E-mail - CLIENTE',
  'CPF / CNPJ - CLIENTE':      'CPF / CNPJ - CLIENTE',
  'RG / IE - CLIENTE':         'RG / IE - CLIENTE',
  'Sexo - CLIENTE':            'Sexo - CLIENTE',
  'Nascimento - CLIENTE':      'Nascimento - CLIENTE',
  'Cidade - CLIENTE':          'Cidade - CLIENTE',
  'Estado - CLIENTE':          'Estado - CLIENTE',
  'Telefone - COBRANÇA':       'Telefone - COBRANÇA',
  'Valor total pedido - PEDIDO': 'Valor total pedido - PEDIDO',
  'Status pedido - PEDIDO':    'Status pedido - PEDIDO',
  'TelefoneENTREGA':           'Telefone - ENTREGA',
};

const TARGET_COLS = Object.keys(COLUMN_MAP);

// Parser CSV robusto (lida com aspas e vírgulas dentro dos valores)
function parseCSV(text) {
  const lines = [];
  let current = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        current.push(field);
        field = '';
      } else if (ch === '\r' && next === '\n') {
        current.push(field);
        field = '';
        if (current.length > 1 || current[0] !== '') lines.push(current);
        current = [];
        i++;
      } else if (ch === '\n') {
        current.push(field);
        field = '';
        if (current.length > 1 || current[0] !== '') lines.push(current);
        current = [];
      } else {
        field += ch;
      }
    }
  }
  if (field || current.length) {
    current.push(field);
    if (current.length > 1 || current[0] !== '') lines.push(current);
  }

  return lines;
}

// Serializa um campo para CSV (adiciona aspas se necessário)
function escapeField(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowToCSV(arr) {
  return arr.map(escapeField).join(',');
}

// Lê pedidos já existentes no data.csv
console.log('Lendo data.csv...');
const dataPath = path.resolve('public/data.csv');
const dataText = fs.readFileSync(dataPath, 'utf-8');
const dataLines = parseCSV(dataText);
const dataHeader = dataLines[0];
const orderNumIdx = dataHeader.indexOf('Número - PEDIDO');

const existingOrders = new Set();
for (let i = 1; i < dataLines.length; i++) {
  existingOrders.add(dataLines[i][orderNumIdx]);
}
console.log(`  ${existingOrders.size} pedidos existentes em data.csv`);

// Arquivos novos
const newFiles = [
  'H:/DOWN/relatorio_pedido_1.778.005.409.413.csv',
  'H:/DOWN/relatorio_pedido_1.778.005.742.563.csv',
  'H:/DOWN/relatorio_pedido_1.778.005.505.695.csv',
  'H:/DOWN/relatorio_pedido_1.775.155.900.352.csv',
  'H:/DOWN/relatorio_pedido_1.775.155.807.549.csv',
];

const newRows = [];           // linhas já mapeadas para o formato data.csv
const seenOrders = new Set(); // deduplicação entre os arquivos novos
let skippedDuplicate = 0;
let skippedExisting = 0;

for (const filePath of newFiles) {
  console.log(`\nProcessando ${path.basename(filePath)}...`);
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = parseCSV(text);
  const header = lines[0];

  // Monta índice de colunas do arquivo novo
  const srcIdx = {};
  for (const [destCol, srcCol] of Object.entries(COLUMN_MAP)) {
    const idx = header.indexOf(srcCol);
    if (idx === -1) {
      console.warn(`  AVISO: coluna "${srcCol}" não encontrada em ${path.basename(filePath)}`);
    }
    srcIdx[destCol] = idx;
  }

  let fileNew = 0;
  let fileDup = 0;
  let fileExisting = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    const orderNum = row[srcIdx['Número - PEDIDO']];
    if (!orderNum) continue;

    if (existingOrders.has(orderNum)) {
      fileExisting++;
      skippedExisting++;
      continue;
    }
    if (seenOrders.has(orderNum)) {
      fileDup++;
      skippedDuplicate++;
      continue;
    }

    seenOrders.add(orderNum);
    const mapped = TARGET_COLS.map(col => row[srcIdx[col]] ?? '');
    newRows.push(mapped);
    fileNew++;
  }

  console.log(`  ${fileNew} novos | ${fileDup} duplicados internos | ${fileExisting} já existiam`);
}

console.log(`\nTotal a acrescentar: ${newRows.length} pedidos`);
console.log(`Duplicados ignorados: ${skippedDuplicate} (entre arquivos novos)`);
console.log(`Já existentes ignorados: ${skippedExisting} (já estavam no data.csv)`);

if (newRows.length === 0) {
  console.log('Nada a fazer.');
  process.exit(0);
}

// Adiciona ao final do data.csv
const appendLines = newRows.map(rowToCSV).join('\n') + '\n';
fs.appendFileSync(dataPath, appendLines, 'utf-8');

const finalLines = parseCSV(fs.readFileSync(dataPath, 'utf-8'));
console.log(`\ndata.csv atualizado: ${finalLines.length - 1} pedidos no total`);
