// @usa-compartilhado
// Pareia semanticamente as extrações da IA 1 e da IA 2 (protegido contra falsos-positivos de código gerado
// e contra fusão indevida de Cálculo I com Cálculo II), detecta divergências reais e prepara a chamada da IA 3 (Juíza).
const fs = require('fs');
const prep = $('Preparar IAs').first().json;
const itens = $input.all().map((i) => i.json);

const respIa1 = itens.find((x) => x.slot === 'ia1');
const respIa2 = itens.find((x) => x.slot === 'ia2');

if (!respIa1 || !respIa2) {
  return [{
    json: {
      ...prep,
      erro: 'Não foi possível reunir as respostas das duas IAs analisadoras.',
      status: 500,
    },
  }];
}

if (respIa1.erro || respIa2.erro) {
  const erros = [respIa1.erro, respIa2.erro].filter(Boolean).join(' | ');
  return [{
    json: {
      ...prep,
      erro: erros,
      status: 502,
    },
  }];
}

const r1 = respIa1.resultado;
const r2 = respIa2.resultado;

if (!r1?.e_ppc_valido && !r2?.e_ppc_valido) {
  return [{
    json: {
      ...prep,
      erro: 'As duas IAs indicaram que o documento enviado não contém matriz curricular válida de um PPC.',
      status: 422,
    },
  }];
}

function sanitizarDisciplinaBruta(d) {
  const perNum = d.periodo === null || d.periodo === undefined || d.periodo === ''
    ? null
    : Number.parseInt(String(d.periodo), 10);
  const periodo = Number.isInteger(perNum) && perNum > 0 ? perNum : null;
  const chNum = Math.round(Number(d.carga_horaria) || 0);
  const codigoBruto = String(d.codigo ?? '').trim().toUpperCase();
  const extBruto = d.codigo_externo ? limparTextoUnicaLinha(d.codigo_externo, 30) : null;
  return {
    codigo_bruto: codigoBruto,
    codigo_externo: extBruto || null,
    ext_norm: extBruto ? semAcentos(extBruto).toUpperCase().replace(/[^A-Z0-9]/g, '') : '',
    nome: limparTextoUnicaLinha(d.nome, 255),
    chave_nome: chaveNomeDisciplina(d.nome),
    periodo,
    eixo: d.eixo ? limparTextoUnicaLinha(d.eixo, 100) : null,
    carga_horaria: chNum > 0 ? chNum : 0,
    ementa: d.ementa ? String(d.ementa).trim() : null,
  };
}

const lista1 = (Array.isArray(r1.disciplinas) ? r1.disciplinas : []).map(sanitizarDisciplinaBruta).filter((d) => d.nome);
const lista2 = (Array.isArray(r2.disciplinas) ? r2.disciplinas : []).map(sanitizarDisciplinaBruta).filter((d) => d.nome);

const pareadosIa2 = new Set();
const pares = []; // { d1, d2 }

function tentarParear(predicado) {
  for (let i = 0; i < lista1.length; i++) {
    if (pares.some((p) => p.idx1 === i)) continue;
    const d1 = lista1[i];
    for (let j = 0; j < lista2.length; j++) {
      if (pareadosIa2.has(j)) continue;
      const d2 = lista2[j];
      if (!ordinaisCompativeis(d1.nome, d2.nome)) continue;
      if (predicado(d1, d2)) {
        pareadosIa2.add(j);
        pares.push({ idx1: i, idx2: j, d1, d2 });
        break;
      }
    }
  }
}

// 1ª Passada: código externo institucional idêntico
tentarParear((d1, d2) => d1.ext_norm.length >= 3 && d1.ext_norm === d2.ext_norm);
// 2ª Passada: nome canônico idêntico (já com proteção de ordinais)
tentarParear((d1, d2) => d1.chave_nome.length >= 3 && d1.chave_nome === d2.chave_nome);
// 3ª Passada: mesmo código interno + similaridade razoável de nome
tentarParear((d1, d2) => (
  d1.codigo_bruto.length >= 3
  && d1.codigo_bruto === d2.codigo_bruto
  && similaridadeJaccardTokens(d1.nome, d2.nome) >= 0.5
));
// 4ª Passada: alta similaridade de tokens no mesmo período
tentarParear((d1, d2) => (
  d1.periodo === d2.periodo
  && similaridadeJaccardTokens(d1.nome, d2.nome) >= 0.8
));

// Adiciona disciplinas exclusivas da IA 1 e exclusivas da IA 2
for (let i = 0; i < lista1.length; i++) {
  if (!pares.some((p) => p.idx1 === i)) {
    pares.push({ idx1: i, idx2: null, d1: lista1[i], d2: null });
  }
}
for (let j = 0; j < lista2.length; j++) {
  if (!pareadosIa2.has(j)) {
    pares.push({ idx1: null, idx2: j, d1: null, d2: lista2[j] });
  }
}

// Atribui código GradMent canônico único por disciplina pareada e cria mapas de tradução para dependências
const codigosUsados = new Set();
const mapaCodIa1 = new Map();
const mapaCodIa2 = new Map();

const disciplinasConsenso = [];
const divergenciasDisciplinas = [];
let seqDisc = 0;

for (const par of pares) {
  const { d1, d2 } = par;
  const ref = d1 || d2;
  const codigoUnificado = gerarCodigoGradment(
    d1?.codigo_bruto || d2?.codigo_bruto,
    d1?.codigo_externo || d2?.codigo_externo,
    ref.nome,
    codigosUsados,
  );

  if (d1) {
    if (d1.codigo_bruto) mapaCodIa1.set(d1.codigo_bruto, codigoUnificado);
    if (d1.ext_norm) mapaCodIa1.set(d1.ext_norm, codigoUnificado);
  }
  if (d2) {
    if (d2.codigo_bruto) mapaCodIa2.set(d2.codigo_bruto, codigoUnificado);
    if (d2.ext_norm) mapaCodIa2.set(d2.ext_norm, codigoUnificado);
  }

  if (d1 && !d2) {
    divergenciasDisciplinas.push({
      id_divergencia: `DISC_${String(++seqDisc).padStart(2, '0')}`,
      motivo: 'Disciplina extraída apenas pela IA 1 (ausente na IA 2)',
      codigo_sugerido: codigoUnificado,
      ia1: { codigo: codigoUnificado, codigo_externo: d1.codigo_externo, nome: d1.nome, periodo: d1.periodo, eixo: d1.eixo, carga_horaria: d1.carga_horaria, ementa: d1.ementa },
      ia2: null,
    });
    continue;
  }

  if (!d1 && d2) {
    divergenciasDisciplinas.push({
      id_divergencia: `DISC_${String(++seqDisc).padStart(2, '0')}`,
      motivo: 'Disciplina extraída apenas pela IA 2 (ausente na IA 1)',
      codigo_sugerido: codigoUnificado,
      ia1: null,
      ia2: { codigo: codigoUnificado, codigo_externo: d2.codigo_externo, nome: d2.nome, periodo: d2.periodo, eixo: d2.eixo, carga_horaria: d2.carga_horaria, ementa: d2.ementa },
    });
    continue;
  }

  // Par presente em ambas as IAs: verifica divergências semânticas/estruturais
  const motivos = [];
  if (d1.periodo !== d2.periodo) {
    motivos.push(`período divergente (IA1=${d1.periodo ?? 'Optativa/null'} vs IA2=${d2.periodo ?? 'Optativa/null'})`);
  }
  if (d1.carga_horaria !== d2.carga_horaria || d1.carga_horaria <= 0) {
    motivos.push(`carga_horaria divergente/inválida (IA1=${d1.carga_horaria}h vs IA2=${d2.carga_horaria}h)`);
  }
  if (d1.ext_norm && d2.ext_norm && d1.ext_norm !== d2.ext_norm) {
    motivos.push(`codigo_externo divergente (IA1="${d1.codigo_externo}" vs IA2="${d2.codigo_externo}")`);
  }

  const temEm1 = Boolean(d1.ementa && d1.ementa.length >= 15);
  const temEm2 = Boolean(d2.ementa && d2.ementa.length >= 15);
  if (temEm1 !== temEm2) {
    motivos.push('ementa preenchida por apenas uma das IAs');
  } else if (temEm1 && temEm2 && similaridadeJaccardTokens(d1.ementa, d2.ementa) < 0.45) {
    motivos.push('texto da ementa substancialmente divergente entre IA 1 e IA 2');
  }

  if (motivos.length > 0) {
    divergenciasDisciplinas.push({
      id_divergencia: `DISC_${String(++seqDisc).padStart(2, '0')}`,
      motivo: motivos.join('; '),
      codigo_sugerido: codigoUnificado,
      ia1: { codigo: codigoUnificado, codigo_externo: d1.codigo_externo, nome: d1.nome, periodo: d1.periodo, eixo: d1.eixo, carga_horaria: d1.carga_horaria, ementa: d1.ementa },
      ia2: { codigo: codigoUnificado, codigo_externo: d2.codigo_externo, nome: d2.nome, periodo: d2.periodo, eixo: d2.eixo, carga_horaria: d2.carga_horaria, ementa: d2.ementa },
    });
  } else {
    // Consenso na disciplina! Escolhe a ementa mais completa e preserva metadados
    const ementaFinal = (d1.ementa || '').length >= (d2.ementa || '').length ? d1.ementa : d2.ementa;
    disciplinasConsenso.push({
      codigo: codigoUnificado,
      codigo_externo: d1.codigo_externo || d2.codigo_externo || null,
      nome: d1.nome.length >= d2.nome.length ? d1.nome : d2.nome,
      periodo: d1.periodo,
      eixo: d1.eixo || d2.eixo || null,
      carga_horaria: d1.carga_horaria,
      ementa: ementaFinal || null,
    });
  }
}

// Compara grafo de dependências já traduzido para os códigos unificados
function normalizarMapaDeps(depsBrutas, mapaCod) {
  const mapa = new Map();
  for (const dep of Array.isArray(depsBrutas) ? depsBrutas : []) {
    const rawDisc = String(dep.disciplina_codigo ?? '').trim().toUpperCase();
    const rawReq = String(dep.dependencia_codigo ?? '').trim().toUpperCase();
    const disc = mapaCod.get(rawDisc) || mapaCod.get(rawDisc.replace(/[^A-Z0-9]/g, ''));
    const req = mapaCod.get(rawReq) || mapaCod.get(rawReq.replace(/[^A-Z0-9]/g, ''));
    const tipo = String(dep.tipo ?? '').trim().toUpperCase();
    if (!disc || !req || disc === req) continue;
    if (tipo !== 'PRE' && tipo !== 'CO') continue;
    mapa.set(`${disc}->${req}`, { disciplina_codigo: disc, dependencia_codigo: req, tipo });
  }
  return mapa;
}

const depsIa1 = normalizarMapaDeps(r1.dependencias, mapaCodIa1);
const depsIa2 = normalizarMapaDeps(r2.dependencias, mapaCodIa2);
const todasChavesDep = new Set([...depsIa1.keys(), ...depsIa2.keys()]);

const dependenciasConsenso = [];
const divergenciasDependencias = [];
let seqDep = 0;

for (const chave of todasChavesDep) {
  const a1 = depsIa1.get(chave);
  const a2 = depsIa2.get(chave);
  if (a1 && a2 && a1.tipo === a2.tipo) {
    dependenciasConsenso.push(a1);
  } else {
    const ref = a1 || a2;
    let motivo = '';
    if (a1 && !a2) motivo = `Dependência ${a1.tipo} apontada apenas pela IA 1`;
    else if (!a1 && a2) motivo = `Dependência ${a2.tipo} apontada apenas pela IA 2`;
    else motivo = `Tipo de dependência divergente (IA1=${a1.tipo} vs IA2=${a2.tipo})`;

    divergenciasDependencias.push({
      id_divergencia: `DEP_${String(++seqDep).padStart(2, '0')}`,
      motivo,
      disciplina_codigo: ref.disciplina_codigo,
      dependencia_codigo: ref.dependencia_codigo,
      ia1_tipo: a1 ? a1.tipo : null,
      ia2_tipo: a2 ? a2.tipo : null,
    });
  }
}

const nomeCurso1 = limparTextoUnicaLinha(r1.curso?.nome_curso || prep.nome_curso_esperado || 'Curso Superior', 150);
const nomeCurso2 = limparTextoUnicaLinha(r2.curso?.nome_curso || prep.nome_curso_esperado || 'Curso Superior', 150);
const cursoDivergente = !prep.nome_curso_esperado && similaridadeJaccardTokens(nomeCurso1, nomeCurso2) < 0.7;

const totalDivergencias = divergenciasDisciplinas.length + divergenciasDependencias.length + (cursoDivergente ? 1 : 0);
const houveDivergencia = totalDivergencias > 0;

const cursoConsenso = {
  nome_curso: prep.nome_curso_esperado || nomeCurso1,
  ano_periodo: prep.ano_periodo || r1.curso?.ano_periodo || r2.curso?.ano_periodo || '2026.1',
};

let ia3Payload = null;
const simularIa3 = prep.simular || prep.ia3_config?.provider === 'simulado';

if (houveDivergencia && !simularIa3) {
  const promptIa3 = fs.readFileSync('/data/prompts/ia3-juiza-divergencias.md', 'utf8');
  const schemaJuiza = JSON.parse(fs.readFileSync('/data/prompts/schema-juiza.json', 'utf8'));
  let cfg3 = { ...prep.ia3_config };

  const resumoConsenso = disciplinasConsenso.map((d) => ({
    codigo: d.codigo,
    codigo_externo: d.codigo_externo,
    nome: d.nome,
    periodo: d.periodo,
  }));

  const jsonBaseCompacto = JSON.stringify({
    disciplinas_consenso: resumoConsenso,
    dependencias_consenso: dependenciasConsenso,
  });
  const jsonDivCompacto = JSON.stringify({
    curso_divergente: cursoDivergente ? { ia1: nomeCurso1, ia2: nomeCurso2 } : null,
    divergencias_disciplinas: divergenciasDisciplinas,
    divergencias_dependencias: divergenciasDependencias,
  });

  // Se o slot da IA 3 estiver na Groq gratuita (teto físico de 8.000 TPM), verifica se a soma estimada
  // de prompt + decisões cabe com margem segura; em PPCs extensos com muitas divergências, faz transbordo
  // automático gratuito para um modelo de contexto amplo (gemini-3.6-flash ou openrouter :free).
  if (cfg3.provider === 'groq') {
    const overheadFixoChars = promptIa3.length + JSON.stringify(schemaJuiza).length + jsonBaseCompacto.length + jsonDivCompacto.length + 500;
    const tokensSaidaEstimados = divergenciasDisciplinas.length * 190 + divergenciasDependencias.length * 85 + 350;
    const tokensMinimosTotais = Math.ceil((overheadFixoChars + 3500) / 3.3) + tokensSaidaEstimados;
    if (tokensMinimosTotais > 6600) {
      if (cfg3.overflow_gemini) {
        cfg3 = {
          slot: 'ia3',
          provider: 'gemini',
          model: 'gemini-3.6-flash',
          env_key: 'GEMINI_API_KEY',
          base_url: '',
          fallback_tpm_groq: true,
        };
      } else if (cfg3.overflow_openrouter) {
        cfg3 = {
          slot: 'ia3',
          provider: 'openrouter',
          model: 'nvidia/nemotron-3.5-super-vl:free',
          env_key: 'OPENROUTER_API_KEY',
          base_url: '',
          fallback_tpm_groq: true,
        };
      }
    }
  }

  let textoParaJuiza = prep.texto_sanitizado;
  if (cfg3.provider === 'groq') {
    const overheadChars = promptIa3.length + JSON.stringify(schemaJuiza).length + jsonBaseCompacto.length + jsonDivCompacto.length + 500;
    const tokensSaidaEst = divergenciasDisciplinas.length * 180 + divergenciasDependencias.length * 80 + 300;
    const orcamentoPromptTokens = Math.max(2500, 6800 - tokensSaidaEst);
    const limiteDocChars = Math.max(3500, Math.floor(orcamentoPromptTokens * 3.3) - overheadChars);
    if (textoParaJuiza.length > limiteDocChars) {
      const termosBusca = new Set();
      for (const d of divergenciasDisciplinas) {
        for (const lado of [d.ia1, d.ia2]) {
          if (!lado) continue;
          if (lado.codigo_externo) termosBusca.add(semAcentos(lado.codigo_externo).toUpperCase());
          if (lado.nome) termosBusca.add(semAcentos(lado.nome).toUpperCase().slice(0, 22));
        }
      }
      const mapCodNome = new Map(resumoConsenso.map((c) => [c.codigo, semAcentos(c.nome).toUpperCase().slice(0, 22)]));
      for (const dep of divergenciasDependencias) {
        if (mapCodNome.has(dep.disciplina_codigo)) termosBusca.add(mapCodNome.get(dep.disciplina_codigo));
        if (mapCodNome.has(dep.dependencia_codigo)) termosBusca.add(mapCodNome.get(dep.dependencia_codigo));
      }
      const blocosPaginas = textoParaJuiza.split(/(?=--- \[PÁGINA \d+\] ---)/);
      const filtrados = blocosPaginas.filter((bloco, idx) => {
        if (idx === 0) return true;
        const norm = semAcentos(bloco).toUpperCase();
        for (const termo of termosBusca) {
          if (termo.length >= 3 && norm.includes(termo)) return true;
        }
        return false;
      });
      textoParaJuiza = filtrados.join('\n').slice(0, limiteDocChars);
    }
  }

  const msgJuiza = [
    '<contexto_execucao>',
    `curso_id_gradment: ${prep.curso_id}`,
    `ano_periodo_padrao: ${cursoConsenso.ano_periodo}`,
    `nome_curso_ia1: ${nomeCurso1}`,
    `nome_curso_ia2: ${nomeCurso2}`,
    `nome_curso_esperado: ${prep.nome_curso_esperado || '(validar pelo PPC)'}`,
    '</contexto_execucao>',
    '<base_consenso>',
    jsonBaseCompacto,
    '</base_consenso>',
    '<divergencias_detectadas>',
    jsonDivCompacto,
    '</divergencias_detectadas>',
    '<ppc_documento>',
    textoParaJuiza,
    '</ppc_documento>',
  ].join('\n');

  if (cfg3.provider === 'gemini') {
    const base = (cfg3.base_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const genCfg3 = {
      temperature: 0,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      responseSchema: schemaJuiza,
    };
    if (/^gemini-3\./i.test(cfg3.model) && !/lite/i.test(cfg3.model)) {
      genCfg3.thinkingConfig = { thinkingBudget: 0 };
    }
    ia3Payload = {
      ...cfg3,
      url: `${base}/models/${cfg3.model}:generateContent`,
      body: {
        systemInstruction: { parts: [{ text: promptIa3 }] },
        contents: [{ role: 'user', parts: [{ text: msgJuiza }] }],
        generationConfig: genCfg3,
      },
    };
  } else if (cfg3.provider === 'anthropic') {
    const base = (cfg3.base_url || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    ia3Payload = {
      ...cfg3,
      url: `${base}/messages`,
      body: {
        model: cfg3.model,
        max_tokens: 16384,
        fallbacks: 'default',
        system: `${promptIa3}\n\n## Schema JSON Obrigatório de Resposta\n${JSON.stringify(schemaJuiza)}`,
        messages: [{ role: 'user', content: msgJuiza }],
      },
    };
  } else {
    const URLS_BASE = {
      openrouter: 'https://openrouter.ai/api/v1',
      groq: 'https://api.groq.com/openai/v1',
      mistral: 'https://api.mistral.ai/v1',
      openai: 'https://api.openai.com/v1',
    };
    const padraoBase = URLS_BASE[cfg3.provider] || URLS_BASE.openai;
    const maxTokensJuiza = cfg3.provider === 'groq' ? 4096 : 32768;
    const base = (cfg3.base_url || padraoBase).replace(/\/+$/, '');
    const bodyJuiza = {
      model: cfg3.model,
      temperature: 0,
      max_tokens: maxTokensJuiza,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${promptIa3}\n\n## Schema JSON Obrigatório de Resposta\n${JSON.stringify(schemaJuiza)}` },
        { role: 'user', content: msgJuiza },
      ],
    };
    if (cfg3.provider === 'openrouter') {
      bodyJuiza.reasoning = { enabled: false };
    } else if (cfg3.provider === 'groq' && /gpt-oss/i.test(cfg3.model)) {
      bodyJuiza.reasoning_effort = 'low';
    }
    ia3Payload = {
      ...cfg3,
      url: `${base}/chat/completions`,
      body: bodyJuiza,
    };
  }
}

return [{
  json: {
    erro: null,
    curso_id: prep.curso_id,
    origem: prep.origem,
    gerar_pdfs: prep.gerar_pdfs,
    incluir_json: prep.incluir_json,
    simulado: Boolean(respIa1.simulado || respIa2.simulado),
    simular_ia3: simularIa3,
    alerta_instrucao_suspeita: Boolean(r1?.alerta_instrucao_suspeita || r2?.alerta_instrucao_suspeita),
    extracao: prep.extracao,
    modelos_executados: {
      ia1: { provider: respIa1.provider, model: respIa1.model, verificacao: r1?.verificacao_inicial || null },
      ia2: { provider: respIa2.provider, model: respIa2.model, verificacao: r2?.verificacao_inicial || null },
      ia3: houveDivergencia ? { provider: (ia3Payload || prep.ia3_config).provider, model: (ia3Payload || prep.ia3_config).model } : null,
    },
    houve_divergencia: houveDivergencia,
    total_divergencias: totalDivergencias,
    curso_consenso: cursoConsenso,
    disciplinas_consenso: disciplinasConsenso,
    dependencias_consenso: dependenciasConsenso,
    divergencias: {
      curso_divergente: cursoDivergente ? { ia1: nomeCurso1, ia2: nomeCurso2 } : null,
      disciplinas: divergenciasDisciplinas,
      dependencias: divergenciasDependencias,
    },
    ia3: ia3Payload,
  },
}];

