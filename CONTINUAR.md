# Continuar o trabalho da Demandou

Cole isto inteiro no começo do chat novo.

---

Você vai continuar o desenvolvimento da **Demandou** (demandou.com), um SaaS de
criação e publicação de conteúdo com agentes de IA. O código está em
`C:\Users\devan\opensquad-app`.

## Antes de qualquer coisa, leia

1. **`HANDOFF.md`** na raiz do repositório: a **seção 9 (TODO)**, que está no
   estado real de 01/09, e as **partes 62 a 76** no fim do arquivo, que são as
   sessões de 30 e 31/08 e a madrugada de 01/09. Em especial a parte 66 (o
   e2e que revelou o clique que funcionava em silêncio), a 69 (o veredito
   duro e o piloto automático), a 72 (a primeira medição por fase) e a 76
   (as telas se conversando e a esteira).
2. A nota **"Estado da Demandou (documento vivo)"** na wiki do Notion, em
   `Donaire Brains > 10-profissional > demandou`. Os blocos de 31/08 e 01/09
   têm o raciocínio das decisões, e o padrão que se repete: cada "não
   funciona" tinha um mecanismo específico por trás.
3. No planner ("Ações, Bem Natura & Família"): o card **"central de aprovação
   pós-edição"** (é o guarda-chuva das nove levas), o card do **store público
   para CDN**, o card da **fase 2 do glossário** e os cards com status
   "Esta semana" da frente Demandou.

## O produto de vídeo HOJE

O cliente sobe uma gravação e a plataforma faz o resto sozinha. **Piloto
automático**: upload → transcrição → seleção → corte → capas → redação →
quadro, sem nenhum clique, com o estado visível na tela e retry no servidor.
O fim da linha é o **Gestor de Conteúdo**, onde o cliente revisa, pede ajuste
conversando com o Vitor Vídeo, e publica.

**Ligado e verificado em produção:**
- Corte 9:16 na pessoa, fundo real, legenda palavra a palavra com corpo
  UNIFORME por corte, punch-in a cada emenda (8%, centrado na caixa da
  pessoa), fade nas pontas, tira-estalo, som a -14 LUFS
- Limpeza de fala em três camadas (pausas, agente, código), com "né" saindo
  sempre e muleta arrastada acima de 0,38s
- Glossário do projeto (`Project.videoTerms`): entra no keyterm da transcrição
  e numa correção determinística das palavras (Levenshtein com guardas)
- Capa do corte em 9:16, thumb do completo do quadro-fonte
- Quadro ESPELHA a seleção: marcar/desmarcar corte ou destino cria/remove card
  e post (só pendentes; aprovado e publicado são invioláveis)
- Esteira completa: Vitor → Lucas/Tiago (derivados do melhor corte) → Diana
  (carrossel sob demanda) → Vera (prévia) → Paulo (publicação real em
  YouTube, Instagram, Facebook, LinkedIn e X)
- Ajuste conversacional: o cliente pede ao Vitor no chat do card ("corta os 3
  primeiros segundos", "encerra no segundo 37", "capa com fundo mais escuro")
  e o agente EXECUTA (re-corte do trecho no worker, capa recomposta), com
  banner de progresso e o vídeo recarregando sozinho. Mais botões de precisão
  início/fim ±2s
- Ícones oficiais das redes (`components/social/rede-icone.tsx`) na aba Vídeo,
  na grade do Gestor, no selo de destino e nas prévias

**Desligado de propósito, com o código no lugar (não "conserte"):** fundo
gerado por IA e recorte da pessoa, emoji sobreposto, ganchos de abertura do
completo, punch-in no completo.

## Números medidos (01/09, vídeo real de 16 min em 1440p)

| fase | antes | agora |
|---|---|---|
| cortes entregues ao app | ~18 min | **130s** |
| completo recodificado | 836s (preset medium) | **361s** (faster) |
| total do worker | ~1047s | **372s** |

O worker avisa em DUAS fases: os cortes assim que ficam prontos (o app segue
para capas, redação e quadro) e o completo depois, que se anexa sozinho ao
quadro por `lib/media/completo-no-quadro.ts`.

## As regras de engenharia que custaram caro aprender

1. **Entrada crua do cliente: só `trim`/`concat` e filtros de áudio.** Ela muda
   de propriedade no meio do arquivo e o ffmpeg reinicializa o grafo; qualquer
   `scale`/`crop` morre com "Failed to configure output pad". No intermediário
   que o worker recodificou, qualquer coisa funciona.
2. **Decisão de agente sempre com rede determinística por baixo.**
3. **Tarefa mecânica em código, julgamento no agente.**
4. **A verificação chega até o CONTEÚDO**: ler a transcrição e extrair o
   quadro antes de declarar pronto.
5. **Quando o produto melhora, o medidor antigo mente.**
6. **Antes de trocar de modelo, leia o que você pediu.**
7. **Toda espera precisa de dono, prazo e retry no servidor.** Retry que vive
   na tela deixa o trabalho parado até alguém abrir a aba (custou 22 minutos
   num teste).
8. **Esforço de modelo é decisão por tarefa, medida.** A seleção foi a
   `effort: "medium"` com teto de 240s e caiu pela metade sem perder
   qualidade, porque quem protege a seleção é a verificação em código.
9. **Gargalo sem número não se otimiza, se adivinha.** O worker loga tempo por
   fase; use.
10. **Erro técnico no log, frase humana na tela, nome de fornecedor nunca.**

### Regras operacionais (custaram um estrago cada)

- Deploy do worker **só com a fila vazia**.
- Mudança de infra de storage se prova com **um upload** antes do deploy.
- Retry automático **só na primeira falha** (erro sistêmico queimava as três
  tentativas em minutos e aposentava o botão do cliente).

## Como testar sem quebrar a cara

Os scripts importam os módulos de PRODUÇÃO (se a rota mudar, eles quebram em
vez de mentir):

```bash
cd C:/Users/devan/opensquad-app

# Prova de fumaça do worker: TODOS os caminhos de ffmpeg em ~1 min, local.
# Rode SEMPRE antes de subir worker.
node worker/fumaca.mjs

# Estado real no banco (o vídeo mais recente de qualquer projeto)
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/achar-video.mts

# Dispara o corte real contra produção, com o pedido de produção
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/rodar-corte.mts \
  https://demandou.com https://video-worker-production-2eb6.up.railway.app

# Baixa e MEDE os cortes; lê erros e diagnóstico
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/olhar-cortes.mts
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/ver-erro.mts

# Tempo por fase do worker
cd worker && railway logs --service video-worker | grep "tempo:"
```

O MediaPipe roda local (`pip install mediapipe`), então hipótese de recorte se
testa aqui, não em produção.

## Deploys, e o que NÃO é automático

- **App**: merge no master publica na Vercel sozinho.
- **Worker**: NÃO sobe com o push, e só com a fila vazia:
  `cd worker && railway up --service video-worker --detach`
- Migrations: `npx prisma migrate deploy` (banco compartilhado dev/prod,
  colunas novas sempre nulas).

## O que está acontecendo AGORA

O Bruno está testando de ponta a ponta a rodada com tudo novo. O projeto do
teste é "Empreendedorismo Cristão" (`cmthtv91k000004l8geondong`), com o vídeo
`cmthufrkz000004l1kh2gbfrq` já em `ready` e o quadro curado por script.

**Espere o veredito dele antes de mexer em qualquer coisa desse fluxo.**

## A fila depois do veredito

1. O que o teste dele apontar (prioridade absoluta)
2. Store público separado para CDN de verdade nos players (precisa dele no
   painel da Vercel; passos no card do planner)
3. Editor de legenda por corte e o RAG aprendendo dos termos editados
4. Varrer nome de fornecedor nos erros restantes
5. Régua da seleção (nota 7+) ou A/B do prompt no Codex

## Como o Bruno gosta de trabalhar

- **Passo a passo, um de cada vez, esperando confirmação.**
- Painel de terceiro (Meta, Google, Stripe, Vercel, Railway): uma instrução
  por vez, espere o retorno.
- **Nunca use travessão em texto nenhum.** Vírgula, dois-pontos, ponto e
  vírgula ou parênteses.
- Ao fim de interação que mude o projeto, **atualize Notion (wiki e cards) e
  HANDOFF.md sem pedir**.
- **Questione premissas com números. Teste contra dado real. Seja pragmático.**
  Quando ele diz "revise suas premissas", ele quer a causa raiz medida, não
  otimização por chute.
- Quando ele reprova algo, **leia os dados ANTES de propor conserto**: banco,
  log do worker, transcrição do corte, quadro extraído. Cada "não funciona"
  dele teve um mecanismo específico por trás, e conserto genérico erra todos.
