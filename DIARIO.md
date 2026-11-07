# DIARIO — ppc-gradment-ia

Registro de autoria: o que a Catarina decidiu e fez, e o que a IA fez. Uma entrada por sessão de trabalho.
As entradas de 05/11/2026 foram reconstruídas em 07/11/2026 a partir das conversas daquele dia, e cada decisão
tem uma frase dela como evidência. Os trechos de "Aprendizado" foram redigidos a partir do README e das conversas, em primeira pessoa.

## 2026-11-05 · 13:45 a 15:38 (trecho recuperado das conversas)
**Catarina decidiu:**
- Pedi cinco entregas: a competência que o projeto demonstra, um documento de decisões técnicas e aprendizados, os resultados quantitativos e qualitativos, o dashboard no v0 feito junto com a IA ("vamos fazer o resultado como deshboard, juntos, usando V0"), e o repositório no GitHub com commits pequenos e README voltado à competência. Pedi também que a IA avaliasse se a terceira IA, a que compara as respostas, foi uma boa decisão.
- Proibi que o repositório citasse o programa de seleção para o qual eu estava montando o portfólio.
- Aprovei colar o prompt no v0 ("Sim, cola no v0") e publiquei o dashboard ("Publiquei, segue o link").
- Corrigi o método da comparação: não faria sentido comparar com digitar à mão, porque antes do n8n eu mandaria o PDF para um modelo como o Claude e pediria o parser. A comparação passou a ser com "um modelo só, PDF inteiro".
- Quando o v0 ficou sem créditos, escolhi editar o dashboard pelo GitHub em vez de assinar um plano ("Edita via GitHub").
- Pedi um PDF de defesa do projeto para recrutadores e gestores, que ficou fora do GitHub.
**Catarina fez:** Publiquei o dashboard no v0 e no Vercel. Rodei eu mesma os comandos de git (rebase e push forçado) que tiraram do histórico o documento de decisões técnicas, porque o sistema de permissões bloqueou o push forçado para a IA. Criei a chave da API e a coloquei no `.env`. Conectei o plano do ChatGPT no v0, o que não destravou a geração por falta de créditos. Instalei o app da Vercel no GitHub pelo pop-up que a IA não conseguia operar.
**A IA fez:** Mediu cada execução do pipeline contra um gabarito feito sem LLM, montou o baseline de um modelo só (com custo em tokens contado pela API), escreveu o `README.md` e o `avaliacao/RESULTADOS.md`, gerou o PDF de defesa (9 páginas) e atualizou o dashboard pelo GitHub (commit `acf12d8` do repositório do dashboard).
**Onde a IA errou e como foi corrigido:**
- Na avaliação da UNIFEI, a IA julgava a juíza em disciplinas que estavam fora do gabarito parcial. Depois da correção, a acurácia do grupo "mesmo modelo" caiu de 72,1% para 66,2%, e os números foram atualizados no `RESULTADOS.md`, no README e no dashboard.
- A IA propôs cronometrar a digitação à mão como tempo manual; eu corrigi o enquadramento (ver acima) e a tentativa de 29 s do Claude deixou de ser tratada como métrica.
- A primeira captura de tela do README saiu com os gráficos vazios, porque as barras ainda estavam animando; foi refeita.
- O `v0-prompt.md` descrevia uma versão antiga ("colar o JSON inteiro"), que nunca foi o que enviei; foi reescrito com os prompts de fato enviados.
- O dashboard publicado misturava o baseline e duas execuções com falha nos gráficos do pipeline; foi corrigido.
- A IA apontou uma fraqueza que não foi corrigida no workflow: a IA 1 deveria rodar no Gemini, mas, com o Gemini fora do ar (503), caiu no mesmo modelo da IA 2, o que tira a independência da dupla verificação. Ficou como achado de medição.
**O que não está registrado aqui:** o desenvolvimento do pipeline (n8n, extratora, auditora, juíza, extrator, validador e formulário) é anterior a esta sessão, e não recuperei as conversas dele. Também não recuperei o que aconteceu depois das 15:38 de 05/11.
**Aprendizado:** Aprendi que duas IAs concordando não quer dizer que estão certas: quando a cota do Gemini caiu e as duas caíram no mesmo modelo, elas erraram igual e o erro passou direto. Aprendi que a juíza só ajuda com diversidade de modelo e com a página do PPC como evidência (92,5% de acerto contra 66,2%). Aprendi que a comparação tem de ser com o processo real, e não com um que eu nunca faria. E aprendi que o ganho estava no retrabalho e no custo, não no relógio.

## 2026-11-07 · mesma sessão do Termômetro (13:45 a 17:01)
**Catarina decidiu:** manter só o piso de digitação calculado como "tempo manual" (sem inventar um tempo humano), e reescrever o texto público em primeira pessoa dela, sem a voz do assistente.
**Catarina fez:** Autorizei enviar ao GitHub as correções de documentação (README, RESULTADOS e TEMPO-MANUAL) e conferi o resultado. O roteiro do vídeo está escrito, mas ainda não gravei o vídeo.
**A IA fez:** removeu os marcadores `[A MEDIR]` e `[a gravar]` do `README.md`, do `avaliacao/RESULTADOS.md` e do `avaliacao/manual/TEMPO-MANUAL.md`, trocando por frases que dizem o que foi e o que não foi medido. Reescreveu a linha "Tempo que eu (Claude) levei" para "Tempo que o Claude levou nessa tentativa" e corrigiu "Transcrevi à mão" para "Pedi ao Claude que transcrevesse", porque quem fez a transcrição foi o modelo, não a Catarina. Retirou do README a linha do vídeo, que volta com o link depois da gravação. Acrescentou a linha com o histórico de commits (43 commits, todos de 05/11/2026).
**Onde a IA errou e como foi corrigido:** na primeira versão da linha do histórico a IA escreveu "ou seja, 1 dia", o que afirmava uma duração que os commits não provam (o trabalho pode ter começado antes de o repositório existir). Foi trocada por um fato verificável: 43 commits, de 13:56 a 15:25 de 05/11/2026.
**O que ficou de fora de propósito:** o painel publicado em gradment.vercel.app e o `avaliacao/dashboard-dados.json` ainda mostravam o selo "A MEDIR" no tempo manual (`consolidar.mjs`), e o `avaliacao/v0-prompt.md` cita o selo. O segundo é o prompt original do v0 e não se altera.
**Aprendizado:** Aprendi que texto público precisa dizer o que foi medido e o que foi só calculado: tirei os marcadores provisórios e deixei o piso de digitação explícito, sem inventar um tempo humano. Aprendi também a atribuir a autoria com precisão: a transcrição do `TEMPO-MANUAL` tinha sido feita pelo Claude, não por mim, e o texto agora diz isso.
