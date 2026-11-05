import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { RAIZ, codigo } from './n8n.mjs';

const workflow = JSON.parse(readFileSync(join(RAIZ, 'workflows', 'ppc-gradment.json'), 'utf8'));

test('workflows/ppc-gradment.json está sincronizado com n8n/codigo/*.js', () => {
  const scriptGerador = readFileSync(join(RAIZ, 'n8n', 'montar-workflow.mjs'), 'utf8');
  for (const [, nomeNo, arquivo] of scriptGerador.matchAll(/code\('([^']+)', '([^']+)'/g)) {
    const no = workflow.nodes.find((n) => n.name === nomeNo);
    assert.ok(no, `nó "${nomeNo}" ausente no JSON exportado`);
    assert.equal(no.parameters.jsCode, codigo(arquivo), `nó "${nomeNo}" desatualizado`);
  }
});

test('rótulos do Formulário PPC batem exatamente com normalizar-formulario.js', () => {
  const form = workflow.nodes.find((n) => n.type === 'n8n-nodes-base.formTrigger');
  const rotulosForm = form.parameters.formFields.values.map((f) => f.fieldLabel).filter(Boolean);
  const bloco = codigo('normalizar-formulario').match(/const ROTULOS = \{([\s\S]*?)\};/)[1];
  const esperados = [...bloco.matchAll(/\w+: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(esperados.length, 6);
  for (const r of esperados) {
    assert.ok(rotulosForm.includes(r), `rótulo "${r}" ausente no Form Trigger`);
  }
});

test('todas as conexões apontam para nós existentes e os nós Merge recebem todas as entradas', () => {
  const nomesNos = new Set(workflow.nodes.map((n) => n.name));
  const entradasRecebidas = new Map();

  for (const [origem, conns] of Object.entries(workflow.connections)) {
    assert.ok(nomesNos.has(origem), `origem inexistente: ${origem}`);
    for (const ramo of conns.main) {
      for (const destino of ramo) {
        assert.ok(nomesNos.has(destino.node), `destino inexistente: ${destino.node}`);
        const Chave = `${destino.node}:${destino.index}`;
        entradasRecebidas.set(Chave, (entradasRecebidas.get(Chave) || 0) + 1);
      }
    }
  }

  // Merge IA 1 + IA 2 deve receber entradas nos índices 0 e 1
  assert.equal(entradasRecebidas.get('Unir Análises (IA 1 + IA 2):0'), 1);
  assert.equal(entradasRecebidas.get('Unir Análises (IA 1 + IA 2):1'), 1);

  // Merge 4 PDFs deve receber entradas nos índices 0, 1, 2 e 3
  for (let idx = 0; idx < 4; idx++) {
    assert.equal(entradasRecebidas.get(`Unir 4 PDFs:${idx}`), 1, `entrada ${idx} ausente em Unir 4 PDFs`);
  }
});

test('nenhuma credencial ou chave secreta embutida no JSON do workflow', () => {
  const bruto = JSON.stringify(workflow);
  assert.ok(!/AIza[0-9A-Za-z_-]{20,}/.test(bruto));
  assert.ok(!/sk-[0-9A-Za-z_-]{20,}/.test(bruto));
  assert.ok(!workflow.nodes.some((n) => n.credentials));
});

