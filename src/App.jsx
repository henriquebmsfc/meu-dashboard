import { useState, useCallback, useEffect, useRef } from "react";
import * as Papa from "papaparse";
import Dashboard from "./Dashboard";
import RFM from "./RFM";

const STORAGE_KEY = "dashboard_csv_url";

function normKey(k) {
  return k.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
}
function isValid(row) {
  const sk = Object.keys(row).find(k => k.includes("status"));
  if (!sk) return false;
  const s = (row[sk]||"").toLowerCase().trim();
  return s && !s.includes("cancelad");
}
function toSheetsCSV(url) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return url;
  if (url.includes("export") || url.includes("/pub?")) return url;
  const gid = url.match(/gid=(\d+)/)?.[1] || "0";
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

export default function App() {
  const [data,       setData]       = useState([]);
  const [norm,       setNorm]       = useState([]);
  const [valid,      setValid]      = useState([]);
  const [fileName,   setFileName]   = useState("");
  const [dragging,   setDragging]   = useState(false);
  const [page,       setPage]       = useState("dashboard");
  const [loadingCSV, setLoadingCSV] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [sourceUrl,  setSourceUrl]  = useState("");
  const [urlInput,   setUrlInput]   = useState("");
  const [urlError,   setUrlError]   = useState("");
  const rowsRef = useRef([]);

  const processRows = useCallback((rows) => {
    setData(rows);
    setLoadingCSV(false);
  }, []);

  const load = useCallback((file) => {
    setFileName(file.name);
    setSourceUrl("");
    setLoadingCSV(true);
    setProgress(0);
    rowsRef.current = [];
    const chunkSize = file.size > 10*1024*1024 ? 1024*1024*2 : 1024*512;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      chunkSize,
      chunk: (results) => {
        rowsRef.current = rowsRef.current.concat(results.data);
        setProgress(p => Math.min(90, p + 2));
      },
      complete: () => {
        setProgress(92);
        processRows(rowsRef.current);
      },
      error: () => {
        setLoadingCSV(false);
        alert("Erro ao ler o arquivo. Verifique se é um CSV válido.");
      }
    });
  }, [processRows]);

  const loadFromUrl = useCallback((rawUrl) => {
    const url = toSheetsCSV(rawUrl.trim());
    setUrlError("");
    setSourceUrl(url);
    setFileName("Carregando...");
    setLoadingCSV(true);
    setProgress(10);
    rowsRef.current = [];
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      chunk: (results) => {
        rowsRef.current = rowsRef.current.concat(results.data);
        setProgress(p => Math.min(85, p + 8));
      },
      complete: () => {
        setProgress(92);
        const name = url.includes("google.com") ? "Google Sheets" : (url.split("/").pop().split("?")[0] || "CSV externo");
        setFileName(name);
        localStorage.setItem(STORAGE_KEY, rawUrl.trim());
        processRows(rowsRef.current);
      },
      error: () => {
        setLoadingCSV(false);
        setSourceUrl("");
        localStorage.removeItem(STORAGE_KEY);
        setUrlError("Não foi possível carregar. Verifique se a URL é pública e retorna um CSV válido.");
      }
    });
  }, [processRows]);

  // Auto-carregar URL salva
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setUrlInput(saved);
      loadFromUrl(saved);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data.length) return;
    setProcessing(true);
    setProgress(93);
    const timer = setTimeout(() => {
      const n = data.map(row => {
        const nr = {};
        Object.entries(row).forEach(([k,v]) => { nr[normKey(k)] = v?.trim?.()??v; });
        return nr;
      });
      setProgress(97);
      const v = n.filter(isValid);
      setNorm(n);
      setValid(v);
      setProgress(100);
      setTimeout(() => setProcessing(false), 300);
    }, 50);
    return () => clearTimeout(timer);
  }, [data]);

  const reset = () => {
    setData([]); setNorm([]); setValid([]);
    setFileName(""); setProgress(0);
    setSourceUrl(""); setUrlError("");
    localStorage.removeItem(STORAGE_KEY);
  };

  const refresh = () => {
    if (!sourceUrl) return;
    setData([]); setNorm([]); setValid([]);
    setProgress(0);
    loadFromUrl(localStorage.getItem(STORAGE_KEY) || sourceUrl);
  };

  // Tela de loading
  if (loadingCSV || processing) return (
    <div style={{ minHeight:"100vh", background:"#faf9f7", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={{ fontSize:11, fontFamily:"'DM Mono',monospace", letterSpacing:"0.2em", color:"#aaa", textTransform:"uppercase", marginBottom:24 }}>
        {loadingCSV ? (sourceUrl ? "buscando dados" : "lendo arquivo") : "processando dados"}
      </div>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:28, fontWeight:700, color:"#1a1a2e", marginBottom:8 }}>{fileName}</div>
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:13, color:"#bbb", marginBottom:32 }}>
        {loadingCSV ? "carregando linhas..." : `normalizando ${new Intl.NumberFormat("pt-BR").format(data.length)} registros...`}
      </div>
      <div style={{ width:320, height:6, background:"#e8e4de", borderRadius:10, overflow:"hidden" }}>
        <div style={{ width:progress+"%", height:"100%", background:"#1a1a2e", borderRadius:10, transition:"width 0.3s ease" }}/>
      </div>
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:13, color:"#bbb", marginTop:12 }}>{progress}%</div>
    </div>
  );

  // Tela de upload / conectar
  if (!data.length) return (
    <div style={{ minHeight:"100vh", background:"#faf9f7", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif", padding:40 }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={{ fontSize:11, fontFamily:"'DM Mono',monospace", letterSpacing:"0.2em", color:"#aaa", textTransform:"uppercase", marginBottom:12 }}>ecommerce analytics</div>
      <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:40, fontWeight:700, color:"#1a1a2e", margin:0, lineHeight:1.1, textAlign:"center" }}>Dashboard de Clientes</h1>
      <p style={{ color:"#999", marginTop:10, fontSize:14, fontWeight:300 }}>Conecte uma URL de CSV ou faça upload do arquivo</p>

      {/* URL input */}
      <div style={{ marginTop:32, width:"100%", maxWidth:480 }}>
        <div style={{ fontSize:10, fontFamily:"'DM Mono',monospace", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:8 }}>
          URL do CSV ou Google Sheets
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <input
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && urlInput && loadFromUrl(urlInput)}
            placeholder="https://docs.google.com/spreadsheets/d/... ou URL do CSV"
            style={{ flex:1, padding:"11px 16px", border:"1px solid #e8e4de", borderRadius:10, fontFamily:"'DM Mono',monospace", fontSize:12, color:"#1a1a2e", outline:"none", background:"#fff" }}
          />
          <button
            onClick={() => urlInput && loadFromUrl(urlInput)}
            disabled={!urlInput}
            style={{ padding:"11px 20px", background:"#1a1a2e", border:"none", borderRadius:10, cursor:urlInput?"pointer":"default", fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"#fff", fontWeight:500, opacity:urlInput?1:0.4 }}
          >
            Conectar
          </button>
        </div>
        {urlError && (
          <div style={{ marginTop:8, fontSize:12, color:"#991b1b", fontFamily:"'DM Mono',monospace" }}>{urlError}</div>
        )}
        <div style={{ marginTop:6, fontSize:11, color:"#bbb", fontFamily:"'DM Mono',monospace" }}>
          Para Google Sheets: compartilhe como "qualquer pessoa com o link pode ver" e cole a URL normal.
        </div>
      </div>

      {/* Divisor */}
      <div style={{ display:"flex", alignItems:"center", gap:16, margin:"28px 0", width:"100%", maxWidth:480 }}>
        <div style={{ flex:1, height:1, background:"#e8e4de" }}/>
        <span style={{ fontSize:11, fontFamily:"'DM Mono',monospace", color:"#bbb" }}>ou upload direto</span>
        <div style={{ flex:1, height:1, background:"#e8e4de" }}/>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e=>{e.preventDefault();setDragging(true);}}
        onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)load(f);}}
        onClick={()=>document.getElementById("fi").click()}
        style={{ width:"100%", maxWidth:480, padding:"36px 40px", border:`2px dashed ${dragging?"#1a1a2e":"#d4cfc8"}`, borderRadius:20, cursor:"pointer", textAlign:"center", background:dragging?"#f0ede8":"#fff", boxShadow:"0 2px 12px rgba(0,0,0,0.04)", transition:"all 0.2s" }}>
        <div style={{fontSize:30,marginBottom:10}}>📂</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,color:"#1a1a2e",marginBottom:4}}>Arraste seu arquivo aqui</div>
        <div style={{fontSize:12,color:"#bbb",fontWeight:300}}>ou clique · CSV</div>
        <input id="fi" type="file" accept=".csv" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)load(f);}}/>
      </div>
    </div>
  );

  // Dashboard principal
  return (
    <>
      <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, display:"flex", gap:6, background:"#fff", padding:6, borderRadius:14, boxShadow:"0 4px 20px rgba(0,0,0,0.14)" }}>
        <button onClick={()=>setPage("dashboard")} style={{ padding:"9px 18px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:13, background:page==="dashboard"?"#1a1a2e":"transparent", color:page==="dashboard"?"#fff":"#888", fontWeight:600, transition:"all 0.15s" }}>
          Dashboard
        </button>
        <button onClick={()=>setPage("rfm")} style={{ padding:"9px 18px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:13, background:page==="rfm"?"#1a1a2e":"transparent", color:page==="rfm"?"#fff":"#888", fontWeight:600, transition:"all 0.15s" }}>
          RFM
        </button>
        {sourceUrl && (
          <button onClick={refresh} title="Recarregar dados da fonte" style={{ padding:"9px 14px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:13, background:"transparent", color:"#2d6a4f", fontWeight:600, transition:"all 0.15s" }}>
            ↻ Atualizar
          </button>
        )}
      </div>
      <div style={{ display: page==="dashboard" ? "block" : "none" }}>
        <Dashboard data={data} norm={norm} valid={valid} fileName={fileName} onReset={reset}/>
      </div>
      <div style={{ display: page==="rfm" ? "block" : "none" }}>
        <RFM norm={norm} valid={valid} fileName={fileName} onReset={reset}/>
      </div>
    </>
  );
}
