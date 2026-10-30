"use strict";
/* =====================================================================
   INGREDIENTES (a Mestra) — só o administrador
   Regras iguais ao formulário "Gestão de Ingredientes" do Excel:
   nome e marca com maiúsculas iniciais; kg passa a g e L a ml; não há dois
   iguais (nome + marca); não se apaga se for usado numa receita ou tiver
   movimentos de stock; com movimentos de stock a unidade não pode mudar;
   o ID nunca volta a ser usado.
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

RENDER.ingredientes = function(){
  const n = norm($("ing-filtro").value);
  const lista = D.ingredientes.filter((i)=>!n || norm(i.nome + " " + (i.marca || "") + " " + i.id).includes(n)).sort(porNome);
  const usos = new Map();
  for(const r of D.receitas) for(const it of (r.itens || [])) usos.set(it.ing, (usos.get(it.ing) || 0) + 1);
  $("ing-contagem").textContent = `${D.ingredientes.length} ingredientes` + (n ? ` · ${lista.length} encontrados` : "");
  $("ing-lista").innerHTML = tabela(
    [{t: "ID", cl: "so-largo"}, {t: "Ingrediente"}, {t: "Marca"}, {t: "Embalagem", num: 1}, {t: "Custo", num: 1, cl: "so-largo"}, {t: "Receitas", num: 1, cl: "so-largo"}],
    lista.slice(0, 400).map((i)=>`<tr class="clic" data-id="${esc(i.id)}"><td class="so-largo pequeno">${esc(i.id)}</td><td><b>${esc(i.nome)}</b></td>
      <td>${esc(i.marca || "")}</td><td class="num">${eur(i.preco)}<div class="pequeno">${numTxt(i.qtd)} ${esc(i.unidade)}</div></td>
      <td class="num so-largo">${custoReferencia(i)}</td><td class="num so-largo">${usos.get(i.id) || ""}</td></tr>`),
    D.ingredientes.length ? "Nenhum ingrediente encontrado." : "Ainda não há ingredientes. Importe os dados do Excel em Definições ou crie um novo.");
  $("ing-lista").querySelectorAll("tr[data-id]").forEach((tr)=>tr.onclick = ()=>editarIngrediente(tr.dataset.id));
};
$("ing-filtro").addEventListener("input", ()=>RENDER.ingredientes());
$("ing-novo").onclick = ()=>editarIngrediente(null);

function editarIngrediente(id){
  const ing = id ? Idx.ing.get(id) : null;
  const prox = ing ? null : proximoId("ING-", contadores().ING, D.ingredientes.map((x)=>x.id), 3);
  const nomes = [...new Set(D.ingredientes.map((x)=>x.nome))].sort((a, b)=>a.localeCompare(b, "pt"));
  const usos = ing ? receitasQueUsam(ing.id) : [];
  janela(ing ? "Alterar ingrediente" : "Novo ingrediente", `
    <div class="linha">
      <div class="cresce"><label class="campo" for="ie-nome">Ingrediente</label>
        <input type="text" id="ie-nome" list="ie-nomes" autocomplete="off" value="${esc(ing ? ing.nome : "")}"></div>
      <div style="width:110px"><label class="campo">ID</label><input type="text" readonly value="${esc(ing ? ing.id : prox.id)}"></div>
    </div>
    <datalist id="ie-nomes">${nomes.map((x)=>`<option value="${esc(x)}">`).join("")}</datalist>
    <label class="campo" for="ie-marca">Marca</label><input type="text" id="ie-marca" autocomplete="off" value="${esc(ing ? ing.marca || "" : "")}">
    <div class="grelha g3">
      <div><label class="campo" for="ie-preco">Preço da embalagem (€)</label>
        <input type="text" id="ie-preco" inputmode="decimal" value="${ing ? numTxt(ing.preco, 2) : ""}"></div>
      <div><label class="campo" for="ie-qtd">Quantidade da embalagem</label>
        <input type="text" id="ie-qtd" inputmode="decimal" value="${ing ? numTxt(ing.qtd) : ""}"></div>
      <div><label class="campo" for="ie-uni">Unidade</label>
        <select id="ie-uni"><option value=""></option>${["g", "kg", "ml", "L", "u"].map((u)=>`<option ${ing && ing.unidade === u ? "selected" : ""}>${u}</option>`).join("")}</select></div>
    </div>
    <div class="nota">kg é gravado em g e L em ml (as receitas e o stock usam g, ml ou u).</div>
    ${usos.length ? `<div class="nota">Usado em: ${usos.map((r)=>esc(r.nome)).join(", ")}</div>` : ""}
    <div class="nota verm" id="ie-erro"></div>`,
    [{texto: "Cancelar", classe: "sec", id: "modal-cancelar"},
     ...(ing ? [{texto: "Apagar", classe: "verm", id: "ie-apagar", acao: ()=>apagarIngrediente(ing.id)}] : []),
     {texto: "Gravar", classe: "verde", id: "modal-ok", manter: true, acao: ()=>gravarIngrediente(ing)}]);
  setTimeout(()=>{ const c = $("ie-nome"); if(c) c.focus(); }, 50);
}

function gravarIngrediente(ing){
  const erro = (t, campo)=>{ $("ie-erro").textContent = t; if(campo) $(campo).focus(); };
  const nome = proper(limparEspacos($("ie-nome").value)), marca = proper(limparEspacos($("ie-marca").value));
  const preco = lerNumero($("ie-preco").value), qtd = lerNumero($("ie-qtd").value), uni = $("ie-uni").value;
  if(!nome) return erro("Insira o nome do ingrediente.", "ie-nome");
  if(preco == null) return erro("Preço inválido.", "ie-preco");
  if(preco < 0) return erro("O preço não pode ser negativo.", "ie-preco");
  if(qtd == null) return erro("Quantidade inválida.", "ie-qtd");
  if(!(qtd > 0)) return erro("A quantidade da embalagem tem de ser maior que 0.", "ie-qtd");
  if(!normalizarUnidade(uni)) return erro("Selecione a unidade: g, kg, ml, L ou u.", "ie-uni");
  const dup = D.ingredientes.find((x)=>(!ing || x.id !== ing.id) && norm(x.nome) === norm(nome) && norm(x.marca || "") === norm(marca));
  if(dup) return erro(`Já existe o ingrediente '${nome}' da marca '${marca}' (${dup.id}).`, "ie-nome");
  const base = converterUnidadeBase(qtd, uni);
  if(ing && ing.unidade !== base.unidade && temMovimentos(ing.id))
    return erro(`Não é possível mudar a unidade de ${ing.unidade} para ${base.unidade}: este ingrediente já tem movimentos de stock nessa unidade.`, "ie-uni");
  const dados = {nome, marca, preco, qtd: base.qtd, unidade: base.unidade, minimo: ing ? (ing.minimo || 0) : 0};
  const ops = [];
  let id;
  if(ing){
    id = ing.id;
  }else{
    const p = proximoId("ING-", contadores().ING, D.ingredientes.map((x)=>x.id), 3);
    id = p.id; const oc = opContador("ING-", p.numero); if(oc) ops.push(oc);
  }
  ops.push({tipo: "set", col: "ingredientes", id, dados});
  fecharJanela();
  gravar(ops);
  const conv = base.convertido ? ` (embalagem gravada como ${numTxt(base.qtd)} ${base.unidade})` : "";
  const mudouCusto = ing && (ing.preco !== dados.preco || ing.qtd !== dados.qtd) && receitasQueUsam(id).length;
  toast((ing ? `Ingrediente ${id} alterado` : `Ingrediente adicionado com o ID ${id}`) + conv + ".");
  if(mudouCusto) setTimeout(()=>aviso(`O custo de ${nome} mudou e é usado em ${receitasQueUsam(id).length} receita(s).\nPara atualizar o custo e o PVP dessas receitas, use "Atualizar custos" em Receitas.`, "Custos das receitas"), 300);
}

function apagarIngrediente(id){
  const ing = Idx.ing.get(id); if(!ing) return;
  const desc = `${ing.id}  ${nomeComMarca(ing)}`;
  const usos = receitasQueUsam(id);
  if(usos.length){ aviso(`Não é possível apagar:\n   ${desc}\n\nÉ usado em:\n${usos.map((r)=>"   " + r.id + "  " + r.nome).join("\n")}\n\nRetire-o primeiro dessas receitas.`, "Apagar"); return; }
  if(temMovimentos(id)){ aviso(`Não é possível apagar:\n   ${desc}\n\nTem movimentos de stock (compras ou vendas). Exclua primeiro esses movimentos.`, "Apagar"); return; }
  confirmar("Apagar ingrediente", `<p>Apagar definitivamente o ingrediente?</p><p><b>${esc(desc)}</b></p><p class="nota">O ID ${esc(id)} não voltará a ser usado.</p>`,
    "Apagar", ()=>{
      const ops = [{tipo: "del", col: "ingredientes", id}];
      const oc = opContador("ING-", numeroDoId(id)); if(oc) ops.unshift(oc);
      gravar(ops); toast(`Ingrediente apagado: ${desc}`);
    }, "verm");
}
