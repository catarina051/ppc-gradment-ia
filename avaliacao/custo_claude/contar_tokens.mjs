// Mede o custo em tokens do PROCESSO ANTERIOR: mandar o PPC para o Claude e pedir o JSON do GradMent.
// Usa o endpoint gratuito de contagem de tokens (messages.countTokens), então não gasta créditos.
//
// Uso (dentro de avaliacao/custo_claude, depois de `npm install`):
//   node contar_tokens.mjs <ppc.pdf> <texto-integral.txt> <execucao-pipeline.json>
// Requer ANTHROPIC_API_KEY no ambiente ou no .env da raiz do projeto (o valor nunca é impresso).
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const [, , caminhoPdf, caminhoTexto, caminhoExecucao] = process.argv;

if (!process.env.ANTHROPIC_API_KEY) {
  const linha = readFileSync(join(RAIZ, '.env'), 'utf8').split(/\r?\n/).find((l) => l.startsWith('ANTHROPIC_API_KEY='));
  const valor = linha ? linha.slice('ANTHROPIC_API_KEY='.length).trim() : '';
  if (valor) process.env.ANTHROPIC_API_KEY = valor;
}
const client = new Anthropic();

// Preços oficiais por milhão de tokens (tabela da Anthropic em cache de 2026-10-06), primeira parte da API.
const MODELOS = [
  { id: 'claude-opus-5-5', entrada: 4.0, saida: 20.0 },
  { id: 'claude-sonnet-5-5', entrada: 2.0, saida: 10.0 },
  // Haiku 5.5: US$ 0,10 / 0,50 até 100K tokens de prompt; acima disso, US$ 0,50 / 2,50.
  { id: 'claude-haiku-5-5', entrada: 0.1, saida: 0.5, acima100k: { entrada: 0.5, saida: 2.5 } },
];

const especificacao = readFileSync(join(RAIZ, 'docs', 'especificacao-gradment.md'), 'utf8');
const pedido = 'Converta o PPC anexado para o JSON canônico do GradMent (Caminho A, seção 3.3). Responda SOMENTE com o JSON, com TODAS as disciplinas e dependências.';
const pdfBase64 = readFileSync(caminhoPdf).toString('base64');
const textoIntegral = readFileSync(caminhoTexto, 'utf8');
const execucao = JSON.parse(readFileSync(caminhoExecucao, 'utf8'));
const saidaGradment = JSON.stringify(execucao.payload_gradment, null, 2);

async function contar(model, { system, content }) {
  const r = await client.messages.countTokens({ model, ...(system ? { system } : {}), messages: [{ role: 'user', content }] });
  return r.input_tokens;
}

const resultado = { medido_em: new Date().toISOString(), metodo: 'messages.countTokens (gratuito)', modelos: [] };
for (const m of MODELOS) {
  const vazio = await contar(m.id, { content: '.' }); // custo fixo de uma mensagem mínima, descontado da saída
  const entradaPdf = await contar(m.id, {
    system: especificacao,
    content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
      { type: 'text', text: pedido },
    ],
  });
  const entradaTexto = await contar(m.id, { system: especificacao, content: `${pedido}\n\n${textoIntegral}` });
  const saida = (await contar(m.id, { content: saidaGradment })) - vazio;

  const preco = (entrada) => (m.acima100k && entrada > 100000 ? m.acima100k : m);
  const custo = (entrada) => (entrada * preco(entrada).entrada + saida * preco(entrada).saida) / 1e6;
  resultado.modelos.push({
    modelo: m.id,
    tokens_entrada_pdf_anexado: entradaPdf,
    tokens_entrada_texto_extraido: entradaTexto,
    tokens_saida_json_gradment: saida,
    custo_usd_pdf_anexado: Number(custo(entradaPdf).toFixed(4)),
    custo_usd_texto_extraido: Number(custo(entradaTexto).toFixed(4)),
    observacao: 'Piso de UMA tentativa: não inclui tokens de raciocínio (thinking), cobrados como saída, nem rodadas de correção.',
  });
  console.log(m.id, JSON.stringify(resultado.modelos.at(-1)));
}

writeFileSync(join(AQUI, 'custo-processo-anterior.json'), `${JSON.stringify(resultado, null, 2)}\n`);
