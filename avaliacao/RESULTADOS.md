# Resultados medidos

> Todos os números vêm de **9 execuções reais** do pipeline, mais 3 tentativas do processo anterior (um modelo só) e uma contagem oficial de tokens do Claude, (n8n + APIs gratuitas), feitas em 05/11/2026 e pontuadas contra um **gabarito gerado sem LLM**. Nada aqui é estimativa. O único valor calculado, e não medido, é o piso de tempo de digitação em [manual/TEMPO-MANUAL.md](manual/TEMPO-MANUAL.md), com a premissa explícita.
>
> Para reproduzir: `sh avaliacao/rodar.sh <rótulo> <ppc> <n>` e depois `node avaliacao/consolidar.mjs`. Dados completos em [resultados.json](resultados.json); dados do dashboard em [dashboard-dados.json](dashboard-dados.json).

## Resumo

| | PPC sintético | PPC real CEFET-MG | PPC real UNIFEI (outro layout) |
| --- | ---: | ---: | ---: |
| Execuções | 5 | 3 | 1 |
| Tempo médio por PPC | **43,8 s** | **7 min 12 s** (431,5 s) | **6 min 21 s** (381,0 s) |
| Disciplinas encontradas | 100% | **100%** (99/99) | **98,6%** (73/74 obrigatórias) |
| Obrigatória × optativa correta | 100% | 98,0% | 100% |
| Período correto | 100% | 97,6% | 98,6% |
| Carga horária correta | 100% | **100%** | 100% |
| Requisitos: precisão | 100% | **96,1%** | sem gabarito |
| Requisitos: revocação | 98,2% | **82,0%** | sem gabarito |
| Saída válida nas 7 regras do GradMent | 5/5 | 3/3 | 1/1 |

**Efeito da 3ª IA (juíza)**, somando todas as execuções em que ela foi chamada e comparando cada decisão com o gabarito:

| Juíza... | Divergências julgadas | Corrigiu | Piorou | Acerto final |
| --- | ---: | ---: | ---: | ---: |
| em **modelo diferente** das IAs 1 e 2 (GPT-OSS ou Gemini) | 40 | 31 | **1** | **92,5%** |
| no **mesmo modelo** das IAs 1 e 2 (Nemotron, após fallback) | 65 | 26 | **22** | **66,2%** |

---

## Como medi

| Caso | Documento | Gabarito |
| --- | --- | --- |
| `sintetico` | [samples/ppc-ciencia-computacao.pdf](../samples/ppc-ciencia-computacao.pdf): 10 disciplinas, códigos com hífen, um TCC sem código e um requisito não-disciplinar ("1.200 horas") | Escrito à mão: 10 disciplinas e 11 requisitos |
| `cefet-engcomp` | PPC real de Eng. de Computação do CEFET-MG Leopoldina (`PPCEngComp-v20240719.pdf`, 190 páginas, documento público) | [gerar_gabarito_cefet.py](gerar_gabarito_cefet.py) lê os 99 blocos "Detalhamento de Disciplinas": **99 disciplinas (57 obrigatórias, 42 optativas) e 109 requisitos**. Validação cruzada: 56 das 57 obrigatórias batem com os quadros de período. A exceção é uma inconsistência do próprio PPC (SDIG0, 6º × 5º período), e as duas leituras são aceitas. |
| `unifei-eco` | PPC real de Eng. de Computação da UNIFEI Itabira (136 páginas, layout diferente) | [gerar_gabarito_unifei.py](gerar_gabarito_unifei.py) lê as tabelas por período: **74 obrigatórias com período e CH**. O gabarito é parcial (sem optativas nem requisitos), então não mede precisão. |

**Métricas** ([pontuar.mjs](pontuar.mjs)):
- **Disciplinas encontradas:** revocação do inventário.
- **Obrigatória × optativa, período e CH:** percentual de acerto entre as disciplinas encontradas.
- **Requisitos:** precisão (das arestas criadas, quantas existem no PPC) e revocação (das arestas do PPC, quantas foram criadas).
- **Juíza:** cada divergência julgada é comparada com o gabarito e classificada como *corrigiu*, *piorou*, *manteve certo* ou *manteve errado* ([consolidar.mjs](consolidar.mjs)).

---

## 1. PPC sintético: 5 execuções

| Execução | Tempo | IA 1 | IA 2 | Juíza | Divergências | Requisitos (prec / rev) |
| --- | ---: | --- | --- | --- | ---: | ---: |
| sintetico-01 | 39,0 s | Nemotron* | Nemotron | não acionada | 0 | 100% / **90,9%** |
| sintetico-02 | 42,4 s | Gemini 3.6 Flash | Nemotron | GPT-OSS 120B | 1 | 100% / 100% |
| sintetico-03 | 60,1 s | Gemini 3.6 Flash | Nemotron | GPT-OSS 120B | 1 | 100% / 100% |
| sintetico-04 | 49,2 s | Gemini 3.6 Flash | Nemotron | GPT-OSS 120B | 1 | 100% / 100% |
| sintetico-05 | 28,2 s | Gemini 3.6 Flash | Nemotron | GPT-OSS 120B | 1 | 100% / 100% |

Disciplinas, período e CH ficaram em 100% em todas as execuções. \* O Gemini configurado (`gemini-3.5-flash-lite`) respondeu `503 – high demand`, e o fallback levou a IA 1 para o **mesmo modelo** da IA 2.

- O PPC tem uma pegadinha: o TCC exige "Engenharia de Software I **e** 1.200 horas". A aresta TCC → DCC301 deve entrar e as horas não. **O Nemotron derruba as duas partes.**
- Com **modelos diferentes** (02 a 05), o Gemini acertou, o comparador detectou exatamente essa divergência e a juíza resolveu certo **4 de 4** vezes.
- Com o **mesmo modelo** (01), as duas IAs erraram igual, nada divergiu, a juíza não foi chamada e o erro chegou à saída.

---

## 2. PPC real CEFET-MG: 3 execuções

| Execução | Tempo | IA 1 / IA 2 | Juíza | Divergências | Obrig./opt. | Período | Requisitos (prec / rev) | Juíza: corrigiu / piorou | Acerto da juíza × "sempre IA 1" |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| cefet-engcomp-01 | 6 min 43 s | Nemotron / Nemotron | Nemotron | 27 | 93,9% | 93,9% | 95,5% / 77,1% | 11 / **13** | 51,9% × 77,8% |
| cefet-engcomp-02 | 7 min 36 s | Nemotron / Nemotron | Nemotron | 31 | 100% | 99,0% | 94,8% / 84,4% | 13 / 8 | 74,2% × 80,6% |
| cefet-engcomp-03 | 7 min 14 s | Nemotron / Nemotron | **Gemini 3.6 Flash** | 36 | 100% | 100% | **97,9% / 84,4%** | **27 / 1** | **91,7%** × 50,0% |

Nas três execuções, 99/99 disciplinas foram encontradas, a CH ficou 100% correta e a saída passou nas 7 regras do GradMent. **No PPC grande, o Gemini nunca atendeu como IA 1** (o fallback caiu no Nemotron nas 3 vezes). A juíza só ficou em um modelo diferente na execução 03, que foi justamente a melhor.

### O que deu errado na execução 01, passo a passo

1. **O extrator cortou o documento.** O PPC tem 190 páginas e cerca de 553 mil caracteres. Acima de 125 mil, o extrator manda só as páginas com mais termos curriculares: **53 páginas e 124.437 caracteres (22%)**. Dos 99 blocos de detalhamento, **89** chegaram às IAs. Ficaram de fora as páginas 69 a 72 e 82, com **AEDA0, POOB0, APAL0, MNUM1, LFAU0, OCOM0, ACOM0, TCOM0, IART0 e CEVO0**.
2. **Falsas divergências.** Sem a página, as duas IAs escreveram "não há ementa" com palavras diferentes ("Não há ementa detalhada no PPC" e "Não detalhada no Quadro 12"). O comparador achou os textos diferentes e marcou **"ementa divergente"**. Das 14 divergências de disciplina, **7 eram só de ementa**.
3. **A juíza reescreveu o que estava certo.** A juíza (também Nemotron, sem as páginas) consultou o *Quadro 15 – Disciplinas Optativas* e marcou como optativas 6 disciplinas em que **as duas IAs concordavam no período**: Algoritmos e Estruturas de Dados (2º período), POO, APA, Linguagens Formais, Teoria da Computação e Métodos Numéricos I.
4. **Efeito cascata.** O validador aplicou corretamente a Regra 3 e removeu os requisitos de obrigatórias para essas "optativas".

**De onde vieram os 25 requisitos faltantes da execução 01:**

| Causa | Requisitos |
| --- | ---: |
| Envolvem as disciplinas com páginas cortadas, que a juíza transformou em optativas | 12 |
| A juíza excluiu uma aresta que existia | 7 |
| Tipo trocado (PRE no lugar de CO) | 4 |
| Nenhuma IA extraiu | 2 |

**Viés da juíza:** em todas as execuções, ela decidiu **excluir** um requisito 31 vezes e acertou só **13 (42%)**. Quando só uma das IAs aponta um requisito, a juíza tende a cortar, e na maioria das vezes o requisito existia.

---

## 3. PPC de outro layout (UNIFEI Itabira): 1 execução

- **6 min 21 s**, com 87 disciplinas extraídas (76 obrigatórias e 11 optativas) e 60 requisitos.
- Das **74 obrigatórias** da matriz, **73 foram encontradas**. Período e obrigatória × optativa ficaram 98,6% e 100% corretos, e a CH, 100%.
- O único erro de inventário vem de um **código duplicado no próprio PPC**: as fichas de "Projeto Aplicado de Eletrônica" e de "Processamento Digital de Sinais" usam o mesmo código `ELTi2216`. O comparador pareia por código e fundiu as duas. A matriz desambigua (ELTI2220 × ELTI2216), então contei como erro do pipeline.
- Também há uma inconsistência que **não** conta como erro: "Introdução à Economia" aparece com 32h na matriz e 48h na ficha.
- Das 28 divergências de disciplina, só 7 envolvem obrigatórias do gabarito parcial; as outras (optativas e disciplinas que só aparecem nas fichas) não são avaliáveis. Nessas 7, a juíza (Nemotron, mesmo modelo) acertou 85,7%, com 2 correções e 1 piora. Foi igual a "sempre IA 2" e acima de "sempre IA 1" (71,4%).

Isso mostra que **o pipeline funciona em um layout para o qual o GradMent não tem parser**, que é onde está o valor de negócio.

---

## 4. Comparação com o processo anterior: mandar o PPC para um LLM no chat

Antes do pipeline, o processo **não era digitar à mão**: era mandar o PDF do PPC para um LLM (como o Claude) e pedir a saída no formato do GradMent. Medi esse processo de duas formas:

**Qualidade, com um modelo só.** [baseline_modelo_unico.mjs](baseline_modelo_unico.mjs) manda o PPC **inteiro** (310 mil caracteres, sem corte) e a [especificação do GradMent](../docs/especificacao-gradment.md) para **um** modelo, sem segunda IA, sem juíza e sem validador, e pontua a resposta contra o mesmo gabarito. Foram 3 tentativas: Gemini com 503, Nemotron com resposta vazia e Nemotron completo, que é a pontuada abaixo.

| PPC real CEFET-MG | Um modelo só (processo anterior) | Pipeline (média de 3) |
| --- | ---: | ---: |
| Disciplinas encontradas | 99% (98/99) e **6 que não existem** | **100% (99/99), nenhuma a mais** |
| Obrigatória × optativa correta | **57,1%**: as 42 optativas viraram obrigatórias pelo "período sugerido" | **98,0%** |
| Carga horária correta | **43,9%**: 54 disciplinas em horas-relógio | **100%** |
| Requisitos: precisão / revocação | 81,9% / **87,2%** | **96,1%** / 82,0% |
| Aceito pelo GradMent | **Não**: código duplicado (ACOM0) e 2 ciclos de requisitos | **Sim** (3/3) |
| Tempo | 5 min 29 s | 7 min 12 s |

- As "disciplinas" a mais são atividades que não se matriculam: atividades de TCC, estágio, atividades complementares e extensão.
- O modelo único encontrou **mais** requisitos porque leu o PPC sem corte. Isso confirma que o corte de texto é o principal ponto a melhorar no pipeline.

**Custo em tokens, com o Claude.** [custo_claude/contar_tokens.mjs](custo_claude/contar_tokens.mjs) mede, com o contador oficial da API (gratuito), os tokens do Claude para a mesma tarefa: a especificação mais o PPC na entrada e o JSON final do GradMent na saída. Os preços são os oficiais por milhão de tokens. Dados completos em [custo_claude/custo-processo-anterior.json](custo_claude/custo-processo-anterior.json).

| Por PPC convertido | PDF anexado (como no chat) | Só o texto extraído |
| --- | ---: | ---: |
| Tokens de entrada | **520.738** | 156.450 |
| Tokens de saída (JSON do GradMent) | **49.905** | 49.905 |
| Claude Opus 5.5 (US$ 4 / US$ 20) | **US$ 3,08** | US$ 1,62 |
| Claude Sonnet 5.5 (US$ 2 / US$ 10) | US$ 1,54 | US$ 0,81 |
| Claude Haiku 5.5 (US$ 0,50 / US$ 2,50 acima de 100 mil tokens) | US$ 0,39 | US$ 0,20 |
| **Pipeline (Gemini, OpenRouter e Groq gratuitos)** | **US$ 0** | **US$ 0** |

O custo do Claude é um **piso de uma única tentativa**: não inclui tokens de raciocínio (cobrados como saída) nem as rodadas de correção que a saída do modelo único exigiria (duplicata, ciclos, optativas e CH).

## 5. Respostas diretas

### Os dados extraídos estão certos?
**Quase, mas ainda não o bastante para importar sem revisão.**
- Inventário e carga horária são confiáveis: 100% das disciplinas no PPC real do CEFET e 98,6% no da UNIFEI, com CH 100% correta.
- Período e obrigatória × optativa ficam entre 94% e 100%. Os erros se concentram nas disciplinas cujas páginas foram cortadas.
- **O ponto fraco são os requisitos:** a precisão é alta (96,1%), mas a revocação é de 82%. Em média, cerca de 1 em cada 5 pré ou correquisitos do PPC fica de fora. No GradMent, isso significa recomendar uma disciplina antes da hora.
- A saída **sempre** respeitou as 7 regras do GradMent (9/9), então nunca quebra a importação.

### Quanto tempo e dinheiro economiza?
O processo a comparar é **pedir a um LLM no chat**, não digitar à mão (seção 4).
- **Dinheiro (medido):** cada PPC convertido pelo Claude custa no mínimo **US$ 3,08 com o Opus 5.5 e o PDF anexado** (520.738 tokens de entrada e 49.905 de saída). O pipeline usa só cotas gratuitas: **US$ 0**.
- **Retrabalho evitado:** a saída do modelo único **não importa no GradMent** (código duplicado e ciclos) e erra a natureza de 42 optativas e a CH de 54 disciplinas. Cada um desses erros vira uma rodada de correção no chat ou uma conferência manual. O pipeline já entrega o JSON validado nas 7 regras.
- **Tempo de máquina:** praticamente igual (5 min 29 s contra 7 min 12 s). O ganho não está no relógio da máquina, e sim em **não precisar corrigir a saída**. O tempo dessa correção no processo anterior não foi medido; só existe o piso de digitação calculado em [manual/TEMPO-MANUAL.md](manual/TEMPO-MANUAL.md).
- Também registrei uma tentativa de transcrição manual ([manual/TEMPO-MANUAL.md](manual/TEMPO-MANUAL.md)). Ela mostra o volume de trabalho (cerca de 6.700 caracteres de campos e 46 mil de ementas), mas digitar à mão não era o processo real.

### Isso realmente ajuda o GradMent?
**Sim, como rascunho revisável. Ainda não como importação automática.**
- Ajuda porque entrega o inventário completo, a CH correta e um JSON sempre válido no formato que o backend já aceita, sem nenhuma mudança no backend.
- O ganho de negócio está nas **universidades sem parser**. Para PPCs do CEFET-MG, o parser regex atual já é determinístico e melhor. A UNIFEI mostrou 98,6% de inventário num layout novo.
- Antes de importar sem revisão, falta subir a revocação de requisitos (ver a seção 5).

### A terceira IA (juíza) foi uma boa decisão?
**Foi, com uma condição que eu não tinha previsto: ela precisa ser um modelo diferente das outras duas.**
- Em modelo diferente: **92,5% de acerto, 31 correções e 1 piora**. No PPC real (execução 03), ela acertou 91,7% das divergências, contra 50% de "sempre IA 1" e 61,1% de "sempre IA 2". Nenhuma regra fixa chegaria perto.
- No mesmo modelo: 66,2% de acerto, com 26 correções e 22 pioras. Na execução 01, ela piorou mais do que corrigiu.
- Chamar a juíza **só nas divergências** também se pagou: no sintético ela só foi chamada quando havia um erro real, e corrigiu esse erro em 100% das vezes.
- O que **não** foi boa decisão: deixar a juíza reescrever campos em que as duas IAs concordavam, e mandar para ela divergências que eram só de texto de ementa.

---

## 6. Correções recomendadas, em ordem de impacto

1. **Garantir diversidade de modelo**, principalmente na juíza: o fallback não pode colocar a juíza no mesmo modelo das IAs 1 e 2. Se não houver alternativa, o relatório deve marcar `diversidade: false` e pedir revisão.
2. **Travar os campos de consenso:** se IA 1 e IA 2 concordam no período e na CH, a juíza não pode alterá-los. Isso teria evitado as 6 obrigatórias que viraram optativas.
3. **Divergência só de ementa não vai para a juíza**, e "sem ementa" conta como concordância. Isso eliminaria de 6 a 10 divergências por execução no PPC real.
4. **Cortar o texto em bloco contíguo** (do primeiro ao último "Detalhamento de Disciplinas") ou usar o contexto de 1M do Gemini sem cortar. As 10 disciplinas cortadas foram a raiz dos piores erros.
5. **Não excluir requisito por padrão:** a juíza acerta só 42% das exclusões. Na dúvida, é melhor incluir e sinalizar para revisão.
6. **Pareamento por código precisa checar o nome:** códigos duplicados no PPC (caso UNIFEI) fundem disciplinas diferentes.
7. **Cronometrar o tempo manual e o de revisão** para fechar a conta de economia.
