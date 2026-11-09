// Tela de revisão humana (montar-pagina): precisa carregar dentro do formulário do n8n, que insere a
// resposta via innerHTML (scripts não rodam), então tudo vai num <iframe srcdoc> com os dados embutidos.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { executar, RAIZ } from './n8n.mjs';

const execucao = JSON.parse(readFileSync(join(RAIZ, 'avaliacao', 'execucoes', 'cefet-engcomp-03.json'), 'utf8'));
const entrada = {
  json: {
    payload_gradment: execucao.payload_gradment,
    relatorio_auditoria: execucao.relatorio_auditoria,
    incluir_json: true,
  },
};

function desescapar(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

test('tela de revisão vai num iframe srcdoc e embute payload + auditoria intactos', async () => {
  const { json } = await executar('montar-pagina', { entrada });
  assert.equal(json.status, 200);
  const m = json.resposta.match(/<iframe[^>]*srcdoc="([^"]*)"/);
  assert.ok(m, 'resposta deve conter um iframe srcdoc');
  const doc = desescapar(m[1]);
  assert.match(doc, /<script>/, 'o documento interno precisa do script da tela');
  const dados = doc.match(/<script id="dados" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(dados, 'dados embutidos ausentes');
  const d = JSON.parse(dados[1]);
  assert.equal(d.payload.preview.disciplinas.length, execucao.payload_gradment.preview.disciplinas.length);
  assert.equal(d.aud.divergencias_iniciais.disciplinas.length, execucao.relatorio_auditoria.divergencias_iniciais.disciplinas.length);
});

test('textos do PPC com "</script>" não quebram a página', async () => {
  const copia = JSON.parse(JSON.stringify(entrada));
  copia.json.payload_gradment.preview.disciplinas[0].ementa = 'ataque </script><script>alert(1)</script>';
  const { json } = await executar('montar-pagina', { entrada: copia });
  const doc = desescapar(json.resposta.match(/srcdoc="([^"]*)"/)[1]);
  assert.equal((doc.match(/<\/script>/g) || []).length, 2, 'só os dois </script> legítimos podem existir');
});

test('resultado simulado mostra o alerta de resultado fictício', async () => {
  const copia = JSON.parse(JSON.stringify(entrada));
  copia.json.relatorio_auditoria.simulado = true;
  const { json } = await executar('montar-pagina', { entrada: copia });
  assert.match(desescapar(json.resposta), /A\.simulado/);
  assert.match(desescapar(json.resposta), /Resultado FICTÍCIO/);
});
