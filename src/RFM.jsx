import { useState, useMemo } from "react";
import { useBreakpoint } from "./useBreakpoint";

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtN = (v) => new Intl.NumberFormat("pt-BR").format(v || 0);

function parseValue(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/R\$\s*/gi,"").replace(/\s+/g,"").replace(/\./g,"").replace(",",".")) || 0;
}
function parseDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) { let[,d,mo,y]=m1; if(y.length===2)y="20"+y; return new Date(+y,+mo-1,+d); }
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m2) { let[,d,mo,y]=m2; if(y.length===2)y="20"+y; return new Date(+y,+mo-1,+d); }
  const m3 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m3) { const[,y,mo,d]=m3; return new Date(+y,+mo-1,+d); }
  const fb = new Date(s); return isNaN(fb) ? null : fb;
}
function quintileScore(sortedAsc, val) {
  if (!sortedAsc.length) return 1;
  const idx = sortedAsc.findIndex(v => v >= val);
  const pct = idx === -1 ? 1 : idx / sortedAsc.length;
  return Math.min(5, Math.ceil(pct * 5) || 1);
}
const SEG = {
  "VIP":         { color:"#7c2d12", bg:"#fef3c7", icon:"👑", desc:"Alta frequência e valor, ativos nos últimos 6 meses" },
  "Leais":       { color:"#1e3a5f", bg:"#dbeafe", icon:"⭐", desc:"Compram bem e com frequência, base sólida" },
  "Novos":       { color:"#065f46", bg:"#a7f3d0", icon:"✨", desc:"Compraram recentemente, ainda nas primeiras compras" },
  "Ocasionais":  { color:"#374151", bg:"#f3f4f6", icon:"🔵", desc:"Ativos, mas com baixa frequência ou valor" },
  "Em Risco":    { color:"#991b1b", bg:"#fee2e2", icon:"⚠️", desc:"Sem comprar entre 6 meses e 1 ano" },
  "Adormecidos": { color:"#92400e", bg:"#fde68a", icon:"😴", desc:"Sem comprar entre 1 e 2 anos" },
  "Perdidos":    { color:"#4b0082", bg:"#ede9fe", icon:"💀", desc:"Mais de 2 anos sem atividade" },
};
function exportCSV(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(";"),
    ...rows.map(row => headers.map(h => `"${String(row[h]??"").replace(/"/g,'""')}"`).join(";"))
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}
function findKey(r, ...parts) {
  for (const p of parts) { const k = Object.keys(r).find(k => k.includes(p)); if (k) return k; }
  return null;
}
function toExportRow(c) {
  return {
    ...c.raw,
    "rfm_segmento": c.segment,
    "rfm_score_r": c.rScore,
    "rfm_score_f": c.fScore,
    "rfm_score_m": c.mScore,
    "rfm_score": `${c.rScore}${c.fScore}${c.mScore}`,
    "rfm_ultima_compra": c.lastOrder ? c.lastOrder.toLocaleDateString("pt-BR") : "",
    "rfm_dias_sem_comprar": c.recency < 9999 ? c.recency : "",
    "rfm_total_pedidos": c.orders,
    "rfm_total_gasto": c.total.toFixed(2).replace(".",","),
  };
}
const REACTIVATION_RATES = { "Em Risco": 0.45, "Adormecidos": 0.22, "Perdidos": 0.07 };
const INACTIVE_SEGS = ["Em Risco", "Adormecidos", "Perdidos"];

const STRATEGIES = {
  "Em Risco": {
    urgency: "Alta", urgencyColor: "#991b1b", urgencyBg: "#fee2e2",
    title: "Campanha de Reativação",
    objective: "Recuperar clientes antes que se tornem adormecidos. Janela de oportunidade: 180–365 dias.",
    channels: ["📧 E-mail personalizado", "💬 WhatsApp (clientes VIP)", "📱 SMS"],
    offer: "Desconto de 10–15% ou frete grátis na próxima compra",
    timing: "Enviar em até 7 dias — urgência moderada",
    message: `Olá [NOME] 👋

Sentimos a sua falta! Faz um tempo desde sua última visita e gostaríamos de te trazer de volta.

Preparamos uma oferta especial só para você:
👉 [OFERTA] — válida até [DATA]

Use o código: VOLTEI15

Clique aqui para aproveitar: [LINK]

Qualquer dúvida, é só responder esta mensagem.
Equipe [EMPRESA]`,
    kpis: ["Abertura e-mail: 25–35%", "Cliques: 8–12%", "Conversão: 3–8%", "ROI médio: 8–15x"],
  },
  "Adormecidos": {
    urgency: "Média", urgencyColor: "#92400e", urgencyBg: "#fde68a",
    title: "Campanha Win-Back",
    objective: "Reativar clientes que não compram há 1–2 anos. Custo de reativação menor que aquisição.",
    channels: ["📧 Série de 3 e-mails (7/14/21 dias)", "🎯 Retargeting Meta/Google Ads"],
    offer: "Desconto de 20–25% ou brinde exclusivo na compra",
    timing: "Série de 3 e-mails ao longo de 3 semanas",
    message: `[NOME], tudo bem? 😊

Percebemos que faz um tempo desde sua última compra e queríamos entrar em contato.

Preparamos algo especial para te reconquistar:
🎁 [OFERTA] — exclusivo para clientes especiais como você

Código: WINBACK20
Válido por 15 dias: [LINK]

Sentiremos sua falta caso não nos veja por aqui!
Equipe [EMPRESA]`,
    kpis: ["Abertura e-mail: 15–25%", "Cliques: 4–8%", "Conversão: 1–4%", "ROI médio: 4–8x"],
  },
  "Perdidos": {
    urgency: "Baixa", urgencyColor: "#4b0082", urgencyBg: "#ede9fe",
    title: "Last Chance + Supressão",
    objective: "Última tentativa de reativação. Se sem resposta, remover de campanhas pagas para reduzir CPL.",
    channels: ["📧 1 único e-mail (low cost)", "🚫 Supressão em mídia paga"],
    offer: "Maior desconto possível (30%+) ou nova proposta de valor",
    timing: "1 disparo único. Sem resposta em 30 dias → mover para lista de supressão",
    message: `[NOME], uma última mensagem...

Sabemos que faz muito tempo. Antes de encerrar nosso contato, queremos fazer uma oferta que nunca fizemos antes:

💥 [OFERTA] — nosso maior desconto de todos os tempos

Válido por apenas 7 dias: [LINK]
Código: VOLTAFINAL

Se não for o momento certo, tudo bem — guardamos boas memórias da nossa jornada juntos. 💙
Equipe [EMPRESA]`,
    kpis: ["Abertura e-mail: 8–15%", "Cliques: 2–5%", "Conversão: 0.5–2%", "ROI médio: 2–4x"],
  },
};

function classify(r, f, m, days) {
  // Segmentação baseada em tempo absoluto (prioridade máxima)
  if (days > 730) return "Perdidos";     // +2 anos sem comprar
  if (days > 365) return "Adormecidos"; // 1–2 anos sem comprar
  if (days > 180) return "Em Risco";    // 6–12 meses sem comprar
  // Clientes ativos (últimos 6 meses) — classificação por score
  if (f >= 4 && m >= 4) return "VIP";          // frequência e valor altos
  if (f >= 3 && m >= 3) return "Leais";        // frequência e valor bons
  if (f <= 2 && days <= 90) return "Novos";    // recém chegados, poucas compras
  return "Ocasionais";                          // ativos mas baixa frequência/valor
}

export default function RFM({ norm, valid, fileName, onReset }) {
  const { isMobile, isTablet } = useBreakpoint();
  const [activeSegFilter, setActiveSegFilter] = useState(null);
  const [sortCol, setSortCol] = useState("rfm");
  const [selectedClient, setSelectedClient] = useState(null);
  const [activeTab, setActiveTab] = useState("analise");
  const [copiedMsg, setCopiedMsg] = useState(null);

  const rfm = useMemo(() => {
    if (!valid.length) return null;
    const now = new Date();
    const cMap = {};
    valid.forEach(r => {
      const ck  = Object.keys(r).find(k=>k.includes("codigo")||k.includes("cliente"));
      const nk  = Object.keys(r).find(k=>k.includes("nome"));
      const dk  = Object.keys(r).find(k=>k.includes("data"));
      const vk  = Object.keys(r).find(k=>k.includes("valor"))||Object.keys(r).find(k=>k.includes("total"));
      const cid = ck ? r[ck] : (nk ? r[nk] : "?");
      const val = parseValue(vk ? r[vk] : 0);
      const d   = dk ? parseDate(r[dk]) : null;
      if (!cMap[cid]) cMap[cid] = { id: cid, name: nk?r[nk]:cid, total:0, orders:0, lastOrder:null, raw:{} };
      cMap[cid].total  += val;
      cMap[cid].orders += 1;
      if (d&&!isNaN(d) && (!cMap[cid].lastOrder || d>cMap[cid].lastOrder)) cMap[cid].lastOrder = d;
      // Coleta campos brutos do CSV (preenche na primeira ocorrência não-vazia)
      Object.entries(r).forEach(([k,v]) => { if (v != null && v !== "" && !cMap[cid].raw[k]) cMap[cid].raw[k] = v; });
    });
    const clients = Object.values(cMap);
    const daysSince = d => d ? Math.floor((now-d)/86400000) : 9999;
    const rValsAsc = [...clients.map(c=>daysSince(c.lastOrder))].sort((a,b)=>a-b);
    const fValsAsc = [...clients.map(c=>c.orders)].sort((a,b)=>a-b);
    const mValsAsc = [...clients.map(c=>c.total)].sort((a,b)=>a-b);
    const scored = clients.map(c => {
      const rec = daysSince(c.lastOrder);
      const rScore = 6 - quintileScore(rValsAsc, rec);
      const fScore = quintileScore(fValsAsc, c.orders);
      const mScore = quintileScore(mValsAsc, c.total);
      const segment = classify(rScore, fScore, mScore, rec);
      return { ...c, recency: rec, rScore, fScore, mScore, rfmScore: rScore*100+fScore*10+mScore, segment };
    });
    const segMap = {};
    scored.forEach(c => {
      if (!segMap[c.segment]) segMap[c.segment] = { count:0, revenue:0 };
      segMap[c.segment].count++;
      segMap[c.segment].revenue += c.total;
    });
    const segments = Object.entries(segMap)
      .map(([name,d]) => ({ name, ...d, avgTicket: d.count?d.revenue/d.count:0 }))
      .sort((a,b)=>b.revenue-a.revenue);
    const heatmap = Array.from({length:5},(_,ri)=>
      Array.from({length:5},(_,fi)=>{
        const r=5-ri, f=fi+1;
        return scored.filter(c=>c.rScore===r&&c.fScore===f).length;
      })
    );
    const maxHeat = Math.max(...heatmap.flat(), 1);
    return { scored, segments, heatmap, maxHeat, total: clients.length };
  }, [valid]);

  const displayed = useMemo(() => {
    if (!rfm) return [];
    let list = activeSegFilter ? rfm.scored.filter(c=>c.segment===activeSegFilter) : rfm.scored;
    if (sortCol==="rfm")     list = [...list].sort((a,b)=>b.rfmScore-a.rfmScore);
    if (sortCol==="revenue") list = [...list].sort((a,b)=>b.total-a.total);
    if (sortCol==="recency") list = [...list].sort((a,b)=>a.recency-b.recency);
    return list.slice(0,200);
  }, [rfm, activeSegFilter, sortCol]);

  const clientOrders = useMemo(() => {
    if (!selectedClient || !norm.length) return [];
    return norm.filter(r => {
      const ck = findKey(r, "codigo", "cliente");
      const nk = findKey(r, "nome");
      const id = ck ? r[ck] : (nk ? r[nk] : "?");
      return id === selectedClient.id;
    }).sort((a, b) => {
      const dk = findKey(a, "data");
      const da = dk ? parseDate(a[dk]) : null;
      const db = dk ? parseDate(b[dk]) : null;
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
      return db - da;
    });
  }, [selectedClient, norm]);

  const clientDetail = useMemo(() => {
    if (!clientOrders.length) return null;
    let email=null, phone=null, city=null, state=null, gender=null, personType=null;
    for (const r of clientOrders) {
      const ek=findKey(r,"email"), tk=findKey(r,"telefone"), ck2=findKey(r,"cidade");
      const ek2=findKey(r,"estado"), sk=findKey(r,"sexo"), tpk=findKey(r,"tipo");
      if(!email&&ek&&r[ek]?.trim())email=r[ek].trim();
      if(!phone&&tk&&r[tk]?.trim())phone=r[tk].trim();
      if(!city&&ck2&&r[ck2]?.trim())city=r[ck2].trim();
      if(!state&&ek2&&r[ek2]?.trim())state=r[ek2].trim();
      if(!gender&&sk&&r[sk]?.trim())gender=r[sk].trim();
      if(!personType&&tpk&&r[tpk]?.trim())personType=r[tpk].trim();
    }
    const dates = clientOrders
      .map(r => { const dk=findKey(r,"data"); return dk?parseDate(r[dk]):null; })
      .filter(d => d&&!isNaN(d)).sort((a,b)=>a-b);
    let avgDays = null;
    if (dates.length >= 2) {
      const gaps = []; for (let i=1;i<dates.length;i++) gaps.push((dates[i]-dates[i-1])/86400000);
      avgDays = Math.round(gaps.reduce((s,g)=>s+g,0)/gaps.length);
    }
    return { email, phone, city, state, gender, personType, avgDays, first:dates[0]||null, last:dates[dates.length-1]||null };
  }, [clientOrders]);

  const recovery = useMemo(() => {
    if (!rfm) return null;
    const inactives = rfm.scored.filter(c => INACTIVE_SEGS.includes(c.segment));
    const withPotential = inactives.map(c => {
      const avgTicket = c.orders > 0 ? c.total / c.orders : 0;
      const rate = REACTIVATION_RATES[c.segment] || 0;
      return { ...c, avgTicket, recoveryRate: rate, recoveryPotential: avgTicket * rate };
    }).sort((a, b) => b.recoveryPotential - a.recoveryPotential);

    const bySegment = INACTIVE_SEGS.map(seg => {
      const clients = withPotential.filter(c => c.segment === seg);
      const avgTicket = clients.length ? clients.reduce((s, c) => s + c.avgTicket, 0) / clients.length : 0;
      const totalPotential = clients.reduce((s, c) => s + c.recoveryPotential, 0);
      return { segment: seg, count: clients.length, avgTicket, totalPotential, rate: REACTIVATION_RATES[seg] };
    });

    const totalPotential = bySegment.reduce((s, b) => s + b.totalPotential, 0);
    const actionable = bySegment.slice(0, 2).reduce((s, b) => s + b.count, 0);
    const totalInactiveRevenue = inactives.reduce((s, c) => s + c.total, 0);
    return { withPotential, bySegment, totalPotential, actionable, totalInactiveRevenue, totalInactive: inactives.length };
  }, [rfm]);

  const ScoreBox = ({ v }) => (
    <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:28, height:28, borderRadius:6, fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, background:`rgba(26,26,46,${v*0.18})`, color: v>=4?"#fff":"#444" }}>{v}</span>
  );

  if (!rfm) return <div style={{padding:60,textAlign:"center",fontFamily:"'Inter',sans-serif",color:"#aaa"}}>Sem dados para calcular RFM.</div>;

  return (
    <div style={{ minHeight:"100vh", background:"#faf9f7", fontFamily:"'Inter',sans-serif" }}>
      <div style={{ background:"#1a1a2e", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", padding:isMobile?"0 16px":"0 36px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <span style={{ fontFamily:"'Outfit',sans-serif", fontSize:isMobile?15:18, color:"#fff", fontWeight:600 }}>RFM</span>
          <div style={{ display:"flex", gap:2 }}>
            {[{id:"analise",label:"Análise"},{id:"recuperacao",label:isMobile?"Recup.":"Recuperação"}].map(t=>(
              <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{ background:activeTab===t.id?"#ffffff18":"transparent", border:"none", color:activeTab===t.id?"#fff":"#ffffff55", padding:"7px 14px", borderRadius:8, cursor:"pointer", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:activeTab===t.id?500:400 }}>{t.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:20, alignItems:"center" }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#ffffff60" }}>
            {fmtN(rfm.total)} clientes · {fmtN(valid.length)} pedidos válidos
          </span>
          <button onClick={onReset} style={{ background:"transparent", border:"1px solid #ffffff30", color:"#ffffff60", padding:"5px 14px", borderRadius:8, cursor:"pointer", fontSize:12, fontFamily:"'JetBrains Mono',monospace" }}>
            Trocar arquivo
          </button>
        </div>
      </div>
      <div style={{ padding:isMobile?"16px 12px 100px":isTablet?"24px 20px 100px":"36px 36px 100px", maxWidth:1300, margin:"0 auto" }}>
        {activeTab === "analise" && <>
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":isTablet?"repeat(2,1fr)":"repeat(3,1fr)", gap:14, marginBottom:28 }}>
          {rfm.segments.map(seg => {
            const cfg = SEG[seg.name]||{color:"#374151",bg:"#f3f4f6",icon:"●"};
            const pct = rfm.total?(seg.count/rfm.total*100).toFixed(1):0;
            const active = activeSegFilter===seg.name;
            return (
              <div key={seg.name} onClick={()=>setActiveSegFilter(active?null:seg.name)} style={{ background:"#fff", border:`1.5px solid ${active?"#1a1a2e":"#e8e4de"}`, borderRadius:14, padding:"20px 20px", cursor:"pointer", boxShadow: active?"0 4px 20px rgba(0,0,0,0.1)":"0 1px 3px rgba(0,0,0,0.05)", position:"relative", overflow:"hidden", transition:"all 0.15s" }}>
                <div style={{ position:"absolute", top:0, right:0, width:70, height:70, borderRadius:"0 14px 0 70px", background:cfg.bg, display:"flex", alignItems:"flex-start", justifyContent:"flex-end", padding:"8px 10px", fontSize:20 }}>{cfg.icon}</div>
                <div style={{ display:"inline-block", background:cfg.bg, color:cfg.color, borderRadius:20, padding:"2px 10px", fontSize:10, fontFamily:"'JetBrains Mono',monospace", fontWeight:600, letterSpacing:"0.04em", marginBottom:10 }}>{seg.name}</div>
                <div style={{ fontSize:30, fontFamily:"'Outfit',sans-serif", fontWeight:700, color:"#1a1a2e", lineHeight:1 }}>{fmtN(seg.count)}</div>
                <div style={{ fontSize:11, color:"#bbb", fontFamily:"'JetBrains Mono',monospace", marginTop:2, marginBottom:12 }}>{pct}% dos clientes</div>
                <div style={{ height:1, background:"#f0ede8", marginBottom:10 }}/>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:10, color:"#bbb", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>Receita</div>
                    <div style={{ fontSize:13, fontFamily:"'JetBrains Mono',monospace", fontWeight:600, color:"#1a1a2e", marginTop:2 }}>{fmt(seg.revenue)}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:10, color:"#bbb", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>Ticket Médio</div>
                    <div style={{ fontSize:13, fontFamily:"'JetBrains Mono',monospace", fontWeight:600, color:"#1a1a2e", marginTop:2 }}>{fmt(seg.avgTicket)}</div>
                  </div>
                </div>
                <button
                  onClick={e=>{
                    e.stopPropagation();
                    const rows = rfm.scored.filter(c=>c.segment===seg.name).map(toExportRow);
                    const slug = seg.name.toLowerCase().replace(/\s+/g,"-");
                    exportCSV(rows, `rfm-${slug}-${new Date().toISOString().slice(0,10)}.csv`);
                  }}
                  style={{ marginTop:10, width:"100%", padding:"6px 0", background:"#f0ede8", border:"none", borderRadius:8, cursor:"pointer", fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#666" }}
                >
                  ↓ exportar CSV
                </button>
                {active && <div style={{ position:"absolute", bottom:0, left:0, width:"100%", height:3, background:"#1a1a2e", borderRadius:"0 0 14px 14px" }}/>}
              </div>
            );
          })}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:20, marginBottom:28 }}>
          <div style={{ background:"#fff", border:"1px solid #e8e4de", borderRadius:16, padding:28, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:17, fontWeight:600, color:"#1a1a2e", marginBottom:4 }}>Mapa de Calor R × F</div>
            <div style={{ fontSize:11, color:"#bbb", fontFamily:"'JetBrains Mono',monospace", marginBottom:20 }}>Recência (Y) vs Frequência (X) · número de clientes por célula</div>
            <div style={{ display:"flex", gap:10 }}>
              <div style={{ writingMode:"vertical-rl", transform:"rotate(180deg)", fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", alignSelf:"center" }}>Recência ↑</div>
              <div style={{ flex:1 }}>
                <div style={{ display:"grid", gridTemplateColumns:"24px repeat(5,1fr)", gap:4, marginBottom:4 }}>
                  <div/>
                  {[1,2,3,4,5].map(f=>(<div key={f} style={{ textAlign:"center", fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#bbb" }}>F{f}</div>))}
                </div>
                {rfm.heatmap.map((row,ri)=>{
                  const rLabel=5-ri;
                  return (
                    <div key={ri} style={{ display:"grid", gridTemplateColumns:"24px repeat(5,1fr)", gap:4, marginBottom:4 }}>
                      <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#bbb", textAlign:"right", alignSelf:"center", paddingRight:4 }}>R{rLabel}</div>
                      {row.map((val,fi)=>{
                        const posScore = rLabel + (fi + 1);
                        const hue = Math.round(((posScore - 2) / 8) * 120);
                        const countRatio = rfm.maxHeat > 0 ? val / rfm.maxHeat : 0;
                        const sat = val > 0 ? 55 + Math.round(countRatio * 30) : 0;
                        const light = val > 0 ? 88 - Math.round(countRatio * 45) : 97;
                        const textColor = light < 60 ? "#fff" : (light < 78 ? "#333" : "#aaa");
                        return (
                          <div key={fi} title={`R${rLabel} F${fi+1}: ${val} clientes`} style={{ background:`hsl(${hue}, ${sat}%, ${light}%)`, borderRadius:8, minHeight:40, display:"flex", alignItems:"center", justifyContent:"center", fontSize:val>0?12:10, fontFamily:"'JetBrains Mono',monospace", color:textColor, fontWeight:600 }}>
                            {val>0?val:"·"}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                <div style={{ textAlign:"center", fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#bbb", marginTop:6 }}>Frequência →</div>
              </div>
            </div>
          </div>
          <div style={{ background:"#fff", border:"1px solid #e8e4de", borderRadius:16, padding:28, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:17, fontWeight:600, color:"#1a1a2e", marginBottom:4 }}>Como os Scores Funcionam</div>
            <div style={{ fontSize:11, color:"#bbb", fontFamily:"'JetBrains Mono',monospace", marginBottom:20 }}>Cada dimensão é pontuada de 1 a 5 por quintil</div>
            {[
              { label:"R — Recência",    desc:"Dias desde a última compra. Score 5 = comprou recentemente.", ex:"Score 5 = top 20% mais recentes" },
              { label:"F — Frequência",  desc:"Número total de pedidos realizados.", ex:"Score 5 = top 20% mais frequentes" },
              { label:"M — Monetário",   desc:"Valor total gasto pelo cliente.", ex:"Score 5 = top 20% maiores gastadores" },
            ].map(item=>(
              <div key={item.label} style={{ padding:"14px 16px", background:"#faf9f7", borderRadius:10, border:"1px solid #f0ede8", marginBottom:10 }}>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:600, color:"#1a1a2e", marginBottom:4 }}>{item.label}</div>
                <div style={{ fontSize:12, color:"#666", marginBottom:4 }}>{item.desc}</div>
                <div style={{ fontSize:11, color:"#aaa", fontFamily:"'JetBrains Mono',monospace" }}>{item.ex}</div>
              </div>
            ))}
            <div style={{ padding:"12px 14px", background:"#faf9f7", borderRadius:10, border:"1px solid #f0ede8", marginTop:4 }}>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:600, color:"#1a1a2e", marginBottom:8 }}>🗂️ Lógica dos 7 segmentos</div>
              {[
                { seg:"👑 VIP",         rule:"Ativos ≤180d · F≥4 e M≥4",        action:"Programa de fidelidade, relacionamento direto" },
                { seg:"⭐ Leais",        rule:"Ativos ≤180d · F≥3 e M≥3",        action:"Upsell, manter engajamento" },
                { seg:"✨ Novos",        rule:"Ativos ≤90d · F≤2 compras",        action:"Sequência pós-primeira compra" },
                { seg:"🔵 Ocasionais",   rule:"Ativos ≤180d · baixo F ou M",      action:"Estimular frequência, promoções" },
                { seg:"⚠️ Em Risco",     rule:"180–365 dias sem comprar",          action:"Campanha de reativação ativa" },
                { seg:"😴 Adormecidos",  rule:"365–730 dias sem comprar",          action:"Win-back de última chance" },
                { seg:"💀 Perdidos",     rule:"730+ dias sem comprar",             action:"Suppression ou campanha low-cost" },
              ].map(item=>(
                <div key={item.seg} style={{ display:"flex", flexDirection:"column", padding:"6px 0", borderBottom:"1px solid #f0ede8" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:600, color:"#1a1a2e" }}>{item.seg}</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#aaa" }}>{item.rule}</span>
                  </div>
                  <span style={{ fontSize:10, color:"#888", marginTop:1 }}>{item.action}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#bbb", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>Escala visual</div>
              <div style={{ display:"flex", gap:6 }}>
                {[1,2,3,4,5].map(s=>{
                  const hue = Math.round(((s-1)/4)*120);
                  const light = Math.round(88-(s/5)*45);
                  return <div key={s} style={{ flex:1, height:36, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", background:`hsl(${hue}, 70%, ${light}%)`, color:light<60?"#fff":"#333", fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:14 }}>{s}</div>;
                })}
              </div>
            </div>
          </div>
        </div>
        <div style={{ background:"#fff", border:"1px solid #e8e4de", borderRadius:16, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ padding:"20px 28px", borderBottom:"1px solid #f0ede8", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <div>
              <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:17, fontWeight:600, color:"#1a1a2e" }}>
                {activeSegFilter ? `Segmento: ${activeSegFilter}` : "Todos os Clientes"}
                {activeSegFilter && (
                  <button onClick={()=>setActiveSegFilter(null)} style={{ marginLeft:12, fontSize:11, fontFamily:"'JetBrains Mono',monospace", background:"#f0ede8", border:"none", borderRadius:20, padding:"2px 10px", cursor:"pointer", color:"#666" }}>× Limpar filtro</button>
                )}
              </div>
              <div style={{ fontSize:11, color:"#bbb", fontFamily:"'JetBrains Mono',monospace", marginTop:3 }}>{fmtN(displayed.length)} clientes exibidos</div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {[["rfm","Score RFM"],["revenue","Maior Gasto"],["recency","Mais Recente"]].map(([id,label])=>(
                <button key={id} onClick={()=>setSortCol(id)} style={{ padding:"7px 14px", borderRadius:20, cursor:"pointer", fontSize:12, fontFamily:"'JetBrains Mono',monospace", background: sortCol===id?"#1a1a2e":"#f5f2ee", color: sortCol===id?"#fff":"#666", border:"none" }}>{label}</button>
              ))}
              <button
                onClick={()=>{
                  const list = activeSegFilter ? rfm.scored.filter(c=>c.segment===activeSegFilter) : rfm.scored;
                  const slug = activeSegFilter ? activeSegFilter.toLowerCase().replace(/\s+/g,"-") : "todos";
                  exportCSV(list.map(toExportRow), `rfm-${slug}-${new Date().toISOString().slice(0,10)}.csv`);
                }}
                style={{ padding:"7px 16px", borderRadius:20, cursor:"pointer", fontSize:12, fontFamily:"'JetBrains Mono',monospace", background:"#2d6a4f", color:"#fff", border:"none", fontWeight:500 }}
              >
                ↓ Exportar CSV
              </button>
            </div>
          </div>
          <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#faf9f7", borderBottom:"1px solid #e8e4de" }}>
                  {["Cliente","Segmento","R","F","M","Score","Últ. Compra","Pedidos","Total Gasto"].map(h=>(
                    <th key={h} style={{ padding:"11px 16px", textAlign:"left", fontSize:10, fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.1em", color:"#aaa", textTransform:"uppercase", fontWeight:500, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((c,i)=>{
                  const cfg=SEG[c.segment]||{color:"#374151",bg:"#f3f4f6"};
                  return (
                    <tr key={c.id+i} style={{ borderBottom:"1px solid #f5f2ee", cursor:"pointer" }} onClick={()=>setSelectedClient(c)} onMouseEnter={e=>e.currentTarget.style.background="#faf9f7"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{ padding:"11px 16px" }}>
                        <div style={{ fontWeight:500, color:"#1a1a2e", fontSize:14 }}>{c.name}</div>
                        <div style={{ fontSize:10, color:"#ccc", fontFamily:"'JetBrains Mono',monospace" }}>{c.id}</div>
                      </td>
                      <td style={{ padding:"11px 16px" }}>
                        <span style={{ background:cfg.bg, color:cfg.color, borderRadius:20, padding:"3px 10px", fontSize:11, fontFamily:"'JetBrains Mono',monospace", fontWeight:600, whiteSpace:"nowrap" }}>
                          {SEG[c.segment]?.icon} {c.segment}
                        </span>
                      </td>
                      <td style={{ padding:"11px 16px" }}><ScoreBox v={c.rScore}/></td>
                      <td style={{ padding:"11px 16px" }}><ScoreBox v={c.fScore}/></td>
                      <td style={{ padding:"11px 16px" }}><ScoreBox v={c.mScore}/></td>
                      <td style={{ padding:"11px 16px" }}>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color:"#1a1a2e" }}>{c.rScore}{c.fScore}{c.mScore}</span>
                      </td>
                      <td style={{ padding:"11px 16px" }}>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#555" }}>{c.lastOrder?c.lastOrder.toLocaleDateString("pt-BR"):"—"}</div>
                        <div style={{ fontSize:10, color:"#bbb", fontFamily:"'JetBrains Mono',monospace" }}>{c.recency<9999?c.recency+" dias":"—"}</div>
                      </td>
                      <td style={{ padding:"11px 16px", fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:"#666" }}>{c.orders}</td>
                      <td style={{ padding:"11px 16px", fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:600, color:"#1a1a2e" }}>{fmt(c.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rfm.scored.length > 200 && (
            <div style={{ padding:"14px", textAlign:"center", fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#bbb", borderTop:"1px solid #f0ede8" }}>
              Mostrando 200 de {fmtN(rfm.scored.length)} clientes
            </div>
          )}
        </div>
        </>}

        {activeTab === "recuperacao" && recovery && <>
          {/* Summary KPIs */}
          <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)", gap:14, marginBottom:24 }}>
            {[
              { label:"Potencial de Recuperação", value:fmt(recovery.totalPotential), sub:`estimativa conservadora — taxa média ponderada`, accent:"#2d6a4f" },
              { label:"Clientes Acionáveis", value:fmtN(recovery.actionable), sub:`Em Risco + Adormecidos (excl. Perdidos)`, accent:"#e76f51" },
              { label:"Receita Histórica Inativa", value:fmt(recovery.totalInactiveRevenue), sub:`${fmtN(recovery.totalInactive)} clientes sem comprar`, accent:"#457b9d" },
            ].map(k=>(
              <div key={k.label} style={{ background:"#fff", border:"1px solid #e8e4de", borderRadius:14, padding:"22px 20px", position:"relative", overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
                <div style={{ position:"absolute", top:0, left:0, width:4, height:"100%", background:k.accent, borderRadius:"14px 0 0 14px" }}/>
                <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.12em", color:"#aaa", textTransform:"uppercase", marginBottom:6 }}>{k.label}</div>
                <div style={{ fontSize:26, fontFamily:"'Outfit',sans-serif", fontWeight:700, color:"#1a1a2e", lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:11, color:"#bbb", fontFamily:"'JetBrains Mono',monospace", marginTop:4 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* By Segment */}
          <div style={{ background:"#fff", border:"1px solid #e8e4de", borderRadius:14, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", marginBottom:24 }}>
            <div style={{ padding:"20px 24px", borderBottom:"1px solid #f0ede8" }}>
              <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:17, fontWeight:600, color:"#1a1a2e" }}>Potencial por Segmento</div>
              <div style={{ fontSize:11, color:"#bbb", fontFamily:"'JetBrains Mono',monospace", marginTop:3 }}>Taxa de reativação estimada baseada em benchmarks de e-commerce B2C</div>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"#faf9f7", borderBottom:"1px solid #e8e4de" }}>
                    {["Segmento","Clientes","Ticket Médio","Taxa Reativ.","Potencial Estimado",""].map(h=>(
                      <th key={h} style={{ padding:"11px 18px", textAlign:"left", fontSize:10, fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.1em", color:"#aaa", textTransform:"uppercase", fontWeight:500, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recovery.bySegment.map(row => {
                    const cfg = SEG[row.segment] || { color:"#374151", bg:"#f3f4f6", icon:"●" };
                    const pct = recovery.totalPotential ? (row.totalPotential / recovery.totalPotential * 100).toFixed(0) : 0;
                    return (
                      <tr key={row.segment} style={{ borderBottom:"1px solid #f5f2ee" }}>
                        <td style={{ padding:"14px 18px" }}>
                          <span style={{ background:cfg.bg, color:cfg.color, borderRadius:20, padding:"3px 12px", fontSize:12, fontFamily:"'JetBrains Mono',monospace", fontWeight:600, whiteSpace:"nowrap" }}>
                            {cfg.icon} {row.segment}
                          </span>
                        </td>
                        <td style={{ padding:"14px 18px", fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:600, color:"#1a1a2e" }}>{fmtN(row.count)}</td>
                        <td style={{ padding:"14px 18px", fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:"#555" }}>{fmt(row.avgTicket)}</td>
                        <td style={{ padding:"14px 18px" }}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color:"#2d6a4f" }}>{(row.rate * 100).toFixed(0)}%</span>
                        </td>
                        <td style={{ padding:"14px 18px" }}>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700, color:"#1a1a2e" }}>{fmt(row.totalPotential)}</div>
                          <div style={{ height:4, background:"#f0ede8", borderRadius:2, marginTop:4, width:120 }}>
                            <div style={{ width:pct+"%", height:"100%", background:cfg.color, borderRadius:2 }}/>
                          </div>
                        </td>
                        <td style={{ padding:"14px 18px" }}>
                          <button onClick={() => {
                            const clients = recovery.withPotential.filter(c => c.segment === row.segment);
                            const rows = clients.map(c => ({
                              Nome: c.name, ID: c.id, Segmento: c.segment,
                              "Dias Inativo": c.recency < 9999 ? c.recency : "",
                              "Última Compra": c.lastOrder ? c.lastOrder.toLocaleDateString("pt-BR") : "",
                              "Total Histórico": c.total.toFixed(2).replace(".",","),
                              "Ticket Médio": c.avgTicket.toFixed(2).replace(".",","),
                              "Potencial Recuperação": c.recoveryPotential.toFixed(2).replace(".",","),
                              Email: c.raw ? (Object.entries(c.raw).find(([k])=>k.includes("email"))?.[1] || "") : "",
                              Telefone: c.raw ? (Object.entries(c.raw).find(([k])=>k.includes("telefone"))?.[1] || "") : "",
                            }));
                            exportCSV(rows, `recuperacao-${row.segment.toLowerCase().replace(/\s+/g,"-")}-${new Date().toISOString().slice(0,10)}.csv`);
                          }} style={{ padding:"6px 14px", background:"#1a1a2e", border:"none", borderRadius:8, cursor:"pointer", fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#fff" }}>
                            ↓ Exportar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Recovery Targets */}
          <div style={{ background:"#fff", border:"1px solid #e8e4de", borderRadius:14, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.04)", marginBottom:24 }}>
            <div style={{ padding:"20px 24px", borderBottom:"1px solid #f0ede8", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:17, fontWeight:600, color:"#1a1a2e" }}>Top Clientes por Potencial de Recuperação</div>
                <div style={{ fontSize:11, color:"#bbb", fontFamily:"'JetBrains Mono',monospace", marginTop:3 }}>Ranqueados por ticket médio × taxa de reativação do segmento</div>
              </div>
              <button onClick={() => {
                exportCSV(recovery.withPotential.slice(0,200).map(c => ({
                  Nome: c.name, ID: c.id, Segmento: c.segment,
                  "Dias Inativo": c.recency < 9999 ? c.recency : "",
                  "Última Compra": c.lastOrder ? c.lastOrder.toLocaleDateString("pt-BR") : "",
                  "Total Histórico": c.total.toFixed(2).replace(".",","),
                  "Ticket Médio": c.avgTicket.toFixed(2).replace(".",","),
                  "Potencial Recuperação": c.recoveryPotential.toFixed(2).replace(".",","),
                  Email: c.raw ? (Object.entries(c.raw).find(([k])=>k.includes("email"))?.[1] || "") : "",
                  Telefone: c.raw ? (Object.entries(c.raw).find(([k])=>k.includes("telefone"))?.[1] || "") : "",
                })), `recuperacao-todos-${new Date().toISOString().slice(0,10)}.csv`);
              }} style={{ padding:"8px 18px", background:"#2d6a4f", border:"none", borderRadius:10, cursor:"pointer", fontSize:12, fontFamily:"'JetBrains Mono',monospace", color:"#fff", fontWeight:500 }}>
                ↓ Exportar todos
              </button>
            </div>
            <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"#faf9f7", borderBottom:"1px solid #e8e4de" }}>
                    {["#","Cliente","Segmento","Inativo há","Ticket Médio","Potencial"].map(h=>(
                      <th key={h} style={{ padding:"11px 16px", textAlign:"left", fontSize:10, fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.1em", color:"#aaa", textTransform:"uppercase", fontWeight:500, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recovery.withPotential.slice(0, 50).map((c, i) => {
                    const cfg = SEG[c.segment] || { color:"#374151", bg:"#f3f4f6", icon:"●" };
                    return (
                      <tr key={c.id+i} style={{ borderBottom:"1px solid #f5f2ee", cursor:"pointer" }} onClick={()=>setSelectedClient(c)} onMouseEnter={e=>e.currentTarget.style.background="#faf9f7"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <td style={{ padding:"11px 16px", fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#ccc" }}>#{i+1}</td>
                        <td style={{ padding:"11px 16px" }}>
                          <div style={{ fontWeight:500, color:"#1a1a2e", fontSize:14 }}>{c.name}</div>
                          <div style={{ fontSize:10, color:"#ccc", fontFamily:"'JetBrains Mono',monospace" }}>{c.id}</div>
                        </td>
                        <td style={{ padding:"11px 16px" }}>
                          <span style={{ background:cfg.bg, color:cfg.color, borderRadius:20, padding:"3px 10px", fontSize:11, fontFamily:"'JetBrains Mono',monospace", fontWeight:600, whiteSpace:"nowrap" }}>
                            {cfg.icon} {c.segment}
                          </span>
                        </td>
                        <td style={{ padding:"11px 16px" }}>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color: c.recency > 365 ? "#991b1b" : "#e76f51" }}>{c.recency < 9999 ? c.recency+"d" : "—"}</div>
                          <div style={{ fontSize:10, color:"#bbb", fontFamily:"'JetBrains Mono',monospace" }}>{c.lastOrder ? c.lastOrder.toLocaleDateString("pt-BR") : "—"}</div>
                        </td>
                        <td style={{ padding:"11px 16px", fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:"#555" }}>{fmt(c.avgTicket)}</td>
                        <td style={{ padding:"11px 16px" }}>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700, color:"#2d6a4f" }}>{fmt(c.recoveryPotential)}</div>
                          <div style={{ fontSize:10, color:"#bbb", fontFamily:"'JetBrains Mono',monospace" }}>{(c.recoveryRate*100).toFixed(0)}% reativ.</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {recovery.withPotential.length > 50 && (
              <div style={{ padding:"12px", textAlign:"center", fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#bbb", borderTop:"1px solid #f0ede8" }}>
                Mostrando 50 de {fmtN(recovery.withPotential.length)} — exporte para ver todos
              </div>
            )}
          </div>

          {/* Strategy Cards */}
          <div style={{ marginBottom:8 }}>
            <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:17, fontWeight:600, color:"#1a1a2e", marginBottom:4 }}>Estratégias de Acionamento</div>
            <div style={{ fontSize:11, color:"#bbb", fontFamily:"'JetBrains Mono',monospace", marginBottom:20 }}>Playbooks prontos para cada segmento — copie o template e adapte para sua marca</div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"repeat(3,1fr)", gap:18, marginBottom:24 }}>
            {INACTIVE_SEGS.map(seg => {
              const strat = STRATEGIES[seg];
              const cfg = SEG[seg];
              const segData = recovery.bySegment.find(b => b.segment === seg);
              return (
                <div key={seg} style={{ background:"#fff", border:"1px solid #e8e4de", borderRadius:14, padding:24, boxShadow:"0 1px 3px rgba(0,0,0,0.04)", display:"flex", flexDirection:"column", gap:14 }}>
                  {/* Header */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ fontSize:22, marginBottom:6 }}>{cfg.icon}</div>
                      <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:15, fontWeight:700, color:"#1a1a2e" }}>{strat.title}</div>
                      <div style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:cfg.color, marginTop:2 }}>{seg} · {fmtN(segData?.count || 0)} clientes</div>
                    </div>
                    <span style={{ background:strat.urgencyBg, color:strat.urgencyColor, borderRadius:20, padding:"3px 10px", fontSize:10, fontFamily:"'JetBrains Mono',monospace", fontWeight:600, whiteSpace:"nowrap" }}>
                      {strat.urgency}
                    </span>
                  </div>

                  {/* Objective */}
                  <div style={{ fontSize:12, color:"#555", lineHeight:1.5, padding:"10px 12px", background:"#faf9f7", borderRadius:8, border:"1px solid #f0ede8" }}>
                    🎯 {strat.objective}
                  </div>

                  {/* Channels + Offer */}
                  <div>
                    <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#bbb", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Canais</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                      {strat.channels.map(ch => (
                        <span key={ch} style={{ fontSize:12, color:"#555" }}>{ch}</span>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding:"8px 12px", background: cfg.bg, borderRadius:8, fontSize:12, color:cfg.color, fontWeight:500 }}>
                    💡 {strat.offer}
                  </div>

                  <div style={{ fontSize:11, color:"#888", fontFamily:"'JetBrains Mono',monospace" }}>⏰ {strat.timing}</div>

                  {/* KPIs */}
                  <div>
                    <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#bbb", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>KPIs Esperados</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                      {strat.kpis.map(kpi => (
                        <span key={kpi} style={{ fontSize:11, color:"#555", fontFamily:"'JetBrains Mono',monospace" }}>· {kpi}</span>
                      ))}
                    </div>
                  </div>

                  {/* Message Template */}
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#bbb", textTransform:"uppercase", letterSpacing:"0.1em" }}>Template de Mensagem</div>
                      <button onClick={() => {
                        navigator.clipboard.writeText(strat.message).then(() => {
                          setCopiedMsg(seg);
                          setTimeout(() => setCopiedMsg(null), 2000);
                        });
                      }} style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", background: copiedMsg===seg ? "#d1fae5" : "#f0ede8", color: copiedMsg===seg ? "#065f46" : "#666", border:"none", borderRadius:6, padding:"4px 10px", cursor:"pointer" }}>
                        {copiedMsg===seg ? "✓ Copiado!" : "Copiar"}
                      </button>
                    </div>
                    <pre style={{ fontSize:11, color:"#555", lineHeight:1.6, background:"#faf9f7", padding:"12px 14px", borderRadius:8, border:"1px solid #f0ede8", whiteSpace:"pre-wrap", wordBreak:"break-word", margin:0, fontFamily:"'Inter',sans-serif", maxHeight:200, overflowY:"auto" }}>
                      {strat.message}
                    </pre>
                  </div>

                  {/* Export CTA */}
                  <button onClick={() => {
                    const clients = recovery.withPotential.filter(c => c.segment === seg);
                    const rows = clients.map(c => ({
                      Nome: c.name, ID: c.id,
                      "Dias Inativo": c.recency < 9999 ? c.recency : "",
                      "Última Compra": c.lastOrder ? c.lastOrder.toLocaleDateString("pt-BR") : "",
                      "Ticket Médio": c.avgTicket.toFixed(2).replace(".",","),
                      "Potencial": c.recoveryPotential.toFixed(2).replace(".",","),
                      Email: c.raw ? (Object.entries(c.raw).find(([k])=>k.includes("email"))?.[1] || "") : "",
                      Telefone: c.raw ? (Object.entries(c.raw).find(([k])=>k.includes("telefone"))?.[1] || "") : "",
                    }));
                    exportCSV(rows, `campanha-${seg.toLowerCase().replace(/\s+/g,"-")}-${new Date().toISOString().slice(0,10)}.csv`);
                  }} style={{ padding:"10px 0", background:"#1a1a2e", border:"none", borderRadius:10, cursor:"pointer", fontSize:12, fontFamily:"'JetBrains Mono',monospace", color:"#fff", fontWeight:500, textAlign:"center" }}>
                    ↓ Exportar lista para campanha
                  </button>
                </div>
              );
            })}
          </div>
        </>}
      </div>

      {/* ── Painel de detalhe do cliente ── */}
      {selectedClient && (
        <>
          <div onClick={()=>setSelectedClient(null)} style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.18)", zIndex:199 }}/>
          <div style={{ position:"fixed", top:0, right:0, width:isMobile?"100%":460, height:"100vh", background:"#fff", boxShadow:"-4px 0 28px rgba(0,0,0,0.13)", zIndex:200, display:"flex", flexDirection:"column" }}>

            {/* Header */}
            <div style={{ padding:"24px 28px", borderBottom:"1px solid #f0ede8", display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexShrink:0 }}>
              <div>
                <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:6 }}>Detalhe do Cliente</div>
                <div style={{ fontSize:20, fontWeight:600, fontFamily:"'Outfit',sans-serif", color:"#1a1a2e", lineHeight:1.2 }}>{selectedClient.name}</div>
                {selectedClient.id !== selectedClient.name && (
                  <div style={{ fontSize:11, color:"#ccc", fontFamily:"'JetBrains Mono',monospace", marginTop:4 }}>{selectedClient.id}</div>
                )}
                <div style={{ marginTop:10 }}>
                  <span style={{ background:SEG[selectedClient.segment]?.bg, color:SEG[selectedClient.segment]?.color, borderRadius:20, padding:"3px 12px", fontSize:12, fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>
                    {SEG[selectedClient.segment]?.icon} {selectedClient.segment}
                  </span>
                </div>
              </div>
              <button onClick={()=>setSelectedClient(null)} style={{ background:"#f5f2ee", border:"none", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:20, color:"#666", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>

            {/* Scores RFM */}
            <div style={{ padding:"16px 28px", borderBottom:"1px solid #f0ede8", flexShrink:0 }}>
              <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#bbb", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Scores RFM</div>
              <div style={{ display:"flex", gap:8 }}>
                {[{label:"Recência",v:selectedClient.rScore},{label:"Frequência",v:selectedClient.fScore},{label:"Monetário",v:selectedClient.mScore}].map(s=>(
                  <div key={s.label} style={{ flex:1, textAlign:"center", background:"#faf9f7", borderRadius:10, padding:"10px 6px" }}>
                    <div style={{ fontSize:9, fontFamily:"'JetBrains Mono',monospace", color:"#bbb", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>{s.label}</div>
                    <ScoreBox v={s.v}/>
                  </div>
                ))}
                <div style={{ flex:1, textAlign:"center", background:"#1a1a2e", borderRadius:10, padding:"10px 6px" }}>
                  <div style={{ fontSize:9, fontFamily:"'JetBrains Mono',monospace", color:"#ffffff60", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Score</div>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:20, fontWeight:700, color:"#fff" }}>{selectedClient.rScore}{selectedClient.fScore}{selectedClient.mScore}</span>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, padding:"16px 28px 0", flexShrink:0 }}>
              {[
                {label:"Total Gasto",     value:fmt(selectedClient.total)},
                {label:"Pedidos",         value:fmtN(selectedClient.orders)},
                {label:"Ticket Médio",    value:fmt(selectedClient.orders?selectedClient.total/selectedClient.orders:0)},
                {label:"Dias s/ comprar", value:selectedClient.recency<9999?selectedClient.recency+"d":"—"},
              ].map(k=>(
                <div key={k.label} style={{ background:"#faf9f7", borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>{k.label}</div>
                  <div style={{ fontSize:18, fontFamily:"'Outfit',sans-serif", fontWeight:700, color:"#1a1a2e" }}>{k.value}</div>
                </div>
              ))}
              {clientDetail?.avgDays != null && (
                <div style={{ gridColumn:"1/-1", background:"#faf9f7", borderRadius:10, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>Intervalo Médio</div>
                    <div style={{ fontSize:18, fontFamily:"'Outfit',sans-serif", fontWeight:700, color:"#1a1a2e" }}>{clientDetail.avgDays} dias entre compras</div>
                  </div>
                  {clientDetail.first && clientDetail.last && clientDetail.first.getTime()!==clientDetail.last.getTime() && (
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#bbb" }}>1ª compra</div>
                      <div style={{ fontSize:12, fontFamily:"'JetBrains Mono',monospace", color:"#555" }}>{clientDetail.first.toLocaleDateString("pt-BR")}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Contato */}
            {clientDetail && (clientDetail.email||clientDetail.phone||clientDetail.city||clientDetail.gender||clientDetail.personType) && (
              <div style={{ padding:"12px 28px", flexShrink:0 }}>
                <div style={{ background:"#faf9f7", borderRadius:10, padding:"12px 14px", display:"flex", flexWrap:"wrap", gap:10 }}>
                  {clientDetail.personType && <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#555" }}>👤 {clientDetail.personType}</span>}
                  {clientDetail.gender && <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#555" }}>{clientDetail.gender.toUpperCase()==="M"?"♂ Masculino":"♀ Feminino"}</span>}
                  {clientDetail.city && <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#555" }}>📍 {clientDetail.city}{clientDetail.state?`, ${clientDetail.state}`:""}</span>}
                  {clientDetail.email && <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#555" }}>✉ {clientDetail.email}</span>}
                  {clientDetail.phone && <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#555" }}>📞 {clientDetail.phone}</span>}
                </div>
              </div>
            )}

            {/* Histórico label */}
            <div style={{ padding:"8px 28px 10px", flexShrink:0 }}>
              <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.12em" }}>
                Histórico de Pedidos · {fmtN(clientOrders.length)} registros
              </div>
            </div>

            {/* Histórico table */}
            <div style={{ overflowY:"auto", flex:1, padding:"0 28px 28px" }}>
              {clientOrders.length===0
                ? <div style={{ fontSize:13, color:"#bbb", fontFamily:"'JetBrains Mono',monospace" }}>Nenhum pedido encontrado.</div>
                : <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                      <tr>
                        {["Data","Status","Valor"].map(h=>(
                          <th key={h} style={{ padding:"8px 6px", textAlign:h==="Valor"?"right":"left", fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:500, borderBottom:"1px solid #f0ede8" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {clientOrders.map((r,i)=>{
                        const dk=findKey(r,"data"), vk=findKey(r,"valor"), sk=findKey(r,"status");
                        const d=dk?parseDate(r[dk]):null, v=parseValue(vk?r[vk]:0), s=sk?r[sk]:"—";
                        return (
                          <tr key={i} style={{ borderBottom:"1px solid #f5f2ee" }}>
                            <td style={{ padding:"10px 6px", fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#555" }}>{d?d.toLocaleDateString("pt-BR"):"—"}</td>
                            <td style={{ padding:"10px 6px", fontSize:12, color:"#888" }}>{s}</td>
                            <td style={{ padding:"10px 6px", fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:600, color:"#1a1a2e", textAlign:"right" }}>{fmt(v)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
              }
            </div>
          </div>
        </>
      )}
    </div>
  );
}
