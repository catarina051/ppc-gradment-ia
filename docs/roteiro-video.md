# Roteiro do vídeo (até 2 minutos)

Rascunho para falar com as suas palavras. Todos os números vêm do [README](../README.md) e de
[avaliacao/RESULTADOS.md](../avaliacao/RESULTADOS.md); confira cada um antes de gravar. Grave a tela do
dashboard no trecho 3.

## 0:00 a 0:15 · O problema
"O GradMent só importa matrizes no layout do CEFET. Para levar o produto a outra universidade, alguém digita à mão cerca de 100 disciplinas e mais de 100 requisitos, lidos de um PDF de até 300 páginas. Eu automatizei isso."

## 0:15 a 0:50 · Como funciona
"É um workflow no n8n, com 42 nós e três IAs de provedores diferentes. A primeira lê da matriz para o ementário, a segunda faz o caminho oposto, para os erros não coincidirem. Uma comparação em código separa o que as duas concordam do que divergiu, e só o que divergiu vai para a terceira IA, a juíza, que cita a página do PPC. No fim, um validador em código garante as 7 regras do GradMent. Onde há ambiguidade, uso IA; onde há regra, uso código."

## 0:50 a 1:30 · O que eu medi (gravar o dashboard)
"Medi tudo contra um gabarito feito sem IA. No PPC real do CEFET: 99 de 99 disciplinas, carga horária 100% correta, e nos pré-requisitos 96,1% de precisão e 82% de revocação.
Comparei com o que eu fazia antes, mandar o PDF para um LLM no chat. A natureza obrigatória ou optativa passou de 57,1% para 98%, a saída que o GradMent rejeitava passou a ser aceita, e o custo por PPC foi de 3 dólares e 8 centavos no Claude Opus para zero.
A juíza acertou 92,5% das divergências quando era um modelo diferente. Quando a cota acabou e as duas IAs caíram no mesmo modelo, ela caiu para 66,2%."

## 1:30 a 1:50 · O que aprendi
"Duas IAs concordando não quer dizer que estão certas: quando elas erraram igual, o erro passou direto. E o ganho não foi no relógio, o tempo da máquina é parecido, foi em não precisar corrigir a saída."

## 1:50 a 2:00 · Fecho
"O workflow entrega o JSON pronto para a API do GradMent, sem mudar o backend, e o dashboard dos resultados eu fiz no v0."

## Antes de gravar
- Mantenha as três perguntas: o que eu decidi, o que a IA fez, onde errou e como corrigi.
- Depois de gravar, o link entra no README, na seção Demo.
