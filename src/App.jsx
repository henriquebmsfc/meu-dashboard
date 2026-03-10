import { useState, useCallback, useEffect, useRef } from "react";
import * as Papa from "papaparse";
import { GoogleOAuthProvider } from "@react-oauth/google";
import Dashboard from "./Dashboard";
import RFM from "./RFM";
import LoginPage from "./LoginPage";
import { loadGoogleSheet } from "./sheetsLoader";

const CLIENT_ID  = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_MODE = !!CLIENT_ID;
const STORAGE_KEY = "dashboard_csv_url";
const AUTH_KEY    = "g_auth";
const USER_KEY    = "g_user";

function normKey(k) {
  return k.trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
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
function getStoredAuth() {
  try {
    const s = localStorage.getItem(AUTH_KEY);
    if (!s) return null;
    const a = JSON.parse(s);
    if (a.expires_at && Date.now() > a.expires_at) {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return a;
  } catch { return null; }
}

// ─── Inner app (precisa estar dentro do GoogleOAuthProvider) ───────────────
function AppInner() {
  const [data,       setData]       = useState([]);
  const [norm,       setNorm]       = useState([]);
  const [valid,      setValid]      = useState([]);
  const [fileName,   setFileName]   = useState("");
  const [page,       setPage]       = useState("dashboard");
  const [loading,    setLoading]    = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress,   setProgress]   = useState(0);

  // --- Modo Google ---
  const [auth,       setAuth]       = useState(getStoredAuth);
  const [userInfo,   setUserInfo]   = useState(() => { try { const s=localStorage.getItem(USER_KEY); return s?JSON.parse(s):null; } catch{return null;} });
  const [loadError,  setLoadError]  = useState("");

  // --- Modo CSV (fallback sem VITE_GOOGLE_CLIENT_ID) ---
  const [dragging,   setDragging]   = useState(false);
  const [sourceUrl,  setSourceUrl]  = useState("");
  const [urlInput,   setUrlInput]   = useState("");
  const [urlError,   setUrlError]   = useState("");
  const rowsRef = useRef([]);

  // ── Processa rows em norm/valid ──────────────────────────────────────────
  const processRows = useCallback((rows) => {
    setData(rows);
    setLoading(false);
  }, []);

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
      setNorm(n); setValid(v);
      setProgress(100);
      setTimeout(() => setProcessing(false), 300);
    }, 50);
    return () => clearTimeout(timer);
  }, [data]);

  // ── Modo Google: carrega planilha ────────────────────────────────────────
  const fetchSheet = useCallback(async (token) => {
    setLoading(true);
    setLoadError("");
    setProgress(15);
    try {
      // Pega foto/nome do usuário
      try {
        const uRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (uRes.ok) {
          const u = await uRes.json();
          setUserInfo(u);
          localStorage.setItem(USER_KEY, JSON.stringify(u));
        }
      } catch { /* ignora */ }

      setProgress(35);
      const { rows, fileName: fn } = await loadGoogleSheet(token);
      setProgress(80);
      setFileName(fn);
      processRows(rows);
    } catch (err) {
      setLoadError(err.message || "Erro ao carregar planilha");
      setLoading(false);
      if (err.message?.includes("401") || err.message?.includes("403")) {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(USER_KEY);
        setAuth(null);
        setUserInfo(null);
      }
    }
  }, [processRows]);

  // Auto-carrega ao montar (modo Google, se tiver token válido)
  useEffect(() => {
    if (GOOGLE_MODE && auth?.access_token && !data.length) {
      fetchSheet(auth.access_token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoginSuccess = useCallback((tokenResponse) => {
    const expires_at = Date.now() + (tokenResponse.expires_in || 3599) * 1000;
    const a = { ...tokenResponse, expires_at };
    localStorage.setItem(AUTH_KEY, JSON.stringify(a));
    setAuth(a);
    fetchSheet(tokenResponse.access_token);
  }, [fetchSheet]);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(USER_KEY);
    setAuth(null); setUserInfo(null);
    setData([]); setNorm([]); setValid([]);
    setFileName(""); setLoadError("");
  }, []);

  const refreshSheet = useCallback(() => {
    if (!auth?.access_token) return;
    setData([]); setNorm([]); setValid([]);
    fetchSheet(auth.access_token);
  }, [auth, fetchSheet]);

  // ── Modo CSV: carrega arquivo local ──────────────────────────────────────
  const loadFile = useCallback((file) => {
    setFileName(file.name); setSourceUrl(""); setLoading(true); setProgress(0);
    rowsRef.current = [];
    const chunkSize = file.size > 10*1024*1024 ? 2*1024*1024 : 512*1024;
    Papa.parse(file, {
      header: true, skipEmptyLines: true, encoding: "UTF-8", chunkSize,
      chunk: (results) => { rowsRef.current = rowsRef.current.concat(results.data); setProgress(p => Math.min(90,p+2)); },
      complete: () => { setProgress(92); processRows(rowsRef.current); },
      error: () => { setLoading(false); alert("Erro ao ler o arquivo. Verifique se é um CSV válido."); },
    });
  }, [processRows]);

  const loadFromUrl = useCallback((rawUrl) => {
    const url = toSheetsCSV(rawUrl.trim());
    setUrlError(""); setSourceUrl(url); setFileName("Carregando..."); setLoading(true); setProgress(10);
    rowsRef.current = [];
    Papa.parse(url, {
      download: true, header: true, skipEmptyLines: true,
      chunk: (results) => { rowsRef.current = rowsRef.current.concat(results.data); setProgress(p=>Math.min(85,p+8)); },
      complete: () => {
        setProgress(92);
        const name = url.includes("google.com") ? "Google Sheets" : (url.split("/").pop().split("?")[0] || "CSV externo");
        setFileName(name);
        localStorage.setItem(STORAGE_KEY, rawUrl.trim());
        processRows(rowsRef.current);
      },
      error: () => {
        setLoading(false); setSourceUrl(""); localStorage.removeItem(STORAGE_KEY);
        setUrlError("Não foi possível carregar. Verifique se a URL é pública e retorna um CSV válido.");
      },
    });
  }, [processRows]);

  // Auto-carrega URL salva (modo CSV)
  useEffect(() => {
    if (!GOOGLE_MODE) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) { setUrlInput(saved); loadFromUrl(saved); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetCSV = () => {
    setData([]); setNorm([]); setValid([]);
    setFileName(""); setProgress(0); setSourceUrl(""); setUrlError("");
    localStorage.removeItem(STORAGE_KEY);
  };

  const refreshCSV = () => {
    if (!sourceUrl) return;
    setData([]); setNorm([]); setValid([]);
    setProgress(0);
    loadFromUrl(localStorage.getItem(STORAGE_KEY) || sourceUrl);
  };

  // ── Tela de loading ──────────────────────────────────────────────────────
  if (loading || processing) return (
    <div style={{ minHeight:"100vh", background:"#faf9f7", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.2em", color:"#aaa", textTransform:"uppercase", marginBottom:24 }}>
        {loading ? (GOOGLE_MODE ? "buscando planilha" : (sourceUrl ? "buscando dados" : "lendo arquivo")) : "processando dados"}
      </div>
      <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:28, fontWeight:700, color:"#1a1a2e", marginBottom:8 }}>{fileName || "Google Sheets"}</div>
      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:"#bbb", marginBottom:32 }}>
        {loading ? "carregando linhas..." : `normalizando ${new Intl.NumberFormat("pt-BR").format(data.length)} registros...`}
      </div>
      <div style={{ width:320, height:6, background:"#e8e4de", borderRadius:10, overflow:"hidden" }}>
        <div style={{ width:progress+"%", height:"100%", background:"#1a1a2e", borderRadius:10, transition:"width 0.3s ease" }}/>
      </div>
      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:"#bbb", marginTop:12 }}>{progress}%</div>
    </div>
  );

  // ── Modo Google: login ───────────────────────────────────────────────────
  if (GOOGLE_MODE && !auth) return <LoginPage onLogin={handleLoginSuccess} error={loadError}/>;

  // ── Modo Google: erro ao carregar planilha ───────────────────────────────
  if (GOOGLE_MODE && loadError && !data.length) return (
    <div style={{ minHeight:"100vh", background:"#faf9f7", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif", padding:40 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={{ fontSize:36, marginBottom:16 }}>⚠️</div>
      <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:22, fontWeight:600, color:"#1a1a2e", marginBottom:10 }}>Erro ao carregar planilha</div>
      <div style={{ fontSize:13, color:"#991b1b", fontFamily:"'JetBrains Mono',monospace", padding:"12px 20px", background:"#fee2e2", borderRadius:10, border:"1px solid #fecaca", marginBottom:24, maxWidth:460, textAlign:"center", lineHeight:1.5 }}>
        {loadError}
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={refreshSheet} style={{ padding:"10px 22px", background:"#1a1a2e", border:"none", borderRadius:10, cursor:"pointer", fontSize:13, color:"#fff", fontFamily:"'Inter',sans-serif" }}>Tentar novamente</button>
        <button onClick={logout} style={{ padding:"10px 22px", background:"transparent", border:"1.5px solid #e8e4de", borderRadius:10, cursor:"pointer", fontSize:13, color:"#666", fontFamily:"'Inter',sans-serif" }}>Sair</button>
      </div>
    </div>
  );

  // ── Modo CSV: tela de upload ─────────────────────────────────────────────
  if (!GOOGLE_MODE && !data.length) return (
    <div style={{ minHeight:"100vh", background:"#faf9f7", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif", padding:40 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.2em", color:"#aaa", textTransform:"uppercase", marginBottom:12 }}>ecommerce analytics</div>
      <h1 style={{ fontFamily:"'Outfit',sans-serif", fontSize:40, fontWeight:700, color:"#1a1a2e", margin:0, lineHeight:1.1, textAlign:"center" }}>Dashboard de Clientes</h1>
      <p style={{ color:"#999", marginTop:10, fontSize:14, fontWeight:300 }}>Conecte uma URL de CSV ou faça upload do arquivo</p>
      <div style={{ marginTop:32, width:"100%", maxWidth:480 }}>
        <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:8 }}>URL do CSV ou Google Sheets</div>
        <div style={{ display:"flex", gap:8 }}>
          <input value={urlInput} onChange={e=>setUrlInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&urlInput&&loadFromUrl(urlInput)}
            placeholder="https://docs.google.com/spreadsheets/d/... ou URL do CSV"
            style={{ flex:1, padding:"11px 16px", border:"1px solid #e8e4de", borderRadius:10, fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#1a1a2e", outline:"none", background:"#fff" }}/>
          <button onClick={()=>urlInput&&loadFromUrl(urlInput)} disabled={!urlInput}
            style={{ padding:"11px 20px", background:"#1a1a2e", border:"none", borderRadius:10, cursor:urlInput?"pointer":"default", fontFamily:"'Inter',sans-serif", fontSize:13, color:"#fff", fontWeight:500, opacity:urlInput?1:0.4 }}>
            Conectar
          </button>
        </div>
        {urlError && <div style={{ marginTop:8, fontSize:12, color:"#991b1b", fontFamily:"'JetBrains Mono',monospace" }}>{urlError}</div>}
        <div style={{ marginTop:6, fontSize:11, color:"#bbb", fontFamily:"'JetBrains Mono',monospace" }}>Para Google Sheets: compartilhe como "qualquer pessoa com o link pode ver".</div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:16, margin:"28px 0", width:"100%", maxWidth:480 }}>
        <div style={{ flex:1, height:1, background:"#e8e4de" }}/><span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#bbb" }}>ou upload direto</span><div style={{ flex:1, height:1, background:"#e8e4de" }}/>
      </div>
      <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)loadFile(f);}}
        onClick={()=>document.getElementById("fi").click()}
        style={{ width:"100%", maxWidth:480, padding:"36px 40px", border:`2px dashed ${dragging?"#1a1a2e":"#d4cfc8"}`, borderRadius:20, cursor:"pointer", textAlign:"center", background:dragging?"#f0ede8":"#fff", boxShadow:"0 2px 12px rgba(0,0,0,0.04)", transition:"all 0.2s" }}>
        <div style={{fontSize:30,marginBottom:10}}>📂</div>
        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:15,color:"#1a1a2e",marginBottom:4}}>Arraste seu arquivo aqui</div>
        <div style={{fontSize:12,color:"#bbb",fontWeight:300}}>ou clique · CSV</div>
        <input id="fi" type="file" accept=".csv" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)loadFile(f);}}/>
      </div>
    </div>
  );

  // ── Dashboard principal ──────────────────────────────────────────────────
  const handleReset = GOOGLE_MODE ? logout : resetCSV;
  const handleRefresh = GOOGLE_MODE ? refreshSheet : refreshCSV;

  return (
    <>
      {/* Barra flutuante de navegação */}
      <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, display:"flex", gap:6, background:"#fff", padding:6, borderRadius:14, boxShadow:"0 4px 20px rgba(0,0,0,0.14)", alignItems:"center" }}>
        <button onClick={()=>setPage("dashboard")} style={{ padding:"9px 18px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"'Inter',sans-serif", fontSize:13, background:page==="dashboard"?"#1a1a2e":"transparent", color:page==="dashboard"?"#fff":"#888", fontWeight:600, transition:"all 0.15s" }}>
          Dashboard
        </button>
        <button onClick={()=>setPage("rfm")} style={{ padding:"9px 18px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"'Inter',sans-serif", fontSize:13, background:page==="rfm"?"#1a1a2e":"transparent", color:page==="rfm"?"#fff":"#888", fontWeight:600, transition:"all 0.15s" }}>
          RFM
        </button>
        <button onClick={handleRefresh} title="Recarregar dados" style={{ padding:"9px 14px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"'Inter',sans-serif", fontSize:13, background:"transparent", color:"#2d6a4f", fontWeight:600, transition:"all 0.15s" }}>
          ↻
        </button>
        {GOOGLE_MODE && (
          <>
            <div style={{ width:1, height:20, background:"#e8e4de", margin:"0 2px" }}/>
            {userInfo?.picture && (
              <img src={userInfo.picture} alt={userInfo.name||""} title={userInfo.email||""} style={{ width:28, height:28, borderRadius:"50%", objectFit:"cover" }}/>
            )}
            <button onClick={logout} style={{ padding:"9px 14px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"'JetBrains Mono',monospace", fontSize:11, background:"transparent", color:"#bbb", transition:"all 0.15s" }}>
              sair
            </button>
          </>
        )}
      </div>

      <div style={{ display: page==="dashboard" ? "block" : "none" }}>
        <Dashboard data={data} norm={norm} valid={valid} fileName={fileName} onReset={handleReset}/>
      </div>
      <div style={{ display: page==="rfm" ? "block" : "none" }}>
        <RFM norm={norm} valid={valid} fileName={fileName} onReset={handleReset}/>
      </div>
    </>
  );
}

// ─── Root: envolve com GoogleOAuthProvider se configurado ─────────────────
export default function App() {
  if (!CLIENT_ID) return <AppInner/>;
  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <AppInner/>
    </GoogleOAuthProvider>
  );
}
