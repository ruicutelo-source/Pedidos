"use strict";
/* =====================================================================
   INGREDIENTES (a Mestra) E STOCK — só o administrador
   Regras iguais ao formulário "Gestão de Ingredientes" do Excel:
   nome e marca com maiúsculas iniciais; kg passa a g e L a ml; não há dois
   iguais (nome + marca); não se apaga se for usado numa receita ou tiver
   movimentos de stock; com movimentos de stock a unidade não pode mudar;
   o ID nunca volta a ser usado.
   Stock = Compras − Saídas − o que os pedidos do café gastaram (fase 3).
   Movimentos: {ing, tipo:"Compra"|"Saída", qtd, valor (total €), data "AAAA-MM-DD", ts}
   ===================================================================== */

/* Receitas que usam um ingrediente */
function receitasQueUsam(idIng){ return D.receitas.filter((r)=>(r.itens || []).some((it)=>it.ing === idIng)).sort(porNome); }
const temMovimentos = (idIng)=> D.movimentos.some((m)=>m.ing === idIng);

/* Grava o contador de IDs (para nunca repetir um número, mesmo depois de apagar) */
function opContador(prefixo, numero){
  const c = contadores(), novo = {ING: Number(c.ING) || 0, REC: Number(c.REC) || 0};
  const chave = prefixo.replace("-", "");
  if(numero <= novo[chave]) return null;
  novo[chave] = numero;
  return {tipo: "set", col: "config", id: "contadores", dados: novo};
}
const numeroDoId = (id)=> parseInt(String(id).replace(/\D/g, ""), 10) || 0;

/* Custo por kg / L / unidade, para mostrar na lista */
function custoReferencia(ing){
  if(!(ing.qtd > 0)) return "—";
  const f = ing.unidade === "u" ? 1 : 1000;
  return eur(ing.preco / ing.qtd * f) + (ing.unidade === "g" ? "/kg" : ing.unidade === "ml" ? "/L" : "/u");
}

/* ======================= STOCK ======================= */
/* O que os pedidos do café gastaram, por ingrediente (entra na fase 3) */
function consumoPedidos(){ return new Map(); }

/* Stock de todos os ingredientes: Map id -> {compras, saidas, consumo, stock} */
function saldosStock(){
  const m = new Map();
  const de = (id)=>{ if(!m.has(id)) m.set(id, {compras: 0, saidas: 0, consumo: 0, stock: 0}); return m.get(id); };
  for(const mv of D.movimentos){
    const s = de(mv.ing), q = Number(mv.qtd) || 0;
    if(mv.tipo === "Compra") s.compras += q; else s.saidas += q;
  }
  for(const [id, q] of consumoPedidos()) de(id).consumo += q;
  for(const s of m.values()) s.stock = Math.round((s.compras - s.saidas - s.consumo) * 1000) / 1000;
  return m;
}
const saldoDe = (saldos, id)=> (saldos.get(id) || {stock: 0}).stock;
/* "Repor" quando há mínimo e o stock está igual ou abaixo dele (como no Excel) */
const paraRepor = (ing, stock)=> (Number(ing.minimo) || 0) > 0 && stock <= ing.minimo;

const hojeISO = ()=>{ const d = new Date(), z = (n)=>String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
const dataPT = (iso)=> iso ? String(iso).split("-").reverse().join("/") : "";
let seqMov = 0;
const novoIdMov = ()=> "M" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + (++seqMov).toString(36);

/* ======================= LISTA ======================= */
RENDER.ingredientes = function(){
  const n = norm($("ing-filtro").value), soRepor = $("ing-repor").checked;
  const saldos = saldosStock();
  const nRepor = D.ingredientes.filter((i)=>paraRepor(i, saldoDe(saldos, i.id))).length;
  const lista = D.ingredientes.filter((i)=>(!n || norm(i.nome + " " + (i.marca || "") + " " + i.id).includes(n)) &&
                                           (!soRepor || paraRepor(i, saldoDe(saldos, i.id)))).sort(porNome);
  const usos = new Map();
  for(const r of D.receitas) for(const it of (r.itens || [])) usos.set(it.ing, (usos.get(it.ing) || 0) + 1);
  $("ing-repor-txt").textContent = `Só os que estão para repor (${nRepor})`;
  $("ing-contagem").textContent = `${D.ingredientes.length} ingredientes` + ((n || soRepor) ? ` · ${lista.length} na lista` : "");
  $("ing-lista").innerHTML = tabela(
    [{t: "ID", cl: "so-largo"}, {t: "Ingrediente"}, {t: "Marca", cl: "so-largo"}, {t: "Embalagem", num: 1}, {t: "Custo", num: 1, cl: "so-largo"},
     {t: "Stock", num: 1}, {t: "Receitas", num: 1, cl: "so-largo"}],
    lista.slice(0, 400).map((i)=>{ const st = saldoDe(saldos, i.id), rep = paraRepor(i, st);
      return `<tr class="clic ${rep ? "repor" : ""}" data-id="${esc(i.id)}"><td class="so-largo pequeno">${esc(i.id)}</td>
      <td><b>${esc(i.nome)}</b><div class="pequeno so-estreito">${esc(i.marca || "")}</div></td><td class="so-largo">${esc(i.marca || "")}</td>
      <td class="num">${eur(i.preco)}<div class="pequeno">${numTxt(i.qtd)} ${esc(i.unidade)}</div></td>
      <td class="num so-largo">${custoReferencia(i)}</td>
      <td class="num">${numTxt(st)} ${esc(i.unidade)}${rep ? `<div><span class="chip verm">Repor</span></div>` : (i.minimo > 0 ? `<div class="pequeno">mín. ${numTxt(i.minimo)}</div>` : "")}</td>
      <td class="num so-largo">${usos.get(i.id) || ""}</td></tr>`; }),
    D.ingredientes.length ? (soRepor ? "Nenhum ingrediente está para repor. 👍" : "Nenhum ingrediente encontrado.")
                          : "Ainda não há ingredientes. Importe os dados do Excel em Definições ou crie um novo.");
  $("ing-lista").querySelectorAll("tr[data-id]").forEach((tr)=>tr.onclick = ()=>editarIngrediente(tr.dataset.id));
};
$("ing-filtro").addEventListener("input", ()=>RENDER.ingredientes());
$("ing-repor").addEventListener("change", ()=>RENDER.ingredientes());
$("ing-novo").onclick = ()=>editarIngrediente(null);

/* ======================= JANELA DO INGREDIENTE ======================= */
let ingAberto = null;          // {id, daReceita}
function editarIngrediente(id, daReceita){
  const ing = id ? Idx.ing.get(id) : null;
  ingAberto = {id: ing ? ing.id : null, daReceita: !!daReceita};
  const prox = ing ? null : proximoId("ING-", contadores().ING, D.ingredientes.map((x)=>x.id), 3);
  const nomes = [...new Set(D.ingredientes.map((x)=>x.nome))].sort((a, b)=>a.localeCompare(b, "pt"));
  const usos = ing ? receitasQueUsam(ing.id) : [];
  janela(ing ? "Ingrediente" : "Novo ingrediente", `
    <div class="linha">
      <div class="cresce"><label class="campo" for="ie-nome">Ingrediente</label>
        <input type="text" id="ie-nome" list="ie-nomes" autocomplete="off" value="${esc(ing ? ing.nome : "")}"></div>
      <div style="width:110px"><label class="campo">ID</label><input type="text" readonly value="${esc(ing ? ing.id : prox.id)}"></div>
    </div>
    <datalist id="ie-nomes">${nomes.map((x)=>`<option value="${esc(x)}">`).join("")}</datalist>
    <label class="campo" for="ie-marca">Marca</label><input type="text" id="ie-marca" autocomplete="off" value="${esc(ing ? ing.marca || "" : "")}">
    <div class="grelha g4">
      <div><label class="campo" for="ie-preco">Preço da embalagem (€)</label>
        <input type="text" id="ie-preco" inputmode="decimal" value="${ing ? numTxt(ing.preco, 2) : ""}"></div>
      <div><label class="campo" for="ie-qtd">Qtd. da embalagem</label>
        <input type="text" id="ie-qtd" inputmode="decimal" value="${ing ? numTxt(ing.qtd) : ""}"></div>
      <div><label class="campo" for="ie-uni">Unidade</label>
        <select id="ie-uni"><option value=""></option>${["g", "kg", "ml", "L", "u"].map((u)=>`<option ${ing && ing.unidade === u ? "selected" : ""}>${u}</option>`).join("")}</select></div>
      <div><label class="campo" for="ie-minimo">Stock mínimo <span id="ie-minimo-uni">${ing ? "(" + esc(ing.unidade) + ")" : ""}</span></label>
        <input type="text" id="ie-minimo" inputmode="decimal" value="${ing && ing.minimo > 0 ? numTxt(ing.minimo) : ""}" placeholder="0"></div>
    </div>
    <div class="nota">kg é gravado em g e L em ml (as receitas e o stock usam g, ml ou u). O stock mínimo é na mesma unidade.</div>
    ${usos.length ? `<div class="nota">Usado em: ${usos.map((r)=>esc(r.nome)).join(", ")}</div>` : ""}
    <div class="nota verm" id="ie-erro"></div>
    <div id="ie-stock" data-id="${esc(ing ? ing.id : "")}"></div>`,
    [{texto: "Fechar", classe: "sec", id: "modal-cancelar", acao: ()=>{ ingAberto = null; }},
     ...(ing ? [{texto: "Apagar", classe: "verm", id: "ie-apagar", acao: ()=>{ ingAberto = null; apagarIngrediente(ing.id); }}] : []),
     {texto: "Gravar", classe: "verde", id: "modal-ok", manter: true, acao: ()=>gravarIngrediente(ing)}], true);
  renderZonaStock();
  setTimeout(()=>{ const c = $("ie-nome"); if(c && !ing) c.focus(); }, 50);
}

/* Zona Stock dentro da janela (só para ingredientes já gravados) */
function renderZonaStock(){
  const z = $("ie-stock");
  if(!z || !$("modal").classList.contains("aberto")) return;
  const id = z.dataset.id, ing = id ? Idx.ing.get(id) : null;
  if(!id){ z.innerHTML = `<h3>Stock</h3><div class="nota">Grave primeiro o ingrediente para poder registar compras.</div>`; return; }
  if(!ing){ z.innerHTML = ""; return; }
  const s = saldosStock().get(id) || {compras: 0, saidas: 0, consumo: 0, stock: 0};
  const rep = paraRepor(ing, s.stock);
  const movs = D.movimentos.filter((m)=>m.ing === id).sort((a, b)=>String(b.data).localeCompare(String(a.data)) || (b.ts || 0) - (a.ts || 0));
  const manterForm = z.querySelector("#mv-qtd");
  const form = manterForm ? {tipo: $("mv-tipo").value, qtd: $("mv-qtd").value, valor: $("mv-valor").value, data: $("mv-data").value, manual: $("mv-valor").dataset.manual} : null;
  z.innerHTML = `
    <h3 style="margin-top:16px">Stock</h3>
    <div class="grelha g4">
      <div class="cartao kpi"><div class="rot">Stock atual</div><div class="val ${rep ? "verm" : "azul"}" id="ie-stock-val">${numTxt(s.stock)} ${esc(ing.unidade)}</div></div>
      <div class="cartao kpi"><div class="rot">Mínimo</div><div class="val cinz">${ing.minimo > 0 ? numTxt(ing.minimo) + " " + esc(ing.unidade) : "—"}</div></div>
      <div class="cartao kpi"><div class="rot">Comprado</div><div class="val cinz">${numTxt(s.compras)}</div></div>
      <div class="cartao kpi"><div class="rot">Saídas${s.consumo ? " e pedidos" : ""}</div><div class="val cinz">${numTxt(s.saidas + s.consumo)}</div></div>
    </div>
    ${rep ? `<div class="aviso" id="ie-repor"><b>Repor:</b> o stock está igual ou abaixo do mínimo.</div>` : ""}
    <div class="cartao" style="margin-top:10px">
      <div class="grelha g4">
        <div><label class="campo" for="mv-tipo">Movimento</label><select id="mv-tipo"><option>Compra</option><option>Saída</option></select></div>
        <div><label class="campo" for="mv-qtd">Quantidade (${esc(ing.unidade)})</label><input type="text" id="mv-qtd" inputmode="decimal" autocomplete="off"></div>
        <div><label class="campo" for="mv-valor">Valor total (€)</label><input type="text" id="mv-valor" inputmode="decimal" autocomplete="off"></div>
        <div><label class="campo" for="mv-data">Data</label><input type="date" id="mv-data" value="${hojeISO()}"></div>
      </div>
      <div class="linha quebra" style="margin-top:10px;justify-content:space-between">
        <div class="nota" id="mv-dica">Compra: quantidade em ${esc(ing.unidade)} e o valor total pago. Saída: quebras ou acertos de inventário.</div>
        <button class="bt" id="mv-registar">Registar</button>
      </div>
      <div class="nota verm" id="mv-erro"></div>
    </div>
    <div class="bloco rolar" style="margin-top:10px">${tabela([{t: "Data"}, {t: "Movimento"}, {t: "Quantidade", num: 1}, {t: "Valor", num: 1}, {t: ""}],
      movs.map((m)=>`<tr><td>${dataPT(m.data)}</td><td>${m.tipo === "Compra" ? "Compra" : "<span class=\"verm\">Saída</span>"}</td>
        <td class="num">${numTxt(m.qtd)} ${esc(ing.unidade)}</td><td class="num">${eur(m.valor)}</td>
        <td class="num"><button class="lixo" data-mv="${esc(m.id)}" title="Excluir movimento">🗑</button></td></tr>`),
      "Ainda sem movimentos de stock.")}</div>`;
  if(form){ $("mv-tipo").value = form.tipo; $("mv-qtd").value = form.qtd; $("mv-valor").value = form.valor; $("mv-data").value = form.data; if(form.manual) $("mv-valor").dataset.manual = form.manual; }
  const sugerir = ()=>{   // como no Excel: sugere o valor total = qtd × custo por unidade
    if($("mv-valor").dataset.manual === "1") return;
    const q = lerNumero($("mv-qtd").value);
    $("mv-valor").value = (q > 0 && ing.qtd > 0) ? numTxt(arred2(ing.preco / ing.qtd * q), 2) : "";
  };
  $("mv-qtd").oninput = sugerir;
  $("mv-valor").oninput = ()=>{ $("mv-valor").dataset.manual = $("mv-valor").value.trim() ? "1" : ""; };
  $("mv-registar").onclick = ()=>registarMovimento(ing);
  z.querySelectorAll("[data-mv]").forEach((b)=>b.onclick = ()=>excluirMovimento(b.dataset.mv));
}
GANCHOS_RENDER.push(renderZonaStock);

function registarMovimento(ing){
  const erro = (t, campo)=>{ $("mv-erro").textContent = t; if(campo) $(campo).focus(); };
  const tipo = $("mv-tipo").value, q = lerNumero($("mv-qtd").value), v = $("mv-valor").value.trim() === "" ? 0 : lerNumero($("mv-valor").value);
  const data = $("mv-data").value;
  if(q == null || !(q > 0)) return erro("Indique uma quantidade maior que 0.", "mv-qtd");
  if(v == null || v < 0) return erro("Valor total inválido.", "mv-valor");
  if(tipo === "Compra" && !(v > 0)) return erro("Indique o valor total pago pela compra.", "mv-valor");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data)) return erro("Indique a data.", "mv-data");
  const fazer = ()=>{
    gravar([{tipo: "set", col: "movimentos", id: novoIdMov(), dados: {ing: ing.id, tipo, qtd: q, valor: arred2(v), data, ts: Date.now()}}]);
    toast(`${tipo} registada: ${numTxt(q)} ${ing.unidade} de ${nomeComMarca(ing)}`);
    $("mv-qtd").value = ""; $("mv-valor").value = ""; delete $("mv-valor").dataset.manual; $("mv-erro").textContent = "";
    renderZonaStock();
  };
  const stock = saldoDe(saldosStock(), ing.id);
  if(tipo === "Saída" && q > stock + 1e-9){
    // fecha a janela de confirmação e volta a abrir a do ingrediente
    const id = ing.id, daRec = ingAberto && ingAberto.daReceita;
    confirmarEVoltar("Saída maior que o stock", `<p>O stock de <b>${esc(nomeComMarca(ing))}</b> é ${numTxt(stock)} ${esc(ing.unidade)}.<br>Com esta saída fica <b class="verm">${numTxt(stock - q)} ${esc(ing.unidade)}</b>.</p><p>Registar na mesma?</p>`,
      "Registar", ()=>{ gravar([{tipo: "set", col: "movimentos", id: novoIdMov(), dados: {ing: id, tipo, qtd: q, valor: arred2(v), data, ts: Date.now()}}]);
        toast(`Saída registada: ${numTxt(q)} ${ing.unidade}`); }, ()=>editarIngrediente(id, daRec));
    return;
  }
  fazer();
}

/* Pergunta e, no fim (sim ou não), volta à janela do ingrediente */
function confirmarEVoltar(tit, html, txtOk, acao, voltar){
  janela(tit, html, [{texto: "Cancelar", classe: "sec", id: "modal-cancelar", acao: voltar},
                     {texto: txtOk, classe: "verm", id: "modal-ok", acao: ()=>{ acao(); voltar(); }}]);
}

function excluirMovimento(idMov){
  const m = D.movimentos.find((x)=>x.id === idMov); if(!m) return;
  const ing = Idx.ing.get(m.ing), daRec = ingAberto && ingAberto.daReceita;
  confirmarEVoltar("Excluir movimento", `<p>Excluir este movimento de stock?</p><p><b>${esc(m.tipo)}</b> de ${numTxt(m.qtd)} ${esc(ing ? ing.unidade : "")} (${eur(m.valor)}) em ${dataPT(m.data)}<br>${esc(nomeComMarca(ing))}</p>`,
    "Excluir", ()=>{ gravar([{tipo: "del", col: "movimentos", id: idMov}]); toast("Movimento excluído."); }, ()=>{ if(ing) editarIngrediente(ing.id, daRec); });
}

/* ======================= GRAVAR / APAGAR ======================= */
function gravarIngrediente(ing){
  const erro = (t, campo)=>{ $("ie-erro").textContent = t; if(campo) $(campo).focus(); };
  const nome = proper(limparEspacos($("ie-nome").value)), marca = proper(limparEspacos($("ie-marca").value));
  const preco = lerNumero($("ie-preco").value), qtd = lerNumero($("ie-qtd").value), uni = $("ie-uni").value;
  const minimo = $("ie-minimo").value.trim() === "" ? 0 : lerNumero($("ie-minimo").value);
  if(!nome) return erro("Insira o nome do ingrediente.", "ie-nome");
  if(preco == null) return erro("Preço inválido.", "ie-preco");
  if(preco < 0) return erro("O preço não pode ser negativo.", "ie-preco");
  if(qtd == null) return erro("Quantidade inválida.", "ie-qtd");
  if(!(qtd > 0)) return erro("A quantidade da embalagem tem de ser maior que 0.", "ie-qtd");
  if(!normalizarUnidade(uni)) return erro("Selecione a unidade: g, kg, ml, L ou u.", "ie-uni");
  if(minimo == null || minimo < 0) return erro("Stock mínimo inválido (pode ficar vazio ou 0).", "ie-minimo");
  const dup = D.ingredientes.find((x)=>(!ing || x.id !== ing.id) && norm(x.nome) === norm(nome) && norm(x.marca || "") === norm(marca));
  if(dup) return erro(`Já existe o ingrediente '${nome}' da marca '${marca}' (${dup.id}).`, "ie-nome");
  const base = converterUnidadeBase(qtd, uni);
  if(ing && ing.unidade !== base.unidade && temMovimentos(ing.id))
    return erro(`Não é possível mudar a unidade de ${ing.unidade} para ${base.unidade}: este ingrediente já tem movimentos de stock nessa unidade.`, "ie-uni");
  const dados = {nome, marca, preco, qtd: base.qtd, unidade: base.unidade, minimo};
  const ops = [];
  let id;
  if(ing){
    id = ing.id;
  }else{
    const p = proximoId("ING-", contadores().ING, D.ingredientes.map((x)=>x.id), 3);
    id = p.id; const oc = opContador("ING-", p.numero); if(oc) ops.push(oc);
  }
  ops.push({tipo: "set", col: "ingredientes", id, dados});
  const daReceita = ingAberto && ingAberto.daReceita;
  ingAberto = null;
  fecharJanela();
  gravar(ops);
  const conv = base.convertido ? ` (embalagem gravada como ${numTxt(base.qtd)} ${base.unidade})` : "";
  const nUsos = receitasQueUsam(id).length;
  const mudouCusto = ing && (ing.preco !== dados.preco || ing.qtd !== dados.qtd) && nUsos;
  toast((ing ? `Ingrediente ${id} alterado` : `Ingrediente adicionado com o ID ${id}`) + conv + ".");
  if(daReceita && ing && (ing.preco !== dados.preco || ing.qtd !== dados.qtd)){
    if(typeof ed !== "undefined" && ed) ed.sujo = true;
    setTimeout(()=>aviso(`O custo e o PVP desta receita já foram recalculados com o preço novo de ${nome}.\nToque em "Gravar receita" para os guardar.` +
      (nUsos > 1 ? `\n\n${nome} também é usado noutras ${nUsos - 1} receita(s): para essas, use "Atualizar custos" em Receitas.` : ""), "Preço atualizado"), 300);
  }else if(mudouCusto){
    setTimeout(()=>aviso(`O custo de ${nome} mudou e é usado em ${nUsos} receita(s).\nPara atualizar o custo e o PVP dessas receitas, use "Atualizar custos" em Receitas.`, "Custos das receitas"), 300);
  }
}

function apagarIngrediente(id){
  const ing = Idx.ing.get(id); if(!ing) return;
  const desc = `${ing.id}  ${nomeComMarca(ing)}`;
  const usos = receitasQueUsam(id);
  if(usos.length){ aviso(`Não é possível apagar:\n   ${desc}\n\nÉ usado em:\n${usos.map((r)=>"   " + r.id + "  " + r.nome).join("\n")}\n\nRetire-o primeiro dessas receitas.`, "Apagar"); return; }
  if(temMovimentos(id)){ aviso(`Não é possível apagar:\n   ${desc}\n\nTem movimentos de stock (compras ou saídas). Exclua primeiro esses movimentos.`, "Apagar"); return; }
  confirmar("Apagar ingrediente", `<p>Apagar definitivamente o ingrediente?</p><p><b>${esc(desc)}</b></p><p class="nota">O ID ${esc(id)} não voltará a ser usado.</p>`,
    "Apagar", ()=>{
      const ops = [{tipo: "del", col: "ingredientes", id}];
      const oc = opContador("ING-", numeroDoId(id)); if(oc) ops.unshift(oc);
      gravar(ops); toast(`Ingrediente apagado: ${desc}`);
    }, "verm");
}
