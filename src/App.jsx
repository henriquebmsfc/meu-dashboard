import { useState, useCallback, useEffect } from "react";
import {
  ClerkProvider,
  SignIn,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/react";
import Dashboard from "./Dashboard";
import RFM from "./RFM";
import { loadSheet, getCacheAge, clearCache } from "./sheetsLoader";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";

function normKey(k) {
  return k.trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}
function isValid(row) {
  const sk = Object.keys(row).find(k => k.includes("status"));
  if (!sk) return false;
  const s = (row[sk] || "").toLowerCase().trim();
  return s && !s.includes("cancelad");
}

// ─── Tela de login ────────────────────────────────────────────────────────────
function LoginScreen() {
  return (
    <div style={{ minHeight: "100vh", background: "#faf9f7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif", padding: 40 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.2em", color: "#aaa", textTransform: "uppercase", marginBottom: 14 }}>ecommerce analytics</div>
      <h1 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 42, fontWeight: 700, color: "#1a1a2e", margin: 0, lineHeight: 1.1, textAlign: "center", marginBottom: 10 }}>Dashboard de Clientes</h1>
      <p style={{ color: "#bbb", fontSize: 14, fontWeight: 300, marginBottom: 40 }}>Acesso restrito — faça login para continuar</p>
      <SignIn routing="hash" appearance={{
        elements: {
          rootBox: { width: "100%", maxWidth: 420 },
          card: { boxShadow: "0 2px 20px rgba(0,0,0,0.08)", border: "1px solid #e8e4de", borderRadius: 16 },
          headerTitle: { fontFamily: "'Outfit',sans-serif" },
          formButtonPrimary: { background: "#1a1a2e", fontFamily: "'Inter',sans-serif" },
        }
      }}/>
    </div>
  );
}

// ─── App com dados (só renderiza se logado) ───────────────────────────────────
function AppContent() {
  const { user } = useUser();
  const [data,       setData]       = useState([]);
  const [norm,       setNorm]       = useState([]);
  const [valid,      setValid]      = useState([]);
  const [fileName,   setFileName]   = useState("");
  const [page,       setPage]       = useState("dashboard");
  const [loading,    setLoading]    = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [error,      setError]      = useState("");
  const [fromCache,  setFromCache]  = useState(false);
  const [cacheAge,   setCacheAge]   = useState("");

  // Processa rows em norm/valid
  useEffect(() => {
    if (!data.length) return;
    setProcessing(true);
    setProgress(85);
    const timer = setTimeout(() => {
      const n = data.map(row => {
        const nr = {};
        Object.entries(row).forEach(([k, v]) => { nr[normKey(k)] = v?.trim?.() ?? v; });
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

  // Carrega planilha (forceRefresh = true limpa cache)
  const fetchSheet = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError("");
    setProgress(10);
    try {
      const { rows, fileName: fn, fromCache: cached } = await loadSheet((p) => setProgress(p), forceRefresh);
      setFileName(fn);
      setFromCache(cached);
      setCacheAge(cached ? (getCacheAge() || "") : "");
      setData(rows);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  // Auto-carrega ao montar
  useEffect(() => { fetchSheet(); }, []); // eslint-disable-line

  const refresh = () => {
    setData([]); setNorm([]); setValid([]);
    setError("");
    fetchSheet(true); // forceRefresh: ignora cache
  };

  // Loading
  if (loading || processing) return (
    <div style={{ minHeight: "100vh", background: "#faf9f7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.2em", color: "#aaa", textTransform: "uppercase", marginBottom: 24 }}>
        {loading ? "buscando planilha" : "processando dados"}
      </div>
      <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 28, fontWeight: 700, color: "#1a1a2e", marginBottom: 8 }}>{fileName || "Google Sheets"}</div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: "#bbb", marginBottom: 32 }}>
        {loading ? "carregando linhas..." : `normalizando ${new Intl.NumberFormat("pt-BR").format(data.length)} registros...`}
      </div>
      <div style={{ width: 320, height: 6, background: "#e8e4de", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ width: progress + "%", height: "100%", background: "#1a1a2e", borderRadius: 10, transition: "width 0.3s ease" }}/>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: "#bbb", marginTop: 12 }}>{progress}%</div>
    </div>
  );

  // Erro ao carregar
  if (error) return (
    <div style={{ minHeight: "100vh", background: "#faf9f7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif", padding: 40 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
      <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 22, fontWeight: 600, color: "#1a1a2e", marginBottom: 10 }}>Erro ao carregar planilha</div>
      <div style={{ fontSize: 13, color: "#991b1b", fontFamily: "'JetBrains Mono',monospace", padding: "12px 20px", background: "#fee2e2", borderRadius: 10, border: "1px solid #fecaca", marginBottom: 24, maxWidth: 460, textAlign: "center", lineHeight: 1.5 }}>
        {error}
      </div>
      <button onClick={refresh} style={{ padding: "10px 22px", background: "#1a1a2e", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, color: "#fff", fontFamily: "'Inter',sans-serif" }}>
        Tentar novamente
      </button>
    </div>
  );

  // Dashboard
  return (
    <>
      {/* Barra flutuante de navegação */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", gap: 6, background: "#fff", padding: 6, borderRadius: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.14)", alignItems: "center" }}>
        <button onClick={() => setPage("dashboard")} style={{ padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 13, background: page === "dashboard" ? "#1a1a2e" : "transparent", color: page === "dashboard" ? "#fff" : "#888", fontWeight: 600, transition: "all 0.15s" }}>
          Dashboard
        </button>
        <button onClick={() => setPage("rfm")} style={{ padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 13, background: page === "rfm" ? "#1a1a2e" : "transparent", color: page === "rfm" ? "#fff" : "#888", fontWeight: 600, transition: "all 0.15s" }}>
          RFM
        </button>
        <button onClick={refresh} title="Recarregar dados da planilha (ignora cache)" style={{ padding: "9px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 13, background: "transparent", color: "#2d6a4f", fontWeight: 700, transition: "all 0.15s" }}>
          ↻
        </button>
        {fromCache && cacheAge && (
          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "#bbb", paddingRight: 4 }} title="Dados em cache local — clique ↻ para atualizar">
            {cacheAge}
          </span>
        )}
        <div style={{ width: 1, height: 20, background: "#e8e4de", margin: "0 2px" }}/>
        {/* Avatar + logout do Clerk */}
        <UserButton afterSignOutUrl={window.location.href} appearance={{
          elements: {
            avatarBox: { width: 28, height: 28 },
          }
        }}/>
      </div>

      <div style={{ display: page === "dashboard" ? "block" : "none" }}>
        <Dashboard data={data} norm={norm} valid={valid} fileName={fileName} onReset={() => {}}/>
      </div>
      <div style={{ display: page === "rfm" ? "block" : "none" }}>
        <RFM norm={norm} valid={valid} fileName={fileName} onReset={() => {}}/>
      </div>
    </>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  // Sem chave Clerk configurada: modo dev sem auth
  if (!CLERK_KEY) {
    return (
      <div style={{ minHeight: "100vh", background: "#faf9f7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
        <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 24, fontWeight: 700, color: "#1a1a2e", marginBottom: 12 }}>⚙️ Configuração necessária</div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#666", textAlign: "center", maxWidth: 400, lineHeight: 1.8, padding: "16px 24px", background: "#fff", borderRadius: 12, border: "1px solid #e8e4de" }}>
          Adicione as variáveis de ambiente no Vercel:<br/>
          <code style={{ color: "#1a1a2e" }}>VITE_CLERK_PUBLISHABLE_KEY</code><br/>
          <code style={{ color: "#1a1a2e" }}>VITE_SHEET_URL</code>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_KEY}>
      <AuthGate/>
    </ClerkProvider>
  );
}

// Dentro do provider para ter acesso ao useAuth
function AuthGate() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return (
    <div style={{ minHeight:"100vh", background:"#faf9f7", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#bbb", letterSpacing:"0.15em" }}>carregando...</div>
    </div>
  );

  if (!isSignedIn) return <LoginScreen/>;
  return <AppContent/>;
}
