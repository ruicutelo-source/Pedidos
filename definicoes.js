"use strict";
/* =====================================================================
   INÍCIO, CAFÉ (por agora), DEFINIÇÕES e SESSÃO
   ===================================================================== */

/* ---------- Sessão ---------- */
RENDER.def = function(){
  $("def-modo").innerHTML = textoSessao();
  $("def-sair").style.display = MODO_FIREBASE ? "inline-block" : "none";
  $("def-versao").textContent = "Café e Refeições · versão " + VERSAO_APP;
};
RENDER.sessao = function(){
  $("ses-modo").innerHTML = textoSessao();
  $("ses-sair").style.display = MODO_FIREBASE ? "inline-block" : "none";
};
$("def-sair").onclick = terminarSessao;
$("ses-sair").onclick = terminarSessao;

/* ---------- Importar os dados do Excel ---------- */
function validarImportacao(d){
  if(!d || d.origem !== "Controle_de_Refeicoes" || !Array.isArray(d.ingredientes) || !Array.isArray(d.receitas)) return "O ficheiro não é uma exportação do Excel Controle de Refeições.";
  const ids = new Set(d.ingredientes.map((i)=>i.id));
  for(const i of d.ingredientes) if(!/^ING-\d+$/.test(i.id) || !i.nome || !(i.qtd > 0) || !["g", "ml", "u"].includes(i.unidade)) return `Ingrediente inválido no ficheiro: ${i.id} ${i.nome}`;
  for(const r of d.receitas){
    if(!/^REC-\d+$/.test(r.id) || !r.nome) return `Receita inválida no ficheiro: ${r.id}`;
    for(const it of r.itens) if(!ids.has(it.ing)) return `A receita ${r.id} usa o ingrediente ${it.ing}, que não está no ficheiro.`;
  }
  return null;
}
function opsImportacao(d){
  const ops = [];
  // 1. apaga o que existe (ingredientes, receitas, fotos, movimentos, clientes)
  for(const c of ["ingredientes", "receitas", "movimentos", "clientes"]) for(const x of D[c]) ops.push({tipo: "del", col: c, id: x.id});
  for(const r of D.receitas) if(r.temFoto && !(d.fotos || {})[r.id]) ops.push({tipo: "del", col: "fotos", id: r.id});
  // 2. grava os dados do Excel
  for(const i of d.ingredientes) ops.push({tipo: "set", col: "ingredientes", id: i.id,
    dados: {nome: i.nome, marca: i.marca || "", preco: i.preco, qtd: i.qtd, unidade: i.unidade, minimo: i.minimo || 0}});
  for(const r of d.receitas){
    const {id, ...dados} = r;
    ops.push({tipo: "set", col: "receitas", id, dados: {...dados, temFoto: !!(d.fotos || {})[id], atualizado: Date.now()}});
  }
  for(const [id, img] of Object.entries(d.fotos || {})) ops.push({tipo: "set", col: "fotos", id, dados: {img}});
  for(const m of (d.movimentos || [])){ const {id, ...dados} = m; ops.push({tipo: "set", col: "movimentos", id, dados}); }
  for(const c of (d.clientes || [])){ const {id, ...dados} = c; ops.push({tipo: "set", col: "clientes", id, dados}); }
  ops.push({tipo: "set", col: "config", id: "contadores", dados: {ING: d.contadores.ING || 0, REC: d.contadores.REC || 0}});
  return ops;
}
$("def-importar").onclick = ()=>$("def-importar-ficheiro").click();
$("def-importar-ficheiro").onchange = (e)=>{
  const f = e.target.files[0]; e.target.value = ""; if(!f) return;
  const rd = new FileReader();
  rd.onload = ()=>{
    let d; try{ d = JSON.parse(rd.result); }catch(err){ aviso("O ficheiro não é válido (não é JSON)."); return; }
    const erro = validarImportacao(d); if(erro){ aviso(erro); return; }
    const nFotos = Object.keys(d.fotos || {}).length;
    confirmar("Importar os dados do Excel", `<p>O ficheiro tem:</p><p><b>${d.ingredientes.length}</b> ingredientes · <b>${d.receitas.length}</b> receitas (${nFotos} com foto)<br>
      <b>${(d.movimentos || []).length}</b> movimentos de stock · <b>${(d.clientes || []).length}</b> clientes</p>
      <p class="verm"><b>Os ingredientes, receitas, movimentos de stock e clientes que estão agora na app são substituídos.</b></p>
      <p class="nota">Exportado do Excel em ${esc(d.exportado || "?")}.</p>`, "Importar", ()=>{
        const ops = opsImportacao(d);
        $("def-importar-estado").textContent = "A importar…";
        gravar(ops).then(()=>{ $("def-importar-estado").textContent = `Importação concluída: ${d.ingredientes.length} ingredientes e ${d.receitas.length} receitas.`; });
        toast("Dados do Excel importados.");
      }, "verm");
  };
  rd.readAsText(f);
};

/* ---------- Apagar os dados do café (pedidos de teste da app antiga, etc.) ---------- */
$("def-apagar-cafe").onclick = ()=>{
  confirmar("Apagar os dados do café", `<p>Isto apaga <b>todos</b> os pedidos, pagamentos, fechos do dia e o arquivo do café
    (incluindo os pedidos de teste da app antiga).</p><p>Os ingredientes, receitas, stock e clientes <b>não</b> são apagados.</p>`,
    "Continuar", ()=>confirmar("Tem a certeza?", "<p>Esta ação não pode ser desfeita.</p>", "Apagar tudo do café", ()=>{
      $("def-apagar-estado").textContent = "A apagar…";
      Promise.all(["arquivo", "produtos"].map((c)=>Store.listarIds(c).catch(()=>[]))).then(([arq, prods])=>{
        const ops = [];
        for(const c of ["pedidos", "pagamentos", "fechos"]) for(const x of D[c]) ops.push({tipo: "del", col: c, id: x.id});
        for(const id of arq) ops.push({tipo: "del", col: "arquivo", id});
        for(const id of prods) ops.push({tipo: "del", col: "produtos", id});
        gravar(ops); carrinho = []; selecaoContas.clear(); apuroSel = "atual";
        $("def-apagar-estado").textContent = `Apagados: ${ops.length} registos.`; toast("Dados do café apagados.");
      });
    }, "verm"), "verm");
};
