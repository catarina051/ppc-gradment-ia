// Gera workflows/ppc-gradment.json a partir de n8n/codigo/*.js.
// Sempre que editar qualquer arquivo em n8n/codigo/, regenere o workflow com:
//   node n8n/montar-workflow.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const compartilhado = readFileSync(join(AQUI, 'codigo', '_compartilhado.js'), 'utf8');

function codigo(nome) {
  const bruto = readFileSync(join(AQUI, 'codigo', `${nome}.js`), 'utf8');
  if (bruto.startsWith('// @usa-compartilhado')) {
    return `${compartilhado}\n\n${bruto}`;
  }
  return bruto;
}

const nodes = [];
const connections = {};
let seq = 0;

function no(name, type, typeVersion, position, parameters, extra = {}) {
  nodes.push({
    id: `pg-${String(++seq).padStart(2, '0')}`,
    name,
    type,
    typeVersion,
    position,
    parameters,
    ...extra,
  });
}

const code = (name, arquivo, position) =>
  no(name, 'n8n-nodes-base.code', 2, position, { jsCode: codigo(arquivo) });

function se(name, position, condicao) {
  no(name, 'n8n-nodes-base.if', 2.2, position, {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: `${name}-cond`, ...condicao }],
      combinator: 'and',
    },
    options: {},
  });
}

const semErro = {
  leftValue: '={{ $json.erro }}',
  rightValue: '',
  operator: { type: 'string', operation: 'empty', singleValue: true },
};
const igual = (campo, valor) => ({
  leftValue: `={{ $json.${campo} }}`,
  rightValue: valor,
  operator: { type: 'string', operation: 'equals' },
});
const verdadeiro = (campo) => ({
  leftValue: `={{ $json.${campo} }}`,
  rightValue: '',
  operator: { type: 'boolean', operation: 'true', singleValue: true },
});

const respostaJson = {
  response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } },
};
const continuar = { onError: 'continueRegularOutput' };

// Nó HTTP multi-provedor (Gemini, OpenAI, Anthropic, OpenRouter) sem gravar chaves no JSON do workflow
function httpIa(name, position, slotCampo) {
  const exprHeaders = `={{ JSON.stringify($json.${slotCampo}.provider === 'gemini' ? { 'x-goog-api-key': $env[$json.${slotCampo}.env_key] || '' } : $json.${slotCampo}.provider === 'anthropic' ? { 'x-api-key': $env[$json.${slotCampo}.env_key] || '', 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' } : Object.assign({ Authorization: 'Bearer ' + ($env[$json.${slotCampo}.env_key] || '') }, $json.${slotCampo}.provider === 'openrouter' ? { 'HTTP-Referer': 'http://localhost:5680', 'X-Title': 'PPC GradMent IA' } : {})) }}`;
  no(name, 'n8n-nodes-base.httpRequest', 4.2, position, {
    method: 'POST',
    url: `={{ $json.${slotCampo}.url }}`,
    sendHeaders: true,
    specifyHeaders: 'json',
    jsonHeaders: exprHeaders,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ JSON.stringify($json.${slotCampo}.body) }}`,
    options: { ...respostaJson, timeout: 240000 },
  }, continuar);
}

function gotenbergHtml(name, position, campoHtmlBin, campoPdfSaida) {
  no(name, 'n8n-nodes-base.httpRequest', 4.2, position, {
    method: 'POST',
    url: 'http://gotenberg:3000/forms/chromium/convert/html',
    sendBody: true,
    contentType: 'multipart-form-data',
    bodyParameters: {
      parameters: [
        { parameterType: 'formBinaryData', name: 'files', inputDataFieldName: campoHtmlBin },
        { name: 'preferCssPageSize', value: 'true' },
        { name: 'printBackground', value: 'true' },
      ],
    },
    options: {
      response: { response: { responseFormat: 'file', outputPropertyName: campoPdfSaida } },
      timeout: 60000,
    },
  }, continuar);
}

function liga(origem, destino, saidaOrigem = 0, entradaDestino = 0) {
  connections[origem] ??= { main: [] };
  const main = connections[origem].main;
  while (main.length <= saidaOrigem) main.push([]);
  main[saidaOrigem].push({ node: destino, type: 'main', index: entradaDestino });
}

// =============================================================================
// 1. GATILHOS (Formulário Web + API REST Webhook)
// =============================================================================
no('Formulário PPC', 'n8n-nodes-base.formTrigger', 2.1, [0, 0], {
  path: 'ppc-gradment',
  formTitle: 'Conversor de PPC para o GradMent (Dupla IA + Juíza)',
  formDescription: 'Envie o PPC de qualquer universidade (PDF, DOCX ou TXT). Duas IAs analisam o documento de forma independente e, se houver qualquer divergência, uma 3ª IA (Juíza) audita o PPC e consolida o resultado 100% compatível com o GradMent.',
  formFields: {
    values: [
      {
        fieldLabel: 'Arquivo do PPC (PDF, DOCX, TXT ou MD)',
        fieldType: 'file',
        acceptFileTypes: '.pdf,.docx,.txt,.md',
        multipleFiles: false,
        requiredField: true,
      },
      {
        fieldLabel: 'ID do Curso no GradMent (curso_id)',
        fieldType: 'text',
        placeholder: '1',
        requiredField: true,
      },
      {
        fieldLabel: 'Ano/Período da Matriz',
        fieldType: 'text',
        placeholder: '2026.1',
        requiredField: true,
      },
      {
        fieldLabel: 'Nome do Curso no GradMent (opcional)',
        fieldType: 'text',
        placeholder: 'Ex.: Ciência da Computação (deixe vazio para extrair do PPC)',
      },
      {
        fieldLabel: 'Formato de saída',
        fieldType: 'dropdown',
        requiredField: true,
        fieldOptions: {
          values: [
            { option: 'JSON Canônico (API) + 4 PDFs Canônicos (Upload Web)' },
            { option: 'Apenas JSON Canônico (POST /curriculo/importar/confirmar)' },
            { option: 'Apenas os 4 PDFs Canônicos (Upload Web)' },
          ],
        },
      },
      {
        fieldLabel: 'Modo de execução',
        fieldType: 'dropdown',
        requiredField: true,
        fieldOptions: {
          values: [
            { option: 'Automático (usar IAs configuradas no .env)' },
            { option: 'Simular Consenso Direto (teste sem gastar créditos)' },
            { option: 'Simular Divergência + Desempate na 3ª IA (teste completo)' },
          ],
        },
      },
    ],
  },
  responseMode: 'responseNode',
  options: { appendAttribution: false, buttonLabel: 'Converter PPC para o GradMent' },
}, { webhookId: 'a81d4e10-1b2c-4f80-9a01-000000000001' });

no('API Converter PPC', 'n8n-nodes-base.webhook', 2.1, [0, 320], {
  httpMethod: 'POST',
  path: 'converter-ppc',
  responseMode: 'responseNode',
  options: {},
}, { webhookId: 'a81d4e10-1b2c-4f80-9a01-000000000002' });

// =============================================================================
// 2. NORMALIZAÇÃO E EXTRAÇÃO DE TEXTO/OCR DO PPC
// =============================================================================
code('Normalizar formulário', 'normalizar-formulario', [240, 0]);
code('Normalizar API', 'normalizar-api', [240, 320]);
se('Entrada ok?', [480, 160], semErro);
se('Precisa extrair arquivo?', [720, 100], verdadeiro('precisa_extrair'));

no('Extrair texto do PPC', 'n8n-nodes-base.httpRequest', 4.2, [960, 0], {
  method: 'POST',
  url: "={{ 'http://extrator:8000/extrair?nome=' + encodeURIComponent($json.nome_arquivo || 'ppc.pdf') }}",
  sendBody: true,
  contentType: 'binaryData',
  inputDataFieldName: 'ppc_arquivo',
  options: { ...respostaJson, timeout: 120000 },
}, continuar);

code('Pós-extração', 'pos-extracao', [1200, 0]);
se('Extração ok?', [1440, 0], semErro);
code('Preparar IAs', 'preparar-ias', [1680, 160]);
se('Texto do PPC ok?', [1920, 160], semErro);

// =============================================================================
// 3. DUPLA ANÁLISE INDEPENDENTE (IA 1 + IA 2 EM PARALELO)
// =============================================================================
se('Modo demonstração?', [2160, 160], verdadeiro('simular'));
code('Simular IA 1 e IA 2', 'simular-analises', [2420, -140]);

httpIa('IA 1 — Analisar PPC', [2420, 120], 'ia1');
code('Parsear IA 1', 'parsear-ia1', [2660, 120]);

httpIa('IA 2 — Analisar PPC', [2420, 340], 'ia2');
code('Parsear IA 2', 'parsear-ia2', [2660, 340]);

no('Unir Análises (IA 1 + IA 2)', 'n8n-nodes-base.merge', 3.2, [2900, 220], {
  mode: 'append',
  numberInputs: 2,
});

// =============================================================================
// 4. DETECÇÃO DE DIVERGÊNCIA E 3ª IA (JUÍZA DE DESEMPATE)
// =============================================================================
code('Comparar IAs e Detectar Divergências', 'comparar-divergencias', [3160, 160]);
se('Leitura das IAs ok?', [3400, 160], semErro);
se('Houve divergência?', [3640, 120], verdadeiro('houve_divergencia'));

se('Juíza simulada?', [3880, -40], verdadeiro('simular_ia3'));
code('Simular IA 3 (Juíza)', 'simular-juiza', [4120, -160]);
httpIa('IA 3 — Juíza de Divergências', [4120, 40], 'ia3');
code('Aplicar Decisão da IA 3', 'aplicar-juiza', [4380, -40]);
se('Juíza ok?', [4620, -40], semErro);

// =============================================================================
// 5. CONSOLIDAÇÃO DAS 7 REGRAS DO GRADMENT + GERAÇÃO OPCIONAL DOS 4 PDFs
// =============================================================================
code('Consolidar e Validar GradMent', 'consolidar-gradment', [4860, 160]);
se('Validação GradMent ok?', [5100, 160], semErro);
se('Gerar os 4 PDFs (Caminho B)?', [5340, 120], verdadeiro('gerar_pdfs'));

code('Gerar HTMLs Canônicos (4 PDFs)', 'gerar-templates-pdf', [5580, -80]);
gotenbergHtml('Gotenberg: ppc_pdf', [5840, -320], 'html_ppc', 'ppc_pdf');
gotenbergHtml('Gotenberg: ementas_pdf', [5840, -160], 'html_ementas', 'ementas_pdf');
gotenbergHtml('Gotenberg: turmas_componente_pdf', [5840, 0], 'html_turmas_comp', 'turmas_componente_pdf');
gotenbergHtml('Gotenberg: turmas_ofertadas_pdf', [5840, 160], 'html_turmas_ofert', 'turmas_ofertadas_pdf');

no('Unir 4 PDFs', 'n8n-nodes-base.merge', 3.2, [6100, -80], {
  mode: 'append',
  numberInputs: 4,
});
code('Empacotar PDFs', 'empacotar-pdfs', [6340, -80]);
se('PDFs ok?', [6580, -80], semErro);

// =============================================================================
// 6. RESPOSTA FINAL (DASHBOARD HTML OU PAYLOAD API REST)
// =============================================================================
se('Veio do formulário?', [6820, 120], igual('origem', 'formulario'));
code('Montar página', 'montar-pagina', [7060, 0]);
code('Resposta API', 'resposta-api', [7060, 220]);
code('Formatar erro', 'formatar-erro', [7060, 460]);

no('Responder', 'n8n-nodes-base.respondToWebhook', 1.4, [7320, 220], {
  respondWith: 'text',
  responseBody: '={{ $json.resposta }}',
  options: {
    responseCode: '={{ $json.status }}',
    responseHeaders: {
      entries: [{ name: 'Content-Type', value: '={{ $json.content_type }}' }],
    },
  },
});

// =============================================================================
// CONEXÕES DO GRAFO
// =============================================================================
liga('Formulário PPC', 'Normalizar formulário');
liga('API Converter PPC', 'Normalizar API');
liga('Normalizar formulário', 'Entrada ok?');
liga('Normalizar API', 'Entrada ok?');

liga('Entrada ok?', 'Precisa extrair arquivo?', 0);
liga('Entrada ok?', 'Formatar erro', 1);

liga('Precisa extrair arquivo?', 'Extrair texto do PPC', 0);
liga('Precisa extrair arquivo?', 'Preparar IAs', 1);

liga('Extrair texto do PPC', 'Pós-extração');
liga('Pós-extração', 'Extração ok?');
liga('Extração ok?', 'Preparar IAs', 0);
liga('Extração ok?', 'Formatar erro', 1);

liga('Preparar IAs', 'Texto do PPC ok?');
liga('Texto do PPC ok?', 'Modo demonstração?', 0);
liga('Texto do PPC ok?', 'Formatar erro', 1);

liga('Modo demonstração?', 'Simular IA 1 e IA 2', 0);
liga('Modo demonstração?', 'IA 1 — Analisar PPC', 1);
liga('Modo demonstração?', 'IA 2 — Analisar PPC', 1);

liga('Simular IA 1 e IA 2', 'Comparar IAs e Detectar Divergências');
liga('IA 1 — Analisar PPC', 'Parsear IA 1');
liga('IA 2 — Analisar PPC', 'Parsear IA 2');
liga('Parsear IA 1', 'Unir Análises (IA 1 + IA 2)', 0, 0);
liga('Parsear IA 2', 'Unir Análises (IA 1 + IA 2)', 0, 1);
liga('Unir Análises (IA 1 + IA 2)', 'Comparar IAs e Detectar Divergências');

liga('Comparar IAs e Detectar Divergências', 'Leitura das IAs ok?');
liga('Leitura das IAs ok?', 'Houve divergência?', 0);
liga('Leitura das IAs ok?', 'Formatar erro', 1);

liga('Houve divergência?', 'Juíza simulada?', 0);
liga('Houve divergência?', 'Consolidar e Validar GradMent', 1);

liga('Juíza simulada?', 'Simular IA 3 (Juíza)', 0);
liga('Juíza simulada?', 'IA 3 — Juíza de Divergências', 1);
liga('Simular IA 3 (Juíza)', 'Aplicar Decisão da IA 3');
liga('IA 3 — Juíza de Divergências', 'Aplicar Decisão da IA 3');

liga('Aplicar Decisão da IA 3', 'Juíza ok?');
liga('Juíza ok?', 'Consolidar e Validar GradMent', 0);
liga('Juíza ok?', 'Formatar erro', 1);

liga('Consolidar e Validar GradMent', 'Validação GradMent ok?');
liga('Validação GradMent ok?', 'Gerar os 4 PDFs (Caminho B)?', 0);
liga('Validação GradMent ok?', 'Formatar erro', 1);

liga('Gerar os 4 PDFs (Caminho B)?', 'Gerar HTMLs Canônicos (4 PDFs)', 0);
liga('Gerar os 4 PDFs (Caminho B)?', 'Veio do formulário?', 1);

liga('Gerar HTMLs Canônicos (4 PDFs)', 'Gotenberg: ppc_pdf');
liga('Gerar HTMLs Canônicos (4 PDFs)', 'Gotenberg: ementas_pdf');
liga('Gerar HTMLs Canônicos (4 PDFs)', 'Gotenberg: turmas_componente_pdf');
liga('Gerar HTMLs Canônicos (4 PDFs)', 'Gotenberg: turmas_ofertadas_pdf');

liga('Gotenberg: ppc_pdf', 'Unir 4 PDFs', 0, 0);
liga('Gotenberg: ementas_pdf', 'Unir 4 PDFs', 0, 1);
liga('Gotenberg: turmas_componente_pdf', 'Unir 4 PDFs', 0, 2);
liga('Gotenberg: turmas_ofertadas_pdf', 'Unir 4 PDFs', 0, 3);

liga('Unir 4 PDFs', 'Empacotar PDFs');
liga('Empacotar PDFs', 'PDFs ok?');
liga('PDFs ok?', 'Veio do formulário?', 0);
liga('PDFs ok?', 'Formatar erro', 1);

liga('Veio do formulário?', 'Montar página', 0);
liga('Veio do formulário?', 'Resposta API', 1);

liga('Montar página', 'Responder');
liga('Resposta API', 'Responder');
liga('Formatar erro', 'Responder');

const workflow = {
  id: 'pgIaGradmentPpc1',
  name: 'PPC para GradMent (Dupla IA + Juíza)',
  nodes,
  connections,
  settings: {
    executionOrder: 'v1',
    saveDataSuccessExecution: 'none',
    saveDataErrorExecution: 'none',
    saveManualExecutions: false,
    saveExecutionProgress: false,
  },
  pinData: {},
  active: false,
};

const dirWorkflows = join(AQUI, '..', 'workflows');
mkdirSync(dirWorkflows, { recursive: true });
writeFileSync(join(dirWorkflows, 'ppc-gradment.json'), `${JSON.stringify(workflow, null, 2)}\n`);
console.log(`workflow gerado com sucesso: ${nodes.length} nós -> workflows/ppc-gradment.json`);

