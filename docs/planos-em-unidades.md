# Planos em unidades que o cliente entende (06/10/2026)

Decisão do Bruno: a landing e /planos falam em minutos de vídeo, vídeos, peças,
armazenamento e marcas. Crédito fica só na ajuda "Como contamos esses números".

Fonte única no código: `lib/entregas-do-plano.ts`. A landing
(`components/landing/pricing.tsx`, `valor.tsx`, `faixa-de-prova.tsx`), /planos
(`app/planos/conteudo.tsx`), a aba Plano de Configurações
(`components/settings/plano-e-cobranca.tsx`) e a calculadora
(`lib/calculadora/custos.ts`) leem dali. O saldo mensal e a carteira do vídeo
por IA passaram de `lib/stripe/index.ts` para `lib/planos.ts`
(`creditosPorMes`, `creditosDeVideoPorMes`), sem mudar valor; o Stripe deriva
deles. Nenhum preço ou plano no Stripe foi tocado.

## De onde vem cada número

| Entrada | Valor | Arquivo |
|---|---|---|
| Saldo mensal | 20.000 / 40.000 / 60.000 créditos | `lib/planos.ts` (era `PLANS.credits`) |
| Carteira do vídeo por IA | 4.160 / 8.320 / 20.800 | `lib/planos.ts` (era `PLANS.videoCredits`) |
| Gravações por mês (teto aplicado) | 4 / 8 / 16 | `lib/planos.ts`, aplicado em `lib/limites-do-plano.ts` |
| Duração máxima da gravação | 60 / 120 / 300 min | `lib/planos.ts` |
| Uma gravação de M minutos | 2.320 + 61 x M créditos | `creditosEmDuasPartes` em `lib/media/limits.ts`: roteiro 590 + 25/min (inclui a semana escrita), completo 390 + 36/min, 3 cortes sugeridos x 440, abertura 20 |
| Semana sugerida | imagem, corte, texto, corte, carrossel, corte, domingo livre | `normalizarSemana(null)` em `lib/media/semana-do-video.ts` |
| Vídeo por IA de 30 s | 4 gerações: 2.080 na cheia, 780 na rápida | `lib/credits/video-tabela.ts` |
| Marcas | maior entre marcas do plano e acessos inclusos | `marcasDaConta` em `lib/equipe/regras.ts` |
| Acessos inclusos | 2 / 5 / 10 | `ACESSOS_INCLUSOS` em `lib/equipe/regras.ts` |
| Armazenamento | 48 / 96 / 192 GB | `lib/planos.ts` |

## Premissa (uma só por cartão)

O cliente usa todas as gravações do plano, todas com a mesma duração, na semana
sugerida (1 vídeo completo, 3 cortes, 3 peças de feed por gravação) e com a
abertura ligada, que é o padrão. A duração por gravação é a maior que faz todas
caberem no saldo, limitada pela duração máxima do plano.

## Tabela de conversão

| Plano | Saldo | Gravações x duração | Créditos por gravação | Sobra | Minutos de vídeo | Vídeos (completos + cortes) | Peças de feed | Peças no total | Vídeo por IA de 30 s (cheia / rápida) | Armazenamento | Marcas | Acessos |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Starter | 20.000 | 4 x 43 min | 4.943 | 228 | 172 | 16 (4 + 12) | 12 | 28 | 2 / 5 | 48 GB | 2 | 2 |
| Pro | 40.000 | 8 x 43 min | 4.943 | 456 | 344 | 32 (8 + 24) | 24 | 56 | 4 / 10 | 96 GB | 5 | 5 |
| Enterprise | 60.000 | 16 x 23 min | 3.723 | 432 | 368 | 64 (16 + 48) | 48 | 112 | 10 / 26 | 192 GB | 10 | 10 |

Peças de feed por gravação: 1 imagem, 1 texto, 1 carrossel (4 textos e 8 artes
por mês no Starter, para a calculadora).

Referências de conta: 1 min = 2.381; 22 min = 3.662; 30 min = 4.150;
60 min = 5.980; 120 min = 9.640; 300 min = 20.620 créditos.

Máximo de minutos com MENOS gravações e mais longas (não é o que o cartão mostra):
Starter 180 (3 x 60), Pro 480 (4 x 120), Enterprise cerca de 869 (2 x 300 e mais uma de 269).

## O que mudou na tela por consequência

- Cartões de preço (landing e /planos): bloco "Por mês, você leva" com os seis
  números; a lista de baixo ficou com a duração máxima e o que não é número.
- Frase do acesso extra: sem "2.000 créditos"; agora "saldo para mais 4 cortes"
  (2.000 / 440).
- Faixa de prova: "~44 peças prontas" virou "~28".
- "A conta do mês" (`valor.tsx`): quantidades de 4/20/20/4/44 para 4/12/12/4/28;
  horas recalculadas pela mesma premissa por unidade de 02/09: de "26 a 36 h"
  para "19 a 26 h", e o título de "30 horas" para "cerca de 23 horas".
- Comparação com gente (`contaDoStarter`): freelancer de R$ 10.900 para
  R$ 8.300, agência de R$ 14.000 para R$ 12.000, time próprio igual (R$ 31.140).

## Precisa da aprovação do Bruno

1. **Enterprise rende quase o mesmo que o Pro em minutos.** 60.000 créditos para
   16 gravações dão 3.750 por gravação, contra 5.000 no Starter e no Pro. Na
   premissa, o Enterprise tem 368 minutos contra 344 do Pro, com gravações de no
   máximo 23 minutos se usar as 16. Uma gravação de 30 minutos (4.150) nem cabe 16
   vezes. Saídas: subir o saldo do Enterprise para 80.000 (16 x 43 min = 688 min),
   ou vender menos gravações, ou mostrar o máximo de minutos (cerca de 869) com
   outra premissa. Nada foi mudado.
2. **Peças caíram de "cerca de 44" para 28 no Starter** (90 para 56 no Pro, 180
   para 112 no Enterprise). O 44 vinha da conta de 02/09 com 5 cortes por
   gravação; o preço de hoje cobra 3 cortes sugeridos. Com gravações mais curtas
   o saldo cobre mais cortes (exemplo: 4 x 20 min deixa saldo para 13 cortes a
   mais), mas isso é outra premissa.
3. **Marcas: o cartão dizia 1 / 2 / 5, o servidor aplica 2 / 5 / 10**
   (`marcasDaConta`, aprovado em 01/10). A tela agora mostra o que o servidor
   aplica. Se a intenção é 1 / 2 / 5, a regra é que precisa mudar.
4. **Acesso extra não paga a própria gravação.** Soma 2.000 créditos e 1
   gravação, mas a gravação mais curta custa 2.381. A frase nova diz "saldo para
   mais 4 cortes", que é verdade, e a gravação extra sai do saldo do plano.
5. **"A conta do mês" mudou de manchete** (30 para cerca de 23 horas) e de
   faixa de preço feito por gente (R$ 8.300 a R$ 31.140). A hero continua com
   "30 dias de conteúdo em 3 horas", que não foi tocada.
6. **Duração usada no cartão** (43 / 43 / 23 minutos por gravação) é a maior
   que cabe; a faixa de prova segue dizendo "gravações de até 30 minutos" para o
   esforço do cliente. As duas são verdadeiras, mas são números diferentes.
