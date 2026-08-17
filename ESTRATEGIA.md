# Demandou — Estratégia de Negócio

> Decisões tomadas em 2026-08-13 (Bruno + Claude). Este arquivo é a fonte de verdade
> estratégica; o MODELO_DE_NEGOCIO.csv (abril/2026) é a base financeira e será
> recalibrado com custos medidos (ver "Dívida de validação").

## O jogo escolhido

**Micro-SaaS lucrativo.** Solo/enxuto, sem funding, lucro desde cedo, convivendo com
Areticon e Bem Natura. Canais orgânicos, crescimento sustentável. Nada de crescer no
prejuízo: se o custo real exigir ajustar preço/créditos, ajusta.

## ICP do lançamento (um só)

**Especialistas B2B construindo marca pessoal no LinkedIn** — consultores, executivos,
profissionais liberais. Racional:
- É o DNA do produto (investigação de perfil, tom de voz, thought-leadership).
- O Bruno É esse cliente — o produto nasceu do uso próprio.
- A audiência atual do Bruno (executivos/gestores industriais) já contém esse ICP.
- Paga R$99–199/mês sem fricção se o resultado for autoridade → clientes/salário.

PMEs, agências e infoprodutores: depois, se fizer sentido.

## A dor (narrativa da landing)

Insight central (verificado em 2026-08-13): **apenas ~1% dos usuários ativos do
LinkedIn publica conteúdo semanalmente — e esse 1% concentra ~9 bilhões de
impressões por semana** (estatística recorrente em compilações 2025/2026: ContentIn,
Kinsta, Cognism). A memória do Bruno ("menos de 5%", vídeo do Diary of a CEO) aponta
para o episódio com **Daniel Priestley** ("The Money Making Expert", jan/2025), onde
ele afirma que só 1% das pessoas usa criação de conteúdo como alavanca — e apresenta
a regra **7-11-4** (7 horas de conteúdo, 11 pontos de contato, 4 canais para virar
"conhecido, querido e confiável"). A 7-11-4 é munição de narrativa: o Demandou é a
máquina que produz esse volume para quem não tem tempo.

Autoridade é o que converte em salário maior e mais clientes: quem não publica,
não existe para o mercado.

Narrativa em camadas (nesta ordem):
1. **Dor**: "Autoridade gera clientes e salário. Menos de 5% publicam com consistência.
   Você provavelmente está nos 95%."
2. **Solução**: "Um time completo de agentes — pesquisa, escreve, desenha, publica —
   enquanto você trabalha." (a fantasia do squad com nomes: Roberto, Vera, Lucas...)
3. **Diferencial anti-objeção**: "E soa como você — os agentes estudam seu perfil,
   seu tom, seus temas. IA genérica soa como IA. O seu squad, não."

## Requisitos de produto que a estratégia impõe

1. **Mini-RAG por cliente** — base de conhecimento própria (posts antigos, site, docs,
   posicionamentos) para os agentes não alucinarem nos temas do cliente e manterem
   coerência. Além de qualidade, é **anti-churn**: dados acumulados = custo de troca.
   Stack candidata: pgvector no Neon (já existente) + embeddings.
2. **Pesquisa com fontes controladas** — o cliente define/aprova as fontes que o
   Roberto Radar usa (allowlist por projeto). Atualidade sem lixo.
3. **Vídeo incluído no lançamento** — decisão consciente do Bruno. Condição: os
   créditos de vídeo já protegem margem (~7–8× o custo no CSV); manter monitoramento.

## Escopo do lançamento

**Completo, inclusive vídeo.** Condição inegociável: funcionar de verdade e não operar
no prejuízo. Preços/créditos são ajustáveis conforme custo medido.

## ⚠️ Dívida de validação (antes de gravar preço em pedra)

**O custo do CSV está subestimado no texto, não no vídeo.** O CSV modela 800 tokens de
entrada por chamada; o pipeline real (tom de voz + brief + memória + anti-padrões)
carrega 5–15k tokens por chamada. Conta rápida com Sonnet e 5 chamadas/post a 10k
input: ≈ R$1,10–1,30 de custo por post de texto — **cobrado a 5 créditos (R$0,50),
é prejuízo por operação**. O vídeo, ironicamente, está seguro (créditos cobram ~7×).

Plano de correção (ordem):
1. **Instrumentar custo real por operação** no app (log de tokens por chamada, custo
   por post/campanha no banco) — sem isso é chute.
2. **Prompt caching da Anthropic** — tom de voz/contexto repetem entre chamadas; cache
   corta ~90% do custo de input repetido. Maior alavanca de margem disponível.
3. **Haiku para rascunhos/ajustes**, Sonnet só onde qualidade paga.
4. **Recalibrar créditos** com o custo medido (post de texto provavelmente 10–15
   créditos, não 5) — margem-alvo 100%+ sobre variável, como o CSV já define.

## Canais e CAC (fase 1 — micro-SaaS)

- **Canal nº1: founder-led content.** O produto publica o conteúdo do Bruno; cada post
  é demo viva ("feito com Demandou"). CAC ≈ R$0 até algumas centenas de clientes.
- Construção em público (bastidores do SaaS) + comunidades de consultores/especialistas.
- Ads (Meta/Google) só depois de payback comprovado organicamente — ano 2.
- CAC-meta do CSV (R$150) vira teto, não meta, nesta fase.

## Economia-alvo (herdada do CSV, a validar)

- Break-even de infra: ~5–10 clientes (custo fixo ~R$350/mês) — risco é tempo, não caixa.
- Marco de validação: **definir meta de pagantes em 90 dias** (proposta: 30).
- 100 clientes no mix do CSV ≈ R$11,4k MRR — meta de ano 1 plausível para micro-SaaS.
- Churn: premissa ausente no CSV. Assumir 8–12%/mês até medir; combater com RAG
  acumulado, hábito semanal (campanha recorrente) e resultado visível (métricas de
  alcance/autoridade no dashboard).

## Decisões fechadas em 2026-08-13 (rodada 2)

1. **Meta de validação: 30 pagantes em 90 dias** pós-lançamento.
2. **Preço**: recalcular após instrumentar o custo real (nada de gravar R$99 ou R$149
   antes de medir COGS por operação).
3. **Instagram entra no v1** — decisão do Bruno: "tem muito negócio acontecendo nele".
   Lançamento: LinkedIn + X + Instagram.
4. Estatística da landing: usar o dado verificado do ~1% (fontes acima), não os "5%".

## Questões abertas

1. Futuro dos 4 planos: nomenclatura "AGENCY" conflita com ICP de especialistas —
   revisar naming/estrutura quando recalibrar créditos.
2. Instagram: validar o que o Blotato cobre (feed/carrossel/Reels?) e o que o pipeline
   precisa adaptar por formato.

## Decisão de stack (2026-08-13, rodada 3): sem intermediários

Bruno decidiu: **sair do Clerk e do Blotato; integrações próprias com as redes;
sistema de login próprio. Nenhum intermediário pago que possa ser substituído por
código nosso.**

Custos verificados das APIs diretas (ago/2026):
- **X**: pay-per-use, sem mensalidade — $0,015/post criado; **$0,20/post com link**
  (~R$1,10 — links no 1º comentário viram política financeira, não só algorítmica);
  leitura $0,005/post com teto de 2M/mês. Tiers antigos ($200/mês) extintos.
- **Instagram (Meta Graph API)**: gratuita, mas exige conta Business/Creator + Página
  conectada + **app review de 2–4 semanas** (`instagram_business_basic` +
  `instagram_business_content_publish`). Fluxo: container → publish. Reels 5–90s 9:16;
  carrossel = 1 post; máx. 100 posts/dia/conta via API.
- **LinkedIn**: `w_member_social` (Share on LinkedIn) — já usado direto no pipeline
  (PR #25). Aprovação de app relativamente simples para posts de membro.
- **Pusher** também sai (realtime): substituir por SSE/polling — zero custo.
- Permanecem (infraestrutura, não intermediário): Vercel, Neon, Anthropic/Google,
  e o PSP de pagamento (a definir: Stripe vs. alternativa BR com Pix).

Sequência crítica: **registrar os apps de desenvolvedor (Meta, X, LinkedIn) ANTES de
codar** — a revisão da Meta é o caminho crítico de 2–4 semanas.

## Decisão de preços (2026-08-16): Opção B do MODELO_DE_NEGOCIO_v2.md

Planos recalibrados com custos reais (ver MODELO_DE_NEGOCIO_v2.md):
- STARTER R$ 49 / 400 créditos (LinkedIn texto, porta de entrada)
- **PRO R$ 149 / 1.800 créditos: o plano-herói. Entrega a campanha completa
  nas 3 redes (a promessa da landing e da regra 7-11-4)**
- BUSINESS R$ 249 / 3.500 créditos
- STUDIO R$ 449 / 7.000 créditos (novo nome no lugar de AGENCY)

Créditos por operação (3× custo): post texto 15, comentário fontes X 20,
imagem 25, carrossel 40, vídeo 8s 100, vídeo narrado 150.
Margem bruta esperada: 59 a 71% por plano; líquida 55 a 65% após Simples.
Prompt caching no pipeline é pré-requisito dessa margem.

## Próxima sessão de trabalho (execução)

1. Instrumentar custo por operação no app (tokens in/out por chamada, custo por
   post/campanha persistido no banco).
2. Ligar prompt caching da Anthropic no pipeline.
3. Rodar 1 campanha completa de teste e medir COGS real.
4. Recalibrar tabela de créditos com os números medidos.
5. Revisar planos/preços com a margem real na mão.
