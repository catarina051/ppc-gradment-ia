// Compara a saída do pipeline (resposta da API /webhook/converter-ppc) com um gabarito.
// Uso: node avaliacao/pontuar.mjs <execucao.json> <gabarito.json> [--json]
//
// Métricas:
//  - Disciplinas: precisão / revocação do inventário (casamento por código e, se faltar, por nome)
//  - Campos das disciplinas casadas: classificação obrigatória x optativa, período, carga horária
//  - Requisitos (PRE/CO): precisão / revocação das arestas, com e sem considerar o tipo
//  - Invariantes do GradMent na saída final (código, CH > 0, obrigatória -> optativa, ciclos)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const semAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const chave = (s) => semAcentos(String(s ?? '').replace(/\([A-Z]{2,5}\)/g, ' '))
  .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const soAlnum = (s) => semAcentos(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const ROMANOS = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };
const ordinais = (s) => chave(s).split(' ').map((t) => ROMANOS[t] || t).filter((t) => /^(I|II|III|IV|V|VI)$/.test(t)).join(',');
const tokens = (s) => new Set(chave(s).split(' ').filter((t) => t.length > 2));
function jaccard(a, b) {
  const A = tokens(a); const B = tokens(b);
  let i = 0; for (const t of A) if (B.has(t)) i++;
  return A.size + B.size - i === 0 ? 0 : i / (A.size + B.size - i);
}
export const pct = (n, d) => (d === 0 ? null : Math.round((1000 * n) / d) / 10);

// Encontra no gabarito a disciplina correspondente a um objeto {codigo, codigo_externo, nome}
export function acharNoGabarito(d, gab) {
  if (!d) return null;
  return gab.disciplinas.find((o) => soAlnum(d.codigo_externo) === soAlnum(o.sigla) || soAlnum(d.codigo) === soAlnum(o.sigla))
    || gab.disciplinas.find((o) => chave(d.nome) === chave(o.nome))
    || gab.disciplinas.find((o) => ordinais(d.nome) === ordinais(o.nome) && jaccard(d.nome, o.nome) >= 0.6)
    || null;
}

export function pontuar(exec, gab, nomeExecucao = '') {

const preview = exec.payload_gradment?.preview;
if (!preview) return { execucao: nomeExecucao, falhou: true, erro: JSON.stringify(exec).slice(0, 300) };
const saida = preview.disciplinas;
const ouro = gab.disciplinas;

// ---- Casamento disciplina a disciplina ----
const ouroLivre = new Set(ouro.map((_, i) => i));
const pares = []; // { s, o }
const semPar = [];
function casar(pred) {
  for (const s of saida) {
    if (pares.some((p) => p.s === s)) continue;
    for (const i of ouroLivre) {
      if (pred(s, ouro[i])) { pares.push({ s, o: ouro[i] }); ouroLivre.delete(i); break; }
    }
  }
}
casar((s, o) => soAlnum(s.codigo_externo) === soAlnum(o.sigla) || soAlnum(s.codigo) === soAlnum(o.sigla));
casar((s, o) => chave(s.nome) === chave(o.nome));
casar((s, o) => ordinais(s.nome) === ordinais(o.nome) && jaccard(s.nome, o.nome) >= 0.6);
for (const s of saida) if (!pares.some((p) => p.s === s)) semPar.push(s);
const faltando = [...ouroLivre].map((i) => ouro[i]);

const tp = pares.length;
let classeOk = 0; let periodoOk = 0; let chOk = 0; let chOkRelogio = 0;
const errosCampo = [];
for (const { s, o } of pares) {
  const sOpt = s.periodo === null;
  if (sOpt === o.optativa) classeOk++;
  if ((s.periodo ?? null) === (o.periodo ?? null)) periodoOk++;
  else errosCampo.push({ sigla: o.sigla, campo: 'periodo', esperado: o.periodo, obtido: s.periodo });
  if (s.carga_horaria === o.carga_horaria_horas_aula) chOk++;
  else if (s.carga_horaria === o.carga_horaria_horas_relogio) chOkRelogio++;
  else errosCampo.push({ sigla: o.sigla, campo: 'carga_horaria', esperado: o.carga_horaria_horas_aula, obtido: s.carga_horaria });
}

// ---- Requisitos ----
const codSaidaParaSigla = new Map(pares.map(({ s, o }) => [s.codigo, o.sigla]));
const arestasSaida = new Set();
const arestasSaidaSemTipo = new Set();
for (const d of preview.dependencias) {
  const a = codSaidaParaSigla.get(d.disciplina_codigo) || `?${d.disciplina_codigo}`;
  const b = codSaidaParaSigla.get(d.dependencia_codigo) || `?${d.dependencia_codigo}`;
  arestasSaida.add(`${a}|${b}|${d.tipo}`);
  arestasSaidaSemTipo.add(`${a}|${b}`);
}
const optOuro = new Set(ouro.filter((o) => o.optativa).map((o) => o.sigla));
const obrigOuro = new Set(ouro.filter((o) => !o.optativa).map((o) => o.sigla));
// Arestas Obrigatória -> Optativa existem no PPC mas são proibidas no GradMent (Regra 3): o validador
// as remove de propósito, então ficam fora do denominador de revocação.
const arestasOuro = new Set();
const arestasOuroSemTipo = new Set();
let proibidasRegra3 = 0;
for (const d of gab.dependencias) {
  if (obrigOuro.has(d.disciplina) && optOuro.has(d.requisito)) { proibidasRegra3++; continue; }
  arestasOuro.add(`${d.disciplina}|${d.requisito}|${d.tipo}`);
  arestasOuroSemTipo.add(`${d.disciplina}|${d.requisito}`);
}
const inter = (A, B) => [...A].filter((x) => B.has(x));
const depTp = inter(arestasSaida, arestasOuro).length;
const depTpSemTipo = inter(arestasSaidaSemTipo, arestasOuroSemTipo).length;

// ---- Invariantes GradMent na saída ----
const REGEX_COD = /^[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*$/;
const porCod = new Map(saida.map((d) => [d.codigo, d]));
const adj = new Map();
for (const d of preview.dependencias) {
  if (!adj.has(d.disciplina_codigo)) adj.set(d.disciplina_codigo, []);
  adj.get(d.disciplina_codigo).push(d.dependencia_codigo);
}
function temCiclo() {
  const cor = new Map();
  const visita = (u) => {
    cor.set(u, 1);
    for (const v of adj.get(u) || []) {
      if (cor.get(v) === 1) return true;
      if (!cor.get(v) && visita(v)) return true;
    }
    cor.set(u, 2);
    return false;
  };
  return [...adj.keys()].some((u) => !cor.get(u) && visita(u));
}
const invariantes = {
  codigos_validos: saida.every((d) => REGEX_COD.test(d.codigo) && d.codigo.length <= 20),
  codigos_unicos: new Set(saida.map((d) => d.codigo)).size === saida.length,
  obrigatorias_com_ch: saida.filter((d) => d.periodo !== null).every((d) => d.carga_horaria > 0),
  sem_obrigatoria_para_optativa: preview.dependencias.every((d) => !(porCod.get(d.disciplina_codigo)?.periodo !== null && porCod.get(d.dependencia_codigo)?.periodo === null)),
  grafo_aciclico: !temCiclo(),
};

const aud = exec.relatorio_auditoria || {};
const resultado = {
  execucao: nomeExecucao,
  status_consenso: aud.status_consenso,
  divergencias_detectadas: aud.total_divergencias_detectadas,
  modelos: Object.fromEntries(Object.entries(aud.modelos || {}).map(([k, v]) => [k, v ? `${v.provider}/${v.model}` : null])),
  juiza: aud.arbitragem_ia3?.acionada ? {
    provider: aud.arbitragem_ia3.provider,
    model: aud.arbitragem_ia3.model,
    decisoes_disciplinas: aud.arbitragem_ia3.decisoes_disciplinas?.length || 0,
    decisoes_dependencias: aud.arbitragem_ia3.decisoes_dependencias?.length || 0,
  } : null,
  correcoes_validador: (aud.correcoes_invariantes_gradment || []).length,
  disciplinas: {
    gabarito: ouro.length,
    extraidas: saida.length,
    casadas: tp,
    // gabarito parcial (só obrigatórias) não permite medir precisão: o que sobra pode ser optativa legítima
    precisao_pct: gab.parcial ? null : pct(tp, saida.length),
    revocacao_pct: pct(tp, ouro.length),
    classificacao_obrig_opt_pct: pct(classeOk, tp),
    periodo_exato_pct: pct(periodoOk, tp),
    carga_horaria_horas_aula_pct: pct(chOk, tp),
    carga_horaria_em_horas_relogio: chOkRelogio,
    faltando: faltando.map((o) => `${o.sigla} ${o.nome}`),
    extras: semPar.map((s) => `${s.codigo} ${s.nome}`),
  },
  requisitos: gab.sem_gabarito_requisitos ? { sem_gabarito: true, extraidos: arestasSaida.size } : {
    gabarito: arestasOuro.size,
    gabarito_obrig_para_optativa_excluidas: proibidasRegra3,
    extraidos: arestasSaida.size,
    precisao_pct: pct(depTp, arestasSaida.size),
    revocacao_pct: pct(depTp, arestasOuro.size),
    precisao_sem_tipo_pct: pct(depTpSemTipo, arestasSaidaSemTipo.size),
    revocacao_sem_tipo_pct: pct(depTpSemTipo, arestasOuroSemTipo.size),
    faltando: [...arestasOuro].filter((x) => !arestasSaida.has(x)),
    a_mais: [...arestasSaida].filter((x) => !arestasOuro.has(x)),
  },
  erros_de_campo: errosCampo,
  invariantes_gradment: invariantes,
  _mapa_codigo_para_sigla: Object.fromEntries(codSaidaParaSigla),
};
return resultado;
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (ehCli) {
const [, , caminhoExec, caminhoGab, flag] = process.argv;
const resultado = pontuar(JSON.parse(readFileSync(caminhoExec, 'utf8')), JSON.parse(readFileSync(caminhoGab, 'utf8')), caminhoExec.split(/[\/]/).pop());
if (resultado.falhou) { console.error('Execução sem payload_gradment:', resultado.erro); process.exit(1); }
const invariantes = resultado.invariantes_gradment;

if (flag === '--json') console.log(JSON.stringify(resultado, null, 2));
else {
  const d = resultado.disciplinas; const r = resultado.requisitos;
  console.log(`${resultado.execucao} | ${resultado.status_consenso} | div=${resultado.divergencias_detectadas} | ${JSON.stringify(resultado.modelos)}`);
  console.log(`  disciplinas: ${d.casadas}/${d.gabarito} (prec ${d.precisao_pct}%, rev ${d.revocacao_pct}%) | classe ${d.classificacao_obrig_opt_pct}% | período ${d.periodo_exato_pct}% | CH ${d.carga_horaria_horas_aula_pct}% (+${d.carga_horaria_em_horas_relogio} em h-relógio)`);
  console.log(`  requisitos: prec ${r.precisao_pct}% rev ${r.revocacao_pct}% | sem tipo: prec ${r.precisao_sem_tipo_pct}% rev ${r.revocacao_sem_tipo_pct}%`);
  console.log(`  invariantes: ${JSON.stringify(invariantes)}`);
}
}
