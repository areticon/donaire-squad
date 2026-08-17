# Demandou: Modelo de Negócio v2 (custos abertos)

> Atualizado em 2026-08-16. Substitui o MODELO_DE_NEGOCIO.csv (abril/2026) como
> fonte de verdade financeira. Câmbio de referência: R$ 5,50/USD.
> Preços de API verificados na documentação oficial da Anthropic em 16/08/2026.
> Números marcados com (*) são estimativas a confirmar com a instrumentação de
> custo no app (item 1 do plano de execução).

## 1. Custo variável por operação (o COGS real)

### 1a. Tokens (Claude Sonnet: $3 input / $15 output por milhão)

Modelagem realista do pipeline, por chamada de agente:
- Input por chamada: ~10.000 tokens (tom de voz ~2k, brief ~2k, RAG ~2k, instruções e histórico ~4k) (*)
- Output por chamada: ~800 tokens (*)
- Chamadas por post: ~4 equivalentes (redator, revisor, 1 ajuste médio, rateio da pesquisa) (*)

| Cenário | Custo por chamada | Custo LLM por post |
|---|---|---|
| SEM prompt caching | $0,042 | $0,17 = R$ 0,92 |
| COM prompt caching (8k dos 10k em cache a 0,1×) | $0,020 | $0,09 = R$ 0,50 |
| COM caching + Haiku nos ajustes | ~$0,016 | ~$0,07 = R$ 0,39 |

Conclusão: prompt caching é OBRIGATÓRIO. Corta o custo de LLM pela metade.
O CSV antigo estimava R$ 0,066 por post de texto; o número real com caching é
~R$ 0,50 (7,5× maior que o estimado, mas 45% menor que sem caching).

### 1b. Mídia (geração de imagem e vídeo)

| Operação | Custo USD | Custo BRL |
|---|---|---|
| Imagem (Gemini flash image via OpenRouter) | ~$0,04 (*) | R$ 0,22 |
| Carrossel 3 slides (3 imagens) | ~$0,12 | R$ 0,66 |
| Vídeo Veo 3 Fast 8s | $0,80 | R$ 4,40 |
| Vídeo Veo 3 Fast 8s + narração PT-BR | $1,20 | R$ 6,60 |

### 1c. Publicação (APIs diretas, sem Blotato)

| Rede | Custo por post | Observação |
|---|---|---|
| LinkedIn | R$ 0 | API gratuita (w_member_social) |
| Instagram | R$ 0 | Graph API gratuita (máx. 100 posts/dia/conta) |
| X: post sem link | $0,015 = R$ 0,08 | Pay-per-use, sem mensalidade |
| X: post ou comentário COM link | $0,20 = R$ 1,10 | O item mais caro do pipeline de texto! |
| X: leitura (sync de métricas) | $0,005 = R$ 0,03 por post lido | Analytics do X custa dinheiro; sincronizar com parcimônia |

Política financeira: links só no primeiro comentário (que já era a política de
algoritmo). O comentário com fontes no X custa R$ 1,10; no LinkedIn custa zero.
Métricas do X: sincronizar 1×/dia na primeira semana do post, depois semanal
(estimativa ~R$ 1 a 2/mês por usuário ativo) (*).

### 1d. Custo total por operação (com caching, publicação incluída)

| Operação | Custo estimado (*) |
|---|---|
| Post de texto (LinkedIn ou Instagram) | R$ 0,50 |
| Post de texto no X (sem link) | R$ 0,58 |
| Comentário de fontes no X (com link) | R$ 1,10 |
| Post com imagem | R$ 0,75 |
| Carrossel 3 slides | R$ 1,20 |
| Vídeo 8s | R$ 4,90 |
| Vídeo 8s com narração | R$ 7,10 |

## 2. Custos fixos mensais (stack enxuta pós-desintermediação)

| Serviço | Antes (CSV abril) | Agora |
|---|---|---|
| Vercel | Pro $20 | Pro $20 = R$ 110 (obrigatório: Hobby proíbe uso comercial) |
| Neon PostgreSQL | Launch $15 | Launch ~$19 = R$ 105 (confirmar fatura) |
| Clerk | Pro $25 | R$ 0 (better-auth próprio) |
| Pusher | $0 a 269 | R$ 0 (SSE próprio) |
| Blotato | assinatura USD | R$ 0 (APIs diretas) |
| Resend (email de reset de senha) | não previsto | R$ 0 (free tier 3k emails/mês) |
| Storage (GCS/Vercel Blob) | $2 | ~R$ 11 |
| Domínio | $1 | ~R$ 6 |
| TOTAL FIXO | R$ 346/mês | **~R$ 232/mês** |

Break-even de infraestrutura: 3 a 5 clientes pagantes.

## 3. Custos por venda

| Item | Valor |
|---|---|
| Stripe (cartão doméstico BR) | ~3,99% + R$ 0,39 por transação |
| Imposto (Simples Nacional, início) | ~6% da receita (validar anexo com contador) |

## 4. Recalibração de créditos

Regra: 1 crédito = R$ 0,10. O CSV antigo cobrava o post de texto a 5 créditos
(R$ 0,50) com custo real de ~R$ 0,50: margem zero. Recalibrado para ~3× o
custo variável (protege margem líquida após fixos, Stripe e imposto):

| Operação | Créditos (antes) | Créditos (v2) | Receita | Custo | Margem |
|---|---|---|---|---|---|
| Post texto (LI/IG/X) | 5 | 15 | R$ 1,50 | R$ 0,50 | 200% |
| Comentário fontes no X | não existia | 20 | R$ 2,00 | R$ 1,10 | 82% |
| Post imagem | 15 | 25 | R$ 2,50 | R$ 0,75 | 233% |
| Carrossel 3 slides | 30 | 40 | R$ 4,00 | R$ 1,20 | 233% |
| Vídeo 8s | 80 | 100 | R$ 10,00 | R$ 4,90 | 104% |
| Vídeo 8s + narração | 130 | 150 | R$ 15,00 | R$ 7,10 | 111% |

## 5. Consumo de referência (o que o ICP gasta)

"Campanha semanal completa" do especialista: 5 slots/semana, cada slot
publicado nas 3 redes com 1 imagem + comentário de fontes no X:

- Por slot: 3 posts texto (45) + 1 imagem (25) + comentário X (20) = 90 créditos
- Por semana (5 slots): 450 créditos
- Por mês: ~1.800 créditos = R$ 180 de face

Campanha em 1 rede só (LinkedIn, com imagens): ~700 créditos/mês.

## 6. Planos: duas opções de calibração

### Opção A: manter preços, reposicionar entregas

| Plano | Preço | Créditos | Entrega tangível |
|---|---|---|---|
| STARTER | R$ 49 | 400 | LinkedIn: ~5 posts de texto/semana |
| PRO | R$ 99 | 1.100 | 1 rede completa com imagens + sobra |
| BUSINESS | R$ 199 | 2.500 | 3 redes completas (1.800) + folga |
| AGENCY* | R$ 399 | 5.500 | Multi-projeto |

*Renomear AGENCY (conflita com ICP de especialistas): sugestão "AUTORIDADE+"
ou "STUDIO".

### Opção B: PRO vira o plano-herói do ICP a R$ 149

| Plano | Preço | Créditos | Entrega tangível |
|---|---|---|---|
| STARTER | R$ 49 | 400 | LinkedIn texto, para provar valor |
| PRO | R$ 149 | 1.800 | A campanha completa nas 3 redes (a promessa da landing) |
| BUSINESS | R$ 249 | 3.500 | 3 redes + vídeo ocasional + fôlego |
| STUDIO | R$ 449 | 7.000 | Multi-projeto / poder usuário |

Racional da Opção B: o ICP compra "estar nos 4 canais da regra 7-11-4", e a
promessa central precisa caber no plano central. R$ 149/mês contra R$ 3.000 a
5.000/mês de uma agência continua sendo 5% do preço.

## 7. Margem por plano (Opção B, uso de 70% dos créditos)

Custo variável = 1/3 do valor de face dos créditos consumidos.

| Plano | Receita | Custo variável | Stripe | Fixo rateado* | Margem bruta | % |
|---|---|---|---|---|---|---|
| STARTER R$ 49 | 49,00 | 9,33 | 2,35 | 2,32 | 35,00 | 71% |
| PRO R$ 149 | 149,00 | 42,00 | 6,34 | 2,32 | 98,34 | 66% |
| BUSINESS R$ 249 | 249,00 | 81,67 | 10,32 | 2,32 | 154,69 | 62% |
| STUDIO R$ 449 | 449,00 | 163,33 | 18,30 | 2,32 | 265,05 | 59% |

*Rateio com 100 clientes. Margem líquida após Simples (~6%): subtrair ~R$ 3 a 27
por plano; margem líquida final na faixa de 55 a 65%.

Honestidade contra o CSV antigo: a planilha de abril projetava 78 a 82% de
margem porque subestimava o custo de token em ~7×. O número defensável hoje é
**margem bruta de ~60 a 70%, líquida de ~55 a 65%**. Ainda é um SaaS saudável.

## 8. CAC, LTV e payback

| Premissa | Valor |
|---|---|
| CAC fase 1 (founder-led content) | ~R$ 0 a 50 (provisionar R$ 50) |
| CAC teto (se um dia usar ads) | R$ 150 |
| Churn assumido até medir | 10%/mês |
| LTV PRO (Opção B): 98 × (1/0,10) | ~R$ 980 |
| LTV/CAC com CAC R$ 50 | ~20× |
| LTV/CAC com CAC R$ 150 | ~6,5× |
| Payback do CAC (PRO) | < 1 mês |

## 9. Projeções (Opção B, mix 30/50/15/5)

| Marco | MRR | Margem bruta/mês | Observação |
|---|---|---|---|
| Break-even | ~R$ 500 (4 clientes) | ~R$ 100 | Cobre a infra |
| Meta 90 dias: 30 pagantes | ~R$ 4.700 | ~R$ 3.000 | Valida o negócio |
| 100 pagantes | ~R$ 15.600 | ~R$ 10.000 | Micro-SaaS maduro |
| 300 pagantes | ~R$ 47.000 | ~R$ 29.000 | Teto confortável solo |

## 10. Dívidas de validação desta planilha

1. Instrumentar tokens reais por operação no app (substituir todos os (*)).
2. Rodar 1 campanha completa de teste e comparar com a fatura da Anthropic.
3. Medir taxa de uso real de créditos (assumimos 70%).
4. Medir churn real (assumimos 10%/mês).
5. Confirmar preço do Neon na fatura e o anexo do Simples com contador.
6. Decidir Opção A vs B antes de recriar os produtos no Stripe.
