import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";

// ═══════════════════════════════════════════════════════════════════════
//  SUPABASE CONFIG
// ═══════════════════════════════════════════════════════════════════════
const SB_URL = "https://xrltpqfxcmyxbiocdtnn.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhybHRwcWZ4Y215eGJpb2NkdG5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTA2NDMsImV4cCI6MjA4OTQyNjY0M30.yD57yQxKuNCo5GSFPmfNLcZEoIeUGM21UYR8YwKzJLM";
const HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

// ─── AUTH ────────────────────────────────────────────────────────────────────
async function authSignIn(email, password) {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "apikey": SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.msg || "Credenciais inválidas");
  return data;
}
async function authSignOut(token) {
  await fetch(`${SB_URL}/auth/v1/logout`, {
    method: "POST",
    headers: { "apikey": SB_KEY, "Authorization": `Bearer ${token}` },
  });
}
const TBL = `${SB_URL}/rest/v1/usuarios`;

// Normaliza campos JSONB que podem vir como string do Supabase
function parseJSONField(v, fallback) {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : fallback; } catch(e) { return fallback; }
  }
  return fallback;
}
function mesDefault() { return Array.from({length:12},(_,i)=>({n:i+1,v:"",h:"24",d:"30",s:"1"})); }
function normalizar(u) {
  if (!u || typeof u !== "object") return u;
  const meses     = parseJSONField(u.meses, mesDefault());
  const medidores = parseJSONField(u.medidores, []);
  const _hist     = parseJSONField(u._hist, []);
  const mesNorm   = Array.isArray(meses) && meses.length === 12 ? meses : mesDefault();
  return { ...u, meses: mesNorm, medidores, _hist };
}

async function dbGetAll() {
  const r = await fetch(`${TBL}?select=*&order=usuario.asc`, { headers: HDR });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.map(normalizar);
}
async function dbSave(u) {
  const r = await fetch(TBL, {
    method: "POST",
    headers: { ...HDR, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(u),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function dbSaveMany(list) {
  const r = await fetch(TBL, {
    method: "POST",
    headers: { ...HDR, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(list),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function dbDelete(id) {
  const r = await fetch(`${TBL}?_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: HDR });
  if (!r.ok) throw new Error(await r.text());
}

// ═══════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════
const OP_BASE = 400000, EXP_BASE = 400999;
const C = {
  bg:"#f0f4f8", card:"#ffffff", border:"#e2e8f0",
  navy:"#0f2d5e", blue:"#1a56db", blueSoft:"#eff6ff",
  text:"#0f172a", sub:"#475569", muted:"#94a3b8",
  green:"#059669", greenBg:"#f0fdf4",
  amber:"#d97706", amberBg:"#fffbeb",
  red:"#dc2626",   redBg:"#fef2f2",
  purple:"#7c3aed",purpleBg:"#f5f3ff",
  gray:"#6b7280",  grayBg:"#f9fafb",
};
const SUB_BACIAS = ["ALTO ATIBAIA","BAIXO ATIBAIA","CAMANDUCAIA","CAPIVARI",
  "CORUMBATAI","JAGUARI","JUNDIAI","MEDIO TIETE","PIRACICABA","SOROCABA"];
const MA = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const STATUS_CFG = {
  EXPERIMENTAL:{ label:"Experimental", color:C.purple, bg:C.purpleBg, icon:"🧪" },
  OPERACIONAL: { label:"Operacional",  color:C.green,  bg:C.greenBg,  icon:"✅" },
  HISTORICO:   { label:"Histórico",    color:C.gray,   bg:C.grayBg,   icon:"📦" },
};

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════
const uid      = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const isoHoje  = () => new Date().toISOString().slice(0, 10);
const brHoje   = () => new Date().toLocaleDateString("pt-BR");

function parseBR(s) {
  if (!s) return null;
  const p = String(s).trim().split("/");
  if (p.length !== 3) return null;
  const d = new Date(+p[2], +p[1] - 1, +p[0]);
  return isNaN(d) ? null : d;
}
function diasAte(dt) {
  const d = parseBR(dt); if (!d) return null;
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.floor((d - h) / 86400000);
}
function vencBadge(dias) {
  if (dias === null) return null;
  if (dias < 0)   return { c:C.red,   bg:C.redBg,   t:`Vencida ${Math.abs(dias)}d`, i:"🔴" };
  if (dias <= 30) return { c:C.red,   bg:C.redBg,   t:`${dias}d restantes`,          i:"🔴" };
  if (dias <= 90) return { c:C.amber, bg:C.amberBg, t:`${dias}d restantes`,          i:"🟡" };
  return null;
}
function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
function detectStatus(cod) { const n = parseInt(cod); return isNaN(n) || n < 400500 ? "OPERACIONAL" : "EXPERIMENTAL"; }
function proxNum(lista, tipo) {
  const ns = lista.map(u => parseInt(u.usuario)).filter(n => !isNaN(n));
  if (tipo === "OPERACIONAL") { let n = OP_BASE; while (ns.includes(n)) n++; return String(n); }
  else { let n = EXP_BASE; while (ns.includes(n)) n--; return String(n); }
}
function emptyMeses() { return Array.from({length:12}, (_, i) => ({n:i+1, v:"", h:"24", d:"30", s:"1"})); }
function usuarioVazio(tipo, lista = []) {
  return {
    _id: uid(), usuario: proxNum(lista, tipo), documento: "", identificacao: "",
    processo: "", portaria: "", dtportaria: "", dtvalidade: "", finalidade: "E",
    dominialidade: "ESTADUAL", sub_bacia: "PIRACICABA", sazonalidade: "NAO",
    meses: emptyMeses(), contato: "", qtdemedidores: "1", chave: "",
    observacao: "", inicio_operacao: "", unidade_medida: "m3/s",
    em_testes: tipo === "EXPERIMENTAL",
    medidores: [{num:"01", curso:"", int:"10", lng:"", lat:""}],
    status: tipo, _expOrigem: null, _dtCadastro: isoHoje(),
    _dtPromocao: null, _dtArquivamento: null, _motivo: "",
    _hist: [{dt: isoHoje(), tipo:"CADASTRO", desc:`Cadastrado como ${tipo}`}],
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  XML GENERATOR
// ═══════════════════════════════════════════════════════════════════════
function gerarXML(lista) {
  const L = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<SIDECC-R xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'];
  for (const u of lista) {
    L.push("\t<USUARIO>");
    [["USUARIO",u.usuario],["DOCUMENTO",u.documento],["IDENTIFICACAO",u.identificacao],
     ["PROCESSO",u.processo],["PORTARIA",u.portaria],["DTPORTARIA",u.dtportaria],
     ["DTVALIDADE",u.dtvalidade],["FINALIDADE",u.finalidade],["DOMINIALIDADE",u.dominialidade],
     ["SUB_BACIA",u.sub_bacia],["SAZONALIDADE",u.sazonalidade]
    ].forEach(([k,v]) => L.push(`\t\t<${k}>${esc(v)}</${k}>`));
    (u.meses||[]).forEach((m, i) => {
      L.push("\t\t<MES>");
      L.push(`\t\t\t<NUMERO>${i+1}</NUMERO>`);
      L.push(`\t\t\t<VAZAO_M3H>${parseFloat(m.v||0).toFixed(3)}</VAZAO_M3H>`);
      L.push(`\t\t\t<VAZAO_HORA_DIA>${esc(m.h??24)}</VAZAO_HORA_DIA>`);
      L.push(`\t\t\t<VAZAO_DIA_MES>${esc(m.d??30)}</VAZAO_DIA_MES>`);
      L.push(`\t\t\t<SAZONAL>${esc(m.s??1)}</SAZONAL>`);
      L.push("\t\t</MES>");
    });
    [["CONTATO",u.contato],["QTDEMEDIDORES",u.qtdemedidores],["CHAVE",u.chave],
     ["OBSERVACAO",u.observacao],["INICIO_OPERACAO",u.inicio_operacao],["UNIDADE_MEDIDA",u.unidade_medida]
    ].forEach(([k,v]) => L.push(`\t\t<${k}>${esc(v)}</${k}>`));
    if (u.em_testes) L.push(`\t\t<USUARIO_EM_TESTES>Transmissão em caráter de teste</USUARIO_EM_TESTES>`);
    (u.medidores||[]).filter(m => m.curso).forEach(m => {
      L.push("\t\t<MEDIDOR>");
      L.push(`\t\t\t<NUMERO>${esc(m.num)}</NUMERO>`);
      L.push(`\t\t\t<CURSODAGUA>${esc(m.curso)}</CURSODAGUA>`);
      L.push(`\t\t\t<INTERVALO>${esc(m.int)}</INTERVALO>`);
      L.push(`\t\t\t<COORD_LONGITUDE>${esc(m.lng)}</COORD_LONGITUDE>`);
      L.push(`\t\t\t<COORD_LATITUDE>${esc(m.lat)}</COORD_LATITUDE>`);
      L.push("\t\t</MEDIDOR>");
    });
    L.push("\t</USUARIO>");
  }
  L.push("</SIDECC-R>");
  return L.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════
//  XLSX IMPORTER
// ═══════════════════════════════════════════════════════════════════════
function parseXLSX(buf) {
  const wb = XLSX.read(buf, {type:"array"});
  const sn = wb.SheetNames.find(n => n.includes("EXPORTACAOXML")) || wb.SheetNames.find(n => n.includes("USUARIOS")) || wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sn], {header:1, defval:null});
  const rows = raw.slice(2).filter(r => r[0] != null && String(r[0]).trim() !== "");
  return rows.map(row => {
    const g = i => row[i] != null ? String(row[i]).trim() : "";
    const meses = Array.from({length:12}, (_, m) => { const b = 11 + m*5; return {n:m+1, v:g(b+1), h:g(b+2)||"24", d:g(b+3)||"30", s:g(b+4)||"1"}; });
    const medidores = []; let mi = 77, mn = 1;
    while (mi < (row.length||0)) { const c = g(mi+1); if (c) medidores.push({num:g(mi)||String(mn).padStart(2,"0"), curso:c, int:g(mi+2)||"10", lng:g(mi+3), lat:g(mi+4)}); mi+=5; mn++; }
    const cod = g(0), st = detectStatus(cod);
    return {
      _id: uid(), usuario: cod, documento: g(1), identificacao: g(2), processo: g(3),
      portaria: g(4), dtportaria: g(5), dtvalidade: g(6), finalidade: g(7),
      dominialidade: g(8), sub_bacia: g(9), sazonalidade: g(10), meses,
      contato: g(71), qtdemedidores: String(medidores.length||g(72)||1),
      chave: g(73), observacao: g(74), inicio_operacao: g(75), unidade_medida: g(76)||"m3/s",
      em_testes: st === "EXPERIMENTAL", medidores, status: st,
      _expOrigem: null, _dtCadastro: isoHoje(), _dtPromocao: null,
      _dtArquivamento: null, _motivo: "",
      _hist: [{dt: isoHoje(), tipo:"IMPORTACAO", desc:`Importado via XLSX como ${st}`}],
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  UI ATOMS
// ═══════════════════════════════════════════════════════════════════════
const inp = {width:"100%",padding:"8px 11px",border:`1.5px solid ${C.border}`,borderRadius:7,fontSize:13,color:C.text,background:"#fff",outline:"none",boxSizing:"border-box",fontFamily:"inherit"};

function Btn({children,onClick,v="primary",style={},disabled,title,sm}){
  const M = {
    primary:{background:C.blue,color:"#fff",border:"none"},
    outline:{background:"#fff",color:C.blue,border:`1.5px solid ${C.blue}`},
    ghost:{background:"transparent",color:C.sub,border:`1.5px solid ${C.border}`},
    success:{background:C.green,color:"#fff",border:"none"},
    danger:{background:C.red,color:"#fff",border:"none"},
    warning:{background:C.amber,color:"#fff",border:"none"},
    dark:{background:C.navy,color:"#fff",border:"none"},
  };
  return <button disabled={disabled} onClick={onClick} title={title} style={{...M[v],borderRadius:8,padding:sm?"5px 11px":"9px 18px",fontSize:sm?11:13,fontWeight:700,cursor:disabled?"not-allowed":"pointer",opacity:disabled?.5:1,display:"inline-flex",alignItems:"center",gap:5,whiteSpace:"nowrap",...style}}>{children}</button>;
}
function Chip({children,color,bg}){ return <span style={{background:bg,color,borderRadius:20,padding:"3px 11px",fontSize:11,fontWeight:700,letterSpacing:"0.04em",display:"inline-flex",alignItems:"center",gap:4}}>{children}</span>; }
function StatusChip({status}){ const cfg = STATUS_CFG[status]||STATUS_CFG.HISTORICO; return <Chip color={cfg.color} bg={cfg.bg}>{cfg.icon} {cfg.label}</Chip>; }
function Card({children,style={}}){ return <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",...style}}>{children}</div>; }
function SecTitle({children}){ return <div style={{fontWeight:800,fontSize:11,color:C.blue,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:12,borderBottom:`2px solid ${C.border}`,paddingBottom:7}}>{children}</div>; }
function Lbl({children}){ return <div style={{fontSize:10.5,fontWeight:700,color:C.muted,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:4}}>{children}</div>; }
function Fld({label,children,style={}}){ return <div style={{marginBottom:12,...style}}><Lbl>{label}</Lbl>{children}</div>; }
function Inp({value,onChange,placeholder,type="text",readOnly}){
  const[f,sf]=useState(false);
  return <input type={type} value={value??""} onChange={onChange} placeholder={placeholder} readOnly={readOnly} style={{...inp,borderColor:f?C.blue:C.border,background:readOnly?"#f8fafc":"#fff"}} onFocus={()=>sf(true)} onBlur={()=>sf(false)}/>;
}
function Sel({value,onChange,children}){
  const[f,sf]=useState(false);
  return <select value={value??""} onChange={onChange} style={{...inp,borderColor:f?C.blue:C.border,cursor:"pointer"}} onFocus={()=>sf(true)} onBlur={()=>sf(false)}>{children}</select>;
}
function Textarea({value,onChange,rows=3,placeholder}){
  const[f,sf]=useState(false);
  return <textarea value={value??""} onChange={onChange} rows={rows} placeholder={placeholder} style={{...inp,borderColor:f?C.blue:C.border,resize:"vertical"}} onFocus={()=>sf(true)} onBlur={()=>sf(false)}/>;
}
function Overlay({children,z=1000}){ return <div style={{position:"fixed",inset:0,background:"rgba(15,45,94,0.45)",zIndex:z,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>{children}</div>; }
function Confirm({title,msg,onOk,onCancel,okLabel="Confirmar",okV="danger"}){
  return <Overlay z={3000}><div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:440,boxShadow:"0 20px 60px rgba(0,0,0,0.2)",overflow:"hidden"}}>
    <div style={{padding:"22px 24px"}}>
      <div style={{fontWeight:800,fontSize:16,color:C.text,marginBottom:8}}>{title}</div>
      {msg&&<div style={{fontSize:13,color:C.sub,lineHeight:1.7,marginBottom:18}}>{msg}</div>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn v="ghost" onClick={onCancel}>Cancelar</Btn>
        <Btn v={okV} onClick={onOk}>{okLabel}</Btn>
      </div>
    </div>
  </div></Overlay>;
}

// Loading overlay
function Loading({msg}){
  return <div style={{position:"fixed",inset:0,background:"rgba(15,45,94,0.6)",zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
    <div style={{width:44,height:44,border:"4px solid rgba(255,255,255,0.2)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
    <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{msg||"Aguarde..."}</div>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>;
}

// Error banner
function ErrBanner({msg,onClose}){
  if(!msg) return null;
  return <div style={{background:C.redBg,border:`1px solid ${C.red}`,borderRadius:10,padding:"12px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13,color:C.red,fontWeight:600}}>
    <span>⚠️ {msg}</span>
    <button onClick={onClose} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontWeight:700,fontSize:16,lineHeight:1}}>✕</button>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════
//  IMPORT MODAL
// ═══════════════════════════════════════════════════════════════════════
function ImportModal({onImport,onClose}){
  const ref=useRef();const[drag,setDrag]=useState(false);const[err,setErr]=useState("");
  const handle=file=>{
    if(!file)return;
    const r=new FileReader();
    r.onload=e=>{try{const us=parseXLSX(e.target.result);onImport(us);}catch(ex){setErr("Erro ao ler: "+ex.message);}};
    r.readAsArrayBuffer(file);
  };
  return <Overlay z={1500}><div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:560,overflow:"hidden",boxShadow:"0 24px 60px rgba(0,0,0,0.2)"}}>
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.blue})`,padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{color:"#fff",fontWeight:800,fontSize:16}}>📥 Importar Planilha XLSX</div>
      <button onClick={onClose} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontWeight:700}}>✕</button>
    </div>
    <div style={{padding:"24px"}}>
      {err&&<div style={{background:C.redBg,color:C.red,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,fontWeight:600}}>⚠️ {err}</div>}
      <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);handle(e.dataTransfer.files[0]);}}
        onClick={()=>ref.current.click()}
        style={{border:`2px dashed ${drag?C.blue:C.border}`,borderRadius:12,padding:"40px 24px",textAlign:"center",cursor:"pointer",background:drag?"#eff6ff":"#f8fafc",transition:"all 0.2s"}}>
        <input ref={ref} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>handle(e.target.files[0])}/>
        <div style={{fontSize:36,marginBottom:10}}>📊</div>
        <div style={{fontWeight:700,fontSize:14,color:C.text,marginBottom:4}}>Arraste o arquivo XLSX ou clique para selecionar</div>
        <div style={{fontSize:12,color:C.muted}}>Aba EXPORTACAOXML_V01 ou USUARIOS_INCLUIDOS_SIDECCR_V01</div>
      </div>
      <div style={{marginTop:16,padding:"12px 14px",background:C.blueSoft,borderRadius:8,fontSize:12.5,color:C.blue}}>
        ✅ Tags dos meses corrigidas · Medidores vazios removidos · Status detectado pelo código · Dados salvos no Supabase
      </div>
    </div>
  </div></Overlay>;
}

// ═══════════════════════════════════════════════════════════════════════
//  PROMOVER MODAL
// ═══════════════════════════════════════════════════════════════════════
function PromoverModal({u,novoNum,onConfirm,onClose}){
  return <Overlay z={1500}><div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:500,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
    <div style={{background:`linear-gradient(135deg,${C.purple},#5b21b6)`,padding:"20px 24px"}}>
      <div style={{color:"#fff",fontWeight:800,fontSize:17}}>🚀 Promover para Operacional</div>
    </div>
    <div style={{padding:"24px"}}>
      <div style={{background:C.purpleBg,borderRadius:10,padding:"14px",marginBottom:8,border:`1px solid #ddd6fe`}}>
        <div style={{fontSize:11,fontWeight:700,color:C.purple,textTransform:"uppercase",marginBottom:6}}>Experimental → ficará como Histórico</div>
        <div style={{fontWeight:800,color:C.text}}>{u.identificacao}</div>
        <div style={{color:C.muted,fontSize:13,marginTop:2}}>Código: <strong>{u.usuario}</strong></div>
      </div>
      <div style={{textAlign:"center",fontSize:20,color:C.muted,margin:"8px 0"}}>↓</div>
      <div style={{background:C.greenBg,borderRadius:10,padding:"14px",marginBottom:16,border:`1px solid #bbf7d0`}}>
        <div style={{fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",marginBottom:6}}>Novo Operacional — data de hoje</div>
        <div style={{fontWeight:800,color:C.text}}>{u.identificacao}</div>
        <div style={{color:C.muted,fontSize:13,marginTop:2}}>Novo código: <strong style={{color:C.green,fontSize:15}}>{novoNum}</strong></div>
      </div>
      <div style={{background:C.amberBg,borderRadius:8,padding:"10px 14px",marginBottom:20,border:`1px solid #fde68a`,fontSize:12.5,color:"#92400e"}}>
        ⚖️ Data <strong>{brHoje()}</strong> registrada como data de promoção. Registro experimental <strong>{u.usuario}</strong> preservado como Histórico para auditoria jurídica.
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn v="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn v="success" onClick={onConfirm}>✅ Confirmar Promoção</Btn>
      </div>
    </div>
  </div></Overlay>;
}

// ═══════════════════════════════════════════════════════════════════════
//  ARQUIVAR MODAL
// ═══════════════════════════════════════════════════════════════════════
function ArquivarModal({u,onConfirm,onClose}){
  const[motivo,setMotivo]=useState("");
  return <Overlay z={1500}><div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:500,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.25)"}}>
    <div style={{background:"linear-gradient(135deg,#374151,#1f2937)",padding:"20px 24px"}}>
      <div style={{color:"#fff",fontWeight:800,fontSize:17}}>📦 Mover para Histórico</div>
      <div style={{color:"rgba(255,255,255,0.7)",fontSize:13,marginTop:3}}>Encerramento de usuário operacional</div>
    </div>
    <div style={{padding:"24px"}}>
      <div style={{background:C.grayBg,borderRadius:10,padding:"14px",marginBottom:16}}>
        <div style={{fontWeight:800,color:C.text}}>{u.identificacao}</div>
        <div style={{color:C.muted,fontSize:13,marginTop:2}}>Código: <strong>{u.usuario}</strong></div>
      </div>
      <Fld label="Motivo do encerramento *">
        <Textarea value={motivo} onChange={e=>setMotivo(e.target.value)} rows={3}
          placeholder="Ex: Vencimento de outorga · Cancelamento a pedido · Suspensão administrativa..."/>
        <div style={{fontSize:11,color:C.muted,marginTop:4}}>Obrigatório — registrado na trilha de auditoria.</div>
      </Fld>
      <div style={{background:C.amberBg,borderRadius:8,padding:"10px 14px",marginBottom:20,border:`1px solid #fde68a`,fontSize:12.5,color:"#92400e"}}>
        ⚖️ Movido para Histórico em <strong>{brHoje()}</strong>. Disponível apenas para consulta.
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn v="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn v="warning" disabled={!motivo.trim()} onClick={()=>onConfirm(motivo.trim())}>📦 Confirmar</Btn>
      </div>
    </div>
  </div></Overlay>;
}

// ═══════════════════════════════════════════════════════════════════════
//  AUDITORIA MODAL
// ═══════════════════════════════════════════════════════════════════════
function AuditoriaModal({u,todos,onClose}){
  const expOrig = u._expOrigem ? todos.find(x => x.usuario === u._expOrigem) : null;
  const exp  = u.status==="EXPERIMENTAL" || (u._expOrigem===null&&u.status==="HISTORICO"&&!todos.find(x=>x._expOrigem===u.usuario)) ? u : expOrig;
  const op   = u.status==="OPERACIONAL" ? u : todos.find(x => x._expOrigem === u.usuario);
  const allHist = [...(exp?exp._hist||[]:[]), ...(op&&op!==exp?op._hist||[]:[])].sort((a,b)=>a.dt<b.dt?-1:1);

  function exportAudit(){
    const wb=XLSX.utils.book_new();
    const resumo=[["RELATÓRIO DE AUDITORIA — SiDeCC-R"],["Gerado em:",new Date().toLocaleString("pt-BR")],[],
      ["USUÁRIO"],["Nome:",u.identificacao],["CNPJ/CPF:",u.documento],[],
      ["LINHA DO TEMPO"],["Fase","Código","Data Início","Data Encerramento","Observação"]];
    if(exp) resumo.push(["EXPERIMENTAL",exp.usuario,exp._dtCadastro||"—",exp._dtPromocao||"Em andamento","Período experimental Sala de Situação PCJ"]);
    if(op&&op!==exp) resumo.push(["OPERACIONAL",op.usuario,op._dtPromocao||op._dtCadastro||"—",op._dtArquivamento||"Em andamento",op._motivo||"—"]);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(resumo),"Resumo");
    if(exp){const rows=[["PERÍODO EXPERIMENTAL"],["Código:",exp.usuario],["Cadastro:",exp._dtCadastro||"—"],["Promoção:",exp._dtPromocao||"—"],[],["Mês","Vazão m³/h","Horas/dia","Dias/mês"],...(exp.meses||[]).map((m,i)=>[i+1,m.v,m.h,m.d])];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),"Experimental");}
    if(op&&op!==exp){const rows=[["PERÍODO OPERACIONAL"],["Código:",op.usuario],["Início:",op._dtPromocao||op._dtCadastro||"—"],["Encerramento:",op._dtArquivamento||"Em andamento"],["Motivo:",op._motivo||"—"],[],["Mês","Vazão m³/h","Horas/dia","Dias/mês"],...(op.meses||[]).map((m,i)=>[i+1,m.v,m.h,m.d])];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),"Operacional");}
    XLSX.writeFile(wb,`auditoria_${u.identificacao.slice(0,25).replace(/\s+/g,"_")}.xlsx`);
  }

  return <Overlay z={1500}><div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:900,maxHeight:"90vh",overflow:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.25)"}}>
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.blue})`,padding:"18px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:10}}>
      <div>
        <div style={{color:"rgba(255,255,255,0.65)",fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>⚖️ Trilha de Auditoria Jurídica</div>
        <div style={{color:"#fff",fontSize:17,fontWeight:800,marginTop:2}}>{u.identificacao}</div>
        <div style={{color:"rgba(255,255,255,0.7)",fontSize:12,marginTop:1}}>{u.documento}</div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn onClick={exportAudit} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"1.5px solid rgba(255,255,255,0.3)"}}>⬇ Exportar XLSX</Btn>
        <Btn v="ghost" onClick={onClose} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"1.5px solid rgba(255,255,255,0.3)"}}>✕</Btn>
      </div>
    </div>
    <div style={{background:"#fffbeb",borderLeft:`4px solid ${C.amber}`,padding:"12px 20px",fontSize:13,color:"#92400e",display:"flex",gap:10}}>
      <span>⚖️</span><span>Em caso de autuação ou multa, os dados do período experimental são juridicamente vinculados ao CNPJ <strong>{u.documento}</strong>, independentemente da posterior migração para operacional.</span>
    </div>
    <div style={{padding:"22px 24px"}}>
      <SecTitle>Linha do Tempo</SecTitle>
      <div style={{display:"flex",borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`,marginBottom:24}}>
        {exp&&<div style={{flex:1,background:C.purpleBg,padding:"16px",borderRight:`1px solid ${C.border}`}}>
          <div style={{fontWeight:800,color:C.purple,fontSize:12,marginBottom:8}}>🧪 PERÍODO EXPERIMENTAL</div>
          <div style={{fontWeight:700,color:C.text,fontSize:14}}>{exp.usuario}</div>
          <div style={{fontSize:12,color:C.muted,marginTop:4}}>Início: <strong>{exp._dtCadastro||"—"}</strong></div>
          {exp._dtPromocao&&<div style={{fontSize:12,color:C.muted}}>Promoção: <strong>{exp._dtPromocao}</strong></div>}
          <div style={{marginTop:8,fontSize:11.5,color:C.purple,fontStyle:"italic"}}>⚠️ Multas neste período vinculam-se a este código</div>
        </div>}
        {exp&&op&&op!==exp&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 16px",background:"#f8fafc",minWidth:70}}>
          <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Promoção</div>
          <div style={{fontSize:20}}>→</div>
          <div style={{fontSize:11,color:C.green,fontWeight:700,marginTop:4}}>{op._dtPromocao||"—"}</div>
        </div>}
        {op&&op!==exp&&<div style={{flex:1,background:op._dtArquivamento?C.grayBg:C.greenBg,padding:"16px"}}>
          <div style={{fontWeight:800,color:op._dtArquivamento?C.gray:C.green,fontSize:12,marginBottom:8}}>{op._dtArquivamento?"📦 HISTÓRICO":"✅ OPERACIONAL"}</div>
          <div style={{fontWeight:700,color:C.text,fontSize:14}}>{op.usuario}</div>
          <div style={{fontSize:12,color:C.muted,marginTop:4}}>Início: <strong>{op._dtPromocao||op._dtCadastro||"—"}</strong></div>
          {op._dtArquivamento&&<div style={{fontSize:12,color:C.muted}}>Encerrado: <strong>{op._dtArquivamento}</strong></div>}
          {op._motivo&&<div style={{fontSize:11.5,color:C.muted,marginTop:4,fontStyle:"italic"}}>{op._motivo}</div>}
        </div>}
        {!op&&u.status==="EXPERIMENTAL"&&!u._dtArquivamento&&<div style={{flex:1,background:"#f8fafc",padding:"16px",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{textAlign:"center",color:C.muted}}><div style={{fontSize:28,marginBottom:8}}>⏳</div><div style={{fontWeight:700}}>Ainda em fase experimental</div></div>
        </div>}
      </div>
      <SecTitle>Log de Eventos</SecTitle>
      <div style={{borderRadius:10,overflow:"hidden",border:`1px solid ${C.border}`}}>
        {allHist.length===0&&<div style={{padding:"20px",textAlign:"center",color:C.muted,fontSize:13}}>Nenhum evento registrado.</div>}
        {allHist.map((h,i)=><div key={i} style={{display:"flex",gap:12,padding:"10px 16px",borderBottom:i<allHist.length-1?`1px solid ${C.border}`:"none",background:i%2===0?"#fff":"#fafafa"}}>
          <div style={{fontSize:10,color:C.muted,fontWeight:700,whiteSpace:"nowrap",minWidth:90,paddingTop:2}}>{h.dt}</div>
          <div style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,background:h.tipo==="PROMOCAO"?C.greenBg:h.tipo==="ARQUIVAMENTO"?C.grayBg:C.blueSoft,color:h.tipo==="PROMOCAO"?C.green:h.tipo==="ARQUIVAMENTO"?C.gray:C.blue,whiteSpace:"nowrap",height:"fit-content"}}>{h.tipo}</div>
          <div style={{fontSize:13,color:C.text}}>{h.desc}</div>
        </div>)}
      </div>
    </div>
  </div></Overlay>;
}

// ═══════════════════════════════════════════════════════════════════════
//  USER FORM MODAL
// ═══════════════════════════════════════════════════════════════════════
function UserModal({u,todos,onSave,onClose}){
  const[d,sd]=useState({...u,meses:(u.meses||[]).map(m=>({...m})),medidores:(u.medidores||[]).map(m=>({...m}))});
  const set=(k,v)=>sd(p=>({...p,[k]:v}));
  const setM=(i,k,v)=>sd(p=>({...p,meses:p.meses.map((m,j)=>j===i?{...m,[k]:v}:m)}));
  const setMed=(i,k,v)=>sd(p=>({...p,medidores:p.medidores.map((m,j)=>j===i?{...m,[k]:v}:m)}));
  const applyAll=v=>sd(p=>({...p,meses:p.meses.map(m=>({...m,v}))}));
  const addMed=()=>sd(p=>({...p,medidores:[...p.medidores,{num:String(p.medidores.length+1).padStart(2,"0"),curso:"",int:"10",lng:"",lat:""}]}));
  const delMed=i=>sd(p=>({...p,medidores:p.medidores.filter((_,j)=>j!==i)}));
  const isHist=u.status==="HISTORICO";
  const bulkRef=useRef();

  return <Overlay z={1200}><div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:1000,maxHeight:"94vh",overflow:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.25)"}}>
    <div style={{padding:"15px 22px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff",zIndex:10}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontWeight:800,fontSize:15,color:C.text}}>{isHist?"👁 Visualizar":"✏️ Editar"} — {d.usuario||"—"}</span>
        <StatusChip status={d.status}/>
        {d._expOrigem&&<span style={{fontSize:11,color:C.muted,background:C.grayBg,padding:"2px 8px",borderRadius:10}}>Origem exp: <strong>{d._expOrigem}</strong></span>}
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn v="ghost" onClick={onClose}>Fechar</Btn>
        {!isHist&&<Btn onClick={()=>onSave(d)}>💾 Salvar</Btn>}
      </div>
    </div>
    {isHist&&<div style={{background:"#fffbeb",padding:"10px 22px",fontSize:12.5,color:"#92400e",borderBottom:`1px solid #fde68a`,display:"flex",gap:8,alignItems:"center"}}>
      ⚖️ Registro histórico — somente leitura. {u._motivo&&<>Motivo: <strong>{u._motivo}</strong></>}
    </div>}
    <div style={{padding:"20px 22px",opacity:isHist?.75:1,pointerEvents:isHist?"none":"auto"}}>
      <SecTitle>Identificação</SecTitle>
      <div style={{display:"grid",gridTemplateColumns:"120px 1fr 2fr",gap:12,marginBottom:4}}>
        <Fld label="Código"><Inp value={d.usuario} onChange={e=>set("usuario",e.target.value)}/></Fld>
        <Fld label="CNPJ/CPF"><Inp value={d.documento} onChange={e=>set("documento",e.target.value)}/></Fld>
        <Fld label="Identificação"><Inp value={d.identificacao} onChange={e=>set("identificacao",e.target.value)} placeholder="Nome da empresa/entidade"/></Fld>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:12,marginBottom:16}}>
        <Fld label="Processo"><Inp value={d.processo} onChange={e=>set("processo",e.target.value)}/></Fld>
        <Fld label="Portaria"><Inp value={d.portaria} onChange={e=>set("portaria",e.target.value)}/></Fld>
        <Fld label="Dt. Portaria"><Inp value={d.dtportaria} onChange={e=>set("dtportaria",e.target.value)} placeholder="DD/MM/AAAA"/></Fld>
        <Fld label="Validade"><Inp value={d.dtvalidade} onChange={e=>set("dtvalidade",e.target.value)} placeholder="DD/MM/AAAA"/></Fld>
        <Fld label="Finalidade"><Sel value={d.finalidade} onChange={e=>set("finalidade",e.target.value)}>{["E","B","C","D"].map(v=><option key={v}>{v}</option>)}</Sel></Fld>
        <Fld label="Dominialidade"><Sel value={d.dominialidade} onChange={e=>set("dominialidade",e.target.value)}><option>ESTADUAL</option><option>FEDERAL</option></Sel></Fld>
        <Fld label="Sazonalidade"><Sel value={d.sazonalidade} onChange={e=>set("sazonalidade",e.target.value)}><option value="NAO">NÃO</option><option value="SIM">SIM</option></Sel></Fld>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <Fld label="Sub-Bacia"><Sel value={d.sub_bacia} onChange={e=>set("sub_bacia",e.target.value)}>{SUB_BACIAS.map(s=><option key={s}>{s}</option>)}</Sel></Fld>
        <Fld label="Status"><Sel value={d.status} onChange={e=>set("status",e.target.value)}><option value="EXPERIMENTAL">Experimental</option><option value="OPERACIONAL">Operacional</option></Sel></Fld>
      </div>
      <SecTitle>Vazões Mensais</SecTitle>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{fontSize:12,color:C.muted}}>Aplicar mesma vazão para todos os meses:</span>
        <input ref={bulkRef} placeholder="ex: 4320.000" style={{...inp,width:120,fontSize:12}}/>
        <Btn v="outline" sm onClick={()=>applyAll(bulkRef.current.value)}>Aplicar</Btn>
      </div>
      <div style={{overflowX:"auto",marginBottom:16}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:C.bg}}>{["Mês","Vazão m³/h","Horas/dia","Dias/mês","Sazonal"].map(h=><th key={h} style={{padding:"7px 10px",textAlign:"left",fontWeight:700,color:C.muted}}>{h}</th>)}</tr></thead>
          <tbody>{d.meses.map((m,i)=><tr key={i} style={{borderBottom:`1px solid ${C.border}`}}>
            <td style={{padding:"4px 10px",fontWeight:700,color:C.muted}}>{MA[i]}</td>
            <td style={{padding:3}}><Inp value={m.v} onChange={e=>setM(i,"v",e.target.value)}/></td>
            <td style={{padding:3}}><Inp value={m.h} onChange={e=>setM(i,"h",e.target.value)}/></td>
            <td style={{padding:3}}><Inp value={m.d} onChange={e=>setM(i,"d",e.target.value)}/></td>
            <td style={{padding:3}}><Inp value={m.s} onChange={e=>setM(i,"s",e.target.value)}/></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <SecTitle>Medidores</SecTitle>
        <Btn v="outline" sm onClick={addMed}>+ Medidor</Btn>
      </div>
      {d.medidores.map((m,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"70px 1fr 80px 1fr 1fr 36px",gap:8,marginBottom:8,alignItems:"end"}}>
        <Fld label="Nº"><Inp value={m.num} onChange={e=>setMed(i,"num",e.target.value)}/></Fld>
        <Fld label="Curso d'Água"><Inp value={m.curso} onChange={e=>setMed(i,"curso",e.target.value)} placeholder="JAGUARI,R"/></Fld>
        <Fld label="Intervalo (min)"><Inp value={m.int} onChange={e=>setMed(i,"int",e.target.value)}/></Fld>
        <Fld label="Longitude"><Inp value={m.lng} onChange={e=>setMed(i,"lng",e.target.value)}/></Fld>
        <Fld label="Latitude"><Inp value={m.lat} onChange={e=>setMed(i,"lat",e.target.value)}/></Fld>
        <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
          <button onClick={()=>delMed(i)} style={{background:C.redBg,color:C.red,border:"none",borderRadius:6,padding:"8px 10px",cursor:"pointer",fontWeight:700}}>✕</button>
        </div>
      </div>)}
      <SecTitle>Dados Operacionais</SecTitle>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr",gap:12,marginBottom:8}}>
        <Fld label="Contato (Email)"><Inp value={d.contato} onChange={e=>set("contato",e.target.value)}/></Fld>
        <Fld label="Qtde Medidores"><Inp value={d.qtdemedidores} onChange={e=>set("qtdemedidores",e.target.value)}/></Fld>
        <Fld label="Chave"><Inp value={d.chave} onChange={e=>set("chave",e.target.value)}/></Fld>
        <Fld label="Início Operação"><Inp value={d.inicio_operacao} onChange={e=>set("inicio_operacao",e.target.value)} placeholder="MM/AAAA"/></Fld>
        <Fld label="Unidade"><Sel value={d.unidade_medida} onChange={e=>set("unidade_medida",e.target.value)}><option>m3/s</option><option>l/s</option><option>m3/h</option></Sel></Fld>
      </div>
      <Fld label="Observação"><Textarea value={d.observacao} onChange={e=>set("observacao",e.target.value)} rows={3}/></Fld>
      <SecTitle>Auditoria</SecTitle>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 2fr",gap:12}}>
        <Fld label="Data de Cadastro"><Inp type="date" value={d._dtCadastro||""} onChange={e=>set("_dtCadastro",e.target.value)}/></Fld>
        <Fld label="Data de Promoção"><Inp type="date" value={d._dtPromocao||""} onChange={e=>set("_dtPromocao",e.target.value)}/></Fld>
        <Fld label="Data de Encerramento"><Inp type="date" value={d._dtArquivamento||""} onChange={e=>set("_dtArquivamento",e.target.value)}/></Fld>
        <Fld label="Motivo de Encerramento"><Inp value={d._motivo||""} onChange={e=>set("_motivo",e.target.value)} placeholder="Ex: Vencimento de outorga"/></Fld>
      </div>
      <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginTop:8}}>
        <input type="checkbox" checked={d.em_testes||false} onChange={e=>set("em_testes",e.target.checked)} style={{width:15,height:15}}/>
        <span style={{fontSize:13,fontWeight:700,color:C.amber}}>Transmissão em caráter de teste</span>
      </label>
    </div>
  </div></Overlay>;
}

// ═══════════════════════════════════════════════════════════════════════
//  SCREEN — DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
function Dashboard({usuarios,onNovo,onImport}){
  const op  =usuarios.filter(u=>u.status==="OPERACIONAL");
  const exp =usuarios.filter(u=>u.status==="EXPERIMENTAL");
  const hist=usuarios.filter(u=>u.status==="HISTORICO");
  const alertas=useMemo(()=>[...op,...exp].map(u=>{const dias=diasAte(u.dtvalidade);const b=vencBadge(dias);return b?{u,dias,b}:null;}).filter(Boolean).sort((a,b)=>a.dias-b.dias),[usuarios]);
  const recentes=useMemo(()=>{
    try{
      return usuarios.flatMap(u=>{
        const hist=Array.isArray(u._hist)?u._hist:[];
        return hist.map(h=>({...h,nome:u.identificacao||'',cod:u.usuario||''}));
      }).sort((a,b)=>b.dt<a.dt?-1:1).slice(0,8);
    }catch(e){return [];}
  },[usuarios]);
  const nextOp=proxNum(usuarios,"OPERACIONAL"),nextExp=proxNum(usuarios,"EXPERIMENTAL");
  const slotsOp=Math.max(0,500-op.length),slotsExp=Math.max(0,500-exp.length);
  return <div>
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.blue})`,borderRadius:16,padding:"28px 32px",marginBottom:20,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",right:-40,top:-40,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.04)"}}/>
      <div style={{color:"rgba(255,255,255,0.6)",fontSize:12,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Sistema de Gestão</div>
      <div style={{color:"#fff",fontSize:28,fontWeight:900,letterSpacing:"-0.02em",marginBottom:4}}>SiDeCC-R</div>
      <div style={{color:"rgba(255,255,255,0.7)",fontSize:14,marginBottom:20}}>Sala de Situação PCJ · Controle de Outorgas · Banco: Supabase ☁️</div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <Btn onClick={onNovo} style={{background:"#fff",color:C.navy}}>➕ Novo Usuário</Btn>
        <Btn onClick={onImport} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"1.5px solid rgba(255,255,255,0.3)"}}>📥 Importar XLSX</Btn>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
      {[
        {icon:"✅",label:"Operacionais",val:op.length,c:C.green,bg:C.greenBg,sub:`próx: ${nextOp}`},
        {icon:"🧪",label:"Experimentais",val:exp.length,c:C.purple,bg:C.purpleBg,sub:`próx: ${nextExp}`},
        {icon:"📦",label:"Histórico",val:hist.length,c:C.gray,bg:C.grayBg,sub:"auditoria"},
        {icon:"🔢",label:"Slots livres OP",val:slotsOp,c:slotsOp<50?C.red:C.amber,bg:slotsOp<50?C.redBg:C.amberBg,sub:"400000→400499"},
        {icon:"🔢",label:"Slots livres EXP",val:slotsExp,c:slotsExp<50?C.red:C.amber,bg:slotsExp<50?C.redBg:C.amberBg,sub:"400999→400500"},
      ].map(s=><Card key={s.label} style={{background:s.bg,border:"none",textAlign:"center",padding:"16px 10px"}}>
        <div style={{fontSize:18,marginBottom:4}}>{s.icon}</div>
        <div style={{fontSize:28,fontWeight:900,color:s.c,lineHeight:1}}>{s.val}</div>
        <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.06em",margin:"4px 0 2px"}}>{s.label}</div>
        <div style={{fontSize:10,color:s.c,fontWeight:600}}>{s.sub}</div>
      </Card>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontWeight:800,fontSize:14,color:C.text}}>⚠️ Alertas de Vencimento</div>
          <Chip color={C.red} bg={C.redBg}>{alertas.filter(a=>a.dias<=30).length} críticos</Chip>
        </div>
        {alertas.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:13}}>✅ Nenhuma outorga próxima do vencimento</div>}
        <div style={{maxHeight:260,overflow:"auto"}}>
          {alertas.slice(0,12).map((a,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",borderRadius:8,cursor:"pointer",marginBottom:4,background:a.b.bg,border:`1px solid ${a.b.c}22`}}>
            <div><div style={{fontWeight:700,fontSize:13,color:C.text}}>{a.u.identificacao}</div><div style={{fontSize:11,color:C.muted}}>{a.u.usuario} · Validade: {a.u.dtvalidade}</div></div>
            <span style={{background:a.b.c,color:"#fff",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{a.b.i} {a.b.t}</span>
          </div>)}
        </div>
      </Card>
      <Card>
        <div style={{fontWeight:800,fontSize:14,color:C.text,marginBottom:14}}>🕐 Atividade Recente</div>
        {recentes.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:13}}>Nenhuma atividade registrada</div>}
        <div style={{maxHeight:260,overflow:"auto"}}>
          {recentes.map((h,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:i<recentes.length-1?`1px solid ${C.border}`:"none"}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:600,whiteSpace:"nowrap",minWidth:80,paddingTop:3}}>{h.dt}</div>
            <div style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,background:h.tipo==="PROMOCAO"?C.greenBg:h.tipo==="ARQUIVAMENTO"?C.grayBg:C.blueSoft,color:h.tipo==="PROMOCAO"?C.green:h.tipo==="ARQUIVAMENTO"?C.gray:C.blue,height:"fit-content",whiteSpace:"nowrap"}}>{h.tipo}</div>
            <div><div style={{fontSize:12.5,color:C.text,fontWeight:600}}>{h.nome}</div><div style={{fontSize:11,color:C.muted}}>{h.desc}</div></div>
          </div>)}
        </div>
      </Card>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════
//  SCREEN — USUÁRIOS
// ═══════════════════════════════════════════════════════════════════════
function Usuarios({usuarios,onEdit,onNovo,onPromover,onArquivar,onAuditoria,onToggleTeste,onRemove}){
  const[q,setQ]=useState("");const[sf,setSf]=useState("TODOS");const[sb,setSb]=useState("");
  const filtered=useMemo(()=>usuarios.filter(u=>{
    const t=q.toLowerCase();
    const mt=!t||u.usuario?.includes(t)||u.identificacao?.toLowerCase().includes(t)||u.documento?.includes(t)||u.sub_bacia?.toLowerCase().includes(t);
    const ms=sf==="TODOS"?true:u.status===sf;
    const mb=!sb||u.sub_bacia===sb;
    return mt&&ms&&mb;
  }),[usuarios,q,sf,sb]);
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:10,flexWrap:"wrap"}}>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="🔍 Buscar por código, nome, CNPJ, sub-bacia..." style={{...inp,maxWidth:300,padding:"8px 14px",fontSize:13}}/>
        <select value={sb} onChange={e=>setSb(e.target.value)} style={{...inp,width:"auto",padding:"8px 12px",fontSize:12}}>
          <option value="">Todas sub-bacias</option>
          {SUB_BACIAS.map(s=><option key={s}>{s}</option>)}
        </select>
        <div style={{display:"flex",gap:3}}>
          {[{k:"TODOS",l:"Todos"},{k:"OPERACIONAL",l:"✅ Operacionais"},{k:"EXPERIMENTAL",l:"🧪 Experimentais"},{k:"HISTORICO",l:"📦 Histórico"}].map(t=>(
            <button key={t.k} onClick={()=>setSf(t.k)} style={{padding:"6px 12px",fontSize:11,fontWeight:700,borderRadius:20,cursor:"pointer",border:`1.5px solid ${sf===t.k?C.blue:C.border}`,background:sf===t.k?C.blue:"#fff",color:sf===t.k?"#fff":C.sub}}>{t.l}</button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <span style={{fontSize:12,color:C.muted}}>{filtered.length} registro{filtered.length!==1?"s":""}</span>
        <Btn onClick={onNovo}>➕ Novo Usuário</Btn>
      </div>
    </div>
    <div style={{display:"flex",gap:14,marginBottom:10,fontSize:11,color:C.muted,flexWrap:"wrap"}}>
      <span>⚖️ Auditoria</span><span>✏️ Editar</span><span>🚀 Promover exp→op</span><span>📦 Mover op→histórico</span><span>✕ Remover</span>
    </div>
    <Card style={{padding:0,overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12.5}}>
          <thead><tr style={{background:C.bg,borderBottom:`2px solid ${C.border}`}}>
            {["Código","Identificação","Status","Sub-Bacia","Validade","Med.","Teste","Ações"].map(h=>(
              <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:10,fontWeight:800,color:C.muted,letterSpacing:"0.07em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map(u=>{
              const dias=diasAte(u.dtvalidade);const vb=vencBadge(dias);
              const isHist=u.status==="HISTORICO";
              return <tr key={u._id} style={{borderBottom:`1px solid ${C.border}`,background:isHist?"#fafafa":u.status==="EXPERIMENTAL"?"#fefcff":"#fff",opacity:isHist?.7:1}}>
                <td style={{padding:"10px 12px"}}>
                  <span style={{fontFamily:"monospace",fontWeight:700,fontSize:13,color:isHist?C.gray:u.status==="EXPERIMENTAL"?C.purple:C.blue}}>{u.usuario}</span>
                  {u._expOrigem&&<div style={{fontSize:10,color:C.muted}}>← exp:{u._expOrigem}</div>}
                </td>
                <td style={{padding:"10px 12px",maxWidth:220}}>
                  <div style={{fontWeight:700,color:C.text}}>{u.identificacao}</div>
                  <div style={{color:C.muted,fontSize:11}}>{u.documento}</div>
                </td>
                <td style={{padding:"10px 12px"}}><StatusChip status={u.status}/></td>
                <td style={{padding:"10px 12px",color:C.sub,fontSize:12}}>{u.sub_bacia}</td>
                <td style={{padding:"10px 12px"}}>
                  <div style={{fontSize:12,color:C.sub}}>{u.dtvalidade||"—"}</div>
                  {vb&&<Chip color={vb.c} bg={vb.bg}>{vb.i} {vb.t}</Chip>}
                </td>
                <td style={{padding:"10px 12px",textAlign:"center",fontWeight:700,color:(u.medidores||[]).filter(m=>m.curso).length>0?C.blue:C.red}}>{(u.medidores||[]).filter(m=>m.curso).length}</td>
                <td style={{padding:"10px 12px",textAlign:"center"}}>
                  {!isHist&&<label style={{cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                    <input type="checkbox" checked={u.em_testes||false} onChange={()=>onToggleTeste(u._id)} style={{width:14,height:14}}/>
                    {u.em_testes&&<span style={{color:C.amber,fontSize:9,fontWeight:700}}>TESTE</span>}
                  </label>}
                </td>
                <td style={{padding:"10px 12px"}}>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    <button onClick={()=>onAuditoria(u._id)} style={{background:"#fffbeb",color:"#92400e",border:"1px solid #fde68a",borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}} title="Auditoria">⚖️</button>
                    <button onClick={()=>onEdit(u._id)} style={{background:C.blueSoft,color:C.blue,border:`1px solid ${C.blue}33`,borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{isHist?"👁":"✏️"}</button>
                    {u.status==="EXPERIMENTAL"&&<button onClick={()=>onPromover(u._id)} style={{background:C.greenBg,color:C.green,border:`1px solid ${C.green}33`,borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}} title="Promover">🚀</button>}
                    {u.status==="OPERACIONAL"&&<button onClick={()=>onArquivar(u._id)} style={{background:C.grayBg,color:C.gray,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}} title="Mover p/ Histórico">📦</button>}
                    {!isHist&&<button onClick={()=>onRemove(u._id)} style={{background:C.redBg,color:C.red,border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}} title="Remover">✕</button>}
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
        {filtered.length===0&&<div style={{padding:32,textAlign:"center",color:C.muted}}>Nenhum registro encontrado.</div>}
      </div>
    </Card>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════
//  SCREEN — XML
// ═══════════════════════════════════════════════════════════════════════
function XMLScreen({usuarios}){
  const[filtro,setFiltro]=useState("OPERACIONAL");const[xml,setXml]=useState("");const[copied,setCopied]=useState(false);
  const gerar=()=>{let l=usuarios.filter(u=>u.status!=="HISTORICO");if(filtro==="OPERACIONAL")l=l.filter(u=>u.status==="OPERACIONAL");else if(filtro==="EXPERIMENTAL")l=l.filter(u=>u.status==="EXPERIMENTAL");setXml(gerarXML(l));};
  const baixar=()=>{const b=new Blob([xml],{type:"application/xml;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="usuarios_sidecc.xml";a.click();};
  const copiar=()=>navigator.clipboard.writeText(xml).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
  const nOp=usuarios.filter(u=>u.status==="OPERACIONAL").length,nExp=usuarios.filter(u=>u.status==="EXPERIMENTAL").length;
  return <div>
    <Card style={{marginBottom:16}}>
      <div style={{fontWeight:800,fontSize:15,color:C.text,marginBottom:16}}>⚡ Gerar XML para o SiDeCC-R</div>
      <div style={{display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
        <Fld label="O que exportar" style={{marginBottom:0,minWidth:260}}>
          <Sel value={filtro} onChange={e=>setFiltro(e.target.value)}>
            <option value="OPERACIONAL">Somente Operacionais ({nOp})</option>
            <option value="EXPERIMENTAL">Somente Experimentais ({nExp})</option>
            <option value="AMBOS">Operacionais + Experimentais ({nOp+nExp})</option>
          </Sel>
        </Fld>
        <Btn onClick={gerar}>⚡ Gerar XML</Btn>
        {xml&&<><Btn v={copied?"success":"outline"} onClick={copiar}>{copied?"✓ Copiado!":"📋 Copiar"}</Btn><Btn v="dark" onClick={baixar}>⬇ Baixar .xml</Btn></>}
      </div>
      {xml&&<div style={{marginTop:12,display:"flex",gap:12,fontSize:12,color:C.muted}}>
        <span>{xml.split("\n").length.toLocaleString()} linhas</span><span>·</span>
        <span>{(new Blob([xml]).size/1024).toFixed(1)} KB</span>
      </div>}
    </Card>
    {xml&&<Card style={{padding:0,background:"#0d1117",border:"none"}}>
      <pre style={{margin:0,padding:"20px 24px",fontSize:11.5,lineHeight:1.65,color:"#c9d1d9",fontFamily:"'Fira Code','Consolas',monospace",whiteSpace:"pre-wrap",maxHeight:"65vh",overflow:"auto"}}>{xml}</pre>
    </Card>}
    {!xml&&<div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}><div style={{fontSize:40,marginBottom:12}}>📄</div><div style={{fontWeight:700,fontSize:15}}>Selecione o filtro e clique em "Gerar XML"</div></div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════
//  SCREEN — RELATÓRIOS
// ═══════════════════════════════════════════════════════════════════════
function Relatorios({usuarios}){
  const vencimentos=useMemo(()=>usuarios.filter(u=>u.status!=="HISTORICO").map(u=>({u,dias:diasAte(u.dtvalidade)})).filter(x=>x.dias!==null).sort((a,b)=>a.dias-b.dias),[usuarios]);
  function exportVenc(){const rows=[["RELATÓRIO DE VENCIMENTOS — SiDeCC-R"],["Gerado em:",new Date().toLocaleString("pt-BR")],[],["Código","Identificação","CNPJ","Status","Sub-Bacia","Validade","Dias Restantes","Situação"],...vencimentos.map(({u,dias})=>[u.usuario,u.identificacao,u.documento,u.status,u.sub_bacia,u.dtvalidade,dias,dias<0?"VENCIDA":dias<=30?"CRÍTICA":dias<=90?"ATENÇÃO":"OK"])];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),"Vencimentos");XLSX.writeFile(wb,"relatorio_vencimentos_sidecc.xlsx");}
  function exportCompleto(){const rows=[["Código","Identificação","CNPJ","Status","Sub-Bacia","Validade","Dt.Cadastro","Dt.Promoção","Dt.Encerramento","Motivo","Contato","Chave"],...usuarios.map(u=>[u.usuario,u.identificacao,u.documento,u.status,u.sub_bacia,u.dtvalidade,u._dtCadastro||"",u._dtPromocao||"",u._dtArquivamento||"",u._motivo||"",u.contato,u.chave])];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),"Todos os Usuários");XLSX.writeFile(wb,"relatorio_completo_sidecc.xlsx");}
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
      <Card>
        <div style={{fontWeight:800,fontSize:14,color:C.text,marginBottom:4}}>📋 Exportar Relatórios</div>
        <div style={{color:C.muted,fontSize:13,marginBottom:14}}>Gere planilhas XLSX com os dados do Supabase para análise externa.</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <Btn v="outline" onClick={exportVenc}>📅 Vencimentos XLSX</Btn>
          <Btn v="outline" onClick={exportCompleto}>🗃 Completo XLSX</Btn>
        </div>
      </Card>
      <Card style={{background:C.blueSoft,border:"none"}}>
        <div style={{fontWeight:800,fontSize:14,color:C.blue,marginBottom:8}}>📊 Resumo do Banco</div>
        {[["Total de registros",usuarios.length],["Operacionais ativos",usuarios.filter(u=>u.status==="OPERACIONAL").length],["Experimentais ativos",usuarios.filter(u=>u.status==="EXPERIMENTAL").length],["Histórico",usuarios.filter(u=>u.status==="HISTORICO").length],["Outorgas vencidas",vencimentos.filter(x=>x.dias<0).length],["Vencendo em 30 dias",vencimentos.filter(x=>x.dias>=0&&x.dias<=30).length]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.blue}22`,fontSize:13}}><span style={{color:C.blue}}>{l}</span><strong style={{color:C.navy}}>{v}</strong></div>)}
      </Card>
    </div>
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontWeight:800,fontSize:14,color:C.text}}>⏰ Controle de Vencimentos</div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12.5}}>
          <thead><tr style={{background:C.bg}}>{["Código","Identificação","Status","Sub-Bacia","Validade","Situação"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:10,fontWeight:800,color:C.muted,letterSpacing:"0.07em",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{vencimentos.slice(0,50).map(({u,dias})=>{const vb=vencBadge(dias)||{c:C.green,bg:C.greenBg,t:"OK",i:"🟢"};return<tr key={u._id} style={{borderBottom:`1px solid ${C.border}`,background:dias<0?C.redBg:dias<=30?`${C.red}08`:dias<=90?C.amberBg:"#fff"}}>
            <td style={{padding:"9px 12px",fontFamily:"monospace",fontWeight:700,color:C.blue}}>{u.usuario}</td>
            <td style={{padding:"9px 12px"}}><div style={{fontWeight:600}}>{u.identificacao}</div></td>
            <td style={{padding:"9px 12px"}}><StatusChip status={u.status}/></td>
            <td style={{padding:"9px 12px",color:C.sub}}>{u.sub_bacia}</td>
            <td style={{padding:"9px 12px",fontWeight:600}}>{u.dtvalidade}</td>
            <td style={{padding:"9px 12px"}}><Chip color={vb.c} bg={vb.bg}>{vb.i} {vb.t}</Chip></td>
          </tr>;})}
          </tbody>
        </table>
        {vencimentos.length===0&&<div style={{padding:28,textAlign:"center",color:C.muted}}>Nenhuma outorga com data de validade cadastrada.</div>}
      </div>
    </Card>
  </div>;
}


// ═══════════════════════════════════════════════════════════════════════
//  LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [email, setEmail]       = useState("");
  const [senha, setSenha]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [erro, setErro]         = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async (e) => {
    e && e.preventDefault();
    if (!email || !senha) { setErro("Preencha o e-mail e a senha."); return; }
    setLoading(true); setErro("");
    try {
      const data = await authSignIn(email, senha);
      onLogin(data.access_token, data.user);
    } catch(err) {
      setErro(err.message || "E-mail ou senha incorretos.");
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight:"100vh", width:"100vw", background:`linear-gradient(135deg,${C.navy} 0%,${C.blue} 60%,#1e40af 100%)`,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20,
    }}>
      <div style={{
        background:"#fff", borderRadius:20, width:"100%", maxWidth:420,
        boxShadow:"0 24px 64px rgba(0,0,0,0.25)", overflow:"hidden",
      }}>
        {/* Header */}
        <div style={{
          background:`linear-gradient(135deg,${C.navy},${C.blue})`,
          padding:"36px 32px 28px", textAlign:"center",
        }}>
          <div style={{
            display:"inline-flex", alignItems:"center", justifyContent:"center",
            width:64, height:64, borderRadius:16,
            background:"rgba(255,255,255,0.15)", marginBottom:16,
          }}>
            <span style={{fontSize:32}}>💧</span>
          </div>
          <div style={{color:"#fff", fontSize:26, fontWeight:900, letterSpacing:"-0.02em"}}>SiDeCC-R</div>
          <div style={{color:"rgba(255,255,255,0.7)", fontSize:13, marginTop:4}}>Sala de Situação PCJ · Controle de Outorgas</div>
        </div>

        {/* Form */}
        <div style={{padding:"32px"}}>
          <div style={{fontWeight:800, fontSize:16, color:C.text, marginBottom:6}}>Acesso ao sistema</div>
          <div style={{fontSize:13, color:C.muted, marginBottom:24}}>Digite suas credenciais para continuar.</div>

          {erro && (
            <div style={{
              background:C.redBg, color:C.red, border:`1px solid ${C.red}33`,
              borderRadius:8, padding:"10px 14px", marginBottom:16,
              fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:8,
            }}>
              ⚠️ {erro}
            </div>
          )}

          <div style={{marginBottom:16}}>
            <div style={{fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:5}}>E-mail</div>
            <input
              type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="email@exemplo.com.br"
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              style={{...inp, fontSize:14, padding:"11px 14px"}}
            />
          </div>

          <div style={{marginBottom:24}}>
            <div style={{fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:5}}>Senha</div>
            <div style={{position:"relative"}}>
              <input
                type={showPass?"text":"password"} value={senha} onChange={e=>setSenha(e.target.value)}
                placeholder="••••••••"
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                style={{...inp, fontSize:14, padding:"11px 44px 11px 14px"}}
              />
              <button onClick={()=>setShowPass(p=>!p)} style={{
                position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", cursor:"pointer", color:C.muted, fontSize:16, padding:0,
              }}>{showPass?"🙈":"👁"}</button>
            </div>
          </div>

          <button
            onClick={handleLogin} disabled={loading}
            style={{
              width:"100%", padding:"13px", borderRadius:10, border:"none",
              background:loading?C.muted:`linear-gradient(135deg,${C.navy},${C.blue})`,
              color:"#fff", fontSize:15, fontWeight:800, cursor:loading?"not-allowed":"pointer",
              transition:"all 0.2s", letterSpacing:"0.02em",
            }}
          >
            {loading ? "Autenticando..." : "Entrar"}
          </button>

          <div style={{
            marginTop:24, padding:"12px 14px", background:C.blueSoft,
            borderRadius:8, fontSize:12, color:C.blue, textAlign:"center",
          }}>
            🔒 Acesso restrito à equipe interna.<br/>Para solicitar acesso, contate o administrador.
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  APP ROOT
// ═══════════════════════════════════════════════════════════════════════
// Error Boundary para capturar erros de renderização
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state={hasError:false,error:null}; }
  static getDerivedStateFromError(e){ return {hasError:true,error:e}; }
  render(){
    if(this.state.hasError){
      return <div style={{padding:40,textAlign:"center",fontFamily:"sans-serif"}}>
        <div style={{fontSize:36,marginBottom:16}}>⚠️</div>
        <div style={{fontSize:18,fontWeight:700,color:"#dc2626",marginBottom:8}}>Erro ao carregar o sistema</div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:20,maxWidth:500,margin:"0 auto 20px"}}>{String(this.state.error?.message||this.state.error)}</div>
        <button onClick={()=>window.location.reload()} style={{background:"#1a56db",color:"#fff",border:"none",borderRadius:8,padding:"10px 24px",fontSize:14,fontWeight:700,cursor:"pointer"}}>🔄 Recarregar</button>
      </div>;
    }
    return this.props.children;
  }
}

export default function App(){
  // ── Auth ──────────────────────────────────────────────────────────────
  const[token,setToken]=useState(()=>sessionStorage.getItem("sidecc_token")||"");
  const[authUser,setAuthUser]=useState(null);

  const handleLogin=(tk,user)=>{
    sessionStorage.setItem("sidecc_token", tk);
    setToken(tk); setAuthUser(user);
  };
  const handleLogout=async()=>{
    try{ await authSignOut(token); }catch(e){}
    sessionStorage.removeItem("sidecc_token");
    setToken(""); setAuthUser(null); setUsuarios([]);
  };

  // ── App State ─────────────────────────────────────────────────────────
  const[screen,setScreen]=useState("dashboard");
  const[usuarios,setUsuarios]=useState([]);
  const[loading,setLoading]=useState({show:false,msg:""});
  const[errMsg,setErrMsg]=useState("");
  const[savedMsg,setSavedMsg]=useState("");
  const[editId,setEditId]=useState(null);
  const[promoverId,setPromoverId]=useState(null);
  const[arquivarId,setArquivarId]=useState(null);
  const[auditoriaId,setAuditoriaId]=useState(null);
  const[confirmData,setConfirmData]=useState(null);
  const[showImport,setShowImport]=useState(false);

  // Se não autenticado, mostra LoginScreen
  if (!token) return <LoginScreen onLogin={handleLogin}/>;

  const load=(show,msg="")=>setLoading({show,msg});
  const msg=t=>{setSavedMsg(t);setTimeout(()=>setSavedMsg(""),3500);};
  const err=e=>{setErrMsg(String(e?.message||e));load(false);};

  // Carregar dados do Supabase ao iniciar
  useEffect(()=>{
    load(true,"Carregando dados do banco...");
    dbGetAll()
      .then(data=>{ setUsuarios(data); load(false); })
      .catch(e=>{ err(e); });
  },[]);

  // Salvar usuário no Supabase
  const salvarUsuario=useCallback(async d=>{
    load(true,"Salvando...");
    try{
      const existe=usuarios.find(u=>u._id===d._id&&!d._id.startsWith("__NOVO__"));
      const payload={...d,_hist:[...(d._hist||[]),{dt:isoHoje(),tipo:"EDICAO",desc:"Dados editados"}]};
      await dbSave(payload);
      await dbGetAll().then(setUsuarios);
      setEditId(null);
      msg(existe?"✅ Usuário atualizado!":"✅ Usuário cadastrado!");
    }catch(e){err(e);}
    load(false);
  },[usuarios]);

  // Promoção: EXP → HISTORICO + novo OPERACIONAL
  const confirmarPromocao=useCallback(async()=>{
    const u=usuarios.find(x=>x._id===promoverId);if(!u)return;
    const novoNum=proxNum(usuarios,"OPERACIONAL"),dt=isoHoje();
    load(true,"Registrando promoção...");
    try{
      const expAtualizado={...u,status:"HISTORICO",_dtPromocao:dt,_hist:[...(u._hist||[]),{dt,tipo:"PROMOCAO",desc:`Promovido de ${u.usuario} → ${novoNum}`}]};
      const novoOp={...u,_id:uid(),usuario:novoNum,status:"OPERACIONAL",em_testes:false,_expOrigem:u.usuario,_dtCadastro:dt,_dtPromocao:dt,_dtArquivamento:null,_motivo:"",_hist:[{dt,tipo:"PROMOCAO",desc:`Promovido de experimental ${u.usuario}`}]};
      await dbSaveMany([expAtualizado,novoOp]);
      await dbGetAll().then(setUsuarios);
      setPromoverId(null);msg("🚀 Promoção registrada no banco!");
    }catch(e){err(e);}
    load(false);
  },[usuarios,promoverId]);

  // Arquivamento: OP → HISTORICO
  const confirmarArquivamento=useCallback(async motivo=>{
    const u=usuarios.find(x=>x._id===arquivarId);if(!u)return;
    const dt=isoHoje();
    load(true,"Arquivando...");
    try{
      await dbSave({...u,status:"HISTORICO",_dtArquivamento:dt,_motivo:motivo,_hist:[...(u._hist||[]),{dt,tipo:"ARQUIVAMENTO",desc:`Movido para histórico: ${motivo}`}]});
      await dbGetAll().then(setUsuarios);
      setArquivarId(null);msg("📦 Movido para histórico!");
    }catch(e){err(e);}
    load(false);
  },[usuarios,arquivarId]);

  // Toggle em_testes
  const toggleTeste=useCallback(async id=>{
    const u=usuarios.find(x=>x._id===id);if(!u)return;
    try{
      await dbSave({...u,em_testes:!u.em_testes});
      setUsuarios(p=>p.map(x=>x._id===id?{...x,em_testes:!x.em_testes}:x));
    }catch(e){err(e);}
  },[usuarios]);

  // Remoção
  const confirmarRemocao=useCallback(async()=>{
    load(true,"Removendo...");
    try{
      await dbDelete(confirmData.id);
      await dbGetAll().then(setUsuarios);
      setConfirmData(null);msg("🗑 Registro removido.");
    }catch(e){err(e);}
    load(false);
  },[confirmData]);

  // Importação em lote
  const handleImport=useCallback(async us=>{
    load(true,`Importando ${us.length} usuários para o Supabase...`);
    try{
      // Remove duplicatas pelo campo usuario
      const existentes=new Set(usuarios.map(u=>u.usuario));
      const novos=us.filter(u=>!existentes.has(u.usuario));
      if(novos.length===0){setShowImport(false);load(false);msg("ℹ️ Nenhum usuário novo encontrado.");return;}
      // Importa em lotes de 50
      for(let i=0;i<novos.length;i+=50){await dbSaveMany(novos.slice(i,i+50));}
      await dbGetAll().then(setUsuarios);
      setShowImport(false);msg(`✅ ${novos.length} usuários importados para o Supabase!`);
    }catch(e){err(e);}
    load(false);
  },[usuarios]);

  // Novo usuário (abre modal com dados vazios — SÓ salva ao clicar 💾)
  const handleNovo=(tipo="EXPERIMENTAL")=>{
    const u=usuarioVazio(tipo,usuarios);
    // Adiciona temporariamente para o modal ter contexto de proxNum correto
    setUsuarios(p=>[...p,u]);
    setEditId("__NOVO__"+u._id);
  };

  const editUsuario=editId?usuarios.find(u=>editId.includes(u._id)):null;
  const promoverU=usuarios.find(u=>u._id===promoverId);
  const arquivarU=usuarios.find(u=>u._id===arquivarId);
  const auditoriaU=usuarios.find(u=>u._id===auditoriaId);
  const countOp=usuarios.filter(u=>u.status==="OPERACIONAL").length;
  const countExp=usuarios.filter(u=>u.status==="EXPERIMENTAL").length;

  const NAV=[{k:"dashboard",l:"Dashboard",i:"📊"},{k:"usuarios",l:"Usuários",i:"👥"},{k:"xml",l:"Gerar XML",i:"⚡"},{k:"relatorios",l:"Relatórios",i:"📋"}];

  return <ErrorBoundary><div style={{fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif",background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column",width:"100vw",overflowX:"hidden"}}>
    {/* Loading overlay */}
    {loading.show&&<Loading msg={loading.msg}/>}

    {/* NAV */}
    <div style={{background:`linear-gradient(90deg,${C.navy},${C.blue})`,height:56,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 12px rgba(15,45,94,0.3)",width:"100%"}}>
      <div style={{display:"flex",alignItems:"center",gap:20}}>
        <div style={{color:"#fff",fontWeight:900,fontSize:18,letterSpacing:"-0.01em"}}>SiDeCC-R</div>
        <div style={{height:20,width:1,background:"rgba(255,255,255,0.2)"}}/>
        <nav style={{display:"flex",gap:2}}>
          {NAV.map(n=><button key={n.k} onClick={()=>setScreen(n.k)} style={{background:screen===n.k?"rgba(255,255,255,0.18)":"transparent",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5,opacity:screen===n.k?1:0.75}}>
            <span>{n.i}</span>{n.l}
          </button>)}
        </nav>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        {savedMsg&&<span style={{background:"rgba(5,150,105,0.3)",color:"#fff",borderRadius:20,padding:"3px 12px",fontSize:11,fontWeight:700}}>{savedMsg}</span>}
        <span style={{background:"rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.7)",borderRadius:20,padding:"3px 10px",fontSize:11}}>✅ {countOp}</span>
        <span style={{background:"rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.7)",borderRadius:20,padding:"3px 10px",fontSize:11}}>🧪 {countExp}</span>
        <Btn onClick={()=>setShowImport(true)} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"1.5px solid rgba(255,255,255,0.25)",padding:"6px 14px",fontSize:12}}>📥 Importar</Btn>
        <Btn onClick={()=>handleNovo("EXPERIMENTAL")} style={{background:"rgba(124,58,237,0.4)",color:"#fff",border:"none",padding:"6px 12px",fontSize:11}}>+ EXP</Btn>
        <Btn onClick={()=>handleNovo("OPERACIONAL")} style={{background:"rgba(5,150,105,0.4)",color:"#fff",border:"none",padding:"6px 12px",fontSize:11}}>+ OP</Btn>
        <span style={{color:"rgba(255,255,255,0.35)",fontSize:10}}>☁️ Supabase</span>
        <button onClick={handleLogout} style={{
          background:"rgba(220,38,38,0.25)",color:"#fff",
          border:"1px solid rgba(220,38,38,0.4)",borderRadius:8,
          padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",marginLeft:4,
        }} title="Sair do sistema">🚪 Sair</button>
      </div>
    </div>

    {/* MAIN */}
    <div style={{flex:1,width:"100%",padding:"22px 28px"}}>
      <ErrBanner msg={errMsg} onClose={()=>setErrMsg("")}/>
      {screen==="dashboard"&&<Dashboard usuarios={usuarios} onNovo={()=>handleNovo()} onImport={()=>setShowImport(true)}/>}
      {screen==="usuarios"&&<Usuarios usuarios={usuarios}
        onEdit={id=>setEditId(id)}
        onNovo={()=>handleNovo()}
        onPromover={id=>setPromoverId(id)}
        onArquivar={id=>setArquivarId(id)}
        onAuditoria={id=>setAuditoriaId(id)}
        onToggleTeste={toggleTeste}
        onRemove={id=>{const u=usuarios.find(x=>x._id===id);setConfirmData({id,nome:u?.identificacao,cod:u?.usuario});}}
      />}
      {screen==="xml"&&<XMLScreen usuarios={usuarios}/>}
      {screen==="relatorios"&&<Relatorios usuarios={usuarios}/>}
    </div>

    {/* MODALS */}
    {showImport&&<ImportModal onImport={handleImport} onClose={()=>setShowImport(false)}/>}

    {editUsuario&&<UserModal u={editUsuario} todos={usuarios}
      onSave={salvarUsuario}
      onClose={()=>{
        if(editId?.startsWith("__NOVO__")) setUsuarios(p=>p.filter(u=>u._id!==editUsuario._id));
        setEditId(null);
      }}/>}

    {promoverId&&promoverU&&<PromoverModal u={promoverU} novoNum={proxNum(usuarios,"OPERACIONAL")} onConfirm={confirmarPromocao} onClose={()=>setPromoverId(null)}/>}
    {arquivarId&&arquivarU&&<ArquivarModal u={arquivarU} onConfirm={confirmarArquivamento} onClose={()=>setArquivarId(null)}/>}
    {auditoriaId&&auditoriaU&&<AuditoriaModal u={auditoriaU} todos={usuarios} onClose={()=>setAuditoriaId(null)}/>}
    {confirmData&&<Confirm
      title="Remover registro?"
      msg={`"${confirmData.nome}" (${confirmData.cod}) será removido permanentemente do banco. Para preservar o histórico, use 📦 em vez de remover.`}
      okLabel="Sim, remover" okV="danger"
      onOk={confirmarRemocao} onCancel={()=>setConfirmData(null)}/>}
  </div></ErrorBoundary>;
}