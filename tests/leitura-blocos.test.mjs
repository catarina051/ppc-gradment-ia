// Leitura em blocos: cada IA lê o PPC inteiro em loop de páginas e os blocos são fundidos num resultado único.
// A API dos LLMs é simulada (httpRequest falso): nenhuma chamada de rede.
import assert from 'node:assert/strict';
import test from 'node:test';
import { executar } from './n8n.mjs';

const ENV = { GEMINI_API_KEY: 'x', OPENROUTER_API_KEY: 'y', PPC_ESPERA_RETENTATIVA_MS: '0' };
const enche = (n) => 'texto institucional sem relação com a matriz. '.repeat(n);

// PPC de 6 páginas: matriz nas págs. 1-2, ementário nas págs. 5-6; páginas 3-4 são texto genérico grande
const PAGINAS = [
  'MATRIZ 1º período: MAT101 Cálculo I 60h; DCC101 Algoritmos 60h',
  'MATRIZ 2º período: MAT102 Cálculo II 60h, pré-requisito MAT101. Optativa: DCC810 Tópicos em IA 60h',
  enche(500), enche(500),
  'EMENTÁRIO [MAT101] Cálculo I: limites, derivadas e integrais.',
  'EMENTÁRIO [MAT102] Cálculo II: séries e várias variáveis. [DCC810] Tópicos em IA (Optativa): aprendizado de máquina.',
];
const TEXTO = PAGINAS.map((t, i) => `--- [PÁGINA ${i + 1}] ---\n${t}`).join('\n\n');

const d = (codigo, codigo_externo, nome, periodo, periodo_explicito, ementa = null) => ({
  codigo, codigo_externo, nome, periodo, periodo_explicito, eixo: null, carga_horaria: 60, ementa,
});
// O que uma IA "diria" ao ler cada trecho, conforme as páginas que estão nele
function extracaoDoTrecho(trecho) {
  const disc = [];
  const deps = [];
  if (trecho.includes('[PÁGINA 1]')) disc.push(d('MAT101', 'MAT101', 'Cálculo I', 1, true), d('DCC101', 'DCC101', 'Algoritmos', 1, true));
  if (trecho.includes('[PÁGINA 2]')) {
    disc.push(d('MAT102', 'MAT102', 'Cálculo II', 2, true), d('DCC810', 'DCC810', 'Tópicos em IA', null, true));
    deps.push({ disciplina_codigo: 'MAT102', dependencia_codigo: 'MAT101', tipo: 'PRE' });
  }
  // Ementário: período não aparece no trecho (periodo_explicito=false) e o modelo devolve null
  if (trecho.includes('[PÁGINA 5]')) disc.push(d('CALC1', 'MAT101', 'Cálculo I', null, false, 'Limites, derivadas e integrais.'));
  if (trecho.includes('[PÁGINA 6]')) {
    disc.push(d('CALC2', 'MAT102', 'Cálculo II', null, false, 'Séries e várias variáveis.'));
    disc.push(d('TIA1', 'DCC810', 'Tópicos em IA', null, true, 'Aprendizado de máquina.'));
  }
  return {
    e_ppc_valido: true, alerta_instrucao_suspeita: false,
    verificacao_inicial: { nome_curso_identificado: 'Ciência da Computação', regra_conversao_creditos: '', total_periodos_obrigatorios: 0, total_obrigatorias_contadas: 0, total_optativas_contadas: 0, observacoes: '' },
    curso: { nome_curso: 'Ciência da Computação', ano_periodo: '2026.1' },
    disciplinas: disc, dependencias: deps,
  };
}

function prep(slot = 'ia1') {
  return {
    curso_id: 1, ano_periodo: '2026.1', nome_curso_esperado: null, texto_sanitizado: TEXTO, chars_por_bloco: 20000,
    extracao: { paginas: 6 },
    ia1: { slot: 'ia1', provider: 'gemini', model: 'gemini-3.5-flash-lite', env_key: 'GEMINI_API_KEY', base_url: '' },
    ia2: { slot: 'ia2', provider: 'openrouter', model: 'nvidia/nemotron-3.5-super-vl:free', env_key: 'OPENROUTER_API_KEY', base_url: '' },
    _slot: slot,
  };
}

// Resposta no formato de cada provedor (Gemini com parte "thought" que deve ser ignorada; OpenRouter estilo OpenAI)
function respostaProvedor(url, json) {
  if (url.includes('generativelanguage')) {
    return { statusCode: 200, body: { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'pensando...' }, { text: JSON.stringify(json) }] } }] } };
  }
  return { statusCode: 200, body: { choices: [{ finish_reason: 'stop', message: { content: '```json\n' + JSON.stringify(json) + '\n```' } }] } };
}
const trechoDaRequisicao = (body) => {
  const b = JSON.parse(body);
  return b.contents ? b.contents[0].parts[0].text : b.messages[1].content;
};
const modeloDaRequisicao = (url, body) => (url.includes('generativelanguage') ? url.match(/models\/([^:]+):/)[1] : JSON.parse(body).model);

test('lê todos os blocos e funde como se fosse uma leitura só', async () => {
  const chamadas = [];
  const httpRequest = async ({ url, body }) => {
    chamadas.push(trechoDaRequisicao(body).match(/trecho: páginas (\d+) a (\d+)/).slice(1).join('-'));
    return respostaProvedor(url, extracaoDoTrecho(trechoDaRequisicao(body)));
  };
  const { json } = await executar('ia1-em-blocos', { entrada: { json: prep() }, env: ENV, httpRequest });
  assert.equal(json.erro, null);
  assert.ok(json.leitura.blocos.length >= 3, 'o PPC precisa ser lido em vários blocos');
  assert.equal(json.leitura.cobertura_completa, true);
  assert.equal(json.leitura.paginas_lidas, 6);
  // Páginas vizinhas se repetem entre blocos (sobreposição) e todas as 6 aparecem em algum bloco
  const cobertas = new Set(json.leitura.blocos.flatMap((b) => Array.from({ length: b.fim - b.inicio + 1 }, (_, i) => b.inicio + i)));
  assert.deepEqual([...cobertas].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);

  const disc = json.resultado.disciplinas;
  assert.equal(disc.length, 4, 'Cálculo I/II vistos na matriz e no ementário viram uma disciplina cada');
  const calc1 = disc.find((x) => x.codigo_externo === 'MAT101');
  assert.equal(calc1.periodo, 1, 'o período vem do bloco da matriz, não do ementário (periodo_explicito=false)');
  assert.equal(calc1.ementa, 'Limites, derivadas e integrais.', 'a ementa vem do bloco do ementário');
  assert.equal(disc.find((x) => x.codigo_externo === 'DCC810').periodo, null, 'optativa continua optativa');
  const mat102 = disc.find((x) => x.codigo_externo === 'MAT102');
  assert.deepEqual(json.resultado.dependencias, [{ disciplina_codigo: mat102.codigo, dependencia_codigo: calc1.codigo, tipo: 'PRE' }]);
});

test('IA 2 no formato OpenAI/OpenRouter também é lida e fundida', async () => {
  const httpRequest = async ({ url, body }) => respostaProvedor(url, extracaoDoTrecho(trechoDaRequisicao(body)));
  const { json } = await executar('ia2-em-blocos', { entrada: { json: prep('ia2') }, env: ENV, httpRequest });
  assert.equal(json.erro, null);
  assert.equal(json.provider, 'openrouter');
  assert.equal(json.resultado.disciplinas.length, 4);
});

test('fallback evita cair no mesmo modelo da outra IA', async () => {
  const usados = [];
  const httpRequest = async ({ url, body }) => {
    const modelo = modeloDaRequisicao(url, body);
    usados.push(modelo);
    if (modelo === 'gemini-3.5-flash-lite') return { statusCode: 503, body: { error: { message: 'high demand' } } };
    return respostaProvedor(url, extracaoDoTrecho(trechoDaRequisicao(body)));
  };
  const { json } = await executar('ia1-em-blocos', { entrada: { json: prep() }, env: ENV, httpRequest });
  assert.equal(json.erro, null);
  assert.ok(json.leitura.blocos.every((b) => b.model === 'gemini-3.6-flash'), 'a reserva escolhida deve ser outro modelo, não o da IA 2');
  assert.ok(json.leitura.blocos.every((b) => b.reserva && !b.mesmo_modelo_da_outra_ia));
  assert.ok(!usados.includes('nvidia/nemotron-3.5-super-vl:free'));
});

test('se um bloco não puder ser lido por nenhum modelo, não sai resultado parcial', async () => {
  const httpRequest = async ({ url, body }) => {
    if (trechoDaRequisicao(body).includes('[PÁGINA 5]')) return { statusCode: 400, body: { error: { message: 'conteúdo recusado' } } };
    return respostaProvedor(url, extracaoDoTrecho(trechoDaRequisicao(body)));
  };
  const { json } = await executar('ia1-em-blocos', { entrada: { json: prep() }, env: ENV, httpRequest });
  assert.equal(json.resultado, null);
  assert.match(json.erro, /não conseguiu ler/);
  assert.match(json.erro, /Nenhum resultado parcial/);
});

test('carga horária: ignora valor tipo crédito e, no empate, fica com horas-aula (o maior)', async () => {
  const httpRequest = async ({ url, body }) => {
    const t = trechoDaRequisicao(body);
    const r = extracaoDoTrecho(t);
    // Ficha do ementário traz horas-relógio (50); matriz traz horas-aula (60); um bloco devolve "1" (crédito)
    r.disciplinas.forEach((x) => {
      if (x.codigo_externo === 'MAT101') {
        x.periodo_explicito = true;
        x.carga_horaria = t.includes('[PÁGINA 5]') ? 50 : 60;
        if (t.includes('[PÁGINA 5]')) x.periodo = 1;
      }
    });
    if (t.includes('[PÁGINA 6]')) r.disciplinas.push(d('MAT101', 'MAT101', 'Cálculo I', 1, true));
    r.disciplinas.filter((x) => x.codigo_externo === 'MAT101' && t.includes('[PÁGINA 6]')).forEach((x) => { x.carga_horaria = 1; });
    return respostaProvedor(url, r);
  };
  const { json } = await executar('ia1-em-blocos', { entrada: { json: prep() }, env: ENV, httpRequest });
  assert.equal(json.erro, null);
  assert.equal(json.resultado.disciplinas.find((x) => x.codigo_externo === 'MAT101').carga_horaria, 60);
});

test('optativa com "período sugerido" na ficha continua optativa no empate', async () => {
  const httpRequest = async ({ url, body }) => {
    const t = trechoDaRequisicao(body);
    const r = extracaoDoTrecho(t);
    // A ficha da optativa (pág. 6) traz "período sugerido 5"; a tabela de optativas (pág. 2) diz optativa
    r.disciplinas.filter((x) => x.codigo_externo === 'DCC810' && t.includes('[PÁGINA 6]')).forEach((x) => { x.periodo = 5; x.periodo_explicito = true; });
    return respostaProvedor(url, r);
  };
  const { json } = await executar('ia1-em-blocos', { entrada: { json: prep() }, env: ENV, httpRequest });
  assert.equal(json.resultado.disciplinas.find((x) => x.codigo_externo === 'DCC810').periodo, null);
});
