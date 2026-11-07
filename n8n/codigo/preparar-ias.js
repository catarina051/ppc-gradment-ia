// Resolve os provedores configurados no .env e monta as requisições independentes da IA 1 e da IA 2.
const fs = require('fs');
const j = $input.first().json;

const PROVEDORES_VALIDOS = ['gemini', 'openrouter', 'groq', 'mistral', 'openai', 'anthropic'];
const MODELOS_PADRAO = {
  ia1: {
    gemini: 'gemini-3.5-flash-lite',
    openrouter: 'nvidia/nemotron-3.5-super-vl:free',
    groq: 'openai/gpt-oss-120b',
    mistral: 'mistral-small-latest',
    openai: 'gpt-4.1-mini',
    anthropic: 'claude-opus-5-5',
  },
  ia2: {
    gemini: 'gemini-3.5-flash-lite',
    openrouter: 'nvidia/nemotron-3.5-super-vl:free',
    groq: 'openai/gpt-oss-120b',
    mistral: 'mistral-small-latest',
    openai: 'gpt-4.1-mini',
    anthropic: 'claude-opus-5-5',
  },
  ia3: {
    gemini: 'gemini-3.6-flash',
    openrouter: 'google/gemma-4-31b-it:free',
    groq: 'openai/gpt-oss-120b',
    mistral: 'mistral-large-latest',
    openai: 'gpt-4.1',
    anthropic: 'claude-opus-5-5',
  },
};

const CHAVE_GLOBAL_PROVEDOR = {
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

function temValorEnv(nomeVar) {
  return Boolean(nomeVar && $env[nomeVar] && String($env[nomeVar]).trim().length > 0);
}

function resolverSlotIA(slot, padraoProv) {
  const prefixo = slot.toUpperCase(); // IA1, IA2, IA3
  const provDesejadoRaw = String($env[`${prefixo}_PROVIDER`] || padraoProv).trim().toLowerCase();
  const provDesejado = PROVEDORES_VALIDOS.includes(provDesejadoRaw) ? provDesejadoRaw : padraoProv;
  const chaveSlot = `${prefixo}_API_KEY`;
  const chaveGlobal = CHAVE_GLOBAL_PROVEDOR[provDesejado];

  if (temValorEnv(chaveSlot)) {
    return {
      slot,
      provider: provDesejado,
      model: String($env[`${prefixo}_MODEL`] || MODELOS_PADRAO[slot][provDesejado]).trim(),
      env_key: chaveSlot,
      base_url: String($env[`${prefixo}_BASE_URL`] || '').trim(),
      fallback: false,
    };
  }
  if (temValorEnv(chaveGlobal)) {
    return {
      slot,
      provider: provDesejado,
      model: String($env[`${prefixo}_MODEL`] || MODELOS_PADRAO[slot][provDesejado]).trim(),
      env_key: chaveGlobal,
      base_url: String($env[`${prefixo}_BASE_URL`] || '').trim(),
      fallback: false,
    };
  }

  // Fallback automático priorizando provedores gratuitos configurados no .env
  for (const provAlt of ['gemini', 'openrouter', 'groq', 'mistral', 'openai', 'anthropic']) {
    const envAlt = CHAVE_GLOBAL_PROVEDOR[provAlt];
    if (temValorEnv(envAlt)) {
      return {
        slot,
        provider: provAlt,
        model: MODELOS_PADRAO[slot][provAlt],
        env_key: envAlt,
        base_url: '',
        fallback: true,
      };
    }
  }

  return null;
}

function montarHttpPayload(cfg, systemPrompt, schema, mensagemUsuario) {
  if (cfg.provider === 'gemini') {
    const base = (cfg.base_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const genCfg = {
      temperature: 0,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      responseSchema: schema,
    };
    if (/^gemini-3\./i.test(cfg.model) && !/lite/i.test(cfg.model)) {
      genCfg.thinkingConfig = { thinkingBudget: 0 };
    }
    return {
      ...cfg,
      url: `${base}/models/${cfg.model}:generateContent`,
      body: {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: mensagemUsuario }] }],
        generationConfig: genCfg,
      },
    };
  }

  if (cfg.provider === 'anthropic') {
    const base = (cfg.base_url || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    return {
      ...cfg,
      url: `${base}/messages`,
      body: {
        model: cfg.model,
        max_tokens: 32768,
        fallbacks: 'default', // recusa de segurança: a API tenta outro modelo sozinha
        system: `${systemPrompt}\n\n## Schema JSON Obrigatório de Resposta\n${JSON.stringify(schema)}`,
        messages: [{ role: 'user', content: mensagemUsuario }],
      },
    };
  }

  // openrouter, groq, mistral ou openai (API Chat Completions compatível)
  const URLS_BASE = {
    openrouter: 'https://openrouter.ai/api/v1',
    groq: 'https://api.groq.com/openai/v1',
    mistral: 'https://api.mistral.ai/v1',
    openai: 'https://api.openai.com/v1',
  };
  const padraoBase = URLS_BASE[cfg.provider] || URLS_BASE.openai;
  const maxTokensSaida = cfg.provider === 'openrouter' ? 65536 : (cfg.provider === 'groq' || cfg.provider === 'mistral' ? 16384 : 32768);
  const base = (cfg.base_url || padraoBase).replace(/\/+$/, '');
  const bodyChat = {
    model: cfg.model,
    temperature: 0,
    max_tokens: maxTokensSaida,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${systemPrompt}\n\n## Schema JSON Obrigatório de Resposta\n${JSON.stringify(schema)}` },
      { role: 'user', content: mensagemUsuario },
    ],
  };
  if (cfg.provider === 'openrouter') {
    bodyChat.reasoning = { enabled: false };
  } else if (cfg.provider === 'groq' && /gpt-oss/i.test(cfg.model)) {
    bodyChat.reasoning_effort = 'low';
  }
  return {
    ...cfg,
    url: `${base}/chat/completions`,
    body: bodyChat,
  };
}

const textoSanitizado = String(j.texto_ppc || '')
  .replace(/<\/?\s*(ppc_documento|contexto_execucao)\s*>/gi, '')
  .trim();

if (textoSanitizado.length < 50) {
  return [{
    json: {
      ...j,
      erro: 'O texto extraído do PPC é insuficiente para análise curricular.',
      status: 422,
    },
  }];
}

const promptIa1 = fs.readFileSync('/data/prompts/ia1-extratora-matriz.md', 'utf8');
const promptIa2 = fs.readFileSync('/data/prompts/ia2-auditora-ementario.md', 'utf8');
const schemaExtracao = JSON.parse(fs.readFileSync('/data/prompts/schema-extracao.json', 'utf8'));

const mensagemUsuario = [
  '<contexto_execucao>',
  `curso_id_gradment: ${j.curso_id}`,
  `ano_periodo_padrao: ${j.ano_periodo}`,
  `nome_curso_esperado: ${j.nome_curso_esperado || '(extrair do PPC)'}`,
  '</contexto_execucao>',
  '<ppc_documento>',
  textoSanitizado,
  '</ppc_documento>',
].join('\n');

const cfgIa1 = resolverSlotIA('ia1', 'gemini');
const cfgIa2 = resolverSlotIA('ia2', 'openrouter');
const cfgIa3Base = resolverSlotIA('ia3', 'groq');
const cfgIa3 = cfgIa3Base
  ? {
      ...cfgIa3Base,
      overflow_gemini: temValorEnv('GEMINI_API_KEY'),
      overflow_openrouter: temValorEnv('OPENROUTER_API_KEY'),
    }
  : null;

const forcarSimulacao = j.modo_teste === 'simular_consenso' || j.modo_teste === 'simular_divergencia';
const semChaves = !cfgIa1 || !cfgIa2;
const simular = forcarSimulacao || semChaves;

let cenarioSimulacao = 'consenso';
if (j.modo_teste === 'simular_divergencia' || textoSanitizado.includes('[SIMULAR_DIVERGENCIA]')) {
  cenarioSimulacao = 'divergencia';
}

const { texto_ppc: _omitido, ...metadadosEntrada } = j;

return [{
  json: {
    ...metadadosEntrada,
    texto_sanitizado: textoSanitizado,
    simular,
    cenario_simulacao: cenarioSimulacao,
    ia1: cfgIa1 ? montarHttpPayload(cfgIa1, promptIa1, schemaExtracao, mensagemUsuario) : { slot: 'ia1', provider: 'simulado', model: 'simulado-matriz-v1' },
    ia2: cfgIa2 ? montarHttpPayload(cfgIa2, promptIa2, schemaExtracao, mensagemUsuario) : { slot: 'ia2', provider: 'simulado', model: 'simulado-ementario-v1' },
    ia3_config: cfgIa3 || { slot: 'ia3', provider: 'simulado', model: 'simulado-juiza-v1' },
  },
}];

