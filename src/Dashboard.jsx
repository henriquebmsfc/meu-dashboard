import { useState, useMemo } from "react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const fmt  = v => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);
const fmtN = v => new Intl.NumberFormat("pt-BR").format(v||0);
const COLORS = ["#1a1a2e","#2d6a4f","#e76f51","#457b9d","#f4a261","#6d6875","#a8dadc"];

function parseVal(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/R\$\s*/gi,"").replace(/\s/g,"").replace(/\./g,"").replace(",",".")) || 0;
}
function parseDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  const m1 = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) { let[,d,mo,y]=m1; if(y.length===2)y="20"+y; return new Date(+y,+mo-1,+d); }
  const m2 = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) { const[,y,mo,d]=m2; return new Date(+y,+mo-1,+d); }
  const fb = new Date(t); return isNaN(fb)?null:fb;
}
function findKey(r, ...parts) {
  for (const p of parts) { const k=Object.keys(r).find(k=>k.includes(p)); if(k) return k; }
  return null;
}

function exportCSV(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(";"),
    ...rows.map(row => headers.map(h => `"${String(row[h]??"").replace(/"/g,'""')}"`).join(";"))
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function KPI({label,value,sub,accent="#1a1a2e"}) {
  return (
    <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,padding:"22px 20px",position:"relative",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
      <div style={{position:"absolute",top:0,left:0,width:4,height:"100%",background:accent,borderRadius:"14px 0 0 14px"}}/>
      <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.12em",color:"#aaa",textTransform:"uppercase",marginBottom:6}}>{label}</div>
      <div style={{fontSize:26,fontFamily:"'Outfit',sans-serif",fontWeight:700,color:"#1a1a2e",lineHeight:1}}>{value}</div>
      {sub && <div style={{fontSize:11,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginTop:4}}>{sub}</div>}
    </div>
  );
}

const TABS = [{id:"overview",label:"Visão Geral"},{id:"intel",label:"Inteligência"},{id:"clients",label:"Clientes"},{id:"orders",label:"Pedidos"}];

const INSIGHT_STYLES = {
  warning: { bg:"#fef3c7", border:"#fde68a", icon:"⚠️", color:"#92400e" },
  danger:  { bg:"#fee2e2", border:"#fecaca", icon:"🔴", color:"#991b1b" },
  info:    { bg:"#dbeafe", border:"#bfdbfe", icon:"💡", color:"#1e40af" },
  success: { bg:"#d1fae5", border:"#a7f3d0", icon:"✅", color:"#065f46" },
};

function InsightCard({ type, title, desc }) {
  const s = INSIGHT_STYLES[type] || INSIGHT_STYLES.info;
  return (
    <div style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:"14px 18px", minWidth:240, flex:"0 0 auto" }}>
      <div style={{ fontSize:18, marginBottom:6 }}>{s.icon}</div>
      <div style={{ fontSize:13, fontWeight:600, color:s.color, marginBottom:4 }}>{title}</div>
      <div style={{ fontSize:12, color:s.color, opacity:0.8, lineHeight:1.4 }}>{desc}</div>
    </div>
  );
}

export default function Dashboard({ data, norm, valid, fileName, onReset }) {
  const [tab,      setTab]      = useState("overview");
  const [search,   setSearch]   = useState("");
  const [selectedClient, setSelectedClient] = useState(null);

  const overview = useMemo(() => {
    if (!valid.length) return null;
    const revenue = valid.reduce((s,r) => {
      const vk = findKey(r,"valor"); return s + parseVal(vk?r[vk]:0);
    }, 0);
    const clients = {};
    valid.forEach(r => {
      const ck=findKey(r,"codigo","cliente"), nk=findKey(r,"nome"), vk=findKey(r,"valor");
      const id=ck?r[ck]:(nk?r[nk]:"?"), nm=nk?r[nk]:id;
      if(!clients[id]) clients[id]={id,name:nm,total:0,orders:0};
      clients[id].total+=parseVal(vk?r[vk]:0); clients[id].orders++;
    });
    const clientList = Object.values(clients).sort((a,b)=>b.total-a.total);
    const monthly = {};
    valid.forEach(r => {
      const dk=findKey(r,"data"), vk=findKey(r,"valor");
      if(dk&&r[dk]){const d=parseDate(r[dk]); if(d&&!isNaN(d)){const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;monthly[k]=(monthly[k]||0)+parseVal(vk?r[vk]:0);}}
    });
    const monthlyData = Object.entries(monthly).sort().map(([k,v])=>({month:k.slice(5)+"/"+k.slice(2,4),revenue:v}));
    const statusMap = {};
    valid.forEach(r=>{const sk=findKey(r,"status");const s=sk?r[sk]:"—";statusMap[s]=(statusMap[s]||0)+1;});
    const statusData = Object.entries(statusMap).map(([name,value])=>({name,value}));
    const stateMap = {};
    valid.forEach(r=>{const ek=findKey(r,"estado"),vk=findKey(r,"valor");const s=ek?r[ek]:"N/A";stateMap[s]=(stateMap[s]||0)+parseVal(vk?r[vk]:0);});
    const stateData = Object.entries(stateMap).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([state,revenue])=>({state,revenue}));
    return { revenue, clientList, monthlyData, statusData, stateData, orders:valid.length, excluded:norm.length-valid.length, avgTicket:valid.length?revenue/valid.length:0 };
  }, [valid, norm]);

  const intel = useMemo(() => {
    if (!valid.length) return null;
    const now = new Date();
    const cMap = {};
    valid.forEach(r => {
      const ck=findKey(r,"codigo","cliente"), nk=findKey(r,"nome"), dk=findKey(r,"data"), vk=findKey(r,"valor");
      const id=ck?r[ck]:(nk?r[nk]:"?"), nm=nk?r[nk]:id, val=parseVal(vk?r[vk]:0), d=dk?parseDate(r[dk]):null;
      if(!cMap[id]) cMap[id]={name:nm,total:0,orders:0,last:null};
      cMap[id].total+=val; cMap[id].orders++;
      if(d&&!isNaN(d)&&(!cMap[id].last||d>cMap[id].last)) cMap[id].last=d;
    });
    const cl = Object.values(cMap);
    const ds = d => d?Math.floor((now-d)/86400000):9999;
    const totalRev = cl.reduce((s,c)=>s+c.total,0);
    const single = cl.filter(c=>c.orders===1).length;
    const spendBuckets = [
      {label:"Até R$500",    min:0,     max:500,     count:0,revenue:0},
      {label:"R$500–5k",     min:500,   max:5000,    count:0,revenue:0},
      {label:"R$5k–50k",     min:5000,  max:50000,   count:0,revenue:0},
      {label:"R$50k–100k",   min:50000, max:100000,  count:0,revenue:0},
      {label:"Acima R$100k", min:100000,max:Infinity,count:0,revenue:0},
    ];
    cl.forEach(c=>{const b=spendBuckets.find(b=>c.total>=b.min&&c.total<b.max);if(b){b.count++;b.revenue+=c.total;}});
    const sorted = [...cl].sort((a,b)=>b.total-a.total);
    const top20 = sorted.slice(0,Math.ceil(cl.length*0.2));

    // Geographic: per-state revenue + unique clients (from valid orders)
    const cStateMap={};
    norm.forEach(r=>{const ck2=findKey(r,"codigo","cliente"),nk2=findKey(r,"nome"),ek2=findKey(r,"estado");const id2=ck2?r[ck2]:(nk2?r[nk2]:"?");if(!cStateMap[id2]&&ek2&&r[ek2]?.trim())cStateMap[id2]=r[ek2].trim();});
    const stAgg={};
    valid.forEach(r=>{const ck2=findKey(r,"codigo","cliente"),nk2=findKey(r,"nome"),vk2=findKey(r,"valor"),ek2=findKey(r,"estado");const id2=ck2?r[ck2]:(nk2?r[nk2]:"?");const st=cStateMap[id2]||(ek2&&r[ek2]?.trim())||"N/A";const v=parseVal(vk2?r[vk2]:0);if(!stAgg[st])stAgg[st]={cs:new Set(),orders:0,revenue:0};stAgg[st].cs.add(id2);stAgg[st].orders++;stAgg[st].revenue+=v;});
    const geoData=Object.entries(stAgg).map(([state,s])=>({state,clients:s.cs.size,orders:s.orders,revenue:s.revenue})).sort((a,b)=>b.revenue-a.revenue).slice(0,10);

    // Demographics: gender, age, person type (unique clients from norm)
    const cGender={},cAge={},cType={};
    norm.forEach(r=>{
      const ck2=findKey(r,"codigo","cliente"),nk2=findKey(r,"nome");
      const sk2=findKey(r,"sexo"),bk2=findKey(r,"nascimento"),tk2=findKey(r,"tipo");
      const id2=ck2?r[ck2]:(nk2?r[nk2]:"?");
      if(!cGender[id2]&&sk2&&r[sk2]?.trim())cGender[id2]=r[sk2].trim().toUpperCase().charAt(0);
      if(!cType[id2]&&tk2&&r[tk2]?.trim())cType[id2]=r[tk2].trim();
      if(!cAge[id2]&&bk2&&r[bk2]?.trim()){const bd=parseDate(r[bk2]);if(bd&&!isNaN(bd)){const a=Math.floor((now-bd)/(365.25*86400000));if(a>0&&a<120)cAge[id2]=a;}}
    });
    const gC={M:0,F:0,other:0};
    Object.values(cGender).forEach(g=>{if(g==="M")gC.M++;else if(g==="F")gC.F++;else gC.other++;});
    const ageBuckets=[{label:"Até 25",count:0},{label:"26–35",count:0},{label:"36–45",count:0},{label:"46–60",count:0},{label:"60+",count:0}];
    Object.values(cAge).forEach(a=>{if(a<=25)ageBuckets[0].count++;else if(a<=35)ageBuckets[1].count++;else if(a<=45)ageBuckets[2].count++;else if(a<=60)ageBuckets[3].count++;else ageBuckets[4].count++;});
    const pTypes={};Object.values(cType).forEach(t=>{pTypes[t]=(pTypes[t]||0)+1;});

    // Time patterns (from valid orders)
    const hCounts=Array(24).fill(0);
    valid.forEach(r=>{const hk=findKey(r,"hora");if(hk&&r[hk]){const h2=parseInt(String(r[hk]).split(":")[0]);if(!isNaN(h2)&&h2>=0&&h2<24)hCounts[h2]++;}});
    const dCounts=Array(7).fill(0);
    valid.forEach(r=>{const dk2=findKey(r,"data");if(dk2&&r[dk2]){const d2=parseDate(r[dk2]);if(d2&&!isNaN(d2))dCounts[d2.getDay()]++;}});

    // CRM readiness: email + phone fill rates (unique clients from norm)
    const crmMap2={};
    norm.forEach(r=>{const ck2=findKey(r,"codigo","cliente"),nk2=findKey(r,"nome"),ek2=findKey(r,"email"),tk2=findKey(r,"telefone");const id2=ck2?r[ck2]:(nk2?r[nk2]:"?");if(!crmMap2[id2])crmMap2[id2]={email:false,phone:false};if(ek2&&r[ek2]?.trim())crmMap2[id2].email=true;if(tk2&&r[tk2]?.trim())crmMap2[id2].phone=true;});
    const crmArr=Object.values(crmMap2);
    const crmTot=crmArr.length,crmEm=crmArr.filter(c=>c.email).length,crmPh=crmArr.filter(c=>c.phone).length,crmBo=crmArr.filter(c=>c.email&&c.phone).length;

    // Curva ABC de clientes (sorted já está ordenado por receita desc)
    let abcCumRev=0;
    const abcA={clients:0,revenue:0},abcB={clients:0,revenue:0},abcC={clients:0,revenue:0};
    const abcStep=Math.max(1,Math.floor(sorted.length/80));
    const abcCurve=[{cp:0,rp:0,diag:0}];
    sorted.forEach((c,i)=>{
      const prevPct=totalRev?abcCumRev/totalRev:0;
      abcCumRev+=c.total;
      if(prevPct<0.80){abcA.clients++;abcA.revenue+=c.total;}
      else if(prevPct<0.95){abcB.clients++;abcB.revenue+=c.total;}
      else{abcC.clients++;abcC.revenue+=c.total;}
      if((i+1)%abcStep===0||i===sorted.length-1){
        const cp=parseFloat(((i+1)/sorted.length*100).toFixed(1));
        const rp=parseFloat((totalRev?abcCumRev/totalRev*100:0).toFixed(1));
        abcCurve.push({cp,rp,diag:cp});
      }
    });

    return {
      totalRev, uniqueClients:cl.length, totalOrders:valid.length,
      avgOrder:valid.length?totalRev/valid.length:0,
      avgClient:cl.length?totalRev/cl.length:0,
      single, reorder:cl.length?((cl.length-single)/cl.length*100).toFixed(1):0,
      r30:cl.filter(c=>ds(c.last)<=30).length,
      r90:cl.filter(c=>ds(c.last)<=90).length,
      r180:cl.filter(c=>ds(c.last)<=180).length,
      r360:cl.filter(c=>ds(c.last)<=360).length,
      f2_5:cl.filter(c=>c.orders>=2&&c.orders<=5).length,
      f5:cl.filter(c=>c.orders>=5).length,
      f10:cl.filter(c=>c.orders>=10).length,
      f20:cl.filter(c=>c.orders>=20).length,
      spendBuckets, fatJet:top20.reduce((s,c)=>s+c.total,0),
      clientsSorted:sorted,
      geoData, gC, genderTotal:Object.keys(cGender).length,
      ageBuckets, withAge:Object.keys(cAge).length,
      pTypes, hCounts, dCounts,
      crmTot, crmEm, crmPh, crmBo,
      abcA, abcB, abcC, abcCurve,
    };
  }, [valid, norm]);

  // Insights automáticos
  const insights = useMemo(() => {
    if (!intel || !overview) return [];
    const now = new Date();
    const list = [];

    // Concentração de receita
    const top3Rev = overview.clientList.slice(0,3).reduce((s,c)=>s+c.total,0);
    const top3Pct = overview.revenue ? (top3Rev/overview.revenue*100).toFixed(0) : 0;
    if (top3Pct > 40) list.push({ type:"danger", title:`Concentração alta: ${top3Pct}% da receita`, desc:`3 clientes respondem por quase metade do faturamento — risco alto de dependência.` });

    // Clientes em risco de churn (2+ compras, sumiu há >90 dias)
    const cMap2 = {};
    valid.forEach(r => {
      const ck=findKey(r,"codigo","cliente"), nk=findKey(r,"nome"), dk=findKey(r,"data");
      const id=ck?r[ck]:(nk?r[nk]:"?"), d=dk?parseDate(r[dk]):null;
      if(!cMap2[id]) cMap2[id]={orders:0,last:null};
      cMap2[id].orders++;
      if(d&&!isNaN(d)&&(!cMap2[id].last||d>cMap2[id].last)) cMap2[id].last=d;
    });
    const churnRisk = Object.values(cMap2).filter(c => {
      if (c.orders < 2) return false;
      const dias = c.last ? Math.floor((now-c.last)/86400000) : 9999;
      return dias > 90 && dias <= 365;
    }).length;
    if (churnRisk > 0) list.push({ type:"warning", title:`${fmtN(churnRisk)} clientes em risco de churn`, desc:`Compraram 2+ vezes mas não voltam há mais de 90 dias. Campanha de reativação pode ajudar.` });

    // Taxa de recompra baixa
    const reorderNum = parseFloat(intel.reorder);
    if (reorderNum < 30) list.push({ type:"warning", title:`Taxa de recompra baixa: ${intel.reorder}%`, desc:`A maioria dos clientes comprou apenas uma vez. Foco em pós-venda e retenção.` });

    // Clientes novos no último mês
    const thirtyDaysAgo = new Date(now-30*86400000);
    const firstPurchase = {};
    valid.forEach(r => {
      const ck=findKey(r,"codigo","cliente"), nk=findKey(r,"nome"), dk=findKey(r,"data");
      const id=ck?r[ck]:(nk?r[nk]:"?"), d=dk?parseDate(r[dk]):null;
      if(!firstPurchase[id] || (d && d < firstPurchase[id])) firstPurchase[id] = d;
    });
    const newClients = Object.values(firstPurchase).filter(d => d && d >= thirtyDaysAgo).length;
    if (newClients > 0) list.push({ type:"success", title:`${fmtN(newClients)} novos clientes este mês`, desc:`Primeira compra nos últimos 30 dias. Boa hora para onboarding e estímulo à segunda compra.` });

    // Tendência mês a mês
    if (overview.monthlyData.length >= 2) {
      const last  = overview.monthlyData[overview.monthlyData.length-1].revenue;
      const prev  = overview.monthlyData[overview.monthlyData.length-2].revenue;
      const delta = prev ? ((last-prev)/prev*100).toFixed(1) : null;
      if (delta !== null) {
        const up = parseFloat(delta) >= 0;
        list.push({ type: up?"success":"warning", title:`Faturamento ${up?"subiu":"caiu"} ${Math.abs(delta)}% vs mês anterior`, desc:`${overview.monthlyData[overview.monthlyData.length-2].month} → ${overview.monthlyData[overview.monthlyData.length-1].month}: ${fmt(prev)} → ${fmt(last)}` });
      }
    }

    // VIP sem comprar há >60 dias
    const topN = Math.ceil(Object.keys(cMap2).length * 0.1);
    const vipAtRisk = overview.clientList.slice(0, topN).filter(c => {
      const cd = cMap2[c.id]; if (!cd) return false;
      const dias = cd.last ? Math.floor((now-cd.last)/86400000) : 9999;
      return dias > 60;
    }).length;
    if (vipAtRisk > 0) list.push({ type:"danger", title:`${fmtN(vipAtRisk)} clientes VIP sem comprar há +60 dias`, desc:`Top 10% em faturamento inativos. Intervenção direta pode recuperar receita significativa.` });

    return list;
  }, [intel, overview, valid]);

  const filteredClients = useMemo(() => {
    if (!overview) return [];
    return overview.clientList.filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.id?.toLowerCase().includes(search.toLowerCase()));
  }, [overview, search]);

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
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db - da;
    });
  }, [selectedClient, norm]);

  const clientDetail = useMemo(() => {
    if (!clientOrders.length) return null;
    let email=null,phone=null,city=null,state=null,gender=null,personType=null;
    for (const r of clientOrders) {
      const ek=findKey(r,"email"),tk=findKey(r,"telefone"),ck2=findKey(r,"cidade"),ek2=findKey(r,"estado"),sk=findKey(r,"sexo"),tpk=findKey(r,"tipo");
      if(!email&&ek&&r[ek]?.trim())email=r[ek].trim();
      if(!phone&&tk&&r[tk]?.trim())phone=r[tk].trim();
      if(!city&&ck2&&r[ck2]?.trim())city=r[ck2].trim();
      if(!state&&ek2&&r[ek2]?.trim())state=r[ek2].trim();
      if(!gender&&sk&&r[sk]?.trim())gender=r[sk].trim();
      if(!personType&&tpk&&r[tpk]?.trim())personType=r[tpk].trim();
    }
    let avgDays=null;
    const dates=clientOrders.map(r=>{const dk=findKey(r,"data");return dk?parseDate(r[dk]):null;}).filter(d=>d&&!isNaN(d)).sort((a,b)=>a-b);
    if(dates.length>=2){const gaps=[];for(let i=1;i<dates.length;i++)gaps.push((dates[i]-dates[i-1])/86400000);avgDays=Math.round(gaps.reduce((s,g)=>s+g,0)/gaps.length);}
    const first=dates[0]||null, last=dates[dates.length-1]||null;
    return {email,phone,city,state,gender,personType,avgDays,first,last};
  }, [clientOrders]);

  const handleExportClients = () => {
    if (!overview) return;
    const rows = overview.clientList.map((c, i) => ({
      Posição: i+1,
      ID: c.id,
      Nome: c.name,
      Pedidos: c.orders,
      "Total Gasto": c.total.toFixed(2).replace(".",","),
      "Ticket Médio": (c.orders ? c.total/c.orders : 0).toFixed(2).replace(".",","),
      "Participação %": overview.revenue ? (c.total/overview.revenue*100).toFixed(2).replace(".",",") : "0,00",
    }));
    exportCSV(rows, `clientes-ranking-${new Date().toISOString().slice(0,10)}.csv`);
  };

  return (
    <div style={{minHeight:"100vh",background:"#faf9f7",fontFamily:"'Inter',sans-serif"}}>
      {/* Header */}
      <div style={{background:"#1a1a2e",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 36px",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <span style={{fontFamily:"'Outfit',sans-serif",fontSize:18,color:"#fff",fontWeight:600}}>Analytics</span>
          <div style={{width:1,height:18,background:"#ffffff20"}}/>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"#ffffff50"}}>{fileName}</span>
        </div>
        <div style={{display:"flex",gap:4}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?"#ffffff18":"transparent",border:"none",color:tab===t.id?"#fff":"#ffffff55",padding:"7px 16px",borderRadius:8,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:tab===t.id?500:400}}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={onReset} style={{background:"transparent",border:"1px solid #ffffff30",color:"#ffffff55",padding:"5px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}>Trocar arquivo</button>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div style={{padding:"16px 36px",borderBottom:"1px solid #e8e4de",background:"#faf9f7"}}>
          <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#aaa",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:10}}>
            Insights automáticos — {insights.length} alerta{insights.length>1?"s":""}
          </div>
          <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:4}}>
            {insights.map((ins,i)=><InsightCard key={i} {...ins}/>)}
          </div>
        </div>
      )}

      <div style={{padding:"32px 36px 100px",maxWidth:1320,margin:"0 auto"}}>
        {/* Visão Geral */}
        {tab==="overview" && overview && <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:16}}>
            <KPI label="Faturamento Total"  value={fmt(overview.revenue)}              sub={`${fmtN(overview.orders)} pedidos válidos`} accent="#1a1a2e"/>
            <KPI label="Clientes Únicos"    value={fmtN(overview.clientList.length)}   sub="no período"        accent="#2d6a4f"/>
            <KPI label="Ticket Médio"       value={fmt(overview.avgTicket)}            sub="por pedido"        accent="#e76f51"/>
            <KPI label="Top Cliente"        value={overview.clientList[0]?.name?.split(" ")[0]||"—"} sub={fmt(overview.clientList[0]?.total)} accent="#457b9d"/>
          </div>
          {overview.excluded>0 && (
            <div style={{background:"#fff8f0",border:"1px solid #fde8cc",borderRadius:10,padding:"10px 18px",marginBottom:24,fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:"#92400e"}}>
              ⚠️ <strong>{fmtN(overview.excluded)}</strong> pedido(s) excluídos — sem status ou cancelados.
            </div>
          )}
          <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.04)",marginBottom:18}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,fontWeight:600,color:"#1a1a2e",marginBottom:16}}>Faturamento Mensal</div>
            {overview.monthlyData.length>0?(
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={overview.monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8"/>
                  <XAxis dataKey="month" tick={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,fill:"#bbb"}}/>
                  <YAxis tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`} tick={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,fill:"#bbb"}}/>
                  <Tooltip formatter={v=>[fmt(v),"Receita"]} contentStyle={{fontFamily:"'Inter',sans-serif",borderRadius:8,border:"1px solid #e8e4de",fontSize:13}}/>
                  <Line type="monotone" dataKey="revenue" stroke="#1a1a2e" strokeWidth={2.5} dot={{r:3,fill:"#1a1a2e"}}/>
                </LineChart>
              </ResponsiveContainer>
            ):<div style={{height:220,display:"flex",alignItems:"center",justifyContent:"center",color:"#ddd",fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>Sem dados de data</div>}
          </div>
        </>}

        {/* Inteligência */}
        {tab==="intel" && intel && <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
            {[
              {label:"Total Vendas",         value:fmtN(intel.totalOrders), sub:"pedidos válidos",     accent:"#1a1a2e"},
              {label:"Clientes 1 Compra",    value:fmtN(intel.single),      sub:`de ${fmtN(intel.uniqueClients)} únicos`, accent:"#e76f51"},
              {label:"Taxa de Recompra",     value:intel.reorder+"%",       sub:"compraram 2+ vezes",  accent:"#2d6a4f"},
              {label:"Ticket Médio Compra",  value:fmt(intel.avgOrder),     sub:"por pedido",          accent:"#457b9d"},
              {label:"Ticket Médio Cliente", value:fmt(intel.avgClient),    sub:"lifetime",            accent:"#9b59b6"},
            ].map(k=><KPI key={k.label} {...k}/>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18}}>
            <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,fontWeight:600,color:"#1a1a2e",marginBottom:4}}>Recência</div>
              <div style={{fontSize:11,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginBottom:20}}>Clientes com última compra dentro do período</div>
              {[
                {label:"Ativos ≤30 dias",  v:intel.r30,  c:"#2d6a4f"},
                {label:"Ativos ≤90 dias",  v:intel.r90,  c:"#457b9d"},
                {label:"Ativos ≤180 dias", v:intel.r180, c:"#6d6875"},
                {label:"Ativos ≤360 dias", v:intel.r360, c:"#1a1a2e"},
              ].map(row=>{
                const pct=intel.uniqueClients?(row.v/intel.uniqueClients*100).toFixed(1):0;
                return <div key={row.label} style={{marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:13,color:"#555"}}>{row.label}</span>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:600,color:"#1a1a2e"}}>{fmtN(row.v)}</span>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"#bbb",width:38,textAlign:"right"}}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{height:8,background:"#f0ede8",borderRadius:4}}>
                    <div style={{width:pct+"%",height:"100%",background:row.c,borderRadius:4}}/>
                  </div>
                </div>;
              })}
            </div>
            <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,fontWeight:600,color:"#1a1a2e",marginBottom:4}}>Frequência</div>
              <div style={{fontSize:11,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginBottom:20}}>Distribuição por número de compras</div>
              {[
                {label:"1 compra",    v:intel.single, c:"#e76f51"},
                {label:"2–5 compras", v:intel.f2_5,   c:"#f4a261"},
                {label:"5+ compras",  v:intel.f5,     c:"#2d6a4f"},
                {label:"10+ compras", v:intel.f10,    c:"#457b9d"},
                {label:"20+ compras", v:intel.f20,    c:"#1a1a2e"},
              ].map(row=>{
                const pct=intel.uniqueClients?(row.v/intel.uniqueClients*100).toFixed(1):0;
                return <div key={row.label} style={{marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:13,color:"#555"}}>{row.label}</span>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:600,color:"#1a1a2e"}}>{fmtN(row.v)}</span>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"#bbb",width:38,textAlign:"right"}}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{height:8,background:"#f0ede8",borderRadius:4}}>
                    <div style={{width:pct+"%",height:"100%",background:row.c,borderRadius:4}}/>
                  </div>
                </div>;
              })}
              <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #f0ede8"}}>
                <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#bbb",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Faturamento Jet — Top 20% clientes</div>
                <div style={{fontSize:24,fontFamily:"'Outfit',sans-serif",fontWeight:700,color:"#1a1a2e"}}>{fmt(intel.fatJet)}</div>
                <div style={{fontSize:11,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>{intel.totalRev?(intel.fatJet/intel.totalRev*100).toFixed(1):0}% do faturamento total</div>
              </div>
            </div>
          </div>
          <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,fontWeight:600,color:"#1a1a2e",marginBottom:4}}>Segmentação por Gasto Lifetime</div>
            <div style={{fontSize:11,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginBottom:20}}>Distribuição de clientes e receita por faixa</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              {intel.spendBuckets.map((b,i)=>{
                const pctC=intel.uniqueClients?(b.count/intel.uniqueClients*100).toFixed(1):0;
                const pctR=intel.totalRev?(b.revenue/intel.totalRev*100).toFixed(1):0;
                const bgs=["#e8e4de","#c8d8e8","#457b9d","#2d6a4f","#1a1a2e"];
                return <div key={b.label} style={{background:"#faf9f7",borderRadius:10,padding:"16px 14px",border:"1px solid #e8e4de",position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",bottom:0,left:0,width:"100%",height:pctR+"%",maxHeight:"50%",background:bgs[i],opacity:0.12}}/>
                  <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#aaa",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>{b.label}</div>
                  <div style={{fontSize:26,fontFamily:"'Outfit',sans-serif",fontWeight:700,color:"#1a1a2e",lineHeight:1}}>{fmtN(b.count)}</div>
                  <div style={{fontSize:11,color:"#999",fontFamily:"'JetBrains Mono',monospace",marginTop:2,marginBottom:10}}>{pctC}% dos clientes</div>
                  <div style={{height:1,background:"#e8e4de",marginBottom:8}}/>
                  <div style={{fontSize:12,fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:"#555"}}>{fmt(b.revenue)}</div>
                  <div style={{fontSize:10,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>{pctR}% da receita</div>
                </div>;
              })}
            </div>
          </div>

          {/* Curva ABC */}
          <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.04)",marginTop:18}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,fontWeight:600,color:"#1a1a2e",marginBottom:4}}>Curva ABC de Clientes</div>
            <div style={{fontSize:11,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginBottom:20}}>Concentração de receita — clientes ordenados do maior para o menor gasto</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
              <div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:18}}>
                  {[
                    {seg:"A",color:"#1a1a2e",data:intel.abcA,target:"≈80% receita"},
                    {seg:"B",color:"#457b9d",data:intel.abcB,target:"≈15% receita"},
                    {seg:"C",color:"#aaa",   data:intel.abcC,target:"≈5% receita"},
                  ].map(({seg,color,data,target})=>{
                    const clientPct=intel.uniqueClients?(data.clients/intel.uniqueClients*100).toFixed(1):0;
                    const revPct=intel.totalRev?(data.revenue/intel.totalRev*100).toFixed(1):0;
                    return <div key={seg} style={{background:"#faf9f7",borderRadius:10,padding:"16px 14px",border:"1px solid #e8e4de",position:"relative",overflow:"hidden"}}>
                      <div style={{position:"absolute",top:0,left:0,width:"100%",height:4,background:color,borderRadius:"10px 10px 0 0"}}/>
                      <div style={{fontSize:22,fontFamily:"'Outfit',sans-serif",fontWeight:800,color:color,marginBottom:4}}>Classe {seg}</div>
                      <div style={{fontSize:24,fontFamily:"'Outfit',sans-serif",fontWeight:700,color:"#1a1a2e",lineHeight:1}}>{fmtN(data.clients)}</div>
                      <div style={{fontSize:10,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>{clientPct}% dos clientes</div>
                      <div style={{height:1,background:"#e8e4de",margin:"10px 0"}}/>
                      <div style={{fontSize:13,fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:"#1a1a2e"}}>{revPct}%</div>
                      <div style={{fontSize:10,color:"#bbb",fontFamily:"'JetBrains Mono',monospace"}}>da receita · meta {target}</div>
                    </div>;
                  })}
                </div>
                {(() => {
                  const tot=intel.uniqueClients||1, rev=intel.totalRev||1;
                  const aCP=(intel.abcA.clients/tot*100).toFixed(1), bCP=(intel.abcB.clients/tot*100).toFixed(1), cCP=(intel.abcC.clients/tot*100).toFixed(1);
                  const aRP=(intel.abcA.revenue/rev*100).toFixed(1), bRP=(intel.abcB.revenue/rev*100).toFixed(1), cRP=(intel.abcC.revenue/rev*100).toFixed(1);
                  return <>
                    <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#bbb",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>% de clientes por classe</div>
                    <div style={{height:18,borderRadius:6,overflow:"hidden",display:"flex",marginBottom:4}}>
                      <div style={{width:aCP+"%",background:"#1a1a2e"}} title={`A: ${aCP}%`}/>
                      <div style={{width:bCP+"%",background:"#457b9d"}} title={`B: ${bCP}%`}/>
                      <div style={{width:cCP+"%",background:"#e8e4de"}} title={`C: ${cCP}%`}/>
                    </div>
                    <div style={{display:"flex",gap:6,marginBottom:14}}>
                      {[{l:"A",v:aCP,c:"#1a1a2e"},{l:"B",v:bCP,c:"#457b9d"},{l:"C",v:cCP,c:"#aaa"}].map(x=>(
                        <span key={x.l} style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:x.c}}>{x.l}: {x.v}%</span>
                      ))}
                    </div>
                    <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#bbb",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>% de receita por classe</div>
                    <div style={{height:18,borderRadius:6,overflow:"hidden",display:"flex",marginBottom:4}}>
                      <div style={{width:aRP+"%",background:"#1a1a2e"}} title={`A: ${aRP}%`}/>
                      <div style={{width:bRP+"%",background:"#457b9d"}} title={`B: ${bRP}%`}/>
                      <div style={{width:cRP+"%",background:"#e8e4de"}} title={`C: ${cRP}%`}/>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      {[{l:"A",v:aRP,c:"#1a1a2e"},{l:"B",v:bRP,c:"#457b9d"},{l:"C",v:cRP,c:"#aaa"}].map(x=>(
                        <span key={x.l} style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:x.c}}>{x.l}: {x.v}%</span>
                      ))}
                    </div>
                  </>;
                })()}
              </div>
              <div>
                <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#bbb",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>Curva de Lorenz — % clientes vs % receita acumulada</div>
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={intel.abcCurve} margin={{top:4,right:8,bottom:0,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8"/>
                    <XAxis dataKey="cp" tickFormatter={v=>v+"%"} tick={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,fill:"#ccc"}} domain={[0,100]} type="number"/>
                    <YAxis tickFormatter={v=>v+"%"} tick={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,fill:"#ccc"}} domain={[0,100]}/>
                    <Tooltip formatter={(v,n)=>[v.toFixed(1)+"%",n==="rp"?"Receita acumulada":"Dist. igual"]} labelFormatter={v=>`${v}% dos clientes`} contentStyle={{fontFamily:"'Inter',sans-serif",borderRadius:8,border:"1px solid #e8e4de",fontSize:12}}/>
                    <Line type="monotone" dataKey="diag" stroke="#e8e4de" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Dist. igual"/>
                    <Line type="monotone" dataKey="rp" stroke="#1a1a2e" strokeWidth={2.5} dot={false} name="Receita acumulada"/>
                  </LineChart>
                </ResponsiveContainer>
                <div style={{fontSize:10,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginTop:6,textAlign:"center",lineHeight:1.5}}>
                  Quanto mais a curva se afasta da diagonal, maior a concentração de receita nos top clientes
                </div>
              </div>
            </div>
          </div>

          {/* Horários */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginTop:18}}>
            <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,fontWeight:600,color:"#1a1a2e",marginBottom:4}}>Horário dos Pedidos</div>
              <div style={{fontSize:11,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginBottom:16}}>Distribuição por hora do dia (0–23h)</div>
              {(() => {
                const maxH=Math.max(...intel.hCounts,1);
                const hasData=intel.hCounts.some(c=>c>0);
                if(!hasData) return <div style={{fontSize:12,color:"#bbb",fontFamily:"'JetBrains Mono',monospace"}}>Sem dados de hora</div>;
                return <>
                  <div style={{display:"flex",alignItems:"flex-end",gap:2,height:80}}>
                    {intel.hCounts.map((c,h)=>{
                      const pct=(c/maxH)*100;
                      const isDay=h>=8&&h<20;
                      return <div key={h} title={`${String(h).padStart(2,"0")}h: ${fmtN(c)} pedidos`} style={{flex:1,height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end"}}>
                        <div style={{width:"100%",background:isDay?"#1a1a2e":"#a8dadc",borderRadius:"2px 2px 0 0",height:pct+"%",minHeight:c?2:0}}/>
                      </div>;
                    })}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
                    {[0,6,12,18,23].map(h=><span key={h} style={{fontSize:9,fontFamily:"'JetBrains Mono',monospace",color:"#ccc"}}>{String(h).padStart(2,"0")}h</span>)}
                  </div>
                </>;
              })()}
            </div>
            <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,fontWeight:600,color:"#1a1a2e",marginBottom:4}}>Dia da Semana</div>
              <div style={{fontSize:11,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginBottom:16}}>Pedidos por dia</div>
              {(() => {
                const labels=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
                const maxD=Math.max(...intel.dCounts,1);
                return intel.dCounts.map((c,i)=>{
                  const pct=(c/maxD*100).toFixed(0);
                  const isWknd=i===0||i===6;
                  return <div key={i} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:12,color:isWknd?"#e76f51":"#555"}}>{labels[i]}</span>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,color:"#1a1a2e"}}>{fmtN(c)}</span>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"#bbb",width:30,textAlign:"right"}}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{height:7,background:"#f0ede8",borderRadius:4}}><div style={{width:pct+"%",height:"100%",background:isWknd?"#e76f51":"#1a1a2e",borderRadius:4}}/></div>
                  </div>;
                });
              })()}
            </div>
          </div>

          {/* Geográfico + CRM */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginTop:18}}>
            <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,fontWeight:600,color:"#1a1a2e",marginBottom:4}}>Estados — Top {intel.geoData.length}</div>
              <div style={{fontSize:11,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginBottom:16}}>Por faturamento acumulado</div>
              {intel.geoData.length===0
                ? <div style={{fontSize:12,color:"#bbb",fontFamily:"'JetBrains Mono',monospace"}}>Sem dados de estado</div>
                : intel.geoData.map((row,i)=>{
                    const maxR=intel.geoData[0].revenue;
                    const pct=maxR?(row.revenue/maxR*100).toFixed(0):0;
                    return <div key={row.state} style={{marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                        <span style={{fontSize:13,fontWeight:i===0?600:400,color:"#1a1a2e"}}>{row.state}</span>
                        <div style={{display:"flex",gap:10,alignItems:"center"}}>
                          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"#aaa"}}>{fmtN(row.clients)} cli.</span>
                          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,color:"#1a1a2e"}}>{fmt(row.revenue)}</span>
                        </div>
                      </div>
                      <div style={{height:7,background:"#f0ede8",borderRadius:4}}><div style={{width:pct+"%",height:"100%",background:"#457b9d",borderRadius:4}}/></div>
                    </div>;
                  })
              }
            </div>
            <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,fontWeight:600,color:"#1a1a2e",marginBottom:4}}>Prontidão CRM</div>
              <div style={{fontSize:11,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginBottom:20}}>Dados de contato — {fmtN(intel.crmTot)} clientes únicos</div>
              {[
                {label:"Com E-mail",    v:intel.crmEm, c:"#2d6a4f"},
                {label:"Com Telefone",  v:intel.crmPh, c:"#457b9d"},
                {label:"E-mail + Tel.", v:intel.crmBo, c:"#1a1a2e"},
              ].map(row=>{
                const pct=intel.crmTot?(row.v/intel.crmTot*100).toFixed(1):0;
                return <div key={row.label} style={{marginBottom:18}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:13,color:"#555"}}>{row.label}</span>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:600,color:"#1a1a2e"}}>{fmtN(row.v)}</span>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"#bbb",width:42,textAlign:"right"}}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{height:8,background:"#f0ede8",borderRadius:4}}><div style={{width:pct+"%",height:"100%",background:row.c,borderRadius:4}}/></div>
                </div>;
              })}
              {Object.keys(intel.pTypes).length>0 && (
                <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #f0ede8"}}>
                  <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#bbb",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>Tipo de Pessoa</div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    {Object.entries(intel.pTypes).map(([type,count])=>(
                      <div key={type} style={{flex:1,minWidth:70,background:"#faf9f7",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                        <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#aaa",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>{type}</div>
                        <div style={{fontSize:20,fontFamily:"'Outfit',sans-serif",fontWeight:700,color:"#1a1a2e"}}>{fmtN(count)}</div>
                        <div style={{fontSize:10,color:"#bbb",fontFamily:"'JetBrains Mono',monospace"}}>{intel.crmTot?(count/intel.crmTot*100).toFixed(0):0}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Demográfico */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginTop:18}}>
            <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,fontWeight:600,color:"#1a1a2e",marginBottom:4}}>Gênero dos Clientes</div>
              <div style={{fontSize:11,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginBottom:20}}>{fmtN(intel.genderTotal)} com dado informado de {fmtN(intel.uniqueClients)}</div>
              {[
                {label:"Masculino",    v:intel.gC.M,                               c:"#457b9d"},
                {label:"Feminino",     v:intel.gC.F,                               c:"#e76f51"},
                {label:"Não informado",v:intel.uniqueClients-intel.genderTotal,     c:"#e8e4de"},
              ].map(row=>{
                const pct=intel.uniqueClients?(row.v/intel.uniqueClients*100).toFixed(1):0;
                return <div key={row.label} style={{marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:13,color:"#555"}}>{row.label}</span>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:600,color:"#1a1a2e"}}>{fmtN(row.v)}</span>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"#bbb",width:38,textAlign:"right"}}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{height:8,background:"#f0ede8",borderRadius:4}}><div style={{width:pct+"%",height:"100%",background:row.c,borderRadius:4}}/></div>
                </div>;
              })}
            </div>
            <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontSize:16,fontWeight:600,color:"#1a1a2e",marginBottom:4}}>Faixa Etária</div>
              <div style={{fontSize:11,color:"#bbb",fontFamily:"'JetBrains Mono',monospace",marginBottom:20}}>{fmtN(intel.withAge)} clientes com data de nascimento</div>
              {intel.withAge===0
                ? <div style={{fontSize:12,color:"#bbb",fontFamily:"'JetBrains Mono',monospace"}}>Sem dados de nascimento</div>
                : intel.ageBuckets.map((b,i)=>{
                    const pct=intel.withAge?(b.count/intel.withAge*100).toFixed(1):0;
                    const colors=["#a8dadc","#457b9d","#1d3557","#2d6a4f","#1a1a2e"];
                    return <div key={b.label} style={{marginBottom:14}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontSize:13,color:"#555"}}>{b.label}</span>
                        <div style={{display:"flex",gap:10,alignItems:"center"}}>
                          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:600,color:"#1a1a2e"}}>{fmtN(b.count)}</span>
                          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"#bbb",width:38,textAlign:"right"}}>{pct}%</span>
                        </div>
                      </div>
                      <div style={{height:8,background:"#f0ede8",borderRadius:4}}><div style={{width:pct+"%",height:"100%",background:colors[i],borderRadius:4}}/></div>
                    </div>;
                  })
              }
            </div>
          </div>
        </>}

        {/* Clientes */}
        {tab==="clients" && overview && <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
            <div>
              <h2 style={{fontFamily:"'Outfit',sans-serif",fontSize:22,color:"#1a1a2e",margin:0}}>Ranking de Clientes</h2>
              <p style={{color:"#aaa",fontSize:13,margin:"4px 0 0",fontWeight:300}}>Ordenado por valor total de compras</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <input placeholder="Buscar cliente..." value={search} onChange={e=>setSearch(e.target.value)}
                style={{padding:"9px 18px",border:"1px solid #e8e4de",borderRadius:40,fontFamily:"'Inter',sans-serif",fontSize:13,outline:"none",background:"#fff",width:200,color:"#1a1a2e"}}/>
              <button onClick={handleExportClients} style={{padding:"9px 18px",background:"#1a1a2e",border:"none",borderRadius:10,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:13,color:"#fff",fontWeight:500,display:"flex",alignItems:"center",gap:6}}>
                ↓ Exportar CSV
              </button>
            </div>
          </div>
          <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#faf9f7",borderBottom:"1px solid #e8e4de"}}>
                  {["#","Cliente","Pedidos","Total Gasto","Ticket Médio","Participação"].map(h=>(
                    <th key={h} style={{padding:"12px 18px",textAlign:"left",fontSize:10,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.1em",color:"#aaa",textTransform:"uppercase",fontWeight:500}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredClients.slice(0,50).map(c=>{
                  const rank=overview.clientList.indexOf(c)+1;
                  const pct=overview.revenue?(c.total/overview.revenue*100).toFixed(1):0;
                  return <tr key={c.id} onClick={()=>setSelectedClient(c)} style={{borderBottom:"1px solid #f5f2ee",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#faf9f7"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"12px 18px"}}><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:rank<=3?"#1a1a2e":"#ccc",fontWeight:rank<=3?700:400}}>{rank<=3?["🥇","🥈","🥉"][rank-1]:`#${rank}`}</span></td>
                    <td style={{padding:"12px 18px"}}><div style={{fontWeight:500,color:"#1a1a2e",fontSize:14}}>{c.name||"—"}</div><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"#ccc"}}>{c.id}</div></td>
                    <td style={{padding:"12px 18px",fontFamily:"'JetBrains Mono',monospace",fontSize:13,color:"#666"}}>{c.orders}</td>
                    <td style={{padding:"12px 18px",fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:600,color:"#1a1a2e"}}>{fmt(c.total)}</td>
                    <td style={{padding:"12px 18px",fontFamily:"'JetBrains Mono',monospace",fontSize:13,color:"#666"}}>{fmt(c.orders?c.total/c.orders:0)}</td>
                    <td style={{padding:"12px 18px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:60,height:6,background:"#f0ede8",borderRadius:3}}><div style={{width:`${Math.min(pct*5,100)}%`,height:"100%",background:"#1a1a2e",borderRadius:3}}/></div>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"#aaa"}}>{pct}%</span>
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
            {filteredClients.length>50 && <div style={{padding:"14px",textAlign:"center",fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:"#bbb",borderTop:"1px solid #f0ede8"}}>Mostrando 50 de {fmtN(filteredClients.length)} clientes · Use exportar para ver todos</div>}
          </div>
        </>}

        {/* Pedidos */}
        {tab==="orders" && <>
          <div style={{marginBottom:20}}>
            <h2 style={{fontFamily:"'Outfit',sans-serif",fontSize:22,color:"#1a1a2e",margin:0}}>Todos os Pedidos</h2>
            <p style={{color:"#aaa",fontSize:13,margin:"4px 0 0",fontWeight:300}}>{fmtN(data.length)} registros carregados</p>
          </div>
          <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:14,overflow:"auto",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:800}}>
              <thead>
                <tr style={{background:"#faf9f7",borderBottom:"1px solid #e8e4de"}}>
                  {Object.keys(data[0]||{}).slice(0,10).map(h=>(
                    <th key={h} style={{padding:"12px 14px",textAlign:"left",whiteSpace:"nowrap",fontSize:10,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.08em",color:"#aaa",textTransform:"uppercase",fontWeight:500}}>{h.slice(0,22)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0,100).map((row,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #f5f2ee"}} onMouseEnter={e=>e.currentTarget.style.background="#faf9f7"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    {Object.values(row).slice(0,10).map((v,j)=>(
                      <td key={j} style={{padding:"11px 14px",fontSize:13,color:"#555",whiteSpace:"nowrap"}}>{String(v||"—").slice(0,30)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length>100 && <div style={{padding:"14px",textAlign:"center",fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:"#bbb",borderTop:"1px solid #f0ede8"}}>Mostrando 100 de {fmtN(data.length)} registros</div>}
          </div>
        </>}
      </div>

      {/* Painel de detalhe do cliente */}
    {selectedClient && overview && (
      <>
        <div onClick={()=>setSelectedClient(null)} style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.18)", zIndex:199 }}/>
        <div style={{ position:"fixed", top:0, right:0, width:440, height:"100vh", background:"#fff", boxShadow:"-4px 0 28px rgba(0,0,0,0.13)", zIndex:200, display:"flex", flexDirection:"column" }}>
          {/* Header */}
          <div style={{ padding:"24px 28px", borderBottom:"1px solid #f0ede8", display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexShrink:0 }}>
            <div>
              <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:6 }}>Detalhe do Cliente</div>
              <div style={{ fontSize:20, fontWeight:600, fontFamily:"'Outfit',sans-serif", color:"#1a1a2e", lineHeight:1.2 }}>{selectedClient.name}</div>
              {selectedClient.id !== selectedClient.name && (
                <div style={{ fontSize:11, color:"#ccc", fontFamily:"'JetBrains Mono',monospace", marginTop:4 }}>{selectedClient.id}</div>
              )}
            </div>
            <button onClick={()=>setSelectedClient(null)} style={{ background:"#f5f2ee", border:"none", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:20, color:"#666", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
          </div>
          {/* KPIs */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, padding:"20px 28px 12px", flexShrink:0 }}>
            {[
              { label:"Total Gasto",   value:fmt(selectedClient.total) },
              { label:"Pedidos",       value:fmtN(selectedClient.orders) },
              { label:"Ticket Médio",  value:fmt(selectedClient.orders ? selectedClient.total/selectedClient.orders : 0) },
              { label:"Participação",  value:overview.revenue ? (selectedClient.total/overview.revenue*100).toFixed(2)+"%" : "—" },
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
                {clientDetail.first && clientDetail.last && clientDetail.first.getTime() !== clientDetail.last.getTime() && (
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
            <div style={{ padding:"0 28px 16px", flexShrink:0 }}>
              <div style={{ background:"#faf9f7", borderRadius:10, padding:"12px 14px", display:"flex", flexWrap:"wrap", gap:12 }}>
                {clientDetail.personType && <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#555" }}>👤 {clientDetail.personType}</span>}
                {clientDetail.gender && <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#555" }}>{clientDetail.gender==="M"||clientDetail.gender==="m"?"♂ Masculino":"♀ Feminino"}</span>}
                {clientDetail.city && clientDetail.state && <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#555" }}>📍 {clientDetail.city}, {clientDetail.state}</span>}
                {clientDetail.city && !clientDetail.state && <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#555" }}>📍 {clientDetail.city}</span>}
                {clientDetail.email && <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#555" }}>✉ {clientDetail.email}</span>}
                {clientDetail.phone && <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#555" }}>📞 {clientDetail.phone}</span>}
              </div>
            </div>
          )}
          {/* Histórico */}
          <div style={{ padding:"0 28px 12px", flexShrink:0 }}>
            <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.12em" }}>
              Histórico de Pedidos · {fmtN(clientOrders.length)} registros
            </div>
          </div>
          <div style={{ overflowY:"auto", flex:1, padding:"0 28px 28px" }}>
            {clientOrders.length === 0 ? (
              <div style={{ fontSize:13, color:"#bbb", fontFamily:"'JetBrains Mono',monospace" }}>Nenhum pedido encontrado.</div>
            ) : (
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr>
                    {["Data","Status","Valor"].map(h=>(
                      <th key={h} style={{ padding:"8px 6px", textAlign: h==="Valor"?"right":"left", fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#aaa", textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:500, borderBottom:"1px solid #f0ede8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientOrders.map((r,i)=>{
                    const dk = findKey(r,"data");
                    const vk = findKey(r,"valor");
                    const sk = findKey(r,"status");
                    const d = dk ? parseDate(r[dk]) : null;
                    const v = parseVal(vk ? r[vk] : 0);
                    const s = sk ? r[sk] : "—";
                    return (
                      <tr key={i} style={{ borderBottom:"1px solid #f5f2ee" }}>
                        <td style={{ padding:"10px 6px", fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#555" }}>{d ? d.toLocaleDateString("pt-BR") : "—"}</td>
                        <td style={{ padding:"10px 6px", fontSize:12, color:"#888" }}>{s}</td>
                        <td style={{ padding:"10px 6px", fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:600, color:"#1a1a2e", textAlign:"right" }}>{fmt(v)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </>
    )}
  </div>
  );
}
