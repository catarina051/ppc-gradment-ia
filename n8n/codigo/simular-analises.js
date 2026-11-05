// @usa-compartilhado
// Modo demonstração (quando não há chaves de API no .env ou o usuário escolhe testar consenso/divergência).
// Extrai dados reais do PPC enviado por heurísticas + suporta injetar divergência controlada para demonstrar a 3ª IA!
const prep = $input.first().json;
const texto = prep.texto_sanitizado || '';

// Extrai nome do curso se presente no texto, ou usa Ciência da Computação
const matchCurso = texto.match(/CURSO\s+DE\s+(?:BACHARELADO\s+EM\s+|LICENCIATURA\s+EM\s+)?([^\n–-]{4,80})/i);
const nomeCursoExtraido = prep.nome_curso_esperado
  || (matchCurso ? limparTextoUnicaLinha(matchCurso[1]).replace(/\s+Matriz.*$/i, '') : 'Ciência da Computação');

const baseDisciplinasIa1 = [
  {
    codigo: 'MAT101',
    codigo_externo: 'MAT-101',
    nome: 'Cálculo I',
    periodo: 1,
    eixo: 'Matemática e Ciências Básicas',
    carga_horaria: 60,
    ementa: 'Números reais, funções de uma variável real, limites, continuidade, derivadas e aplicações, integral definida e Teorema Fundamental do Cálculo.',
  },
  {
    codigo: 'DCC101',
    codigo_externo: 'DCC-101',
    nome: 'Algoritmos e Programação de Computadores',
    periodo: 1,
    eixo: 'Fundamentos de Computação e Algoritmos',
    carga_horaria: 60,
    ementa: 'Conceito de algoritmo, variáveis, tipos primitivos, estruturas condicionais, laços de repetição, vetores, matrizes, registros e modularização com funções.',
  },
  {
    codigo: 'DCC102',
    codigo_externo: 'DCC-102',
    nome: 'Laboratório de Programação',
    periodo: 1,
    eixo: 'Fundamentos de Computação e Algoritmos',
    carga_horaria: 30,
    ementa: 'Prática intensiva de implementação, depuração e testes de programas estruturados em linguagem de programação imperativa.',
  },
  {
    codigo: 'MAT102',
    codigo_externo: 'MAT-102',
    nome: 'Cálculo II',
    periodo: 2,
    eixo: 'Matemática e Ciências Básicas',
    carga_horaria: 60,
    ementa: 'Técnicas de integração, integrais impróprias, sequências e séries numéricas, funções reais de várias variáveis e derivadas parciais.',
  },
  {
    codigo: 'DCC201',
    codigo_externo: 'DCC-201',
    nome: 'Algoritmos e Estruturas de Dados',
    periodo: 2,
    eixo: 'Fundamentos de Computação e Algoritmos',
    carga_horaria: 60,
    ementa: 'Análise assintótica de complexidade, listas lineares, pilhas, filas, árvores binárias de busca, árvores balanceadas, tabelas hash e ordenação.',
  },
  {
    codigo: 'DCC202',
    codigo_externo: 'DCC-202',
    nome: 'Banco de Dados I',
    periodo: 2,
    eixo: 'Engenharia de Software e Dados',
    carga_horaria: 60,
    ementa: 'Arquitetura de SGBDs, modelagem conceitual entidade-relacionamento, modelo relacional, álgebra relacional, linguagem SQL e normalização.',
  },
  {
    codigo: 'DCC301',
    codigo_externo: 'DCC-301',
    nome: 'Engenharia de Software I',
    periodo: 3,
    eixo: 'Engenharia de Software e Dados',
    carga_horaria: 60,
    ementa: 'Processos de desenvolvimento de software, engenharia de requisitos, modelagem UML, arquitetura de software, verificação, validação e testes automatizados.',
  },
  {
    codigo: 'TCC01',
    codigo_externo: 'TCC',
    nome: 'Trabalho de Conclusão de Curso I',
    periodo: 3,
    eixo: 'Engenharia de Software e Dados',
    carga_horaria: 60,
    ementa: 'Elaboração e defesa de proposta de projeto de pesquisa ou desenvolvimento tecnológico em Ciência da Computação sob orientação docente. Exige integralização prévia mínima de 1.200 horas obrigatórias.',
  },
  {
    codigo: 'DCC810',
    codigo_externo: 'DCC-810',
    nome: 'Tópicos Especiais em Inteligência Artificial',
    periodo: null,
    eixo: 'Formação Complementar e Optativa',
    carga_horaria: 60,
    ementa: 'Fundamentos de agentes inteligentes, busca heurística, aprendizado de máquina supervisionado e não supervisionado e introdução a redes neurais profundas.',
  },
  {
    codigo: 'DCC820',
    codigo_externo: 'DCC-820',
    nome: 'Computação em Nuvem e Sistemas Distribuídos',
    periodo: null,
    eixo: 'Formação Complementar e Optativa',
    carga_horaria: 60,
    ementa: 'Modelos de serviço em nuvem, virtualização, contêineres, orquestração, sistemas distribuídos tolerantes a falhas e escalabilidade horizontal.',
  },
];

const baseDependenciasIa1 = [
  { disciplina_codigo: 'DCC102', dependencia_codigo: 'DCC101', tipo: 'CO' },
  { disciplina_codigo: 'MAT102', dependencia_codigo: 'MAT101', tipo: 'PRE' },
  { disciplina_codigo: 'DCC201', dependencia_codigo: 'DCC101', tipo: 'PRE' },
  { disciplina_codigo: 'DCC201', dependencia_codigo: 'DCC102', tipo: 'PRE' },
  { disciplina_codigo: 'DCC202', dependencia_codigo: 'DCC101', tipo: 'PRE' },
  { disciplina_codigo: 'DCC202', dependencia_codigo: 'DCC201', tipo: 'CO' },
  { disciplina_codigo: 'DCC301', dependencia_codigo: 'DCC201', tipo: 'PRE' },
  { disciplina_codigo: 'DCC301', dependencia_codigo: 'DCC202', tipo: 'PRE' },
  { disciplina_codigo: 'TCC01', dependencia_codigo: 'DCC301', tipo: 'PRE' },
  { disciplina_codigo: 'DCC810', dependencia_codigo: 'DCC201', tipo: 'PRE' },
  { disciplina_codigo: 'DCC820', dependencia_codigo: 'DCC202', tipo: 'PRE' },
];

// Na IA 2 em consenso: usa até um código interno diferente para TCC (TCCG1 vs TCC01) para provar que
// nosso comparador semântico NÃO gera falso-positivo quando código gerado difere mas tudo o mais bate!
const disciplinasIa2 = JSON.parse(JSON.stringify(baseDisciplinasIa1)).map((d) => (
  d.codigo === 'TCC01' ? { ...d, codigo: 'TCCG1' } : d
));
let dependenciasIa2 = JSON.parse(JSON.stringify(baseDependenciasIa1)).map((dep) => ({
  ...dep,
  disciplina_codigo: dep.disciplina_codigo === 'TCC01' ? 'TCCG1' : dep.disciplina_codigo,
}));

if (prep.cenario_simulacao === 'divergencia') {
  // Injeta 3 divergências acadêmicas clássicas para acionar e demonstrar a 3ª IA (Juíza):
  // 1) Carga horária divergente em DCC102 (IA 2 leu 60h em vez de 30h)
  const lab = disciplinasIa2.find((d) => d.codigo === 'DCC102');
  if (lab) lab.carga_horaria = 60;

  // 2) IA 2 esqueceu de extrair a optativa DCC820
  const idxOpt = disciplinasIa2.findIndex((d) => d.codigo === 'DCC820');
  if (idxOpt !== -1) disciplinasIa2.splice(idxOpt, 1);
  dependenciasIa2 = dependenciasIa2.filter((dep) => dep.disciplina_codigo !== 'DCC820');

  // 3) Tipo de dependência divergente em DCC202 -> DCC201 (IA 2 marcou PRE em vez de CO)
  const depBd = dependenciasIa2.find((dep) => dep.disciplina_codigo === 'DCC202' && dep.dependencia_codigo === 'DCC201');
  if (depBd) depBd.tipo = 'PRE';
}

const resultadoIa1 = {
  e_ppc_valido: true,
  alerta_instrucao_suspeita: false,
  verificacao_inicial: {
    nome_curso_identificado: nomeCursoExtraido,
    regra_conversao_creditos: '1 crédito = 15 horas-aula',
    total_periodos_obrigatorios: 3,
    total_obrigatorias_contadas: 8,
    total_optativas_contadas: 2,
    observacoes: 'Exigência de 1.200h do TCC mantida apenas na ementa (Regra 5).',
  },
  curso: { nome_curso: nomeCursoExtraido, ano_periodo: prep.ano_periodo },
  disciplinas: baseDisciplinasIa1,
  dependencias: baseDependenciasIa1,
};

const resultadoIa2 = {
  e_ppc_valido: true,
  alerta_instrucao_suspeita: false,
  verificacao_inicial: {
    nome_curso_identificado: nomeCursoExtraido,
    regra_conversao_creditos: '1 crédito = 15 horas-aula',
    total_periodos_obrigatorios: 3,
    total_obrigatorias_contadas: 8,
    total_optativas_contadas: prep.cenario_simulacao === 'divergencia' ? 1 : 2,
    observacoes: 'Conferência bottom-up pelo ementário concluída.',
  },
  curso: { nome_curso: nomeCursoExtraido, ano_periodo: prep.ano_periodo },
  disciplinas: disciplinasIa2,
  dependencias: dependenciasIa2,
};

return [
  {
    json: {
      slot: 'ia1',
      provider: 'simulado',
      model: 'simulado-matriz-v1',
      finish_reason: 'STOP',
      simulado: true,
      erro: null,
      resultado: resultadoIa1,
    },
  },
  {
    json: {
      slot: 'ia2',
      provider: 'simulado',
      model: 'simulado-ementario-v1',
      finish_reason: 'STOP',
      simulado: true,
      erro: null,
      resultado: resultadoIa2,
    },
  },
];

