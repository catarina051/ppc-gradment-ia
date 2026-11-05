# Tentativa de medir o tempo manual

> **Resumo honesto:** o tempo manual *humano* continua `[A MEDIR]`. Esta pasta registra uma tentativa real de fazer a importação "à mão" e o que ela permite afirmar com segurança: **o volume de trabalho (medido)** e **um piso de tempo só de digitação (calculado, com premissa explícita)**.

## O que foi feito

Transcrevi à mão o **2º período** do PPC real de Eng. de Computação do CEFET-MG (`PPCEngComp-v20240719.pdf`), sem usar o pipeline nem o gabarito. Foram 7 disciplinas com código, nome, período, eixo, CH e ementa, e os pré e correquisitos no formato JSON do GradMent. O resultado está em [periodo2-transcrito-a-mao.json](periodo2-transcrito-a-mao.json).

| Medida | Resultado |
| --- | --- |
| Acerto da transcrição contra o gabarito | **7/7 disciplinas e 9/9 requisitos** |
| Consultas ao PDF necessárias | **8** (a tabela do período e as 7 fichas de disciplina) |
| Por que tantas consultas | Na tabela do período, "Não há" aparece quebrado em volta dos códigos (`Não` / `APCO0` / `há`), então não dá para saber se o código é pré ou correquisito. É preciso abrir a ficha de cada disciplina. |
| Caracteres digitados (sem ementa) | 497 |
| Caracteres de ementa | 2.568 |
| Tempo que **eu (Claude)** levei | 29 s. **Não é tempo humano**: um modelo lê e escreve em velocidade de máquina. Está registrado só por transparência. |

## Volume do PPC inteiro (medido)

| | Quantidade |
| --- | ---: |
| Disciplinas | 99 |
| Requisitos (pré e correquisitos) | 109 |
| Caracteres de campos estruturados (código, código externo, nome, período, eixo, CH e requisitos) | **≈ 6.670** |
| Caracteres de ementas | **≈ 46.100** |
| Fichas de disciplina a consultar | 99, mais 11 tabelas (10 períodos e as optativas) |

## Piso de tempo humano: só digitação (calculado, não medido)

**Premissa:** velocidade de digitação de 200 a 300 caracteres por minuto, o que equivale a cerca de 40 a 60 palavras por minuto, faixa típica de um adulto digitando texto corrido. O cálculo **não inclui** o tempo de procurar e ler as 110 páginas de fichas e tabelas, resolver ambiguidades nem conferir. Por isso é um **piso**: o tempo real só pode ser maior.

| Cenário | 200 car./min | 300 car./min |
| --- | ---: | ---: |
| Digitar só os campos estruturados (ementas coladas com Ctrl+C/Ctrl+V) | **≥ 33 min** | ≥ 22 min |
| Digitar também as ementas | **≥ 4 h 24 min** | ≥ 2 h 56 min |

**Comparação com a máquina (medida):** o pipeline levou **6 min 43 s a 7 min 36 s** por PPC real (média de 7 min 11 s), sem contar a revisão humana.

## O que ainda falta para fechar a conta

1. **Uma pessoa** cronometrar a transcrição de 1 período (de preferência o 2º, para comparar com este arquivo), incluindo as consultas ao PDF, e extrapolar para os 10 períodos e as optativas.
2. Cronometrar a **revisão humana** da saída do pipeline: conferir os requisitos, que têm 82% de revocação.
3. Economia = manual − (máquina + revisão).
