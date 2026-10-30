"use strict";
/* =====================================================================
   PAINEL GERAL (Início do administrador), CLIENTES e EXPORTAR PARA EXCEL
   ===================================================================== */

/* ======================= PAINEL ======================= */
const mesISO = (desvio)=>{ const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + (desvio || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const mesDoTs = (ts)=>{ const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

RENDER.inicio = function(){
  /* ---- café · hoje ---- */
  const f = ultimoFecho(), fechado = f && !haMovimentosNoDia();
  let v;
  if(fechado){
    v = {vendido: f.vendido, recebido: f.recebido, nPedidos: f.nPedidos, top: f.top || []};
    $("ini-cafe-estado").innerHTML = `<span class="chip">Dia fechado em ${dataCurta(f.ts)} às ${hora(f.ts)}</span>`;
  }else{
    v = apuroAtual();
    $("ini-cafe-estado").innerHTML = `<span class="chip">Dia em curso</span>`;
  }
  const falta = soma(emAberto(), totalP);
  $("ini-vendido").textContent = eur(v.vendido); $("ini-recebido").textContent = eur(v.recebido);
  $("ini-falta").textContent = eur(falta); $("ini-npedidos").textContent = v.nPedidos;
  $("ini-top").innerHTML = tabela([{t: "Produto"}, {t: "Qtd", num: 1}, {t: "Valor", num: 1}],
    v.top.slice(0, 8).map((t)=>`<tr><td>${esc(t.produto)}</td><td class="num">${t.qtd}</td><td class="num">${eur(t.valor)}</td></tr>`), "Ainda sem vendas.");

  /* ---- stock ---- */
  const saldos = saldosStock();
  const repor = D.ingredientes.filter((i)=>paraRepor(i, saldoDe(saldos, i.id))).sort(porNome);
  const ag = motorCafe().aguarda;
  $("ini-n-repor").textContent = repor.length; $("ini-n-aguarda").textContent = ag.size;
  $("ini-repor").innerHTML = tabela([{t: "Ingrediente a repor"}, {t: "Stock", num: 1}, {t: "Mínimo", num: 1}],
    repor.slice(0, 8).map((i)=>`<tr class="clic" data-ing="${esc(i.id)}"><td>${esc(nomeComMarca(i))}</td><td class="num verm">${numTxt(saldoDe(saldos, i.id))} ${esc(i.unidade)}</td>
      <td class="num">${numTxt(i.minimo)} ${esc(i.unidade)}</td></tr>`), "Nenhum ingrediente para repor. 👍",
    repor.length > 8 ? `<tr><td colspan="3" class="nota">… e mais ${repor.length - 8}. Veja em Ingredientes → "Só os que estão para repor".</td></tr>` : "");
  $("ini-repor").querySelectorAll("tr[data-ing]").forEach((tr)=>tr.onclick = ()=>editarIngrediente(tr.dataset.ing));

  /* ---- compras e vendas ---- */
  const compras = D.movimentos.filter((m)=>m.tipo === "Compra");
  const comprasMes = (m)=> soma(compras.filter((x)=>String(x.data).slice(0, 7) === m), (x)=>Number(x.valor) || 0);
  const cEste = comprasMes(mesISO(0)), cAnt = comprasMes(mesISO(-1));
  const vendMes = soma(D.fechos.filter((x)=>mesDoTs(x.ts) === mesISO(0)), (x)=>x.vendido);
  const dif = r2(vendMes - cEste);
  const ultimas = compras.slice().sort((a, b)=>String(b.data).localeCompare(String(a.data)) || (b.ts || 0) - (a.ts || 0)).slice(0, 6);
  $("ini-compras").innerHTML = `<table><tbody>
      <tr><td>Compras este mês</td><td class="num"><b>${eur(cEste)}</b></td></tr>
      <tr><td>Compras do mês anterior</td><td class="num">${eur(cAnt)}</td></tr>
      <tr><td>Vendido este mês (dias fechados)</td><td class="num"><b>${eur(vendMes)}</b></td></tr>
      <tr class="total"><td>Diferença (vendido − compras)</td><td class="num ${dif < 0 ? "verm" : "verde"}" id="ini-dif">${eur(dif)}</td></tr>
    </tbody></table>` +
    tabela([{t: "Data"}, {t: "Últimas compras"}, {t: "Valor", num: 1}],
      ultimas.map((m)=>{ const i = Idx.ing.get(m.ing); return `<tr><td class="pequeno">${dataPT(m.data)}</td><td>${esc(i ? nomeComMarca(i) : m.ing)}</td><td class="num">${eur(m.valor)}</td></tr>`; }),
      "Ainda sem compras.");

  /* ---- receitas ---- */
  const est = D.receitas.map((r)=>({r, e: estadoReceita(r)})).sort((a, b)=>porNome(a.r, b.r));
  $("ini-n-ing").textContent = D.ingredientes.length;
  $("ini-n-rec").textContent = D.receitas.length;
  const lucros = est.map((x)=>x.e.ind.lucroPct).filter((x)=>x != null && isFinite(x));
  $("ini-lucro").textContent = lucros.length ? pct(lucros.reduce((a, x)=>a + x, 0) / lucros.length) : "—";
  const nDesat = est.filter((x)=>x.e.desatualizada).length;
  $("ini-desat").textContent = nDesat; $("ini-desat").className = "val " + (nDesat ? "verm" : "verde");
  $("ini-receitas").innerHTML = tabela(
    [{t: "Receita"}, {t: "Doses", num: 1, cl: "so-largo"}, {t: "Custo / dose", num: 1}, {t: "PVP / dose", num: 1}, {t: "Preço s/ IVA", num: 1, cl: "so-largo"},
     {t: "Lucro / dose", num: 1, cl: "so-largo"}, {t: "Lucro %", num: 1}, {t: "Margem bruta", num: 1, cl: "so-largo"}],
    est.map(({r, e})=>`<tr class="clic" data-id="${esc(r.id)}"><td><b>${esc(r.nome)}</b>${e.desatualizada ? " <span class=\"chip verm\">⚠</span>" : ""}</td>
      <td class="num so-largo">${numTxt(r.doses)}</td><td class="num">${eur(r.custoDose)}</td><td class="num"><b>${eur(r.pvp)}</b></td>
      <td class="num so-largo">${eur(e.ind.precoSemIva)}</td><td class="num so-largo">${eur(e.ind.lucro)}</td>
      <td class="num"><span class="chip ${e.ind.cobreMargem ? "verde" : "verm"}">${pct(e.ind.lucroPct)}</span></td>
      <td class="num so-largo">${pct(e.ind.margemBruta)}</td></tr>`),
    "Ainda não há receitas. Importe os dados do Excel em Definições.");
  $("ini-receitas").querySelectorAll("tr[data-id]").forEach((tr)=>tr.onclick = ()=>abrirReceita(tr.dataset.id));
};

/* ======================= CLIENTES (Definições) ======================= */
function renderClientes(){
  const n = norm($("cli-filtro").value);
  const abertos = porCliente(emAberto()), deve = new Map(abertos.map((c)=>[c.cliente, c.valor]));
  const lista = D.clientes.filter((c)=>!n || norm(c.nome).includes(n)).sort(porNome);
  $("cli-lista").innerHTML = tabela([{t: "Cliente"}, {t: "Em aberto", num: 1}, {t: ""}],
    lista.map((c)=>`<tr><td>${esc(c.nome)}</td><td class="num ${deve.get(c.nome) ? "verm" : ""}">${deve.get(c.nome) ? eur(deve.get(c.nome)) : "—"}</td>
      <td class="num" style="white-space:nowrap"><button class="lixo" data-cli-editar="${esc(c.id)}" title="Mudar o nome">✏️</button><button class="lixo" data-cli-apagar="${esc(c.id)}" title="Apagar">🗑</button></td></tr>`),
    D.clientes.length ? "Nenhum cliente com esse nome." : "Ainda sem clientes.");
  $("cli-lista").querySelectorAll("[data-cli-editar]").forEach((b)=>b.onclick = ()=>editarCliente(b.dataset.cliEditar));
  $("cli-lista").querySelectorAll("[data-cli-apagar]").forEach((b)=>b.onclick = ()=>{
    const c = D.clientes.find((x)=>x.id === b.dataset.cliApagar); if(!c) return;
    if(emAberto().some((p)=>p.cliente === c.nome)){ aviso(`${c.nome} tem contas em aberto. Receba ou anule esses pedidos antes de apagar o cliente.`); return; }
    confirmar("Apagar cliente", `<p>Apagar <b>${esc(c.nome)}</b> da lista de clientes?</p><p class="nota">O histórico de pedidos mantém-se.</p>`, "Apagar",
      ()=>{ gravar([{tipo: "del", col: "clientes", id: c.id}]); toast(`Cliente apagado: ${c.nome}`); }, "verm");
  });
}
GANCHOS_RENDER.push(()=>{ if(ecraAtual === "def") renderClientes(); });
$("cli-filtro").addEventListener("input", renderClientes);
$("cli-novo").onclick = ()=>editarCliente(null);
function editarCliente(id){
  const c = id ? D.clientes.find((x)=>x.id === id) : null;
  janela(c ? "Mudar o nome do cliente" : "Novo cliente", `<label class="campo" for="cli-nome">Nome</label>
    <input type="text" id="cli-nome" autocomplete="off" value="${esc(c ? c.nome : "")}">
    ${c ? `<p class="nota">O nome muda também nos pedidos e pagamentos ainda não arquivados.</p>` : ""}<div class="nota verm" id="cli-erro"></div>`,
    [{texto: "Cancelar", classe: "sec", id: "modal-cancelar"}, {texto: "Gravar", classe: "verde", id: "modal-ok", manter: true, acao: ()=>{
      const nome = limparEspacos($("cli-nome").value);
      if(!nome){ $("cli-erro").textContent = "Escreva o nome do cliente."; return; }
      const dup = D.clientes.find((x)=>(!c || x.id !== c.id) && norm(x.nome) === norm(nome));
      if(dup){ $("cli-erro").textContent = `Já existe o cliente '${dup.nome}'.`; return; }
      const ops = [];
      if(c){
        ops.push({tipo: "update", col: "clientes", id: c.id, dados: {nome}});
        for(const p of D.pedidos) if(p.cliente === c.nome) ops.push({tipo: "update", col: "pedidos", id: p.id, dados: {cliente: nome}});
        for(const g of D.pagamentos) if(g.cliente === c.nome) ops.push({tipo: "update", col: "pagamentos", id: g.id, dados: {cliente: nome}});
      }else{
        ops.push({tipo: "set", col: "clientes", id: idCliente(nome), dados: {nome}});
      }
      fecharJanela(); gravar(ops); toast(c ? `Nome mudado para ${nome}.` : `Cliente adicionado: ${nome}`);
    }}]);
  setTimeout(()=>{ const e = $("cli-nome"); if(e) e.focus(); }, 50);
}

/* ======================= EXPORTAR PARA EXCEL (CSV) ======================= */
function descarregar(nome, conteudo, tipo){
  const b = new Blob([conteudo], {type: tipo}); const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const dataFicheiro = ()=>{ const d = new Date(), z = (n)=>String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}`; };
const csvN = (v, casas)=> (v == null || v === "" || !isFinite(v)) ? "" : String(casas == null ? v : Number(v).toFixed(casas)).replace(".", ",");
const csvT = (s)=> '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
const csvData = (ts)=> ts ? `${dataCurta(ts)} ${hora(ts)}` : "";
function gravarCsv(nome, linhas){
  descarregar(`${nome}_${dataFicheiro()}.csv`, "﻿" + linhas.map((l)=>l.join(";")).join("\r\n") + "\r\n", "text/csv;charset=utf-8");
  $("exp-estado").textContent = `Guardado: ${nome}_${dataFicheiro()}.csv (Transferências)`;
  toast("Ficheiro guardado nas Transferências.");
}
/* Pedidos e pagamentos: os do dia e por pagar + os dos dias fechados (arquivo) */
$("exp-vendas").onclick = ()=>{
  $("exp-estado").textContent = "A preparar…";
  Store.listarIds("arquivo").then((ids)=>Store.lerDocs("arquivo", ids)).catch(()=>null).then((arq)=>{
    if(arq === null){ aviso("Não foi possível ler o arquivo dos dias fechados (precisa de internet)."); $("exp-estado").textContent = ""; return; }
    const ped = [], pag = [];
    for(const a of arq){ ped.push(...a.pedidos); pag.push(...a.pagamentos); }
    ped.push(...D.pedidos); pag.push(...D.pagamentos);
    ped.sort((a, b)=>a.ts - b.ts); pag.sort((a, b)=>a.ts - b.ts);
    const fechoDe = (ts)=>{ const f = D.fechos.find((x)=>ts > x.ini && ts <= x.ts); return f ? csvData(f.ts) : "dia em curso"; };
    const L = [["Data/hora", "Cliente", "Produto", "Qtd", "Preço", "Total", "Estado", "Dia (fecho)"].map(csvT)];
    for(const p of ped) L.push([csvT(csvData(p.ts)), csvT(p.cliente), csvT(p.produto), csvN(p.qtd), csvN(p.preco, 2), csvN(totalP(p), 2),
      csvT(p.anulado ? "Anulado" : (p.pagId ? "Pago" : "Aberto")), csvT(fechoDe(p.ts))]);
    L.push([], [csvT("Pagamentos")], ["Data/hora", "Cliente", "Valor", "Dia (fecho)"].map(csvT));
    for(const g of pag) L.push([csvT(csvData(g.ts)), csvT(g.cliente), csvN(g.valor, 2), csvT(fechoDe(g.ts))]);
    gravarCsv("cafe_pedidos_pagamentos", L);
  });
};
$("exp-fechos").onclick = ()=>{
  const L = [["Fecho", "Pedidos", "Vendido", "Recebido", "Em falta do dia", "Transitado anterior", "Transita"].map(csvT)];
  for(const f of D.fechos) L.push([csvT(csvData(f.ts)), csvN(f.nPedidos), csvN(f.vendido, 2), csvN(f.recebido, 2), csvN(f.faltaDia, 2), csvN(f.transitadoAnt, 2), csvN(f.transita, 2)]);
  gravarCsv("cafe_fechos", L);
};
$("exp-stock").onclick = ()=>{
  const saldos = saldosStock();
  const L = [["ID", "Ingrediente", "Marca", "Unidade", "Comprado", "Saídas", "Gasto nos pedidos", "Stock", "Mínimo", "Alerta"].map(csvT)];
  for(const i of D.ingredientes.slice().sort(porNome)){
    const s = saldos.get(i.id) || {compras: 0, saidas: 0, consumo: 0, stock: 0};
    L.push([csvT(i.id), csvT(i.nome), csvT(i.marca), csvT(i.unidade), csvN(s.compras), csvN(s.saidas), csvN(Math.round(s.consumo * 1000) / 1000), csvN(s.stock), csvN(i.minimo || 0), csvT(paraRepor(i, s.stock) ? "Repor" : "")]);
  }
  L.push([], [csvT("Compras e saídas")], ["Data", "Movimento", "ID", "Ingrediente", "Quantidade", "Unidade", "Valor"].map(csvT));
  for(const m of D.movimentos.slice().sort((a, b)=>String(a.data).localeCompare(String(b.data)) || (a.ts || 0) - (b.ts || 0))){
    const i = Idx.ing.get(m.ing);
    L.push([csvT(dataPT(m.data)), csvT(m.tipo), csvT(m.ing), csvT(i ? nomeComMarca(i) : ""), csvN(m.qtd), csvT(i ? i.unidade : ""), csvN(m.valor, 2)]);
  }
  gravarCsv("cafe_stock_compras", L);
};
$("exp-receitas").onclick = ()=>{
  const L = [["ID", "Receita", "Doses", "Custo total", "Custo / dose", "G. Oper.", "G. Não Oper.", "Margem", "IVA", "Mão de obra", "PVP / dose", "Preço s/ IVA", "Lucro / dose", "Lucro % s/ custo"].map(csvT)];
  for(const r of D.receitas.slice().sort(porNome)){
    const e = estadoReceita(r);
    L.push([csvT(r.id), csvT(r.nome), csvN(r.doses), csvN(r.custoTotal, 2), csvN(r.custoDose, 2), csvN(r.gOp), csvN(r.gNaoOp), csvN(r.margem), csvN(r.iva),
      csvN(r.maoObra, 2), csvN(r.pvp, 2), csvN(arred2(e.ind.precoSemIva), 2), csvN(arred2(e.ind.lucro), 2), csvN(e.ind.lucroPct == null ? "" : Math.round(e.ind.lucroPct * 10000) / 10000)]);
  }
  L.push([], [csvT("Ingredientes das receitas")], ["ID receita", "Receita", "ID ingrediente", "Ingrediente", "Marca", "Quantidade", "Unidade", "Custo"].map(csvT));
  for(const r of D.receitas.slice().sort(porNome)) for(const it of r.itens)
    L.push([csvT(r.id), csvT(r.nome), csvT(it.ing), csvT(it.nome), csvT(it.marca), csvN(it.qtd), csvT(it.unidade), csvN(it.custo, 2)]);
  gravarCsv("receitas_custos", L);
};
