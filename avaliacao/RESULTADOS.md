# Resultados medidos

> Todos os números vêm de **9 execuções reais** do pipeline (n8n + APIs gratuitas), feitas em 05/11/2026 e pontuadas contra um **gabarito gerado sem LLM**. Nada aqui é estimativa, exceto o que está marcado como `[A MEDIR]`.
>
> Para reproduzir: `sh avaliacao/rodar.sh <rótulo> <ppc> <n>` e depois `node avaliacao/consolidar.mjs`. Dados completos em [resultados.json](resultados.json); dados do dashboard em [dashboard-dados.json](dashboard-dados.json).

## Resumo

| | PPC sintético | PPC real CEFET-MG | PPC real UNIFEI (outro layout) |
| --- | ---: | ---: | ---: |
| Execuções | 5 | 3 | 1 |
| Tempo médio por PPC | **43,8 s** | **7 min 11 s** (431,5 s) | **6 min 21 s** (381,0 s) |
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
| no **mesmo modelo** das IAs 1 e 2 (Nemotron, após fallback) | 86 | 45 | **24** | **72,1%** |

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
- A juíza (Nemotron, mesmo modelo) acertou 89,3% das 28 divergências de disciplina, contra 28,6% de "sempre IA 1" e 85,7% de "sempre IA 2".

Isso mostra que **o pipeline funciona em um layout para o qual o GradMent não tem parser**, que é onde está o valor de negócio.

---

## 4. Respostas diretas

### Os dados extraídos estão certos?
**Quase, mas ainda não o bastante para importar sem revisão.**
- Inventário e carga horária são confiáveis: 100% das disciplinas no PPC real do CEFET e 98,6% no da UNIFEI, com CH 100% correta.
- Período e obrigatória × optativa ficam entre 94% e 100%. Os erros se concentram nas disciplinas cujas páginas foram cortadas.
- **O ponto fraco são os requisitos:** a precisão é alta (96,1%), mas a revocação é de 82%. Em média, cerca de 1 em cada 5 pré ou correquisitos do PPC fica de fora. No GradMent, isso significa recomendar uma disciplina antes da hora.
- A saída **sempre** respeitou as 7 regras do GradMent (9/9), então nunca quebra a importação.

### Quanto tempo economiza?
- **Tempo da máquina (medido):** cerca de 44 s para o PPC sintético e **6 a 8 min para um PPC real de 136 a 190 páginas**, de ponta a ponta (extração, duas IAs, juíza e validação).
- **Volume produzido por PPC real:** cerca de 100 disciplinas × 6 campos e mais de 100 requisitos, ou seja, **cerca de 700 dados** que hoje são digitados à mão.
- **Tempo manual: `[A MEDIR]`.** Protocolo: cronometrar a digitação manual de **1 período** do PPC real (disciplinas, CH, período, pré e correquisitos) e extrapolar para os 10 períodos mais as optativas. Depois, cronometrar à parte a **revisão humana** da saída do pipeline. Economia = manual − (máquina + revisão).
- Esse número não foi estimado. A revisão ainda é necessária (revocação de requisitos de 82%), e o ganho real depende do tempo dela.

### Isso realmente ajuda o GradMent?
**Sim, como rascunho revisável. Ainda não como importação automática.**
- Ajuda porque entrega o inventário completo, a CH correta e um JSON sempre válido no formato que o backend já aceita, sem nenhuma mudança no backend.
- O ganho de negócio está nas **universidades sem parser**. Para PPCs do CEFET-MG, o parser regex atual já é determinístico e melhor. A UNIFEI mostrou 98,6% de inventário num layout novo.
- Antes de importar sem revisão, falta subir a revocação de requisitos (ver a seção 5).

### A terceira IA (juíza) foi uma boa decisão?
**Foi, com uma condição que eu não tinha previsto: ela precisa ser um modelo diferente das outras duas.**
- Em modelo diferente: **92,5% de acerto, 31 correções e 1 piora**. No PPC real (execução 03), ela acertou 91,7% das divergências, contra 50% de "sempre IA 1" e 61,1% de "sempre IA 2". Nenhuma regra fixa chegaria perto.
- No mesmo modelo: 72,1% de acerto e 24 pioras. Na execução 01, ela piorou mais do que corrigiu.
- Chamar a juíza **só nas divergências** também se pagou: no sintético ela só foi chamada quando havia um erro real, e corrigiu esse erro em 100% das vezes.
- O que **não** foi boa decisão: deixar a juíza reescrever campos em que as duas IAs concordavam, e mandar para ela divergências que eram só de texto de ementa.

---

## 5. Correções recomendadas, em ordem de impacto

1. **Garantir diversidade de modelo**, principalmente na juíza: o fallback não pode colocar a juíza no mesmo modelo das IAs 1 e 2. Se não houver alternativa, o relatório deve marcar `diversidade: false` e pedir revisão.
2. **Travar os campos de consenso:** se IA 1 e IA 2 concordam no período e na CH, a juíza não pode alterá-los. Isso teria evitado as 6 obrigatórias que viraram optativas.
3. **Divergência só de ementa não vai para a juíza**, e "sem ementa" conta como concordância. Isso eliminaria de 6 a 10 divergências por execução no PPC real.
4. **Cortar o texto em bloco contíguo** (do primeiro ao último "Detalhamento de Disciplinas") ou usar o contexto de 1M do Gemini sem cortar. As 10 disciplinas cortadas foram a raiz dos piores erros.
5. **Não excluir requisito por padrão:** a juíza acerta só 42% das exclusões. Na dúvida, é melhor incluir e sinalizar para revisão.
6. **Pareamento por código precisa checar o nome:** códigos duplicados no PPC (caso UNIFEI) fundem disciplinas diferentes.
7. **Cronometrar o tempo manual e o de revisão** para fechar a conta de economia.
