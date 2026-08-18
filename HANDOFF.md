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
