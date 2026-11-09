// Monta a TELA DE REVISÃO HUMANA do resultado (formulário web): painel com indicadores, divergências
// IA 1 × IA 2 × Juíza lado a lado, decisão humana por item e geração do JSON validado para o GradMent.
//
// O Formulário do n8n insere a resposta na página via innerHTML, e scripts inseridos assim não rodam.
// Por isso a tela interativa vai dentro de um <iframe srcdoc>, que é um documento próprio onde o JS executa.
const j = $input.first().json;
const payload = j.payload_gradment;
const aud = j.relatorio_auditoria;
const pdfs = j.pdfs_caminho_b || null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

const slug = String(payload.preview.curso.nome_curso || 'curso')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'curso';

// Dados embutidos na tela (JSON seguro dentro de <script>: "<" vira <)
const dados = {
  payload,
  aud,
  pdfs,
  incluirJson: j.incluir_json !== false,
  slug,
};
const BARRA = String.fromCharCode(92); // barra invertida, montada assim para nao depender de escapes
const dadosJson = JSON.stringify(dados)
  .replace(/</g, BARRA + 'u003c')
  .replace(new RegExp(String.fromCharCode(0x2028), 'g'), BARRA + 'u2028')
  .replace(new RegExp(String.fromCharCode(0x2029), 'g'), BARRA + 'u2029');

const css = `
:root{--bg:#f6f7fb;--card:#fff;--ink:#1f2328;--mut:#5b6472;--line:#e3e6ee;--roxo:#6d28d9;--roxo-cl:#f3efff;
--verde:#15803d;--verde-cl:#e9f8ee;--verm:#b91c1c;--verm-cl:#fdecec;--amb:#a16207;--amb-cl:#fff7e0;--azul:#1d4ed8;--azul-cl:#eaf1ff}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:22px 16px 80px}
h1{font-size:22px;margin:0}h2{font-size:17px;margin:30px 0 4px}.desc{color:var(--mut);margin:0 0 12px;font-size:13px}
.topo{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:14px}
.status{padding:4px 10px;border-radius:999px;font-weight:600;font-size:12px}
.st-pend{background:var(--amb-cl);color:var(--amb)}.st-ok{background:var(--verde-cl);color:var(--verde)}
.alerta{border-radius:10px;padding:11px 14px;margin:8px 0;font-size:13.5px;border:1px solid}
.al-verm{background:var(--verm-cl);border-color:#f5c2c2;color:#7f1d1d}.al-amb{background:var(--amb-cl);border-color:#f1d78a;color:#713f12}
.al-azul{background:var(--azul-cl);border-color:#bcd2ff;color:#1e3a8a}
.al-verde{background:var(--verde-cl);border-color:#b7e4c7;color:#14532d}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.kpi .l{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)}.kpi .v{font-size:24px;font-weight:700;margin-top:2px}
.kpi .s{font-size:12px;color:var(--mut)}
.modelos{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.mod{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px}.mod b{display:block;font-size:12px;color:var(--mut);font-weight:600}
.mod code{font-size:12.5px}
.barras{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;gap:6px;align-items:flex-end;height:150px;overflow-x:auto}
.barra{flex:1;min-width:34px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;font-size:11px;color:var(--mut)}
.barra i{display:block;width:70%;background:var(--roxo);border-radius:5px 5px 0 0;min-height:2px}.barra .n{font-weight:700;color:var(--ink)}
.barra.opt i{background:#a78bfa}
.ferr{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 10px}
.chip{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:5px 11px;font-size:12.5px;cursor:pointer;color:var(--ink)}
.chip.on{background:var(--roxo);border-color:var(--roxo);color:#fff}
button.acao{border:0;background:var(--roxo);color:#fff;border-radius:9px;padding:9px 14px;font-weight:600;cursor:pointer;font-size:13px}
button.acao.sec{background:var(--card);color:var(--ink);border:1px solid var(--line)}button.acao:disabled{opacity:.45;cursor:not-allowed}
.prog{flex:1;min-width:180px;height:8px;background:var(--line);border-radius:99px;overflow:hidden}.prog i{display:block;height:100%;background:var(--verde)}
.div{background:var(--card);border:1px solid var(--line);border-radius:12px;margin:10px 0;overflow:hidden}
.div.feito{border-color:#b7e4c7}
.div-cab{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--line);background:#fbfbfd}
.div-cab .t{font-weight:600}.div-cab .m{color:var(--mut);font-size:12.5px}
.tag{display:inline-block;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:600;background:#eef0f4;color:var(--mut)}
.tag.verde{background:var(--verde-cl);color:var(--verde)}.tag.roxo{background:var(--roxo-cl);color:var(--roxo)}.tag.amb{background:var(--amb-cl);color:var(--amb)}
.tag.verm{background:var(--verm-cl);color:var(--verm)}
.cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.col{padding:10px 14px;border-right:1px solid var(--line);font-size:13px}.col:last-child{border-right:0}
.col h4{margin:0 0 6px;font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
.col.jz{background:#faf8ff}
.campo{margin:3px 0}.campo .k{color:var(--mut);font-size:11.5px;margin-right:4px}
.dif{background:#fff1c2;border-radius:4px;padding:0 3px;font-weight:600}
.vazio{color:var(--mut);font-style:italic}
details{margin-top:4px}summary{cursor:pointer;color:var(--azul);font-size:12px}details p{margin:4px 0 0;font-size:12.5px;color:#374151}
.just{padding:9px 14px;border-top:1px dashed var(--line);font-size:12.5px;color:#374151}
.escolha{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px;border-top:1px solid var(--line);align-items:center}
.escolha span{font-size:12px;color:var(--mut);margin-right:4px}
.op{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:6px 10px;font-size:12.5px;cursor:pointer}
.op.on{border-color:var(--verde);background:var(--verde-cl);color:var(--verde);font-weight:600}
.op.sug{box-shadow:inset 0 0 0 1px #c4b5fd}
.tab{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px 11px;border-bottom:1px solid #eef0f4;text-align:left;vertical-align:top}
th{background:#f8f9fc;color:var(--mut);font-weight:600;font-size:12px;position:sticky;top:0}
input[type=search],select{border:1px solid var(--line);border-radius:8px;padding:7px 10px;font:inherit;background:var(--card)}
.final{position:sticky;bottom:0;background:rgba(246,247,251,.96);backdrop-filter:blur(4px);border-top:1px solid var(--line);margin:24px -16px 0;padding:12px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.final label{font-size:13px;display:flex;gap:6px;align-items:center}
.avisos{font-size:12.5px;color:#713f12;margin:6px 0 0;padding-left:18px}
.dl{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.dl a{font-size:12.5px;color:var(--azul)}
@media (max-width:760px){.cols{grid-template-columns:1fr}.col{border-right:0;border-bottom:1px solid var(--line)}}
`;

// Script da tela (sem template literals para não colidir com a interpolação do servidor)
const js = String.raw`
(function () {
  var D = JSON.parse(document.getElementById('dados').textContent);
  var P = D.payload, A = D.aud;
  var fin = P.preview;
  var divD = (A.divergencias_iniciais && A.divergencias_iniciais.disciplinas) || [];
  var divR = (A.divergencias_iniciais && A.divergencias_iniciais.dependencias) || [];
  var decD = {}, decR = {};
  ((A.arbitragem_ia3 && A.arbitragem_ia3.decisoes_disciplinas) || []).forEach(function (d) { decD[d.id_divergencia] = d; });
  ((A.arbitragem_ia3 && A.arbitragem_ia3.decisoes_dependencias) || []).forEach(function (d) { decR[d.id_divergencia] = d; });
  var escolhas = {};
  var filtro = 'pendentes';
  var $ = function (s) { return document.querySelector(s); };
  function el(tag, attrs, filhos) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f != null) e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
    return e;
  }
  function per(p) { return p === null || p === undefined ? 'Optativa' : p + 'º período'; }
  function porCodigo(lista, c) { for (var i = 0; i < lista.length; i++) if (lista[i].codigo === c) return lista[i]; return null; }
  var nomePor = {}; fin.disciplinas.forEach(function (d) { nomePor[d.codigo] = d.nome; });
  divD.forEach(function (d) { var v = d.ia1 || d.ia2; if (v && !nomePor[d.codigo_sugerido]) nomePor[d.codigo_sugerido] = v.nome; });
  function rot(c) { return nomePor[c] ? c + ' · ' + nomePor[c] : c; }

  // ---------- Aplicar escolhas humanas + reaplicar as regras do GradMent ----------
  function aplicar() {
    var disc = JSON.parse(JSON.stringify(fin.disciplinas));
    var deps = JSON.parse(JSON.stringify(fin.dependencias));
    var avisos = [];
    divD.forEach(function (d) {
      var e = escolhas[d.id_divergencia];
      if (!e || e === 'juiza') return;
      var cod = d.codigo_sugerido;
      var idx = -1; disc.forEach(function (x, i) { if (x.codigo === cod) idx = i; });
      if (e === 'excluir') {
        if (idx >= 0) disc.splice(idx, 1);
        var caem = deps.filter(function (r) { return r.disciplina_codigo === cod || r.dependencia_codigo === cod; });
        if (caem.length) avisos.push(cod + ' excluída: também saíram ' + caem.length + ' requisito(s) ligados a ela (' +
          caem.map(function (r) { return r.disciplina_codigo + ' → ' + r.dependencia_codigo; }).join(', ') + ').');
        deps = deps.filter(function (r) { return r.disciplina_codigo !== cod && r.dependencia_codigo !== cod; });
        return;
      }
      var v = d[e]; if (!v) return;
      var ch = Math.round(Number(v.carga_horaria) || 0);
      if (ch <= 0) { ch = 60; avisos.push(cod + ': a versão escolhida não tinha carga horária; usei 60h (confira).'); }
      var obj = { codigo: cod, codigo_externo: v.codigo_externo || cod, nome: v.nome, periodo: v.periodo === undefined ? null : v.periodo,
        eixo: v.eixo || (v.periodo != null ? 'Formação Obrigatória' : 'Formação Optativa'), carga_horaria: ch,
        ementa: v.ementa || ('Ementa curricular de ' + v.nome + '.'), plano_curso: v.ementa || ('Ementa curricular de ' + v.nome + '.') };
      if (idx >= 0) disc[idx] = obj; else disc.push(obj);
    });
    divR.forEach(function (d) {
      var e = escolhas[d.id_divergencia];
      if (!e || e === 'juiza') return;
      var dec = decR[d.id_divergencia] || {};
      var a = dec.disciplina_codigo || d.disciplina_codigo, b = dec.dependencia_codigo || d.dependencia_codigo;
      deps = deps.filter(function (r) { return !(r.disciplina_codigo === a && r.dependencia_codigo === b); });
      if (e === 'PRE' || e === 'CO') deps.push({ disciplina_codigo: a, dependencia_codigo: b, tipo: e });
    });
    // Regras: códigos existentes, sem duplicata, obrigatória não depende de optativa, grafo sem ciclo (DFS)
    var mapa = {}; disc.forEach(function (x) { mapa[x.codigo] = x; });
    var adj = {}, vistas = {}, ok = [];
    function caminho(de, ate) {
      var pilha = [de], vis = {};
      while (pilha.length) { var at = pilha.pop(); if (at === ate) return true; if (vis[at]) continue; vis[at] = 1; (adj[at] || []).forEach(function (n) { pilha.push(n); }); }
      return false;
    }
    deps.forEach(function (r) {
      var a = mapa[r.disciplina_codigo], b = mapa[r.dependencia_codigo], k = r.disciplina_codigo + '>' + r.dependencia_codigo;
      if (!a || !b) { avisos.push('Requisito ' + r.disciplina_codigo + ' → ' + r.dependencia_codigo + ' removido: disciplina inexistente.'); return; }
      if (vistas[k] || r.disciplina_codigo === r.dependencia_codigo) return;
      if (a.periodo !== null && b.periodo === null) { avisos.push('Regra 3: ' + r.disciplina_codigo + ' (obrigatória) não pode depender de ' + r.dependencia_codigo + ' (optativa); removido.'); return; }
      if (caminho(r.dependencia_codigo, r.disciplina_codigo)) { avisos.push('Regra 5: ' + r.disciplina_codigo + ' → ' + r.dependencia_codigo + ' criaria um ciclo; removido.'); return; }
      vistas[k] = 1; (adj[r.disciplina_codigo] = adj[r.disciplina_codigo] || []).push(r.dependencia_codigo);
      ok.push({ disciplina_codigo: r.disciplina_codigo, dependencia_codigo: r.dependencia_codigo, tipo: r.tipo === 'CO' ? 'CO' : 'PRE' });
    });
    disc.forEach(function (x) { if (x.periodo !== null && !(x.carga_horaria > 0)) avisos.push('Regra 2: ' + x.codigo + ' é obrigatória e está sem carga horária.'); });
    disc.sort(function (a, b) {
      if (a.periodo !== null && b.periodo === null) return -1; if (a.periodo === null && b.periodo !== null) return 1;
      if (a.periodo !== b.periodo) return (a.periodo || 0) - (b.periodo || 0); return a.codigo.localeCompare(b.codigo);
    });
    var out = JSON.parse(JSON.stringify(P));
    out.preview.disciplinas = disc; out.preview.dependencias = ok;
    return { payload: out, avisos: avisos };
  }

  // ---------- Topo: alertas, indicadores, modelos ----------
  function topo() {
    var c = $('#topo'); c.innerHTML = '';
    var m = A.modelos || {};
    var nm = function (x) { return x ? x.provider + '/' + x.model : '—'; };
    if (A.simulado) c.appendChild(el('div', { class: 'alerta al-verm' }, [el('b', { text: 'Resultado FICTÍCIO. ' }),
      'Você escolheu um modo de demonstração: este resultado é um exemplo fixo e NÃO veio do seu PDF. Envie de novo com o modo “Automático” para analisar o seu PPC.']));
    if (m.ia1 && m.ia2 && nm(m.ia1) === nm(m.ia2)) c.appendChild(el('div', { class: 'alerta al-amb' }, [el('b', { text: 'IA 1 e IA 2 rodaram no mesmo modelo. ' }),
      'A verificação dupla perde força: erros iguais não viram divergência. Revise a matriz com mais atenção.']));
    if (A.arbitragem_ia3 && A.arbitragem_ia3.acionada && nm(m.ia1) === A.arbitragem_ia3.provider + '/' + A.arbitragem_ia3.model)
      c.appendChild(el('div', { class: 'alerta al-amb' }, [el('b', { text: 'A juíza rodou no mesmo modelo das IAs. ' }), 'Na avaliação, a juíza acertou bem menos nesse cenário: confira cada decisão dela.']));
    var de = A.documento_entrada || {};
    if (de.recortado_por_tamanho) c.appendChild(el('div', { class: 'alerta al-verm' }, [el('b', { text: 'Leitura incompleta: o PDF foi recortado. ' }),
      'Este resultado veio de uma versão antiga do pipeline. Envie o PPC de novo para uma leitura integral.']));
    if (A.alerta_instrucao_suspeita) c.appendChild(el('div', { class: 'alerta al-verm' }, [el('b', { text: 'Possível instrução maliciosa no documento. ' }), 'As IAs sinalizaram texto que tenta dar ordens a elas. Revise com cuidado.']));

    var est = A.estatisticas_finais || {};
    var k = el('div', { class: 'kpis' });
    [['Disciplinas', est.total_disciplinas, (est.obrigatorias || 0) + ' obrigatórias · ' + (est.optativas || 0) + ' optativas'],
     ['Períodos', est.periodos, ''],
     ['Pré / correquisitos', (est.pre_requisitos || 0) + ' / ' + (est.correquisitos || 0), ''],
     ['CH obrigatória', (est.carga_horaria_obrigatoria_total || 0) + 'h', ''],
     ['Divergências IA 1 × IA 2', divD.length + divR.length, divD.length + ' de disciplina · ' + divR.length + ' de requisito'],
     ['Correções do validador', (A.correcoes_invariantes_gradment || []).length, 'regras do GradMent']
    ].forEach(function (x) { k.appendChild(el('div', { class: 'kpi' }, [el('div', { class: 'l', text: x[0] }), el('div', { class: 'v', text: String(x[1] == null ? '—' : x[1]) }), x[2] ? el('div', { class: 's', text: x[2] }) : null])); });
    c.appendChild(k);
    var mods = el('div', { class: 'modelos' });
    [['IA 1 · extratora (matriz → ementário)', nm(m.ia1)], ['IA 2 · auditora (ementário → matriz)', nm(m.ia2)],
     ['IA 3 · juíza', A.arbitragem_ia3 && A.arbitragem_ia3.acionada ? A.arbitragem_ia3.provider + '/' + A.arbitragem_ia3.model : 'não acionada (consenso)']]
      .forEach(function (x) { mods.appendChild(el('div', { class: 'mod' }, [el('b', { text: x[0] }), el('code', { text: x[1] })])); });
    c.appendChild(mods);
  }

  function leitura() {
    var c = $('#leitura'); c.innerHTML = '';
    var de = A.documento_entrada || {}, L = A.leitura_em_blocos || {};
    var ias = [['IA 1', L.ia1], ['IA 2', L.ia2]].filter(function (x) { return x[1]; });
    if (!ias.length) { c.appendChild(el('p', { class: 'desc', text: A.simulado ? 'Resultado fictício: nada foi lido.' : 'Sem registro de leitura em blocos nesta execução.' })); return; }
    var completo = ias.every(function (x) { return x[1].cobertura_completa; }) && de.leitura_integral !== false && !de.recortado_por_tamanho;
    var semTexto = de.paginas_sem_texto || [];
    c.appendChild(el('div', { class: 'alerta ' + (completo ? 'al-verde' : 'al-verm') }, [
      el('b', { text: completo ? 'Leitura integral confirmada. ' : 'Leitura incompleta. ' }),
      (de.paginas || '?') + ' páginas, ' + (de.caracteres || 0).toLocaleString('pt-BR') + ' caracteres' + (de.paginas_ocr ? ', ' + de.paginas_ocr + ' página(s) lidas por OCR' : '') + '. ' +
      ias.map(function (x) { return x[0] + ' leu ' + x[1].paginas_lidas + ' página(s) em ' + x[1].blocos.length + ' bloco(s)'; }).join('; ') + '.' +
      (semTexto.length ? ' Páginas sem texto (em branco ou só imagem decorativa): ' + semTexto.join(', ') + '.' : '')
    ]));
    var grade = el('div', { class: 'modelos' });
    ias.forEach(function (x) {
      var linhas = x[1].blocos.map(function (b) {
        return el('tr', null, [el('td', { text: String(b.bloco) }), el('td', { text: b.paginas }),
          el('td', null, [el('code', { text: b.model }), b.reserva ? el('span', { class: 'tag amb', text: ' reserva' }) : null, b.mesmo_modelo_da_outra_ia ? el('span', { class: 'tag verm', text: ' mesmo modelo' }) : null]),
          el('td', { text: String(b.disciplinas) }), el('td', { text: String(b.dependencias) })]);
      });
      grade.appendChild(el('div', { class: 'tab' }, [el('table', null, [
        el('thead', null, [el('tr', null, [el('th', { text: x[0] + ' · bloco' }), el('th', { text: 'Páginas' }), el('th', { text: 'Modelo' }), el('th', { text: 'Disc.' }), el('th', { text: 'Req.' })])]),
        el('tbody', null, linhas)])]));
    });
    c.appendChild(grade);
    c.appendChild(el('p', { class: 'desc', text: 'Blocos vizinhos repetem uma página para não perder disciplina partida na quebra; a mesma disciplina vista em blocos diferentes (matriz num, ementa noutro) é fundida num registro só.' }));
  }

  function barras(disc) {
    var c = $('#barras'); c.innerHTML = '';
    var cont = {}; disc.forEach(function (d) { var p = d.periodo === null ? 'Opt' : d.periodo; cont[p] = (cont[p] || 0) + 1; });
    var ks = Object.keys(cont).filter(function (x) { return x !== 'Opt'; }).map(Number).sort(function (a, b) { return a - b; }).map(String);
    if (cont.Opt) ks.push('Opt');
    var max = Math.max.apply(null, ks.map(function (x) { return cont[x]; }).concat([1]));
    ks.forEach(function (x) {
      var b = el('div', { class: 'barra' + (x === 'Opt' ? ' opt' : '') }, [el('span', { class: 'n', text: String(cont[x]) }), el('i'), el('span', { text: x === 'Opt' ? 'Optat.' : x + 'º' })]);
      b.querySelector('i').style.height = Math.round(100 * cont[x] / max) + '%';
      c.appendChild(b);
    });
  }

  // ---------- Revisão das divergências ----------
  function campos(v, outros) {
    if (!v) return [el('div', { class: 'vazio', text: 'não extraiu esta disciplina' })];
    var lista = [['Período', per(v.periodo), 'periodo'], ['CH', (v.carga_horaria || 0) + 'h', 'carga_horaria'], ['Nome', v.nome, 'nome'], ['Cód. externo', v.codigo_externo || '—', 'codigo_externo']];
    var r = lista.map(function (x) {
      var difere = outros.some(function (o) { return o && String(o[x[2]] == null ? '' : o[x[2]]) !== String(v[x[2]] == null ? '' : v[x[2]]); });
      return el('div', { class: 'campo' }, [el('span', { class: 'k', text: x[0] + ':' }), el('span', { class: difere ? 'dif' : '', text: String(x[1]) })]);
    });
    if (v.ementa) r.push(el('details', null, [el('summary', { text: 'ementa' }), el('p', { text: v.ementa })]));
    return r;
  }
  function botoes(id, ops, sugerida) {
    var box = el('div', { class: 'escolha' }, [el('span', { text: 'Sua decisão:' })]);
    ops.forEach(function (o) {
      var b = el('button', { class: 'op' + (escolhas[id] === o[0] ? ' on' : '') + (o[0] === sugerida ? ' sug' : ''), type: 'button', text: o[1],
        onclick: function () { escolhas[id] = o[0]; render(); } });
      box.appendChild(b);
    });
    return box;
  }
  function cardDisc(d) {
    var dec = decD[d.id_divergencia] || {};
    var final = porCodigo(fin.disciplinas, d.codigo_sugerido);
    var feito = !!escolhas[d.id_divergencia];
    var acao = dec.acao || 'sem decisão';
    var card = el('div', { class: 'div' + (feito ? ' feito' : '') }, [
      el('div', { class: 'div-cab' }, [
        el('div', null, [el('div', { class: 't', text: rot(d.codigo_sugerido) }), el('div', { class: 'm', text: d.motivo })]),
        el('div', null, [el('span', { class: 'tag roxo', text: 'Juíza: ' + acao }), ' ', feito ? el('span', { class: 'tag verde', text: 'revisado' }) : el('span', { class: 'tag amb', text: 'pendente' })])
      ]),
      el('div', { class: 'cols' }, [
        el('div', { class: 'col' }, [el('h4', { text: 'IA 1' })].concat(campos(d.ia1, [d.ia2, final]))),
        el('div', { class: 'col' }, [el('h4', { text: 'IA 2' })].concat(campos(d.ia2, [d.ia1, final]))),
        el('div', { class: 'col jz' }, [el('h4', { text: 'Resultado da juíza' })].concat(final ? campos(final, [d.ia1, d.ia2]) : [el('div', { class: 'vazio', text: 'descartou esta disciplina' })]))
      ]),
      el('div', { class: 'just' }, [el('b', { text: 'Evidência: ' }), (dec.pagina_evidencia || '—') + '. ', dec.justificativa || '']),
      botoes(d.id_divergencia, [['juiza', 'Aceitar juíza'], ['ia1', 'Usar IA 1'], ['ia2', 'Usar IA 2'], ['excluir', 'Excluir disciplina']]
        .filter(function (o) { return (o[0] !== 'ia1' || d.ia1) && (o[0] !== 'ia2' || d.ia2); }), 'juiza')
    ]);
    return card;
  }
  function tipoTxt(t) { return t ? (t === 'CO' ? 'correquisito' : 'pré-requisito') : 'não apontou'; }
  function cardDep(d) {
    var dec = decR[d.id_divergencia] || {};
    var a = dec.disciplina_codigo || d.disciplina_codigo, b = dec.dependencia_codigo || d.dependencia_codigo;
    var feito = !!escolhas[d.id_divergencia];
    var jz = dec.id_divergencia ? (dec.incluir ? tipoTxt(dec.tipo) : 'excluiu') : 'sem decisão';
    var difere = (d.ia1_tipo || '') !== (d.ia2_tipo || '');
    return el('div', { class: 'div' + (feito ? ' feito' : '') }, [
      el('div', { class: 'div-cab' }, [
        el('div', null, [el('div', { class: 't', text: rot(a) + '  →  ' + rot(b) }), el('div', { class: 'm', text: d.motivo })]),
        el('div', null, [el('span', { class: 'tag roxo', text: 'Juíza: ' + jz }), ' ', feito ? el('span', { class: 'tag verde', text: 'revisado' }) : el('span', { class: 'tag amb', text: 'pendente' })])
      ]),
      el('div', { class: 'cols' }, [
        el('div', { class: 'col' }, [el('h4', { text: 'IA 1' }), el('span', { class: difere ? 'dif' : '', text: tipoTxt(d.ia1_tipo) })]),
        el('div', { class: 'col' }, [el('h4', { text: 'IA 2' }), el('span', { class: difere ? 'dif' : '', text: tipoTxt(d.ia2_tipo) })]),
        el('div', { class: 'col jz' }, [el('h4', { text: 'Resultado da juíza' }), el('span', { text: jz })])
      ]),
      el('div', { class: 'just' }, [el('b', { text: 'Evidência: ' }), (dec.pagina_evidencia || '—') + '. ', dec.justificativa || '']),
      botoes(d.id_divergencia, [['juiza', 'Aceitar juíza'], ['PRE', 'Pré-requisito'], ['CO', 'Correquisito'], ['excluir', 'Sem requisito']], 'juiza')
    ]);
  }
  function revisao() {
    var total = divD.length + divR.length;
    var feitos = Object.keys(escolhas).length;
    $('#prog-txt').textContent = total ? feitos + ' de ' + total + ' divergências revisadas' : 'Sem divergências: as duas IAs concordaram em tudo.';
    $('#prog-bar').style.width = (total ? Math.round(100 * feitos / total) : 100) + '%';
    var c = $('#lista'); c.innerHTML = '';
    var itens = divD.map(function (d) { return { t: 'disc', d: d }; }).concat(divR.map(function (d) { return { t: 'dep', d: d }; }));
    itens = itens.filter(function (x) {
      if (filtro === 'pendentes') return !escolhas[x.d.id_divergencia];
      if (filtro === 'disc') return x.t === 'disc'; if (filtro === 'dep') return x.t === 'dep'; return true;
    });
    if (!itens.length) c.appendChild(el('p', { class: 'desc', text: total ? 'Nada para mostrar neste filtro.' : 'Nenhuma divergência para revisar.' }));
    itens.forEach(function (x) { c.appendChild(x.t === 'disc' ? cardDisc(x.d) : cardDep(x.d)); });
    document.querySelectorAll('[data-f]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-f') === filtro); });
  }

  // ---------- Matriz final ----------
  function origem(cod) {
    for (var i = 0; i < divD.length; i++) if (divD[i].codigo_sugerido === cod) {
      var e = escolhas[divD[i].id_divergencia]; return e && e !== 'juiza' ? ['sua escolha', 'verde'] : ['juíza', 'roxo'];
    }
    var corr = (A.correcoes_invariantes_gradment || []).some(function (t) { return t.indexOf(cod) >= 0; });
    return corr ? ['validador', 'amb'] : ['consenso', ''];
  }
  function matriz(res) {
    var disc = res.payload.preview.disciplinas, deps = res.payload.preview.dependencias;
    var pre = {}, co = {};
    deps.forEach(function (r) { var alvo = r.tipo === 'CO' ? co : pre; (alvo[r.disciplina_codigo] = alvo[r.disciplina_codigo] || []).push(r.dependencia_codigo); });
    var fp = $('#f-per').value, q = ($('#f-busca').value || '').toLowerCase();
    var tb = $('#tb'); tb.innerHTML = '';
    disc.filter(function (d) {
      if (fp === 'opt' && d.periodo !== null) return false;
      if (fp && fp !== 'opt' && String(d.periodo) !== fp) return false;
      return !q || (d.nome + ' ' + d.codigo + ' ' + (d.codigo_externo || '')).toLowerCase().indexOf(q) >= 0;
    }).forEach(function (d) {
      var o = origem(d.codigo);
      tb.appendChild(el('tr', null, [el('td', { text: d.periodo === null ? 'Optativa' : d.periodo + 'º' }), el('td', null, [el('code', { text: d.codigo })]),
        el('td', null, [el('b', { text: d.nome }), el('br'), el('span', { class: 'm', text: d.eixo || '' })]), el('td', { text: d.carga_horaria + 'h' }),
        el('td', { text: (pre[d.codigo] || []).join(', ') || '—' }), el('td', { text: (co[d.codigo] || []).join(', ') || '—' }),
        el('td', null, [el('span', { class: 'tag ' + o[1], text: o[0] })])]));
    });
    $('#n-mat').textContent = disc.length + ' disciplinas · ' + deps.length + ' requisitos';
  }

  // ---------- Exportar ----------
  function baixar(nome, obj) {
    var url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    var a = el('a', { href: url, download: nome }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function rodape(res) {
    var total = divD.length + divR.length, feitos = Object.keys(escolhas).length;
    var conferi = $('#conferi').checked;
    var de = A.documento_entrada || {}, L = A.leitura_em_blocos || {};
    var leituraOk = !de.recortado_por_tamanho && de.leitura_integral !== false && [L.ia1, L.ia2].every(function (x) { return !x || x.cobertura_completa; });
    var pronto = feitos >= total && conferi && !A.simulado && leituraOk;
    $('#gerar').disabled = !pronto;
    $('#status').className = 'status ' + (pronto ? 'st-ok' : 'st-pend');
    $('#status').textContent = A.simulado ? 'Resultado fictício: não exporte' : !leituraOk ? 'Leitura incompleta: não exporte' : pronto ? 'Pronto para o GradMent' : 'Aguardando validação humana';
    var av = $('#avisos'); av.innerHTML = '';
    res.avisos.forEach(function (t) { av.appendChild(el('li', { text: t })); });
  }
  function render() {
    var res = aplicar();
    topo(); leitura(); revisao(); barras(res.payload.preview.disciplinas); matriz(res); rodape(res);
  }

  document.querySelectorAll('[data-f]').forEach(function (b) { b.addEventListener('click', function () { filtro = b.getAttribute('data-f'); revisao(); }); });
  $('#aceitar-tudo').addEventListener('click', function () {
    if (!confirm('Aceitar a decisão da juíza em todos os itens ainda pendentes? Faça isso só depois de olhar os itens.')) return;
    divD.concat(divR).forEach(function (d) { if (!escolhas[d.id_divergencia]) escolhas[d.id_divergencia] = 'juiza'; }); render();
  });
  $('#f-per').addEventListener('change', function () { matriz(aplicar()); });
  $('#f-busca').addEventListener('input', function () { matriz(aplicar()); });
  $('#conferi').addEventListener('change', function () { rodape(aplicar()); });
  $('#gerar').addEventListener('click', function () {
    var res = aplicar();
    baixar('gradment-' + D.slug + '-json-validado.json', res.payload);
    baixar('gradment-' + D.slug + '-revisao-humana.json', { revisado_em: new Date().toISOString(), escolhas: escolhas, avisos: res.avisos,
      modelos: A.modelos, juiza: A.arbitragem_ia3 && { provider: A.arbitragem_ia3.provider, model: A.arbitragem_ia3.model } });
  });
  var per2 = {}; fin.disciplinas.forEach(function (d) { if (d.periodo !== null) per2[d.periodo] = 1; });
  Object.keys(per2).map(Number).sort(function (a, b) { return a - b; }).forEach(function (p) { $('#f-per').appendChild(el('option', { value: String(p), text: p + 'º período' })); });
  $('#f-per').appendChild(el('option', { value: 'opt', text: 'Optativas' }));
  var dl = $('#dl');
  dl.appendChild(el('a', { href: '#', text: 'JSON original (sem revisão)', onclick: function (e) { e.preventDefault(); baixar('gradment-' + D.slug + '-json-original.json', P); } }));
  dl.appendChild(el('a', { href: '#', text: 'Relatório de auditoria', onclick: function (e) { e.preventDefault(); baixar('gradment-' + D.slug + '-auditoria.json', A); } }));
  if (D.pdfs) ['ppc_pdf', 'ementas_pdf', 'turmas_componente_pdf', 'turmas_ofertadas_pdf'].forEach(function (k, i) {
    if (D.pdfs[k]) dl.appendChild(el('a', { href: 'data:application/pdf;base64,' + D.pdfs[k], download: (i + 1) + '_' + k + '_' + D.slug + '.pdf', text: 'PDF ' + (i + 1) + ': ' + k }));
  });
  if (!(divD.length + divR.length)) $('#aceitar-tudo').style.display = 'none';
  render();
})();
`;

const telaRevisao = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Revisão do PPC — ${esc(payload.preview.curso.nome_curso)}</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
  <div class="topo">
    <div>
      <h1>Revisão: ${esc(payload.preview.curso.nome_curso)}</h1>
      <p class="desc" style="margin:2px 0 0">Matriz ${esc(payload.preview.curso.ano_periodo)} · curso_id ${esc(payload.curso_id)} · confira as diferenças entre as IAs antes de importar no GradMent</p>
    </div>
    <span id="status" class="status st-pend">Aguardando validação humana</span>
  </div>
  <div id="topo"></div>

  <h2>Leitura do PPC</h2>
  <p class="desc">Cada IA lê o documento inteiro, em blocos de páginas; o resultado só aparece se todos os blocos foram lidos.</p>
  <div id="leitura"></div>

  <h2>Disciplinas por período</h2>
  <p class="desc">Já considerando as suas decisões abaixo.</p>
  <div id="barras" class="barras"></div>

  <h2>Revisão das divergências</h2>
  <p class="desc">Onde a IA 1 e a IA 2 discordaram. Os campos diferentes ficam destacados. Escolha o que vale em cada item; a sugestão da juíza vem marcada.</p>
  <div class="ferr">
    <button class="chip" data-f="pendentes">Pendentes</button><button class="chip" data-f="todas">Todas</button>
    <button class="chip" data-f="disc">Disciplinas</button><button class="chip" data-f="dep">Requisitos</button>
    <div class="prog"><i id="prog-bar"></i></div><span id="prog-txt" class="desc" style="margin:0"></span>
    <button id="aceitar-tudo" class="acao sec" type="button">Aceitar a juíza nos pendentes</button>
  </div>
  <div id="lista"></div>

  <h2>Matriz final</h2>
  <p class="desc"><span id="n-mat"></span>. A coluna “Origem” mostra de onde veio cada disciplina: consenso das duas IAs, decisão da juíza, sua escolha ou correção do validador.</p>
  <div class="ferr">
    <select id="f-per"><option value="">Todos os períodos</option></select>
    <input id="f-busca" type="search" placeholder="Buscar disciplina ou código" />
  </div>
  <div class="tab"><table>
    <thead><tr><th>Período</th><th>Código</th><th>Disciplina</th><th>CH</th><th>Pré-req.</th><th>Correq.</th><th>Origem</th></tr></thead>
    <tbody id="tb"></tbody>
  </table></div>

  <div class="final">
    <label><input type="checkbox" id="conferi" /> Conferi a matriz final</label>
    <button id="gerar" class="acao" type="button" disabled>Gerar JSON validado para o GradMent</button>
    <div style="flex-basis:100%">
      <ul id="avisos" class="avisos"></ul>
      <div id="dl" class="dl"></div>
    </div>
  </div>
</div>
<script id="dados" type="application/json">${dadosJson}</script>
<script>${js}</script>
</body>
</html>`;

// Casca entregue ao formulário: só o iframe, ocupando a tela toda
const html = `<meta charset="utf-8" /><style>html,body{margin:0;height:100%;overflow:hidden}</style>
<iframe title="Revisão do PPC" srcdoc="${esc(telaRevisao)}" style="position:fixed;inset:0;width:100%;height:100%;border:0;background:#f6f7fb"></iframe>`;

return [{
  json: {
    status: 200,
    content_type: 'text/html; charset=utf-8',
    resposta: html,
  },
}];
