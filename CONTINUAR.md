# Continuar o trabalho da Demandou

Cole isto inteiro no começo do chat novo.

---

Você vai continuar o desenvolvimento da **Demandou** (demandou.com), um SaaS de
criação e publicação de conteúdo com agentes de IA. O código está em
`C:\Users\devan\opensquad-app`.

## Antes de qualquer coisa, leia

1. **`HANDOFF.md`**: a **seção 9 (TODO)** e as **partes 77 a 86** no fim do
   arquivo, que são as sessões de 01 e 02/09. Em especial a 82 e a correção
   dela (uma conclusão minha que estava errada), a 85 (o "é" que era verbo) e a
   86 (o e2e feito na tela, logado).
2. A nota **"Estado da Demandou (documento vivo)"** na wiki do Notion, em
   `Donaire Brains > 10-profissional > demandou`, blocos de 01 e 02/09.
3. No planner ("Ações, Bem Natura & Família"), os cards com Frente
   "Demandou" e status "Esta semana", principalmente **"o processo inteiro no
   Gestor de Conteúdo, em tempo real"** e **"camada de design no vídeo
   completo (motor de overlay estilo Vox)"**.

## O estado real, sem maquiagem

O Bruno rodou o teste de ponta a ponta em 02/09 e o veredito foi **"está
péssimo"**. Parte era defeito de verdade, parte era coisa que mudou de lugar
sem ele saber. O que está no ar e verificado:

- **Pipeline de vídeo**: upload, transcrição, seleção, corte, capas, redação e
  quadro rodam sozinhos (piloto automático). Os cortes chegam em ~5 min e o
  vídeo completo, que agora tem dois passes, em ~18 min.
- **CDN**: mídia produzida (corte, completo, capa) vive num store PÚBLICO de
  URL não adivinhável; o arquivo original do cliente continua privado. Provado
  em produção: leitura anônima 200, cache de 30 dias, Range 206.
- **Gestor de Conteúdo**: o card do corte e o do completo têm player com
  poster, prévia fiel da rede, ajuste fino de tempo, chat com o Vitor e
  **Publicar agora** (isto quebrou e foi consertado em 02/09).
- **Landing**: preta e laranja, com coreografia de chegada e duas artes de
  colagem, aprovada no canvas antes de subir.

## As três regras que mais custaram caro

1. **Design visual se decide em canvas, não no site.** Em 01/09 eu publiquei
   uma vitrine nova direto em produção e ele reprovou em minutos. No dia
   seguinte, a mesma frente aprovada de primeira porque foi desenhada no canvas
   do Claude Design, ele deu o veredito, e só então virou código. Vale para
   qualquer mudança visual, inclusive de tela do app.
2. **Medida sem referência não decide nada.** Eu medi 1,3 GB de consumo de
   memória e concluí que o contêiner estourou. Eram 7,5 GB de teto, com 48 MB
   em uso. A pergunta que teria evitado o dia inteiro custava um endpoint de
   diagnóstico.
3. **Mensagem de erro repetida não quer dizer causa repetida.** "Failed to
   configure output pad" já tinha aparecido duas vezes por propriedade de
   quadro mudando; a terceira era entrada de `concat` com parâmetro diferente.

## Como testar de verdade (e não só olhar o banco)

```bash
cd C:/Users/devan/opensquad-app

# 1. E2E NA TELA, logado como ele. Cria sessao temporaria e imprime o cookie.
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/sessao-e2e.mts criar
# rode o app local (npm run dev) e use o cookie better-auth.session_token
# em localhost; contra PRODUCAO o cookie e recusado, porque o segredo de la
# nao e o mesmo do .env.local. O banco e compartilhado, entao o dado e o mesmo.
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/sessao-e2e.mts apagar

# 2. Prova de fumaca do worker: TODOS os caminhos de ffmpeg em ~1 min, local.
#    Rode SEMPRE antes de subir worker. Cobre inclusive os dois casos novos:
#    fatia curtissima e completo em varios lotes com audio no fim.
node worker/fumaca.mjs

# 3. Estado do video mais recente
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/achar-video.mts

# 4. A VERIFICACAO QUE CHEGA AO CONTEUDO: transcreve o corte ENTREGUE
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/transcrever-corte.mts 2

# 5. Refazer SO o video completo, sem recortar tudo de novo
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/rodar-so-completo.mts

# 6. A fila, perguntando ao WORKER e nao ao banco
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/fila.mts
```

## Deploys, e o que NÃO é automático

- **App**: merge no master publica na Vercel sozinho.
- **Worker**: NÃO sobe com o push. `cd worker && railway up --service
  video-worker --detach`, e **só com a fila vazia**. Depois do deploy, o
  `/saude` respondendo NÃO prova que o contêiner novo está servindo: espere
  assentar e confirme no log que o trabalho começou, senão o pedido cai no
  contêiner velho e morre com ele (custou uma rodada inteira em 02/09).
- Migrations: `npx prisma migrate deploy` (banco compartilhado dev/prod).

## A fila, na ordem que ele deixou

1. **O processo inteiro no Gestor de Conteúdo, em tempo real**, e a tela do
   vídeo sai de cena. É o pedido explícito dele em 02/09, e o motivo de metade
   das queixas: o processo mora numa tela e o resultado em outra. O app já tem
   Pusher, então tempo real não pede infra nova. **Desenhe no canvas primeiro.**
2. **Motor de overlay no vídeo** (a queixa que sobrou desde 31/08: "a edição
   não tem efeito gráfico nenhum, igual as referências do Vox"). A bíblia de
   estilo e as referências existem em `docs/overlays/`; o passe 2 do completo é
   onde a colagem entra; e a receita já foi provada na landing: **arte sem
   texto, texto por código**.
3. **Editor de legenda por corte** e o RAG aprendendo dos termos editados
   (fase 2 do glossário).
4. Veredito dele sobre a edição nova do completo (respiro, fade e troca de
   plano em toda emenda).

## Como o Bruno gosta de trabalhar

- **Passo a passo, um de cada vez, esperando confirmação.**
- Painel de terceiro: uma instrução por vez, espere o retorno. Se der para
  fazer por CLI, faça, não escreva tutorial.
- **Nunca use travessão em texto nenhum.** Vírgula, dois-pontos, ponto e
  vírgula ou parênteses.
- Ao fim de interação que mude o projeto, **atualize Notion (wiki e cards) e
  HANDOFF.md sem pedir**.
- **Questione premissas com números. Teste contra dado real.** Quando ele diz
  "revise suas premissas", ele quer a causa raiz medida, não otimização por
  chute.
- Quando ele reprova algo, **leia os dados ANTES de propor conserto**: banco,
  log do worker, transcrição do corte ENTREGUE, quadro extraído, e a TELA
  logada. Cada "não funciona" dele teve um mecanismo específico por trás, e
  conserto genérico erra todos.
