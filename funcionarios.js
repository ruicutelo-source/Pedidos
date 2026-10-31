"use strict";
/* =====================================================================
   FUNCIONÁRIOS (Definições) — só o administrador
   Valor da hora normal = salário × 12 ÷ (52 × horas semanais)
   Custo da hora        = (salário × 14 × (1 + Seg. Social %) + seguro anual) ÷ (52 × horas semanais)
   Custo do minuto      = custo da hora ÷ 60
   Seg. Social e seguro são opcionais (vazio = 0).
   ===================================================================== */
const receitasDoFuncionario = (id)=> D.receitas.filter((r)=>(r.moLinhas || []).some((l)=>l.func === id)).sort(porNome);

function renderFuncionarios(){
  if(!$("func-lista")) return;
  $("func-lista").innerHTML = tabela(
    [{t: "Funcionário"}, {t: "Salário base", num: 1}, {t: "Horas / semana", num: 1, cl: "so-largo"}, {t: "Hora normal", num: 1, cl: "so-largo"},
     {t: "Custo da hora", num: 1}, {t: "Custo / minuto", num: 1}, {t: "Receitas", num: 1, cl: "so-largo"}],
    D.funcionarios.slice().sort(porNome).map((f)=>`<tr class="clic" data-func="${esc(f.id)}"><td><b>${esc(f.nome)}</b></td>
      <td class="num">${eur(f.salario)}</td><td class="num so-largo">${numTxt(f.horas)} h</td><td class="num so-largo">${eur(valorHoraNormal(f))}</td>
      <td class="num"><b>${eur(custoHora(f))}</b></td><td class="num">${(custoHora(f) / 60).toLocaleString("pt-PT", {minimumFractionDigits: 3, maximumFractionDigits: 3})} €</td>
      <td class="num so-largo">${receitasDoFuncionario(f.id).length || ""}</td></tr>`),
    "Ainda não há funcionários. Crie-os para calcular a mão de obra das receitas pelo tempo de confeção.");
  $("func-lista").querySelectorAll("tr[data-func]").forEach((tr)=>tr.onclick = ()=>editarFuncionario(tr.dataset.func));
}
GANCHOS_RENDER.push(()=>{ if(ecraAtual === "def") renderFuncionarios(); });
$("func-novo").onclick = ()=>editarFuncionario(null);

function editarFuncionario(id){
  const f = id ? Idx.func.get(id) : null;
  const usos = f ? receitasDoFuncionario(f.id) : [];
  const n = (v, c)=> v == null || v === "" || v === 0 ? "" : numTxt(v, c);
  janela(f ? "Funcionário" : "Novo funcionário", `
    <label class="campo" for="fu-nome">Nome ou função (ex.: Cozinheiro)</label><input type="text" id="fu-nome" autocomplete="off" value="${esc(f ? f.nome : "")}">
    <div class="grelha g2">
      <div><label class="campo" for="fu-sal">Salário base mensal (€)</label><input type="text" id="fu-sal" inputmode="decimal" value="${f ? n(f.salario, 2) : ""}"></div>
      <div><label class="campo" for="fu-horas">Horas semanais</label><input type="text" id="fu-horas" inputmode="decimal" value="${f ? n(f.horas) : ""}" placeholder="40"></div>
      <div><label class="campo" for="fu-ss">Segurança Social da empresa (%) <span class="cinz">opcional</span></label><input type="text" id="fu-ss" inputmode="decimal" value="${f ? n(f.ss, 2) : ""}" placeholder="ex.: 23,75"></div>
      <div><label class="campo" for="fu-seg">Seguro anual (€) <span class="cinz">opcional</span></label><input type="text" id="fu-seg" inputmode="decimal" value="${f ? n(f.seguro, 2) : ""}" placeholder="0"></div>
    </div>
    <div class="cartao" style="margin-top:12px" id="fu-calc"></div>
    ${usos.length ? `<div class="nota">Usado na mão de obra de: ${usos.map((r)=>esc(r.nome)).join(", ")}</div>` : ""}
    <div class="nota verm" id="fu-erro"></div>`,
    [{texto: "Fechar", classe: "sec", id: "modal-cancelar"},
     ...(f ? [{texto: "Apagar", classe: "verm", id: "fu-apagar", acao: ()=>apagarFuncionario(f.id)}] : []),
     {texto: "Gravar", classe: "verde", id: "modal-ok", manter: true, acao: ()=>gravarFuncionario(f)}]);
  const ler = ()=>({salario: lerNumero($("fu-sal").value) || 0, horas: lerNumero($("fu-horas").value) || 0,
                    ss: lerNumero($("fu-ss").value) || 0, seguro: lerNumero($("fu-seg").value) || 0});
  const mostrar_ = ()=>{
    const v = ler(), ok = v.salario > 0 && v.horas > 0;
    $("fu-calc").innerHTML = !ok ? `<span class="nota">Escreva o salário e as horas semanais para ver os cálculos.</span>` : `
      <table><tbody>
        <tr><td>Valor da hora normal <span class="pequeno">(salário × 12 ÷ (52 × ${numTxt(v.horas)}))</span></td><td class="num">${eur(valorHoraNormal(v))}</td></tr>
        <tr><td>Custo anual <span class="pequeno">(salário × 14${v.ss ? ` × ${numTxt(1 + v.ss / 100, 4)}` : ""}${v.seguro ? ` + ${eur(v.seguro)}` : ""})</span></td>
          <td class="num">${eur(v.salario * 14 * (1 + v.ss / 100) + v.seguro)}</td></tr>
        <tr class="total"><td>Custo da hora para a empresa</td><td class="num" id="fu-custo-hora">${eur(custoHora(v))}</td></tr>
        <tr><td>Custo do minuto</td><td class="num" id="fu-custo-min">${(custoHora(v) / 60).toLocaleString("pt-PT", {minimumFractionDigits: 3, maximumFractionDigits: 3})} €</td></tr>
      </tbody></table>`;
  };
  ["fu-sal", "fu-horas", "fu-ss", "fu-seg"].forEach((i)=>$(i).addEventListener("input", mostrar_));
  mostrar_();
  { const c = $("fu-nome"); if(c && !f) c.focus(); }
}

function gravarFuncionario(f){
  const erro = (t, campo)=>{ $("fu-erro").textContent = t; if(campo) $(campo).focus(); };
  const nome = limparEspacos($("fu-nome").value);
  const salario = lerNumero($("fu-sal").value), horas = lerNumero($("fu-horas").value);
  const ss = $("fu-ss").value.trim() === "" ? 0 : lerNumero($("fu-ss").value);
  const seguro = $("fu-seg").value.trim() === "" ? 0 : lerNumero($("fu-seg").value);
  if(!nome) return erro("Escreva o nome ou a função.", "fu-nome");
  if(salario == null || !(salario > 0)) return erro("Indique o salário base mensal.", "fu-sal");
  if(horas == null || !(horas > 0) || horas > 80) return erro("Indique as horas semanais (ex.: 40).", "fu-horas");
  if(ss == null || ss < 0) return erro("Segurança Social inválida (pode ficar vazia).", "fu-ss");
  if(seguro == null || seguro < 0) return erro("Seguro anual inválido (pode ficar vazio).", "fu-seg");
  const dup = D.funcionarios.find((x)=>(!f || x.id !== f.id) && norm(x.nome) === norm(nome));
  if(dup) return erro(`Já existe o funcionário '${dup.nome}'.`, "fu-nome");
  const dados = {nome, salario, horas, ss, seguro};
  const id = f ? f.id : novoId("F");
  fecharJanela();
  gravar([{tipo: "set", col: "funcionarios", id, dados}]);
  toast(f ? `Funcionário ${nome} alterado.` : `Funcionário adicionado: ${nome}`);
  const usos = f ? receitasDoFuncionario(f.id) : [];
  if(f && usos.length && custoHora(f) !== custoHora(dados))
    setTimeout(()=>aviso(`O custo da hora de ${nome} mudou (${eur(custoHora(f))} → ${eur(custoHora(dados))}) e é usado em ${usos.length} receita(s): ${usos.map((r)=>r.nome).join(", ")}.\nPara atualizar a mão de obra e o PVP dessas receitas, use "Atualizar custos" em Receitas.`, "Mão de obra das receitas"), 300);
}

function apagarFuncionario(id){
  const f = Idx.func.get(id); if(!f) return;
  const usos = receitasDoFuncionario(id);
  if(usos.length){ aviso(`Não é possível apagar ${f.nome}: é usado na mão de obra de:\n${usos.map((r)=>"   " + r.id + "  " + r.nome).join("\n")}\n\nRetire-o primeiro dessas receitas.`, "Apagar"); return; }
  confirmar("Apagar funcionário", `<p>Apagar <b>${esc(f.nome)}</b>?</p>`, "Apagar", ()=>{ gravar([{tipo: "del", col: "funcionarios", id}]); toast(`Funcionário apagado: ${f.nome}`); }, "verm");
}
