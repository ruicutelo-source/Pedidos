"use strict";
/* =====================================================================
   FICHAS PARA IMPRIMIR / GUARDAR EM PDF (como a "Ficha de Impressão" do Excel)
   1 - Cozinha: ingredientes e modo de preparação
   2 - Custos: + custo de cada ingrediente
   3 - Completa: + resumo por dose (custos, mão de obra, lucro, IVA, PVP)
   Todas levam a foto da receita (se existir). Pode ser feita para outro nº de doses.
   ===================================================================== */
$("rec-ficha").onclick = ()=>{
  const o = ed && ed.original;
  if(!o){ aviso("Grave primeiro a receita para poder imprimir a ficha."); return; }
  const aviso_ = ed.sujo ? `<div class="aviso">Há alterações por gravar. A ficha usa a receita <b>gravada</b>.</div>` : "";
  janela("Ficha para imprimir", `${aviso_}<p><b>${esc(o.nome)}</b> (${esc(o.id)})</p>
    <label class="campo">Que ficha?</label>
    <div class="seletor" id="fi-tipo">
      <button data-t="1" class="ativo">1 · Cozinha</button><button data-t="2">2 · Com custos</button><button data-t="3">3 · Completa</button></div>
    <div class="nota" id="fi-desc">Ingredientes e modo de preparação.</div>
    <label class="campo" for="fi-doses">Para quantas doses? (receita base: ${numTxt(o.doses)})</label>
    <input type="text" id="fi-doses" inputmode="decimal" value="${numTxt(o.doses)}" style="max-width:160px">
    <div class="nota verm" id="fi-erro"></div>
    <p class="nota">No ecrã de impressão pode escolher a impressora ou <b>Guardar como PDF</b>.</p>`,
    [{texto: "Cancelar", classe: "sec", id: "modal-cancelar"},
     {texto: "🖨 Imprimir", id: "modal-ok", manter: true, acao: ()=>{
        const doses = lerNumero($("fi-doses").value);
        if(!(doses > 0)){ $("fi-erro").textContent = "O nº de doses tem de ser maior que 0."; return; }
        const tipo = +$("fi-tipo").querySelector(".ativo").dataset.t;
        fecharJanela(); imprimirFicha(o, tipo, doses);
      }}]);
  const desc = {1: "Ingredientes e modo de preparação.", 2: "Ingredientes com o custo de cada um.", 3: "Com o resumo por dose: custos, mão de obra, lucro, IVA e PVP."};
  $("fi-tipo").querySelectorAll("button").forEach((b)=>b.onclick = ()=>{
    $("fi-tipo").querySelectorAll("button").forEach((x)=>x.classList.toggle("ativo", x === b)); $("fi-desc").textContent = desc[b.dataset.t];
  });
};

function htmlFicha(r, tipo, doses, foto){
  const base = Number(r.doses) || 1, fator = doses / base;
  const titulo = {1: "FICHA TÉCNICA · COZINHA", 2: "FICHA TÉCNICA · CUSTOS", 3: "FICHA TÉCNICA · COMPLETA"}[tipo];
  let faltam = false, totalIngr = 0;
  const linhas = r.itens.map((it)=>{
    const ing = Idx.ing.get(it.ing), qtd = it.qtd * fator;
    let custo, nome = it.nome, marca = it.marca, uni = it.unidade;
    if(ing){ custo = custoItem(ing, qtd); nome = ing.nome; marca = ing.marca || ""; uni = ing.unidade; }
    else { custo = arred2((it.custo || 0) * fator); nome += " *"; faltam = true; }
    totalIngr += custo;
    return `<tr><td>${esc(nome)}</td><td>${esc(marca)}</td><td class="num">${numTxt(qtd)}</td><td class="c">${esc(uni)}</td>${tipo >= 2 ? `<td class="num">${eur(custo)}</td>` : ""}</tr>`;
  });
  totalIngr = arred2(totalIngr);
  let resumo = "";
  if(tipo === 3){
    const custoDose = arred2(totalIngr / doses), mo = Number(r.maoObra) || 0, moDose = mo / base;
    const custoGastos = custoDose * (1 + (r.gOp || 0) + (r.gNaoOp || 0)) + moDose;
    const semIva = custoGastos * (1 + (r.margem || 0));
    const pvp = pvpReceita(custoDose, r.gOp, r.gNaoOp, r.margem, r.iva, moDose);
    const p1 = (v)=> pct(v || 0);
    const L = (t, v, forte)=> `<tr class="${forte ? "forte" : ""}"><td>${t}</td><td class="num">${eur(v)}</td></tr>`;
    resumo = `<h3>RESUMO POR DOSE</h3><table class="resumo"><tbody>
      ${L("Custo dos ingredientes", custoDose)}
      ${L(`Gastos operacionais (${p1(r.gOp)})`, custoDose * (r.gOp || 0))}
      ${L(`Gastos não operacionais (${p1(r.gNaoOp)})`, custoDose * (r.gNaoOp || 0))}
      ${L(`Mão de obra (${eur(mo)} ÷ ${numTxt(base)} doses)`, moDose)}
      ${L("Custo total com gastos e mão de obra", custoGastos, true)}
      ${L(`Lucro (${p1(r.margem)} sobre o custo total)`, custoGastos * (r.margem || 0))}
      ${L("Preço sem IVA", semIva, true)}
      ${L(`IVA (${p1(r.iva)})`, semIva * (r.iva || 0))}
      ${L("PVP por dose", pvp, true)}
      ${L(`Faturação prevista (${numTxt(doses)} doses)`, arred2(pvp * doses), true)}
    </tbody></table>
    ${Math.abs(pvp - (r.pvp || 0)) >= 0.005 ? `<p class="alerta">Atenção: o PVP gravado na receita é ${eur(r.pvp)}. Use "Atualizar custos" em Receitas para o atualizar.</p>` : ""}`;
  }
  return `<div class="ficha">
    <div class="f-tit">${titulo}</div>
    <div class="f-nome">${esc(r.nome)}</div>
    <div class="f-info">ID: ${esc(r.id)} &nbsp;|&nbsp; Doses: ${numTxt(doses)}${fator !== 1 ? ` (receita base: ${numTxt(base)})` : ""} &nbsp;|&nbsp; Data: ${dataCurta(Date.now())}</div>
    ${foto ? `<div class="f-foto"><img src="${foto}" alt=""></div>` : ""}
    <h3>INGREDIENTES</h3>
    <table><thead><tr><th>Ingrediente</th><th>Marca</th><th class="num">Quantidade</th><th class="c">Unidade</th>${tipo >= 2 ? `<th class="num">Custo</th>` : ""}</tr></thead>
      <tbody>${linhas.join("") || `<tr><td colspan="5"><i>(receita sem ingredientes)</i></td></tr>`}
      ${tipo >= 2 ? `<tr class="forte"><td colspan="4">Custo dos ingredientes (${numTxt(doses)} doses)</td><td class="num">${eur(totalIngr)}</td></tr>` : ""}</tbody></table>
    ${tipo >= 2 ? `<p class="f-nota">${faltam ? "* Ingrediente que já não existe: usado o custo gravado na receita. " : ""}Custos calculados com os preços atuais dos ingredientes.</p>` : (faltam ? `<p class="f-nota">* Ingrediente que já não existe nos ingredientes.</p>` : "")}
    ${resumo}
    <h3>MODO DE PREPARAÇÃO</h3>
    <div class="f-modo">${r.modo ? esc(r.modo) : "<i>(sem modo de preparação)</i>"}</div>
  </div>`;
}

function imprimirFicha(r, tipo, doses){
  const fazer = (foto)=>{
    $("impressao").innerHTML = htmlFicha(r, tipo, doses, foto);
    document.body.classList.add("a-imprimir");
    const limpar = ()=>{ document.body.classList.remove("a-imprimir"); window.removeEventListener("afterprint", limpar); };
    window.addEventListener("afterprint", limpar);
    const imgs = [...$("impressao").querySelectorAll("img")];
    Promise.all(imgs.map((im)=>im.complete ? 1 : new Promise((ok)=>{ im.onload = im.onerror = ok; })))
      .then(()=>setTimeout(()=>window.print(), 50));
  };
  if(r.temFoto) Store.lerFoto(r.id).then((img)=>fazer(img)); else fazer(null);
}
