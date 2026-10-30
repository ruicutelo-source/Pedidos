"use strict";
/* =====================================================================
   CAFÉ — pedidos, contas, apuro e fecho do dia (caixa e administrador)
   Regras (as do Excel + app do café):
   - os produtos são as receitas com PVP; o preço fica gravado no pedido;
   - cada unidade pedida gasta 1 dose da receita (ingredientes ÷ doses);
   - sem stock, o pedido vai na mesma para a conta e fica "A aguardar stock";
     quando a compra é registada, é libertado sozinho; pedidos pagos contam sempre como servidos;
   - anular: só pedidos do dia em curso ainda não pagos; o pedido fica riscado e pode ser reposto até ao fecho;
   - ao fechar o dia, os pedidos pagos e anulados vão para o arquivo e o fecho guarda o que gastaram.
   ===================================================================== */

/* ======================= REGRAS ======================= */
const r2 = (v)=> arred2(v);
const totalP = (p)=> r2(p.qtd * p.preco);
const soma = (arr, f)=> r2(arr.reduce((a, x)=>a + f(x), 0));
const hora = (ts)=> new Date(ts).toLocaleTimeString("pt-PT", {hour: "2-digit", minute: "2-digit"});
const ativos = ()=> D.pedidos.filter((p)=>!p.anulado);
const ultimoFecho = ()=> D.fechos.length ? D.fechos[D.fechos.length - 1] : null;
const inicioDia = ()=>{ const f = ultimoFecho(); return f ? f.ts : 0; };
const pedidosEntre = (a, b)=> ativos().filter((p)=>p.ts > a && p.ts <= b);
const pagamentosEntre = (a, b)=> D.pagamentos.filter((p)=>p.ts > a && p.ts <= b);
const emAberto = ()=> ativos().filter((p)=>!p.pagId);
const produtosCafe = ()=> D.receitas.filter((r)=>Number(r.pvp) > 0).sort(porNome);

function porCliente(peds){
  const m = new Map();
  for(const p of peds){
    if(!m.has(p.cliente)) m.set(p.cliente, {cliente: p.cliente, valor: 0, itens: new Map(), pedidos: []});
    const c = m.get(p.cliente); c.valor = r2(c.valor + totalP(p)); c.pedidos.push(p);
    c.itens.set(p.produto, (c.itens.get(p.produto) || 0) + p.qtd);
  }
  return [...m.values()].map((c)=>({...c, itensTxt: [...c.itens].map(([n, q])=>q + " " + n).join(" · ")}))
                        .sort((a, b)=>b.valor - a.valor || a.cliente.localeCompare(b.cliente, "pt"));
}
function maisVendidos(peds){
  const m = new Map();
  for(const p of peds){ const x = m.get(p.produto) || {produto: p.produto, qtd: 0, valor: 0}; x.qtd += p.qtd; x.valor = r2(x.valor + totalP(p)); m.set(p.produto, x); }
  return [...m.values()].sort((a, b)=>b.qtd - a.qtd || b.valor - a.valor);
}
function apuroAtual(){
  const a = inicioDia(), peds = pedidosEntre(a, Infinity), pags = pagamentosEntre(a, Infinity), abertos = emAberto();
  return {vendido: soma(peds, totalP), recebido: soma(pags, (p)=>p.valor),
          faltaDia: soma(abertos.filter((p)=>p.ts > a), totalP), transitado: soma(abertos.filter((p)=>p.ts <= a), totalP),
          nPedidos: peds.length, recebidos: pags.map((p)=>({cliente: p.cliente, valor: p.valor, ts: p.ts, id: p.id})),
          emFalta: porCliente(abertos), top: maisVendidos(peds)};
}
function haMovimentosNoDia(){ const a = inicioDia(); return D.pedidos.some((p)=>p.ts > a) || D.pagamentos.some((p)=>p.ts > a); }

/* ---------- stock gasto pelos pedidos ---------- */
/* O que gasta 1 unidade de cada receita: Map rec -> Map ingrediente -> quantidade */
function gastosPorReceita(){
  const m = new Map();
  for(const r of D.receitas){
    const doses = Number(r.doses) || 0; if(!(doses > 0)) continue;
    const g = new Map();
    for(const it of (r.itens || [])) if(Idx.ing.has(it.ing)) g.set(it.ing, (g.get(it.ing) || 0) + (Number(it.qtd) || 0) / doses);
    m.set(r.id, g);
  }
  return m;
}
/* Percorre os pedidos por ordem e reserva o stock (como o ModStock do Excel).
   consumo: Map ingrediente -> quantidade gasta (dias fechados + pedidos servidos)
   aguarda: Map pedido -> texto do que falta */
let motorCache = {versao: -1};
function motorCafe(){
  if(motorCache.versao === versaoDados) return motorCache;
  const disp = new Map(), consumo = new Map(), aguarda = new Map();
  const add = (m, k, v)=> m.set(k, (m.get(k) || 0) + v);
  for(const mv of D.movimentos) add(disp, mv.ing, mv.tipo === "Compra" ? (Number(mv.qtd) || 0) : -(Number(mv.qtd) || 0));
  for(const f of D.fechos) for(const [ing, q] of Object.entries(f.consumo || {})){ add(disp, ing, -q); add(consumo, ing, q); }
  const gastos = gastosPorReceita();
  for(const p of D.pedidos){
    if(p.anulado || !(p.qtd > 0)) continue;
    const g = gastos.get(p.rec); if(!g) continue;
    const falta = [];
    if(!p.pagId){          // os pedidos pagos já foram servidos
      for(const [ing, q] of g){
        const precisa = q * p.qtd, tem = disp.get(ing) || 0;
        if(precisa > tem + 0.0001){ const i = Idx.ing.get(ing); falta.push(`${nomeComMarca(i)} (faltam ${numTxt(precisa - Math.max(tem, 0))} ${i.unidade})`); }
      }
    }
    if(falta.length){ aguarda.set(p.id, falta.join("; ")); continue; }
    for(const [ing, q] of g){ add(disp, ing, -q * p.qtd); add(consumo, ing, q * p.qtd); }
  }
  motorCache = {versao: versaoDados, consumo, aguarda};
  return motorCache;
}
function consumoPedidos(){ return motorCafe().consumo; }

/* ======================= AÇÕES ======================= */
const idCliente = (nome)=> "c_" + norm(nome).replace(/[^a-z0-9]+/g, "_").slice(0, 80);
function opsCliente(nome){
  nome = limparEspacos(nome);
  const ex = D.clientes.find((c)=>norm(c.nome) === norm(nome));
  if(ex) return {nome: ex.nome, ops: []};
  return {nome, ops: [{tipo: "set", col: "clientes", id: idCliente(nome), dados: {nome}}]};
}
function registarPedido(cliente, linhas){
  const c = opsCliente(cliente); const ops = c.ops.slice(), ids = [];
  for(const l of linhas){
    const r = Idx.rec.get(l.rec); if(!r) continue;
    const id = novoId("o"); ids.push(id);
    ops.push({tipo: "set", col: "pedidos", id, dados: {ts: agora(), cliente: c.nome, rec: r.id, produto: r.nome, qtd: l.qtd, preco: r2(r.pvp), pagId: null, anulado: null}});
  }
  gravar(ops); return ids;
}
const podeAnular = (p)=> p && !p.pagId && !p.anulado && p.ts > inicioDia();
function anularPedido(id){ const p = D.pedidos.find((x)=>x.id === id); if(!podeAnular(p)) return false; gravar([{tipo: "update", col: "pedidos", id, dados: {anulado: agora()}}]); return true; }
function reporPedido(id){ const p = D.pedidos.find((x)=>x.id === id); if(!p || !p.anulado || p.ts <= inicioDia()) return false; gravar([{tipo: "update", col: "pedidos", id, dados: {anulado: null}}]); return true; }
function pagar(clientes){
  const ops = [], feitos = [];
  for(const c of clientes){
    const abertos = emAberto().filter((p)=>p.cliente === c);
    if(!abertos.length) continue;
    const pag = {id: novoId("g"), ts: agora(), cliente: c, valor: soma(abertos, totalP), pedidos: abertos.map((p)=>p.id)};
    ops.push({tipo: "set", col: "pagamentos", id: pag.id, dados: {ts: pag.ts, cliente: c, valor: pag.valor, pedidos: pag.pedidos}});
    for(const p of abertos) ops.push({tipo: "update", col: "pedidos", id: p.id, dados: {pagId: pag.id}});
    feitos.push(pag);
  }
  gravar(ops); return feitos;
}
function anularPagamento(id){
  const g = D.pagamentos.find((p)=>p.id === id);
  if(!g || g.ts <= inicioDia()) return false;
  const ops = [{tipo: "del", col: "pagamentos", id}];
  for(const p of D.pedidos) if(p.pagId === id) ops.push({tipo: "update", col: "pedidos", id: p.id, dados: {pagId: null}});
  gravar(ops); return true;
}
const semId = (o)=>{ const {id, ...r} = o; return r; };
/* Fecho do dia: grava o apuro, arquiva os pedidos pagos e anulados (com o que gastaram) */
function fecharDia(){
  const ap = apuroAtual(), ini = inicioDia(), ts = agora(), fid = novoId("f");
  const pagos = new Set(D.pagamentos.map((g)=>g.id));
  const arqPed = D.pedidos.filter((p)=>p.anulado || (p.pagId && pagos.has(p.pagId)));
  const arqPag = D.pagamentos.slice();
  const gastos = gastosPorReceita(), consumo = {};
  for(const p of arqPed){
    if(p.anulado) continue;
    for(const [ing, q] of (gastos.get(p.rec) || [])) consumo[ing] = Math.round(((consumo[ing] || 0) + q * p.qtd) * 10000) / 10000;
  }
  const ops = [], LOTE = 1500;
  let n = 0;
  for(let i = 0; i < Math.max(arqPed.length, arqPag.length); i += LOTE){
    n++;
    ops.push({tipo: "set", col: "arquivo", id: fid + "_" + n, dados: {fecho: fid, pedidos: arqPed.slice(i, i + LOTE), pagamentos: arqPag.slice(i, i + LOTE)}});
  }
  const f = {ts, ini, vendido: ap.vendido, recebido: ap.recebido, faltaDia: ap.faltaDia,
             transita: r2(ap.faltaDia + ap.transitado), transitadoAnt: ap.transitado, nPedidos: ap.nPedidos,
             recebidos: ap.recebidos.map(({cliente, valor})=>({cliente, valor})),
             emFalta: ap.emFalta.map((c)=>({cliente: c.cliente, valor: c.valor, itensTxt: c.itensTxt})),
             top: ap.top.map((t)=>({produto: t.produto, qtd: t.qtd, valor: t.valor})), consumo, nArquivo: n};
  ops.unshift({tipo: "set", col: "fechos", id: fid, dados: f});
  for(const p of arqPed) ops.push({tipo: "del", col: "pedidos", id: p.id});
  for(const g of arqPag) ops.push({tipo: "del", col: "pagamentos", id: g.id});
  gravar(ops); return f;
}
/* Reabrir o último fecho (só sem movimentos depois dele): repõe o que foi arquivado */
function reabrirUltimoFecho(){
  const f = ultimoFecho(); if(!f || haMovimentosNoDia()) return Promise.resolve(false);
  const ids = []; for(let i = 1; i <= (f.nArquivo || 0); i++) ids.push(f.id + "_" + i);
  return Store.lerDocs("arquivo", ids).then((docs)=>{
    if(docs.length !== ids.length){ aviso("Não foi possível ler o arquivo deste fecho (precisa de internet). Tente de novo com ligação."); return false; }
    const ops = [];
    for(const d of docs){
      for(const p of d.pedidos) ops.push({tipo: "set", col: "pedidos", id: p.id, dados: semId(p)});
      for(const g of d.pagamentos) ops.push({tipo: "set", col: "pagamentos", id: g.id, dados: semId(g)});
      ops.push({tipo: "del", col: "arquivo", id: d.id});
    }
    ops.push({tipo: "del", col: "fechos", id: f.id});
    gravar(ops); return true;
  });
}

/* ======================= ECRÃ: PEDIDO ======================= */
let carrinho = [];   // {rec, qtd}
let clienteSel = "";
function sugestoesClientes(txt){
  const n = norm(txt); if(!n) return [];
  const nomes = new Set(D.clientes.map((c)=>c.nome)); D.pedidos.forEach((p)=>nomes.add(p.cliente));
  return [...nomes].filter((x)=>norm(x).includes(n))
    .sort((a, b)=>(norm(a).startsWith(n) ? 0 : 1) - (norm(b).startsWith(n) ? 0 : 1) || a.localeCompare(b, "pt")).slice(0, 8);
}
function renderSugestoes(){
  const txt = $("ped-cliente").value, box = $("ped-sug");
  if(!txt.trim()){ box.style.display = "none"; return; }
  const sug = sugestoesClientes(txt), existe = sug.some((s)=>norm(s) === norm(txt));
  box.innerHTML = sug.map((s)=>`<div data-nome="${esc(s)}">${esc(s)}</div>`).join("") +
                  (existe ? "" : `<div class="novo" data-nome="${esc(limparEspacos(txt))}" data-novo="1">+ Cliente novo: «${esc(limparEspacos(txt))}»</div>`);
  box.style.display = "block";
  box.querySelectorAll("div").forEach((d)=>d.onmousedown = d.ontouchstart = (e)=>{ e.preventDefault(); escolherCliente(d.dataset.nome); });
}
function escolherCliente(nome){ clienteSel = limparEspacos(nome); $("ped-cliente").value = clienteSel; $("ped-sug").style.display = "none"; RENDER.pedido(); }
$("ped-cliente").addEventListener("input", ()=>{ clienteSel = ""; renderSugestoes(); renderPedidoInfo(); });
$("ped-cliente").addEventListener("blur", ()=>setTimeout(()=>{ $("ped-sug").style.display = "none"; }, 150));
$("ped-cliente").addEventListener("keydown", (e)=>{ if(e.key === "Enter"){ const s = sugestoesClientes(e.target.value); escolherCliente(s.find((x)=>norm(x) === norm(e.target.value)) || e.target.value); } });
$("ped-filtro").addEventListener("input", ()=>renderProdutos());
function renderPedidoInfo(){
  const nome = clienteSel || "";
  const deve = nome ? soma(emAberto().filter((p)=>p.cliente === nome), totalP) : 0;
  const conhecido = nome && (D.clientes.some((c)=>c.nome === nome) || D.pedidos.some((p)=>p.cliente === nome));
  $("ped-cliente-info").innerHTML = !nome ? "" : (conhecido ? (deve > 0 ? `Tem em aberto: <b class="verm">${eur(deve)}</b>` : "Sem contas em aberto.") : "<b>Cliente novo</b> — fica guardado ao registar.");
  $("ped-cli-tit").textContent = nome;
}
function renderProdutos(){
  const n = norm($("ped-filtro").value);
  const lista = produtosCafe().filter((r)=>!n || norm(r.nome).includes(n));
  $("ped-produtos").innerHTML = lista.map((r)=>`<button data-rec="${esc(r.id)}">${esc(r.nome)}<b>${eur(r.pvp)}</b></button>`).join("") ||
    `<div class="nota">${produtosCafe().length ? "Nenhum produto encontrado." : "Ainda não há produtos: cada receita com PVP é um produto do café."}</div>`;
  $("ped-produtos").querySelectorAll("button").forEach((b)=>b.onclick = ()=>{
    const l = carrinho.find((x)=>x.rec === b.dataset.rec); if(l) l.qtd++; else carrinho.push({rec: b.dataset.rec, qtd: 1}); renderCarrinho();
  });
}
function renderCarrinho(){
  carrinho = carrinho.filter((l)=>Idx.rec.has(l.rec));
  const linhas = carrinho.map((l, i)=>{ const r = Idx.rec.get(l.rec);
    return `<tr><td>${esc(r.nome)}<div class="itens">${eur(r.pvp)}</div></td>
      <td class="num" style="white-space:nowrap"><button class="mini" data-i="${i}" data-d="-1">−</button>
      <b style="display:inline-block;min-width:30px;text-align:center">${l.qtd}</b>
      <button class="mini" data-i="${i}" data-d="1">+</button></td>
      <td class="num">${eur(l.qtd * r.pvp)}</td></tr>`; });
  const tot = r2(carrinho.reduce((a, l)=>a + l.qtd * r2(Idx.rec.get(l.rec).pvp), 0));
  $("ped-carrinho").innerHTML = tabela([{t: "Produto"}, {t: "Qtd", num: 1}, {t: "Valor", num: 1}], linhas,
    "Toque nos produtos para os juntar ao pedido.", `<tr class="total"><td>Total</td><td></td><td class="num" id="ped-total">${eur(tot)}</td></tr>`);
  $("ped-carrinho").querySelectorAll("button.mini").forEach((b)=>b.onclick = ()=>{
    const l = carrinho[+b.dataset.i]; l.qtd += +b.dataset.d; if(l.qtd <= 0) carrinho.splice(+b.dataset.i, 1); renderCarrinho();
  });
  $("ped-registar").disabled = !carrinho.length;
}
$("ped-limpar").onclick = ()=>{ carrinho = []; clienteSel = ""; $("ped-cliente").value = ""; RENDER.pedido(); };
$("ped-registar").onclick = ()=>{
  const nome = limparEspacos(clienteSel || $("ped-cliente").value);
  if(!nome){ aviso("Escolha ou escreva o nome do cliente."); $("ped-cliente").focus(); return; }
  if(!carrinho.length){ aviso("Junte pelo menos um produto."); return; }
  const n = carrinho.reduce((a, l)=>a + l.qtd, 0);
  const ids = registarPedido(nome, carrinho);
  carrinho = []; clienteSel = ""; $("ped-cliente").value = ""; $("ped-filtro").value = "";
  toast(`Pedido registado: ${nome} (${n} ${n === 1 ? "artigo" : "artigos"})`); RENDER.pedido();
  setTimeout(()=>{   // avisa se algum produto ficou à espera de stock
    const ag = motorCafe().aguarda, l = ids.filter((id)=>ag.has(id)).map((id)=>{ const p = D.pedidos.find((x)=>x.id === id); return `• ${p.qtd} ${p.produto}: ${ag.get(id)}`; });
    if(l.length) aviso(`O pedido foi para a conta, mas fica a aguardar stock:\n\n${l.join("\n")}\n\nQuando a compra for registada, o aviso desaparece sozinho.`, "A aguardar stock");
  }, 400);
};
function renderListaPedidos(){
  const a = inicioDia(), ag = motorCafe().aguarda;
  const peds = D.pedidos.filter((p)=>p.ts > a).slice().reverse();
  $("ped-lista").innerHTML = tabela([{t: "Hora"}, {t: "Cliente"}, {t: "Produto"}, {t: "Qtd", num: 1}, {t: "Valor", num: 1}, {t: "Estado"}, {t: ""}],
    peds.map((p)=>{
      const estado = p.anulado ? `<span class="cinz">Anulado às ${hora(p.anulado)}</span>` : (p.pagId ? `<span class="estado-pago">Pago</span>` : `<span class="estado-aberto">Aberto</span>`);
      const acao = p.anulado ? `<button class="bt sec peq" data-repor="${p.id}">Repor</button>`
                             : (podeAnular(p) ? `<button class="bt sec peq verm-txt" data-anular="${p.id}">Anular</button>` : "");
      return `<tr class="${p.anulado ? "anulado" : ""}"><td>${hora(p.ts)}</td><td>${esc(p.cliente)}</td>
        <td>${esc(p.produto)}${!p.anulado && ag.has(p.id) ? `<div class="aguarda">⚠ A aguardar stock: ${esc(ag.get(p.id))}</div>` : ""}</td>
        <td class="num">${p.qtd}</td><td class="num">${eur(totalP(p))}</td><td>${estado}</td><td class="num">${acao}</td></tr>`; }),
    "Ainda sem pedidos hoje.");
  $("ped-lista").querySelectorAll("[data-anular]").forEach((b)=>b.onclick = ()=>pedirAnular(b.dataset.anular));
  $("ped-lista").querySelectorAll("[data-repor]").forEach((b)=>b.onclick = ()=>{
    const p = D.pedidos.find((x)=>x.id === b.dataset.repor);
    confirmar("Repor pedido", `<p>Repor o pedido anulado?</p><p><b>${p.qtd} ${esc(p.produto)}</b> de <b>${esc(p.cliente)}</b> (${eur(totalP(p))}), feito às ${hora(p.ts)}.</p>`,
      "Repor", ()=>{ reporPedido(p.id); toast("Pedido reposto."); });
  });
  // pedidos de dias anteriores, ainda por pagar, à espera de stock
  const antigos = D.pedidos.filter((p)=>p.ts <= a && !p.anulado && ag.has(p.id));
  $("ped-aguarda-antigos").innerHTML = antigos.length ? `<div class="aviso"><b>De dias anteriores, a aguardar stock:</b><br>${antigos.map((p)=>`${esc(p.cliente)} — ${p.qtd} ${esc(p.produto)}: ${esc(ag.get(p.id))}`).join("<br>")}</div>` : "";
}
/* Anular com segurança: mostra tudo e o botão de anular fica à direita, a vermelho */
function pedirAnular(id){
  const p = D.pedidos.find((x)=>x.id === id); if(!podeAnular(p)) return;
  janela("Anular pedido", `<p>Tem a certeza que quer <b>anular</b> este pedido?</p>
    <div class="cartao" style="font-size:16px;line-height:1.7">Cliente: <b>${esc(p.cliente)}</b><br>Produto: <b>${p.qtd} × ${esc(p.produto)}</b><br>
      Valor: <b>${eur(totalP(p))}</b><br>Feito às: <b>${hora(p.ts)}</b></div>
    <p class="nota">O pedido fica riscado na lista, não conta para as vendas nem gasta stock. Até ao fecho do dia pode ser reposto.</p>`,
    [{texto: "Cancelar", classe: "sec", id: "modal-cancelar"},
     {texto: "Sim, anular o pedido", classe: "verm", id: "modal-ok", acao: ()=>{ anularPedido(id); toast(`Pedido anulado: ${p.qtd} ${p.produto} de ${p.cliente}`); }}]);
}
RENDER.pedido = function(){ renderPedidoInfo(); renderProdutos(); renderCarrinho(); renderListaPedidos(); };

/* ======================= ECRÃ: CONTAS ======================= */
let selecaoContas = new Set();
$("cnt-filtro").addEventListener("input", ()=>RENDER.contas());
RENDER.contas = function(){
  const contas = porCliente(emAberto());
  for(const s of [...selecaoContas]) if(!contas.some((c)=>c.cliente === s)) selecaoContas.delete(s);
  const n = norm($("cnt-filtro").value);
  const vis = contas.filter((c)=>!n || norm(c.cliente).includes(n));
  $("cnt-lista").innerHTML = tabela([{t: ""}, {t: "Cliente"}, {t: "Itens"}, {t: "Total", num: 1}],
    vis.map((c)=>`<tr class="${selecaoContas.has(c.cliente) ? "sel" : ""}" data-cli="${esc(c.cliente)}" style="cursor:pointer">
      <td><input type="checkbox" class="chk" ${selecaoContas.has(c.cliente) ? "checked" : ""} tabindex="-1"></td>
      <td><b>${esc(c.cliente)}</b></td><td class="itens">${esc(c.itensTxt)}</td><td class="num">${eur(c.valor)}</td></tr>`),
    contas.length ? "Nenhum cliente com esse nome." : "Não há contas em aberto.");
  $("cnt-lista").querySelectorAll("tr[data-cli]").forEach((tr)=>tr.onclick = ()=>{
    const c = tr.dataset.cli; selecaoContas.has(c) ? selecaoContas.delete(c) : selecaoContas.add(c); RENDER.contas();
  });
  const sel = contas.filter((c)=>selecaoContas.has(c.cliente)), tot = soma(sel, (c)=>c.valor);
  $("cnt-sel-tot").textContent = sel.length ? `${sel.length} ${sel.length === 1 ? "conta" : "contas"} · ${eur(tot)}` : "";
  const linhas = [];
  for(const c of sel) for(const p of c.pedidos)
    linhas.push(`<tr><td>${sel.length > 1 ? esc(c.cliente) + " – " : ""}${esc(p.produto)}</td><td class="num">${p.qtd}</td><td class="num">${eur(totalP(p))}</td></tr>`);
  $("cnt-sel").innerHTML = tabela([{t: "Artigo"}, {t: "Qtd", num: 1}, {t: "Valor", num: 1}], linhas, "Selecione os clientes a pagar.",
    `<tr class="total"><td>A pagar</td><td></td><td class="num" id="cnt-apagar">${eur(tot)}</td></tr>`);
  $("cnt-pagar").disabled = !sel.length;
  $("cnt-pagar").textContent = sel.length ? `Confirmar pagamento · ${eur(tot)}` : "Confirmar pagamento";
  const pags = D.pagamentos.filter((p)=>p.ts > inicioDia()).slice().reverse();
  $("cnt-pagos").innerHTML = tabela([{t: "Hora"}, {t: "Cliente"}, {t: "Valor", num: 1}, {t: ""}],
    pags.map((p)=>`<tr><td>${hora(p.ts)}</td><td>${esc(p.cliente)}</td><td class="num">${eur(p.valor)}</td>
      <td class="num"><button class="bt sec peq" data-anular-pag="${p.id}">Anular</button></td></tr>`), "Ainda sem pagamentos hoje.");
  $("cnt-pagos").querySelectorAll("[data-anular-pag]").forEach((b)=>b.onclick = ()=>{
    const p = D.pagamentos.find((x)=>x.id === b.dataset.anularPag);
    janela("Anular pagamento", `<p>Anular o pagamento de <b>${esc(p.cliente)}</b> (${eur(p.valor)}) feito às ${hora(p.ts)}?</p><p class="nota">Os artigos voltam a ficar em aberto na conta do cliente.</p>`,
      [{texto: "Cancelar", classe: "sec", id: "modal-cancelar"},
       {texto: "Sim, anular o pagamento", classe: "verm", id: "modal-ok", acao: ()=>{ anularPagamento(p.id); toast("Pagamento anulado."); }}]);
  });
};
$("cnt-pagar").onclick = ()=>{
  const contas = porCliente(emAberto()).filter((c)=>selecaoContas.has(c.cliente));
  if(!contas.length) return;
  const tot = soma(contas, (c)=>c.valor);
  confirmar("Confirmar pagamento", `<p>${contas.map((c)=>`${esc(c.cliente)}: <b>${eur(c.valor)}</b>`).join("<br>")}</p><p style="font-size:20px">Total: <b>${eur(tot)}</b></p>`,
    "Confirmar", ()=>{ const f = pagar(contas.map((c)=>c.cliente)); selecaoContas.clear(); toast(`Pagamento registado: ${eur(soma(f, (p)=>p.valor))}`); }, "verde");
};

/* ======================= ECRÃ: APURO / FECHO ======================= */
let apuroSel = "atual";
RENDER.apuro = function(){
  const fechos = D.fechos.slice().reverse();
  if(apuroSel !== "atual" && !D.fechos.some((f)=>f.id === apuroSel)) apuroSel = "atual";
  $("apu-seletor").innerHTML = `<button data-f="atual" class="${apuroSel === "atual" ? "ativo" : ""}">Dia em curso</button>` +
    fechos.slice(0, 12).map((f)=>`<button data-f="${f.id}" class="${apuroSel === f.id ? "ativo" : ""}">${dataCurta(f.ts)} ${hora(f.ts)}</button>`).join("");
  $("apu-seletor").querySelectorAll("button").forEach((b)=>b.onclick = ()=>{ apuroSel = b.dataset.f; RENDER.apuro(); });
  let v;
  if(apuroSel === "atual"){
    const ap = apuroAtual();
    v = {vendido: ap.vendido, recebido: ap.recebido, faltaDia: ap.faltaDia, transitado: ap.transitado, recebidos: ap.recebidos, emFalta: ap.emFalta, top: ap.top};
    const f = ultimoFecho();
    $("apu-desc").textContent = (f ? `Desde o fecho de ${dataCurta(f.ts)} às ${hora(f.ts)}.` : "Desde o início (ainda sem fechos).") + ` ${ap.nPedidos} ${ap.nPedidos === 1 ? "pedido" : "pedidos"}.`;
    $("apu-fechar-zona").style.display = "block";
  }else{
    const f = D.fechos.find((x)=>x.id === apuroSel);
    v = {vendido: f.vendido, recebido: f.recebido, faltaDia: f.faltaDia, transitado: f.transitadoAnt, recebidos: f.recebidos, emFalta: f.emFalta, top: f.top || []};
    $("apu-desc").textContent = `Dia fechado em ${dataCurta(f.ts)} às ${hora(f.ts)} · ${f.nPedidos} pedidos · valores no momento do fecho.`;
    $("apu-fechar-zona").style.display = "none";
  }
  $("a-vendido").textContent = eur(v.vendido); $("a-recebido").textContent = eur(v.recebido);
  $("a-falta").textContent = eur(v.faltaDia); $("a-transitado").textContent = eur(v.transitado);
  $("a-rec-tot").textContent = eur(v.recebido);
  $("a-rec").innerHTML = tabela([{t: "Cliente"}, {t: "Valor", num: 1}], v.recebidos.map((p)=>`<tr><td>${esc(p.cliente)}</td><td class="num">${eur(p.valor)}</td></tr>`), "Sem pagamentos.");
  $("a-falta-tot").textContent = eur(soma(v.emFalta, (c)=>c.valor));
  $("a-falta-lista").innerHTML = tabela([{t: "Cliente"}, {t: "Itens"}, {t: "Valor", num: 1}],
    v.emFalta.map((c)=>`<tr><td>${esc(c.cliente)}</td><td class="itens">${esc(c.itensTxt || "")}</td><td class="num"><b>${eur(c.valor)}</b></td></tr>`), "Ninguém ficou a dever.");
  $("a-top").innerHTML = tabela([{t: "Produto"}, {t: "Qtd", num: 1}, {t: "Valor", num: 1}],
    v.top.slice(0, 8).map((t)=>`<tr><td>${esc(t.produto)}</td><td class="num">${t.qtd}</td><td class="num">${eur(t.valor)}</td></tr>`), "Sem vendas.");
  $("apu-hist").innerHTML = tabela([{t: "Fecho"}, {t: "Pedidos", num: 1}, {t: "Vendido", num: 1}, {t: "Recebido", num: 1}, {t: "Transita", num: 1}],
    fechos.map((f)=>`<tr><td>${dataCurta(f.ts)} ${hora(f.ts)}</td><td class="num">${f.nPedidos}</td><td class="num">${eur(f.vendido)}</td>
      <td class="num">${eur(f.recebido)}</td><td class="num verm">${eur(f.transita)}</td></tr>`), "Ainda sem fechos.",
    fechos.length ? `<tr><td colspan="5" class="num"><button class="bt sec peq" id="apu-reabrir">Reabrir o último fecho</button></td></tr>` : "");
  if($("apu-reabrir")) $("apu-reabrir").onclick = ()=>{
    if(haMovimentosNoDia()){ aviso("Já há pedidos ou pagamentos depois do último fecho. Só é possível reabrir um fecho sem movimentos posteriores."); return; }
    confirmar("Reabrir o último fecho", `<p>Reabrir o fecho de ${dataCurta(ultimoFecho().ts)} às ${hora(ultimoFecho().ts)}? O dia volta a ficar em curso.</p>`, "Reabrir",
      ()=>{ reabrirUltimoFecho().then((ok)=>{ if(ok){ apuroSel = "atual"; toast("Fecho reaberto."); } }); }, "verm");
  };
};
$("apu-fechar").onclick = ()=>{
  const ap = apuroAtual();
  if(!haMovimentosNoDia()){ aviso("Não há movimentos desde o último fecho."); return; }
  confirmar("Fechar o dia", `<p>Vendido: <b>${eur(ap.vendido)}</b><br>Recebido: <b>${eur(ap.recebido)}</b><br>
    Em falta do dia: <b>${eur(ap.faltaDia)}</b><br>Transita para amanhã: <b class="verm">${eur(ap.faltaDia + ap.transitado)}</b></p>
    <p class="nota">Os pedidos pagos e anulados passam para o arquivo. O que ficar por pagar transita para o dia seguinte.</p>`,
    "Fechar o dia", ()=>{ fecharDia(); apuroSel = "atual"; toast("Dia fechado."); });
};

/* abas do café (administrador) */
document.querySelectorAll(".abas-cafe button").forEach((b)=>b.onclick = ()=>mostrar(b.dataset.aba));
