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

  const ScoreBox = ({ v }) => (
    <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:28, height:28, borderRadius:6, fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, background:`rgba(26,26,46,${v*0.18})`, color: v>=4?"#fff":"#444" }}>{v}</span>
  );

  if (!rfm) return <div style={{padding:60,textAlign:"center",fontFamily:"'Inter',sans-serif",color:"#aaa"}}>Sem dados para calcular RFM.</div>;

  return (
    <div style={{ minHeight:"100vh", background:"#faf9f7", fontFamily:"'Inter',sans-serif" }}>
      <div style={{ background:"#1a1a2e", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", padding:isMobile?"0 16px":"0 36px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <span style={{ fontFamily:"'Outfit',sans-serif", fontSize:18, color:"#fff", fontWeight:600 }}>Análise RFM</span>
          <div style={{ width:1, height:18, background:"#ffffff20" }}/>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#ffffff50" }}>{fileName}</span>
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
                    <tr key={c.id+i} style={{ borderBottom:"1px solid #f5f2ee" }} onMouseEnter={e=>e.currentTarget.style.background="#faf9f7"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
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
      </div>
    </div>
  );
}
