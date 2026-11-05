# Especificação Técnica para IAs: Como Converter Qualquer PPC para o Formato de Leitura do GradMent

> [!IMPORTANT]
> **Objetivo deste documento:** Servir como especificação de referência (System Prompt / Contexto Técnico) para que **qualquer Inteligência Artificial** consiga ler o Projeto Pedagógico de Curso (PPC) de qualquer instituição de ensino e transformá-lo com **100% de compatibilidade** para o formato aceito pelo backend do **GradMent**.

---

## 1. Visão Geral: Como o Backend do GradMent Recebe um PPC

O backend do GradMent (CodeIgniter 4 / PHP) possui **duas portas de entrada** para importar a matriz curricular de um curso (controladas por `CurriculoImportController` e `CurriculoPdfImportService`):

| Caminho | Endpoint / Comando | Formato Recebido | Quando Usar |
| :--- | :--- | :--- | :--- |
| **Caminho A — JSON Canônico Direto (Recomendado para IA)** | `POST /curriculo/importar/confirmar` (`Content-Type: application/json`) | Objeto JSON estruturado (`{ "curso_id": N, "preview": { ... } }`) | Quando você quer que uma IA extraia qualquer PPC e gere diretamente o payload pronto para persistência no banco, **sem depender de layout de PDF ou Regex**. |
| **Caminho B — Upload de PDFs via Interface Web / CLI** | `POST /curriculo/importar/preview` (`multipart/form-data`) ou `php spark curriculo:importar-pdfs` | **4 arquivos PDF com texto selecionável** (`ppc_pdf`, `ementas_pdf`, `turmas_componente_pdf`, `turmas_ofertadas_pdf`) | Quando o envio será feito manualmente pela tela de upload do Coordenador no frontend, exigindo gerar PDFs cujo texto extraído case **literalmente** com as Expressões Regulares dos parsers PHP. |

> [!WARNING]
> **Pegadinha Arquitetural Importante sobre PDFs:**
> No Caminho B (upload de PDFs), o parser do PPC (`PpcCurriculoPdfParser`) **NÃO lê o texto das ementas nem o código externo institucional** — ele extrai apenas nome do curso, siglas/códigos internos, eixos, períodos, cargas horárias e pré/correquisitos. O texto das ementas e os códigos externos são lidos do 2º PDF (`ementas_pdf` via `SigaaDisciplinasEmentaPdfParser`), e as turmas/horários vêm do 3º e 4º PDFs. Já no **Caminho A (JSON)**, **tudo** vai unificado em um único JSON.

---

## 2. Regras de Ouro e Invariantes do GradMent (Obrigatórias para Ambos os Caminhos)

Qualquer IA que esteja convertendo um PPC arbitrário **DEVE** aplicar estas regras de negócio antes de gerar a saída. Violar qualquer uma delas quebra o Planejador de Grade e o Estimador de Atraso (`EstimativaAtrasoService` / `CurriculoService`):

1. **Classificação Obrigatória vs. Optativa (`periodo`):**
   - **Disciplina Obrigatória:** DEVE ter `periodo` preenchido como inteiro positivo (`1`, `2`, ..., `12`).
   - **Disciplina Optativa / Eletiva:** DEVE ter `periodo: null`. No GradMent, toda disciplina com `periodo = null` é tratada automaticamente como **Optativa**.
2. **Carga Horária Obrigatória (`carga_horaria`):**
   - Deve ser um **inteiro positivo** representando o total de horas na unidade padrão da instituição (preferencialmente horas-aula se o histórico escolar usar horas-aula, ex.: `60`, `30`, `90`; se o PPC trouxer apenas créditos, converta pela regra do PPC, ex.: 1 crédito = 15h → 4 créditos = `60`).
   - **TODA disciplina obrigatória (`periodo != null`) PRECISA ter `carga_horaria > 0`.** Se uma obrigatória ficar com `carga_horaria: null` ou `0`, o cálculo de atraso do aluno falha com `DADOS_INSUFICIENTES`.
3. **Proibição de Dependência Obrigatória → Optativa:**
   - **NENHUMA disciplina obrigatória (`periodo != null`) pode ter pré-requisito ou correquisito apontando para uma disciplina com `periodo: null` ou sem `carga_horaria`.** Isso corrompe silenciosamente o fecho transitivo do planejador.
4. **Formato do Código Interno (`codigo`):**
   - Máximo de **20 caracteres** (`VARCHAR(20)`), único dentro do curso (`UNIQUE(curso_id, codigo)`).
   - Apenas letras maiúsculas `A-Z` e dígitos `0-9`, **sem espaços, pontos ou hífens**.
   - **DEVE começar com pelo menos 2 letras e conter pelo menos 1 dígito** (ex.: `APCO0`, `CALC1`, `MAT101`, `CMA01OB`). Códigos puramente alfabéticos sem número (ex.: `CALC`, `FISICA`) são **ignorados** pelas regexes do parser de PPC! Se o PPC original não tiver códigos ou usar códigos sem número, gere códigos padronizados com dígito final (ex.: `CALC1` para Cálculo I, `BDAD0` para Banco de Dados).
5. **Grafo Acíclico de Dependências (`PRE` e `CO`):**
   - O sistema aceita exclusivamente dois tipos de dependência entre disciplinas:
     - `"PRE"`: Pré-requisito (exige aprovação em semestre anterior).
     - `"CO"`: Correquisito (permite matrícula simultânea no mesmo semestre).
   - **Não pode haver ciclos** (`A -> A` ou `A -> B -> A`). O backend valida ciclos via DFS (`CurriculoService::teriaCicloAoAdicionar`).
   - **Requisitos não-disciplinares** (ex.: *"1.200 horas cursadas"*, *"70% dos créditos concluídos"*, *"Aprovação em todas as disciplinas até o 6º período"*): **NÃO** crie disciplinas fictícias para isso e **NÃO** coloque em `dependencias`. Mantenha `dependencias` vazio para essa regra e registre essa exigência textualmente dentro do campo `ementa` / `plano_curso`.
6. **Numeração de Disciplinas Sequenciais (I, II, III):**
   - O matcher interno do GradMent (`isOrdinalCompatible`) compara ordinais romanos (`I` a `XII`), arábicos (`1` a `20`) e por extenso (`PRIMEIRO` a `DECIMO`) para impedir que *Cálculo I* seja fundida por similaridade textual com *Cálculo II*. Mantenha sempre os sufixos romanos claros no nome (`Cálculo I`, `Cálculo II`).
7. **Compatibilidade do Nome do Curso:**
   - Na confirmação da importação (`CurriculoImportController::cursoIncompativelComPdf`), se `curso.nome_curso` for enviado no JSON/PDF, o backend verifica se ele é igual, contido, ou tem `>= 85%` de similaridade (`similar_text`) com o `nome_curso` cadastrado no banco para aquele `curso_id`. Caso contrário, retorna **erro HTTP 422**.

---

## 3. Caminho A: Formato JSON Canônico (`POST /curriculo/importar/confirmar`)

Se você (IA) deve produzir o **JSON pronto para importação direta** no GradMent, gere exatamente a estrutura abaixo.

### 3.1. Endpoint e Autenticação
- **Método / URL:** `POST /curriculo/importar/confirmar`
- **Headers:**
  - `Authorization: Bearer <JWT_DO_COORDENADOR>` (ou `X-Integration-Token: <TOKEN>`)
  - `Content-Type: application/json`
  - *(O usuário autenticado precisa ter papel `Coordenador` e ser dono do `curso_id` informado).*

### 3.2. Regra Interna Crítica do `persist()`
Em `CurriculoPdfImportService::persist()`, o mapa de IDs usado para gravar `dependencias` e `ofertas` (`$disciplinasMap`) é construído **apenas a partir do array `preview.disciplinas`** (fazendo *upsert* se o `codigo` já existir no banco).
Portanto:
- Coloque **TODAS** as disciplinas do curso dentro de `preview.disciplinas`.
- Deixe `preview.ja_cadastradas` com arrays vazios (`disciplinas: []`, `dependencias: []`, `ofertas: []`).

### 3.3. Schema Completo do Payload JSON

```json
{
  "curso_id": 1,
  "preview": {
    "curso": {
      "nome_curso": "Engenharia de Computação",
      "ano_periodo": "2026.1"
    },
    "disciplinas": [
      {
        "codigo": "APCO0",
        "codigo_externo": "G03APCO0.01",
        "nome": "Algoritmos e Programação de Computadores",
        "periodo": 1,
        "eixo": "Fundamentos de Computação",
        "carga_horaria": 60,
        "ementa": "Algoritmos: conceito e representação. Estruturas de controle, vetores, matrizes e funções.",
        "plano_curso": "Objetivo: Desenvolver lógica de programação.\nEmenta: Algoritmos: conceito e representação...\nBibliografia Básica: ..."
      },
      {
        "codigo": "AEDA0",
        "codigo_externo": "G03AEDA0.01",
        "nome": "Algoritmos e Estruturas de Dados",
        "periodo": 2,
        "eixo": "Fundamentos de Computação",
        "carga_horaria": 60,
        "ementa": "Listas lineares, pilhas, filas, árvores e algoritmos de ordenação e busca.",
        "plano_curso": "Listas lineares, pilhas, filas, árvores e algoritmos de ordenação e busca."
      },
      {
        "codigo": "TEIA1",
        "codigo_externo": "G03TEIA1.01",
        "nome": "Tópicos Especiais em Inteligência Artificial",
        "periodo": null,
        "eixo": "Sistemas Inteligentes",
        "carga_horaria": 60,
        "ementa": "Aprendizado de máquina supervisionado e não supervisionado.",
        "plano_curso": "Aprendizado de máquina supervisionado e não supervisionado."
      }
    ],
    "dependencias": [
      {
        "disciplina_codigo": "AEDA0",
        "dependencia_codigo": "APCO0",
        "tipo": "PRE"
      }
    ],
    "ofertas": [],
    "ja_cadastradas": {
      "disciplinas": [],
      "dependencias": [],
      "ofertas": []
    }
  }
}
```

### 3.4. Dicionário de Campos do JSON

#### Objeto `preview.disciplinas[]` (`curriculo_disciplinas`)
| Campo | Tipo | Obrigatório? | Limite BD | Descrição e Regras |
| :--- | :--- | :---: | :---: | :--- |
| `codigo` | `string` | **Sim** | `VARCHAR(20)` | Identificador curto da disciplina no curso. Maiúsculas + números, min. 2 letras no início + 1 dígito (ex.: `"CALC1"`). |
| `codigo_externo` | `string\|null` | Não | `VARCHAR(30)` | Código oficial no sistema acadêmico da faculdade (SIGAA/Júpiter/etc., ex.: `"MAT001"`, `"G03CALC1.01"`). Fundamental para casar automático com o Histórico Escolar do aluno! Se o código do PPC já for o código oficial da instituição, preencha o mesmo valor normalizado em `codigo` e o original em `codigo_externo`. |
| `nome` | `string` | **Sim** | `VARCHAR(255)` | Nome oficial da disciplina sem quebras de linha. |
| `periodo` | `int\|null` | **Sim** | `SMALLINT` | `1` a `N` para obrigatórias; `null` para optativas/eletivas. |
| `eixo` | `string\|null` | Não | `VARCHAR(100)` | Núcleo/área temática da disciplina (ex.: `"Matemática"`, `"Formação Profissional"`, `"Optativas"`). |
| `carga_horaria` | `int` | **Sim** | `SMALLINT` | Carga horária total inteira em horas (ex.: `30`, `60`, `90`). Nunca `null` em obrigatórias. |
| `ementa` | `string\|null` | Recomendado | `TEXT` | Texto descritivo da ementa curricular. |
| `plano_curso` | `string\|null` | Opcional | `TEXT` | Conteúdo programático / objetivos / bibliografia. Se omitido, o backend copia automaticamente o valor de `ementa`. |

#### Objeto `preview.dependencias[]` (`curriculo_dependencias`)
| Campo | Tipo | Obrigatório? | Valores Aceitos | Significado |
| :--- | :--- | :---: | :---: | :--- |
| `disciplina_codigo` | `string` | **Sim** | `codigo` existente em `disciplinas[]` | A disciplina **trancada** (ex.: `"CALC2"`). |
| `dependencia_codigo` | `string` | **Sim** | `codigo` existente em `disciplinas[]` | A disciplina **requisito** que precisa ser cumprida antes/junto (ex.: `"CALC1"`). |
| `tipo` | `string` | **Sim** | `"PRE"` ou `"CO"` | `"PRE"` = pré-requisito; `"CO"` = correquisito. |

#### Objeto `preview.ofertas[]` (`ofertas_disciplinas` + `ofertas_horarios`) — *Opcional*
Se apenas o PPC estiver sendo convertido (sem grade horária do semestre atual), envie `"ofertas": []`. Caso haja turmas ofertadas para incluir:
```json
{
  "codigo": "APCO0",
  "codigo_externo": "G03APCO0.01",
  "turma": "01",
  "ano_periodo": "2026.1",
  "docentes": ["NOME DO PROFESSOR"],
  "carga_horaria": 60,
  "tipo": "REGULAR",
  "modalidade": "Presencial",
  "situacao": "ABERTA",
  "horario_bruto": "35M12",
  "local": "Sala 101",
  "matriculados": 20,
  "capacidade": 40,
  "data_inicio": "2026-03-02",
  "data_fim": "2026-07-06",
  "origem_relatorio": "PDF_IMPORT",
  "horarios": [
    {
      "dia_semana": 2,
      "horario_inicio": "07:00:00",
      "horario_fim": "07:50:00",
      "horario_sigaa": "35M12"
    }
  ]
}
```
*(Nota sobre `dia_semana` no GradMent: `1` = Segunda, `2` = Terça, `3` = Quarta, `4` = Quinta, `5` = Sexta, `6` = Sábado — ou seja, código SIGAA `[2-7]` menos `1`).*

---

## 4. Caminho B: Formato Textual Canônico para Geração de PDFs (`multipart/form-data`)

Se o objetivo da IA é **reescrever qualquer PPC em texto/Markdown/HTML para ser exportado em PDF** e enviado pela tela de importação do GradMent (`POST /curriculo/importar/preview`), o sistema utiliza a biblioteca PHP `Smalot\PdfParser\Parser` para extrair texto puro e aplica **Expressões Regulares estritas**.

> [!CAUTION]
> **Regras Físicas do PDF:**
> 1. O PDF **DEVE conter texto selecionável real** (gerado via HTML/CSS, Markdown→PDF, LaTeX ou Word). PDFs compostos por imagens escaneadas falham imediatamente.
> 2. O upload pela interface exige **4 arquivos PDF**. Abaixo está a especificação exata de texto para gerar o `ppc_pdf` completo, o `ementas_pdf` (que carrega as ementas e códigos externos), e os 2 PDFs mínimos válidos ("stubs") de turmas caso você não tenha relatórios do SIGAA.

---

### 4.1. O que o Parser `PpcCurriculoPdfParser` Lê (Regras e Regex Exatas)

#### Regra 1 — Trava de Validação de Conteúdo (`assertExpectedPdfContent`)
O texto extraído (sem acentos, em maiúsculas) **PRECISA** conter obrigatoriamente:
1. A frase `PROJETO PEDAGOGICO DO CURSO`
2. A palavra `DISCIPLINA`
3. Pelo menos um dos termos: `SIGLA PPC`, `RELACAO DE DISCIPLINAS` ou `MATRIZ CURRICULAR`.

#### Regra 2 — Extração do Nome do Curso (`extractCurso`)
- **Regex:** `/PROJETO PEDAG[ÓO]GICO DO CURSO DE\s+(.+?)\s*[–-]\s*CAMPUS/isu`
- **Formato obrigatório na 1ª linha:**
  ```text
  PROJETO PEDAGÓGICO DO CURSO DE <NOME EXATO DO CURSO> – CAMPUS <NOME DO CAMPUS>
  ```
  *(Use sempre o traço `–` ou `-` seguido da palavra `CAMPUS`, mesmo que a universidade não divida por campus, ex.: `– CAMPUS SEDE`).*

#### Regra 3 — Registro de Siglas e Nomes (`extractSiglas`)
**CRÍTICO:** O parser **descarta silenciosamente** qualquer linha da matriz curricular cujo nome não seja idêntico (ignorando espaços/acentos/caixa) a uma disciplina declarada previamente no mapa de siglas!
- **Regex mais flexível (recomendada):**
  `/Disciplina:\s*(.*?)\s+SIGLA\s+PPC:\s*([A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*)/isu`
- Cada código DEVE começar com 2+ letras `[A-Z]` e conter ao menos 1 número `\d` (ex.: `CALC1`, `APCO0`, `ENG01`).

#### Regra 4 — Tabela de Eixos (`extractEixos`)
- **Regex do bloco:** `/Quadro\s+\d+\s*[:–-]\s*Eixos?.*?(?=Quadro\s+\d+\s*[:–-]|$)/isu`
- **Regex de cada linha:** `/^\s*(\d{1,2})\s+([^\n]{4,120})$/mu`
- *(Atenção: O nome do eixo NÃO pode começar com as palavras reservadas `Quadro`, `Eixo`, `Nº`, `Conteúdo`, `Carga` ou `Total`).*
- Exemplo:
  ```text
  Quadro 1: Eixos de Formação
  1 Matemática e Ciências Básicas
  2 Computação e Algoritmos
  3 Engenharia de Software
  ```

#### Regra 5 — Quadros de Disciplinas por Período (`extractDisciplinasPorPeriodo`)
- **Regex do cabeçalho de cada período:**
  `/Quadro\s+\d+\s*[–-]\s*Relação de disciplinas do\s+(\d{1,2})[º°]\s+período.*?(?=Quadro\s+\d+\s*[–-]|$)/isu`
  *(Use meia-risca `–` ou hífen `-`, e símbolo ordinal `º` ou `°` colado ao número do período!).*
- **Regex de cada linha de disciplina dentro do período:**
  `/\d+\s*\/\s*(\d+)\s+(.+?)\s+(?:X\s+)?(?:X\s+)?(\d+,\d+)\s+(\d+,\d+)(?:\s+((?:[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*|[Nn]ão\s+[hh]á|[Nn]ão|Sem|[\s\/,–-])+?))?(?:\s+((?:[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*|[Nn]ão\s+[hh]á|[Nn]ão|Sem|[\s\/,–-])+?))?(?=\s+\d+\s*\/\s*\d+\s+|\s+[Pp]eríodo\b|\s+Carga Horária|\s+Total\b|\s+Projeto Pedagógico|\z)/u`

Observe os **7 tokens obrigatórios** em cada linha, separados por espaço simples:
1. `<Ordem> / <ID_do_Eixo>` → Ex.: `1 / 2` (onde `1` é o índice da linha e `2` é o ID numérico do eixo definido no Quadro 1).
2. `<Nome Exato da Disciplina>` → Idêntico ao registrado em `Disciplina: ... SIGLA PPC: ...`.
3. `X` (ou `X X`) → Marcador de aula Teórica/Prática. Sempre coloque pelo menos um `X` maiúsculo!
4. `<CH_Relogio_Com_Virgula>` → Número decimal **obrigatoriamente com vírgula**, ex.: `50,0` ou `60,0` (nunca `60` sem `,0` e nunca `60.0` com ponto!).
5. `<CH_Principal_Com_Virgula>` → **ESTE é o valor gravado como `carga_horaria` no banco** (arredondado para inteiro). Ex.: `60,0`. Se a universidade só tiver uma carga horária (ex.: 60h), repita `60,0 60,0`.
6. `<Pre_Requisitos>` → Códigos separados por ` / ` (ex.: `APCO0 / CALC1`) ou literalmente `Não há`.
7. `<Correquisitos>` → Códigos separados por ` / ` (ex.: `FMEC0`) ou literalmente `Não há`.
8. Ao final do quadro de cada período, feche sempre com uma linha `Total` para garantir âncora perfeita de fim da última disciplina!

#### Regra 6 — Sobrescrita de Pré/Correquisitos pelo Ementário (`extractRequisitosDoEmentario`)
Se o PDF contiver o bloco abaixo no ementário, o parser também valida os pré/correquisitos pelos nomes completos:
```text
Disciplina: Algoritmos e Estruturas de Dados SIGLA PPC: AEDA0
PRÉ-REQUISITOS CORREQUISITOS
Algoritmos e Programação de Computadores
Não há
Ementa:
```
- Múltiplos requisitos da **mesma** coluna devem ser unidos por ` / ` na mesma célula; a separação entre a célula de `PRÉ-REQUISITOS` e a célula de `CORREQUISITOS` é feita pela quebra de linha (sem barra `/` nem vírgula `,` entre elas). Se vazio, escreva `Não há`.

---

### 4.2. Template Canônico 1: `ppc_pdf` (Pronto para Converter Qualquer PPC em PDF)

```text
PROJETO PEDAGÓGICO DO CURSO DE CIÊNCIA DA COMPUTAÇÃO – CAMPUS SEDE

Quadro 1: Eixos de Formação
1 Matemática e Fundamentos
2 Programação e Estruturas de Dados
3 Engenharia de Software e Banco de Dados

Quadro 2 – Relação de disciplinas do 1º período
1 / 1 Cálculo I X 60,0 60,0 Não há Não há
2 / 2 Algoritmos e Programação de Computadores X X 60,0 60,0 Não há Não há
Total

Quadro 3 – Relação de disciplinas do 2º período
1 / 1 Cálculo II X 60,0 60,0 CALC1 Não há
2 / 2 Algoritmos e Estruturas de Dados X X 60,0 60,0 APCO0 Não há
3 / 3 Banco de Dados I X X 60,0 60,0 Não há AEDA0
Total

EMENTÁRIO DAS DISCIPLINAS

Disciplina: Cálculo I SIGLA PPC: CALC1
PRÉ-REQUISITOS CORREQUISITOS
Não há
Não há
Ementa:
Limites, continuidade, derivadas e integrais de funções de uma variável real.

Disciplina: Algoritmos e Programação de Computadores SIGLA PPC: APCO0
PRÉ-REQUISITOS CORREQUISITOS
Não há
Não há
Ementa:
Lógica de programação, variáveis, estruturas condicionais, laços e funções.

Disciplina: Cálculo II SIGLA PPC: CALC2
PRÉ-REQUISITOS CORREQUISITOS
Cálculo I
Não há
Ementa:
Técnicas de integração, sequências, séries e funções de várias variáveis.

Disciplina: Algoritmos e Estruturas de Dados SIGLA PPC: AEDA0
PRÉ-REQUISITOS CORREQUISITOS
Algoritmos e Programação de Computadores
Não há
Ementa:
Listas, pilhas, filas, árvores binárias e análise de complexidade.

Disciplina: Banco de Dados I SIGLA PPC: BDAD1
PRÉ-REQUISITOS CORREQUISITOS
Não há
Algoritmos e Estruturas de Dados
Ementa:
Modelagem conceitual, modelo relacional, álgebra relacional e linguagem SQL.
```

---

### 4.3. Template Canônico 2: `ementas_pdf` (`SigaaDisciplinasEmentaPdfParser`)

Este arquivo injeta `ementa`, `plano_curso` e `codigo_externo` nas disciplinas do PPC, além de cadastrar as **Optativas** (já que disciplinas presentes apenas no `ementas_pdf` e ausentes nos quadros de período do `ppc_pdf` recebem automaticamente `periodo: null`!).

**Truque de Casamento Exato (`normalizeDisciplinaCodigo`):**
Quando o código no `ementas_pdf` segue o padrão `G03<CODIGO_PPC>.01` (regex `^[A-Z]+\d{2}([A-Z0-9]+)\.[0-9]+$`), o GradMent extrai automaticamente `<CODIGO_PPC>` como chave primária de merge!

```text
Curso: CIÊNCIA DA COMPUTAÇÃO
Ano/Período: 2026.1
G03CALC1.01 CÁLCULO I
Limites, continuidade, derivadas e integrais de funções de uma variável real.
G03APCO0.01 ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES
Lógica de programação, variáveis, estruturas condicionais, laços e funções.
G03CALC2.01 CÁLCULO II
Técnicas de integração, sequências, séries e funções de várias variáveis.
G03AEDA0.01 ALGORITMOS E ESTRUTURAS DE DADOS
Listas, pilhas, filas, árvores binárias e análise de complexidade.
G03BDAD1.01 BANCO DE DADOS I
Modelagem conceitual, modelo relacional, álgebra relacional e linguagem SQL.
G03OPTI1.01 TÓPICOS EM INTELIGÊNCIA ARTIFICIAL
Disciplina optativa. Aprendizado de máquina, redes neurais e processamento de linguagem natural.
01/01/2026, 00:00 Sistema Integrado
```
*(A última linha iniciando com `DD/MM/AAAA,` funciona como delimitador limpo da última ementa na regex do parser).*

---

### 4.4. Templates Canônicos 3 e 4: `turmas_componente_pdf` e `turmas_ofertadas_pdf`

Se você **não tiver** ofertas de turmas do semestre atual e quiser apenas importar o PPC + Ementas pela interface web, gere estes dois PDFs mínimos que passam 100% nas validações `assertExpectedPdfContent` retornando `ofertas: []`:

**Template Mínimo para `turmas_componente_pdf`:**
```text
Turmas Encontradas
Ofertadas ao curso: CIÊNCIA DA COMPUTAÇÃO
Ano-Período: 2026.1
Docente Horário Mat Cap
```
*(Caso queira incluir turmas reais, adicione blocos no formato exato:*
```text
G03APCO0.01 - ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES (GRADUAÇÃO)
2026.1 Turma 01 NOME DO DOCENTE (60h) REGULAR Presencial ABERTA 24M12 (02/03/2026 - 06/07/2026) Sala-101 20/40 alunos
```
*onde `24M12` significa Segunda(`2`) e Quarta(`4`), Manhã(`M`), horários `1` e `2`).*

**Template Mínimo para `turmas_ofertadas_pdf`:**
```text
Turmas Ofertadas
Curso: CIÊNCIA DA COMPUTAÇÃO
Ano-Período: 2026.1
Docente Horário Mat Cap
```

---

## 5. Checklist Algorítmico para Qualquer IA Converter um PPC Bruto

Quando receber um PPC bruto (PDF, DOCX ou texto) de qualquer universidade, siga exatamente estes passos:

1. **Identifique o Curso:** Extraia o nome limpo do curso (ex.: `"Ciência da Computação"`).
2. **Mapeie os Eixos/Núcleos:** Liste os núcleos/eixos curriculares do PPC e numere-os de `1` a `N` (ex.: `1` = Formação Básica, `2` = Formação Profissional, `3` = Formação Humanística).
3. **Extraia Todas as Disciplinas Obrigatórias e Optativas:**
   - Para cada obrigatória: defina `periodo` (`1..N`), `carga_horaria` inteira em horas (`> 0`), `eixo`, `nome` limpo (sem hifenização de quebra de linha), e `ementa`.
   - Para cada optativa: defina `periodo: null`, `carga_horaria` inteira (`> 0`), `eixo`, `nome` e `ementa`.
   - **Normalização de `codigo`:** Se o código original já tiver `>= 2` letras seguidas de alfanuméricos com pelo menos `1` dígito e `<= 20` caracteres sem símbolos (ex.: `DCC204`, `MAT001`), mantenha-o em `codigo` e em `codigo_externo`. Se tiver pontos/hífens (ex.: `G03APCO0.01` ou `MAT-101`), guarde o original em `codigo_externo` e crie uma chave limpa alfanumérica com dígito em `codigo` (`APCO0`, `MAT101`). Se não tiver dígito, acrescente `0` ou o ordinal (`CALC1`). Garanta unicidade absoluta de `codigo`.
4. **Extraia e Higienize Pré-Requisitos (`PRE`) e Correquisitos (`CO`):**
   - Converta todos os apontamentos para os `codigo`s válidos gerados no Passo 3.
   - Remova requisitos baseados em carga horária acumulada ("1000h vencidas") ou período mínimo ("estar no 7º período") da lista de dependências estruturadas e mova essa observação para o texto da `ementa`.
   - Verifique que nenhuma obrigatória (`periodo != null`) aponta para disciplina com `periodo: null`.
   - Verifique ausência de ciclos (DAG).
5. **Gere a Saída Solicitada:**
   - Se for **importação via API**, produza o JSON da **Seção 3.3**.
   - Se for **importação via Upload de PDFs**, produza os textos exatos das **Seções 4.2, 4.3 e 4.4** prontos para renderização em PDF.

