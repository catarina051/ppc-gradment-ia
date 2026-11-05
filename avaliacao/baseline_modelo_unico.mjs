// Baseline "processo anterior": mandar o PPC inteiro para UM modelo e pedir o JSON do GradMent.
// Sem segunda IA, sem juíza, sem validador determinístico. É o que se fazia no chat antes do pipeline.
//
// Uso: node avaliacao/baseline_modelo_unico.mjs <texto-integral.txt> <rotulo> <provider> <modelo>
//   provider: gemini | openrouter
// Lê as chaves do .env (nunca imprime). Grava avaliacao/execucoes/<rotulo>.json no mesmo formato da API do
// pipeline (payload_gradment + relatorio_auditoria), para ser pontuado pelo mesmo pontuar.mjs.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const [, , caminhoTexto, rotulo, provider = 'gemini', modelo = 'gemini-3.6-flash'] = process.argv;

const env = Object.fromEntries(readFileSync(join(RAIZ, '.env'), 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));

// A própria especificação do GradMent foi escrita como "System Prompt para qualquer IA" (docs/).
const especificacao = readFileSync(join(RAIZ, 'docs', 'especificacao-gradment.md'), 'utf8');
const texto = readFileSync(caminhoTexto, 'utf8');
const pedido = [
  'Converta o PPC abaixo para o JSON canônico do GradMent (Caminho A, seção 3.3 da especificação).',
  'Responda SOMENTE com o objeto JSON {"curso_id": 1, "preview": {...}}, com TODAS as disciplinas e dependências.',
  'ano_periodo: 2026.1',
  '',
  texto,
].join('\n');

let url; let headers; let body;
if (provider === 'gemini') {
  url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
  headers = { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY };
  body = {
    systemInstruction: { parts: [{ text: especificacao }] },
    contents: [{ role: 'user', parts: [{ text: pedido }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 65536, responseMimeType: 'application/json' },
  };
} else {
  url = 'https://openrouter.ai/api/v1/chat/completions';
  headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENROUTER_API_KEY}` };
  body = {
    model: modelo,
    temperature: 0,
    max_tokens: 65536,
    response_format: { type: 'json_object' },
    reasoning: { enabled: false },
    messages: [{ role: 'system', content: especificacao }, { role: 'user', content: pedido }],
  };
}

const t0 = performance.now();
const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(900000) });
const bruto = await r.json().catch(() => ({}));
const segundos = (performance.now() - t0) / 1000;
const conteudo = provider === 'gemini'
  ? (bruto.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text).join('')
  : bruto.choices?.[0]?.message?.content || '';

let dados = null; let erro = null;
try {
  const limpo = conteudo.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  dados = JSON.parse(limpo.slice(limpo.indexOf('{'), limpo.lastIndexOf('}') + 1));
} catch (e) {
  erro = `HTTP ${r.status}: ${(bruto.error?.message || conteudo || JSON.stringify(bruto)).slice(0, 300)}`;
}

const preview = dados?.preview || dados;
const saida = preview?.disciplinas ? {
  sucesso: true,
  payload_gradment: { curso_id: 1, preview: { ...preview, dependencias: preview.dependencias || [] } },
  relatorio_auditoria: {
    status_consenso: 'MODELO_UNICO_SEM_VALIDADOR',
    total_divergencias_detectadas: 0,
    modelos: { ia1: { provider, model: modelo }, ia2: null, ia3: null },
    correcoes_invariantes_gradment: [],
    documento_entrada: { caracteres: texto.length, recortado_por_tamanho: false },
    uso_tokens: bruto.usageMetadata || bruto.usage || null,
  },
} : { sucesso: false, erro };

const arq = join(AQUI, 'execucoes', `${rotulo}.json`);
writeFileSync(arq, `${JSON.stringify(saida, null, 2)}\n`);
appendFileSync(join(AQUI, 'execucoes', 'tempos.csv'), `${rotulo.replace(/-\d+$/, '')},${rotulo},${new Date().toISOString()},${r.status},${segundos.toFixed(6)}\n`);
console.log(rotulo, `HTTP ${r.status}`, `${segundos.toFixed(1)} s`, saida.sucesso ? `${preview.disciplinas.length} disciplinas, ${(preview.dependencias || []).length} dependências` : saida.erro);
