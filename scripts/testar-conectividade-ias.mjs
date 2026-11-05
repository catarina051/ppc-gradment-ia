// Testa a conectividade, autenticação e resposta JSON mínima (~20 tokens) das 3 IAs configuradas no .env,
// SEM imprimir chaves de API e SEM executar análise completa de PPC.
// Uso: node scripts/testar-conectividade-ias.mjs [ia1|ia2|ia3|todas]
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const arqEnv = join(RAIZ, '.env');

if (!existsSync(arqEnv)) {
  console.error('Arquivo .env não encontrado em ppc-gradment-ia/.env');
  process.exit(1);
}

const env = {};
for (const linha of readFileSync(arqEnv, 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) {
    env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
}

const CHAVE_GLOBAL = {
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

const URL_BASE = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
};

function lerSlot(slot, padraoProv, padraoMod) {
  const p = slot.toUpperCase();
  const provider = (env[`${p}_PROVIDER`] || padraoProv).toLowerCase();
  const model = env[`${p}_MODEL`] || padraoMod;
  const nomeVarChave = env[`${p}_API_KEY`] ? `${p}_API_KEY` : CHAVE_GLOBAL[provider];
  const apiKey = (nomeVarChave && env[nomeVarChave]) || '';
  const baseUrl = (env[`${p}_BASE_URL`] || URL_BASE[provider] || '').replace(/\/+$/, '');
  return { slot, provider, model, nomeVarChave, temChave: apiKey.length > 0, apiKey, baseUrl };
}

async function testarSlot(cfg) {
  const inicio = Date.now();
  if (!cfg.temChave) {
    return {
      slot: cfg.slot.toUpperCase(),
      provider: cfg.provider,
      model: cfg.model,
      status: 'PENDENTE_CHAVE',
      detalhe: `Preencha ${cfg.nomeVarChave} no arquivo .env`,
    };
  }

  // Bloqueio preventivo: no OpenRouter, exige sufixo :free ou openrouter/free para garantir custo zero
  if (cfg.provider === 'openrouter' && !cfg.model.endsWith(':free') && cfg.model !== 'openrouter/free') {
    return {
      slot: cfg.slot.toUpperCase(),
      provider: cfg.provider,
      model: cfg.model,
      status: 'BLOQUEADO_CUSTO',
      detalhe: `O modelo "${cfg.model}" no OpenRouter não possui sufixo ":free". Use um modelo ":free" para garantir custo zero.`,
    };
  }

  let url;
  let headers = { 'Content-Type': 'application/json' };
  let body;

  if (cfg.provider === 'gemini') {
    url = `${cfg.baseUrl}/models/${cfg.model}:generateContent`;
    headers['x-goog-api-key'] = cfg.apiKey;
    body = {
      contents: [{ role: 'user', parts: [{ text: 'Responda apenas {"ok": true}' }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 64,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
      },
    };
  } else if (cfg.provider === 'anthropic') {
    url = `${cfg.baseUrl}/messages`;
    headers['x-api-key'] = cfg.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model: cfg.model,
      max_tokens: 32,
      temperature: 0,
      messages: [{ role: 'user', content: 'Responda apenas {"ok": true}' }],
    };
  } else {
    url = `${cfg.baseUrl}/chat/completions`;
    headers.Authorization = `Bearer ${cfg.apiKey}`;
    if (cfg.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'http://localhost:5680';
      headers['X-Title'] = 'PPC GradMent IA';
    }
    body = {
      model: cfg.model,
      temperature: 0,
      max_tokens: 512,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Responda exclusivamente em JSON válido.' },
        { role: 'user', content: 'Retorne exatamente {"ok": true}' },
      ],
    };
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    const ms = Date.now() - inicio;
    const texto = await resp.text();
    let dados = {};
    try { dados = JSON.parse(texto); } catch { /* mantém vazio */ }

    const reqRestantes = resp.headers.get('x-ratelimit-remaining-requests') || resp.headers.get('x-ratelimit-remaining') || 'n/d';
    const tokRestantes = resp.headers.get('x-ratelimit-remaining-tokens') || 'n/d';

    if (!resp.ok) {
      const msgErro = dados?.error?.message || dados?.message || texto.slice(0, 200);
      return {
        slot: cfg.slot.toUpperCase(),
        provider: cfg.provider,
        model: cfg.model,
        status: `ERRO_HTTP_${resp.status}`,
        ms,
        detalhe: msgErro,
      };
    }

    const uso = dados.usage || dados.usageMetadata || {};
    const tokensTotal = uso.total_tokens ?? uso.totalTokenCount ?? 'n/d';

    return {
      slot: cfg.slot.toUpperCase(),
      provider: cfg.provider,
      model: cfg.model,
      status: 'CONECTADO_OK',
      ms,
      tokens_gastos: tokensTotal,
      cota_req_restante: reqRestantes,
      cota_tok_restante: tokRestantes,
    };
  } catch (err) {
    return {
      slot: cfg.slot.toUpperCase(),
      provider: cfg.provider,
      model: cfg.model,
      status: 'FALHA_REDE',
      detalhe: err.message,
    };
  }
}

const filtro = (process.argv[2] || 'todas').toLowerCase();
const slots = [
  lerSlot('ia1', 'gemini', 'gemini-3.5-flash-lite'),
  lerSlot('ia2', 'openrouter', 'nvidia/nemotron-3.5-super-vl:free'),
  lerSlot('ia3', 'groq', 'openai/gpt-oss-120b'),
].filter((s) => filtro === 'todas' || s.slot === filtro);

for (const s of slots) {
  const res = await testarSlot(s);
  console.log(JSON.stringify(res));
}

