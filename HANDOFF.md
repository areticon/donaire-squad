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

## Sessão 18/08/2026 (parte 7): multi ligado e a economia do vídeo

### Decisão 1 aplicada: `language=multi` com keyterm dos nomes próprios

Commit `1f70f1a`. `lib/media/keyterms.ts` novo, extrai até 5 nomes próprios do
contexto de marca do projeto (`ProjectContext` de tipo `brand`), com o nome do
projeto sempre em primeiro lugar. A rota passa isso para a transcrição.

Verificado ponta a ponta: "payback", "budget" e "Demandou" saem os três corretos
na mesma chamada. Permanecem as perdas conhecidas do multi ("vou fazer vídeo
curto", "pelo quanto").

Limitação conhecida da heurística: ela ignora a primeira palavra de cada frase,
porque maiúscula ali é posição e não nome próprio. Nome que só aparece começando
frase é perdido. É o preço de não gastar uma chamada de IA nisso.

### Decisão 2: guardar o vídeo. E a conta que isso obriga

Bruno decidiu guardar o vídeo, não só o áudio, porque a Fase 2 promete cortes e
não dá para prometer e não entregar. Pediu o cálculo de limite de duração e de
consumo de créditos por vídeo.

Preços verificados na documentação da Vercel em 18/08/2026: storage
US$ 0,023/GB-mês (5 GB inclusos no Pro), Blob Data Transfer US$ 0,05/GB, Fast
Origin Transfer US$ 0,06/GB, operações simples US$ 0,40/M, avançadas US$ 5,00/M.

Dois detalhes que mudam a conta:
1. **Blob acima de 512 MB nunca entra em cache.** Todo acesso é MISS, então paga
   Fast Origin Transfer sempre.
2. **Store privado paga transferência duas vezes**: a função busca no store e
   depois entrega ao navegador.

Resultado: no desenho de hoje, **transferência é 58% do custo** de um trabalho de
vídeo, não a transcrição nem a IA.

### O custo real por trabalho, e onde o preço fixo quebra

Com a taxa de gravação do Bruno (OBS padrão, 16 Mbps, medido em 118 MB/min):

| Duração | Clipes | Custo real | Receita a 100 créditos | Margem |
|---|---|---|---|---|
| 20 min | 5 | R$ 4,84 | R$ 10,00 | 52% |
| 30 min | 8 | R$ 7,31 | R$ 10,00 | 27% |
| 45 min | 11 | R$ 10,84 | R$ 10,00 | prejuízo |
| 60 min | 15 | R$ 14,50 | R$ 10,00 | prejuízo de R$ 4,50 |

Cobrança fixa por trabalho vira prejuízo por volta dos 40 minutos.

### Fórmula proposta: 2 créditos por minuto mais 4 créditos por clipe

Separa o que escala com o quê. O minuto paga transcrição, seleção, storage e
transferência; o clipe paga a escrita dos 3 textos.

| Duração | Clipes | Créditos | Face | Custo | Margem |
|---|---|---|---|---|---|
| 10 min | 3 | 32 | R$ 3,20 | R$ 0,85 | 73% |
| 20 min | 5 | 60 | R$ 6,00 | R$ 1,58 | 74% |
| 30 min | 8 | 92 | R$ 9,20 | R$ 2,42 | 74% |
| 60 min | 15 | 180 | R$ 18,00 | R$ 4,72 | 74% |
| 90 min | 15 | 240 | R$ 24,00 | R$ 6,17 | 74% |

Margem constante em qualquer duração, sem penhasco. Custo unitário medido:
R$ 0,049 por minuto processado e R$ 0,121 por clipe escrito nas 3 redes.

### Duas premissas que os números não confirmam

**O vídeo longo não come o mês.** No Pro de 1.800 créditos, um vídeo de 60
minutos consome 180, ou seja 10% do plano. Dá para gravar 10 vídeos de uma hora
por mês. Se a intenção for segurar vídeo longo, tem que ser limite explícito, não
preço.

**Conteúdo de vídeo fica 3,75 vezes mais barato por post.** Um trabalho de 20
minutos entrega 15 posts (5 clipes vezes 3 redes) por 60 créditos; os mesmos 15
posts pela tabela atual custariam 225. É coerente com o custo real, porque o
agente adapta em vez de pesquisar e inventar, mas significa que o cliente que
migrar para vídeo usa uma fração do plano e o crédito deixa de ser o limitador.

### O que a fórmula exige para não operar no vermelho

| Cenário | Margem a 20 min | Margem a 60 min | Precisa de |
|---|---|---|---|
| Hoje, sem mexer em nada | -3% | -3% | nada |
| Limitar o bitrate a 4 Mbps | 59% | 60% | validação no navegador |
| Mais extrair o áudio | 65% | 65% | ffmpeg |
| Mais preview de 800 kbps | 74% | 74% | ffmpeg com transcode |

**O limite de bitrate sozinho faz quase todo o trabalho, e é a única coisa da
lista que não precisa de ffmpeg.** O navegador sabe a duração (metadados do
elemento video) e o tamanho do arquivo antes de enviar, então dá para calcular
MB por minuto e recusar na hora, com instrução de ajuste no OBS.

Sem isso a fórmula opera no vermelho em qualquer duração. O problema nunca foi o
vídeo longo, foi o bitrate.

### O limite de tamanho é consequência, não escolha

Vídeo de 60 minutos, contra os 2 GB da rota de upload:

| Bitrate | Tamanho | |
|---|---|---|
| 16 Mbps (OBS padrão) | 6,92 GB | rejeitado |
| 8 Mbps | 3,52 GB | rejeitado |
| 4 Mbps | 1,76 GB | cabe |
| 2 Mbps | 0,88 GB | cabe |

### Detalhe de implementação do débito

A duração só é conhecida depois da transcrição, que é quem devolve
`metadata.duration`. Então o débito exato só pode acontecer no fim. Antes de
processar é preciso estimar pelo tamanho do arquivo e checar saldo, para não
fazer o trabalho de graça.

### Nada disso está implementado

A fórmula, o limite de bitrate e o débito são proposta. O que está no código é a
troca para `multi` com keyterm.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 8): tabela de custos completa

Pedido do Bruno: tabela viva no Notion com o custo de cada ponto de feature, o
fornecedor, o preço, como fica por plano, e a margem considerando CAC de
tráfego pago. Vive em "Tabela de custos e margem da Demandou (viva)", na pasta
`10-profissional/demandou`, linkada no Mapa Profissional.

Todos os preços foram verificados na documentação oficial em 18/08/2026, não
tirados de memória: Anthropic, Google, Deepgram, X, Vercel e Stripe.

### Achados que mudam número

**Só o Claude é instrumentado.** `ai_usage` recebe apenas as chamadas de
`lib/claude`. Gemini, Veo e Deepgram não gravam nada, e são justamente o custo
dominante nas operações de mídia. A instrumentação cobre a menor parte do custo.

**Os fallbacks tornam o custo não determinístico.** São cascatas, não escolhas:

| Arquivo | Tenta primeiro | Custo | Também na fila | Custo |
|---|---|---|---|---|
| `infographic.ts` | `gemini-3-pro-image` | US$ 0,134 | `gemini-2.5-flash-image` | US$ 0,039 |
| `nano-banana.ts` | `gemini-3.1-flash-image` | | `gemini-3-pro-image` | US$ 0,134 |
| `veo3.ts` | `veo-3.0-fast` | US$ 0,10/s | `veo-3.0` standard | US$ 0,40/s |

O caso do Veo é o pior: se o standard disparar, um vídeo de 8 segundos custa
R$ 18,05 contra R$ 10,00 de receita, **80% de prejuízo**, e ninguém saberia.

**O Stripe cobra 0,7% de Billing sobre assinatura**, além dos 3,99% + R$ 0,39.
Não estava no `MODELO_DE_NEGOCIO_v2.md`. E o Pix custa 1,19% + 0,7%, o que dá
R$ 4,56 por cliente por mês de diferença no Pro, 3% da receita.

**A transcrição multilíngue custa 21% a mais** que a monolíngue (US$ 0,0052
contra US$ 0,0043 por minuto). É consequência direta da decisão de hoje de usar
`language=multi` para recuperar jargão em inglês. Vale o preço, mas a constante
`estimateTranscriptionCostUsd` ainda tem o valor antigo.

**O Sonnet 5 está em preço promocional até 31/08/2026**: US$ 2,00 entrada e
US$ 10,00 saída, contra US$ 3,00 e US$ 15,00 do Sonnet 4.5 que o pipeline usa.
Migrar corta um terço do custo de texto enquanto durar, e depois iguala, então
não há risco de piorar.

**O custo fixo caiu para R$ 116/mês**, não R$ 232. O Supabase está no plano
gratuito e o Neon saiu. Break-even de infraestrutura: 2 clientes Pro.

### O CAC de tráfego pago não fecha

Montado por componentes, não chutado: CAC igual a CPC dividido pela conversão de
visita em teste, dividido pela conversão de teste em pagante. Faixas de
levantamentos brasileiros de SaaS B2B em 2026. Margem líquida do Pro: R$ 89,52.

| Cenário | CPC | Visita→teste | Teste→pagante | CAC | Payback | LTV | LTV/CAC |
|---|---|---|---|---|---|---|---|
| Otimista | R$ 4,50 | 5,0% | 22% | R$ 409 | 4,6 meses | R$ 895 | 2,19 |
| Provável | R$ 7,00 | 3,2% | 17% | R$ 1.287 | 14,4 meses | R$ 895 | 0,70 |
| Pessimista | R$ 10,00 | 2,0% | 12% | R$ 4.167 | 46,5 meses | R$ 895 | 0,21 |

No cenário provável, o cliente custa R$ 1.287 para entrar e devolve R$ 895 antes
de sair. Isso põe número na decisão que a estratégia já tinha tomado por
intuição: fase 1 é conteúdo do fundador, com CAC perto de zero.

A alavanca que muda o quadro não é o anúncio, é o preço. Plano anual ou ticket
maior encurta o payback proporcionalmente.

### Cards criados

Cinco, todos com o número que os justifica: travar o fallback do Veo
(bloqueante), instrumentar Gemini/Veo/Deepgram, migrar para Sonnet 5 antes de
31/08, corrigir a constante da transcrição, e avaliar Pix.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 9): Veo removido e o CAC refeito

### Veo removido

Commit `6148d94`. Motivo: o custo não era determinístico. A cascata tentava
`veo-3.0-fast` a US$ 0,10 por segundo e caía para `veo-3.0` standard a US$ 0,40,
o que levava um vídeo de 8 segundos de R$ 4,85 para R$ 18,05 contra R$ 10,00 de
receita. Prejuízo de 80% por operação, invisível, porque Veo nunca gravou em
`ai_usage`.

`lib/media/veo3.ts` deletado. O raio de alcance era menor do que parecia:
`generateVideo` tinha um único call site real, na rota de chat do card, e o
pipeline importava sem usar (ele já gerava um quadro estático). `video_8s` e
`video_8s_narrated` saíram da `CREDIT_COSTS`, e a opção Vídeo saiu do modal de
campanha. Build passa.

Vídeo passa a vir da gravação do próprio cliente, cortada e legendada, cobrada
por 2 créditos por minuto mais 4 por clipe.

### O CAC refeito, e uma correção minha

A análise anterior usou só Meta e uma conversão de 0,54% de visitante para
pagante. Os dois estavam errados.

O benchmark certo para **trial com cartão exigido**, que é o nosso caso, é de 35
cadastros e 10,5 pagantes por mil visitas, ou seja **1,05%**. Isso sozinho corta
o CAC pela metade.

CPC verificado por canal e nicho no Brasil em 2026: Saúde B2B R$ 4,50, Indústria
R$ 5,00, Meta SaaS R$ 7,00, Contabilidade R$ 8,00, Google Tech R$ 10,00,
Advocacia R$ 15,00, LinkedIn R$ 15 a R$ 50. **LinkedIn está descartado.**

**Armadilha do nicho barato:** o CPC de R$ 5 da indústria é de quem anuncia para
o setor industrial. Nós vendemos para um consultor industrial, e as palavras que
ele busca estão no leilão de SaaS a R$ 10 ou R$ 18. O setor do público não
define o leilão, a palavra define. O que resolve é cauda longa.

**O nicho não é a alavanca principal.** Mantendo R$ 149, o CPC máximo viável:

| Conversão visitante para pagante | churn 10% | churn 5% | churn 3% |
|---|---|---|---|
| 0,54% (a premissa errada) | R$ 1,62 | R$ 3,24 | R$ 5,40 |
| 1,05% (benchmark) | R$ 3,13 | R$ 6,26 | R$ 10,43 |
| 2,00% (bom) | R$ 5,96 | R$ 11,92 | R$ 19,87 |
| 3,50% (melhor da classe) | R$ 10,43 | R$ 20,86 | R$ 34,77 |

**A alavanca decisiva é o plano anual.** CAC máximo para LTV/CAC de 3: mensal
com churn 10% dá R$ 298; anual com renovação de 60% dá R$ 710. Trava 12 meses e
põe R$ 894 de margem no caixa no dia 1 contra CAC de R$ 200 a R$ 500.

### O cenário que fecha, e o teste que decide

Cauda longa a R$ 4, conversão de 2%, anual a R$ 1.490: CAC R$ 200, LTV/CAC 10,6,
R$ 2.000 por mês de anúncio para 30 clientes, R$ 44.700 na entrada.

Aguenta uma premissa cair, não duas. Quebra quando CPC e conversão falham juntos
(LTV/CAC 2,23).

**Recomendação: não decidir continuar ou pivotar com benchmark.** R$ 2.000 e duas
a três semanas medem as duas variáveis que decidem. Critério de sucesso: CPC
abaixo de R$ 6 e conversão de visita para cadastro acima de 3,5%.

Antes do teste precisa estar no ar a **demo instantânea**: página onde a pessoa
cola a URL do LinkedIn e recebe um post real na voz dela, de graça. Custa R$ 0,45
por demo. É a alavanca de conversão que só a Demandou tem, porque o produto é a
própria demonstração. Sem ela, o teste mede a landing errada.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 10): tema, landing e o mapa da jornada

### Tema escuro no padrão Discord

Commit `16bfe4a`. O tema usava `#0d0d0d`, praticamente preto. Dois problemas:
cansa a vista em uso longo e achata a hierarquia, porque sem luz suficiente
entre os níveis o card e o fundo viram a mesma coisa.

Nova escala, cada nível subindo de luminosidade, então elevação se lê sozinha
sem depender de borda:

| Token | Antes | Depois |
|---|---|---|
| `--bg-primary` | #0d0d0d | #1e1f22 |
| `--bg-surface` | #111111 | #2b2d31 |
| `--bg-elevated` | #1a1a1a | #313338 |
| `--bg-input` | #1a1a1a | #1e1f22 |
| `--border` | #2a2a2a | #3f4147 |
| `--text-primary` | #f5f5f5 | #dbdee1 |
| `--text-muted` | #9ca3af | #949ba4 |

Além dos tokens, 210 ocorrências de cor fixa em 16 arquivos foram migradas.

**Fica pendente:** landing, termos e privacidade têm cor fixa e não respondem ao
tema claro. É um problema separado.

### Landing: narrativa de dor no lugar de feature

Commit `3c721e4`. O hero vendia a ferramenta ("multi-agentes de IA para redes
sociais"). Agora segue a narrativa em camadas da `ESTRATEGIA.md`: dor, solução,
anti-objeção.

Seção nova com a regra 7-11-4 do Daniel Priestley (7 horas de conteúdo, 11
pontos de contato, 4 canais). Ela transforma "publique mais" em quantidade
concreta, e a quantidade concreta é impossível de manter sozinho. É o argumento
que justifica o produto existir.

**Duas afirmações falsas corrigidas:**
1. A landing prometia "sem cartão de crédito", mas o trial de 7 dias exige
   cartão. Contradição direta entre a landing e o código do checkout.
2. As features vendiam publicação de vídeo no LinkedIn, e vídeo gerado por IA
   saiu hoje.

### Mapa do site e da jornada

Levantado do código, não do que a gente imagina que existe. Vive no Notion em
"Mapa do site e da jornada do usuário".

Estrutura real: 4 itens de navegação global (Dashboard, Projetos, Agenda,
Plano), setup do projeto em 7 passos (Ideação, Voz e Estilo, Time de Agentes,
Design, Redes Sociais, Agenda, Ativação), e 7 abas dentro do projeto (Posts,
Gestor de Conteúdo, Agentes, Configurações, Analytics, Editar setup,
Treinamento).

**Os buracos que o mapa expôs, em ordem de custo:**

1. **Sem demonstração na landing.** É a variável de maior alavancagem no CAC e a
   única que depende só de nós.
2. **Portão de 7 passos antes de qualquer valor.** Posts, Gestor de Conteúdo e
   Analytics só aparecem com `status === "active"`. Quem abandona no passo 3
   nunca viu o produto funcionar.
3. **Dashboard vazio como primeira tela.** Quatro números zerados para quem
   acabou de chegar, quando deveria ser a próxima ação.
4. **Vídeo sem tela.** Upload e transcrição prontos e inalcançáveis pelo usuário.

### Tabela de custos atualizada

Veo removido da tabela, CAC refeito com os três canais, e seção 10 nova com a
composição completa: custo de um cliente Pro camada por camada com fornecedor e
percentual da receita, preço e margem por produto, e as três coisas que mais
mexem no resultado (bitrate, plano anual, conversão da landing).

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 11): demo pública e os buracos da jornada

### Demonstração pública na landing

Commit `10e8045`. O visitante escreve cru, do jeito que falaria com um cliente,
e recebe o post pronto para LinkedIn, X e Instagram. Sem cadastro.

**O desenho mudou em relação ao que eu tinha proposto.** Eu havia sugerido
"cola a URL do LinkedIn". Isso não funciona: nosso escopo OAuth
(`openid, profile, w_member_social`) só lê o perfil de quem já autorizou, e ler
o de um visitante qualquer exigiria raspar o LinkedIn, que é bloqueado e viola
os termos deles. Pedir texto cru ainda demonstra melhor o produto novo, onde
matéria-prima crua entra e conteúdo sai.

**Contenção de abuso**, porque é o único endpoint que chama o Claude sem sessão:
3 por IP por dia e 200 por dia global, os dois por env. O contador vive no
Postgres e não em memória, porque função serverless não compartilha memória
entre instâncias e um contador em módulo zeraria a cada cold start. O IP nunca é
gravado em texto puro, só o hash com sal do `BETTER_AUTH_SECRET`.

A tabela `demo_runs` guarda entrada e saída. Serve para medir a conversão da
demo em cadastro e, principalmente, para ler o que quem ainda não é cliente
escreve, que é a melhor pesquisa de posicionamento disponível.

**Custo medido contra a API real: R$ 0,04 por demo**, não os R$ 0,45 que eu
tinha estimado. A diferença é o desenho: estimei 4 chamadas com contexto cheio,
e o final usa 1 chamada com prompt curto.

| | Estimado | Medido |
|---|---|---|
| Por demo | R$ 0,45 | R$ 0,04 |
| Teto diário (200 demos) | R$ 90 | R$ 8 |
| No teste de R$ 2.000, se todos usarem | R$ 300 | R$ 27 |

Verificado: 200 em 15s com saída de qualidade real, 429 na quarta chamada do
mesmo IP com convite para criar conta, 400 em entrada curta demais.

### Os buracos da jornada, fechados

Commit `9293f7c`.

**1. O portão de 7 passos, o mais caro.** As abas Posts, Gestor de Conteúdo e
Analytics só apareciam com `status === "active"`, que é o passo 7 de 7. O
produto entregava zero valor até o último passo, e como o teste é de 7 dias com
cartão já cobrado, cada dia parado no setup era risco direto de cancelamento.

Agora, no passo 2 (Voz e Estilo), assim que existe nicho e tom, o cliente vê um
post de verdade escrito pelo squad dele. É a mesma prova da demo pública, já
personalizada. Rota nova `/api/projects/[id]/preview`, uma chamada, não grava
nada como post porque é prévia e não entrega.

**2. Dashboard vazio como primeira tela.** Quem acabava de criar conta via
quatro números zerados, que é a pior primeira tela possível porque não diz o que
fazer. Sem projeto nenhum, a tela agora vira a próxima ação.

**3. Landing, termos e privacidade não respondiam ao tema claro.** Tinham 206
cores fixas. Migradas para os mesmos tokens que o app inteiro usa.

### Descoberta de ambiente

A porta 3000 desta máquina serve o site da **Bem Natura**, outro projeto do
Bruno. O Demandou roda na 3001. Não confundir ao testar.

### Continua aberto do mapa da jornada

Vídeo sem tela: upload e transcrição prontos e inalcançáveis pelo usuário. É o
Passo 5 da fase 1, junto com o Passo 3 (agente que escolhe os trechos) e o
Passo 4 (textos por rede).

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 12): limite de bitrate e Passo 3

### O limite de bitrate obrigou a construir a tela

Commit `915672b`. Descoberta ao começar: o limite não existia como mudança
isolada porque **não havia tela de upload nenhuma**. A rota de API estava pronta
e nada a chamava, então metade do fluxo de vídeo era invisível.

A validação roda no navegador, antes de subir um byte, porque é o único lugar
onde duração e tamanho já são conhecidos e ainda dá tempo de recusar. Deixar a
pessoa esperar 45 minutos de upload para descobrir que o arquivo não serve seria
a pior experiência possível, e é exatamente o que aconteceria com a taxa padrão
do OBS.

Limites em `lib/media/limits.ts`, compartilhados entre navegador e rota para os
dois não divergirem: 40 MB por minuto (5,3 Mbps), 60 minutos, 2 GB.

**O bitrate é checado antes do tamanho, de propósito.** Quando os dois estouram,
e é o caso de quem grava no padrão do OBS, o tamanho é sintoma e o bitrate é a
causa. "O arquivo tem 2,31 GB" não diz o que fazer; "abaixe para 4000 Kbps" diz.

Verificado com números reais, incluindo a gravação do Bruno:

| Caso | Resultado |
|---|---|
| OBS padrão, qualquer duração | recusa, com instrução de baixar para 4000 Kbps |
| 4 Mbps, 20 min | aceita, 60 créditos |
| 4 Mbps, 60 min | aceita, 180 créditos |
| 5 Mbps, 20 min | aceita |
| 90 min | recusa por duração |
| Arquivo sem metadados | recusa, com dica de exportar em MP4 |

A tela mostra o custo em créditos antes de enviar e a lista do que já foi
enviado, com o estado em português do que o squad está fazendo.

**Um erro que quase passou:** eu escrevi `access: "public"` no upload. O store é
privado por decisão tomada em sessão anterior, porque vídeo cru do cliente é
material não publicado. Corrigido para `private`, e `multipart` ligado, que a
documentação recomenda acima de 100 MB porque repete só a parte que falhar em
vez de perder o upload inteiro.

### Passo 3: o agente que escolhe os trechos

Commit `1d96060`. `lib/media/select-clips.ts` e a rota
`/api/videos/[id]/select`.

O desenho é ditado pela restrição de custo, não por elegância: a saída precisa
alimentar UMA chamada por trecho no Passo 4. Por isso cada trecho já sai com
`ideia` e `transcricao` literal, para o redator não reler a gravação inteira nem
inventar o que a pessoa falou.

O agente lê os parágrafos com marcação de tempo, não a transcrição corrida,
porque precisa devolver início e fim em segundos.

**Saneamento antes de gravar.** O modelo às vezes devolve tempo fora da
gravação, trecho invertido ou sobreposto, e nada disso pode chegar ao Passo 4:
vira corte errado e post sobre a frase errada.

**Testado contra a transcrição real.** O agente escolheu os três momentos fortes
do roteiro (a tese do payback, o caso da indústria de embalagem, e a tese de
consistência) e descartou sozinho a abertura, o encerramento e a dica fraca. As
cinco verificações passaram: nenhum fora da duração, invertido, sobreposto,
curto demais ou longo demais. 16,7s para a chamada.

### Estado da fase 1 do vídeo

| Passo | Situação |
|---|---|
| 1. Armazenamento e upload | pronto, agora com tela e limite de bitrate |
| 2. Transcrição | pronta e testada |
| 3. Agente que escolhe os trechos | **pronto e testado** |
| 4. Textos de cada rede por trecho | não começado |
| 5. Tela de acompanhamento e aprovação | parcial: existe a tela de envio e a lista com estado |
| 6. Débito dos créditos | não começado |

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 13): Passo 4 e Passo 6

### Passo 4: os textos de cada rede

Commit `e1dd98d`. `lib/media/write-posts.ts` e `/api/videos/[id]/write`.

Uma chamada por trecho devolvendo as três redes juntas, que era a restrição de
custo definida antes. O comentário no arquivo avisa quem for mexer depois: uma
chamada por trecho por rede levaria o trabalho de R$ 1,50 para R$ 7,50 contra a
mesma receita, derrubando a margem de 85% para 25%.

Roda em paralelo porque os trechos são independentes, e um que falhar não
derruba os outros. Entregar quatro de cinco é melhor que entregar zero.

**Dois achados do teste com dado real:**

**1. O modelo estourou o limite do X.** Saiu um post de 286 caracteres, e o
limite duro da rede é 280. Esse post seria recusado na publicação. Agora a
instrução pede 240 e existe guarda: se estourar, uma chamada curta encurta, e se
ainda estourar, corta na fronteira de frase. Nunca publica cortado no meio da
palavra.

**2. O prompt caching não pegou.** `cacheW=0` e `cacheR=0` nas três chamadas. O
prefixo deu uns 700 tokens, abaixo do mínimo de 1024. É a armadilha já
documentada: projeto sem documento de contexto não cacheia e a API não avisa.
Com o contexto de marca preenchido o prefixo passa do mínimo, o que reforça o
card de tornar o contexto obrigatório no onboarding.

Custo medido do Passo 4 com 3 trechos: US$ 0,032, ou R$ 0,175.

### Passo 6: o sistema de créditos, que não existia

Descoberta ao começar: **não havia saldo, extrato nem débito em lugar nenhum.**
A `CREDIT_COSTS` estava definida em `lib/stripe` e nada a usava. O único campo
de crédito no banco era o `creditsCharged` do `VideoJob`.

Modelo novo: `creditsBalance` e `creditsResetAt` no `User`, e
`CreditTransaction` como extrato, uma linha por movimento. Saldo sozinho não
responde onde o cliente gastou, se a cobrança bate com a entrega, nem quanto
estornar quando algo falha.

`lib/credits` é o único lugar que mexe em saldo. O débito usa a condição de
saldo no `where` do `updateMany`, então a corrida não existe: ou a linha bate a
condição e debita, ou não bate e falha.

**Verificado, incluindo a corrida:** 10 débitos simultâneos de 200 sobre saldo
de 1.740. Passaram exatamente 8, o saldo terminou em 140 e nunca negativou, e a
soma do extrato bate com o saldo.

**Onde a cobrança acontece, e por quê.** No Passo 4, não no upload, porque a
duração real só é conhecida depois da transcrição e é ela que define o preço
junto com o número de trechos. Cobra antes de escrever: sem saldo, o cliente
descobre antes de a gente gastar com a API. Idempotente por `refId`, então
retentativa não cobra duas vezes.

**Reposição do ciclo no webhook do Stripe.** Repõe em vez de somar, senão quem
usa pouco vira um passivo crescente e a projeção de custo deixa de valer. Com
guarda de data, porque o Stripe dispara `customer.subscription.updated` por
vários motivos que não são renovação (troca de cartão, mudança de metadados), e
sem o guarda cada um desses daria um mês de créditos de graça.

### Estado da fase 1 do vídeo

| Passo | Situação |
|---|---|
| 1. Armazenamento e upload | pronto, com tela e limite de bitrate |
| 2. Transcrição | pronta e testada |
| 3. Agente que escolhe os trechos | pronto e testado |
| 4. Textos de cada rede por trecho | **pronto e testado** |
| 5. Tela de acompanhamento e aprovação | parcial: envio, lista com estado e botões de cada etapa. Falta a tela que mostra os posts para aprovar |
| 6. Débito dos créditos | **pronto e testado** |

### Pendente que a parte 13 criou

- A tela de aprovação dos posts gerados, que é o que falta do Passo 5.
- Nenhum outro pipeline debita crédito ainda. O de texto e imagem continua sem
  cobrar, porque o sistema não existia até hoje.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 14): tela de aprovação e o bug intermitente

### A Fase 1 do vídeo está completa

Commit `d1c0276`. Quando o trabalho fica pronto, os posts aparecem **sob o vídeo
que os gerou**, e não numa tela separada: o cliente precisa lembrar de qual
momento da gravação cada texto saiu para julgar se ficou fiel ao que ele quis
dizer.

Editável de propósito. O squad acerta o tom na maior parte das vezes, mas a
pessoa conhece o próprio caso melhor que qualquer modelo, e obrigar a aprovar
como está transformaria uma correção de dez segundos em um pedido de refazer,
que custa uma chamada nova.

Aprovar cria `Post` de verdade no fluxo que já existe, com publicação,
agendamento e métricas. O vídeo não ganha caminho próprio de publicação, seria
duplicar tudo. Instagram entra como rascunho mesmo sem poder publicar, porque o
App Review da Meta está pendente, e assim o texto fica pronto para o dia que
sair.

### O bug que quase passou, e a lição

O teste ponta a ponta mostrou **2 de 3 trechos virando post**. Um terço
falhando. Ao investigar, rodou 3 de 3: a falha era **intermitente**.

Intermitente é pior que determinística, porque passa no teste e quebra em
produção de vez em quando, e aí ninguém liga o defeito à causa.

Causa: o modelo emite quebra de linha crua dentro da string JSON, o que invalida
o JSON, e post de LinkedIn é cheio de quebra de linha.

**Em vez de torcer para não repetir, o formato saiu do JSON e virou delimitador**
(`===LINKEDIN===`), que não tem caractere para escapar.

| | JSON | Delimitador |
|---|---|---|
| Primeiro teste real | 2 de 3 | |
| Três rodadas seguidas | | 9 de 9 |

O parser foi testado também com cerca de código, preâmbulo do modelo, aspas,
chaves e barras dentro do texto, e com rede faltando.

O Passo 3 continua em JSON, porque são seis campos por trecho e delimitador
ficaria ruim, mas ganhou instrução explícita e um parse tolerante que escapa a
quebra de linha antes de tentar de novo.

### Um erro de arquitetura que o build pegou

Mover `MAX_X` para `lib/media/limits.ts` foi necessário, não estética. A tela de
aprovação é componente de cliente e importava a constante de `write-posts`, que
importa o Claude, que importa o Prisma, que arrastava o driver do Postgres para
o bundle do navegador. O build falhou com `Can't resolve 'dns'`.

Regra que fica: **constante compartilhada entre cliente e servidor mora em
módulo sem import de servidor.** `lib/media/limits.ts` é esse lugar para o
fluxo de vídeo.

### Estado da fase 1 do vídeo: completa

| Passo | Situação |
|---|---|
| 1. Armazenamento e upload | pronto, com tela e limite de bitrate |
| 2. Transcrição | pronta e testada |
| 3. Agente que escolhe os trechos | pronto e testado |
| 4. Textos de cada rede por trecho | pronto e testado |
| 5. Tela de acompanhamento e aprovação | **pronta** |
| 6. Débito dos créditos | pronto e testado |

Fluxo verificado ponta a ponta no banco: seleção, cobrança de 22 créditos com
idempotência, redação, e três posts criados como rascunho.

### O que continua aberto

- **Nenhum outro pipeline debita crédito.** Texto, imagem e carrossel continuam
  gerando sem cobrar, porque o sistema de créditos nasceu hoje. Enquanto isso, o
  plano é ilimitado na prática e a margem por plano do modelo não vale.
- Modo assíncrono da Deepgram (`callback`), para vídeo longo não esbarrar no
  `maxDuration`.
- Migrar o pipeline para Sonnet 5 antes de 31/08, enquanto dura o preço intro.
- Instrumentar Gemini e Deepgram em `ai_usage`.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 15): fechando o vazamento de receita

### O pipeline passou a cobrar

Commit `ad6e2ff`. A `CREDIT_COSTS` existia desde agosto e **não era usada por
ninguém**: o pipeline gerava texto, imagem e carrossel sem cobrar nada. Enquanto
foi assim, o plano era ilimitado na prática e a margem por plano do modelo não
valia.

Dois pontos, e a separação é deliberada:

**Verificação na entrada**, antes de qualquer chamada paga. A estimativa
superestima de propósito (assume que todo dia agendado vira post em todas as
redes e que "free" custa como imagem). Barrar quem não tem saldo é o objetivo.
Rodar a campanha inteira para descobrir no fim que o cliente não podia pagar
seria gastar com a API e não receber.

**Cobrança no fim, pelo que foi entregue**, não pelo que foi planejado. Se a
geração de imagem falhou e o post saiu só com texto, o cliente paga texto.
Idempotente por `runId`.

Se o saldo faltar na hora de cobrar, o trabalho já foi feito: cobrar não pode
apagar a entrega, então vira registro no log e não erro para o cliente.

**Consumo verificado contra o que o plano oferece:**

| Cenário | Por mês | Cabe no Pro (1.800)? |
|---|---|---|
| 3 redes, imagem todo dia | 1.500 | sim, sobram 300 |
| 3 redes, imagem 2x por semana | 1.300 | sim, sobram 500 |
| 2 redes com imagem | 1.200 | sim, sobram 600 |
| só LinkedIn com imagem | 500 | sim, sobram 1.300 |

A promessa da landing (campanha completa nas 3 redes) cabe no plano Pro.

A página de Plano ganhou saldo, barra de consumo, aviso quando está acabando e
os últimos movimentos. O extrato vem junto do saldo porque saldo sozinho gera a
pergunta "onde foi parar", e responder por suporte custa mais caro que mostrar.

### Migração para Sonnet 5

Commit `e90f495`. Preço promocional de US$ 2,00 na entrada e US$ 10,00 na saída
até 31/08/2026, contra US$ 3,00 e US$ 15,00 do 4.5. Um terço a menos no custo de
texto, e depois iguala, então não existe cenário em que a troca fique mais cara.

**Verificado antes de trocar:** nenhuma chamada nossa ao Claude usa
`temperature`, `top_p`, `top_k`, `budget_tokens` nem prefill de assistente, que
são os parâmetros que o Sonnet 5 rejeita com 400. Os `temperature` que existem
no projeto são de chamadas ao Gemini e ao Grok.

**Verificado depois:** chamada real respondeu em 3,8s e a instrumentação gravou
`modelo=claude-sonnet-5` com custo correto.

A tabela de preço mantém o valor cheio, e não o promocional, de propósito:
superestimar custo é seguro, subestimar é o que quebra projeção. Quando a intro
acabar, o número já está certo.

### Gemini e Deepgram instrumentados

Commit `bfe50b4`. Até agora só o Claude gravava consumo, e nas operações de
mídia o Claude é a **menor** parte do custo.

**O modelo gravado é o que realmente respondeu, não o que foi pedido.** Em
cascata de fallback essa distinção é o dado inteiro: entre o Gemini Flash a
US$ 0,039 e o Pro a US$ 0,134 há 3,4 vezes de diferença, e nada no retorno da
função denuncia qual rodou. Por isso a gravação acontece dentro da cascata, no
ponto de sucesso, onde o nome do modelo está em escopo.

A transcrição grava distinguindo monolíngue de multilíngue, porque o multi custa
21% a mais e é o que usamos.

Mídia não tem token, então as colunas de token ficam em zero de propósito:
misturar unidades na mesma coluna daria número errado em qualquer soma futura.

Verificado com transcrição real: gravou `nova-3-multi`, US$ 0,00407 para 47s,
que bate exatamente com o preço por minuto, e com o `projectId` vinculado.

### O que continua aberto

- Modo assíncrono da Deepgram (`callback`), para vídeo longo não esbarrar no
  `maxDuration`.
- Consolidar os três modelos de imagem do Gemini em um. Agora que o consumo é
  gravado, dá para decidir com dado em vez de opinião.
- Nada foi enviado ao GitHub: o branch `feat/own-auth` continua só na máquina.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 16): o código foi para o GitHub

### Push feito, e duas correções de rumo

Os 42 commits que existiam só nesta máquina foram enviados. **Dois fatos que
mudaram o plano na hora de executar:**

1. **O branch padrão do repositório é `master`, não `main`.** Não existe `main`.
2. **O build não rodava migration.** Deployar assim quebraria em runtime com
   "tabela não existe" em toda rota que tocasse `credit_transactions`,
   `demo_runs` ou as colunas novas de saldo.

Corrigido antes de empurrar, commit `d36ab43`: o build passou a rodar
`prisma migrate deploy --config prisma.config.ts`. Usa o config de propósito, e
não a `DATABASE_URL`: o config aponta para a `DIRECT_URL`, e o pooler do
Supabase em modo transaction não aceita o DDL do Prisma Migrate. Essa armadilha
já tinha sido paga na migração para o Supabase.

**Consequência: `DIRECT_URL` virou obrigatória na Vercel.** Sem ela o build
falha.

### O que precisa estar na Vercel

| Variável | O que quebra sem ela |
|---|---|
| `DIRECT_URL` | o build inteiro |
| `DEEPGRAM_API_KEY` | transcrição de vídeo |
| `STRIPE_BUSINESS_PRICE_ID`, `STRIPE_STUDIO_PRICE_ID` | checkout desses planos |
| `DATABASE_URL` no Supabase | tudo, se ainda apontar para o Neon morto |

Os preços R$ 149, R$ 249 e R$ 449 continuam sem existir no Stripe.

Referências mortas que ainda leem env de integração removida:
`lib/blotato/index.ts` e `lib/pusher/index.ts`.

### Estado do banco na hora do push

Um usuário (o de teste), um projeto, zero posts. Ou seja, **nenhum cliente real
foi afetado** pela chegada do sistema de créditos, que era o maior risco do
deploy: usuário existente nasce com saldo zero e o pipeline recusa com 402 até a
renovação repor.

### Transcrição assíncrona

Commit `71fddd3`. O modo direto segura a requisição enquanto o áudio atravessa o
nosso servidor duas vezes. Vídeo longo esbarra no `maxDuration`, e o caso medido
foi pior: 92 MB direto do blob estourou com `SocketError` depois de 28 MB, por
contrapressão.

**A restrição que define o desenho:** o callback precisa alcançar um endereço
público, e em localhost a Deepgram não chega. Por isso `suportaCallback()`
decide, e o modo direto continua como caminho de desenvolvimento. Mandar
callback para endereço inalcançável seria o pior desfecho: ela transcreveria,
cobraria, e o resultado não voltaria para lugar nenhum.

**Autenticação.** O endereço é público por definição. Sem assinatura, qualquer
um que descobrisse a rota poderia sobrescrever a transcrição de um cliente, ou
plantar texto que viraria post publicado no nome dele. A assinatura é HMAC do id
do vídeo com o segredo da aplicação, comparada em tempo constante, porque `===`
vaza pelo tempo de resposta quantos caracteres do começo estavam certos.

**O corpo do webhook passa pelas mesmas guardas do modo direto.** Confiar no
corpo só porque a assinatura conferiu seria confundir "veio de quem eu espero"
com "veio correto".

Idempotente, porque a Deepgram repete o callback se não receber 200. Em falha
nossa devolve 200 de propósito: repetir não conserta transcrição ruim e o erro
já fica gravado no vídeo.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 17): produção no Supabase, e o que travou

### A decisão: banco de produção separado, sem custo

Ao tentar criar um projeto Supabase novo para produção, o limite apareceu:

```
areticon (2 project limit)
```

O plano gratuito permite 2 projetos ativos por organização, e a `donaire` já
tem `demandou` e `bem-natura`. Um terceiro exigiria o Pro, US$ 25 por mês, que
são R$ 138 e mais que dobrariam o custo fixo de R$ 116.

**A saída foi o PostgreSQL 17 que já está instalado na máquina do Bruno**, na
mesma versão do Supabase:

| | Produção | Desenvolvimento | Custo extra |
|---|---|---|---|
| Escolhido | Supabase `demandou` | Postgres local | zero |

O projeto `demandou` do Supabase virou produção. Tinha só o usuário de teste
dentro, então promover foi apagar uma linha, não migrar dados.

**Limitação assumida:** o Postgres local não reproduz duas coisas do Supabase
que já morderam este projeto, a Data API e os grants do `anon`. Mas as duas são
exatamente o que a migration `revoke_data_api_access` resolve, e ela roda igual
nos dois.

### Limpeza do banco de produção

Apagados o usuário de teste, o projeto, os dois vídeos, as 30 linhas de
`ai_usage` e as 3 de `demo_runs`. Banco zerado.

**Achado do caminho:** `Project` não tem cascade a partir de `User`, então
apagar um usuário falha com violação de chave estrangeira enquanto ele tiver
projeto. Vale lembrar quando a exclusão de conta virar requisito de LGPD.

### O que já foi escrito na Vercel

`BETTER_AUTH_SECRET` (novo, diferente do de desenvolvimento, porque é ele que
assina as sessões e reusar faria uma sessão local valer em produção),
`BETTER_AUTH_URL`, `DEEPGRAM_API_KEY` e `BLOB_READ_WRITE_TOKEN`.

### O que travou, e por quê

`DATABASE_URL` e `DIRECT_URL` **existem** em produção, apontando para o Neon
morto. Trocar exige remover antes, e o `vercel env rm` foi bloqueado pelo
classificador de segurança, por ser remoção em produção. Não foi contornado.

**Correção de um erro meu:** eu tinha relatado que `DIRECT_URL` estava ausente.
Estava presente. Eu havia cortado a listagem de variáveis em 40 linhas e
concluído de dado incompleto. A lista real tem 31 variáveis.

### O que falta para o deploy subir

1. Trocar `DATABASE_URL` e `DIRECT_URL` para o Supabase (valores no `.env.local`).
2. Remover as 8 variáveis do Clerk, que descrevem integração que saiu do produto.
3. A senha do PostgreSQL local, para montar o banco de desenvolvimento.
4. Os preços R$ 149, R$ 249 e R$ 449 continuam sem existir no Stripe.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 18): o site subiu, e dois bugs que só produção mostra

### Decisão: um ambiente só, por enquanto

Bruno: produção sozinha até entrarem 10 clientes, e aí assina o Supabase Pro e
separa. Consequência assumida: o `.env.local` aponta para o mesmo banco que o
site, então teste na máquina mexe em dado de produção. Com zero cliente, aceito.

Isso torna o card do Postgres local uma otimização adiada, não um bloqueio.

### Bug 1: variável Sensitive não existe durante o build

O deploy falhava com `Connection url is empty` mesmo depois de o Bruno colar as
URLs no painel. E ele relatava que ao voltar na tela o campo estava vazio.

As duas coisas têm a mesma causa: **as variáveis recriadas nasceram como
`Sensitive`**, e variável Sensitive na Vercel é write-only (o painel nunca
mostra de volta) e **não é exposta durante o build**, só em runtime. O
`prisma migrate deploy` roda no build.

| Variável | Tipo depois da edição | Tipo das que funcionavam |
|---|---|---|
| `DATABASE_URL` | Sensitive | Non-sensitive |
| `DIRECT_URL` | Sensitive | Non-sensitive |

A saída foi `vercel env add --force --no-sensitive`, que sobrescreve sem
precisar do `rm` (que estava bloqueado) e grava como legível pelo build.

**Regra que fica: qualquer variável usada no build precisa ser Non-sensitive.**
Hoje isso vale para `DATABASE_URL` e `DIRECT_URL`.

**Detalhe que também confundia:** no `.env.local` o dotenv retira as aspas ao
ler; o painel da Vercel guarda literalmente o que for digitado. Colar com aspas
faz as aspas virarem parte do valor.

### Bug 2: o Sonnet 5 devolve pensamento antes do texto

Com o deploy no ar, a demonstração pública respondia 500. O erro gravado em
`demo_runs`: `Unexpected response type`.

Causa: `askClaude` pegava `message.content[0]` e exigia que fosse texto.
Funcionava no Sonnet 4.5. **No Sonnet 5 o pensamento adaptativo vem ligado por
padrão quando o parâmetro `thinking` é omitido**, então o primeiro bloco passa a
ser de pensamento e a chamada morria.

O teste que fiz na migração passou porque o prompt era curto e não acionou o
pensamento. O prompt real da demonstração acionou. **O bug dependia do tamanho
da tarefa**, que é a pior forma de falha: parece aleatória e passa em qualquer
teste rápido.

Corrigido lendo **todos** os blocos de texto em vez do primeiro bloco, o que
também deixa o código imune a bloco novo que a API venha a introduzir. E quando
não vier texto nenhum, a mensagem agora diz quais blocos vieram.

Verificado com prompt curto (2,2 s) e com o prompt longo da demo (16,3 s).

### Estado

O demandou.com responde 200 com a landing nova. As migrations rodaram no build
contra o Supabase. Falta confirmar a demo em produção depois do deploy da
correção.

Pendências que não dependem de código: os preços R$ 149, R$ 249 e R$ 449 ainda
não existem no Stripe, e as 8 variáveis do Clerk continuam na Vercel como peso
morto (o `vercel env rm` está bloqueado para mim).

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 19): o checkout, que estava 100% quebrado

### Três coisas quebradas, nenhuma visível sem tentar assinar

Ao preparar o guia do Stripe, a auditoria pela API achou:

**1. As variáveis guardavam ID de produto, não de preço.** `STRIPE_PRO_PRICE_ID`
continha `prod_UJ4Nzgmjcivl4`, e o checkout faz `line_items: [{ price: id }]`,
que exige `price_`. Pior: aquele produto **nem existia mais** na conta
(`No such product`). Qualquer clique em assinar dava erro, em todo plano.

**2. Os preços eram os antigos:** R$ 49, R$ 99, R$ 199 e R$ 399. Os da Opção B
não existiam.

**3. Boleto pedido no código e não ativado na conta.** Só cartão e Apple Pay
estão ativos, e o Stripe recusa a sessão inteira quando se pede um meio não
ativado. Commit `4d069f7` tirou o boleto, o que também alinha com o desenho: o
teste de 7 dias exige cartão para filtrar quem não pretende pagar, e boleto é
pagamento avulso que não deixa meio de cobrança guardado.

**O webhook estava certo**, apontando para `demandou.com/api/webhooks/stripe`,
ativo, com exatamente os 4 eventos que o código trata. E **nunca houve nenhuma
assinatura**, então nada disso afetou cliente.

### O que foi feito pela API

O Bruno perdeu o autenticador ao trocar de celular e está sem acesso ao painel
do Stripe. Nada disso exigiu painel: a chave `sk_live` vive nas variáveis da
Vercel e a API faz o mesmo.

| Ação | Resultado |
|---|---|
| AGENCY renomeado para STUDIO | ok |
| Preço PRO R$ 149 | `price_1U5y0jJIhzTmSVmMZ6sBTWWW` |
| Preço BUSINESS R$ 249 | `price_1U5y0jJIhzTmSVmM04TMIHBE` |
| Preço STUDIO R$ 449 | `price_1U5y0kJIhzTmSVmMXH7kgpQK` |
| As três envs na Vercel | gravadas com `price_` |

**Verificado com sessão de checkout real:** `cs_live_...` criada, status `open`,
URL gerada, valor R$ 0,00 na entrada por causa do teste de 7 dias, que é o
comportamento correto (cobra R$ 149 depois).

Deploy em produção `Ready`, site responde 200 e a demonstração continua de pé.

### Pendente

Arquivar o produto STARTER e os quatro preços antigos ficou bloqueado pelo
classificador de segurança, por ser desativação de recurso. Não afeta nada: o
código só referencia as variáveis, e os preços antigos ficam parados.

*Atualizado em 18/08/2026 por Claude Code.*

## Fechamento da sessão de 18/08/2026

### O que existe em produção agora

demandou.com no ar, servindo o deploy de hoje. Login próprio, banco Supabase com
migrations aplicadas pelo build, checkout do Stripe com os preços da Opção B,
demonstração pública funcionando, fluxo de vídeo completo e sistema de créditos
com saldo, extrato e cobrança.

45 commits que estavam represados foram para o GitHub, em `master`.

### A constante da transcrição, corrigida no fim

`estimateTranscriptionCostUsd` passou de US$ 0,0043 para US$ 0,0052, que é o
preço do multilíngue que usamos desde hoje. Subestimava 21%, e subestimar custo
é o erro que quebra projeção de margem.

### As sete falhas do dia, e o que elas têm em comum

Nenhuma quebrava compilação. Todas apareceram ao encostar em dado real:

1. A Deepgram apagando jargão em inglês, sem erro e sem rastro
2. A Deepgram devolvendo 200 com lixo dentro quando o idioma está errado
3. O prompt caching que não cacheia abaixo de 1024 tokens e não avisa
4. O modelo estourando o limite de 280 caracteres do X
5. JSON quebrando de forma intermitente por quebra de linha crua
6. O Sonnet 5 devolvendo bloco de pensamento antes do texto
7. O checkout do Stripe apontando para produtos que nem existiam

**Regra que fica: em integração com terceiro, medir o que voltou.** Nunca
confiar no código de status nem na instrução dada. E quando a falha for
intermitente, eliminar a classe do problema em vez de reduzir a probabilidade.

### O que decide o próximo passo, em ordem de peso

1. **Teste de R$ 2.000 em tráfego pago.** Mede o CPC real em cauda longa e a
   conversão real da landing, que são as duas variáveis que decidem se o negócio
   escala. Precisa da demo no ar, e ela está.
2. **Plano anual de R$ 1.490.** Sobe o CAC máximo viável de R$ 298 para R$ 710 e
   põe o dinheiro no caixa antes de pagar o anúncio.
3. **Fórmula de crédito do vídeo na `CREDIT_COSTS`.** O limite de bitrate já
   está no código; falta a cobrança de 2 por minuto mais 4 por clipe entrar na
   tabela canônica.

### Aberto e conhecido

- Arquivar o STARTER e os preços antigos no Stripe (bloqueado pelo classificador,
  sem efeito prático).
- Consolidar os três modelos de imagem do Gemini. Agora dá para decidir com dado,
  porque a instrumentação grava qual modelo respondeu.
- Tornar o contexto do projeto obrigatório no onboarding. Sem ele o prompt
  caching não pega e o conteúdo fica genérico: os dois motivos apontam para a
  mesma mudança.
- Banco de desenvolvimento no Postgres local, quando fizer sentido separar.
- App Review da Meta para publicar no Instagram.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 18/08/2026 (parte 20): plano anual e a landing travada no escuro

### O plano anual de R$ 1.490, inteiro

O passo 1 da lista de fechamento virou código e produção. O que parecia "criar
o price e ligar no checkout" tinha um buraco que só a leitura do webhook
mostrou: quem repõe os 1.800 créditos mensais é o `customer.subscription.updated`
guardado por `current_period_start`, e numa assinatura anual esse valor só muda
uma vez por ano. Sem tratamento, o assinante anual receberia créditos no dia 1
e nada até o mês 13.

O desenho que entrou:

- **Price live** `price_1U5yu2JIhzTmSVmM6gvWfh2j`, R$ 1.490/ano no mesmo
  produto Pro, criado pela API (Bruno perdeu o autenticador do painel).
  Verificado com sessão de checkout real, expirada em seguida.
- **No banco o plano continua `"pro"`.** Quem sabe se o cliente é anual é o
  Stripe. Nenhuma migration.
- **`/api/cron/annual-credits`**, diário às 13h UTC: pergunta ao Stripe quem
  tem assinatura ativa no price anual e repõe via `reporCiclo` quando
  `creditsResetAt` passou de 30 dias. `reporCiclo` zera para o teto, não soma,
  então rodar duas vezes não dá crédito. O corte de 30 dias dá 12,1 reposições
  por ano; imprecisão aceita pela simplicidade.
- **Isso usou o segundo e último cron do plano Hobby da Vercel.** O próximo
  cron exige plano pago ou cron externo.
- Checkout aceita `ciclo: "anual"` e devolve 400 se o price não estiver no
  ambiente, em vez de cair no mensal em silêncio.
- `STRIPE_PRO_ANNUAL_PRICE_ID` na Vercel como Non-sensitive (regra da parte 18)
  e no `.env.local`.

Por que o anual importa: sobe o CAC máximo viável de R$ 298 para R$ 710 e põe
R$ 894 de margem no caixa no dia 1. É a alavanca que torna o teste de tráfego
pago menos arriscado. A conta inteira vive na nota do CAC no Notion.

### O cupom que a landing prometia não existia

A auditoria pela API achou: o código 50LANCAMENTO nunca foi criado no Stripe, e
o checkout nem mostrava campo de cupom (`allow_promotion_codes` ausente). Dupla
promessa quebrada. Decisão do Bruno: **remover a promessa da landing** em vez
de criar o cupom. Motivo de não criar às pressas: cupom de 50% por 3 meses no
Stripe se aplica por fatura e não distingue mensal de anual no mesmo produto,
então o código público descontaria R$ 745 da fatura anual. Se um dia o cupom
voltar, o caminho limpo é price anual em produto separado e cupom restrito por
produto. O campo de cupom ficou habilitado no checkout, para cupons futuros.

### A landing misturava claro e escuro

Bruno trocou o tema para claro dentro da plataforma e a landing quebrou: o
script inline aplica o tema salvo no `<html>` inteiro, e a landing misturava
variáveis de tema (que clareiam) com fundos fixos escuros (`bg-[#111]`). Texto
escuro em fundo escuro.

**Decisão: tema é preferência de quem usa a plataforma; a landing é vitrine e
tem uma cara só, a escura.** Um `data-theme="dark"` no `<main>` da landing
resolve, porque variável CSS herda do ancestral mais próximo, então o wrapper
vence o `<html>` para tudo dentro dele.

Verificado com screenshot nos dois cenários (tema claro salvo e escuro salvo):
renderização idêntica. A lição da sessão continua valendo: o build passava nos
dois casos, só o render mostrava o bug.

De carona, o passe de design que o Bruno pediu:

- Cards saíram do `#111` (paleta quase preta aposentada em 18/08) para
  `var(--bg-card)` da paleta Discord: card agora eleva em vez de afundar.
- Espaçamento unificado: seções em `py-24 lg:py-32`, títulos em `mb-16`.
- Descrições dos cards de funcionalidades de `text-xs` para `text-sm`.
- "Powered by Claude · Gemini · Blotato" removido do rodapé. O Blotato saiu do
  produto há duas semanas; era propaganda de intermediário que não existe mais.
- Passo 04 do "Como funciona" parou de prometer publicação automática no
  Instagram, que aguarda App Review da Meta. Agora diz que o conteúdo do
  Instagram sai pronto para postar, que é o que o produto faz hoje.
- Dois travessões removidos de textos da landing.

### O que o classificador bloqueou desta vez

`vercel env pull` (segredos de produção para arquivo local) foi bloqueado
mesmo com autorização verbal do Bruno; ele rodou o comando no terminal dele e o
arquivo temporário foi apagado depois do uso. Padrão que se repete nas partes
17, 19 e agora: operação sensível em produção é do Bruno, o resto é meu.

### Termos e privacidade atualizados para o produto real

Os dois documentos estavam datados de 09/04/2026 e descreviam um produto que
não existe mais. O que entrou:

**Termos:** ciclo anual na cláusula de planos; o trial de 7 dias com cartão
descrito com a regra de cobrança; **direito de arrependimento do art. 49 do
CDC**, que não era citado (7 dias corridos da primeira cobrança, reembolso
integral, e vale para o anual de R$ 1.490); cancelamento a qualquer momento sem
multa, com acesso até o fim do período pago; vídeo na descrição do serviço.

**Privacidade:** saíram Clerk, Pusher e Neon, que não tocam mais nenhum dado;
entraram Deepgram (áudio), Supabase (banco), Vercel Blob (vídeo privado), a
categoria de dados de vídeo/transcrição e os dados da demonstração pública,
que grava o texto do visitante em `demo_runs` e ninguém declarava.

Pendente da esfera jurídica: revisão por advogado. O texto segue CDC e LGPD no
desenho, mas foi escrito por IA e o Bruno sabe disso.

**Deploys da noite verificados em produção:** o anual aparece na landing, o
cupom e o Blotato sumiram, e o site responde com os termos novos.

**Aberto que o Bruno pediu nesta sequência:** testar a jornada completa de
ponta a ponta (ele ainda não testou nada em produção), e o caminho do
Instagram via API da Meta, que virou prioridade de produto.

### A oitava falha do dia: os termos atrás do login

Ao verificar em produção se os termos novos subiram, o `curl` seguiu o
redirect e parou em `/sign-in?redirect=%2Fterms`. O proxy liberava `/termos` e
`/privacidade`, rotas que nunca existiram; as páginas reais são `/terms` e
`/privacy`. Desde que o auth próprio entrou, todo visitante deslogado que
clicava em "Termos" no rodapé caía no login. Documento legal que exige login
não cumpre papel de documento legal, e ninguém tinha notado porque quem testava
estava sempre logado.

Mesma família das sete falhas do dia: só apareceu medindo o que voltou, e o
grep sem `-L` teria dito que estava tudo bem. Corrigido em `93002ea`.

*Atualizado em 18/08/2026 por Claude Code.*

## Sessão 19-20/08/2026 (parte 21): Instagram, do zero da conta ao código no ar

### O contexto que virou dependência: a conta da Meta

O Instagram virou prioridade de produto por decisão do Bruno. O caminho
técnico escolhido é a **API do Instagram com login do Instagram** (a variante
de 2024 que dispensa página do Facebook): o cliente conecta a conta
profissional direto, no gesto dos outros conectores.

Só que criar o app exige conta do Facebook, e a do Bruno estava num loop de
login sem saída: sem os dispositivos antigos, sem o telefone antigo, e o
e-mail era da globo.com, serviço extinto. **Conta dada como perdida.** A
recuperação formal da Meta foi tentada e não tem porta sem esses três.

**Plano executado:** conta nova de substituição criada em 20/08 (nome real,
e-mail atual, celular atual, 2FA com códigos de recuperação guardados, a lição
do Stripe aplicada no dia zero), perfil completo, e os dois Instagrams
vinculados na Central de Contas, o que dá lastro e cria porta de recuperação.
**A conta fica em lastro por 7 a 14 dias antes de registrar developer**: conta
recém-nascida criando app Business com permissão de publicação é o gatilho
clássico de derrubada, e o app derrubado leva junto a conexão de todo cliente.
Válvula de escape se o prazo apertar: a Elisa cria o app num portfólio de
negócios da Demandou e o Bruno entra como admin depois.

As páginas do Facebook da Demandou e da Bem Natura também não existem; criar
semana que vem, pela conta já rodada (anúncio na Meta exige página).

### O código, pronto e no ar antes do app existir

Commit `94ae9a3`, produção. Sem `INSTAGRAM_APP_ID`/`SECRET` o conectar devolve
503 por desenho, então nada muda para quem usa até as chaves entrarem.

- **`lib/oauth/instagram.ts`**: OAuth completo. O token curto (1h) é trocado
  pelo longo (~60 dias) já no callback; a renovação acontece em
  `resolveSocialAccountAccessToken` quando faltam menos de 7 dias, e token
  vencido vira erro claro pedindo reconexão.
- **Publicação em dois passos** (container, depois publish), imagem única e
  carrossel de 2 a 10. Post sem imagem é recusado com mensagem em português:
  Instagram não tem post de texto puro.
- **`/api/media/ig/[token]`**: a Meta busca mídia por URL https pública, e as
  nossas imagens vivem como data URL no banco ou em Blob privado. A rota serve
  a imagem com token HMAC (postId e índice, assinados com o segredo do
  servidor), sem migration. Post publicado tem a imageUrl limpa, e a URL morre
  junto.
- **Deauthorize e data deletion**: os callbacks que o cadastro do app exige,
  com verificação de assinatura do `signed_request` (sem ela, qualquer POST
  desativaria conexão de cliente).
- UI: seção do Instagram no painel de conexões e no kanban.

**Testado contra dado real**, como manda a regra da casa: user, projeto e post
de teste criados no banco, rota servindo os bytes exatos do PNG, token
adulterado, post inexistente e índice inválido dando 404, e a limpeza no fim.

### Armadilha nova para a lista: `.next` misturado

O teste começou dando 404 em HTML para **todas** as rotas dinâmicas do dev
server, incluindo rotas antigas que funcionam em produção. Causa: `next build
--webpack` e `next dev` (Turbopack) compartilham o diretório `.next`, e o
manifesto de um confunde o outro. **`rm -rf .next` antes de `next dev` depois
de qualquer build local.** Rotas estáticas continuam funcionando, o que
disfarça o problema.

### Decisão pendente do Bruno nesta parte

Avaliação do Blotato como intermediário temporário para acelerar (a conta está
na conversa e no Notion) e a inclusão do Facebook como rede de publicação.
Decidido na sequência: Blotato não entra (zero clientes + review em paralelo =
o tempo comprado não existe; fica como contingência com gatilho no card), e o
Facebook entra no backlog para depois do App Review, no mesmo app da Meta.

## Sessão 20/08/2026 (parte 22): app da Meta no ar e o teste de jornada começou

### O app da Meta existe e o painel está completo para modo dev

Guiado clique a clique com o Bruno: app **Demandou** (id 1808987136949506),
caso de uso "Gerenciar mensagens e conteúdo no Instagram", configuração **API
com login do Instagram** (Instagram App ID `1073129042249854`), permissões
`instagram_business_basic` e `instagram_business_content_publish` prontas para
teste, `@prdonaire` como Instagram Tester, as três URLs de callback
cadastradas, e as chaves na Vercel e no `.env.local`. Portfólio empresarial
"Demandou" criado, **domínio demandou.com verificado por TXT no DNS**.

**A verificação da empresa emperrou de propósito:** o e-mail com código foi
aceito e recusado em seguida (padrão de sistema de risco em conta de dia 1), e
a alternativa por telefone morreria no número da Contabilizei que consta no
CNPJ. Regra de abortar aplicada: retomar em 2 ou 3 dias. Só bloqueia o App
Review, não o modo dev.

De caminho: **contato@demandou.com criado** (Titan da HostGator, grátis), com
DKIM no DNS e encaminhamento para o Gmail, tudo testado. Era promessa dos
Termos que não existia. E o telefone do cadastro CNPJ é o da Contabilizei;
card criado para trocar.

### Teste de jornada: primeiros achados corrigidos no ato

Bruno começou a jornada real (cadastro, projeto). O combinado era catalogar e
corrigir em lote; ele pediu correção imediata, e o lote 1 já está em produção:

- **Placeholders ilegíveis sem foco**: regra global de `::placeholder` com
  `var(--text-muted)`.
- **Tela "Novo projeto" duplicava a etapa 1 do setup**: morreu; o clique cria
  o projeto e cai direto no assistente.
- **Assistente de setup em tela cheia** (sem sidebar) para projeto em setup,
  com marca e "Continuar depois"; modo edição continua no layout normal.
- **Resposta do assistente IA vinha em Markdown cru e cortada**: prompt agora
  exige texto puro, o cliente limpa resíduos (modelo desobedece instrução de
  formato, valide em código), caixa com rolagem, maxTokens 1024 para 2048.

Verificado com jornada real em dev server (cadastro novo, clique, tela cheia,
placeholders visíveis); usuário de teste apagado do banco depois.

**Backlog do teste (cards no planner):** login social (Google, depois
LinkedIn), fluxo plano-antes-do-cadastro desaguando no checkout, logo novo
gerado via nano banana (Claude gera as opções). O teste de jornada continua:
Bruno parou na Ideação do projeto "Empreendedorismo Cristão".

### Armadilha nova

`BETTER_AUTH_URL` de produção rejeita origem localhost com "Invalid origin" no
cadastro. Para testar auth em dev: `BETTER_AUTH_URL=http://localhost:PORTA
NEXT_PUBLIC_APP_URL=http://localhost:PORTA npx next dev`.

### Lote 2: login social e plano antes do cadastro (commit c3e797f)

- **Login social**: botões de Google e LinkedIn no auth, gateados por
  `NEXT_PUBLIC_GOOGLE_AUTH=1` / `NEXT_PUBLIC_LINKEDIN_AUTH=1`; o servidor ativa
  cada provedor quando as credenciais existem no ambiente. O Google já estava
  half-pronto no código (descoberta boa); o LinkedIn reusa o app OAuth de
  publicação, bastando ativar o produto "Sign In with LinkedIn (OpenID
  Connect)" e a redirect `/api/auth/callback/linkedin` no painel deles. Falta
  só a parte de console do Bruno nas duas pontas.
- **Fluxo plano antes do cadastro**: página pública `/planos` (toggle mensal e
  anual), CTAs genéricos da landing apontando para ela, cards de preço levando
  a `/sign-up?plan=` e o cadastro desaguando direto no checkout do plano via
  `/billing/start`, sem soltar a pessoa no dashboard no meio da decisão.
  **Validado em produção com cadastro real**: o checkout do anual abriu com "7
  dias grátis" e "R$ 1.490,00 por ano". Usuários de teste apagados do banco.
- **Achado do teste**: a descrição dos produtos no Stripe ainda diz "1.100
  créditos/mês" (pré Opção B). Corrigir via `products.update` quando a sk_live
  estiver na máquina de novo; card no planner.
- **Logos novos**: 4 conceitos gerados pelo Nano Banana Pro (Gemini
  `gemini-3-pro-image-preview`) em `C:\Users\devan\Downloads\demandou-logos\`,
  aguardando escolha do Bruno para gerar as variações (claro, favicon, landing).

*Atualizado em 20/08/2026 por Claude Code.*

## Sessão 21/08/2026 (parte 23): login social no ar e a marca nova

### Login com Google e LinkedIn, funcionando

**Google:** app OAuth criado no projeto `demandoupostou`, público Externo,
tela de consentimento com o domínio verificado no Search Console (mais um TXT
no DNS da HostGator), credenciais na Vercel e app publicado.

**LinkedIn:** o produto "Sign In with LinkedIn using OpenID Connect" já estava
adicionado no app `demandou` (`776y3qlu5ltco1`), então bastou somar a redirect
`https://demandou.com/api/auth/callback/linkedin` às que já existiam. Nenhuma
credencial nova: o mesmo app que publica agora também autentica.

Os dois fluxos foram verificados em produção até a tela de login de cada
provedor, conferindo client id, escopos e redirect na URL.

**Armadilha nova, e ela tem classe:** `NEXT_PUBLIC_*` é resolvida em tempo de
build. Gravar a credencial na Vercel não fazia o botão aparecer, e não havia
erro nenhum, só ausência. Eliminada a classe do problema: agora
`/api/auth/providers` responde quais provedores têm credencial (só booleanos)
e o formulário pergunta em runtime. Credencial nova passa a valer sem rebuild.

**Pegadinha do Google:** logo próprio na tela de consentimento dispara
verificação de marca, mesmo com escopos básicos. Como o logo é opcional lá,
removê-lo destrava a publicação na hora.

### A marca nova, e por que a anterior morreu

O conceito escolhido antes (seta-sorriso sob o "d", inspirada na Amazon a
pedido do Bruno) foi **reprovado pela verificação de marca do Google**: "seu
logotipo não identifica sua marca de forma exclusiva". Não era burocracia: a
seta-sorriso laranja da Amazon é marca registrada, e o risco de trademark é
real. Sinal externo e objetivo, aceito na hora.

A marca nova é um **monograma "dp", de "demandou, postou"**: o d e o p são a
mesma forma girada 180 graus e dividem a mesma bola, então a simetria é exata.

- **Recriada em SVG vetorial**, não recortada da imagem gerada: escala sem
  perda, pesa poucos bytes, herda cor e permite animar as metades.
- **Animação no header, cadastro e /planos**: o "d" entra pela direita e o "p"
  pela esquerda até se encaixarem. CSS puro, sem JavaScript, e parada para quem
  pede menos movimento. Verificada medindo o DOM no meio da animação, e não a
  olho: as duas metades ficam em posições distintas e convergem.
- **Favicon passa a ser o SVG** (nítido em qualquer densidade), com PNG de
  reserva. O SVG do arquivo usa cor fixa de propósito: como favicon não existe
  de quem herdar `currentColor`.
- PNGs gerados por `sharp` a partir do vetor, fundo transparente.

*Atualizado em 21/08/2026 por Claude Code.*

## Sessão 21/08/2026 (parte 24): jornada testada de verdade, e o que ela mudou

O Bruno começou a percorrer a jornada real em produção e cada tropeço virou
correção no ato. O que entrou:

### O login com Google que não logava (duas travas, e a segunda escondida)

Cadastro por senha + clique em "Continuar com Google" no mesmo e-mail dava
`account_not_linked` e jogava a pessoa na home com o erro cru na URL.

1. **Primeira trava**: o better-auth não vincula provedor social a conta
   existente por padrão. Liberado com `trustedProviders: ["google",
   "linkedin"]`, seguro porque os dois confirmam o e-mail.
2. **Segunda trava, a que continuava barrando**: `requireLocalEmailVerified`
   (padrão `true`) exige que a conta local tenha e-mail verificado, e o nosso
   cadastro por senha não verifica e-mail, então todo usuário nasce com
   `emailVerified: false` e a vinculação era impossível para qualquer pessoa.
   Descoberto lendo `link-account.mjs` do better-auth, não adivinhando.
   Desligado; não abre buraco novo porque o risco coberto já existe pela
   ausência de verificação no cadastro. **Card criado: verificação de e-mail
   no cadastro; quando existir, religar a trava.**

O erro social agora volta para a tela de login com mensagem em português.

### Anual nos três planos, e a hierarquia de preço que vende

Preços anuais criados também para Business (R$ 2.490) e Studio (R$ 4.490),
sempre 10 mensalidades. Os cards mostram o **mensal equivalente** grande
(124, 208, 374), a economia em laranja e o total do ano pequeno, porque
número de quatro dígitos derruba conversão. Descrições dos três produtos no
Stripe corrigidas (falavam 1.100 e 2.500 créditos, números da Opção A).
Verificado com sessão de checkout real nos três.

**Decisão de negócio registrada:** o Bruno pediu fidelidade com multa
proporcional no anual; a premissa foi corrigida com número. Anual à vista não
tem o que multar (o caixa já entrou, que é a razão do plano existir), multa
sobre valor pago seria cobrança dupla (art. 51 CDC), e a barreira real já é
máxima: quem pagou 12 meses fica 12 meses. Termos descrevem o compromisso de
12 meses como contrapartida do desconto. Conta Stripe para recuperação de
acesso: `acct_1TJzMgJIhzTmSVmM`, e-mail `bruno.donaire88@gmail.com`.

### O assistente de setup foi redesenhado no meio do teste

Três mudanças de produto pedidas pelo Bruno, todas no ar:

- **Redes Sociais é a etapa 1** do assistente (era a 5ª). Conectar primeiro é
  o que permitirá ler o perfil e pré-preencher o resto.
- **A IA preenche em vez de sugerir**: na Ideação, "Preencher com IA" propõe e
  aplica nome, descrição, nicho e público; na Voz, o guia completo. Ao lado,
  campo "Quer ajustar?" que refaz com a instrução do usuário. JSON extraído e
  validado em código (modelo desobedece formato). Verificado com jornada real.
- **Campo de referências e inspirações** (perfis a modelar) na Ideação,
  persistido em `config.references` (sem migration), alimentando a IA.

**Fase 2 virou card com limites de API mapeados**: análise automática das
redes conectadas ("Analisamos seu perfil, você é especialista em X...") mais
tamanho da campanha no onboarding. Instagram dá bio e mídia; X dá tweets
(leitura paga); **LinkedIn não expõe leitura dos posts do membro**; YouTube é
futuro.

### Estado ao fim da sessão

A jornada do Bruno parou de novo antes de conectar o Instagram: o próximo
teste é entrar com Google (fix no ar), criar projeto e conectar a
`@prdonaire` na etapa 1 do assistente, e publicar o primeiro post real.

*Atualizado em 21/08/2026 por Claude Code.*

## Sessão 21/08/2026 (parte 24): auditoria de funil para a estratégia de venda

Nenhum código mudou nesta parte. Levantamento do que existe entre a visita e o
pagamento, para montar a estratégia de venda. Três lacunas confirmadas no
código, e todas viraram card na Frente Demandou do planner.

### 1. A demo pública não captura contato

`app/api/demo/route.ts` grava `ipHash`, `input` e `output` na tabela de demos.
Nenhum e-mail, nenhum identificador de pessoa. É o ponto de maior intenção da
jornada (a pessoa acabou de ler um post escrito na voz dela) e ele termina em
anônimo. O Resend já está no custo fixo mensal e não é usado para nada.

### 2. Não existe instrumentação de funil

Nenhum pacote de analytics no projeto (a única ocorrência de `posthog` e
similares está em `package-lock.json`, como dependência transitiva). Sem origem
de visita e sem etapas medidas, o teste de R$ 2.000 em tráfego pago não mede o
CPC real nem a conversão de visita para cadastro, que são exatamente as duas
variáveis que ele existe para medir. Virou pré-requisito duro daquele card.

Eventos mínimos: origem da visita, demo iniciada, demo concluída, e-mail
deixado, cadastro, checkout aberto, pagamento.

### 3. Checkout aceita somente cartão

`lib/stripe/index.ts:142` fixa `payment_method_types: ["card"]`. O comentário
acima explica a exclusão do boleto (não ativado na conta, e pagamento avulso não
deixa meio de cobrança guardado para renovação), o que é correto, mas o Pix
herdou a exclusão sem decisão própria. No anual de R$ 1.490 o Pix economiza
cerca de R$ 45 por venda e, mais importante que a taxa, contorna limite de
fatura de cartão, que é objeção de caixa e não de valor. A ressalva do
comentário vale igual para o Pix: renovação precisa de tratamento próprio.

### Pendência de produto que a venda impõe

A descrição dos produtos no Stripe ainda diz "1.100 créditos/mês", de antes da
Opção B. O cliente lê isso na tela do checkout, no último passo antes de pagar.
Corrigir via `products.update` com a `sk_live` na máquina.

*Atualizado em 21/08/2026 por Claude Code.*

## Sessão 21/08/2026 (parte 25): o Google marcou o site como golpe

O Bruno tentou entrar pelo celular e levou tela vermelha do Chrome dizendo que
o site não é confiável, com menção a phishing. Isso passou na frente de tudo:
enquanto durar, todo tráfego pago, todo link no Instagram e toda abordagem no
LinkedIn caem nessa tela.

### Confirmado com dado, não com suposição

Consulta à base do Safe Browsing, calibrada com controles (wikipedia.org como
limpo, o site oficial de teste do Google como sujo, para descobrir o que cada
código significa):

- **demandou.com está marcado**, categoria de engenharia social
- **www.demandou.com não está.** A marcação é no domínio raiz
- Marcado em **20/08/2026 às 23:10** de Brasília, uma hora depois do deploy
  `c3e797f`, que publicou a página de planos e o cadastro que vai ao checkout

O Search Console confirmou: "Páginas enganosas", **sem URL de amostra**. Sem
amostra significa classificação do site, não arquivo encontrado.

### O que foi eliminado, cada um com evidência

- **Domínio novo ou herdado:** não. RDAP mostra registro em 13/01/2025, sem
  dono anterior.
- **Conteúdo de terceiro hospedado por nós:** não existe. O banco de produção
  tem 2 usuários, 2 projetos e **zero posts**. A única página que serviria
  texto de terceiro é `/a/[token]`, e ela está vazia.
- **Landing enganosa:** sem depoimento falso, sem escassez falsa, sem
  contador, sem download, sem um único script externo.
- **Redirecionamento aberto alcançável por robô:** não. As três rotas
  `connect` respondem 401 em produção sem sessão, testado contra o site no ar.
- **`callbackURL` do better-auth:** protegido, `trustedOrigins` restrito.
- **Logo reprovado pelo Google:** eliminado pela linha do tempo. A credencial
  OAuth do Google só passou a existir cerca de três horas depois da marcação.

### A causa que sobrou, e ela é constrangedora

O site pedia senha e cartão **sem dizer quem era o dono**. Razão social, CNPJ,
endereço e e-mail existiam apenas dentro de `/terms`. Landing, entrada,
cadastro e planos eram anônimos, com zero link externo. Para um classificador
esse é o retrato de phishing, e a página de entrada ainda exibe a marca do
Google e a do LinkedIn logo acima de um campo de senha.

**Descoberta que vale mais que o Google:** o Decreto 7.962/2013, art. 2º,
obriga todo site que vende no Brasil a exibir nome empresarial, CNPJ e
endereço físico e eletrônico em local de destaque. Estávamos vendendo sem
isso. O conserto era obrigatório de qualquer jeito.

### O que entrou (commit `0f94f8c`)

1. **`components/identificacao-legal.tsx`**, fonte única com razão social,
   CNPJ, endereço e contato, no rodapé da landing e no pé de `/sign-in`,
   `/sign-up` e `/planos`.
2. **Cabeçalhos de segurança.** O site respondia só o HSTS que a Vercel põe
   sozinha. Entraram `X-Frame-Options: DENY` e `CSP frame-ancestors 'none'`,
   que impedem embutir a nossa tela de login dentro de uma página de golpe,
   mais nosniff, Referrer-Policy e Permissions-Policy. Conferido antes de
   travar: o projeto não usa `getUserMedia` nem `MediaRecorder` (vídeo é
   upload) e não tem um único iframe, então nada quebra.
3. **Redirecionamento aberto fechado.** `returnTo` caía direto em
   `${appUrl}${returnTo}`, então `returnTo=@site-de-golpe.com` virava
   `https://demandou.com@site-de-golpe.com`: o link mostra o nosso domínio e
   leva para outro. `lib/oauth/return-to.ts` com 16 casos de teste, todos
   passando, ligado nas três rotas connect e nos três callbacks.
4. **Travessão nos títulos das páginas**, que aparecem na aba e no resultado
   de busca.

Verificado com build de produção rodando local: os cinco cabeçalhos respondem
e o CNPJ aparece nas quatro páginas públicas.

### Decisão registrada: a passagem em massa de travessão foi desfeita

O primeiro impulso trocou 216 travessões em 28 arquivos. Desfeito de
propósito: boa parte caía dentro dos prompts do pipeline, e o PROJETO.md já
registra que mudar um byte nas regras globais invalida o cache de prompt
inteiro. A regra do travessão vale para texto que sai para gente, não para
comentário de código nem instrução interna de modelo.

### Antes disso, na mesma sessão: o cron do anual (commit `5bb798a`)

O mapa de price anual para plano era escrito à mão e tinha uma linha só, a do
Pro, com um comentário pedindo uma linha nova quando Business e Studio
ganhassem anual. Eles ganharam na parte 24 e a linha não entrou. Assinante
Business anual (R$ 2.490 à vista) receberia 3.500 créditos no dia 1 e nada
nos 11 meses seguintes, com o cron respondendo 200 e lista de repostos vazia.
Falha silenciosa outra vez.

Conserto elimina a classe: o mapa passa a ser derivado de `PLANS`. Verificado
contra a conta live: os três price ids existem, são anuais, batem com o plano
certo e têm **zero assinatura ativa**, então ninguém foi lesado.

De caminho, a contradição da parte 24 foi resolvida contra dado real: as
descrições dos produtos no Stripe **já estavam corretas** (1.800, 3.500,
7.000). Quem estava errada era a nota da auditoria de funil, escrita de
memória. Sobrou lixo: os preços da Opção A (STARTER R$ 49, Pro R$ 99,
Business R$ 199, Studio R$ 399) continuam ativos no Stripe e o Bruno vai
arquivar.

### Armadilha nova para a lista

**Site que vende sem identificar o fornecedor é lido como phishing.** Não é
detalhe jurídico nem rodapé decorativo: é sinal de confiança que o
classificador procura, e a falta dele custou a marcação do domínio inteiro.

### Estado ao fim da sessão

**Deploy feito em 21/08.** `master` levado a `d9d88f0` com autorização do
Bruno, build da Vercel em 53s. Verificado contra o site no ar, não contra o
build local: os cinco cabeçalhos respondem em demandou.com, o CNPJ aparece em
`/`, `/sign-in`, `/sign-up` e `/planos`, e nada regrediu (os botões de Google e
LinkedIn continuam renderizando, o que prova que `/api/auth/providers` sobreviveu
aos cabeçalhos novos, e o console não acusa erro).

Falta o pedido de revisão no Search Console, em Segurança e ações manuais, que
é a mão do Bruno. Revisão de páginas enganosas costuma sair em até 72 horas.

Fica pendente, na fila combinada: responsividade no celular (medição com
prints começou, a landing se comporta bem a 390px, a suspeita é a plataforma
logada), personalização do checkout, e o fluxo da plataforma, que o Bruno vai
percorrer relatando cada trava com URL.

*Atualizado em 21/08/2026 por Claude Code.*

## Sessão 21/08/2026 (parte 26): a jornada de novo, e a causa raiz que ela expôs

O Bruno entrou pelo LinkedIn e relatou em lote. O achado que vale mais é que
dois dos relatos eram o mesmo problema.

### Entrar sem cartão e não conseguir gerar campanha são o mesmo bug

O desvio para o checkout só acontecia quando a URL trazia `?plan=`, ou seja,
quando a pessoa vinha clicando num card de preço. Entrando direto pelo login,
ela caía no dashboard como plano `free`. E `free` não é plano gratuito, é
ausência de plano: `creditsBalance` nasce em 0, então o pipeline barra em
`app/api/pipeline/run/route.ts:431` com "essa campanha custa X créditos e você
tem 0".

A plataforma deixava a pessoa percorrer o onboarding inteiro para bater no
muro no último passo. Não era bug do gerador.

### O que entrou (commit `86be5d7`, em produção)

1. **Portão de plano** em `lib/onboarding/portao.ts`. Sem plano ativo, o app
   manda para `/planos` com aviso explicando por quê. `/billing` e
   `/settings` ficam isentas, senão o próprio checkout ficaria inacessível.
   O `proxy.ts` passou a carimbar `x-pathname` na requisição, porque o App
   Router não entrega a rota para um layout e o proxy roda na borda, sem
   acesso ao banco.
2. **Primeiro projeto automático.** Quem tem plano e nenhum projeto não vê
   mais dashboard vazio: o projeto nasce sozinho e a pessoa cai na etapa 1,
   conectar as redes.
3. **LinkedIn já conectado pelo login.** Só funciona porque o login passou a
   pedir `w_member_social`, escopo separado do padrão. A herança confere o
   escopo antes de criar a conexão: sem essa checagem, criaria uma conexão que
   falharia na hora de postar. Quem entrou antes da mudança continua
   precisando do clique.
4. **Logos oficiais** em `components/social/logos-redes.tsx`, em SVG. Eram
   texto dentro de círculo colorido. Facebook e YouTube entram na lista.
5. **`/api/social/providers`**, mesmo padrão do `/api/auth/providers`: o
   servidor diz quais redes têm credencial e a tela pergunta em runtime.
   Facebook e YouTube aparecem como "em breve" em vez de levar a 404.

### Decisões do Bruno nesta parte

- **LinkedIn pedindo permissão de publicar já no login.** Custo assumido: a
  tela do LinkedIn passa a avisar no cadastro que a Demandou vai criar posts
  em nome da pessoa.
- **Facebook e YouTube de verdade**, não rótulo. O código ainda não existe;
  é o próximo lote e depende de painel de terceiro.
- **Plano de R$ 1 descartado com dado.** O Bruno queria criar um plano de R$ 1
  para testar com cartão real. Conferido no webhook: `status === "trialing"`
  já concede o plano e repõe os 1.800 créditos, então o teste de 7 dias já é
  a jornada real, com cartão real, e custa R$ 0 se cancelar no prazo. Criar o
  plano de R$ 1 só adicionaria um caminho que nenhum cliente percorre, e o
  risco de um estranho assiná-lo.

### Números que mudaram uma premissa

O YouTube parecia inviável pela cota: no modelo antigo, um envio custava 1.600
unidades de um teto diário de 10.000, ou seja seis vídeos por dia para a
plataforma inteira. **Em junho de 2026 o Google separou o envio numa cota
própria de 100 por dia.** Com 30 clientes postando um vídeo por semana dá
cerca de 4 por dia. Deixou de ser teto que atrapalha.

### Achado que não era da lista

Existe **uma conta de terceiro no banco de produção**:
`h.u.l.o.hexiv.e.c.4.5@gmail.com`, nome "ZPDjJvpxpMJeVmOz", criada em 21/08 às
08:06 por senha. Endereço com pontos espalhados e nome aleatório é padrão de
robô. Não causou a marcação do Google (veio nove horas depois dela), mas prova
que o site já está sendo varrido e que dá para criar conta sem confirmar nada.
Reforça o card da verificação de e-mail. Não apagada, aguardando decisão.

O usuário `bruno@areticon.com`, criado pelo Bruno no teste via LinkedIn, foi
apagado a pedido dele, junto com o projeto (a relação continua `RESTRICT`, o
card do cascade segue aberto).

*Atualizado em 21/08/2026 por Claude Code.*

## Sessão 21/08/2026 (parte 27): as cinco redes ligadas, guiado clique a clique

Sequência de painel com o Bruno, no padrão de uma instrução por vez.

### Facebook, pelo app da Meta que já existia

- **Página do Facebook da Demandou criada** (pendência da parte 21), com bio.
- O produto "Login do Facebook para Empresas" já estava no app; foi só
  cadastrar a redirect `https://demandou.com/api/social/facebook/callback`.
- **A tela Básico do app foi completada de caminho**: política de privacidade
  e termos apontando para demandou.com (os campos estavam vazios ou apontando
  para facebook.com, o que reprovaria o App Review), exclusão de dados
  apontando para o callback real, domínio, categoria Empresa e o ícone de
  1024px gerado do SVG oficial da marca (composto, não recriado), salvo em
  Downloads. Isso desbloqueou o checklist "ineligible for submission" que
  barrava a submissão do App Review do Instagram.
- `FACEBOOK_APP_ID` e `FACEBOOK_APP_SECRET` na Vercel (Sensitive) e no
  `.env.local`, redeploy, e `/api/social/providers` respondendo
  `facebook: true` em produção.

### YouTube, no projeto Google que já existia

Decisão: cliente OAuth novo no projeto `demandoupostou` (o do login), em vez
de projeto novo. A tela de consentimento já tem o domínio verificado, o que
poupa uma verificação inteira; só o escopo de upload será novidade.

- YouTube Data API v3 já estava ativa no projeto.
- Cliente OAuth web "Demandou YouTube" criado com a redirect
  `https://demandou.com/api/social/youtube/callback`.
- `YOUTUBE_CLIENT_ID` e `YOUTUBE_CLIENT_SECRET` na Vercel e no `.env.local`,
  redeploy, e `/api/social/providers` respondendo **as cinco redes true**.

### O que esperar no teste (avisos que não são bugs)

- **YouTube**: como o escopo `youtube.upload` é sensível e o app não passou
  pela verificação do Google, a tela de consentimento vai mostrar o aviso
  "o Google não verificou este app". Caminho: Avançado, prosseguir. E vídeo
  enviado por app não verificado fica **privado à força** no YouTube até a
  verificação; o código já manda unlisted para valer depois dela.
- **Facebook**: em modo dev, publicar funciona só para admin do app, que é o
  caso do Bruno. Cliente de verdade depende do App Review.
- **YouTube exige canal**: conta Google sem canal falha com mensagem clara
  pedindo para criar o canal antes.

### Estado

Falta o teste de ponta a ponta do Bruno, que agora cobre as cinco redes na
etapa 1. A revisão do Search Console segue pendente de pedido (a tela estava
aberta na parte 25; confirmar se o botão "Solicitar revisão" foi clicado).

*Atualizado em 21/08/2026 por Claude Code.*

## Sessão 21/08/2026 (parte 28): o login do LinkedIn quebrou, e a lição é sobre documentação

O Bruno abriu a jornada e o login pelo LinkedIn falhou no primeiro clique. A
causa era a mudança da parte 26 (escopo de publicar no login), mas não pelo
motivo que o primeiro diagnóstico apontou, e o caminho até a causa real vale
registro.

1. O parâmetro `scopes` do signIn.social diz na própria descrição que
   SUBSTITUI os escopos padrão. Primeiro conserto confiou nisso e passou a
   lista completa. **A descrição está errada**: lido o fonte do
   @better-auth/core, o provedor soma os padrões, depois soma o `scope` da
   configuração, depois soma o `scopes` do clique, sem deduplicação. O
   "conserto" saiu com escopos duplicados no pedido.
2. Conserto real (commit da parte 28): `w_member_social` declarado uma vez
   só, em `socialProviders.linkedin.scope` no `lib/auth/index.ts`, e o clique
   não passa escopo nenhum. Verificado contra produção: o pedido sai
   `profile email openid w_member_social`, o mesmo formato que o fluxo de
   publicação já usa com sucesso no mesmo app do LinkedIn.
3. De quebra: o formulário agora mostra o código cru do erro social
   ("código: xyz"), porque o relato do Bruno chegou sem código e o
   diagnóstico começou às cegas.

**Armadilha nova para a lista: em biblioteca de terceiro, semântica de merge
se confere no fonte, não na descrição do parâmetro.** A descrição mentiu duas
vezes no mesmo dia (dizia "override", faz append).

O dossiê do App Review da Meta ficou pronto nesta sessão:
`docs/app-review-meta.md`, com roteiro do screencast, textos em inglês das
duas permissões, instruções de teste e o desenho da conta reviewer@ (com
plano direto no banco, porque o portão de plano mandaria um revisor sem
plano para a página de preços). Escopo decidido: só Instagram na primeira
submissão; Facebook na segunda. Bloqueio duro continua sendo a verificação
da empresa, retomada ~23/08.

*Atualizado em 21/08/2026 por Claude Code.*

## Sessão 21/08/2026 (parte 29): o state_mismatch era o www

O login social continuou falhando com `state_mismatch` mesmo em fluxo limpo
no Edge, o que derrubou a explicação de página requentada. A sequência de
diagnóstico que funcionou, na ordem:

1. Simulação por fora (POST de início + callback com cookies de verdade):
   validação de estado passa e morre só no código falso. Servidor são.
2. Banco: nenhum usuário e nenhuma sessão novos. O fluxo dele morria mesmo
   na validação.
3. **Log de produção em tempo real** (o que decidiu): a tentativa das 22:02
   caiu como "State mismatch: State not persisted correctly", ou seja, o
   cookie de estado não voltou no callback.
4. `curl -I https://www.demandou.com/sign-in`: **200**. O www servia o site
   inteiro sem redirecionar.

A mecânica: cookie é host-only. Quem navegava pelo www iniciava o login com o
cookie de estado gravado em www.demandou.com, e o callback do provedor chega
sempre no apex (`BETTER_AUTH_URL`), sem cookie nenhum. E o agravante que
fechou tudo: o Safe Browsing marcou SÓ o apex, então a tela vermelha do
Chrome empurrava o usuário exatamente para o host quebrado.

Conserto: redirect 308 permanente de www para apex no `next.config.ts`,
verificado no ar. De quebra consolida SEO.

De caminho nesta mesma investigação: a mensagem de erro do login agora mostra
o código cru do provedor (foi ela que entregou o `state_mismatch`), e dois
falsos suspeitos foram descartados com dado: o escopo do LinkedIn (o conserto
da parte 28 continua certo, mas não era ele) e o scanner de URL consumindo o
estado (o estado é protegido pelo cookie justamente contra isso).

A revisão do Safe Browsing foi enviada de verdade às ~21h50 (a primeira
tentativa do Bruno nunca tinha entrado: sem recibo, sem e-mail; o recibo real
é um popup cinza "solicitação de revisão enviada", e o painel NÃO muda depois
dele, o que confunde).

*Atualizado em 21/08/2026 por Claude Code.*

## Sessão 21/08/2026 (parte 30): o primeiro pagamento real, e o que ele ensinou

O Bruno completou o caminho até o pagamento: LinkedIn (funcionando após o
fix do www), portão de plano, checkout do Stripe com cartão real, assinatura
`trialing` criada. E três problemas apareceram do lado de cá.

### 1. O dinheiro entrou e o produto não (corrida do webhook)

A assinatura existia no Stripe, o `stripeCustomerId` estava salvo, e o plano
continuava `free` com 0 créditos. Causa provada pelos dados: o
`customer.subscription.created` chegou ANTES do `checkout.session.completed`,
procurou o usuário pelo customerId que ainda não tinha sido salvo, atualizou
zero linhas em silêncio, e o evento que salvava o customerId chegou tarde.

- **Destravamento imediato**: update inócuo de metadados na assinatura
  re-disparou o `subscription.updated`, e o webhook aplicou plano pro + 1.800
  créditos (verificado no banco).
- **Conserto de raiz** (commit da parte 30): a aplicação de plano virou
  função compartilhada chamada pelos eventos de assinatura E pelo
  `checkout.session.completed` (que agora busca a assinatura da sessão).
  Idempotente com a guarda de ciclo, então a ordem dos eventos deixou de
  importar.

### 2. Quem paga caía na tela de billing

`success_url` apontava para `/billing`. Agora aponta para `/dashboard`, que
cria o primeiro projeto sozinho e derruba a pessoa na etapa 1 do assistente.
Cancelamento volta para `/planos` (dashboard sem plano redirecionaria de novo,
virando pingue-pongue).

### 3. A sessão sumiu na volta do Stripe (não reproduzido)

Ele voltou do pagamento deslogado e teve que entrar de novo. O cookie de
sessão está correto (Lax, 30 dias, conferido em produção com usuário sonda,
apagado depois). Causa não encontrada; mitigação no ar: o bounce do layout
preserva o destino via `?redirect=`, então se repetir, a pessoa reloga e cai
onde ia. Se voltar a acontecer, investigar com o log ao vivo.

### Visão de produto que o teste rendeu (cards no planner)

Três pedidos do Bruno para o treinamento dos agentes: upload de arquivos
(PDFs, normas, artigos) para RAG do projeto; comando "torne-se especialista"
(a IA pesquisa o setor e monta dossiê); e conversa investigativa de
onboarding (a IA entrevista sobre nicho, órgãos e referências, tipo OAB para
advogado e CREA para engenheiro). Os três têm encaixe técnico anotado nos
cards; nenhum entra antes do fim da jornada de teste.

*Atualizado em 21/08/2026 por Claude Code.*

## Sessão 21-22/08/2026 (parte 31): a produção caiu, e o Facebook virou uma escola

Madrugada longa. Três coisas grandes, e a primeira derrubou o site inteiro.

### A produção caiu por esgotar o pool de conexões

No meio do teste, todas as páginas passaram a devolver 500. O log deu a
mensagem exata: `(EMAXCONNSESSION) max clients reached in session mode - max
clients are limited to pool_size: 15`.

**Causa: a `DATABASE_URL` apontava para a porta 5432 do pooler do Supabase,
que é o modo SESSÃO.** Nesse modo cada conexão fica presa ao cliente até ele
desconectar, com teto de 15. Em serverless, cada instância nova abre conexão
e o teto estoura. O correto é a **6543, modo transação**, que multiplexa.

O detalhe que dói: o comentário em `lib/db/prisma.ts` já documentava a
intenção certa ("em runtime usamos o pooler na porta 6543"). Quem tinha
divergido do código era a variável de ambiente.

Corrigido na Vercel e no `.env.local` (6543 com
`pgbouncer=true&connection_limit=1`; `DIRECT_URL` segue na 5432, que é o certo
para migrations). Cinto de segurança no código: teto de 3 conexões por
instância e timeouts explícitos no adapter, porque o default do
node-postgres é 10 por pool e em serverless isso multiplica.

**Contribuição própria, registrada por honestidade:** vários scripts de
diagnóstico rodados contra a produção nesta madrugada não fechavam a conexão
no caminho de erro, e dois foram mortos por timeout no meio. Em modo sessão,
cada um ficou pendurado. A configuração errada era a bomba; os scripts
puxaram o pino. Regra nova: diagnóstico contra produção usa a porta de
transação e sempre fecha no `finally`.

### O Facebook, e três armadilhas em sequência

1. **"Invalid Scopes" com os nomes oficiais das permissões.** App Business com
   "Login do Facebook para Empresas" não aceita permissão solta no `scope`:
   exige uma **Configuração** criada no painel, passada por `config_id`.
   Suporte a `config_id` no código, com fallback por scope para app clássico.
   Config criada: `1950233499004876`.
2. **A lista de permissões só oferecia as do Instagram.** A lista é filtrada
   pelo **caso de uso** do app. Foi preciso adicionar "Gerenciar tudo na sua
   Página" para as de página aparecerem.
3. **"Continuar com suas configurações anteriores" reaproveitou a concessão
   da tentativa que falhou.** O OAuth passava, `/me/accounts` voltava vazio e
   a conexão morria calada. Conserto: `auth_type=rerequest`, que força a tela
   de escolha de páginas em toda conexão.

### O bug que mais custou tempo foi o silêncio

A etapa 1 do assistente só lia os parâmetros de retorno de LinkedIn e X.
Todo erro de Facebook voltava para uma tela que não dizia **nada**, e o Bruno
ficou recarregando achando que era problema de interface. Agora as cinco
redes têm aviso de sucesso e de erro, com mensagem específica por motivo e
limpeza dos parâmetros da URL.

**Lição que vale mais que os consertos: fluxo de terceiro sem retorno visível
transforma bug de 5 minutos em investigação de uma hora.** Todo retorno de
integração precisa falar na tela.

### O diagnóstico final do Facebook: propriedade de ativo, não permissão

Com log da resposta crua, a Meta foi clara:

```
permissões efetivas: pages_show_list granted, pages_read_engagement granted,
                     pages_manage_posts granted
/me/accounts:        {"data":[]}
```

Tudo concedido e zero páginas. **Não é permissão, é propriedade.** O app vive
no portfólio empresarial `4461308494133875` e a página pertence ao portfólio
"Demandou 1" (`1282862464907699`). Página dentro de portfólio fica atrás
dessa cerca: o app só enxerga ativos do próprio portfólio, enquanto página
que vive só no perfil pessoal aparece livremente no `/me/accounts`.

Existem **três portfólios** na conta ("Demandou 1" com a página, um
"Demandou" vazio, e o do app), o que precisa ser consolidado. Caminho em
curso: remover a página do portfólio (reversível, não apaga a página) e
reconectar. Plano B: mover a página para o portfólio do app.

*Atualizado em 22/08/2026 por Claude Code.*

## Sessão 22/08/2026 (parte 32): as cinco redes conectadas e o domínio limpo

Manhã de fechamento das duas frentes que estavam abertas desde a madrugada.

### O Safe Browsing aprovou, e o domínio saiu da lista

Verificado com a mesma consulta calibrada que diagnosticou o problema: o
status do `demandou.com` foi de **3** (marcado, engenharia social) para **1**
(sem dado adverso), sinalizadores todos falsos, apex e www. Cerca de **12
horas** entre o pedido (21/08 às 21h50) e a aprovação.

Detalhe operacional que vale para a próxima: o recibo do pedido é apenas um
popup cinza, o painel continua exibindo o problema durante a análise, e o
primeiro pedido do Bruno nunca chegou a entrar (sem recibo, sem e-mail).
Conferir o recibo antes de fechar a tela.

### O Facebook, enfim, e a causa real

A cadeia inteira, em ordem, cada elo provado por log:

1. Permissão solta no `scope` não funciona em app Business: exige
   Configuração criada no painel, passada por `config_id`.
2. A lista de permissões é filtrada pelo **caso de uso** do app (faltava
   "Gerenciar tudo na sua Página").
3. `auth_type=rerequest` é obrigatório, senão a Meta reaproveita concessão
   anterior (inclusive de tentativa que falhou).
4. Página e app precisam estar no **mesmo portfólio**; "Conectar ativos" não
   oferece páginas entre portfólios diferentes.
5. **`/me/accounts` não devolve página nenhuma nessa variante.** As páginas
   saem por `/me/businesses` mais `owned_pages`/`client_pages`, e o token de
   publicação exige uma terceira chamada, na leitura direta da página.
6. **E `/me/businesses` exige `business_management`.** Sem ela o token não
   enxerga portfólio nenhum: era o elo que faltava, e o log entregou com
   `portfólios visíveis ao token: []`.

Resultado no banco: página **Demandou** (`1282854214908524`), tipo
organização, com token de publicação.

### Estado das conexões (verificado no banco)

| Rede | Conta | Token |
|---|---|---|
| LinkedIn | Bruno Donaire | expira 21/10 |
| Instagram | prdonaire | expira 20/10 |
| X | prbrunodonaire | com refresh |
| Facebook | Demandou (página) | sem prazo |
| YouTube | Bruno Donaire | com refresh |

O YouTube conectou depois do aviso "O Google não verificou este app", que é
esperado enquanto o escopo sensível não passar pela verificação. Card criado,
com prioridade baixa justificada: os 10 primeiros clientes vivem em LinkedIn
e Instagram, e a fila que destrava cliente pagante é o App Review da Meta.

### O que falta na jornada

Tudo antes do produto já foi validado: login social, portão de plano,
checkout com cartão real, entrega de plano e créditos, e as cinco conexões.
**Falta a parte que ainda nunca rodou:** treinar os agentes, gerar a
campanha, aprovar, publicar o primeiro post real, conferir o extrato de
créditos e cancelar pelo portal.

*Atualizado em 22/08/2026 por Claude Code.*

## Sessão 22/08/2026 (parte 33): vídeo vira o produto, marca nova e a landing certa

Sessão de ajuste, sem teste, a pedido do Bruno ("deixa a plataforma pronta,
só então volto ao teste").

### A virada de rumo

**Vídeo deixou de ser um formato entre outros e virou o produto.** O cliente
grava, o squad edita e distribui. Consequências registradas no `PROJETO.md`:
a verificação do app OAuth do Google saiu do backlog e virou bloqueante (sem
ela todo cliente vê "app não verificado" ao conectar o YouTube), a Ideação
ganhou dois caminhos, e a landing precisou contar outra história.

### Correção de sequência do assistente

**Voz & Estilo passou a vir antes da Ideação.** Erro óbvio depois de
apontado: pedir ideia antes de conhecer voz, referências e temas de domínio
produz ideia genérica. Os passos são renderizados por índice, então a troca
foi de rótulo e componente na mesma posição, sem perda de progresso.

### Premissa corrigida: onde mora a escolha vídeo ou tema

O Bruno pediu a escolha "na tela da Ideação". A Ideação do assistente roda
uma vez por projeto, então subir vídeo ali seria um vídeo na vida do projeto.
O que se repete toda semana é a campanha, e é lá que os formatos já vivem.
Apresentado com a razão, ele escolheu a campanha.

Implementado como tela **antes** do passo 0 do modal, não como passo novo:
inserir índice renumeraria todos os `step === N` de um arquivo de 1300 linhas.
Escolher vídeo leva ao fluxo que já existe em página própria; escolher tema
segue o fluxo atual. E o fim do assistente agora abre essa escolha sozinho
(`?novaCampanha=1`), em vez de largar quem ativou num quadro vazio.

### Marca nova

O Bruno desenhou uma versão com disco escuro e contorno branco. Aplicada como
**vetor**, não como recorte do PNG: escala, pesa pouco e mantém a animação das
duas metades. Cores **medidas** do arquivo dele, não estimadas: laranja
`#f36a22`, disco `#373643`. O `--accent-orange` da interface passou de
`#f97316` para o laranja da marca, porque quase igual parece defeito.

**Descoberta de caminho:** os favicons ainda eram da marca ANTIGA (um balão de
fala), nunca atualizados na troca de 21/08. Agora alinhados.

### Landing

O trocadilho "demandou. postou." voltou ao hero e virou o título das páginas.
A seção "Como funciona" foi reescrita para o fluxo real em cinco etapas, na
mesma ordem do assistente, com os logos oficiais das cinco redes reusados do
componente do app. Antes ela descrevia "agentes que escrevem posts" e não
mostrava rede nenhuma.

### Estado do Google OAuth (verificado no painel)

App **em produção**, tipo externo, 1 de 100 usuários. O aviso de app não
verificado aparece porque os escopos sensíveis não foram aprovados, e existe
uma "Central de verificação" no painel que é por onde se submete. Não há
submissão em andamento.

*Atualizado em 22/08/2026 por Claude Code.*

## Sessão 22/08/2026 (parte 34): o teste do vídeo, e o produto principal quebrado em três camadas

Sessão longa de gravação do screencast das duas submissões (Meta e Google),
que virou o teste real do produto de vídeo. Ele nunca tinha rodado de ponta a
ponta em produção, e estava quebrado em três lugares diferentes.

### O que foi consertado, em ordem de descoberta

**1. Token do Vercel Blob inválido.** O upload morria com "Access denied,
please provide a valid token for this resource". Reproduzido pela linha de
comando com o mesmo texto, o que provou ser a credencial e não o código. O
store seguia ativo com os 4 arquivos antigos, e só o upload novo falhava:
**o produto de vídeo estava quebrado em produção sem ninguém saber**, porque
ninguém tinha subido vídeo desde a rotação do token. Token novo em produção e
local, testado com upload real antes de qualquer outra coisa.

**2. Limites de vídeo barrando o próprio dono.** O Bruno não conseguiu subir a
gravação de 27 minutos que abre o canal dele (3,1 GB a 16 Mbps). Decisão dele,
acatada: **não limitar o cliente, cobrar por ele**. Taxa de gravação alta
deixou de recusar e virou preço, duração subiu para 120 minutos, e o crédito
extra passou a ser cobrado por GB, que é onde o custo escala (transferência é
58% do custo do produto). Conferido antes de mexer: **a Deepgram aceita no
máximo 2 GB e recomenda extrair o áudio de vídeos grandes**, então o teto que
sobrou é dela, não nosso, e a mensagem diz isso. O arquivo do Bruno foi
recodificado para 811 MB a 4 Mbps, com a mesma imagem.

**3. Teto de tokens gerando resposta vazia.** A seleção de trechos falhou com
"A resposta não trouxe texto. Blocos recebidos: thinking". Confirmado na
referência da API: no Sonnet 5 o pensamento adaptativo vem ligado por padrão e
o `max_tokens` é um teto que **inclui os tokens de pensamento**. Com a
transcrição de 27 minutos, o modelo gastou os 4000 pensando e nunca escreveu.
Contraintuitivo e por isso perigoso: **teto apertado não gera resposta curta,
gera resposta vazia**. Varrida a classe inteira: a redação dos posts estava em
**300 tokens** e teria quebrado no passo seguinte. Regra escrita no código:
nada abaixo de 4000 em chamada que faz trabalho.

**4. Timeout matando a função sem deixar rastro.** Depois do conserto acima, a
seleção passou a rodar mais e bateu no `maxDuration = 120`. O log de produção:
"Vercel Runtime Timeout Error: Task timed out after 120 seconds". Quando a
plataforma mata a função, **o código não consegue gravar erro nenhum**: o
status volta ao anterior e o botão reaparece como se nada tivesse acontecido.
Teto para 300s, que é o máximo do plano. **É remendo**, e o card do conserto de
raiz está aberto.

### O que o teste revelou e ainda não foi consertado (cards abertos)

- **A tela não se atualiza sozinha.** O Bruno só descobriu que a transcrição
  tinha terminado porque apertou F5 por conta própria. Mais grave que o tédio:
  não dá para distinguir travado de rodando.
- **A tela de espera não mostra nada.** Decidido o desenho: tempo correndo,
  estimativa honesta, as três etapas nomeadas, e frases girando dos próprios
  agentes. **Sem figuras públicas reais** (uso de imagem de terceiro) e **sem
  barra de porcentagem** (a transcrição é assíncrona e não reporta progresso,
  então seria mentira animada).
- **Upload gera registro duplicado**, um pelo aviso do storage e outro pela
  rota de contingência. O fantasma não cobra crédito, mas polui.
- **Tempo de upload alto.** A medir antes de otimizar: velocidade efetiva
  contra a banda contratada. Ideia do Bruno de conectar Drive e Google Fotos
  tem mérito real, porque elimina a perna de upload do cliente.

### Outros consertos da sessão

- Facebook e YouTube faltavam na tela de Configurações, então apareciam
  conectados no assistente e sumiam nas configurações.
- `projectId` opcional no modal de campanha montava `/projects/undefined/video`
  e caía em 404. Virou obrigatório, para o compilador pegar.
- Marca nova do Bruno vetorizada (disco escuro, contorno branco), laranja da
  interface alinhado ao da marca, favicons corrigidos (ainda eram da marca
  anterior). Trocadilho "demandou. postou." de volta ao hero e nos títulos.
- Landing com o fluxo real em cinco etapas e os logos oficiais das redes.
- Voz & Estilo antes da Ideação, por correção do Bruno.
- Escolha de origem da campanha (vídeo ou tema), com a Ativação levando direto
  para ela.

### Configuração do OBS, definida nesta sessão

4000 Kbps, MP4 híbrido, 30 quadros, áudio mudo nas três fontes. Salvo também na
memória do Claude. A 16 Mbps o mesmo vídeo dava 3,1 GB; a 4 Mbps dá 811 MB com
imagem igual.

*Atualizado em 22/08/2026 por Claude Code.*

## Sessão 22/08/2026 (parte 35): a falha silenciosa era a máquina de estados

Sessão de conserto antes da gravação dos screencasts. Três bugs, e o primeiro
era estrutural, não um descuido.

### O dado que abriu a sessão

Uma única linha de `video_selecao` em toda a história do projeto: 12.364 tokens
de entrada, **exatamente 4.000** de saída. Saída redonda no teto é
`stop_reason: max_tokens`, ou seja a tentativa que voltou vazia. Depois do teto
subir para 16.000, **nenhuma linha nova foi gravada**. Como `recordUsage` roda
depois do `messages.create` retornar, a ausência de linha prova que a chamada
nunca voltou. Não é hipótese: é ausência de registro onde o registro seria
obrigatório.

### Premissa questionada, e metade dela caiu

A hipótese que abriu o trabalho: o campo `transcricao`, em que o modelo copiava
verbatim a fala de cada trecho, seria o custo dominante do tempo. Cortá-lo e
recortar a fala em código (a transcrição com marcação por palavra já está no
banco) deveria derrubar a saída para uns 800 tokens.

**Medido contra a gravação real de 27 minutos: 121,1s de parede, `end_turn`, 5
trechos, JSON válido. Entrada 12.358, saída 10.916.** A resposta em si caiu para
menos de 1.000 tokens, como previsto, mas a saída total continuou alta porque
**quase tudo é pensamento**. Quem manda no tempo é o pensamento, que escala com
a entrada e não se corta tirando campo.

Conclusão honesta: o conserto vale (179s de folga onde antes não voltava), mas
pelo motivo errado. Gravação de 60 minutos dobra a entrada e volta para perto do
teto. **A fila continua sendo o conserto de raiz**, e a premissa original do
Bruno estava certa.

De caminho, um defeito que só apareceu porque o recorte virou código: os tempos
do modelo são aproximados e abriam o trecho no meio da frase ("faço? Eu coloco
o Cloud..."). Enquanto ele copiava, fechava a frase sozinho e o defeito ficava
escondido. `encaixarNaFrase` move as duas bordas para a frente, nunca para trás
no início: aparar o fragmento custa palavras, recuar custa importar fala que o
modelo não escolheu (medido: recuar trouxe 30 palavras de outro assunto). Sem
fronteira dentro do limite, desiste e mantém a borda original.

### A causa real do silêncio: `selecting` queria dizer duas coisas

`selecting` significava **ao mesmo tempo** "pronto para selecionar" e
"selecionando agora". Idem `writing`. Quando a Vercel derruba a função no teto,
o `catch` nunca roda, então o status fica exatamente igual ao de quem nunca
começou. Não era falta de log: os dois casos eram literalmente o mesmo valor.

Separados agora:

| espera | trabalho |
|---|---|
| uploaded, transcribed, selected, ready, failed | transcribing, selecting, writing |

Todo estado de trabalho grava `startedAt` e tem prazo (`lib/media/video-state.ts`).
Quem lê declara morto o que passou do prazo, porque trabalho derrubado pela
plataforma não consegue se declarar morto. Enquanto não existe fila, **quem abre
a tela é o relógio do sistema**.

As três rotas passaram a tomar o trabalho de forma atômica (`updateMany` com o
status no filtro), então dois cliques ou duas abas não viram dois trabalhos. E o
`write` devolve o estado se a cobrança falhar por saldo, senão quem não tem
crédito ficaria preso em "writing" até o prazo, vendo a plataforma escrever um
post que ninguém está escrevendo.

`maxDuration` foi de 300 para 800, o teto do Pro. **Confirmado com o Bruno que o
plano é Pro**, o que resolve a contradição do HANDOFF (a nota de 18/08 falava em
2 crons do plano gratuito). Pro também libera cron por minuto, que é o que
torna a fila viável.

### A tela agora anda sozinha

Era o mais grave do relato. `/api/videos/status` responde enxuto a cada 4s
enquanto houver trabalho, e só chama `router.refresh()` quando um status
realmente muda, porque é o refresh que traz os posts inteiros.

A tela de espera segue o desenho decidido: tempo correndo, três etapas nomeadas
e frases girando dos próprios agentes. Sem barra de porcentagem e sem figuras
públicas reais, os dois com o porquê no código para não serem desfeitos.

O cronômetro vem do servidor: máquina com hora dessincronizada mostraria tempo
negativo justamente na tela em que o cliente está ansioso.

### Um vídeo, um registro

O mesmo arquivo virava duas linhas. A checagem de idempotência existia, mas as
duas rotas que registram um vídeo leem antes de qualquer uma escrever, então a
checagem não decidia nada. **Medido: as duas linhas do vídeo de 22/08 nasceram
com 33 milissegundos de diferença.** Checagem na aplicação não resolve corrida;
restrição no banco resolve. Unique em `(projectId, blobUrl)`, `upsert` nos dois
lados, e a migration limpa o que já entrou mantendo o registro que andou.
Conferido com consulta seca antes de subir: apaga exatamente 1 linha, o
fantasma, sem transcrição e sem crédito.

### Armadilha do projeto que quase foi repetida

`video-state.ts` nasceu importando o Prisma e sendo usado pela tela do cliente,
o que mandaria o driver do banco para o bundle do navegador. O `PROJETO.md` já
avisava. Separado: o módulo puro em `video-state.ts`, a varredura em
`video-sweep.ts`.

### Achado que não estava na lista

Na transcrição do Bruno, **"Claude" virou "Cloud" cinco vezes**. É a armadilha
de `keyterm` que já está documentada, e vai sair assim nos posts. Card aberto,
não bloqueia a gravação.

*Atualizado em 22/08/2026 por Claude Code.*

## Sessão 22/08/2026 (parte 36): o YouTube era código inalcançável

Continuação direta da parte 35, para destravar a gravação dos screencasts.

### O bloqueio que ninguém tinha visto

O roteiro do screencast do Google pede abrir um post de vídeo, publicar, e
mostrar o vídeo no canal. **Esse caminho não existia.** A rota de aprovação do
fluxo de vídeo grava `mediaType: "text"` fixo, e a varredura do projeto inteiro
mostrou que **nenhum lugar cria post com `mediaType: "video"`**: só existe quem
lê, no ramo do YouTube da publicação.

Quem criava era o Veo, removido em 18/08. O ramo do YouTube virou código
inalcançável naquele dia, e o defeito ficou invisível porque nunca foi
exercitado. A submissão do Google, que o Bruno tinha como "só depende do vídeo",
estava na verdade bloqueada por falta de produto.

**Achado maior de carona: não existe recorte de vídeo no projeto.** Sem ffmpeg,
sem dependência de mídia, nada. Os trechos são início, fim e texto. Ou seja, a
decisão de rumo "o cliente grava e o squad edita" não tem implementação da parte
de editar, e a promessa de shorts e reels é só promessa. Isso virou card
bloqueante próprio, porque é decisão de rumo e não tarefa.

### A saída, escolhida pelo Bruno (opção A)

A gravação vai **inteira** para o canal do cliente, e os trechos escolhidos
viram **capítulos** na descrição. Aproveita o mesmo trabalho de seleção de outra
forma, em vez de prometer o que não existe. Quando o recorte existir, cada
trecho vira um vídeo próprio e isto passa a ser um caso particular.

É um post por gravação, não um por trecho: um por trecho mandaria o mesmo
arquivo de centenas de megabytes várias vezes. Nasce como rascunho, porque quem
publica é o cliente pelo quadro de posts, e a aprovação explícita por post é
exatamente o que o Google exige demonstrar.

Conferido com os cinco trechos reais da gravação de 27 minutos: **6 capítulos, o
primeiro em `0:00`, o menor com 69s**. As três regras do YouTube (primeiro
marcador em zero, mínimo de três, mínimo de 10s cada) fecham com folga.

### Dois defeitos que só apareceriam na hora de gravar

1. **`publishYouTubeVideo` carregava o vídeo inteiro num `ArrayBuffer`.** A
   gravação do Bruno tem 850 MB, e isso derruba a função por memória antes de o
   primeiro byte subir. Agora o corpo atravessa em fluxo, com `Content-Length`
   declarado e `duplex: "half"`, que o fetch do Node exige quando o corpo é
   fluxo e cuja ausência falha com erro que não menciona vídeo nenhum.
2. **A rota de publicação não declarava `maxDuration`** e não estava coberta
   pelo `functions` do `vercel.json` (que só pega `api/videos/**`), então caía
   no padrão de segundos e teria morrido no primeiro envio.

### Descoberta operacional: os previews da Vercel sempre falham

Todo deploy de Preview falha em 7 segundos, e todo deploy de Produção passa.
Causa no log: `Error: Connection url is empty`. O ambiente de Preview não tem
`DIRECT_URL`, e o `prisma migrate deploy` do build morre antes de compilar.

Isso é anterior a esta sessão e vale saber: **o check vermelho de todo PR é
falso alarme**, e nenhum PR tem verificação real hoje. Card aberto.

*Atualizado em 22/08/2026 por Claude Code.*

## Sessão 22-23/08/2026 (parte 37): o vídeo vira produto de verdade

Sessão longa, com uma virada de rumo do Bruno no meio e um achado que expôs a
distância entre a decisão "vídeo é o produto" e o que existia.

### O que o teste da tela expôs

O Bruno rodou o fluxo e criticou, com razão, em três frentes: o vídeo deveria
desaguar no Gestor de Conteúdo (2.757 linhas de kanban, agentes e cronograma) em
vez de numa lista primitiva; "YouTube" sem escolher entre vídeo longo e Shorts
não faz sentido; e o trabalho dele deveria ser aprovar, não montar.

**E o achado que muda tudo: não existia recorte de vídeo no projeto.** Sem
ffmpeg, sem dependência de mídia. Os "trechos" eram só marcação de tempo mais
texto. A promessa de shorts e reels não tinha implementação nenhuma.

### Quatro bugs consertados, com uma raiz só

O comentário no código afirmava que blob privado era alcançável por `fetch` do
servidor. **É falso**, e gerou três sintomas que pareciam problemas diferentes:
publicar no YouTube dava `403`, o botão Baixar abria tela branca de Forbidden, e
o vídeo aparecia como ícone de imagem quebrada escrito "Post image". Conserto:
`get()` do SDK do Blob com `access: "private"` e o token, que é o padrão que a
transcrição já usava e a publicação não seguia. Mais uma rota autenticada
`/api/posts/[id]/media` servindo em fluxo, com player de verdade.

O quarto foi meu: o retorno do "Preparar para o YouTube" ia para um aviso no
TOPO da página, com o botão lá embaixo. O Bruno clicou, a mensagem apareceu fora
do campo de visão, e a conclusão foi "nada aconteceu". **A armadilha antiga
ganhou segunda metade: retorno precisa falar AO LADO do que foi clicado.**

### Decisão do Bruno: worker próprio no Railway

Das três opções (worker próprio, API de mídia, corte no navegador), ele escolheu
a primeira, porque já usa Railway na Areticon. Projeto `demandou` criado
(`cfe1921f`), serviço `video-worker` no ar em
`https://video-worker-production-2eb6.up.railway.app`.

Contrato deliberadamente burro: `POST /cortar` com HMAC sobre o corpo cru,
responde **202 na hora** e avisa por callback. `cutting` é o primeiro estado de
trabalho que roda de verdade fora da requisição, e nasce certo.

### Medido contra a gravação real de 27 minutos, 811 MB

| Operação | Tempo |
|---|---|
| corte vertical de 35s | 13,2s |
| corte horizontal de 35s | 5,3s |
| recodificar o completo | 4,3x tempo real |

E um ganho não previsto: **811 MB caem para cerca de 140 MB** no completo. Isso
ataca a transferência, que é 58% do custo do produto.

### A ideia do Bruno que resolveu o enquadramento

O primeiro corte vertical saiu tecnicamente perfeito e **inútil**: a gravação é
screencast de slides, e o resultado era um slide minúsculo boiando no meio.

Ideia dele: em vez de perguntar ao cliente que tipo de gravação é, o squad tira
alguns quadros, olha e decide. Os quadros são descartados depois.

Implementado, com uma extensão: o agente devolve **onde cada coisa está** (caixa
do slide, caixa da webcam), não só a classificação. Com as caixas, o corte vira
slide grande em cima e rosto embaixo, que é o formato que Shorts de screencast
usam. Testado com as caixas reais: de slide ilegível para slide legível no
celular com o rosto grande embaixo.

Custo calculado antes de construir: **R$ 0,07 por vídeo**, contra R$ 1,51 de
custo que o trabalho já tem. 4%.

A decisão mora no app e não no worker, por dois motivos: a conta de custo de IA
vive num lugar só (worker chamando o modelo por fora seria gasto invisível, que
é exatamente o que o timeout de 90s criou hoje), e prompt de agente é produto.

### O timeout de 90s, e um erro de método meu

`lib/claude/index.ts` construía o cliente com `timeout: 90_000`. A seleção leva
121s. O SDK abortava aos 90s, **retentava duas vezes** e devolvia "Request timed
out." O número que fecha o caso: com streaming ligado para medir, **o primeiro
texto sai aos 98,2s**. O modelo pensa 98 segundos antes de escrever a primeira
letra, e o teto abortava 8 segundos antes.

Meu teste anterior passou porque criou um cliente novo, sem esse teto. **Testei
a API, não o caminho do código do app.** Regra reforçada.

Consertado com streaming sempre, teto por chamada proporcional ao trabalho, e
`maxRetries` de 2 para 1. Medido com a configuração real: 105s, com 195s de
folga.

**Custo invisível que isso gerava:** cada tentativa abortada é cobrada pela
Anthropic mas não vira linha em `ai_usage`, porque a gravação só acontece depois
da resposta voltar. A tabela de custo subestima o gasto real quando há timeout.

### Descoberta operacional

Todo deploy de Preview da Vercel falha em 7 segundos e todo deploy de Produção
passa. Causa: o ambiente de Preview não tem `DIRECT_URL`, e o `prisma migrate
deploy` do build morre antes de compilar. **O check vermelho de todo PR é falso
alarme**, e nenhum PR tem verificação real hoje. Card aberto.

### O que falta para o produto que o Bruno descreveu

A tela que lista os cortes com caixinha de marcar e destino por corte, título e
descrição e capa automáticos, e a fusão disso com o Gestor de Conteúdo. O
worker e o enquadramento, que eram a parte que não existia, estão prontos.

*Atualizado em 23/08/2026 por Claude Code.*

## Sessão 23/08/2026 (parte 38): a edição do vídeo, e a regra de não piorar

Continuação da parte 37, fechando o produto de vídeo.

### A regra que o Bruno fixou, e o defeito que ela achou

Pergunta dele: "já imaginou você pagar uma agência, enviar um vídeo, e ele
devolver um vídeo inferior?" Virou regra da casa: **o que sai da Demandou nunca
pode ser pior que o que entrou.**

E ele estava certo numa parte que era invisível: **o áudio estava sendo
degradado.** A versão anterior pegava AAC 128k e gravava AAC 160k. Recodificar
lossy para lossy é sempre segunda geração de perda, e subir o bitrate não
recupera nada. Gastava mais bytes para entregar um som pior.

As três regras que entraram no código:

1. **Sem edição, sem recodificar.** Só remux com faststart. Perda zero por
   definição, 0,23s em vez de minutos.
2. **CRF 18**, o patamar de visualmente sem perda.
3. **Áudio copiado** sempre que o tempo não é editado.

Resolução e quadros por segundo nunca mudam.

### Medido, não prometido

| | tamanho | fidelidade |
|---|---|---|
| Original (amostra 60s) | 32,3 MB | referência |
| Só remux | 32,3 MB | perda zero |
| Editado CRF 18 | 5,2 MB | **SSIM 0,999085** |

**Por que encolhe tanto:** o OBS grava a 4 Mbps fixos, independente do
conteúdo. Numa gravação de tela, a maior parte do quadro fica parada, e isso
gasta bits em pixel que não mudou. O x264 aloca por necessidade. O que sai é
desperdício, não detalhe.

**E o limite dessa conclusão:** isso NÃO generaliza para vídeo de câmera. Rosto
em movimento e grão de sensor comprimem muito pior. A política protege a
qualidade nos dois casos; o tamanho é que varia.

`medirFidelidade` mede SSIM de uma amostra e devolve junto com a entrega, para
a promessa ser verificável em vez de prometida.

### A remoção de pausas vale menos do que parecia

Medido na gravação real antes de construir:

- pausas > 0,5s: 89 ocorrências, **54s removíveis (3,3%)**
- maior pausa da gravação inteira: **3,1 segundos**

Ou seja, para quem fala corrido, cortar pausa devolve menos de um minuto em 27.
Onde o tempo realmente está é em hesitação: 78 "então", 44 "né", 70 repetições
imediatas da mesma palavra. Cortar isso é mais valioso e mais arriscado, porque
corta no meio da fala, e ficou para uma etapa com aprovação do cliente.

As pausas são achadas pelo buraco entre palavras, e não por detecção de
silêncio no áudio: silêncio também acusa respiração e ruído de sala, enquanto o
buraco entre palavras diz exatamente "aqui ninguém está falando". Fica um
respiro de 0,25s em cada corte, porque colar as frases soa artificial.

### O detalhe que teria quebrado tudo em silêncio

Cada remoção empurra o resto do vídeo. Sem `mapearTempo`, o destaque do trecho
aos 721s apareceria **28 segundos atrasado**. A conta mora num lugar só, no
app, e as legendas saem de lá já convertidas.

### Legendas de destaque, não legenda contínua

Decisão do Bruno: no YouTube não entra legenda em tudo, só tópicos e frases de
destaque. São os mesmos momentos que o squad já escolheu para virar corte, o
que dá coerência de graça: o destaque na tela, o capítulo do YouTube e o corte
publicado falam do mesmo instante.

ASS e não SRT porque SRT não tem estilo. Caixa atrás do texto para ler tanto
sobre slide claro quanto sobre cena escura, no laranja da marca.

### Armadilha nova: caminho de arquivo dentro de filtro do ffmpeg

O filtro usa dois-pontos para separar as próprias opções, então `C:/pasta/a.ass`
faz o ffmpeg entender que `/pasta/a.ass` é o valor da opção seguinte. O erro
fala de `original_size` e não menciona legenda nenhuma. Escapar funciona mas
muda entre plataformas. **Solução: rodar com `cwd` na pasta e passar só o nome.**

### A tela dos cortes

Tudo nasce marcado, com destino escolhido, e a interação é desmarcar. Destino
que não cabe aparece desabilitado com o motivo (Shorts corta em 3 min, Reels em
90s, X em 140s na conta comum).

Dois bugs meus, achados ao ligar as pontas: o passo de escrever escrevia para
todos os cortes inclusive os desmarcados (cobrando crédito por trabalho
recusado), e ao filtrar isso a contagem de falhas passou a incluir os pulados.

### O que falta

Título, descrição e capa automáticos por corte; a publicação dos cortes nos
destinos marcados; a fusão com o Gestor de Conteúdo; e a landing.

*Atualizado em 23/08/2026 por Claude Code.*

## Sessão 23/08/2026 (parte 39): publicação dos cortes, capas e títulos

### O mesmo padrão do YouTube apareceu de novo, e é o que mais dói

Das cinco redes que a tela de destinos oferecia, **só uma publicava vídeo**.
Conferido no código, não suposto:

| Destino | Estado antes |
|---|---|
| YouTube | funcionava |
| Instagram Reels | **não existia**, só imagem e carrossel |
| LinkedIn | só aceita vídeo em `data:`. Com URL do storage, posta a **URL como texto**, e a URL é privada |
| X | só imagem |
| Facebook | só imagem e texto |

Ou seja, uma tela que aceitava o clique e falharia depois. **Regra reforçada:
antes de oferecer um destino, conferir que o caminho existe de ponta a ponta.**

Conserto em duas partes: o Reels passou a existir (container `REELS`, espera de
até 5 minutos porque a Meta transcodifica e os 90s das imagens derrubaria Reels
legítimo, `share_to_feed` ligado porque Reels fora do feed perde metade do
alcance), e os destinos sem publicação de vídeo aparecem **desabilitados,
escritos "em breve"**, com o motivo no título.

### Dois defeitos na rota que serve mídia para a Meta

Ela só tinha visto imagem, que vive como data URL no banco, então nunca havia
encostado nos dois problemas: usava `fetch` no blob privado (403, a mesma
armadilha pela quarta vez) e bufferizava o arquivo inteiro. Agora usa o SDK do
Blob e vai em fluxo, com `Accept-Ranges`, que a Meta usa ao buscar vídeo e sem
o qual ela desiste.

### A aprovação virou por destino

Antes criava post de texto para linkedin, x e instagram, fixo. Agora usa os
destinos marcados e anexa o corte vertical, **mas só onde a publicação de vídeo
existe de verdade**: anexar onde não existe faria a rota de publicação tropeçar
num arquivo que ela não sabe mandar, e o cliente veria erro numa etapa sem
relação com a causa.

### Capa: composição sobre o quadro real (opção A do Bruno)

`comporSobreImagem` é novo no nano banana: o que existia gerava a partir de
texto, e aqui a imagem entra junto, **antes** do texto, para o modelo tratá-lo
como instrução sobre a imagem e não como descrição de cena nova.

**Só a cascata do Nano Banana entra.** Imagen 3 e Pollinations geram a partir de
texto e ignoram a imagem de entrada, então incluí-los como fallback devolveria
arte bonita e sem o cliente dentro, que é exatamente o que a decisão descartou.

Testado contra o quadro real:

| Modelo | Tempo | Resultado |
|---|---|---|
| `gemini-3-pro-image-preview` | 16,3s | **escolhido** |
| `gemini-3.1-flash-image-preview` | 9,6s | texto cobre o título do slide |
| `gemini-2.5-flash-image` | 9,8s | arquivo 2,4x maior |

O Pro fica na frente apesar de 60% mais lento, porque no Flash o texto tapa
conteúdo e sai com menos peso. Verificado olhando as três saídas.

Nos três a pessoa foi preservada sem substituição, que era o risco real da
abordagem. O prompt descreve **acabamento e não conteúdo**, de propósito: pedir
cena faria o modelo trocar a pessoa por alguém inventado.

### Três textos, com trabalhos diferentes

`titulo` (até 100 caracteres, com o corte aplicado em código porque o modelo é
instruído mas não garante, e título estourado é recusado pelo YouTube depois de
o cliente aprovar), `descricao` (2 a 4 frases terminando em pergunta) e
`fraseDaCapa` (no máximo 6 palavras, para ler em miniatura).

Gerados **só para os cortes marcados**: com 7 cortes, gerar para todos custaria
quase o dobro de quem publica 4.

### O que falta

Publicação de vídeo em LinkedIn, X e Facebook; a fusão com o Gestor de
Conteúdo; e a landing.

*Atualizado em 23/08/2026 por Claude Code.*
