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

---

## Decisões de 25/08/2026: ICP corrigido, personas e preço confirmado

> Esta seção manda sobre as seções de ICP e de canais acima, que foram escritas
> em 13/08, antes de o vídeo virar o produto. A nota completa vive no Notion:
> "ICP, personas e a conta do tráfego pago", em `10-profissional/demandou`.

### O ICP mudou de desejo para comportamento

O ICP antigo ("especialistas B2B construindo marca pessoal no LinkedIn", depois
"quem vende conhecimento e já tenta postar e sofre") foi desenhado quando o
produto escrevia post a partir de um tema. Desde 22/08 a matéria-prima é fala
gravada, e o filtro mudou de lugar.

Os três filtros, em ordem de peso:

1. **Matéria-prima**: já produz fala gravada por outro motivo (aula, reunião,
   webinar, palestra, treinamento, sermão). Quem não grava precisaria criar um
   hábito novo para usar a plataforma, e hábito é exatamente o que faltou a ele
   quando parou de postar. Este filtro é novo e virou o mais importante.
2. **Dor**: já tentou publicar e parou. Observável no LinkedIn.
3. **Valor de um cliente dele**: define o teto de preço.

### A dor resolvida cara vale mais que a dor não resolvida

Correção do Bruno em 25/08: os conhecidos que têm a dor resolveram contratando
um social media, a R$ 1.200 a R$ 3.500 por mês. Esse comprador tem orçamento
provado, fatura recorrente e a decisão de que o problema vale dinheiro já
tomada. A venda deixa de precisar vencer inércia e passa a precisar vencer um
fornecedor, que é muito mais barato.

**A Demandou substitui a produção, não o social media inteiro.** Não responde
DM, não faz stories de bastidor, não faz community management e não senta na
reunião mensal. Vender "demite seu social media" gera churn no mês 2.

### As três personas (com CPC medido por cluster de palavra)

| Persona | TAM medido | CPC | CAC |
|---|---|---|---|
| Consultor de gestão industrial | 113.705 consultorias CNAE 7020-4/00 | R$ 6 | R$ 620 |
| Contador consultivo | 101.228 organizações contábeis (CFC) | R$ 12 | R$ 1.240 |
| Advogado empresarial | 1,3 mi de advogados, ~15% sócios | R$ 15 | R$ 1.550 |

**Regra de bolso: CAC = CPC × 103.** Com trial de cartão exigido, visita vira
pagante em 0,97% (2,2% de visita para cadastro × 44% de cadastro para pagante,
os dois medidos em benchmark 2026).

Conselho de classe (OAB, CFP, CFM) não é problema da Demandou: a plataforma é
ferramenta de automação e quem responde pelo conteúdo é o usuário, que aprova
cada publicação. As cláusulas já existem em `/terms`, em duas passagens.

### Preço: revisado e MANTIDO em 25/08

Pro R$ 149 / R$ 1.490 anual. Business R$ 249 / R$ 2.490. Studio R$ 449 /
R$ 4.490. A análise comparou com R$ 397, R$ 697 e R$ 997 e recomendava R$ 397;
o Bruno decidiu manter, com os números na mesa.

O que a decisão obriga a ser verdade, e vira trabalho:

| Persona | LTV/CAC no mensal | LTV/CAC no anual |
|---|---|---|
| Consultor | 1,44, não fecha | 3,44, fecha no limite |
| Contador | 0,72, não fecha | 1,72, não fecha |
| Advogado | 0,58, não fecha | 1,37, não fecha |

1. **Tráfego pago existe para o consultor apenas, e só vendendo o anual.**
   Contador e advogado vão para orgânico, rede e indicação, onde o CAC é zero.
2. **A conversão da landing virou parede mestra, não melhoria.** No benchmark
   de 2,2% de visita para cadastro nem o consultor tem folga; a conta só ganha
   ar em 3,5%, que é 60% acima do benchmark. Isso promove capturar e-mail na
   demo e instrumentar o funil de backlog para pré-requisito de viabilidade.
3. **Teto de CPC no preço atual: R$ 6,89 no anual, R$ 2,89 no mensal**, na
   conversão de benchmark. Em 3,5% o teto anual sobe para R$ 10,93.
4. **A oferta de fundador não tem desconto**, porque R$ 1.490 é o próprio preço
   de lista. A escassez precisa vir da trava vitalícia e do atendimento pessoal
   do Bruno enquanto forem dez, nunca de preço.
5. **O volante de caixa gira perto do equilíbrio:** uma venda anual põe ~R$ 1.330
   de caixa no dia 1 e R$ 812 de margem no ano, contra CAC de R$ 620, ou seja
   financia 1,3 aquisições. Os dez primeiros precisam vir de rede, a CAC zero.

### O teste de tráfego pago mudou de escopo e de critério

- Roda **numa persona só**, a do consultor, e vende **só o anual**.
- Aprova com **CPC abaixo de R$ 6,89 E conversão de visita para cadastro acima
  de 3,5%**.
- **R$ 2.000 medem CPC e NÃO medem conversão.** A R$ 6 de CPC são 333 cliques e
  ~7 cadastros, que é anedota. Medir 2,2% com confiança pede ~1.000 cliques, ou
  seja R$ 6.000 numa persona só. Ou o orçamento sobe, ou a conversão é medida
  com orgânico e abordagem direta, que custam zero.

### Jogada parada com gatilho

Vender para o social media e para a agência (o Studio já é isso, com projetos
ilimitados): traz várias marcas por venda e divide o CAC. Reabrir no primeiro
pedido espontâneo de agência, ou depois dos 10 pagantes da jogada principal.
