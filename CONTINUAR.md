# Continuar o trabalho da Demandou

Cole isto inteiro no começo do chat novo.

---

Continuando a Demandou (demandou.com), código em `C:\Users\devan\opensquad-app`.
Leia primeiro o `HANDOFF.md` do repo: o cabeçalho (seções 1, 5 e 9, conferidas
em 10/09/2026) e a **parte 97** no fim (sessões de 09 e 10/09, itens 1 a 12).
Depois a página "Estado da Demandou (documento vivo)" na wiki do Notion
(page_id `3c11a873-b4c1-8164-8fa0-dd693b420750`), blocos de 08 a 10/09, e no
planner (data source `05da3c47-4ed5-4a9b-ac79-14622c03b28e`) os cards da Frente
"Demandou" com status "Esta semana" e "Fazendo". O estado ali é a verdade.

## Onde paramos (10/09/2026)

- Vídeo de ponta a ponta em produção: 11 minutos (era 30), cortes em paralelo,
  completo em 1080p, piloto do servidor com `PILOTO_SECRET` (a esteira pode ser
  disparada pela CLI com `scripts/tmp/medir-e2e-0809.mts`).
- Campanha por tema consertada em seis mecanismos (tokens, dia como unidade de
  falha, regra de dia passado, painel de gravação, frequência do setup, teto de
  800 s). Cinco dias com imagem cabem; sete não (fila de verdade, card 197).
- **Régua de lastro**: nenhum número sem fonte vai ao ar. Brief devolvido ao
  Roberto, Vera com as violações medidas, tesoura antes de gravar. Pesquisa
  bruta guardada no card do Roberto.
- **Quatro estados por post** em toda tela (Publicado, Agendado, Rascunho,
  Falhou), card do Paulo derivado dos posts, Agenda nova em `/schedule`.
- Cron de publicação a cada 5 min; primeiro comentário do LinkedIn com três
  tentativas e links resolvidos; primeiros posts publicados pela plataforma nas
  redes do Bruno em 09/09.
- Funil medido no banco (`scripts/funil.mts`), demo pública captura e-mail,
  preços 397/697/1.997 no ar, anúncios prontos em
  `C:\Users\devan\Videos\demandou-anuncios\`.
- Conta de revisão da Meta: `reviewer@demandou.com` (senha com o Bruno).
- LinkedIn: pedido da Community Management API enviado (app "Areticon"),
  aguardando aprovação; o código do fluxo de páginas já está pronto.

## Pendências, nesta ordem

Do Bruno (só ele faz):
1. Publicar uma semana de verdade e virar caso zero (cards 183 e 158).
2. Editar o post de 09/09 no LinkedIn: trocar a frase da Fitch pelo que ela
   publicou ("mais de 30% do portfólio com perspectiva negativa") e pôr o link
   da NeoFeed no comentário.
3. App Review da Meta com a conta reviewer (card 45) e verificação da empresa.
4. Verificação do OAuth no Google (card 180).
5. Quando o LinkedIn aprovar: `npx vercel env add LINKEDIN_PAGES_CLIENT_ID
   production` (valor `779klxj5uvdi5b`), `LINKEDIN_PAGES_CLIENT_SECRET`, e
   `npx vercel --prod`.
6. Tráfego pago só depois disso, com UTM nos links e `scripts/funil.mts`.

De código:
1. Fila de verdade para transcrição, seleção e campanha (card 197, bloqueante).
2. `firstCommentError` visível no card do Paulo.
3. Ações direto na Agenda (reagendar, publicar agora) e Gestor abrindo numa
   semana por URL.
4. Simplificar o wizard de campanha (seis telas): canvas antes de código.
5. Sequência de retorno do e-mail da demo (segundo e terceiro contato).
6. Acompanhar a régua de lastro na primeira semana real do Bruno: quantas
   frases caem, e se caem as certas.

## Regras que valem sempre

Quando eu reprovar algo, leia os dados e teste na tela logada
(`scripts/tmp/sessao-e2e.mts` contra o `npm run dev` local, ou a conta
`reviewer@demandou.com` em produção) antes de propor conserto; cada "não
funciona" tem um mecanismo específico. Nunca use travessão em texto nenhum.
Prefiro CLI a passo a passo. Comentários em português explicando o porquê.
Deixe meus dados como estão, salvo correção deliberada. Mudança visual passa
pelo canvas do Claude Design antes do código. Worker deploya com `railway up
--service video-worker --detach` de dentro de `worker/`. O `next dev` desta
máquina pode entrar em pane do Turbopack (`0xc0000142`); produção não é afetada.
Ao editar arquivos por script no terminal desta sessão, a barra invertida dupla
é comida antes de o Python ver: monte escapes com `chr(92)`. Ao fechar cada
interação: HANDOFF.md (próxima é a parte 98), wiki e planner no Notion, e um
resumo de uma linha do que foi atualizado.
