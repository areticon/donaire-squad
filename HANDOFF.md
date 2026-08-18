# demandou — Estado Completo do Projeto (09/04/2026)

> **Use este arquivo para dar contexto ao Claude Code ao continuar o trabalho.**
> Copie este conteúdo inteiro ou referencie o arquivo ao iniciar uma nova sessão.

---

## 1. O que é o demandou

SaaS de criação e publicação de conteúdo com agentes de IA para redes sociais (LinkedIn e X/Twitter).

**Stack:** Next.js 16 (App Router) · React · Tailwind · Prisma (Neon Postgres) · Clerk (auth) · Stripe (pagamentos) · Vercel (hosting, Hobby plan) · Pusher (real-time logs)

**Empresa:** DEMANDOU TECNOLOGIA DA INFORMACAO LTDA · CNPJ 66.140.770/0001-48 · Rua Pais Leme, 215, Conj. 1713, Pinheiros, São Paulo/SP · CEP 05.424-150

**Repo:** `github.com/areticon/donaire-squad` (branch: `master`)

---

## 2. Agentes de IA (Pipeline)

O pipeline (`app/api/pipeline/run/route.ts`) executa uma sequência de agentes por dia:

| Agente | Função | Tech |
|--------|--------|------|
| **Roberto** | Pesquisa web em tempo real | Gemini 2.5 Flash com Google Search Grounding (50s timeout) |
| **Lucas** | Redação LinkedIn (texto/carrossel/artigo/poll) | Claude (Anthropic SDK, 90s timeout, maxTokens 2048) |
| **Tiago** | Redação X/Twitter (thread/poll/default) | Claude (Anthropic SDK, 90s timeout) |
| **Diana** | Geração de imagem/infográfico | Nano Banana (imagem) · Veo 3 (vídeo — DESABILITADO, gera imagem estática no lugar) |
| **Vera** | Revisão de qualidade (APROVADO/REPROVADO_TEXTO) | Claude — auto-corrige REPROVADO_TEXTO sem intervenção humana |
| **Paulo** | Agendamento dos posts nos horários configurados | Interno (getScheduledAt) |

**Lucas + Tiago rodam em paralelo** (Promise.allSettled).

**Vera auto-corrige:** se REPROVADO_TEXTO, faz retry paralelo de LinkedIn (se Vera mencionar) + Twitter (sempre).

**DAY_ANGLES:** quando `topicsPerDay` não está configurado, cada dia da semana recebe um ângulo diferente (PROBLEMA, SOLUÇÃO, DADOS, CASOS REAIS, FUTURO, MITOS, IMPACTO HUMANO) para evitar repetição.

---

## 3. Planos e Stripe

### Planos atuais (PR #26)

| Plano | Preço | Créditos | Price ID env var |
|-------|-------|----------|------------------|
| Starter | R$49/mês | 500 | `STRIPE_STARTER_PRICE_ID` |
| Pro | R$99/mês | 1.100 | `STRIPE_PRO_PRICE_ID` |
| Business | R$199/mês | 2.500 | `STRIPE_BUSINESS_PRICE_ID` |
| Agency | R$399/mês | 5.500 | `STRIPE_AGENCY_PRICE_ID` |

**Cupom de lançamento:** `50LANCAMENTO` — 50% off nos 3 primeiros meses (criado no Stripe)

### Arquivos Stripe
- `lib/stripe/index.ts` — PLANS, createCheckoutSession (card + boleto, BRL), createBillingPortalSession
- `app/api/stripe/checkout/route.ts` — POST cria sessão checkout
- `app/api/webhooks/stripe/route.ts` — webhook: checkout.session.completed, subscription.created/updated/deleted
- `components/landing/pricing.tsx` — 4 cards, grid 2x2→4col

### Variáveis de ambiente Stripe (no Vercel)
```
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_BUSINESS_PRICE_ID=price_...
STRIPE_AGENCY_PRICE_ID=price_...
```

### Webhook Stripe
- URL: `https://demandou.com/api/webhooks/stripe`
- Eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

---

## 4. Bugs Corrigidos (PRs #21-#28)

| PR | Bug | Correção |
|----|-----|----------|
| #21 | Deploy falhando silenciosamente (maxDuration=800 incompatível com Hobby) | `maxDuration = 300` |
| #21 | Safety timer disparando cedo | `SAFETY_TIMEOUT_MS = 275_000` (25s antes dos 300s) |
| #22 | Claude timeout matando pipeline | Anthropic SDK timeout `60s → 90s`, Roberto maxTokens `4096 → 2048` |
| #22 | Vera não auto-corrigindo | Auto-retry paralelo para REPROVADO_TEXTO |
| #19 | Roberto AVISO sempre (Gemini timeout) | Gemini timeout `30s → 50s` |
| #20 | Thursday pulado (UTC-3 timezone) | `cutoffUtc = nowUtc - 24h` (buffer para Brazil) |
| #23 | Thread X igual todo dia | DAY_ANGLES por dia da semana |
| #23 | Preview mostrando imagem errada | `useEffect(() => setLocalCard(card), [card])` |
| #23 | Imagem X não subindo | Multipart/form-data upload (mas ainda 403 — tier da API) |
| #23 | LinkedIn 1º comentário não postando | Delay 3s antes do comment |
| #24 | Diana travando no Veo | Skip Veo, gera imagem estática (prompt salvo) |
| #25 | LinkedIn comment 403 (partnerApiSocialActions) | Trocou `/rest/socialActions/` → `/v2/socialActions/` (usa w_member_social) |
| #26 | Planos e preços desatualizados na LP | 4 novos planos, X somente texto, cron horário |
| #27 | Páginas legais inexistentes | `/privacy` e `/terms` (LGPD compliant) |
| #28 | Cron horário bloqueando deploy no Hobby | Revertido para `"0 12 * * *"` (diário) |

---

## 5. Limitações Conhecidas / NÃO Resolvidas

### X/Twitter — somente texto (403 code 453)
- **Causa:** Twitter Free tier API não permite upload de mídia
- **Solução:** Upgrade para Twitter Basic tier ($100/mês) no Developer Portal do Bruno (dono da plataforma, NÃO dos usuários)
- **Código:** já faz fallback para texto-only quando upload falha
- **Arquivo:** `lib/oauth/twitter.ts`

### Veo vídeo — desabilitado no pipeline
- **Causa:** Veo leva 60-300s, incompatível com budget de 300s do Hobby
- **Workaround atual:** Diana gera imagem cinematográfica estática; prompt visual salvo no card
- **Solução real:** Vercel Pro (maxDuration=800) + reabilitar `generateVideo` em `app/api/pipeline/run/route.ts`
- **Arquivo:** bloco `if (isVideoType)` em route.ts (~linha 1240)

### Cron diário — posts agendados depois das 9h BRT atrasam
- **Causa:** Vercel Hobby só permite cron 1x/dia. Schedule: `"0 12 * * *"` = 9h BRT
- **Impacto:** post agendado para 14h ou 21h só publica no dia seguinte às 9h
- **Soluções:**
  1. Vercel Pro ($20/mês) → permite cron por minuto
  2. Cron externo grátis (cron-job.org) → chama `https://demandou.com/api/cron/pipeline` com header `Authorization: Bearer $CRON_SECRET` a cada 5-15 min
- **Arquivo:** `vercel.json` e `app/api/cron/pipeline/route.ts`

### LinkedIn primeiro comentário — pode falhar
- **Status:** endpoint trocado para v2 (PR #25), precisa testar em produção
- **Escopo OAuth:** `w_member_social` já está ativado no LinkedIn Developer Portal
- **Se falhar novamente:** verificar se o post URN está no formato correto (share vs ugcPost)

---

## 6. Variáveis de Ambiente Completas (Vercel)

```
# Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...

# Database
DATABASE_URL=postgresql://...@...neon.tech/...?sslmode=require

# AI
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...

# Media
NANO_BANANA_API_KEY=...
GOOGLE_VEO_API_KEY=... (atualmente não usado no pipeline)

# Social
LINKEDIN_CLIENT_ID=776y3qlu5ltco1
LINKEDIN_CLIENT_SECRET=...
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_BUSINESS_PRICE_ID=price_...
STRIPE_AGENCY_PRICE_ID=price_...

# Real-time
PUSHER_APP_ID=...
PUSHER_KEY=...
PUSHER_SECRET=...
NEXT_PUBLIC_PUSHER_KEY=...
NEXT_PUBLIC_PUSHER_CLUSTER=...

# Cron
CRON_SECRET=...

# App
NEXT_PUBLIC_APP_URL=https://demandou.com
```

---

## 7. Estrutura de Arquivos Críticos

```
app/
├── api/
│   ├── pipeline/run/route.ts          ← Pipeline principal (todos os agentes)
│   ├── cron/pipeline/route.ts         ← Cron job: publica posts agendados
│   ├── stripe/checkout/route.ts       ← Cria sessão Stripe checkout
│   ├── webhooks/stripe/route.ts       ← Webhook Stripe (subscription lifecycle)
│   ├── posts/[id]/publish/route.ts    ← Publicação manual de post
│   └── social/                        ← OAuth callbacks (LinkedIn, Twitter)
├── privacy/page.tsx                   ← Política de Privacidade (LGPD)
├── terms/page.tsx                     ← Termos de Uso
├── billing/                           ← Página de billing/assinatura
└── dashboard/                         ← Dashboard principal

components/
├── landing/
│   ├── pricing.tsx                    ← 4 planos (Starter/Pro/Business/Agency)
│   ├── features.tsx                   ← Features (X somente texto)
│   ├── footer.tsx                     ← Footer com links legais
│   └── hero.tsx                       ← Hero section
└── posts/
    └── campaign-kanban.tsx            ← Kanban de cards (useEffect sync fix)

lib/
├── stripe/index.ts                    ← PLANS, checkout, billing portal
├── claude/index.ts                    ← Anthropic SDK (timeout 90s)
├── research/web-search.ts            ← Gemini 2.5 Flash + Google Search (50s timeout)
├── oauth/
│   ├── linkedin.ts                    ← LinkedIn API (v2 socialActions para comments)
│   └── twitter.ts                     ← Twitter API (multipart upload, 403 fallback)
├── publish/oauth-post.ts             ← executeOAuthPostPublish (LinkedIn + Twitter)
└── media/
    ├── nano-banana.ts                 ← Geração de imagem
    ├── veo3.ts                        ← Geração de vídeo (desabilitado no pipeline)
    └── infographic.ts                 ← Infográficos

vercel.json                            ← Cron diário: "0 12 * * *"
prisma/schema.prisma                   ← User (plan field), Post (status, scheduledAt)
```

---

## 8. Deploy (ATENÇÃO — lições aprendidas)

### Vercel projeto correto: `donaire-squad-1aos`
- Domínio: `demandou.com` e `www.demandou.com`
- **NÃO** confundir com `donaire-squad` (projeto fantasma, deploy de 3s)

### Como fazer deploy manual (quando automático falhar)
```bash
cd C:\Users\devan\opensquad-app
git pull origin master --ff-only
npx vercel deploy --prod --force
```

### ARMADILHAS que já nos pegaram:
1. **`maxDuration > 300`** → deploy falha silenciosamente no Hobby plan
2. **Cron mais frequente que diário** → deploy falha silenciosamente no Hobby plan
3. **`vercel deploy` sem `git pull`** → deploya código antigo (usa arquivos locais!)
4. **"Redeploy" no dashboard** → redeploya o MESMO build antigo, não pega commits novos
5. **`.claude/settings.local.json`** → contém API keys, NUNCA commitar (está no .gitignore)

### Deploy automático via GitHub
- Vercel está conectado ao GitHub repo
- Push para `master` → deploy automático
- **Mas:** se o deploy falhar (ex: vercel.json inválido), falha silenciosamente e o site continua com a versão antiga

---

## 9. Próximos Passos / TODO

### Checkout Stripe (PRIORIDADE)
- [ ] Testar checkout end-to-end: clicar "Assinar Pro" → redirect Stripe → pagamento → webhook → user.plan atualizado
- [ ] Verificar se `CRON_SECRET` está configurado no Vercel (necessário para cron funcionar)
- [ ] Testar webhook Stripe: criar assinatura teste → verificar user.plan no banco

### Cron / Agendamento
- [ ] Configurar cron externo (cron-job.org) OU upgrade Vercel Pro para posts agendarem fora das 9h BRT
- [ ] Testar publicação automática: criar post com scheduledAt no passado → chamar GET /api/cron/pipeline

### Landing page
- [ ] Revisar LP completa — copys, CTAs, responsividade
- [ ] Testar botões de checkout com os Price IDs reais do Stripe
- [ ] Verificar se /privacy e /terms renderizam corretamente em produção

### Integrações
- [ ] LinkedIn primeiro comentário: testar se o endpoint v2 funciona em produção
- [ ] Twitter: decidir se vale $100/mês para upload de imagens
- [ ] Veo: quando tiver Vercel Pro, reabilitar vídeo no pipeline

### Infraestrutura
- [ ] Upgrade Vercel para Pro ($20/mês) — resolve 3 problemas de uma vez:
  - maxDuration 800s (pipeline mais robusto)
  - Cron por minuto (agendamento preciso)
  - Previews por branch
- [ ] Monitorar pipeline timing: 5 dias com imagens é apertado em 300s

---

## 10. Comandos Úteis

```bash
# Type check
npx tsc --noEmit

# Deploy manual
cd C:\Users\devan\opensquad-app && git pull origin master --ff-only && npx vercel deploy --prod --force

# Ver deploys recentes
npx vercel ls --scope areticons-projects

# Inspecionar deploy
npx vercel inspect <deploy-url> --scope areticons-projects

# Ver logs do Vercel
npx vercel logs <deploy-url> --scope areticons-projects

# Criar PR e mergear
gh pr create --title "..." --body "..." && gh pr merge <N> --squash --repo areticon/donaire-squad

# Testar cron manualmente
curl -H "Authorization: Bearer $CRON_SECRET" https://demandou.com/api/cron/pipeline
```

---

## 11. Informações da Empresa (para documentos legais)

```
Razão Social: DEMANDOU TECNOLOGIA DA INFORMACAO LTDA
Nome Fantasia: DEMANDOU
CNPJ: 66.140.770/0001-48
Natureza Jurídica: 206-2 - Sociedade Empresária Limitada
Porte: ME (Microempresa)
Data de Abertura: 08/04/2026

Endereço:
  Rua Pais Leme, 215, Conj. 1713
  Pinheiros — São Paulo/SP
  CEP 05.424-150

CNAE Principal: 63.11-9-00 - Tratamento de dados, provedores de serviços
CNAE Secundários: 62.01-5-01, 62.04-0-00, 70.20-4-00, 73.11-4-00, 85.99-6-04

LinkedIn App: demandou (Client ID: 776y3qlu5ltco1)
  OAuth scopes: openid, profile, w_member_social, email
  Redirect URLs:
    - http://localhost:3000/api/social/linkedin/callback
    - https://demandou.com/api/social/linkedin/callback

Contato: contato@demandou.com
E-mail CNPJ (contabilidade): meucnpj@contabilizei.com.br
```

---

*Documento gerado em 09/04/2026 por Claude Code. Última sessão: PRs #21-#28 corrigindo pipeline, Stripe, LP, legal e deploy.*

---

## Sessão 17/08/2026: estratégia, preço e nova direção de produto

### Decisões fechadas

**Preço (Opção B).** Starter R$49/400cr, **Pro R$149/1.800cr (plano-herói: campanha completa nas 3 redes)**, Business R$249/3.500cr, Studio R$449/7.000cr. Agency foi renomeado para Studio; assinaturas antigas mapeiam para studio no webhook. Nova env necessária: `STRIPE_STUDIO_PRICE_ID`. Os preços R$149, R$249 e R$449 ainda **não existem no Stripe**: precisam ser criados como novos prices.

**Tabela canônica de créditos** agora vive em `lib/stripe/index.ts` como `CREDIT_COSTS`, calibrada a 3x o custo variável real: post texto 15, comentário de fontes no X 20, imagem 25, carrossel 40, vídeo 8s 100, vídeo narrado 150.

**Modelo financeiro v2** em `MODELO_DE_NEGOCIO_v2.md` substitui o CSV de abril. Margem real: 60 a 70% bruta (a planilha antiga projetava 78 a 82% porque subestimava o custo de token em ~7x). Custo fixo caiu de R$346 para R$232/mês com a saída de Clerk, Pusher e Blotato.

### Achados de código que mudam decisão

- **Prompt caching não existe.** Zero ocorrências de `cache_control` no repo. É a maior alavanca de margem: derruba o post de texto de R$0,92 para R$0,50.
- **Modelo em uso é `claude-sonnet-4-5`** (em `lib/claude/index.ts`), não Haiku. Vale avaliar migração para `claude-sonnet-5`.
- **Três modelos de imagem convivendo**: `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview` e `gemini-2.5-flash-image`. Consolidar em um.
- **Link em post no X custa US$0,20** contra US$0,015 sem link. Links no primeiro comentário passam a ser política financeira.
- **Zero infraestrutura de vídeo processado**: sem FFmpeg, sem transcrição, sem fila. Só chamada ao Veo.

### Nova direção de produto (em discussão, não implementada)

Cliente grava um vídeo cru por semana; o squad transcreve, escolhe os melhores momentos, corta, legenda, escreve os posts de cada rede e gera título, descrição e capítulos do YouTube. Inverte o hábito vendido: deixa de ser "aprove 5 posts" e vira "grave 20 minutos por semana". Custa cerca de R$2 por trabalho completo contra R$4,40 por 8 segundos de Veo.

Restrições técnicas levantadas: vídeo vai para object storage (não para o Neon); FFmpeg exige worker com fila fora da Vercel; publicar no YouTube consome 1.600 de uma cota diária de 10.000 unidades, ou seja 6 uploads por dia para o app inteiro, e aumentar exige auditoria do Google.

### Fila imediata

1. Prompt caching no pipeline (bloqueia a margem de tudo)
2. Instrumentação de custo real por operação
3. Teste local do login better-auth (esperando branch do Neon)
4. Push dos branches represados (`feat/own-auth` e os commits de OPEX e SaaS)
5. Criar os novos prices no Stripe e preencher as envs

*Atualizado em 17/08/2026 por Claude Code.*

## Sessão 18/08/2026: migração Neon para Supabase

**Concluída e testada.** Banco novo no Supabase, projeto `lvrolepscwpexrakemrq`, região `us-east-2`.

### O que mudou

- `@prisma/adapter-neon` trocado por `@prisma/adapter-pg`. Pacotes do Neon desinstalados.
- `prisma.config.ts` passa a usar `DIRECT_URL` nas migrations. O pooler em transaction mode não aceita o DDL do Prisma Migrate.
- `.env.local` aponta para o pooler `aws-0-us-east-2.pooler.supabase.com`. Backup do arquivo anterior em `.env.local.bak`. As 8 chaves mortas do Clerk foram removidas.
- Duas migrations criadas: `init_supabase` (14 tabelas) e `revoke_data_api_access` (segurança).
- better-auth mantido sem alteração. Roda em qualquer Postgres.

### Armadilhas encontradas, para não repetir

1. **O host direto do Supabase é IPv6 apenas** no plano gratuito (`db.REF.supabase.co` só tem registro AAAA). Rede doméstica sem rota IPv6 falha com `ENOTFOUND`. Solução: usar sempre o pooler, que tem IPv4.
2. **O projeto não está em São Paulo, está em us-east-2.** Foi mantido de propósito: as funções da Vercel rodam em `iad1` por padrão, então banco em Ohio deixa a latência função-banco em torno de 15ms. Banco em São Paulo com função em Washington daria uns 120ms por query. Se um dia mover a Vercel para `gru1`, mover o banco junto.
3. **O Supabase concede acesso total a `anon` e `authenticated` em tudo que nasce no schema public.** A chave `anon` é pública (vai para o navegador). O RLS vinha ligado sem policy, o que negava tudo, mas era camada única. A migration `revoke_data_api_access` corta os grants e ajusta os default privileges, então mesmo que alguém desligue o RLS por engano no futuro, a Data API não alcança nada.

### Verificado

Cadastro, sessão e login retornam 200; senha errada retorna 401; senha gravada como hash de 161 caracteres (nunca em texto puro); 14 tabelas com RLS ligado; zero grants para `anon` e `authenticated`; Data API responde 401.

### Pendente para o deploy

Trocar `DATABASE_URL` para o pooler em transaction mode (porta 6543). A linha comentada já está no `.env.local`.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (continuação): tema, prompt caching e instrumentação

### Tema sem flash

Script inline síncrono no `<head>` do layout aplica o tema salvo antes da primeira pintura. Antes, a página nascia escura (padrão do HTML) e piscava para claro depois que o JavaScript carregava. O `ThemeProvider` agora só sincroniza o estado do React com o que o script já pôs no DOM, em vez de reaplicar.

### Prompt caching (verificado contra a API real)

O trecho estável (regras globais mais os documentos de contexto do projeto) virou o prefixo cacheável do system prompt. A parte variável (persona do agente, diretriz de funil, tarefa) vem depois do marcador.

Medição real: primeira chamada escreve 1.865 tokens no cache, as seguintes leem 1.865 e escrevem 0. **89% de economia** no custo de entrada a partir da segunda chamada.

**Ressalva importante:** as regras globais sozinhas dão 278 tokens, abaixo do mínimo de 1024 do Sonnet 4.5. Projeto **sem documentos de contexto não cacheia nada**, e a API ignora em silêncio, sem erro. Consequência de produto: preencher o contexto do projeto deveria ser obrigatório no onboarding, porque é o que faz o conteúdo ficar bom e é o que paga o cache.

**Regra para quem mexer aqui depois:** qualquer alteração no texto de `REGRAS_GLOBAIS`, mesmo um acento ou um espaço, invalida o cache de todas as chamadas. Cache é casamento de prefixo byte a byte.

### Instrumentação de custo

Nova tabela `ai_usage` grava por chamada: tokens de entrada e saída, tokens escritos e lidos do cache, modelo, custo em dólar e o vínculo com projeto, run e agente. A gravação nunca lança exceção (instrumentação não pode derrubar pipeline) e não soma latência (chamada sem await).

Com ela, os números do `MODELO_DE_NEGOCIO_v2.md` deixam de ser estimativa depois da primeira campanha real.

### Validação lateral

A tabela `ai_usage` nasceu com zero permissões para `anon` e `authenticated`, o que confirma que os default privileges da migration de segurança funcionam para tabelas futuras.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 3): fim do Starter e início do vídeo

### Plano Starter removido, teste de 7 dias no lugar

Decisão do Bruno em 18/08. O Starter de R$49 entregava uma rede só, contradizendo a promessa de campanha completa nas 3 redes que a landing vende. Rendia R$35 de margem contra R$98 do Pro com o mesmo custo de suporte (86 clientes Starter para o mesmo resultado de 31 Pro), e atraía fora do ICP.

No lugar: `TRIAL_DAYS = 7` em `lib/stripe`, aplicado via `subscription_data.trial_period_days` no checkout, com cartão exigido. Assinaturas antigas de Starter mapeiam para `pro` no webhook para não ficarem órfãs.

O Pro a R$149 passa a ser entrada e plano-herói ao mesmo tempo, e coincide com o preço de fundador discutido antes: a oferta vira "os 10 primeiros travam R$149 para sempre".

### Vídeo, Fase 1, Passo 1: armazenamento e upload

Modelo `VideoJob`: arquivo no object storage, banco guarda só metadados, transcrição e cortes. Vídeo nunca entra no Postgres.

Upload direto do navegador para o storage com `@vercel/blob/client`. **O arquivo não passa pela função serverless**: o limite de corpo de requisição é de dezenas de megabytes e um vídeo de 20 minutos passa de 1 GB. A rota `/api/videos/upload` só assina o token (validando sessão e posse do projeto antes) e recebe o aviso de conclusão.

`/api/videos` complementa: lista os vídeos e registra um upload de forma idempotente, porque o callback do storage não alcança o localhost em desenvolvimento.

**Escolha de storage, revisada com honestidade:** eu havia recomendado Cloudflare R2 pelo egress grátis. Refazendo a conta na escala real (30 clientes, 4 vídeos por mês), a diferença para o Vercel Blob fica abaixo de um dólar por mês, e o Blob já estava instalado com upload client-side nativo. Ficamos no Blob. Quando o egress crescer, migrar é trocar o adaptador.

### Próximos passos do vídeo

2. Transcrição com marcação de tempo por palavra (Whisper)
3. Agente que escolhe os 5 melhores trechos
4. Textos de cada rede a partir de cada trecho
5. Tela de acompanhamento e aprovação
6. Débito dos 100 créditos

*Atualizado em 18/08/2026 por Claude Code.*

### Blob privado: restrição de arquitetura descoberta em 18/08

O Blob store foi criado como **privado**, e isso está correto: vídeo cru do cliente é material não publicado e não pode ficar acessível por URL.

Verificado: upload privado funciona, acesso pela URL sem token devolve **403**, leitura pelo servidor com token devolve o conteúdo.

**Consequência que define o desenho do Passo 2:** nenhum serviço externo consegue buscar o vídeo por URL. O SDK `@vercel/blob` v2.3.2 **não gera URL assinada**; a leitura de blob privado é só server-side, via `get(url, { access: "private", token })`, que devolve um stream.

Portanto a transcrição não pode ser "manda o link para o fornecedor". O nosso servidor precisa ler o blob e repassar os bytes em stream, sem bufferizar em memória. Fornecedores que só aceitam URL ficam descartados; fornecedores com limite pequeno de arquivo (Whisper da OpenAI, 25 MB) também, já que vídeo de 20 minutos passa disso.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 4): transcrição e fechamento da sessão

### Passo 2 do vídeo: transcrição

Deepgram `nova-3` com `pt-BR`, confirmado na documentação oficial (Nova-3 ganhou português em 2026). Devolve tempo por palavra, pontuação, formatação inteligente e parágrafos agrupados.

Arquivos novos: `lib/media/transcribe.ts` e `app/api/videos/[id]/transcribe/route.ts`.

Cuidados que já estão no código:
- `maxDuration` de 300s no arquivo e no `vercel.json`. O padrão da Vercel é 10s e vídeo longo não cabe.
- Idempotência: vídeo já transcrito devolve 409 em vez de pagar de novo.
- Stream de ponta a ponta, sem carregar o vídeo em memória.

Custo real: cerca de R$0,47 por vídeo de 20 minutos, abaixo dos R$0,66 estimados.

**Pendente:** `DEEPGRAM_API_KEY` no `.env.local` (a linha já está criada, vazia). Conta nova ganha US$200 de crédito.

### Estado ao fim da sessão

Branch `feat/own-auth`, 14 commits desde o início, todos locais. **Nenhum push foi feito**: falta a permissão de `git push` no settings.json ou o push manual.

Funcionando e testado: login próprio, banco Supabase, prompt caching (89% de economia medida), instrumentação de custo, upload privado.

Escrito e compilando, mas não testado com dado real: transcrição (falta a chave da Deepgram).

Não começado: Passo 3 (agente que escolhe os trechos), Passo 4 (textos por rede), Passo 5 (tela), Passo 6 (débito de créditos).

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 5): transcrição testada com áudio real

### Chave e validação

`DEEPGRAM_API_KEY` no `.env.local` (gitignored, linha 34 do `.gitignore`). A linha
que a sessão anterior dizia ter criado vazia não existia: o arquivo terminava em
`BLOB_READ_WRITE_TOKEN`.

Chave validada contra a API: HTTP 200, `nova-3` e `pt-BR` aceitos.

### Teste ponta a ponta executado

Sem arquivo de mídia na máquina, o áudio de teste foi gerado por TTS do Windows
(voz Microsoft Maria Desktop, pt-BR) a partir de um roteiro de consultor B2B de
566 palavras. Percurso completo exercitado: arquivo local, `put` no Blob privado,
registro em `video_jobs`, leitura server-side por stream, Deepgram, gravação da
transcrição em JSON.

| Medida | Valor |
|---|---|
| Duração do áudio | 272 s (4,5 min) |
| Palavras com tempo | 563 |
| Parágrafos | 9 |
| Confiança média | 0,994 |
| Tempo de transcrição | 46,5 s |
| Custo | US$ 0,0195 = R$ 0,107 |

Extrapolando para 20 minutos: R$ 0,47, que confirma a estimativa do handoff
anterior. O JSON da transcrição ocupou 44 KB para 4,5 min, ou seja cerca de
200 KB para 20 min, tranquilo para uma coluna Json do Postgres.

### Achado 1: palavra não reconhecida some sem deixar rastro

A palavra "payback", falada três vezes, não apareceu nenhuma vez. Não veio
errada, veio ausente: "se o payback é de quatro anos" virou "se o é de 4 anos".

Testadas quatro configurações, nenhuma recupera: `language=multi`,
`keyterm=payback`, `smart_format=false` e `multi` sem `smart_format`.

Pior: **o sumiço é indetectável pelo tempo por palavra.** No ponto do corte o
buraco entre palavras foi de 0,00 s e 0,16 s, enquanto as pausas naturais de
frase medem de 0,88 s a 1,25 s. A Deepgram estica as palavras vizinhas para
cobrir o áudio que ela descartou. Não existe marcador, nem token de confiança
baixa, nem lacuna temporal. Nosso código não tem como saber que perdeu conteúdo.

**Causa ainda não estabelecida.** O áudio é sintético e a voz pt-BR pronuncia
uma palavra inglesa de um jeito que nenhum humano pronuncia. Pode ser limitação
do modelo com jargão em inglês, pode ser o TTS. Só uma gravação humana resolve.
Se for o modelo, é problema sério: o ICP fala payback, budget, board, deadline,
ROI, insight, benchmark e framework o tempo todo.

### Achado 2: smart_format corrompe o artigo indefinido

Com `smart_format=true`, "uma indústria" virou "1 indústria" e "um resumo de uma
linha" virou "1 resumo de 1 linha". Números de verdade saem certos
("3 reuniões", "18 meses", "4º vez").

Com `smart_format=false`, o texto fica correto ("uma indústria", "um resumo de
uma linha", "três frases") e os números vêm por extenso. Verificado que os
parágrafos continuam vindo idênticos: 9 blocos, mesmos limites de tempo.

Decisão: desligar `smart_format`. Transcript corrompido é pior que transcript sem
formatação de numeral, porque é o que o cliente vê na tela de aprovação e é a
matéria-prima dos Passos 3 e 4. O agente que escreve o post normaliza número
sozinho.

### Achado 3: transcript vazio volta como sucesso

Áudio em inglês com `language=pt-BR` devolve **HTTP 200 com transcript vazio**,
não erro. O código atual gravaria `status: "selecting"` com transcrição vazia e o
Passo 3 receberia nada. Precisa de guarda.

### Achado 4: risco de estouro do maxDuration

4,5 min de áudio levaram 46,5 s incluindo o stream do Blob. O `maxDuration` é de
300 s. Vídeo de 20 minutos, com arquivo muito maior atravessando nosso servidor,
tem margem fina. A saída limpa é o modo assíncrono da Deepgram (parâmetro
`callback`), que devolve na hora e chama um webhook nosso quando termina,
eliminando o teto. Não implementado.

### Achado 5: contentType não é propagado

A rota chama `transcribeBlob(video.blobUrl)` sem `contentType`, então tudo vira
`video/mp4`, inclusive `.mov`, `.mkv` e `.webm`. O upload aceita os quatro.

### Dados de teste que ficaram no banco

Usuário `teste@demandou.com`, projeto "Projeto de teste" e um `VideoJob` com a
transcrição completa gravada. Servem de fixture para desenvolver o Passo 3 sem
pagar transcrição de novo.

### Correções aplicadas (achados 2, 3 e 5)

Tudo em `lib/media/transcribe.ts`, mais a persistência na rota.

**`smart_format=false`**, com o porquê registrado em comentário longo no código,
para ninguém religar por achar que formatação é sempre melhor.

**`contentType` vem do storage.** Descoberto que o `get()` do `@vercel/blob`
v2.3.2 devolve `blob.contentType` e `blob.size` junto com o stream. Não precisou
de coluna nova nem de migration nem de adivinhação por extensão. De quebra,
adicionada a guarda do `statusCode`: o retorno do `get` é união discriminada e o
304 vem sem corpo, o que viraria um POST de corpo vazio.

**Guarda de transcrição ruim, e aqui a primeira versão estava errada.** Eu havia
escrito só a guarda de transcript vazio. Testando com idioma errado de propósito,
a Deepgram não devolveu vazio: devolveu 63 palavras de lixo
(`。。。[[[[nconsistenceadowlunchmwintotmpoplicand`). Texto vazio é o caso fácil e
raro; lixo com aparência de texto é o caso perigoso.

Sinais medidos nos três cenários, mesmo áudio:

| Caso | Palavras/min | Confiança média | Palavras abaixo de 0,6 |
|---|---|---|---|
| pt-BR correto | 124,0 | 0,994 | 0,2% |
| ja, lixo | 13,9 | 0,459 | 69,8% |
| en, vazio | 0 | 0 | zero palavras |

Escolhida a **fração de palavras com confiança abaixo de 0,6**, com corte em 40%.
Separa 0,2% de 69,8%. A confiança média também separaria, mas é diluída por um
trecho bom no meio de um ruim. Palavras por minuto foi descartada de propósito:
cliente que grava 20 minutos e fala pouco, com pausas longas, cairia no falso
positivo.

`meanConfidence` e `wordsPerMinute` passaram a fazer parte do `TranscriptResult`
e são gravados no JSON da transcrição, para a tela de aprovação (Passo 5) poder
avisar que a gravação saiu ruim sem transcrever de novo para medir.

**O limite de 40% está calibrado com áudio sintético, que é limpo demais.**
Gravação humana com ruído de sala vai ter fração maior que 0,2%. Recalibrar
quando a gravação real chegar.

Verificado contra a API real: caminho feliz passa com 563 palavras e confiança
0,994; idioma japonês é barrado com a mensagem de confiança baixa; idioma inglês
é barrado com a mensagem de transcrição vazia.

### Pendente

- Gravação humana de 60 a 90 s em pt-BR com jargão em inglês. Fecha o Achado 1 e
  serve para recalibrar o limite de 40% da guarda.
- Achado 4 (modo `callback` assíncrono da Deepgram) continua aberto. Foi decidido
  deixar para depois do Passo 3.
- Passo 3 não começado. Fixture pronta no banco para desenvolver sem pagar
  transcrição de novo.
- Notion não atualizado nesta sessão. O conector está saudável no CLI
  (`claude mcp list` mostra "claude.ai Notion: Connected"), mas as ferramentas
  não foram expostas a esta sessão, que só recebeu o servidor `obs`. Resolve
  reiniciando a sessão.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 6): gravação humana, jargão confirmado e o áudio

### O achado 1 está confirmado: nova-3 em pt-BR apaga jargão em inglês

Gravação humana de 47 s feita pelo Bruno no OBS. O transcript em pt-BR não trouxe
nenhum dos termos em inglês, e a análise de buracos apontou onde: um vazio de
**3,68 s** entre "em inglês, não é então," e "esse tipo de palavra é importante",
sendo que o segundo maior buraco da gravação inteira é de 1,04 s.

Três configurações independentes recuperaram as mesmas duas palavras naquele
ponto, o que fecha a dúvida: era "payback, budget". Não é culpa da voz sintética.

| Configuração | O trecho |
|---|---|
| pt-BR (o que estava no código) | "em inglês, não é então, [buraco 3,68 s] esse tipo de palavra" |
| `language=multi` | "em inglês, né? Então, é payback, budget, esse tipo de palavra" |
| pt-BR + `keyterm` | "em inglês, não é então, payback, budget, esse tipo de palavra" |
| nova-2 + `keywords` | "em inglês, né, então, payback, budget, esse tipo" |

Confirma-se também que o sumiço de **palavra isolada** não deixa rastro. Só o
sumiço de uma sequência (aqui, duas palavras mais a pausa em volta) abriu buraco
grande o bastante para ser detectado.

### O keyterm satura, e cedo

Contraintuitivo e importante: quanto mais termos, menor o reforço em cada um.

| Keyterms passados | payback e budget | Maior buraco |
|---|---|---|
| 2 | recuperados | 1,04 s |
| 5 | recuperados | 1,04 s |
| 10 | apagados | 3,68 s |
| 20 | apagados | 3,68 s |
| 30 | apagados | 3,68 s |

Mandar um glossário grande de anglicismos não funciona. O orçamento útil é de
cerca de 5 termos.

Nota lateral: a documentação da Deepgram trata `keyterm` como recurso de inglês.
Ele funcionou em pt-BR aqui. Comportamento não documentado, então pode mudar sem
aviso.

### O que o multi troca

| | pt-BR | multi |
|---|---|---|
| payback, budget | apagados | recuperados |
| "Demandou" | correto | vira "Demando" (corrigível com keyterm) |
| Artigo "um" | correto | apagado 4 vezes, e keyterm não corrige |
| "por enquanto" | correto | vira "pelo quanto" |
| Palavras com confiança baixa | 2,9% | 5,0% |

**Decisão recomendada: `language=multi` mais `keyterm` com os nomes próprios do
cliente, no máximo 5.** O critério é qual perda dói menos: o multi perde palavra
funcional, o pt-BR perde palavra de conteúdo. Perder "um" vira ruído gramatical
que o agente redator conserta sozinho ao escrever o post. Perder "payback" apaga
o assunto da frase e deixa a referência seguinte sem antecedente, o que faz o
Passo 3 escolher trecho incoerente.

O orçamento de 5 keyterms é gasto com o que dá para saber de antemão, os nomes
próprios do cliente, que já vivem no contexto do projeto. O jargão, imprevisível,
fica por conta do multi.

Ressalva: uma gravação de 47 s. O padrão se repetiu em todas as rodadas, mas é
amostra única.

### A guarda de confiança está bem calibrada

Gravação humana deu 2,9% de palavras abaixo de 0,6, contra 0,2% do sintético e
69,8% do lixo. O corte de 40% tem folga larga dos dois lados. Mantido.

### O arquivo de vídeo não cabe no nosso próprio limite

A gravação do OBS: 92,53 MB para 47 s, vídeo a 16,16 Mbps e áudio a 159 kbps.

| | Na taxa do OBS do Bruno |
|---|---|
| Vídeo de 20 min | 2,42 GB |
| `MAX_BYTES` na rota de upload | 2,00 GB |

O vídeo semanal que o produto pede seria rejeitado pelo próprio upload. O upload
de 92,5 MB da casa do Bruno levou 107 s, então 2,42 GB levariam cerca de 45 min.

Custo fixo: o `MODELO_DE_NEGOCIO_v2.md` orça storage em R$ 11/mês. Com 30
clientes gravando 4 vídeos por mês nessa taxa entram 277 GB por mês,
acumulando. No terceiro mês são 830 GB, uns R$ 105/mês, e subindo sempre.

### Extrair o áudio resolve quase tudo, e o ffmpeg já está na máquina

`ffmpeg -vn -acodec copy` tira a faixa de áudio sem reencodar, instantâneo:
**92,53 MB viram 0,92 MB, 100 vezes menos.** O upload caiu de 107 s para 2,5 s e
a transcrição de 321 s para 3 s.

| | 20 min de vídeo | 20 min só do áudio |
|---|---|---|
| Tamanho | 2,42 GB | 23,9 MB |
| Upload da casa do cliente | ~45 min | ~30 s |
| Storage de 30 clientes/mês | 277 GB | 2,8 GB |

Os Passos 3 a 6 produzem texto e nenhum deles corta vídeo. Se a Fase 1 entrega
texto, os bytes do vídeo não precisam ser guardados, só o áudio. O preço é que a
Fase 2, quando for cortar clipes, vai precisar do vídeo. **Decisão de produto
ainda não tomada.**

O ffmpeg está instalado (WinGet, Gyan build 9.0). Não aparecia antes porque o
PATH da sessão anterior não tinha o diretório do WinGet.

### Falha de arquitetura observada no caminho

Transcrever direto do blob de 92,5 MB estourou: `SocketError: other side closed`
depois de 28 MB lidos. É contrapressão. O cano é Blob, servidor, Deepgram, e a
perna de saída era muito mais lenta que a de entrada, então a conexão com o Blob
ficou ociosa e o CDN a derrubou. Em produção as duas pernas são rápidas, então
isso não prova falha na Vercel, mas mostra que o desenho é frágil quando as
pernas são assimétricas. Mais um argumento para o áudio pequeno e para o modo
`callback`.

### Estado

Commit `f6e1888` com as correções dos achados 2, 3 e 5. A troca para `multi`
ainda não foi feita, aguardando decisão.

*Atualizado em 18/08/2026 por Claude Code.*
