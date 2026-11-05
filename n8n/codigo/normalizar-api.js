// Normaliza chamadas à API REST (POST /webhook/converter-ppc) em JSON ou multipart/form-data.
const item = $input.first();
const raw = item.json ?? {};
const body = raw.body && typeof raw.body === 'object' ? raw.body : raw;
const bin = item.binary ?? {};

const cursoId = Number.parseInt(String(body.curso_id ?? '1'), 10);
if (!Number.isInteger(cursoId) || cursoId <= 0) {
  return [{
    json: {
      origem: 'api',
      erro: 'Parâmetro curso_id inválido: informe um inteiro positivo.',
      status: 400,
    },
  }];
}

const anoPeriodo = String(body.ano_periodo ?? '2026.1').trim() || '2026.1';
const nomeCursoEsperado = body.nome_curso_esperado ? String(body.nome_curso_esperado).trim() : null;
const gerarPdfs = body.gerar_pdfs !== undefined ? Boolean(body.gerar_pdfs) && String(body.gerar_pdfs) !== 'false' : false;
const incluirJson = body.incluir_json !== undefined ? Boolean(body.incluir_json) && String(body.incluir_json) !== 'false' : true;

let modoTeste = 'real';
if (body.modo_teste === 'simular_divergencia' || body.simular_divergencia === true || body.simular_divergencia === 'true') {
  modoTeste = 'simular_divergencia';
} else if (body.modo_teste === 'simular_consenso' || body.simular === true || body.simular === 'true') {
  modoTeste = 'simular_consenso';
}

const binEntrada = bin.ppc || bin.file || bin.arquivo || bin.data || Object.values(bin)[0];

if (binEntrada) {
  return [{
    json: {
      origem: 'api',
      curso_id: cursoId,
      ano_periodo: anoPeriodo,
      nome_curso_esperado: nomeCursoEsperado,
      gerar_pdfs: gerarPdfs,
      incluir_json: incluirJson,
      modo_teste: modoTeste,
      precisa_extrair: true,
      nome_arquivo: binEntrada.fileName || body.nome_arquivo || 'ppc.pdf',
    },
    binary: {
      ppc_arquivo: binEntrada,
    },
  }];
}

if (typeof body.arquivo_b64 === 'string' && body.arquivo_b64.trim().length > 0) {
  const nomeArquivo = String(body.nome_arquivo || 'ppc.pdf');
  const buf = Buffer.from(body.arquivo_b64.trim(), 'base64');
  const ppcArquivo = await this.helpers.prepareBinaryData(buf, nomeArquivo, 'application/octet-stream');
  return [{
    json: {
      origem: 'api',
      curso_id: cursoId,
      ano_periodo: anoPeriodo,
      nome_curso_esperado: nomeCursoEsperado,
      gerar_pdfs: gerarPdfs,
      incluir_json: incluirJson,
      modo_teste: modoTeste,
      precisa_extrair: true,
      nome_arquivo: nomeArquivo,
    },
    binary: {
      ppc_arquivo: ppcArquivo,
    },
  }];
}

if (typeof body.texto_ppc === 'string' && body.texto_ppc.trim().length >= 50) {
  const txt = body.texto_ppc.trim();
  return [{
    json: {
      origem: 'api',
      curso_id: cursoId,
      ano_periodo: anoPeriodo,
      nome_curso_esperado: nomeCursoEsperado,
      gerar_pdfs: gerarPdfs,
      incluir_json: incluirJson,
      modo_teste: modoTeste,
      precisa_extrair: false,
      nome_arquivo: body.nome_arquivo || 'texto-direto.txt',
      extracao: {
        formato: 'txt_api',
        paginas: 1,
        paginas_ocr: 0,
        recortado_por_tamanho: false,
        caracteres: txt.length,
      },
      texto_ppc: txt.includes('[PÁGINA') ? txt : `--- [PÁGINA 1] ---\n${txt}`,
    },
  }];
}

return [{
  json: {
    origem: 'api',
    erro: 'Envie o PPC como arquivo multipart (campo "ppc"), "arquivo_b64" ou "texto_ppc" (mín. 50 caracteres).',
    status: 400,
  },
}];

