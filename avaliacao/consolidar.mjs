// Pontua todas as execuções de avaliacao/execucoes/ contra o gabarito correspondente, avalia cada
// decisão da 3ª IA (Juíza) e grava avaliacao/resultados.json (fonte de dados do dashboard).
// Uso: node avaliacao/consolidar.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acharNoGabarito, pct, pontuar } from './pontuar.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR = join(AQUI, 'execucoes');
const GABARITOS = {
  sintetico: JSON.parse(readFileSync(join(AQUI, 'gabaritos', 'sintetico.json'), 'utf8')),
  'cefet-engcomp': JSON.parse(readFileSync(join(AQUI, 'gabaritos', 'cefet-engcomp.json'), 'utf8')),
  'unifei-eco': JSON.parse(readFileSync(join(AQUI, 'gabaritos', 'unifei-eco.json'), 'utf8')),
};
const DESCRICAO = {
  sintetico: 'PPC sintético (10 disciplinas, 3 períodos)',
  'cefet-engcomp': 'PPC real: Eng. de Computação CEFET-MG Leopoldina (190 páginas, 99 disciplinas)',
  'unifei-eco': 'PPC real de outro layout: Eng. de Computação UNIFEI Itabira (136 páginas; gabarito parcial: 74 obrigatórias)',
};

const tempos = new Map(
  readFileSync(join(DIR, 'tempos.csv'), 'utf8').trim().split('\n').slice(1)
    .map((l) => l.split(','))
    .map(([, execucao, inicio, http, seg]) => [execucao, { inicio, http: Number(http), segundos: Number(seg) }]),
);

const mesmoValor = (a, b) => (a ?? null) === (b ?? null);
// Uma versão de disciplina está "certa" se existir no gabarito com o mesmo período e a mesma CH
function versaoCerta(v, gab) {
  const o = acharNoGabarito(v, gab);
  if (!v) return null;
  if (!o) return false; // disciplina inexistente
  return mesmoValor(v.periodo, o.periodo) && v.carga_horaria === o.carga_horaria_horas_aula;
}

function avaliarJuiza(exec, gab, mapaCodSigla) {
  const aud = exec.relatorio_auditoria;
  if (!aud?.arbitragem_ia3?.acionada) return null;
  const finais = exec.payload_gradment.preview.disciplinas;
  const decisoesDisc = new Map(aud.arbitragem_ia3.decisoes_disciplinas.map((d) => [d.id_divergencia, d]));
  const itens = [];

  for (const div of aud.divergencias_iniciais.disciplinas) {
    const dec = decisoesDisc.get(div.id_divergencia);
    const ref = div.ia1 || div.ia2;
    const ouro = acharNoGabarito(ref, gab);
    // Procura a versão final pela disciplina real (não pelo código): se a juíza descartou uma duplicata
    // (ex.: ORGA01 = OCOM0 com outro código), a disciplina continua presente e o descarte está certo.
    const final = (ouro && finais.find((d) => acharNoGabarito(d, gab)?.sigla === ouro.sigla))
      || finais.find((d) => d.codigo === div.codigo_sugerido) || null;
    const ia1Certa = div.ia1 ? versaoCerta(div.ia1, gab) : !ouro; // ausente na IA 1: certo se não existe
    const ia2Certa = div.ia2 ? versaoCerta(div.ia2, gab) : !ouro;
    const finalCerta = final ? versaoCerta(final, gab) : !ouro;
    const estruturalIgual = div.ia1 && div.ia2 && mesmoValor(div.ia1.periodo, div.ia2.periodo)
      && div.ia1.carga_horaria === div.ia2.carga_horaria;
    itens.push({
      tipo: 'disciplina',
      id: div.id_divergencia,
      sigla: ouro?.sigla || div.codigo_sugerido,
      nome: ref?.nome,
      motivo: div.motivo,
      so_ementa_divergia: Boolean(estruturalIgual),
      acao_juiza: dec?.acao || 'OMITIDA',
      pagina_citada: dec?.pagina_evidencia || null,
      esperado: ouro ? { periodo: ouro.periodo, carga_horaria: ouro.carga_horaria_horas_aula } : 'não existe no PPC',
      ia1: div.ia1 ? { periodo: div.ia1.periodo, carga_horaria: div.ia1.carga_horaria } : null,
      ia2: div.ia2 ? { periodo: div.ia2.periodo, carga_horaria: div.ia2.carga_horaria } : null,
      final: final ? { periodo: final.periodo, carga_horaria: final.carga_horaria } : null,
      ia1_certa: ia1Certa,
      ia2_certa: ia2Certa,
      final_certo: finalCerta,
      efeito_juiza: (ia1Certa || ia2Certa) && !finalCerta ? 'PIOROU'
        : !(ia1Certa && ia2Certa) && finalCerta ? 'CORRIGIU'
          : finalCerta ? 'MANTEVE_CERTO' : 'MANTEVE_ERRADO',
    });
  }

  const arestasOuro = new Set(gab.dependencias.map((d) => `${d.disciplina}|${d.requisito}|${d.tipo}`));
  const decisoesDep = new Map(aud.arbitragem_ia3.decisoes_dependencias.map((d) => [d.id_divergencia, d]));
  const sig = (c) => mapaCodSigla[c] || `?${c}`;
  for (const div of aud.divergencias_iniciais.dependencias) {
    const dec = decisoesDep.get(div.id_divergencia);
    const a = sig(div.disciplina_codigo); const b = sig(div.dependencia_codigo);
    const tipoOuro = arestasOuro.has(`${a}|${b}|PRE`) ? 'PRE' : arestasOuro.has(`${a}|${b}|CO`) ? 'CO' : null;
    const ia1Certa = (div.ia1_tipo || null) === tipoOuro;
    const ia2Certa = (div.ia2_tipo || null) === tipoOuro;
    const tipoFinal = dec ? (dec.incluir ? (dec.tipo === 'CO' ? 'CO' : 'PRE') : null) : (div.ia1_tipo || div.ia2_tipo);
    const finalCerto = tipoFinal === tipoOuro;
    itens.push({
      tipo: 'requisito',
      id: div.id_divergencia,
      aresta: `${a} → ${b}`,
      motivo: div.motivo,
      acao_juiza: dec ? (dec.incluir ? `INCLUIR_${dec.tipo}` : 'EXCLUIR') : 'OMITIDA',
      pagina_citada: dec?.pagina_evidencia || null,
      esperado: tipoOuro || 'não existe',
      ia1: div.ia1_tipo || null,
      ia2: div.ia2_tipo || null,
      final: tipoFinal,
      ia1_certa: ia1Certa,
      ia2_certa: ia2Certa,
      final_certo: finalCerto,
      efeito_juiza: (ia1Certa || ia2Certa) && !finalCerto ? 'PIOROU'
        : !(ia1Certa && ia2Certa) && finalCerto ? 'CORRIGIU'
          : finalCerto ? 'MANTEVE_CERTO' : 'MANTEVE_ERRADO',
    });
  }

  const n = itens.length;
  const conta = (f) => itens.filter(f).length;
  return {
    modelo_juiza: `${aud.arbitragem_ia3.provider}/${aud.arbitragem_ia3.model}`,
    divergencias: n,
    acerto_estrategias_pct: {
      juiza: pct(conta((i) => i.final_certo), n),
      sempre_ia1: pct(conta((i) => i.ia1_certa), n),
      sempre_ia2: pct(conta((i) => i.ia2_certa), n),
      oraculo_melhor_das_duas: pct(conta((i) => i.ia1_certa || i.ia2_certa), n),
    },
    efeito: {
      corrigiu: conta((i) => i.efeito_juiza === 'CORRIGIU'),
      piorou: conta((i) => i.efeito_juiza === 'PIOROU'),
      manteve_certo: conta((i) => i.efeito_juiza === 'MANTEVE_CERTO'),
      manteve_errado: conta((i) => i.efeito_juiza === 'MANTEVE_ERRADO'),
    },
    divergencias_so_de_ementa: conta((i) => i.so_ementa_divergia),
    pioras_em_divergencias_so_de_ementa: conta((i) => i.so_ementa_divergia && i.efeito_juiza === 'PIOROU'),
    itens,
  };
}

const execucoes = [];
for (const arq of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  const nome = arq.replace(/\.json$/, '');
  const caso = nome.replace(/-\d+$/, '');
  const gab = GABARITOS[caso];
  if (!gab) continue;
  let exec;
  try { exec = JSON.parse(readFileSync(join(DIR, arq), 'utf8')); } catch { exec = { erro: 'resposta não-JSON' }; }
  const t = tempos.get(nome) || {};
  const p = pontuar(exec, gab, nome);
  if (p.falhou) {
    execucoes.push({ execucao: nome, caso, sucesso: false, http: t.http, segundos: t.segundos, erro: p.erro });
    continue;
  }
  const { _mapa_codigo_para_sigla: mapa, ...resto } = p;
  execucoes.push({
    caso,
    sucesso: true,
    inicio: t.inicio,
    segundos: t.segundos,
    extracao: exec.relatorio_auditoria?.documento_entrada || null,
    ...resto,
    mesmo_modelo_ia1_ia2: resto.modelos.ia1 === resto.modelos.ia2,
    avaliacao_juiza: avaliarJuiza(exec, gab, mapa),
  });
}

const media = (xs0) => { const xs = xs0.filter((x) => x != null); return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null; };
const resumo = {};
for (const caso of Object.keys(GABARITOS)) {
  const ex = execucoes.filter((e) => e.caso === caso);
  const ok = ex.filter((e) => e.sucesso);
  if (!ex.length) continue;
  const comJuiza = ok.filter((e) => e.avaliacao_juiza);
  resumo[caso] = {
    descricao: DESCRICAO[caso],
    gabarito: { disciplinas: GABARITOS[caso].total_disciplinas, requisitos: GABARITOS[caso].total_dependencias, parcial: Boolean(GABARITOS[caso].parcial) },
    execucoes: ex.length,
    sucesso: ok.length,
    tempo_medio_s: media(ok.map((e) => e.segundos)),
    tempo_min_s: ok.length ? Math.min(...ok.map((e) => e.segundos)) : null,
    tempo_max_s: ok.length ? Math.max(...ok.map((e) => e.segundos)) : null,
    disciplinas_revocacao_media_pct: media(ok.map((e) => e.disciplinas.revocacao_pct)),
    disciplinas_precisao_media_pct: media(ok.map((e) => e.disciplinas.precisao_pct)),
    classificacao_obrig_opt_media_pct: media(ok.map((e) => e.disciplinas.classificacao_obrig_opt_pct)),
    periodo_exato_medio_pct: media(ok.map((e) => e.disciplinas.periodo_exato_pct)),
    carga_horaria_media_pct: media(ok.map((e) => e.disciplinas.carga_horaria_horas_aula_pct)),
    requisitos_precisao_media_pct: media(ok.map((e) => e.requisitos.precisao_pct)),
    requisitos_revocacao_media_pct: media(ok.map((e) => e.requisitos.revocacao_pct)),
    invariantes_gradment_ok: `${ok.filter((e) => Object.values(e.invariantes_gradment).every(Boolean)).length}/${ok.length}`,
    execucoes_com_ia1_e_ia2_no_mesmo_modelo: ok.filter((e) => e.mesmo_modelo_ia1_ia2).length,
    juiza_acionada: comJuiza.length,
    juiza_corrigiu: comJuiza.reduce((a, e) => a + e.avaliacao_juiza.efeito.corrigiu, 0),
    juiza_piorou: comJuiza.reduce((a, e) => a + e.avaliacao_juiza.efeito.piorou, 0),
  };
}

const saida = {
  gerado_em: new Date().toISOString(),
  observacao: 'Gerado por avaliacao/consolidar.mjs a partir das respostas reais da API. Nenhum número é estimado.',
  resumo,
  execucoes,
};
writeFileSync(join(AQUI, 'resultados.json'), `${JSON.stringify(saida, null, 2)}\n`);
console.log(JSON.stringify(resumo, null, 2));
for (const e of execucoes.filter((x) => x.avaliacao_juiza)) {
  console.log(`\n${e.execucao}: juíza ${e.avaliacao_juiza.modelo_juiza}`, JSON.stringify(e.avaliacao_juiza.acerto_estrategias_pct), JSON.stringify(e.avaliacao_juiza.efeito));
}

// ---- Dados compactos para o dashboard (v0) ----
const COBERTURA_CEFET = {
  // Medido rodando o próprio extrator (services/extrator/app.py) sobre o PDF; ver avaliacao/RESULTADOS.md
  paginas_total: 190,
  paginas_enviadas_as_ias: 53,
  caracteres_texto_bruto: 553462,
  caracteres_enviados_as_ias: 124437,
  blocos_detalhamento_total: 99,
  blocos_detalhamento_enviados: 89,
  disciplinas_cortadas: ['AEDA0', 'POOB0', 'APAL0', 'MNUM1', 'LFAU0', 'OCOM0', 'ACOM0', 'TCOM0', 'IART0', 'CEVO0'],
};
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const dashboard = {
  gerado_em: saida.gerado_em,
  fonte: 'Execuções reais do pipeline n8n pontuadas contra gabarito determinístico (avaliacao/resultados.json)',
  resumo_por_caso: Object.entries(resumo).map(([caso, r]) => ({ caso, ...r })),
  execucoes: execucoes.map((e) => (e.sucesso ? {
    id: e.execucao,
    caso: e.caso,
    segundos: r1(e.segundos),
    modelo_ia1: e.modelos.ia1,
    modelo_ia2: e.modelos.ia2,
    modelo_ia3: e.juiza ? `${e.juiza.provider}/${e.juiza.model}` : null,
    ia1_e_ia2_mesmo_modelo: e.mesmo_modelo_ia1_ia2,
    divergencias: e.divergencias_detectadas,
    juiza_acionada: Boolean(e.avaliacao_juiza),
    disciplinas_encontradas_pct: e.disciplinas.revocacao_pct,
    obrig_vs_optativa_pct: e.disciplinas.classificacao_obrig_opt_pct,
    periodo_pct: e.disciplinas.periodo_exato_pct,
    carga_horaria_pct: e.disciplinas.carga_horaria_horas_aula_pct,
    requisitos_precisao_pct: e.requisitos.precisao_pct,
    requisitos_revocacao_pct: e.requisitos.revocacao_pct,
    regras_gradment_ok: Object.values(e.invariantes_gradment).every(Boolean),
    juiza_corrigiu: e.avaliacao_juiza?.efeito.corrigiu ?? null,
    juiza_piorou: e.avaliacao_juiza?.efeito.piorou ?? null,
    juiza_manteve_certo: e.avaliacao_juiza?.efeito.manteve_certo ?? null,
    juiza_manteve_errado: e.avaliacao_juiza?.efeito.manteve_errado ?? null,
    acerto_nas_divergencias_juiza_pct: e.avaliacao_juiza?.acerto_estrategias_pct.juiza ?? null,
    acerto_nas_divergencias_sempre_ia1_pct: e.avaliacao_juiza?.acerto_estrategias_pct.sempre_ia1 ?? null,
    acerto_nas_divergencias_sempre_ia2_pct: e.avaliacao_juiza?.acerto_estrategias_pct.sempre_ia2 ?? null,
  } : { id: e.execucao, caso: e.caso, falhou: true, segundos: r1(e.segundos), erro: e.erro })),
  decisoes_juiza: execucoes.filter((e) => e.avaliacao_juiza).flatMap((e) => e.avaliacao_juiza.itens.map((i) => ({
    execucao: e.execucao,
    id: i.id,
    tipo: i.tipo,
    item: i.tipo === 'disciplina' ? `${i.sigla} ${i.nome || ''}`.trim() : i.aresta,
    motivo: i.motivo,
    so_ementa_divergia: i.so_ementa_divergia ?? false,
    acao_juiza: i.acao_juiza,
    pagina_citada: i.pagina_citada,
    esperado: typeof i.esperado === 'object' ? `período ${i.esperado.periodo ?? 'optativa'}, ${i.esperado.carga_horaria}h` : i.esperado,
    efeito: i.efeito_juiza,
  }))),
  cobertura_texto_ppc_real: COBERTURA_CEFET,
  tempo_manual: {
    minutos: null,
    status: 'A MEDIR',
    protocolo: 'Cronometrar a digitação manual de 1 período do PPC real (disciplinas, CH, período, pré/correquisitos) e extrapolar pelos 10 períodos + optativas; medir à parte o tempo de revisão humana da saída do pipeline.',
  },
  volume_por_ppc_real: { disciplinas: 99, campos_por_disciplina: 6, requisitos: 109 },
};
writeFileSync(join(AQUI, 'dashboard-dados.json'), `${JSON.stringify(dashboard, null, 2)}\n`);
