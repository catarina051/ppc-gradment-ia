import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executar } from './n8n.mjs';

test('Regras 3, 4 e 5 do GradMent: corrige códigos sem dígito, remove Obrigatória->Optativa e quebra ciclos DFS', async () => {
  const entrada = {
    json: {
      erro: null,
      curso_id: 2,
      origem: 'api',
      gerar_pdfs: false,
      incluir_json: true,
      houve_divergencia: false,
      modelos_executados: { ia1: { provider: 'gemini', model: 'flash' }, ia2: { provider: 'openai', model: 'mini' }, ia3: null },
      curso_consenso: { nome_curso: 'Sistemas de Informação', ano_periodo: '2026.1' },
      disciplinas_consenso: [
        // Código sem número ("CALC") -> deve virar CALC1 ou CALC01 válido na Regra 4
        { codigo: 'CALC', codigo_externo: 'CALC', nome: 'Cálculo I', periodo: 1, eixo: 'Matemática', carga_horaria: 60, ementa: 'Funções e limites.' },
        // Código iniciando com números ("01PROG") -> deve ganhar prefixo alfabético válido
        { codigo: '01PROG', codigo_externo: '01-PROG', nome: 'Programação Estruturada', periodo: 2, eixo: 'Computação', carga_horaria: 60, ementa: 'Algoritmos em C.' },
        // Optativa (periodo: null)
        { codigo: 'OPTIA1', codigo_externo: 'OPT-IA', nome: 'Tópicos em IA', periodo: null, eixo: 'Optativas', carga_horaria: 60, ementa: 'Redes neurais.' },
      ],
      dependencias_consenso: [
        // Válida: 2º período -> 1º período
        { disciplina_codigo: '01PROG', dependencia_codigo: 'CALC', tipo: 'PRE' },
        // Ciclo proibido (Regra 5): 1º período dependendo de 2º período que já depende dele!
        { disciplina_codigo: 'CALC', dependencia_codigo: '01PROG', tipo: 'PRE' },
        // Proibida pela Regra 3: Obrigatória dependendo de Optativa!
        { disciplina_codigo: '01PROG', dependencia_codigo: 'OPTIA1', tipo: 'PRE' },
      ],
    },
  };

  const res = await executar('consolidar-gradment', { entrada });
  assert.equal(res.json.erro, null);

  const { disciplinas, dependencias, ja_cadastradas, ofertas } = res.json.payload_gradment.preview;
  const regexCodigo = /^[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*$/;

  for (const d of disciplinas) {
    assert.match(d.codigo, regexCodigo, `código inválido gerado: ${d.codigo}`);
    assert.ok(d.codigo.length <= 20);
  }

  // Apenas 1 dependência válida deve restar (sem Obrigatória->Optativa e sem ciclo!)
  assert.equal(dependencias.length, 1);
  const prog = disciplinas.find((d) => d.nome === 'Programação Estruturada');
  const calc = disciplinas.find((d) => d.nome === 'Cálculo I');
  assert.equal(dependencias[0].disciplina_codigo, prog.codigo);
  assert.equal(dependencias[0].dependencia_codigo, calc.codigo);
  assert.ok(prog.plano_curso.includes('Tópicos em IA'));

  // Seção 3.2: ja_cadastradas sempre vazio para o persist() do GradMent funcionar
  assert.deepEqual(ofertas, []);
  assert.deepEqual(ja_cadastradas, { disciplinas: [], dependencias: [], ofertas: [] });
  assert.ok(res.json.relatorio_auditoria.correcoes_invariantes_gradment.length >= 3);
});

test('Regra 2 do GradMent: barra disciplina obrigatória com carga_horaria <= 0', async () => {
  const res = await executar('consolidar-gradment', {
    entrada: {
      json: {
        erro: null,
        curso_id: 1,
        origem: 'api',
        curso_consenso: { nome_curso: 'Engenharia', ano_periodo: '2026.1' },
        disciplinas_consenso: [
          { codigo: 'CALC1', codigo_externo: 'CALC1', nome: 'Cálculo I', periodo: 1, eixo: 'Mat', carga_horaria: 0, ementa: 'Limites.' },
        ],
        dependencias_consenso: [],
      },
    },
  });
  assert.equal(res.json.status, 422);
  assert.match(res.json.erro, /Regra 2/);
});

