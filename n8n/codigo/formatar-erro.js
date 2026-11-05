// Formata erros de validação ou de comunicação em HTML (Formulário) ou JSON (API).
const j = $input.first().json ?? {};
const status = Number.isInteger(j.status) ? j.status : 400;
const mensagem = String(j.erro || 'Ocorreu um erro inesperado ao processar o PPC.');

if (j.origem === 'formulario') {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Erro ao processar PPC</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f6f8fa; color: #1f2328; margin: 0; padding: 40px 16px; }
    .box { max-width: 620px; margin: 0 auto; background: #fff; border: 1px solid #ff818266; border-left: 5px solid #cf222e; border-radius: 8px; padding: 20px 24px; }
    h1 { font-size: 20px; margin: 0 0 8px; color: #cf222e; }
    p { font-size: 14.5px; line-height: 1.5; margin: 0 0 16px; }
    a { display: inline-block; padding: 8px 14px; background: #0969da; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Não foi possível converter o PPC</h1>
    <p>${esc(mensagem)}</p>
    <a href="javascript:history.back()">← Voltar ao formulário</a>
  </div>
</body>
</html>`;
  return [{
    json: {
      status,
      content_type: 'text/html; charset=utf-8',
      resposta: html,
    },
  }];
}

return [{
  json: {
    status,
    content_type: 'application/json; charset=utf-8',
    resposta: JSON.stringify({ sucesso: false, erro: mensagem, status }, null, 2),
  },
}];

