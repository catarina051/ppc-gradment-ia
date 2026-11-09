import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { RAIZ, executar, executarTodos } from './n8n.mjs';

const samplePpc = fs.readFileSync(join(RAIZ, 'samples', 'ppc-ciencia-computacao.txt'), 'utf8');

test('fluxo em consenso: códigos gerados diferentes (TCC01 vs TCCG1) NÃO disparam falso-positivo na 3ª IA', async () => {
  const norm = await executar('normalizar-api', {
    entrada: {
      json: {
        curso_id: 7,
        ano_periodo: '2026.1',
        texto_ppc: samplePpc,
        modo_teste: 'simular_consenso',
      },
    },
  });
  assert.equal(norm.json.erro, undefined);

  const prep = await executar('preparar-ias', { entrada: norm, env: {} });
  assert.equal(prep.json.simular, true);
  assert.equal(prep.json.cenario_simulacao, 'consenso');

  const simuladas = await executarTodos('simular-analises', { entradas: [prep] });
  assert.equal(simuladas.length, 2);

  const comp = await executar('comparar-divergencias', {
    entradas: simuladas,
    nos: { 'Preparar IAs': prep },
  });
  assert.equal(comp.json.erro, null);
  assert.equal(comp.json.houve_divergencia, false);
  assert.equal(comp.json.total_divergencias, 0);
  assert.equal(comp.json.disciplinas_consenso.length, 10);
  assert.equal(comp.json.dependencias_consenso.length, 11);

  const final = await executar('consolidar-gradment', { entrada: comp });
  assert.equal(final.json.erro, null);
  assert.equal(final.json.payload_gradment.curso_id, 7);
  assert.equal(final.json.relatorio_auditoria.status_consenso, 'CONSENSO_DIRETO_IA1_IA2');
  assert.equal(final.json.relatorio_auditoria.arbitragem_ia3.acionada, false);
  assert.equal(final.json.payload_gradment.preview.disciplinas.length, 10);
});

test('fluxo com divergência: detecta diferenças em carga horária, optativa ausente e PRE vs CO, acionando a 3ª IA Juíza', async () => {
  const norm = await executar('normalizar-api', {
    entrada: {
      json: {
        curso_id: 3,
        ano_periodo: '2026.1',
        texto_ppc: samplePpc,
        modo_teste: 'simular_divergencia',
      },
    },
  });
  const prep = await executar('preparar-ias', { entrada: norm, env: {} });
  const simuladas = await executarTodos('simular-analises', { entradas: [prep] });

  const comp = await executar('comparar-divergencias', {
    entradas: simuladas,
    nos: { 'Preparar IAs': prep },
  });
  assert.equal(comp.json.houve_divergencia, true);
  assert.equal(comp.json.divergencias.disciplinas.length, 2); // DCC102 (30h vs 60h) + DCC820 ausente na IA 2
  assert.equal(comp.json.divergencias.dependencias.length, 2); // DCC202->DCC201 (CO vs PRE) + DCC820->DCC202 exclusiva IA 1

  const juizaSim = await executar('simular-juiza', {
    entrada: comp,
    nos: { 'Comparar IAs e Detectar Divergências': comp },
  });
  const posJuiza = await executar('aplicar-juiza', {
    entrada: juizaSim,
    nos: { 'Comparar IAs e Detectar Divergências': comp },
  });
  assert.equal(posJuiza.json.erro, null);
  assert.equal(posJuiza.json.auditoria_ia3.acionada, true);

  const final = await executar('consolidar-gradment', { entrada: posJuiza });
  assert.equal(final.json.erro, null);
  assert.equal(final.json.relatorio_auditoria.status_consenso, 'DESEMPATADO_PELA_3A_IA');
  assert.equal(final.json.payload_gradment.preview.disciplinas.length, 10);
  const lab = final.json.payload_gradment.preview.disciplinas.find((d) => d.codigo === 'DCC102');
  assert.equal(lab.carga_horaria, 30);
  const depBd = final.json.payload_gradment.preview.dependencias.find(
    (d) => d.disciplina_codigo === 'DCC202' && d.dependencia_codigo === 'DCC201',
  );
  assert.equal(depBd.tipo, 'CO');
});

test('proteção de ordinais: Cálculo I nunca é pareado com Cálculo II mesmo se código externo faltar', async () => {
  const prep = {
    json: {
      curso_id: 1,
      origem: 'api',
      ano_periodo: '2026.1',
      simular: true,
      ia3_config: { provider: 'simulado', model: 'simulado' },
    },
  };
  const ia1 = {
    json: {
      slot: 'ia1',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      erro: null,
      resultado: {
        e_ppc_valido: true,
        curso: { nome_curso: 'Engenharia', ano_periodo: '2026.1' },
        disciplinas: [{ codigo: 'CALC1', codigo_externo: null, nome: 'Cálculo 1', periodo: 1, eixo: 'Mat', carga_horaria: 60, ementa: 'Limites e derivadas reais.' }],
        dependencias: [],
      },
    },
  };
  const ia2 = {
    json: {
      slot: 'ia2',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      erro: null,
      resultado: {
        e_ppc_valido: true,
        curso: { nome_curso: 'Engenharia', ano_periodo: '2026.1' },
        disciplinas: [{ codigo: 'CALC2', codigo_externo: null, nome: 'Cálculo II', periodo: 1, eixo: 'Mat', carga_horaria: 60, ementa: 'Integrais múltiplas e séries.' }],
        dependencias: [],
      },
    },
  };
  const comp = await executar('comparar-divergencias', {
    entradas: [ia1, ia2],
    nos: { 'Preparar IAs': prep },
  });
  assert.equal(comp.json.disciplinas_consenso.length, 0);
  assert.equal(comp.json.divergencias.disciplinas.length, 2);
});


test('juíza não reescreve campos em que IA 1 e IA 2 concordam', async () => {
  const div = {
    id_divergencia: 'DISC_01', motivo: 'texto da ementa substancialmente divergente', codigo_sugerido: 'AEDA0',
    ia1: { codigo: 'AEDA0', codigo_externo: 'AEDA0', nome: 'Algoritmos e Estruturas de Dados', periodo: 2, eixo: 'Computação', carga_horaria: 60, ementa: 'Listas e pilhas.' },
    ia2: { codigo: 'AEDA0', codigo_externo: 'AEDA0', nome: 'Algoritmos e Estruturas de Dados', periodo: 2, eixo: 'Computação', carga_horaria: 60, ementa: 'Árvores e filas.' },
  };
  const comp = {
    curso_consenso: { nome_curso: 'Eng. Comp', ano_periodo: '2026.1' }, disciplinas_consenso: [], dependencias_consenso: [],
    divergencias: { disciplinas: [div], dependencias: [] }, modelos_executados: { ia3: { provider: 'gemini', model: 'x' } }, ia3: { provider: 'gemini' },
  };
  const julgamento = (acao) => ({
    resumo_auditoria: '', curso_final: {},
    decisoes_disciplinas: [{ id_divergencia: 'DISC_01', acao, pagina_evidencia: 'p. 10', justificativa: '',
      disciplina: { ...div.ia1, periodo: null, carga_horaria: 50, ementa: 'Listas, pilhas, árvores e filas.' } }],
    decisoes_dependencias: [],
  });
  for (const acao of ['ADOTAR_IA1', 'CORRIGIR_PELO_PPC']) {
    const { json } = await executar('aplicar-juiza', {
      entrada: { json: { simulado_juiza: true, decisao_juiza: julgamento(acao) } },
      nos: { 'Comparar IAs e Detectar Divergências': { json: comp } },
    });
    const d = json.disciplinas_resolvidas.find((x) => x.codigo === 'AEDA0');
    assert.equal(d.periodo, 2, `${acao}: período travado pelo consenso`);
    assert.equal(d.carga_horaria, 60, `${acao}: carga horária travada pelo consenso`);
  }
});
