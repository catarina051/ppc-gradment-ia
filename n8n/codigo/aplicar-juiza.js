// @usa-compartilhado
// Processa a decisão da 3ª IA (Juíza) e funde com a base de consenso entre IA 1 e IA 2.
const comp = $('Comparar IAs e Detectar Divergências').first().json;
const entrada = $input.first().json;

let provJuizaFinal = comp.modelos_executados?.ia3?.provider || 'simulado';
let modJuizaFinal = comp.modelos_executados?.ia3?.model || 'simulado-juiza-v1';

let julgamento;
if (entrada.simulado_juiza && entrada.decisao_juiza) {
  julgamento = entrada.decisao_juiza;
} else {
  try {
    const { dados } = extrairJsonRespostaLLM(entrada, comp.ia3.provider);
    julgamento = dados;
  } catch (err) {
    try {
      const rec = await recuperarFalhaTransitoriaLLM(comp.ia3, $env, err, this.helpers);
      julgamento = rec.dados;
      provJuizaFinal = rec.providerUsado;
      modJuizaFinal = rec.modelUsado;
    } catch (errFinal) {
      return [{
        json: {
          ...comp,
          erro: `Falha na 3ª IA Juíza (${comp.ia3.provider}/${comp.ia3.model}): ${errFinal.message}`,
          status: 502,
        },
      }];
    }
  }
}

const mapaDecDisc = new Map(
  (Array.isArray(julgamento.decisoes_disciplinas) ? julgamento.decisoes_disciplinas : [])
    .map((d) => [d.id_divergencia, d]),
);
const mapaDecDep = new Map(
  (Array.isArray(julgamento.decisoes_dependencias) ? julgamento.decisoes_dependencias : [])
    .map((d) => [d.id_divergencia, d]),
);

const disciplinasResolvidas = [...comp.disciplinas_consenso];
const trilhaDisciplinas = [];

for (const div of comp.divergencias.disciplinas) {
  const dec = mapaDecDisc.get(div.id_divergencia);
  if (!dec) {
    // Fallback defensivo caso o LLM tenha omitido algum ID
    const fallbackDisc = div.ia1 || div.ia2;
    if (fallbackDisc) {
      disciplinasResolvidas.push({ ...fallbackDisc, codigo: div.codigo_sugerido });
    }
    trilhaDisciplinas.push({
      id_divergencia: div.id_divergencia,
      motivo_original: div.motivo,
      acao: div.ia1 ? 'FALLBACK_IA1' : 'FALLBACK_IA2',
      pagina_evidencia: 'N/A',
      justificativa: 'ID omitido pela Juíza; mantida extração primária por segurança.',
    });
    continue;
  }

  trilhaDisciplinas.push({
    id_divergencia: div.id_divergencia,
    motivo_original: div.motivo,
    acao: dec.acao,
    pagina_evidencia: dec.pagina_evidencia || 'PPC',
    justificativa: dec.justificativa || '',
  });

  if (dec.acao === 'DESCARTAR_DISCIPLINA') continue;

  let escolhida = dec.disciplina;
  if (dec.acao === 'ADOTAR_IA1' && div.ia1) escolhida = dec.disciplina || div.ia1;
  else if (dec.acao === 'ADOTAR_IA2' && div.ia2) escolhida = dec.disciplina || div.ia2;
  else if (!escolhida) escolhida = div.ia1 || div.ia2;

  if (escolhida) {
    disciplinasResolvidas.push({
      ...escolhida,
      codigo: div.codigo_sugerido,
    });
  }
}

const dependenciasResolvidas = [...comp.dependencias_consenso];
const trilhaDependencias = [];

for (const divDep of comp.divergencias.dependencias) {
  const dec = mapaDecDep.get(divDep.id_divergencia);
  if (!dec) {
    const tipoFallback = divDep.ia1_tipo || divDep.ia2_tipo;
    if (tipoFallback) {
      dependenciasResolvidas.push({
        disciplina_codigo: divDep.disciplina_codigo,
        dependencia_codigo: divDep.dependencia_codigo,
        tipo: tipoFallback,
      });
    }
    trilhaDependencias.push({
      id_divergencia: divDep.id_divergencia,
      motivo_original: divDep.motivo,
      incluir: Boolean(tipoFallback),
      tipo: tipoFallback || 'PRE',
      pagina_evidencia: 'N/A',
      justificativa: 'ID omitido pela Juíza; mantida aresta primária.',
    });
    continue;
  }

  trilhaDependencias.push({
    id_divergencia: divDep.id_divergencia,
    motivo_original: divDep.motivo,
    incluir: Boolean(dec.incluir),
    disciplina_codigo: dec.disciplina_codigo || divDep.disciplina_codigo,
    dependencia_codigo: dec.dependencia_codigo || divDep.dependencia_codigo,
    tipo: dec.tipo,
    pagina_evidencia: dec.pagina_evidencia || 'PPC',
    justificativa: dec.justificativa || '',
  });

  if (dec.incluir) {
    dependenciasResolvidas.push({
      disciplina_codigo: dec.disciplina_codigo || divDep.disciplina_codigo,
      dependencia_codigo: dec.dependencia_codigo || divDep.dependencia_codigo,
      tipo: dec.tipo === 'CO' ? 'CO' : 'PRE',
    });
  }
}

const cursoResolvido = {
  nome_curso: limparTextoUnicaLinha(
    julgamento.curso_final?.nome_curso || comp.curso_consenso.nome_curso,
    150,
  ),
  ano_periodo: limparTextoUnicaLinha(
    julgamento.curso_final?.ano_periodo || comp.curso_consenso.ano_periodo,
    20,
  ),
};

return [{
  json: {
    ...comp,
    erro: null,
    curso_resolvido: cursoResolvido,
    disciplinas_resolvidas: disciplinasResolvidas,
    dependencias_resolvidas: dependenciasResolvidas,
    auditoria_ia3: {
      acionada: true,
      simulada: Boolean(entrada.simulado_juiza),
      provider: provJuizaFinal,
      model: modJuizaFinal,
      resumo: julgamento.resumo_auditoria || '',
      decisoes_disciplinas: trilhaDisciplinas,
      decisoes_dependencias: trilhaDependencias,
    },
  },
}];

