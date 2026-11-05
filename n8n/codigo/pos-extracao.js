// Une o retorno do serviço Python de extração (PDF/DOCX/OCR) com o contexto de entrada.
const entrada = $('Entrada ok?').first().json;
const resp = $input.first().json ?? {};
const status = resp.statusCode ?? 200;
const corpo = resp.body ?? resp;

if (status >= 400 || corpo.erro || !corpo.texto) {
  return [{
    json: {
      ...entrada,
      erro: corpo.erro || `Falha ao extrair texto do arquivo (${entrada.nome_arquivo}).`,
      status: status >= 400 ? status : 422,
    },
  }];
}

return [{
  json: {
    ...entrada,
    texto_ppc: corpo.texto,
    extracao: {
      formato: corpo.formato || 'desconhecido',
      paginas: corpo.paginas || 1,
      paginas_ocr: corpo.paginas_ocr || 0,
      recortado_por_tamanho: Boolean(corpo.recortado_por_tamanho),
      caracteres: corpo.caracteres || corpo.texto.length,
    },
  },
}];

