// Resolve os provedores configurados no .env e monta as requisições independentes da IA 1 e da IA 2.
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
    // Só a configuração: os nós "IA 1/IA 2 — Ler PPC em blocos" montam uma requisição por bloco de páginas
    ia1: cfgIa1 ? { ...cfgIa1 } : { slot: 'ia1', provider: 'simulado', model: 'simulado-matriz-v1' },
    ia2: cfgIa2 ? { ...cfgIa2 } : { slot: 'ia2', provider: 'simulado', model: 'simulado-ementario-v1' },
    chars_por_bloco: 60000,
    ia3_config: cfgIa3 || { slot: 'ia3', provider: 'simulado', model: 'simulado-juiza-v1' },
  },
}];

