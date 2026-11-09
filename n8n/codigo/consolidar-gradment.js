// @usa-compartilhado
// Aplica determinísticamente as 7 Regras de Ouro do GradMent (códigos, períodos, CH>0, proibição
// Obrigatória->Optativa e grafo DAG sem ciclos via DFS) e monta o payload JSON canônico final.
const j = $input.first().json;

if (j.erro) {
  return [{ json: j }];
}

const cursoBruto = j.curso_resolvido || j.curso_consenso;
const discsBrutas = j.disciplinas_resolvidas || j.disciplinas_consenso || [];
const depsBrutas = j.dependencias_resolvidas || j.dependencias_consenso || [];

if (discsBrutas.length === 0) {
  return [{
    json: {
      ...j,
      erro: 'Nenhuma disciplina válida foi consolidada a partir do PPC enviado.',
      status: 422,
    },
  }];
}

const correcoesInvariantes = [];
const codigosFinais = new Set();
const mapaRemapCodigo = new Map();
const disciplinasValidadas = [];

for (const d of discsBrutas) {
  const nomeLimpo = limparTextoUnicaLinha(d.nome, 255);
  if (!nomeLimpo) continue;

  const perNum = d.periodo === null || d.periodo === undefined || d.periodo === ''
    ? null
    : Number.parseInt(String(d.periodo), 10);
  const periodo = Number.isInteger(perNum) && perNum > 0 ? perNum : null;

  let ch = Math.round(Number(d.carga_horaria) || 0);
  if (ch <= 0) {
    if (periodo !== null) {
      return [{
        json: {
          ...j,
          erro: `Violação da Regra 2 do GradMent: a disciplina obrigatória "${nomeLimpo}" ficou sem carga horária positiva (${d.carga_horaria}).`,
          status: 422,
        },
      }];
    }
    // Optativa sem carga horária explícita recebe padrão 60h com registro de auditoria
    ch = 60;
    correcoesInvariantes.push(`Carga horária padrão (60h) atribuída à optativa "${nomeLimpo}".`);
  }

  const codigoOriginal = String(d.codigo || '').trim().toUpperCase();
  const codigoValido = gerarCodigoGradment(codigoOriginal, d.codigo_externo, nomeLimpo, codigosFinais);
  if (codigoOriginal && codigoOriginal !== codigoValido) {
    correcoesInvariantes.push(`Código normalizado pela Regra 4: "${codigoOriginal}" -> "${codigoValido}" (${nomeLimpo}).`);
  }
  if (codigoOriginal) mapaRemapCodigo.set(codigoOriginal, codigoValido);
  mapaRemapCodigo.set(codigoValido, codigoValido);

  const ementaLimpa = d.ementa ? String(d.ementa).trim() : `Ementa curricular de ${nomeLimpo}.`;
  const codigoExternoLimpo = d.codigo_externo ? limparTextoUnicaLinha(d.codigo_externo, 30) : codigoValido;
  const eixoLimpo = d.eixo
    ? limparTextoUnicaLinha(d.eixo, 100)
    : (periodo !== null ? 'Formação Obrigatória' : 'Formação Optativa');

  disciplinasValidadas.push({
    codigo: codigoValido,
    codigo_externo: codigoExternoLimpo,
    nome: nomeLimpo,
    periodo,
    eixo: eixoLimpo,
    carga_horaria: ch,
    ementa: ementaLimpa,
    plano_curso: d.plano_curso ? String(d.plano_curso).trim() : ementaLimpa,
  });
}

// Ordena: obrigatórias por período crescente + código, seguidas das optativas (periodo = null) por código
disciplinasValidadas.sort((a, b) => {
  if (a.periodo !== null && b.periodo === null) return -1;
  if (a.periodo === null && b.periodo !== null) return 1;
  if (a.periodo !== b.periodo) return (a.periodo || 0) - (b.periodo || 0);
  return a.codigo.localeCompare(b.codigo);
});

const mapaPorCodigo = new Map(disciplinasValidadas.map((d) => [d.codigo, d]));
const adjacencia = new Map(); // disc -> [req1, req2]
const chavesDepVistas = new Set();
const dependenciasValidadas = [];

for (const dep of depsBrutas) {
  const rawDisc = String(dep.disciplina_codigo || '').trim().toUpperCase();
  const rawReq = String(dep.dependencia_codigo || '').trim().toUpperCase();
  const discCod = mapaRemapCodigo.get(rawDisc) || rawDisc;
  const reqCod = mapaRemapCodigo.get(rawReq) || rawReq;
  const tipo = String(dep.tipo || 'PRE').toUpperCase() === 'CO' ? 'CO' : 'PRE';

  const discObj = mapaPorCodigo.get(discCod);
  const reqObj = mapaPorCodigo.get(reqCod);

  if (!discObj || !reqObj) {
    correcoesInvariantes.push(`Dependência ignorada por código inexistente: ${rawDisc} -> ${rawReq}.`);
    continue;
  }
  if (discCod === reqCod) {
    correcoesInvariantes.push(`Autodependência removida (Regra 5): ${discCod} -> ${reqCod}.`);
    continue;
  }

  // Regra 3 do GradMent: NENHUMA obrigatória pode depender de optativa (periodo === null)
  if (discObj.periodo !== null && reqObj.periodo === null) {
    correcoesInvariantes.push(
      `Regra 3 aplicada: removida dependência proibida da obrigatória "${discObj.nome}" (${discCod}) para a optativa "${reqObj.nome}" (${reqCod}); observação movida para plano_curso.`,
    );
    discObj.plano_curso = `${discObj.plano_curso}\nObservação de requisito: recomenda-se cursar ${reqObj.nome}.`;
    continue;
  }

  const chave = `${discCod}->${reqCod}`;
  if (chavesDepVistas.has(chave)) continue;

  // Regra 5 do GradMent: Verificação de ciclo via DFS (DAG estrito)
  if (grafoTemCicloAoAdicionar(adjacencia, discCod, reqCod)) {
    correcoesInvariantes.push(
      `Regra 5 aplicada (DFS anti-ciclo): aresta ${discCod} -> ${reqCod} (${tipo}) removida para impedir ciclo no grafo curricular.`,
    );
    continue;
  }

  chavesDepVistas.add(chave);
  if (!adjacencia.has(discCod)) adjacencia.set(discCod, []);
  adjacencia.get(discCod).push(reqCod);

  dependenciasValidadas.push({
    disciplina_codigo: discCod,
    dependencia_codigo: reqCod,
    tipo,
  });
}

const obrigatorias = disciplinasValidadas.filter((d) => d.periodo !== null);
const optativas = disciplinasValidadas.filter((d) => d.periodo === null);

const payloadGradment = {
  curso_id: j.curso_id,
  preview: {
    curso: {
      nome_curso: limparTextoUnicaLinha(cursoBruto.nome_curso, 150),
      ano_periodo: limparTextoUnicaLinha(cursoBruto.ano_periodo || '2026.1', 20),
    },
    disciplinas: disciplinasValidadas,
    dependencias: dependenciasValidadas,
    ofertas: [],
    ja_cadastradas: {
      disciplinas: [],
      dependencias: [],
      ofertas: [],
    },
  },
};

const relatorioAuditoria = {
  status_consenso: j.houve_divergencia ? 'DESEMPATADO_PELA_3A_IA' : 'CONSENSO_DIRETO_IA1_IA2',
  houve_divergencia: Boolean(j.houve_divergencia),
  total_divergencias_detectadas: j.total_divergencias || 0,
  simulado: Boolean(j.simulado),
  alerta_instrucao_suspeita: Boolean(j.alerta_instrucao_suspeita),
  documento_entrada: j.extracao || null,
  leitura_em_blocos: j.leitura || null,
  modelos: j.modelos_executados,
  divergencias_iniciais: j.houve_divergencia ? j.divergencias : null,
  arbitragem_ia3: j.auditoria_ia3 || { acionada: false },
  correcoes_invariantes_gradment: correcoesInvariantes,
  estatisticas_finais: {
    total_disciplinas: disciplinasValidadas.length,
    obrigatorias: obrigatorias.length,
    optativas: optativas.length,
    periodos: obrigatorias.length > 0 ? Math.max(...obrigatorias.map((d) => d.periodo)) : 0,
    total_dependencias: dependenciasValidadas.length,
    pre_requisitos: dependenciasValidadas.filter((d) => d.tipo === 'PRE').length,
    correquisitos: dependenciasValidadas.filter((d) => d.tipo === 'CO').length,
    carga_horaria_obrigatoria_total: obrigatorias.reduce((acc, d) => acc + d.carga_horaria, 0),
  },
};

return [{
  json: {
    erro: null,
    origem: j.origem,
    gerar_pdfs: j.gerar_pdfs,
    incluir_json: j.incluir_json,
    simulado: Boolean(j.simulado),
    payload_gradment: payloadGradment,
    relatorio_auditoria: relatorioAuditoria,
  },
}];

