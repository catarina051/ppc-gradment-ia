// Recolhe os 4 PDFs gerados em paralelo pelo Gotenberg e anexa em base64 ao resultado consolidado.
const base = $('Gerar HTMLs Canônicos (4 PDFs)').first().json;
const itens = $input.all();

const CHAVES_ESPERADAS = [
  'ppc_pdf',
  'ementas_pdf',
  'turmas_componente_pdf',
  'turmas_ofertadas_pdf',
];

const pdfsB64 = {};

for (let i = 0; i < itens.length; i++) {
  const binObj = itens[i].binary || {};
  for (const chave of CHAVES_ESPERADAS) {
    if (binObj[chave]) {
      const buf = await this.helpers.getBinaryDataBuffer(i, chave);
      pdfsB64[chave] = buf.toString('base64');
    }
  }
}

const faltando = CHAVES_ESPERADAS.filter((k) => !pdfsB64[k]);
if (faltando.length > 0) {
  return [{
    json: {
      ...base,
      erro: `Falha ao renderizar PDF(s) no Gotenberg: ${faltando.join(', ')}.`,
      status: 502,
    },
  }];
}

return [{
  json: {
    ...base,
    pdfs_caminho_b: pdfsB64,
  },
}];

