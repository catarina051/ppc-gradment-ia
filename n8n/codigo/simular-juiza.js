// @usa-compartilhado
// Simula a arbitragem da 3ª IA (Juíza) no modo de demonstração quando há divergências.
const comp = $('Comparar IAs e Detectar Divergências').first().json;

const decisoesDisciplinas = (comp.divergencias?.disciplinas || []).map((div) => {
  // No cenário de demonstração, a IA 1 seguiu fielmente o PPC de exemplo (30h em Lab e optativa DCC820 presente)
  const escolhida = div.ia1 || div.ia2;
  const acao = div.ia1 ? 'ADOTAR_IA1' : 'ADOTAR_IA2';
  return {
    id_divergencia: div.id_divergencia,
    acao,
    pagina_evidencia: 'Página 1 (Matriz Curricular e Optativas)',
    justificativa: `Conferido diretamente no texto do PPC (${div.motivo}): a definição "${escolhida.nome}" (${escolhida.carga_horaria}h, período=${escolhida.periodo ?? 'Optativa'}) corresponde literalmente ao documento.`,
    disciplina: escolhida,
  };
});

const decisoesDependencias = (comp.divergencias?.dependencias || []).map((dep) => {
  const tipoEscolhido = dep.ia1_tipo || dep.ia2_tipo || 'PRE';
  return {
    id_divergencia: dep.id_divergencia,
    incluir: true,
    disciplina_codigo: dep.disciplina_codigo,
    dependencia_codigo: dep.dependencia_codigo,
    tipo: tipoEscolhido,
    pagina_evidencia: 'Página 1 (2º Período / Optativas)',
    justificativa: `Confirmado no quadro curricular do PPC que ${dep.disciplina_codigo} possui vínculo ${tipoEscolhido} com ${dep.dependencia_codigo}.`,
  };
});

return [{
  json: {
    simulado_juiza: true,
    decisao_juiza: {
      resumo_auditoria: `Foram arbitradas ${decisoesDisciplinas.length} divergência(s) de disciplinas e ${decisoesDependencias.length} divergência(s) de dependências confrontando IA 1 e IA 2 com o texto original do PPC.`,
      curso_final: comp.curso_consenso,
      decisoes_disciplinas: decisoesDisciplinas,
      decisoes_dependencias: decisoesDependencias,
    },
  },
}];

