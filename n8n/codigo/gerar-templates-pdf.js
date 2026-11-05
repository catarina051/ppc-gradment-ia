// @usa-compartilhado
// Gera deterministicamente os 4 documentos canônicos do Caminho B (100% compatíveis com as Regexes PHP
// de PpcCurriculoPdfParser e SigaaDisciplinasEmentaPdfParser) e prepara os HTMLs para o Gotenberg.
const j = $input.first().json;
const preview = j.payload_gradment.preview;
const nomeCursoUpper = limparTextoUnicaLinha(preview.curso.nome_curso, 150)
  .replace(/[–-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();
const anoPeriodo = limparTextoUnicaLinha(preview.curso.ano_periodo || '2026.1', 20);

const disciplinas = preview.disciplinas || [];
const dependencias = preview.dependencias || [];
const obrigatorias = disciplinas.filter((d) => d.periodo !== null);
const mapaNomePorCodigo = new Map(disciplinas.map((d) => [d.codigo, d.nome]));

// Sanitiza nome de eixo contra as palavras reservadas da Regra 4 (Quadro, Eixo, Nº, Conteúdo, Carga, Total)
const RESERVADAS_EIXO_RE = /^(Quadro|Eixo|N[º°o]|Conte[úu]do|Carga|Total)\b/i;
function sanitizarNomeEixo(raw) {
  let txt = limparTextoUnicaLinha(raw || 'Formação Geral', 110);
  txt = txt.replace(/^Eixos?\s+(de\s+|da\s+|do\s+)?/i, '').trim();
  if (RESERVADAS_EIXO_RE.test(txt)) {
    txt = `Área de ${txt}`;
  }
  if (txt.length < 4) txt = `Área ${txt} Curricular`;
  return txt.slice(0, 115);
}

const mapaEixos = new Map(); // nomeEixoSanitizado -> id (1..N)
for (const d of obrigatorias) {
  const nomeEixo = sanitizarNomeEixo(d.eixo);
  if (!mapaEixos.has(nomeEixo)) {
    mapaEixos.set(nomeEixo, mapaEixos.size + 1);
  }
}
if (mapaEixos.size === 0) {
  mapaEixos.set('Formação Básica e Profissional', 1);
}

// Mapa de pré-requisitos e correquisitos por código da disciplina
const prePorDisc = new Map();
const coPorDisc = new Map();
for (const dep of dependencias) {
  const lista = dep.tipo === 'CO' ? coPorDisc : prePorDisc;
  if (!lista.has(dep.disciplina_codigo)) lista.set(dep.disciplina_codigo, []);
  lista.get(dep.disciplina_codigo).push(dep.dependencia_codigo);
}

// 1. Montagem do texto canônico de ppc_pdf
const linhasPpc = [];
linhasPpc.push(`PROJETO PEDAGÓGICO DO CURSO DE ${nomeCursoUpper} – CAMPUS SEDE`);
linhasPpc.push('');
linhasPpc.push('Quadro 1: Eixos de Formação');
for (const [nomeEixo, idEixo] of mapaEixos.entries()) {
  linhasPpc.push(`${idEixo} ${nomeEixo}`);
}
linhasPpc.push('');

const periodosUnicos = [...new Set(obrigatorias.map((d) => d.periodo))].sort((a, b) => a - b);
let numQuadro = 2;
for (const per of periodosUnicos) {
  linhasPpc.push(`Quadro ${numQuadro++} – Relação de disciplinas do ${per}º período`);
  const doPeriodo = obrigatorias.filter((d) => d.periodo === per);
  doPeriodo.forEach((d, idx) => {
    const idEixo = mapaEixos.get(sanitizarNomeEixo(d.eixo)) || 1;
    const pres = prePorDisc.get(d.codigo) || [];
    const cos = coPorDisc.get(d.codigo) || [];
    const preTxt = pres.length > 0 ? pres.join(' / ') : 'Não há';
    const coTxt = cos.length > 0 ? cos.join(' / ') : 'Não há';
    linhasPpc.push(`${idx + 1} / ${idEixo} ${d.nome} X ${d.carga_horaria},0 ${d.carga_horaria},0 ${preTxt} ${coTxt}`);
  });
  linhasPpc.push('Total');
  linhasPpc.push('');
}

linhasPpc.push('EMENTÁRIO DAS DISCIPLINAS');
linhasPpc.push('');
for (const d of obrigatorias) {
  const presNomes = (prePorDisc.get(d.codigo) || []).map((c) => mapaNomePorCodigo.get(c)).filter(Boolean);
  const cosNomes = (coPorDisc.get(d.codigo) || []).map((c) => mapaNomePorCodigo.get(c)).filter(Boolean);
  linhasPpc.push(`Disciplina: ${d.nome} SIGLA PPC: ${d.codigo}`);
  linhasPpc.push('PRÉ-REQUISITOS CORREQUISITOS');
  linhasPpc.push(presNomes.length > 0 ? presNomes.join(' / ') : 'Não há');
  linhasPpc.push(cosNomes.length > 0 ? cosNomes.join(' / ') : 'Não há');
  linhasPpc.push('Ementa:');
  linhasPpc.push(limparTextoUnicaLinha(d.ementa || `Ementa de ${d.nome}.`, 4000));
  linhasPpc.push('');
}

const ppcTxt = linhasPpc.join('\n').trim();

// 2. Montagem do texto canônico de ementas_pdf (todas as disciplinas: obrigatórias + optativas)
const linhasEmentas = [
  `Curso: ${nomeCursoUpper}`,
  `Ano/Período: ${anoPeriodo}`,
];
for (const d of disciplinas) {
  linhasEmentas.push(`G03${d.codigo}.01 ${d.nome.toUpperCase()}`);
  linhasEmentas.push(limparTextoUnicaLinha(d.ementa || `Ementa de ${d.nome}.`, 4000));
}
linhasEmentas.push('01/01/2026, 00:00 Sistema Integrado');
const ementasTxt = linhasEmentas.join('\n');

// 3 e 4. Templates mínimos válidos para turmas_componente_pdf e turmas_ofertadas_pdf
const turmasCompTxt = [
  'Turmas Encontradas',
  `Ofertadas ao curso: ${nomeCursoUpper}`,
  `Ano-Período: ${anoPeriodo}`,
  'Docente Horário Mat Cap',
].join('\n');

const turmasOfertTxt = [
  'Turmas Ofertadas',
  `Curso: ${nomeCursoUpper}`,
  `Ano-Período: ${anoPeriodo}`,
  'Docente Horário Mat Cap',
].join('\n');

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Página larga (420mm) + white-space: pre evita quebras de linha dentro de linhas de tabela do Quadro,
// garantindo compatibilidade de 100% com Smalot\PdfParser e com as Regexes sem flag DOTALL (/u) do PHP!
function envolverHtmlPdf(titulo, texto) {
  const linhasHtml = texto
    .split('\n')
    .map((ln) => (ln === '' ? '<div class="vazia">&nbsp;</div>' : `<div class="linha">${escHtml(ln)}</div>`))
    .join('\n');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(titulo)}</title>
  <style>
    @page { size: 420mm 297mm; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.35; color: #111; margin: 0; padding: 0; }
    .linha { white-space: nowrap; margin: 0; padding: 0; }
    .vazia { height: 6pt; }
  </style>
</head>
<body>
${linhasHtml}
</body>
</html>`;
}

const htmlPpc = await this.helpers.prepareBinaryData(
  Buffer.from(envolverHtmlPdf('PPC Canônico GradMent', ppcTxt), 'utf8'),
  'index.html',
  'text/html',
);
const htmlEmentas = await this.helpers.prepareBinaryData(
  Buffer.from(envolverHtmlPdf('Ementas Canônicas GradMent', ementasTxt), 'utf8'),
  'index.html',
  'text/html',
);
const htmlTurmasComp = await this.helpers.prepareBinaryData(
  Buffer.from(envolverHtmlPdf('Turmas por Componente', turmasCompTxt), 'utf8'),
  'index.html',
  'text/html',
);
const htmlTurmasOfert = await this.helpers.prepareBinaryData(
  Buffer.from(envolverHtmlPdf('Turmas Ofertadas', turmasOfertTxt), 'utf8'),
  'index.html',
  'text/html',
);

return [{
  json: {
    ...j,
    textos_caminho_b: {
      ppc_txt: ppcTxt,
      ementas_txt: ementasTxt,
      turmas_componente_txt: turmasCompTxt,
      turmas_ofertadas_txt: turmasOfertTxt,
    },
  },
  binary: {
    html_ppc: htmlPpc,
    html_ementas: htmlEmentas,
    html_turmas_comp: htmlTurmasComp,
    html_turmas_ofert: htmlTurmasOfert,
  },
}];

