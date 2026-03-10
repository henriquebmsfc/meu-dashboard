import { useGoogleLogin } from "@react-oauth/google";

export default function LoginPage({ onLogin, error }) {
  const login = useGoogleLogin({
    onSuccess: onLogin,
    onError: () => {},
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    flow: "implicit",
  });

  return (
    <div style={{ minHeight:"100vh", background:"#faf9f7", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif", padding:40 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {/* Logo / branding */}
      <div style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.2em", color:"#aaa", textTransform:"uppercase", marginBottom:14 }}>
        ecommerce analytics
      </div>
      <h1 style={{ fontFamily:"'Outfit',sans-serif", fontSize:42, fontWeight:700, color:"#1a1a2e", margin:0, lineHeight:1.1, textAlign:"center" }}>
        Dashboard de Clientes
      </h1>
      <p style={{ color:"#bbb", marginTop:10, fontSize:14, fontWeight:300, marginBottom:48 }}>
        Acesso restrito — faça login com sua conta Google
      </p>

      {/* Botão Google */}
      <button
        onClick={login}
        style={{
          display:"flex", alignItems:"center", gap:14,
          background:"#fff", border:"1.5px solid #e0dbd4", borderRadius:12,
          padding:"15px 32px", cursor:"pointer",
          fontFamily:"'Inter',sans-serif", fontSize:15, fontWeight:500, color:"#1a1a2e",
          boxShadow:"0 2px 12px rgba(0,0,0,0.08)", transition:"all 0.15s",
        }}
        onMouseEnter={e => e.currentTarget.style.boxShadow="0 4px 20px rgba(0,0,0,0.14)"}
        onMouseLeave={e => e.currentTarget.style.boxShadow="0 2px 12px rgba(0,0,0,0.08)"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Entrar com Google
      </button>

      {error && (
        <div style={{ marginTop:20, padding:"12px 20px", background:"#fee2e2", border:"1px solid #fecaca", borderRadius:10, fontSize:12, color:"#991b1b", fontFamily:"'JetBrains Mono',monospace", maxWidth:420, textAlign:"center", lineHeight:1.5 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop:40, fontSize:11, color:"#ccc", fontFamily:"'JetBrains Mono',monospace", textAlign:"center", maxWidth:340, lineHeight:1.7 }}>
        Somente usuários com acesso à planilha da empresa conseguem visualizar os dados.
      </div>
    </div>
  );
}
