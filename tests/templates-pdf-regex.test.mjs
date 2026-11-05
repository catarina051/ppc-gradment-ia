import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executar } from './n8n.mjs';

// Reproduz literalmente as Expressões Regulares dos parsers PHP do GradMent documentadas em formato_ppc_gradment_ia.md!
test('Caminho B: os 4 templates gerados casam 100% com as Regexes de PpcCurriculoPdfParser e SigaaDisciplinasEmentaPdfParser', async () => {
  const entradaConsolidada = {
    json: {
      erro: null,
      origem: 'formulario',
      gerar_pdfs: true,
      incluir_json: true,
      payload_gradment: {
        curso_id: 1,
        preview: {
          curso: { nome_curso: 'Ciência da Computação', ano_periodo: '2026.1' },
          disciplinas: [
            {
              codigo: 'CALC1',
              codigo_externo: 'MAT-101',
              nome: 'Cálculo I',
              periodo: 1,
              // Testa palavra reservada "Eixo" no início do eixo para provar sanitização da Regra 4!
              eixo: 'Eixo de Matemática e Fundamentos',
              carga_horaria: 60,
              ementa: 'Limites, continuidade, derivadas e integrais.',
              plano_curso: 'Limites, continuidade, derivadas e integrais.',
            },
            {
              codigo: 'APCO0',
              codigo_externo: 'DCC-101',
              nome: 'Algoritmos e Programação de Computadores',
              periodo: 1,
              eixo: 'Total de Computação', // Outra palavra reservada ("Total") sanitizada!
              carga_horaria: 60,
              ementa: 'Lógica de programação e funções.',
              plano_curso: 'Lógica de programação e funções.',
            },
            {
              codigo: 'AEDA0',
              codigo_externo: 'DCC-201',
              nome: 'Algoritmos e Estruturas de Dados',
              periodo: 2,
              eixo: 'Total de Computação',
              carga_horaria: 60,
              ementa: 'Listas, pilhas, filas e árvores.',
              plano_curso: 'Listas, pilhas, filas e árvores.',
            },
            {
              codigo: 'TEIA1',
              codigo_externo: 'DCC-810',
              nome: 'Tópicos Especiais em Inteligência Artificial',
              periodo: null,
              eixo: 'Sistemas Inteligentes',
              carga_horaria: 60,
              ementa: 'Aprendizado de máquina supervisionado.',
              plano_curso: 'Aprendizado de máquina supervisionado.',
            },
          ],
          dependencias: [
            { disciplina_codigo: 'AEDA0', dependencia_codigo: 'APCO0', tipo: 'PRE' },
            { disciplina_codigo: 'AEDA0', dependencia_codigo: 'CALC1', tipo: 'CO' },
          ],
          ofertas: [],
          ja_cadastradas: { disciplinas: [], dependencias: [], ofertas: [] },
        },
      },
      relatorio_auditoria: {},
    },
  };

  const out = await executar('gerar-templates-pdf', { entrada: entradaConsolidada });
  const { ppc_txt, ementas_txt, turmas_componente_txt, turmas_ofertadas_txt } = out.json.textos_caminho_b;

  // 1. Regra 1: assertExpectedPdfContent
  const ppcSemAcentoUpper = ppc_txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  assert.ok(ppcSemAcentoUpper.includes('PROJETO PEDAGOGICO DO CURSO'));
  assert.ok(ppcSemAcentoUpper.includes('DISCIPLINA'));
  assert.ok(ppcSemAcentoUpper.includes('SIGLA PPC'));

  // 2. Regra 2: extractCurso
  const matchCurso = ppc_txt.match(/PROJETO PEDAG[ÓO]GICO DO CURSO DE\s+(.+?)\s*[–-]\s*CAMPUS/isu);
  assert.ok(matchCurso, 'extractCurso não casou');
  assert.equal(matchCurso[1].trim(), 'CIÊNCIA DA COMPUTAÇÃO');

  // 3. Regra 3: extractSiglas
  const siglas = [...ppc_txt.matchAll(/Disciplina:\s*(.*?)\s+SIGLA\s+PPC:\s*([A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*)/gisu)];
  assert.equal(siglas.length, 3); // As 3 obrigatórias registradas!

  // 4. Regra 4: extractEixos (e nenhuma linha começando com palavra reservada!)
  const blocoEixos = ppc_txt.match(/Quadro\s+\d+\s*[:–-]\s*Eixos?.*?(?=Quadro\s+\d+\s*[:–-]|$)/isu);
  assert.ok(blocoEixos, 'bloco de eixos não casou');
  const linhasEixos = [...blocoEixos[0].matchAll(/^\s*(\d{1,2})\s+([^\n]{4,120})$/gmu)];
  assert.equal(linhasEixos.length, 2);
  for (const [, , nomeEixo] of linhasEixos) {
    assert.doesNotMatch(nomeEixo, /^(Quadro|Eixo|N[º°o]|Conte[úu]do|Carga|Total)\b/i);
  }

  // 5. Regra 5: extractDisciplinasPorPeriodo
  const quadrosPeriodo = [...ppc_txt.matchAll(/Quadro\s+\d+\s*[–-]\s*Relação de disciplinas do\s+(\d{1,2})[º°]\s+período([\s\S]*?)(?=Quadro\s+\d+\s*[–-]|EMENTÁRIO|$)/giu)];
  assert.equal(quadrosPeriodo.length, 2); // 1º e 2º períodos

  const regexLinha = /\d+\s*\/\s*(\d+)\s+(.+?)\s+(?:X\s+)?(?:X\s+)?(\d+,\d+)\s+(\d+,\d+)(?:\s+((?:[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*|[Nn]ão\s+[hh]á|[Nn]ão|Sem|[\s/,–-])+?))?(?:\s+((?:[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*|[Nn]ão\s+[hh]á|[Nn]ão|Sem|[\s/,–-])+?))?(?=\s+\d+\s*\/\s*\d+\s+|\s+[Pp]eríodo\b|\s+Carga Horária|\s+Total\b|\s+Projeto Pedagógico|$)/gu;
  const totalExtraidasNosQuadros = quadrosPeriodo.reduce(
    (soma, q) => soma + [...q[2].matchAll(regexLinha)].length,
    0,
  );
  assert.equal(totalExtraidasNosQuadros, 3, 'Todas as 3 obrigatórias devem casar na regex estrita de período');

  // 6. ementas_pdf: todas as 4 disciplinas (3 obrigatórias + 1 optativa) com padrão G03<CODIGO>.01
  const codigosEmentas = [...ementas_txt.matchAll(/^G03([A-Z0-9]+)\.01\s+(.+)$/gmu)];
  assert.equal(codigosEmentas.length, 4);
  assert.match(ementas_txt, /01\/01\/2026, 00:00 Sistema Integrado$/);

  // 7. Stubs de turmas
  assert.match(turmas_componente_txt, /^Turmas Encontradas/m);
  assert.match(turmas_ofertadas_txt, /^Turmas Ofertadas/m);
});

