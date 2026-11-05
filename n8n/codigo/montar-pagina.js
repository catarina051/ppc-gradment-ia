// Monta a página HTML de resultado para o Coordenador com auditoria IA 1 × IA 2 × IA 3 e downloads.
const j = $input.first().json;
const payload = j.payload_gradment;
const preview = payload.preview;
const aud = j.relatorio_auditoria;
const est = aud.estatisticas_finais;
const pdfs = j.pdfs_caminho_b || null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

const slug = String(preview.curso.nome_curso || 'curso')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'curso';

const jsonFormatado = JSON.stringify(payload, null, 2);
const jsonB64 = Buffer.from(jsonFormatado, 'utf8').toString('base64');
const audB64 = Buffer.from(JSON.stringify(aud, null, 2), 'utf8').toString('base64');

const mapPre = new Map();
const mapCo = new Map();
for (const dep of preview.dependencias) {
  const alvo = dep.tipo === 'CO' ? mapCo : mapPre;
  if (!alvo.has(dep.disciplina_codigo)) alvo.set(dep.disciplina_codigo, []);
  alvo.get(dep.disciplina_codigo).push(dep.dependencia_codigo);
}

const bannerConsenso = aud.houve_divergencia
  ? `<div class="banner juiza">
       <strong>⚖️ Divergência Detectada e Arbitrada pela 3ª IA (Juíza)</strong><br/>
       IA 1 (<code>${esc(aud.modelos.ia1.provider)}/${esc(aud.modelos.ia1.model)}</code>) e
       IA 2 (<code>${esc(aud.modelos.ia2.provider)}/${esc(aud.modelos.ia2.model)}</code>) apresentaram
       <strong>${aud.total_divergencias_detectadas}</strong> divergência(s).
       A 3ª IA (<code>${esc(aud.arbitragem_ia3.provider)}/${esc(aud.arbitragem_ia3.model)}</code>) auditou o PPC e consolidou o resultado final.
     </div>`
  : `<div class="banner consenso">
       <strong>✅ Consenso Direto entre IA 1 e IA 2 (100% Compatível)</strong><br/>
       IA 1 (<code>${esc(aud.modelos.ia1.provider)}/${esc(aud.modelos.ia1.model)}</code>) e
       IA 2 (<code>${esc(aud.modelos.ia2.provider)}/${esc(aud.modelos.ia2.model)}</code>) convergiram sem divergências estruturais. A 3ª IA não precisou ser acionada.
     </div>`;

const alertaSimulado = aud.simulado
  ? `<div class="banner aviso">
       <strong>🧪 Modo Demonstração Ativo:</strong> Execução realizada com respostas simuladas para validação do fluxo n8n. Configure suas chaves no arquivo <code>.env</code> para análise real com LLMs.
     </div>`
  : '';

const botoesDownload = [];
if (j.incluir_json !== false) {
  botoesDownload.push(
    `<a class="btn primario" download="gradment-${esc(slug)}-json-canonico.json" href="data:application/json;base64,${jsonB64}">⬇️ Baixar JSON Canônico (Caminho A)</a>`,
  );
}
botoesDownload.push(
  `<a class="btn secundario" download="gradment-${esc(slug)}-auditoria.json" href="data:application/json;base64,${audB64}">📋 Relatório de Auditoria (.json)</a>`,
);
if (pdfs) {
  botoesDownload.push(
    `<a class="btn pdf" download="1_ppc_${esc(slug)}.pdf" href="data:application/pdf;base64,${pdfs.ppc_pdf}">📄 1. ppc_pdf</a>`,
    `<a class="btn pdf" download="2_ementas_${esc(slug)}.pdf" href="data:application/pdf;base64,${pdfs.ementas_pdf}">📄 2. ementas_pdf</a>`,
    `<a class="btn pdf" download="3_turmas_componente_${esc(slug)}.pdf" href="data:application/pdf;base64,${pdfs.turmas_componente_pdf}">📄 3. turmas_componente_pdf</a>`,
    `<a class="btn pdf" download="4_turmas_ofertadas_${esc(slug)}.pdf" href="data:application/pdf;base64,${pdfs.turmas_ofertadas_pdf}">📄 4. turmas_ofertadas_pdf</a>`,
  );
}

let blocoJuizaHtml = '';
if (aud.houve_divergencia && aud.arbitragem_ia3?.acionada) {
  const linhasDisc = (aud.arbitragem_ia3.decisoes_disciplinas || []).map((d) => `
    <tr>
      <td><code>${esc(d.id_divergencia)}</code></td>
      <td>${esc(d.motivo_original)}</td>
      <td><span class="tag">${esc(d.acao)}</span></td>
      <td>${esc(d.pagina_evidencia)}</td>
      <td>${esc(d.justificativa)}</td>
    </tr>
  `).join('');
  const linhasDep = (aud.arbitragem_ia3.decisoes_dependencias || []).map((d) => `
    <tr>
      <td><code>${esc(d.id_divergencia)}</code></td>
      <td>${esc(d.motivo_original)} (${esc(d.disciplina_codigo)} → ${esc(d.dependencia_codigo)})</td>
      <td><span class="tag">${d.incluir ? `MANTER (${esc(d.tipo)})` : 'REMOVER'}</span></td>
      <td>${esc(d.pagina_evidencia)}</td>
      <td>${esc(d.justificativa)}</td>
    </tr>
  `).join('');

  blocoJuizaHtml = `
    <h2>⚖️ Julgamento da 3ª IA (Resolução de Divergências)</h2>
    <p class="resumo-juiza">${esc(aud.arbitragem_ia3.resumo)}</p>
    <div class="tabela-wrap">
      <table>
        <thead>
          <tr><th>ID</th><th>Divergência IA 1 × IA 2</th><th>Decisão IA 3</th><th>Evidência</th><th>Justificativa</th></tr>
        </thead>
        <tbody>${linhasDisc}${linhasDep}</tbody>
      </table>
    </div>
  `;
}

const linhasGrade = preview.disciplinas.map((d) => {
  const pres = (mapPre.get(d.codigo) || []).join(', ') || '—';
  const cos = (mapCo.get(d.codigo) || []).join(', ') || '—';
  return `
    <tr>
      <td>${d.periodo !== null ? `${d.periodo}º` : '<span class="opt">Optativa</span>'}</td>
      <td><code>${esc(d.codigo)}</code></td>
      <td><code>${esc(d.codigo_externo || '—')}</code></td>
      <td><strong>${esc(d.nome)}</strong><br/><span class="eixo">${esc(d.eixo)}</span></td>
      <td>${d.carga_horaria}h</td>
      <td>${esc(pres)}</td>
      <td>${esc(cos)}</td>
    </tr>
  `;
}).join('');

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>PPC Convertido para o GradMent — ${esc(preview.curso.nome_curso)}</title>
  <style>
    html, body { height: auto !important; min-height: 100vh; overflow-y: auto !important; margin: 0; background: #f6f8fa; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1f2328; }
    .container { max-width: 980px; margin: 28px auto; padding: 0 18px 60px; }
    h1 { font-size: 24px; margin: 0 0 4px; }
    h2 { font-size: 18px; margin: 26px 0 10px; }
    .sub { color: #59636e; margin: 0 0 18px; font-size: 14px; }
    .banner { padding: 12px 16px; border-radius: 8px; margin-bottom: 14px; font-size: 14px; line-height: 1.5; }
    .consenso { background: #dafbe1; border: 1px solid #82e596; color: #116329; }
    .juiza { background: #ddf4ff; border: 1px solid #80ccff; color: #0550ae; }
    .aviso { background: #fff8c5; border: 1px solid #eac54f; color: #7d4e00; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 16px 0; }
    .card { background: #fff; border: 1px solid #d0d7de; border-radius: 10px; padding: 12px 14px; }
    .card .lbl { font-size: 11px; text-transform: uppercase; color: #59636e; letter-spacing: .04em; }
    .card .val { font-size: 22px; font-weight: 700; margin-top: 2px; color: #0969da; }
    .botoes { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0; }
    .btn { display: inline-block; padding: 10px 14px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13.5px; }
    .primario { background: #1f883d; color: #fff; }
    .secundario { background: #fff; color: #1f2328; border: 1px solid #d0d7de; }
    .pdf { background: #0969da; color: #fff; }
    .tabela-wrap { background: #fff; border: 1px solid #d0d7de; border-radius: 10px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 9px 12px; border-bottom: 1px solid #eaeef2; text-align: left; vertical-align: top; }
    th { background: #f6f8fa; font-weight: 600; color: #59636e; }
    .eixo { font-size: 11.5px; color: #59636e; }
    .opt { background: #fbefff; color: #8250df; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px; }
    .tag { background: #eff2f5; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px; }
    textarea { width: 100%; height: 220px; box-sizing: border-box; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; padding: 10px; border-radius: 8px; border: 1px solid #d0d7de; background: #fff; }
    .resumo-juiza { font-size: 13.5px; color: #59636e; margin: 0 0 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>PPC Convertido para o GradMent</h1>
    <p class="sub">Curso: <strong>${esc(preview.curso.nome_curso)}</strong> · Matriz <strong>${esc(preview.curso.ano_periodo)}</strong> · <code>curso_id: ${payload.curso_id}</code></p>

    ${alertaSimulado}
    ${bannerConsenso}

    <div class="grid">
      <div class="card"><div class="lbl">Obrigatórias</div><div class="val">${est.obrigatorias}</div></div>
      <div class="card"><div class="lbl">Optativas</div><div class="val">${est.optativas}</div></div>
      <div class="card"><div class="lbl">Períodos</div><div class="val">${est.periodos}</div></div>
      <div class="card"><div class="lbl">Pré / Correquisitos</div><div class="val">${est.pre_requisitos} / ${est.correquisitos}</div></div>
      <div class="card"><div class="lbl">CH Obrigatória</div><div class="val">${est.carga_horaria_obrigatoria_total}h</div></div>
    </div>

    <div class="botoes">
      ${botoesDownload.join('\n      ')}
    </div>

    ${blocoJuizaHtml}

    <h2>📚 Matriz Curricular Consolidada (${est.total_disciplinas} disciplinas)</h2>
    <div class="tabela-wrap">
      <table>
        <thead>
          <tr><th>Período</th><th>Código</th><th>Cód. Externo</th><th>Disciplina / Eixo</th><th>CH</th><th>Pré-req</th><th>Correq</th></tr>
        </thead>
        <tbody>${linhasGrade}</tbody>
      </table>
    </div>

    <h2>🧩 Payload JSON Canônico (<code>POST /curriculo/importar/confirmar</code>)</h2>
    <textarea readonly>${esc(jsonFormatado)}</textarea>
  </div>
</body>
</html>`;

return [{
  json: {
    status: 200,
    content_type: 'text/html; charset=utf-8',
    resposta: html,
  },
}];

