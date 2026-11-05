// Monta a resposta JSON da API (/webhook/converter-ppc) pronta para o backend do GradMent.
const j = $input.first().json;

const corpo = {
  sucesso: true,
  payload_gradment: j.incluir_json !== false ? j.payload_gradment : undefined,
  relatorio_auditoria: j.relatorio_auditoria,
  arquivos_caminho_b_b64: j.pdfs_caminho_b || undefined,
};

return [{
  json: {
    status: 200,
    content_type: 'application/json; charset=utf-8',
    resposta: JSON.stringify(corpo, null, 2),
  },
}];

