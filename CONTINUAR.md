# Continuar o trabalho da Demandou

Cole isto inteiro no começo do chat novo.

---

Você vai continuar o desenvolvimento da **Demandou** (demandou.com), um SaaS de
criação e publicação de conteúdo com agentes de IA. O código está em
`C:\Users\devan\opensquad-app`.

## Antes de qualquer coisa, leia

1. **`HANDOFF.md`** na raiz do repositório. As **partes 50 a 61** (o final) são
   a sessão de 24 e 25/08, que redefiniu o produto de vídeo. Leia por inteiro,
   em especial a parte 56 (o reset pragmático) e a parte 57 (a causa raiz dos
   bugs de ffmpeg).
2. A nota **"Estado da Demandou (documento vivo)"** na wiki do Notion, em
   `Donaire Brains > 10-profissional > demandou`. Os últimos blocos de 24 e
   25/08 têm o raciocínio das decisões.
3. O card **Ref 179** no database "Ações, Bem Natura & Família" (dogfooding do
   vídeo) e os cards de "App & Tech" com status "Esta semana".

## O produto de vídeo HOJE, depois do reset pragmático

O Bruno redefiniu em 24/08 à noite: **edição simples e honesta, no formato do
mercado** (OpusClip, CapCut). O corte é o vídeo REAL da pessoa, fundo real,
cortado em 9:16 na região dela, com legenda grande. Aprovado por ele.

**Ligado e verificado em produção:**
- Legenda palavra a palavra no estilo do projeto (4 estilos, fontes OFL no
  contêiner com prova de build), corpo por linha via métricas `hmtx`
- Limpeza de fala em TRÊS camadas: pausas (código), hesitações (agente),
  repetições e muletas arrastadas (código, `detectarRepeticoes` e
  `detectarMuletasArrastadas`)
- Punch-in alternado nas emendas dos cortes, tira-estalo de áudio (15ms),
  fade de vídeo nas pontas, push-in do estilo no corte central
- Música: o CLIENTE traz o arquivo via popup de bibliotecas públicas (Pixabay,
  YouTube Audio Library só CC BY, FMA), mixada com ducking do estilo
- Volume nivelado a -14 LUFS
- Aviso de nitidez no diagnóstico quando a pessoa aparece pequena (mede a
  ampliação que o corte exige)
- Frases de destaque saindo da fala (âncora textual, nunca número)

**Desligado de propósito, com o código no lugar (não "conserte"):**
- Fundo gerado por IA + recorte da pessoa (halo, máscara, três artes
  reprovadas; ver partes 52-56)
- Emoji sobreposto (derrubou o mesmo corte 3 vezes)
- Ganchos de abertura do completo (abria com palavra solta)
- Punch-in no completo (a causa raiz abaixo)

## As regras de engenharia que custaram caro aprender

1. **Entrada crua do cliente: só `trim`/`concat` e filtros de áudio.** Ela muda
   de propriedade no meio do arquivo e o ffmpeg reinicializa o grafo; qualquer
   `scale`/`crop`/fonte interna morre com "Failed to configure output pad".
   No intermediário que o worker recodificou, qualquer coisa funciona.
2. **Decisão de agente sempre com rede determinística por baixo.** O agente de
   visão descreveu a webcam em texto e devolveu a caixa nula no mesmo dia em
   que devolvia certo. A detecção de movimento (`recorte.py --modo caixa`) é a
   rede.
3. **Tarefa mecânica em código, julgamento no agente.** Repetição, muleta
   arrastada, mínimo de seis notas: aritmética. O agente escolhe trechos e
   limpa o que exige leitura.
4. **A verificação chega até o CONTEÚDO.** Duração, formato e cobertura dizem
   se o encanamento funciona. Ler a transcrição do corte e extrair o quadro
   são obrigatórios antes de declarar pronto.
5. **Quando o produto melhora, o medidor antigo mente.** Aconteceu três vezes
   num dia (fonte substituída em silêncio, detector de legenda por brilho,
   faixa varrida errada). Desconfie de métrica que muda demais de uma rodada
   para outra.
6. **Antes de trocar de modelo, leia o que você pediu.** As três piores imagens
   do dia vieram de instruções nossas obedecidas ao pé da letra.

## Como testar sem quebrar a cara

Os scripts importam os módulos de PRODUÇÃO (se a rota mudar, eles quebram em
vez de mentir):

```bash
cd C:/Users/devan/opensquad-app

# Prova de fumaça do worker: TODOS os caminhos de ffmpeg em ~1 min, local.
# Rode SEMPRE antes de subir worker. Pegou 3 bugs reais no primeiro dia.
node worker/fumaca.mjs

# Dispara o corte real contra produção (usa o último vídeo do banco)
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/rodar-corte.mts \
  https://demandou.com https://video-worker-production-2eb6.up.railway.app

# Espera terminar / baixa e MEDE os cortes / lê erros e diagnóstico
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/esperar-corte.mts
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/olhar-cortes.mts
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/ver-erro.mts
```

O MediaPipe roda local (`pip install mediapipe`, modelo em `%TEMP%/modelos`),
então hipótese de recorte se testa aqui, não em produção.

## Deploys, e o que NÃO é automático

- **App**: merge no master publica na Vercel sozinho.
- **Worker**: NÃO sobe com o push. Depois de mexer em `worker/`:
  `cd worker && railway up --service video-worker --detach`
- Migrations: aplicadas via `npx prisma migrate deploy` (banco compartilhado
  dev/prod, colunas novas sempre nulas).

## O que está acontecendo AGORA

O Bruno vai gravar o vídeo novo: **webcam 4K em tela cheia, sem compartilhar
tela** (um outro chat está configurando o OBS com ele). Ele vai subir e testar
o fluxo inteiro no cenário bom pela primeira vez: ampliação ~1x, faixa de
música real escolhida no popup, estilo escolhido na tela.

Atenção: o projeto dele está com um **pad sintético de teste** anexado como
trilha (só encanamento). Ele deve trocar pela faixa real no popup antes do
teste, ou você remove se ele pedir.

A gravação RUIM antiga continua sendo o caso de regressão oficial: o produto
tem que continuar aguentando ela.

## A fila depois do teste dele

1. O veredito do Bruno sobre a rodada 4K (é o teste que valida para lançamento)
2. A seleção de trechos: régua mais dura (só nota 7+) ou o A/B do prompt no
   Codex que ele ofereceu
3. Crédito automático do CC BY na descrição dos posts (campo autor da faixa)
4. A tela do cliente mostrar o diagnóstico e o relatório de valor com destaque

## Como o Bruno gosta de trabalhar

- **Passo a passo, um de cada vez, esperando confirmação.**
- Painel de terceiro (Meta, Google, Stripe, Vercel, Railway): uma instrução
  por vez, espere o retorno.
- **Nunca use travessão em texto nenhum.** Vírgula, dois-pontos, ponto e
  vírgula ou parênteses.
- Ao fim de interação que mude o projeto, **atualize Notion (wiki e cards) e
  HANDOFF.md sem pedir**.
- **Questione premissas com números. Teste contra dado real. Seja pragmático:**
  em 24/08 um dia inteiro foi salvo pela pergunta dele "qual a referência que
  você está usando?". Copie o formato provado do mercado antes de inventar.
- Quando ele reprova algo, leia a transcrição e olhe o quadro ANTES de propor
  conserto.
