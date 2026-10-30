"use strict";
/* =====================================================================
   NÚCLEO — configuração, base de dados, login, papéis e navegação
   ===================================================================== */

/* Projeto Firebase (o mesmo da app do café). Com os campos vazios a app funciona
   em MODO LOCAL (dados só neste aparelho), que só serve para testes. */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCjcaeYOl7IVZwIXKeo8eXzfNV0INlGmac",
  authDomain: "bloco-pedidos-cafe.firebaseapp.com",
  projectId: "bloco-pedidos-cafe",
  storageBucket: "bloco-pedidos-cafe.firebasestorage.app",
  messagingSenderId: "1036647485085",
  appId: "1:1036647485085:web:a3f05d60475ac7177b0e74"
};
const VERSAO_APP = "2.3 (fase 4)";

/* Quem é administrador. Qualquer outro email autorizado entra como caixa. */
const EMAILS_ADMIN = ["administrador@cafe.pt"];

const MODO_FIREBASE = !!(FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.apiKey);

/* ---------------------------------------------------------------------
   DADOS (coleções na base de dados)
   ingredientes/{ING-001}: {nome, marca, preco, qtd, unidade, minimo}
   receitas/{REC-001}:     {nome, doses, modo, gOp, gNaoOp, margem, iva, maoObra,
                            itens:[{ing, qtd, custo, nome, marca, unidade}], custoTotal, custoDose, pvp, temFoto, atualizado}
   fotos/{REC-001}:        {img}   (foto reduzida; só é lida quando a receita é aberta)
   movimentos/{id}:        {ing, tipo, qtd, valor, data}        (stock — fase 2)
   clientes/{id}:          {nome}
   pedidos/{id}:           {ts, cliente, rec, produto, qtd, preco, pagId, anulado}   (uma linha por produto;
                            o preço fica gravado no momento do pedido; anulado = hora em que foi anulado)
   pagamentos/{id}:        {ts, cliente, valor, pedidos:[ids]}
   fechos/{id}:            {ts, ini, vendido, recebido, faltaDia, transita, transitadoAnt, nPedidos,
                            recebidos[], emFalta[], top[], consumo:{ING-xxx: qtd}, nArquivo}
   arquivo/{idFecho_n}:    {fecho, pedidos[], pagamentos[]}   (pedidos pagos e anulados dos dias fechados;
                            não é carregado ao abrir a app — mantém a app rápida e dentro do plano grátis)
   config/contadores:      {ING, REC}   (último número usado; os IDs nunca se repetem)
   --------------------------------------------------------------------- */
const COLS = ["ingredientes", "receitas", "movimentos", "clientes", "config", "pedidos", "pagamentos", "fechos"];
const COLS_SO_PEDIDO = ["arquivo", "produtos"];     // lidas só quando é preciso
let D = {}; for(const c of COLS.concat(COLS_SO_PEDIDO)) D[c] = [];
const Idx = {ing: new Map(), rec: new Map()};
let versaoDados = 0;        // muda sempre que os dados mudam (para não refazer contas sem necessidade)
function reindexar(){
  versaoDados++;
  Idx.ing = new Map(D.ingredientes.map((x)=>[x.id, x]));
  Idx.rec = new Map(D.receitas.map((x)=>[x.id, x]));
  D.pedidos.sort((a, b)=>a.ts - b.ts); D.pagamentos.sort((a, b)=>a.ts - b.ts); D.fechos.sort((a, b)=>a.ts - b.ts);
  ultimoTs = Math.max(ultimoTs, ...D.pedidos.map((p)=>p.ts), ...D.pagamentos.map((p)=>p.ts), ...D.fechos.map((f)=>f.ts), 0);
}
/* hora única e sempre a subir (para a ordem dos pedidos) */
let ultimoTs = 0;
function agora(){ let t = Date.now(); if(t <= ultimoTs) t = ultimoTs + 1; ultimoTs = t; return t; }
let seqId = 0;
function novoId(pref){ seqId++; return pref + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + seqId.toString(36); }
const contadores = ()=> D.config.find((c)=>c.id === "contadores") || {ING: 0, REC: 0};

let renderAgendado = false;
function agendarRender(){ if(renderAgendado) return; renderAgendado = true; requestAnimationFrame(()=>{ renderAgendado = false; render(); }); }

/* ---------- modo local (testes): localStorage ---------- */
const Local = {
  CHAVE: "cafe_app_v2_dados", FOTO: "cafe_app_v2_foto_",
  ler(){ try{ const t = localStorage.getItem(this.CHAVE); if(t) return JSON.parse(t); }catch(e){} return null; },
  gravar(){ try{ localStorage.setItem(this.CHAVE, JSON.stringify(D)); }catch(e){ aviso("Não foi possível guardar os dados neste aparelho: " + e.message); } },
  iniciar(){
    const d = this.ler(); if(d) for(const c of COLS.concat(COLS_SO_PEDIDO)) D[c] = d[c] || [];
    reindexar(); entrouUtilizador(null); render();
    window.addEventListener("storage", (e)=>{ if(e.key === this.CHAVE){ const n = this.ler(); if(n){ for(const c of COLS) D[c] = n[c] || []; reindexar(); render(); } } });
  },
  aplicar(ops){
    for(const o of ops){
      if(o.col === "fotos"){
        try{ if(o.tipo === "del") localStorage.removeItem(this.FOTO + o.id); else localStorage.setItem(this.FOTO + o.id, o.dados.img); }
        catch(e){ aviso("Não foi possível guardar a foto neste aparelho: " + e.message); }
        continue;
      }
      const arr = D[o.col], i = arr.findIndex((x)=>x.id === o.id);
      if(o.tipo === "set"){ const obj = {...o.dados, id: o.id}; if(i >= 0) arr[i] = obj; else arr.push(obj); }
      else if(o.tipo === "update"){ if(i >= 0) Object.assign(arr[i], o.dados); }
      else if(o.tipo === "del"){ if(i >= 0) arr.splice(i, 1); }
    }
    reindexar(); this.gravar(); agendarRender();
    return Promise.resolve();
  },
  lerFoto(id){ try{ return Promise.resolve(localStorage.getItem(this.FOTO + id)); }catch(e){ return Promise.resolve(null); } },
  lerDocs(col, ids){ return Promise.resolve(ids.map((id)=>D[col].find((x)=>x.id === id)).filter(Boolean)); },
  listarIds(col){ return Promise.resolve((D[col] || []).map((x)=>x.id)); },
  utilizador(){ return null; }
};

/* ---------- modo partilhado: Firebase (Firestore + login) ---------- */
const Nuvem = {
  db: null, auth: null, subs: [], recebido: {},
  iniciar(){
    firebase.initializeApp(FIREBASE_CONFIG);
    this.auth = firebase.auth();
    if(location.search.includes("emu=1")) this.auth.useEmulator("http://127.0.0.1:9099");   // só para testes
    this.db = firebase.firestore();
    this.db.enablePersistence({synchronizeTabs: true}).catch(()=>{});     // funciona sem internet
    this.auth.onAuthStateChanged((u)=>{
      if(u){ entrouUtilizador(u.email); this.subscrever(); }
      else { this.parar(); for(const c of COLS) D[c] = []; reindexar(); saiuUtilizador(); }
      render();
    });
  },
  subscrever(){
    this.parar(); this.recebido = {};
    for(const c of COLS){
      this.subs.push(this.db.collection(c).onSnapshot((snap)=>{
        D[c] = snap.docs.map((d)=>({...d.data(), id: d.id})); this.recebido[c] = true;
        reindexar(); agendarRender();
      }, (err)=>aviso("Sem acesso aos dados (" + err.code + "). Confirme que este email está autorizado nas regras do Firebase.")));
    }
  },
  parar(){ this.subs.forEach((u)=>u()); this.subs = []; },
  aplicar(ops){
    const promessas = [];
    for(let i = 0; i < ops.length; i += 400){
      const lote = this.db.batch();
      for(const o of ops.slice(i, i + 400)){
        const ref = this.db.collection(o.col).doc(o.id);
        if(o.tipo === "set") lote.set(ref, o.dados); else if(o.tipo === "update") lote.update(ref, o.dados); else lote.delete(ref);
      }
      // sem internet fica em fila e é enviado quando a ligação voltar
      promessas.push(lote.commit().catch((e)=>aviso("Não foi possível gravar na base de dados: " + e.message)));
    }
    return Promise.all(promessas);
  },
  lerFoto(id){
    return this.db.collection("fotos").doc(id).get().then((d)=>d.exists ? d.data().img : null).catch(()=>null);
  },
  lerDocs(col, ids){
    return Promise.all(ids.map((id)=>this.db.collection(col).doc(id).get().then((d)=>d.exists ? {...d.data(), id: d.id} : null)))
      .then((l)=>l.filter(Boolean));
  },
  listarIds(col){ return this.db.collection(col).get().then((q)=>q.docs.map((d)=>d.id)); },
  utilizador(){ return this.auth && this.auth.currentUser ? this.auth.currentUser.email : null; },
  entrar(email, pass){ return this.auth.signInWithEmailAndPassword(email, pass); },
  sair(){ return this.auth.signOut(); }
};
const Store = MODO_FIREBASE ? Nuvem : Local;
const gravar = (ops)=> ops.length ? Store.aplicar(ops) : Promise.resolve();

/* ---------- utilitários de ecrã ---------- */
const $ = (id)=>document.getElementById(id);
const eur = (v)=> (v == null || !isFinite(v)) ? "—" : arred2(v).toLocaleString("pt-PT", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + " €";
const pct = (v)=> (v == null || !isFinite(v)) ? "—" : (v * 100).toLocaleString("pt-PT", {minimumFractionDigits: 1, maximumFractionDigits: 1}) + "%";
const numTxt = (v, casas)=> (v == null || !isFinite(v)) ? "" : Number(v).toLocaleString("pt-PT", {maximumFractionDigits: casas == null ? 3 : casas, useGrouping: false});
const norm = (s)=> String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const esc = (s)=> String(s == null ? "" : s).replace(/[&<>"']/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dataCurta = (ts)=> new Date(ts).toLocaleDateString("pt-PT", {day: "2-digit", month: "2-digit", year: "numeric"});
const porNome = (a, b)=> String(a.nome).localeCompare(String(b.nome), "pt") || String(a.marca || "").localeCompare(String(b.marca || ""), "pt");

function tabela(cab, linhas, vazioTxt, rodape){
  if(!linhas.length) return `<div class="vazio">${vazioTxt}</div>`;
  return `<table><thead><tr>${cab.map((c)=>`<th class="${c.num ? "num" : ""} ${c.cl || ""}">${c.t}</th>`).join("")}</tr></thead>
          <tbody>${linhas.join("")}${rodape || ""}</tbody></table>`;
}

/* ---------- janela / avisos ---------- */
function janela(tit, corpoHtml, acoes, larga){
  $("modal-tit").textContent = tit; $("modal-corpo").innerHTML = corpoHtml;
  $("modal").querySelector(".modal").classList.toggle("larga", !!larga);
  const z = $("modal-acoes"); z.innerHTML = "";
  for(const a of acoes){
    const b = document.createElement("button"); b.className = "bt " + (a.classe || ""); b.textContent = a.texto;
    if(a.id) b.id = a.id;
    b.onclick = ()=>{ if(a.manter){ a.acao && a.acao(); return; } fecharJanela(); a.acao && a.acao(); };
    z.appendChild(b);
  }
  $("modal").classList.add("aberto");
}
function fecharJanela(){ $("modal").classList.remove("aberto"); }
function confirmar(tit, html, txtOk, acao, classe){
  janela(tit, html, [{texto: "Cancelar", classe: "sec", id: "modal-cancelar"}, {texto: txtOk, classe: classe || "", id: "modal-ok", acao}]);
}
function aviso(txt, tit){ janela(tit || "Aviso", "<p>" + esc(txt).replace(/\n/g, "<br>") + "</p>", [{texto: "OK", id: "modal-ok"}]); }
let toastT;
function toast(txt){ const t = $("toast"); t.textContent = txt; t.style.display = "block"; clearTimeout(toastT); toastT = setTimeout(()=>t.style.display = "none", 2800); }

/* ---------- papéis e navegação ---------- */
let papel = null;            // "admin" | "caixa"
let ecraAtual = null;
const ECRAS = {
  admin: [["inicio", "📊", "Início"], ["cafe", "☕", "Café"], ["receitas", "🍲", "Receitas"], ["ingredientes", "🥕", "Ingredientes"], ["def", "⚙️", "Definições"]],
  caixa: [["pedido", "➕", "Pedido"], ["contas", "💶", "Contas"], ["apuro", "🧾", "Apuro"], ["sessao", "👤", "Sessão"]]
};
const ECRAS_CAFE = ["pedido", "contas", "apuro"];
let ultimoCafe = "pedido";
const RENDER = {};           // cada ecrã regista aqui a sua função de desenho
const GANCHOS_RENDER = [];   // desenhos extra (ex.: a zona Stock dentro da janela do ingrediente)

function papelDoEmail(email){
  if(!MODO_FIREBASE) return new URLSearchParams(location.search).get("papel") === "caixa" ? "caixa" : "admin";
  return EMAILS_ADMIN.includes(String(email || "").toLowerCase()) ? "admin" : "caixa";
}
function entrouUtilizador(email){
  papel = papelDoEmail(email);
  mostrarLogin(false);
  $("nav").innerHTML = ECRAS[papel].map(([id, ic, t])=>`<button data-ecra="${id}"><span class="ic">${ic}</span>${t}</button>`).join("");
  $("nav").querySelectorAll("button").forEach((b)=>b.onclick = ()=>mostrar(b.dataset.ecra));
  if(!ecraAtual || !podeVer(ecraAtual)) ecraAtual = ECRAS[papel][0][0];
  mostrar(ecraAtual, true);
}
function saiuUtilizador(){ papel = null; $("nav").innerHTML = ""; mostrarLogin(true); }
function podeVer(ecra){
  if(!papel) return false;
  if(papel === "admin" && ECRAS_CAFE.includes(ecra)) return true;      // o administrador chega ao café pelo menu "Café"
  return ECRAS[papel].some((e)=>e[0] === ecra);
}
function mostrar(e, semScroll){
  if(e === "cafe") e = ultimoCafe;
  if(!podeVer(e)) return;
  ecraAtual = e;
  if(ECRAS_CAFE.includes(e)) ultimoCafe = e;
  const navAtivo = (papel === "admin" && ECRAS_CAFE.includes(e)) ? "cafe" : e;
  document.querySelectorAll(".ecra").forEach((s)=>s.classList.toggle("ativo", s.id === "ecra-" + e));
  document.querySelectorAll("#nav button").forEach((b)=>b.classList.toggle("ativo", b.dataset.ecra === navAtivo));
  document.querySelectorAll(".abas-cafe").forEach((a)=>{ a.style.display = papel === "admin" ? "flex" : "none";
    a.querySelectorAll("button").forEach((b)=>b.classList.toggle("ativo", b.dataset.aba === e)); });
  render(); if(!semScroll) window.scrollTo(0, 0);
}
function render(){
  $("hdr-data").textContent = new Date().toLocaleDateString("pt-PT", {weekday: "long", day: "2-digit", month: "long"});
  $("hdr-user").textContent = papel ? (papel === "admin" ? "Administrador" : "Caixa") : "";
  if(papel && ecraAtual && RENDER[ecraAtual]) RENDER[ecraAtual]();
  if(papel) for(const g of GANCHOS_RENDER) g();
}

/* ---------- login ---------- */
function mostrarLogin(sim){ $("ecra-login").style.display = sim ? "flex" : "none"; }
$("login-entrar").onclick = ()=>{
  const email = $("login-email").value.trim(), pass = $("login-pass").value;
  $("login-erro").textContent = "";
  if(!email || !pass){ $("login-erro").textContent = "Indique o email e a palavra-passe."; return; }
  $("login-entrar").disabled = true;
  Nuvem.entrar(email, pass).catch((e)=>{ $("login-erro").textContent = (e.code === "auth/network-request-failed")
      ? "Sem ligação à internet. O primeiro login precisa de internet." : "Email ou palavra-passe errados."; })
    .finally(()=>{ $("login-entrar").disabled = false; });
};
$("login-pass").addEventListener("keydown", (e)=>{ if(e.key === "Enter") $("login-entrar").click(); });
function terminarSessao(){
  if(!MODO_FIREBASE){ aviso("No modo local não há sessão."); return; }
  confirmar("Terminar sessão", "<p>Terminar a sessão neste aparelho?</p>", "Terminar", ()=>Nuvem.sair());
}
function textoSessao(){
  return MODO_FIREBASE ? `Dados <b>partilhados</b> (Firebase) · sessão: <b>${esc(Store.utilizador() || "—")}</b> · ${papel === "admin" ? "administrador" : "caixa"}`
                       : `Dados <b>só neste aparelho</b> (modo local de testes) · ${papel === "admin" ? "administrador" : "caixa"}`;
}

/* ---------- arranque ---------- */
const SDK = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"]
  .map((f)=>"https://www.gstatic.com/firebasejs/10.14.1/" + f);
function carregarScript(src){ return new Promise((ok, erro)=>{ const s = document.createElement("script"); s.src = src; s.onload = ok;
  s.onerror = ()=>erro(new Error(src)); document.head.appendChild(s); }); }
function arrancar(){
  if(MODO_FIREBASE){
    SDK.reduce((p, src)=>p.then(()=>carregarScript(src)), Promise.resolve())
      .then(()=>Nuvem.iniciar())
      .catch(()=>aviso("Não foi possível carregar o Firebase. Na primeira utilização o aparelho precisa de internet."));
  }else{
    Store.iniciar();
  }
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(()=>{});
}
