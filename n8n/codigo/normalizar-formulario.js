// Normaliza os dados enviados pelo Formulário Web do n8n.
const item = $input.first();
const j = item.json ?? {};
const bin = item.binary ?? {};

const ROTULOS = {
  arquivo: 'Arquivo do PPC (PDF, DOCX, TXT ou MD)',
  cursoId: 'ID do Curso no GradMent (curso_id)',
  anoPeriodo: 'Ano/Período da Matriz',
  nomeCurso: 'Nome do Curso no GradMent (opcional)',
  formatoSaida: 'Formato de saída',
  modoExecucao: 'Modo de execução',
};

const arquivoBin = bin[ROTULOS.arquivo] || Object.values(bin)[0];
if (!arquivoBin) {
  return [{
    json: {
      origem: 'formulario',
      erro: 'Envie o arquivo do PPC (PDF, DOCX, TXT ou Markdown).',
      status: 400,
    },
  }];
}

const cursoIdBruto = String(j[ROTULOS.cursoId] ?? '1').trim();
const cursoId = Number.parseInt(cursoIdBruto, 10);
if (!Number.isInteger(cursoId) || cursoId <= 0) {
  return [{
    json: {
      origem: 'formulario',
      erro: 'O campo curso_id deve ser um número inteiro positivo (ex.: 1).',
      status: 400,
    },
  }];
}

const anoPeriodo = String(j[ROTULOS.anoPeriodo] ?? '').trim() || '2026.1';
const nomeCursoEsperado = String(j[ROTULOS.nomeCurso] ?? '').trim() || null;
const formatoSaida = String(j[ROTULOS.formatoSaida] ?? '');
const modoExecucaoRaw = String(j[ROTULOS.modoExecucao] ?? '');

const gerarPdfs = !formatoSaida.startsWith('Apenas JSON');
const incluirJson = !formatoSaida.startsWith('Apenas os 4 PDFs');

let modoTeste = 'real';
if (modoExecucaoRaw.startsWith('Simular Divergência')) {
  modoTeste = 'simular_divergencia';
} else if (modoExecucaoRaw.startsWith('Simular Consenso')) {
  modoTeste = 'simular_consenso';
}

return [{
  json: {
    origem: 'formulario',
    curso_id: cursoId,
    ano_periodo: anoPeriodo,
    nome_curso_esperado: nomeCursoEsperado,
    gerar_pdfs: gerarPdfs,
    incluir_json: incluirJson,
    modo_teste: modoTeste,
    precisa_extrair: true,
    nome_arquivo: arquivoBin.fileName || 'ppc.pdf',
  },
  binary: {
    ppc_arquivo: arquivoBin,
  },
}];

