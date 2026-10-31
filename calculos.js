"use strict";
/* =====================================================================
   CÁLCULOS — as mesmas regras do Excel (Controle de Refeições)
   Não mexe no ecrã nem na base de dados: só recebe valores e devolve resultados.
   ===================================================================== */

/* Arredonda a 2 casas como o ROUND do Excel (metade para cima, longe do zero) */
function arred2(v){
  v = Number(v) || 0;
  const s = v < 0 ? -1 : 1;
  return s * Math.round(Math.abs(v) * 100 + 1e-7) / 100;
}

/* Lê um número escrito à mão: aceita vírgula ou ponto, ignora €, % e espaços.
   Devolve null se não for um número. */
function lerNumero(txt){
  if(typeof txt === "number") return isFinite(txt) ? txt : null;
  let t = String(txt == null ? "" : txt).replace(/[€%\s ]/g, "");
  if(t === "") return null;
  if(t.includes(",") && t.includes(".")) t = t.replace(/\./g, "");   // 1.234,5 -> 1234,5
  t = t.replace(",", ".");
  if(!/^-?\d*\.?\d+$/.test(t) && !/^-?\d+\.$/.test(t)) return null;
  const n = parseFloat(t);
  return isFinite(n) ? n : null;
}

/* PROPER do Excel: 1.ª letra de cada palavra em maiúscula, as outras em minúscula */
function proper(txt){
  let out = "", antLetra = false;
  for(const ch of String(txt || "")){
    const letra = /\p{L}/u.test(ch);
    out += letra ? (antLetra ? ch.toLocaleLowerCase("pt-PT") : ch.toLocaleUpperCase("pt-PT")) : ch;
    antLetra = letra;
  }
  return out;
}
const limparEspacos = (s)=> String(s || "").trim().replace(/\s+/g, " ");

/* Unidades: aceita variações e converte kg -> g e L -> ml (como o formulário de Ingredientes) */
function normalizarUnidade(u){
  switch(String(u || "").trim().toLowerCase()){
    case "g": case "gr": case "grs": return "g";
    case "k": case "kg": case "kgs": return "kg";
    case "ml": return "ml";
    case "l": case "lt": case "lts": return "L";
    case "u": case "un": case "und": return "u";
    default: return "";
  }
}
function converterUnidadeBase(qtd, unidade){
  const u = normalizarUnidade(unidade);
  if(u === "kg") return {qtd: qtd * 1000, unidade: "g", convertido: true};
  if(u === "L")  return {qtd: qtd * 1000, unidade: "ml", convertido: true};
  return {qtd, unidade: u, convertido: false};
}

/* Nome no stock: "Ingrediente (Marca)" */
function nomeComMarca(ing){
  if(!ing) return "";
  return ing.marca ? `${ing.nome} (${ing.marca})` : ing.nome;
}

/* Custo de uma quantidade de um ingrediente = preço da embalagem ÷ qtd da embalagem × qtd usada */
function custoItem(ing, qtdUsada){
  if(!ing || !(ing.qtd > 0)) return 0;
  return arred2((Number(ing.preco) || 0) / ing.qtd * (Number(qtdUsada) || 0));
}

/* PVP = [Custo/Dose × (1 + G.Oper + G.Não Oper) + Mão de obra/Dose] × (1 + Lucro) × (1 + IVA)
   percentagens em fração (0,15 = 15%) */
function pvpReceita(custoDose, gOp, gNaoOp, margem, iva, maoObraDose){
  return arred2(((custoDose || 0) * (1 + (gOp || 0) + (gNaoOp || 0)) + (maoObraDose || 0)) * (1 + (margem || 0)) * (1 + (iva || 0)));
}

/* Totais de uma receita com os preços ATUAIS dos ingredientes.
   rec: {doses, gOp, gNaoOp, margem, iva, maoObra, itens:[{ing, qtd, custo}]}
   ings: Map id -> ingrediente.
   Um ingrediente que já não exista mantém o custo gravado (como no Excel). */
function calcularReceita(rec, ings){
  const itens = (rec.itens || []).map((it)=>{
    const ing = ings.get(it.ing);
    const custo = ing ? custoItem(ing, it.qtd) : arred2(it.custo || 0);
    return {...it, custo, existe: !!ing,
            nome: ing ? ing.nome : (it.nome || it.ing), marca: ing ? (ing.marca || "") : (it.marca || ""),
            unidade: ing ? ing.unidade : (it.unidade || "")};
  });
  const total = arred2(itens.reduce((a, it)=> a + it.custo, 0));
  const doses = Number(rec.doses) || 0;
  const custoDose = doses > 0 ? arred2(total / doses) : 0;
  const maoObraDose = doses > 0 ? (Number(rec.maoObra) || 0) / doses : 0;
  const pvp = pvpReceita(custoDose, rec.gOp, rec.gNaoOp, rec.margem, rec.iva, maoObraDose);
  return {itens, total, custoDose, maoObraDose, pvp, ...indicadores(custoDose, pvp, rec, maoObraDose)};
}

/* Os indicadores da Dashboard (a partir do custo/dose e do PVP) */
function indicadores(custoDose, pvp, rec, maoObraDose){
  const custoComGastos = (custoDose || 0) * (1 + (rec.gOp || 0) + (rec.gNaoOp || 0)) + (maoObraDose || 0);
  const precoSemIva = (pvp || 0) / (1 + (rec.iva || 0));
  const lucro = precoSemIva - custoComGastos;
  return {custoComGastos, precoSemIva, lucro,
          lucroPct: custoComGastos > 0 ? lucro / custoComGastos : null,
          margemBruta: precoSemIva > 0 ? (precoSemIva - (custoDose || 0)) / precoSemIva : null,
          // verde quando o PVP cobre a margem definida (tolerância de arredondamento, como no Excel)
          cobreMargem: pvp >= arred2(custoComGastos * (1 + (rec.margem || 0)) * (1 + (rec.iva || 0))) - 0.001};
}

/* IDs: ING-001, REC-001 ... (nunca repetem: usa o maior entre o contador e os IDs existentes) */
function proximoId(prefixo, contador, idsExistentes, digitos){
  let maior = Number(contador) || 0;
  for(const id of idsExistentes){
    const m = String(id).match(new RegExp("^" + prefixo + "(\\d+)$"));
    if(m) maior = Math.max(maior, parseInt(m[1], 10));
  }
  const n = maior + 1;
  return {id: prefixo + String(n).padStart(digitos || 3, "0"), numero: n};
}

/* ---------- MÃO DE OBRA ----------
   Funcionário: {salario (base mensal €), horas (semanais), ss (% Seg. Social da empresa, opcional), seguro (€/ano, opcional)}
   Valor da hora normal (Código do Trabalho) = salário × 12 ÷ (52 × horas)
   Custo da hora para a empresa = (salário × 14 × (1 + SS%) + seguro anual) ÷ (52 × horas)   (14 meses: com subsídios de férias e Natal) */
function valorHoraNormal(f){
  const h = Number(f && f.horas) || 0; if(!(h > 0)) return 0;
  return (Number(f.salario) || 0) * 12 / (52 * h);
}
function custoHora(f){
  const h = Number(f && f.horas) || 0; if(!(h > 0)) return 0;
  return ((Number(f.salario) || 0) * 14 * (1 + (Number(f.ss) || 0) / 100) + (Number(f.seguro) || 0)) / (52 * h);
}
/* Mão de obra de uma receita a partir das linhas {func, min}: minutos × custo da hora ÷ 60.
   Cada linha é arredondada ao cêntimo e o total é a soma das linhas (como os ingredientes).
   Um funcionário que já não exista mantém o custo gravado na linha. */
function maoObraDasLinhas(linhas, funcs){
  const det = (linhas || []).map((l)=>{
    const f = funcs.get(l.func);
    const custo = arred2(f ? (Number(l.min) || 0) * custoHora(f) / 60 : (Number(l.custo) || 0));   // cada linha arredondada, como os ingredientes
    return {...l, custo, existe: !!f, nome: f ? f.nome : (l.nome || l.func)};
  });
  return {total: arred2(det.reduce((a, l)=>a + l.custo, 0)), linhas: det};
}
const minutosTxt = (m)=>{ m = Math.round(Number(m) || 0); const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} h${r ? " " + r + " min" : ""}` : `${r} min`; };

if(typeof module !== "undefined") module.exports = {arred2, lerNumero, proper, limparEspacos, normalizarUnidade,
  converterUnidadeBase, nomeComMarca, custoItem, pvpReceita, calcularReceita, indicadores, proximoId, valorHoraNormal, custoHora, maoObraDasLinhas, minutosTxt};
