"use strict";
/* =====================================================================
   RECEITAS — só o administrador
   Cada produto vendido no café é uma receita (preço = PVP da receita).
   Regras iguais ao formulário de Receitas do Excel.
   ===================================================================== */

/* Estado da receita gravada vs. os preços atuais dos ingredientes */
function estadoReceita(r){
  const c = calcularReceita(r, Idx.ing);
  const itensMudaram = c.itens.some((it, i)=>arred2(it.custo) !== arred2((r.itens[i] || {}).custo));
  const desatualizada = itensMudaram || c.total !== arred2(r.custoTotal) || c.custoDose !== arred2(r.custoDose) || c.pvp !== arred2(r.pvp);
  const faltam = c.itens.filter((it)=>!it.existe);
  const ind = indicadores(arred2(r.custoDose), arred2(r.pvp), r, (Number(r.doses) > 0 ? (Number(r.maoObra) || 0) / r.doses : 0));
  return {calc: c, desatualizada, faltam, ind};
}

/* ======================= LISTA ======================= */
let recVista = "lista";
RENDER.receitas = function(){
  $("rec-vista-lista").style.display = recVista === "lista" ? "block" : "none";
  $("rec-vista-editor").style.display = recVista === "editor" ? "block" : "none";
  if(recVista === "editor"){ renderEditor(); return; }
  const n = norm($("rec-filtro").value);
  const lista = D.receitas.filter((r)=>!n || norm(r.nome + " " + r.id).includes(n)).sort(porNome);
  const est = new Map(D.receitas.map((r)=>[r.id, estadoReceita(r)]));
  const nDesat = [...est.values()].filter((e)=>e.desatualizada).length;
  $("rec-aviso-desat").innerHTML = nDesat ? `<div class="aviso">${nDesat} ${nDesat === 1 ? "receita tem" : "receitas têm"} custos diferentes dos preços atuais dos ingredientes (marcadas com ⚠). Use <b>Atualizar custos</b> para gravar os novos custos e PVP.</div>` : "";
  $("rec-lista").innerHTML = tabela(
    [{t: "ID", cl: "so-largo"}, {t: "Receita"}, {t: "Doses", num: 1, cl: "so-largo"}, {t: "Custo / dose", num: 1}, {t: "PVP", num: 1}, {t: "Lucro % s/ custo", num: 1}],
    lista.map((r)=>{ const e = est.get(r.id);
      return `<tr class="clic" data-id="${esc(r.id)}"><td class="so-largo pequeno">${esc(r.id)}</td>
        <td><b>${esc(r.nome)}</b>${r.temFoto ? " 📷" : ""}${e.desatualizada ? ` <span class="chip verm" title="Custos por atualizar">⚠</span>` : ""}</td>
        <td class="num so-largo">${numTxt(r.doses)}</td><td class="num">${eur(r.custoDose)}</td><td class="num"><b>${eur(r.pvp)}</b></td>
        <td class="num"><span class="chip ${e.ind.cobreMargem ? "verde" : "verm"}">${pct(e.ind.lucroPct)}</span></td></tr>`; }),
    D.receitas.length ? "Nenhuma receita encontrada." : "Ainda não há receitas.");
  $("rec-lista").querySelectorAll("tr[data-id]").forEach((tr)=>tr.onclick = ()=>abrirReceita(tr.dataset.id));
};
$("rec-filtro").addEventListener("input", ()=>RENDER.receitas());
$("rec-nova").onclick = ()=>abrirReceita(null);

/* Atualizar custos de todas as receitas com os preços da Mestra (botão "Atualizar custos" do Excel) */
$("rec-atualizar").onclick = ()=>{
  if(!D.receitas.length){ aviso("Não existem receitas gravadas.", "Atualizar custos"); return; }
  const ops = [], linhas = [], faltam = [], semDoses = [];
  let nItens = 0;
  for(const r of D.receitas.slice().sort(porNome)){
    const e = estadoReceita(r);
    e.calc.itens.forEach((it, i)=>{ if(it.existe && arred2(it.custo) !== arred2((r.itens[i] || {}).custo)) nItens++; });
    for(const f of e.faltam) faltam.push(`${r.id} → ${f.ing} (${f.nome})`);
    if(!(Number(r.doses) > 0)){ semDoses.push(`${r.id} ${r.nome}`); continue; }
    if(!e.desatualizada) continue;
    ops.push({tipo: "update", col: "receitas", id: r.id, dados: {
      itens: e.calc.itens.map((it)=>({ing: it.ing, qtd: it.qtd, custo: it.custo, nome: it.nome, marca: it.marca, unidade: it.unidade})),
      custoTotal: e.calc.total, custoDose: e.calc.custoDose, pvp: e.calc.pvp, atualizado: Date.now()}});
    linhas.push(`<tr><td>${esc(r.id)} ${esc(r.nome)}</td><td class="num">${eur(r.pvp)}</td><td class="num"><b>${eur(e.calc.pvp)}</b></td></tr>`);
  }
  let html = `<p>Receitas verificadas: <b>${D.receitas.length}</b><br>Receitas atualizadas: <b>${ops.length}</b><br>Ingredientes com custo atualizado: <b>${nItens}</b></p>`;
  if(linhas.length) html += `<div class="bloco rolar">${tabela([{t: "Receita"}, {t: "PVP antes", num: 1}, {t: "PVP agora", num: 1}], linhas, "")}</div>`;
  if(faltam.length) html += `<p class="nota">Ingredientes que já não existem (custo gravado mantido):<br>${faltam.map(esc).join("<br>")}</p>`;
  if(semDoses.length) html += `<p class="nota">Receitas sem nº de doses (não recalculadas):<br>${semDoses.map(esc).join("<br>")}</p>`;
  gravar(ops);
  janela("Atualizar custos", html, [{texto: "OK", id: "modal-ok"}], true);
};

/* ======================= EDITOR ======================= */
let ed = null;   // {id, original, itens, fotoEstado:"igual"|"nova"|"remover", fotoImg, fotoOriginal, ingSel, editarItem, sujo}

function abrirReceita(id){
  const r = id ? Idx.rec.get(id) : null;
  ed = {id: r ? r.id : null, original: r, itens: r ? r.itens.map((it)=>({...it})) : [], fotoEstado: "igual", fotoImg: null,
        fotoOriginal: null, ingSel: null, editarItem: -1, sujo: false};
  recVista = "editor";
  const prox = r ? null : proximoId("REC-", contadores().REC, D.receitas.map((x)=>x.id), 3);
  $("rec-ed-tit").textContent = r ? "Receita" : "Nova receita";
  $("rec-nome").value = r ? r.nome : "";
  $("rec-id").value = r ? r.id : prox.id;
  $("rec-doses").value = r ? numTxt(r.doses) : "1";
  const p = (v)=> (v == null || v === "") ? "" : numTxt(arred2(v * 100 * 100) / 100, 2);
  $("rec-gop").value = r ? p(r.gOp) : ""; $("rec-gnop").value = r ? p(r.gNaoOp) : "";
  $("rec-margem").value = r ? p(r.margem) : ""; $("rec-iva").value = r ? p(r.iva) : "";
  $("rec-mo").value = r && r.maoObra > 0 ? numTxt(r.maoObra, 2) : "";
  $("rec-modo").value = r ? (r.modo || "") : "";
  $("rec-apagar").style.display = r ? "inline-block" : "none";
  limparPesquisaIng();
  mostrar("receitas");
  mostrarFoto(null);
  if(r && r.temFoto){
    $("rec-foto-caixa").innerHTML = `<span class="nota">A carregar a foto…</span>`;
    Store.lerFoto(r.id).then((img)=>{ if(ed && ed.id === r.id && ed.fotoEstado === "igual"){ ed.fotoOriginal = img; mostrarFoto(img); } });
  }
  if(r){
    // como no Excel: ao abrir, os custos são recalculados com os preços atuais
    const e = estadoReceita(r);
    const nAlt = e.calc.itens.filter((it, i)=>it.existe && arred2(it.custo) !== arred2((r.itens[i] || {}).custo)).length;
    let msg = "";
    if(nAlt) msg = `${nAlt} ingrediente(s) com preço diferente do gravado.\n\nCusto total:  ${eur(r.custoTotal)}  →  ${eur(e.calc.total)}\nPVP:  ${eur(r.pvp)}  →  ${eur(e.calc.pvp)}\n\nToque em "Gravar receita" para guardar os novos valores.`;
    if(e.faltam.length) msg += (msg ? "\n\n" : "") + "Ingredientes que já não existem (custo gravado mantido):\n" + e.faltam.map((f)=>`   ${f.ing} (${f.nome})`).join("\n");
    if(msg) setTimeout(()=>aviso(msg, "Preços atualizados"), 100);
  }
}

/* Valores do ecrã -> objeto receita (percentagens em fração) */
function receitaDoEcra(){
  const pctF = (id)=>{ const v = lerNumero($(id).value); return v == null ? null : v / 100; };
  return {doses: lerNumero($("rec-doses").value), gOp: pctF("rec-gop"), gNaoOp: pctF("rec-gnop"), margem: pctF("rec-margem"),
          iva: pctF("rec-iva"), maoObra: lerNumero($("rec-mo").value) || 0, itens: ed.itens};
}

function renderEditor(){
  if(!ed) return;
  const r = receitaDoEcra();
  const c = calcularReceita({...r, doses: r.doses || 0}, Idx.ing);
  $("rec-itens").innerHTML = tabela([{t: "Ingrediente"}, {t: "Qtd", num: 1}, {t: "Custo", num: 1}, {t: ""}],
    c.itens.map((it, i)=>`<tr class="${i === ed.editarItem ? "sel" : ""}"><td><b>${esc(it.nome)}</b>${it.marca ? `<div class="pequeno">${esc(it.marca)}</div>` : ""}
        ${it.existe ? `<div><button class="link" data-preco="${esc(it.ing)}">💶 Atualizar preço</button></div>` : `<div class="pequeno verm">já não existe nos ingredientes (custo gravado)</div>`}</td>
      <td class="num">${numTxt(it.qtd)} ${esc(it.unidade)}</td><td class="num">${eur(it.custo)}</td>
      <td class="num" style="white-space:nowrap"><button class="lixo" data-editar="${i}" title="Alterar quantidade">✏️</button><button class="lixo" data-tirar="${i}" title="Retirar">🗑</button></td></tr>`),
    "Junte os ingredientes da receita.");
  $("rec-itens").querySelectorAll("[data-tirar]").forEach((b)=>b.onclick = ()=>{ ed.itens.splice(+b.dataset.tirar, 1); ed.editarItem = -1; ed.sujo = true; limparPesquisaIng(); renderEditor(); });
  $("rec-itens").querySelectorAll("[data-preco]").forEach((b)=>b.onclick = ()=>editarIngrediente(b.dataset.preco, true));
  $("rec-itens").querySelectorAll("[data-editar]").forEach((b)=>b.onclick = ()=>{
    const i = +b.dataset.editar, it = ed.itens[i]; ed.editarItem = i;
    escolherIngrediente(it.ing); $("rec-ing-qtd").value = numTxt(it.qtd); $("rec-ing-add").textContent = "Atualizar"; $("rec-ing-qtd").focus(); renderEditor();
  });
  $("rec-custo-total").textContent = eur(c.total);
  $("rec-custo-dose").textContent = r.doses > 0 ? eur(c.custoDose) : "—";
  $("rec-pvp").textContent = eur(c.pvp);
  $("rec-pvp-det").innerHTML = `Custo c/ gastos e M.O.: ${eur(c.custoComGastos)}<br>Mão de obra / dose: ${eur(c.maoObraDose)}<br>` +
    `Lucro / dose: ${eur(c.lucro)}  ·  Preço s/ IVA: ${eur(c.precoSemIva)}`;
}
["rec-doses", "rec-gop", "rec-gnop", "rec-margem", "rec-iva", "rec-mo"].forEach((id)=>$(id).addEventListener("input", ()=>{ ed && (ed.sujo = true); renderEditor(); }));
["rec-nome", "rec-modo"].forEach((id)=>$(id).addEventListener("input", ()=>{ ed && (ed.sujo = true); }));

/* ---------- pesquisa de ingredientes ---------- */
function limparPesquisaIng(){
  if(ed){ ed.ingSel = null; ed.editarItem = -1; }
  $("rec-ing-busca").value = ""; $("rec-ing-qtd").value = ""; $("rec-ing-uni").textContent = "";
  $("rec-ing-escolhido").textContent = ""; $("rec-ing-sug").style.display = "none"; $("rec-ing-add").textContent = "Adicionar";
}
function escolherIngrediente(idIng){
  const ing = Idx.ing.get(idIng); if(!ing) return;
  ed.ingSel = idIng;
  $("rec-ing-busca").value = nomeComMarca(ing); $("rec-ing-uni").textContent = ing.unidade;
  $("rec-ing-escolhido").innerHTML = `${esc(ing.id)} · embalagem ${eur(ing.preco)} / ${numTxt(ing.qtd)} ${esc(ing.unidade)}`;
  $("rec-ing-sug").style.display = "none";
}
$("rec-ing-busca").addEventListener("input", ()=>{
  ed.ingSel = null; $("rec-ing-uni").textContent = ""; $("rec-ing-escolhido").textContent = "";
  const n = norm($("rec-ing-busca").value), box = $("rec-ing-sug");
  if(!n){ box.style.display = "none"; return; }
  const palavras = n.split(/\s+/);
  const lista = D.ingredientes.filter((i)=>{ const t = norm(i.nome + " " + (i.marca || "")); return palavras.every((p)=>t.includes(p)); })
    .sort((a, b)=>(norm(a.nome).startsWith(n) ? 0 : 1) - (norm(b.nome).startsWith(n) ? 0 : 1) || porNome(a, b)).slice(0, 12);
  box.innerHTML = lista.map((i)=>`<div data-id="${esc(i.id)}"><b>${esc(i.nome)}</b> ${i.marca ? "· " + esc(i.marca) : ""} <small>${eur(i.preco)} / ${numTxt(i.qtd)} ${esc(i.unidade)}</small></div>`).join("")
    || `<div class="nota" style="cursor:default">Nenhum ingrediente com esse nome. Crie-o primeiro em Ingredientes.</div>`;
  box.style.display = "block";
  box.querySelectorAll("div[data-id]").forEach((d)=>d.onmousedown = d.ontouchstart = (e)=>{ e.preventDefault(); escolherIngrediente(d.dataset.id); $("rec-ing-qtd").focus(); });
});
$("rec-ing-busca").addEventListener("blur", ()=>setTimeout(()=>{ $("rec-ing-sug").style.display = "none"; }, 150));
$("rec-ing-qtd").addEventListener("keydown", (e)=>{ if(e.key === "Enter") $("rec-ing-add").click(); });
$("rec-ing-add").onclick = ()=>{
  if(!ed.ingSel){ aviso("Escolha um ingrediente na lista.\nPode escrever parte do nome ou da marca para o encontrar."); return; }
  const q = lerNumero($("rec-ing-qtd").value);
  if(q == null){ aviso("Insira uma quantidade válida (ex.: 250 ou 0,5)."); return; }
  if(!(q > 0)){ aviso("A quantidade tem de ser maior que 0."); return; }
  const ing = Idx.ing.get(ed.ingSel);
  const item = {ing: ing.id, qtd: q, custo: custoItem(ing, q), nome: ing.nome, marca: ing.marca || "", unidade: ing.unidade};
  if(ed.editarItem >= 0 && ed.editarItem < ed.itens.length) ed.itens[ed.editarItem] = item; else ed.itens.push(item);
  ed.sujo = true; limparPesquisaIng(); renderEditor(); $("rec-ing-busca").focus();
};

/* ---------- foto (reduzida para caber na base de dados) ---------- */
function mostrarFoto(img){
  $("rec-foto-caixa").innerHTML = img ? `<img src="${img}" alt="Foto da receita">` : `<span class="nota">Sem foto</span>`;
  $("rec-foto-remover").style.display = img ? "inline-block" : "none";
}
function reduzirImagem(ficheiro, lado, qualidade){
  return new Promise((ok, erro)=>{
    const url = URL.createObjectURL(ficheiro), im = new Image();
    im.onload = ()=>{
      const f = Math.min(1, lado / Math.max(im.width, im.height));
      const cv = document.createElement("canvas"); cv.width = Math.round(im.width * f); cv.height = Math.round(im.height * f);
      const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      let q = qualidade, d = cv.toDataURL("image/jpeg", q);
      while(d.length > 300000 && q > 0.35){ q -= 0.1; d = cv.toDataURL("image/jpeg", q); }   // no máximo ~300 KB
      ok(d);
    };
    im.onerror = ()=>{ URL.revokeObjectURL(url); erro(new Error("imagem")); };
    im.src = url;
  });
}
$("rec-foto-escolher").onclick = ()=>$("rec-foto-ficheiro").click();
$("rec-foto-ficheiro").onchange = (e)=>{
  const f = e.target.files[0]; e.target.value = ""; if(!f) return;
  reduzirImagem(f, 900, 0.75).then((img)=>{ ed.fotoEstado = "nova"; ed.fotoImg = img; ed.sujo = true; mostrarFoto(img); })
    .catch(()=>aviso("Não foi possível ler essa imagem. Escolha uma foto em JPG ou PNG."));
};
$("rec-foto-remover").onclick = ()=>{ ed.fotoEstado = "remover"; ed.fotoImg = null; ed.sujo = true; mostrarFoto(null); };

/* ---------- gravar ---------- */
$("rec-gravar").onclick = ()=>{
  const nomeEcra = proper(limparEspacos($("rec-nome").value));
  if(!nomeEcra){ aviso("Insira o nome da receita."); $("rec-nome").focus(); return; }
  if(!ed.itens.length){ aviso("Adicione pelo menos um ingrediente à receita."); return; }
  const r = receitaDoEcra();
  if(!(r.doses > 0)){ aviso("Indique o nº de doses (maior que 0)."); $("rec-doses").focus(); return; }
  for(const [id, nome] of [["rec-gop", "G. Oper. (%)"], ["rec-gnop", "G. Não Oper. (%)"], ["rec-margem", "Margem (%)"], ["rec-iva", "IVA (%)"]]){
    const t = $(id).value.trim();
    if(t === ""){ aviso(`Preencha o campo '${nome}' (pode ser 0).`); $(id).focus(); return; }
    const v = lerNumero(t); if(v == null || v < 0){ aviso(`Valor inválido no campo '${nome}'.`); $(id).focus(); return; }
  }
  if($("rec-mo").value.trim() !== ""){ const v = lerNumero($("rec-mo").value); if(v == null || v < 0){ aviso("Valor inválido na mão de obra."); $("rec-mo").focus(); return; } }

  const continuar = (novo)=>gravarReceita(nomeEcra, r, novo);
  const o = ed.original;
  if(o && norm(o.nome) !== norm(nomeEcra)){
    janela("Receita nova ou alteração?", `<p>A receita aberta é a <b>${esc(o.id)} – ${esc(o.nome)}</b>.<br>O nome escrito agora é: <b>${esc(nomeEcra)}</b></p>`,
      [{texto: "Cancelar", classe: "sec", id: "modal-cancelar"},
       {texto: `Mudar o nome da ${o.id}`, classe: "sec", id: "rec-renomear", acao: ()=>continuar(false)},
       {texto: `Criar receita nova`, id: "modal-ok", acao: ()=>continuar(true)}]);
    return;
  }
  continuar(!o);
};

function gravarReceita(nome, r, novo){
  const idAtual = novo ? null : ed.original.id;
  const dup = D.receitas.find((x)=>x.id !== idAtual && norm(x.nome) === norm(nome));
  if(dup){ aviso(`Já existe uma receita com o nome '${nome}' (${dup.id}).\nEscolha outro nome.`, "Nome repetido"); return; }
  const c = calcularReceita(r, Idx.ing);
  const ops = [];
  let id = idAtual;
  if(novo){
    const p = proximoId("REC-", contadores().REC, D.receitas.map((x)=>x.id), 3);
    id = p.id; const oc = opContador("REC-", p.numero); if(oc) ops.push(oc);
  }
  // foto: nova, removida, ou a mesma (numa receita nova feita a partir de outra, a foto é copiada)
  let temFoto = !!(ed.original && ed.original.temFoto);
  if(ed.fotoEstado === "nova"){ ops.push({tipo: "set", col: "fotos", id, dados: {img: ed.fotoImg}}); temFoto = true; }
  else if(ed.fotoEstado === "remover"){ if(!novo) ops.push({tipo: "del", col: "fotos", id}); temFoto = false; }
  else if(novo && temFoto){ if(ed.fotoOriginal) ops.push({tipo: "set", col: "fotos", id, dados: {img: ed.fotoOriginal}}); else temFoto = false; }
  ops.push({tipo: "set", col: "receitas", id, dados: {
    nome, doses: r.doses, modo: $("rec-modo").value, gOp: r.gOp, gNaoOp: r.gNaoOp, margem: r.margem, iva: r.iva, maoObra: r.maoObra,
    itens: c.itens.map((it)=>({ing: it.ing, qtd: it.qtd, custo: it.custo, nome: it.nome, marca: it.marca, unidade: it.unidade})),
    custoTotal: c.total, custoDose: c.custoDose, pvp: c.pvp, temFoto, atualizado: Date.now()}});
  gravar(ops);
  ed = null; recVista = "lista";
  toast(`Receita ${id} guardada com sucesso.`);
  render();
}

/* ---------- apagar / sair ---------- */
$("rec-apagar").onclick = ()=>{
  const o = ed && ed.original; if(!o) return;
  const nPed = D.pedidos.filter((p)=>p.rec === o.id && !p.anulado).length;
  if(nPed){ aviso(`Não é possível apagar a receita ${o.nome}: tem ${nPed} pedido(s) do café ainda por pagar ou por fechar.\nApague-a depois de esses pedidos serem pagos e o dia fechado.`, "Apagar receita"); return; }
  confirmar("Apagar receita", `<p>Apagar definitivamente a receita?</p><p><b>${esc(o.id)}  ${esc(o.nome)}</b><br>${o.itens.length} ingrediente(s)${o.temFoto ? " e a foto" : ""}</p>
    <p class="nota">O ID ${esc(o.id)} não voltará a ser usado.</p>`, "Apagar", ()=>{
      const ops = [{tipo: "del", col: "receitas", id: o.id}];
      if(o.temFoto) ops.push({tipo: "del", col: "fotos", id: o.id});
      const oc = opContador("REC-", numeroDoId(o.id)); if(oc) ops.unshift(oc);
      gravar(ops); ed = null; recVista = "lista"; toast(`Receita apagada: ${o.id} ${o.nome}`); render();
    }, "verm");
};
function sairEditor(){
  const sair = ()=>{ ed = null; recVista = "lista"; render(); window.scrollTo(0, 0); };
  if(ed && ed.sujo) confirmar("Sair sem gravar", "<p>Há alterações que não foram gravadas. Sair na mesma?</p>", "Sair sem gravar", sair, "verm");
  else sair();
}
$("rec-voltar").onclick = sairEditor;
$("rec-cancelar").onclick = sairEditor;
