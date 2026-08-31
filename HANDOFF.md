# demandou — Estado Completo do Projeto

> **Use este arquivo para dar contexto ao Claude Code ao continuar o trabalho.**
> Copie este conteúdo inteiro ou referencie o arquivo ao iniciar uma nova sessão.
>
> **Cabeçalho conferido contra o código em 23/08/2026.** As seções 1 e 3 estavam
> descrevendo o projeto de abril (Clerk, Neon, Pusher e os planos antigos) e foram
> corrigidas. Os registros de sessão, do 17/08 em diante, sempre estiveram corretos.

---

## 1. O que é o demandou

SaaS de criação e publicação de conteúdo com agentes de IA. Publica em cinco redes:
LinkedIn, Instagram, X, Facebook e YouTube.

**Stack (verificada no `package.json`):** Next.js 16.2 (App Router) · React 19.2 ·
Tailwind · Prisma 7.6 sobre **Supabase Postgres** · **better-auth 1.6** (auth própria,
mais Google e LinkedIn) · Stripe 21 (pagamentos) · Vercel **Pro** (hosting, Blob e cron)

**Fornecedores de IA e mídia:** Anthropic (texto) · Google Gemini (pesquisa e imagem) ·
Deepgram (transcrição) · Resend (e-mail)

**Custo fixo mensal:** R$ 116 (Vercel Pro R$ 110 + domínio R$ 6). Supabase e Resend
ainda no plano gratuito. Break-even de infraestrutura: 2 clientes Pro.

**Saíram do projeto:** Clerk (virou better-auth), Neon (virou Supabase), Blotato e
Veo (removido em 18/08, cascata de fallback dava 80% de prejuízo por operação).

> ⚠️ **Dívida técnica conhecida:** `lib/pusher/index.ts` e as dependências `pusher` e
> `pusher-js` continuam no repositório, mas **nenhum arquivo importa esse módulo**.
> É resto da migração para o Realtime do Supabase. Remover quando conveniente.

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
| **Diana** | Geração de imagem/infográfico | Gemini (família Nano Banana), com cascata `gemini-3-pro-image-preview` → `gemini-3.1-flash-image-preview` → `gemini-2.5-flash-image`. Chave: `GEMINI_API_KEY` |
| **Vera** | Revisão de qualidade (APROVADO/REPROVADO_TEXTO) | Claude — auto-corrige REPROVADO_TEXTO sem intervenção humana |
| **Paulo** | Agendamento dos posts nos horários configurados | Interno (getScheduledAt) |

**Geração de vídeo por IA saiu em 18/08/2026** (commit `6148d94`). A cascata de fallback
do Veo tentava o modelo rápido a US$ 0,10 por segundo e caía para o padrão a US$ 0,40,
levando um vídeo de 8 segundos de R$ 4,85 para R$ 18,05 contra R$ 10,00 de receita, ou
seja 80% de prejuízo por operação, invisível porque o Veo nunca gravava em `ai_usage`.
Vídeo passou a vir da gravação do próprio cliente. Sobraram menções ao Veo em comentários
e num construtor de prompt, mas a geração está desligada.

**Lucas + Tiago rodam em paralelo** (Promise.allSettled).

**Vera auto-corrige:** se REPROVADO_TEXTO, faz retry paralelo de LinkedIn (se Vera mencionar) + Twitter (sempre).

**DAY_ANGLES:** quando `topicsPerDay` não está configurado, cada dia da semana recebe um ângulo diferente (PROBLEMA, SOLUÇÃO, DADOS, CASOS REAIS, FUTURO, MITOS, IMPACTO HUMANO) para evitar repetição.

---

## 3. Planos e Stripe

### Planos atuais (conferidos em `lib/stripe/index.ts` em 23/08/2026)

| Plano | Mensal | Anual | Créditos | Projetos |
|-------|--------|-------|----------|----------|
| **Pro** | R$ 149 | R$ 1.490 | 1.800 | 3 |
| Business | R$ 249 | R$ 2.490 | 3.500 | 10 |
| Studio | R$ 449 | R$ 4.490 | 7.000 | ilimitado |

O anual é sempre **10 mensalidades**, ou seja dois meses de desconto. O Pro é o plano
de entrada e o plano-herói.

**Starter de R$ 49 foi removido em 18/08/2026.** Três motivos: entregava uma rede só,
contradizendo a promessa de campanha completa nas três redes; rendia R$ 35 de margem
contra R$ 98 do Pro com o mesmo custo de suporte (86 clientes Starter para o mesmo
resultado de 31 Pro); e atraía fora do ICP. No lugar entrou **teste de 7 dias do Pro,
com cartão exigido no checkout**.

**Cupom `50LANCAMENTO` não existe e foi removido da landing.** Ele era prometido na
página mas nunca chegou a ser criado no Stripe. Decisão: remover a promessa em vez de
criar o cupom, porque 50% público descontaria R$ 745 da fatura anual (o Stripe não
distingue mensal de anual no mesmo produto).

**Oferta de fundador:** os 10 primeiros travam **R$ 1.490 por ano para sempre**, com
renovação garantida no mesmo preço. Era R$ 149 mensal travado, e mudou porque a mesma
conversa põe dez vezes mais caixa no dia 1, que é o que financia o tráfego pago.

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
STRIPE_PRO_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
STRIPE_BUSINESS_PRICE_ID=price_...
STRIPE_BUSINESS_ANNUAL_PRICE_ID=price_...
STRIPE_STUDIO_PRICE_ID=price_...
STRIPE_STUDIO_ANNUAL_PRICE_ID=price_...
```

`STRIPE_STARTER_PRICE_ID` e `STRIPE_AGENCY_PRICE_ID` não existem mais. O webhook ainda
lê `STRIPE_STARTER_PRICE_ID` de propósito, mapeando para o plano `pro`, de forma que
quem tenha comprado o Starter antes da remoção não fique sem plano.

### Webhook Stripe
- URL: `https://demandou.com/api/webhooks/stripe`
- Eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

---

## 4. Bugs Corrigidos (PRs #21-#28)

> **Contexto histórico.** Vários itens desta seção citam limitações do plano **Hobby**
> da Vercel (budget de 300s, cron uma vez por dia). O projeto está no **Vercel Pro**
> desde então, então essas restrições não valem mais. A seção fica como registro do
> que foi resolvido, não como descrição do ambiente atual.

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

> Lista levantada do próprio código em 23/08/2026 (`grep process.env`), não de memória.

```
# Auth (better-auth, Clerk saiu)
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://demandou.com
GOOGLE_CLIENT_ID=...            # login com Google
GOOGLE_CLIENT_SECRET=...

# Database (Supabase Postgres, Neon saiu). Usar sempre o pooler.
DATABASE_URL=postgresql://...@...pooler.supabase.com:6543/...

# AI e mídia
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
DEEPGRAM_API_KEY=...
GOOGLE_APPLICATION_CREDENTIALS_JSON=...
GOOGLE_CLOUD_PROJECT_ID=...
GOOGLE_CLOUD_LOCATION=...

# Storage e worker de vídeo
BLOB_READ_WRITE_TOKEN=...
VIDEO_WORKER_URL=...
VIDEO_WORKER_SECRET=...

# Social (as cinco redes)
LINKEDIN_CLIENT_ID=776y3qlu5ltco1
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_PAGES_CLIENT_ID=...
LINKEDIN_PAGES_CLIENT_SECRET=...
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
FACEBOOK_CONFIG_ID=...           # app empresarial exige configuração, não permissão solta
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
STRIPE_BUSINESS_PRICE_ID=price_...
STRIPE_BUSINESS_ANNUAL_PRICE_ID=price_...
STRIPE_STUDIO_PRICE_ID=price_...
STRIPE_STUDIO_ANNUAL_PRICE_ID=price_...

# Operação
CRON_SECRET=...
NEXT_PUBLIC_APP_URL=https://demandou.com
DEMO_LIMITE_IP=3                 # demo pública, por IP por dia
DEMO_LIMITE_GLOBAL=...
```

**Legado proposital no webhook:** ele ainda lê `STRIPE_STARTER_PRICE_ID` e
`STRIPE_AGENCY_PRICE_ID`, mapeando para `pro` e `studio`. É para que alguém que tenha
assinado antes da mudança de planos não fique sem plano. As variáveis em si não
precisam mais existir no ambiente.

**Código morto a limpar:** `lib/pusher/index.ts` e `lib/blotato/index.ts` continuam no
repositório e ninguém os importa. Enquanto existirem, as variáveis `PUSHER_*` e
`BLOTATO_API_KEY` aparecem num `grep` e confundem quem for mapear o ambiente.
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

> Atualizado em 25/08/2026. O detalhe vive nas partes 50 a 61 no fim deste
> arquivo e nos cards "Esta semana" do planner.

- [ ] O TESTE QUE VALIDA PARA LANÇAMENTO: o Bruno grava o vídeo novo (webcam
      4K em tela cheia, OBS configurado em chat próprio), sobe com a faixa
      real escolhida no popup, e dá o veredito no fluxo inteiro
- [ ] Seleção de trechos: régua mais dura (nota 7+) ou A/B do prompt no Codex
- [ ] Crédito automático do CC BY na descrição dos posts
- [ ] Tela do cliente: mostrar diagnóstico e relatório de valor com destaque
- [ ] Meta/Google/INPI/pagantes/tráfego: só o Bruno (ver seção 8)

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

## Sessão 23/08/2026 (parte 40): a capa procura o rosto, e o vídeo entra no quadro

### A crítica da capa era estrutural, não de prompt

O Bruno apontou, com exemplo na mão (canal do Dan Martell), que a capa estava
pegando um quadro de tela compartilhada e escrevendo um texto branco simples em
cima. A causa não era o prompt: **o quadro vinha de dentro do trecho**.

Os melhores momentos de FALA não coincidem com os melhores momentos de IMAGEM.
A seleção de trechos descarta abertura de propósito, e é justamente ali que
muita gente aparece falando em tela cheia. Provado na gravação real: **os sete
trechos escolhidos caem todos em slide, e o quadro bom está no segundo 20**.

Agora o worker varre o vídeo inteiro, tira dez candidatos, e o mesmo agente que
decide o enquadramento escolhe qual tem rosto grande, olhando para a câmera,
com expressão viva. Depois o quadro é reextraído em resolução cheia e recortado
em 1280x720, que é o que o YouTube pede. Os candidatos vão na mesma chamada do
enquadramento, então não custam prompt novo.

A capa mora no VÍDEO e não no trecho: uma escolha de rosto serve para todas as
capas, e o que muda por corte é o texto.

### O prompt refeito no padrão das referências

As thumbnails que ele mandou têm o mesmo esqueleto: pouquíssimas palavras em
corpo enorme, contraste alto, uma palavra destacada em bloco de cor, a pessoa
grande, e o texto nunca cobrindo o rosto. O prompt novo descreve isso em seções
(TEXTO, PESSOA, FUNDO, NÃO FAÇA).

A palavra destacada é escolhida em código, a mais longa da frase, porque deixar
o modelo escolher produzia destaque em preposição.

Resultado medido: 17,5s no Pro, com "CONSULTORIA" em bloco laranja da marca,
texto à direita sem tocar o rosto, fundo simplificado.

**Risco em aberto e vigiado:** o modelo está preservando o rosto, mas isso é
comportamento e não garantia. Se algum dia sair uma capa com outra pessoa, a
composição vira caminho de risco e o certo é trocar por sobreposição de texto em
código, que é feia mas nunca inventa gente.

### A fusão com o Gestor de Conteúdo

Linha de agente nova, **Vitor Vídeo**, subtítulo Cortes. Sem ela os cortes
cairiam na linha da Diana Design, misturados com imagem gerada, e quem olha o
quadro precisa ver que houve trabalho de vídeo.

Os cortes são **espalhados na semana**, com espaçamento uniforme: 3 caem em
segunda, quinta e domingo; 7 caem um por dia. Sete publicações na mesma manhã é
spam, e o quadro carrega por semana, então distribuir também é o que faz eles
aparecerem. O vídeo completo entra como card próprio na segunda de manhã.

Idempotência pelo `config` do run, sem coluna nova: clique repetido devolve o
run existente em vez de duplicar cards e posts.

**Detalhe que teria quebrado calado:** a detecção de vídeo do `MediaPreview` só
aceitava URL terminada em `.mp4`, e a nossa rota serve por consulta porque o
storage é privado. Sem ajustar, o corte apareceria como imagem quebrada dentro
do quadro.

### O fluxo completo hoje

```
sobe → transcreve → escolhe momentos → CORTA no Railway (enquadramento por
visão + capa por varredura de rosto) → cliente marca o que sobe e para onde →
capas, títulos e textos → cronograma da semana → quadro do Gestor → publica
```

### O que falta

A landing contando essa história, e a publicação de vídeo em LinkedIn, X e
Facebook.

*Atualizado em 23/08/2026 por Claude Code.*

## Sessão 23/08/2026 (parte 41): a capa profissional e a landing com prova

### A capa passou a recortar, corrigir expressão e trocar o fundo

Terceira evolução, cada uma vinda de uma crítica do Bruno com o resultado na
mão. Ele apontou que a boca dele estava aberta no meio de uma sílaba, e que um
quadro ao lado a postura já muda, então escolher melhor ajuda mas não resolve:
**em vídeo de fala contínua, a maioria dos quadros é ruim como foto.**

Agora a pessoa é recortada do fundo, a expressão é ajustada e o cenário é
substituído por um alinhado ao nicho do cliente.

**A expressão sai do CONTEÚDO, não da imagem.** Quem escolhe é o agente que leu
a fala, porque a emoção certa vem do que a pessoa disse e o modelo de imagem só
vê um quadro parado. Cinco opções, cada uma traduzida em instrução concreta de
boca, olhos e sobrancelhas, porque "pareça confiante" não diz ao modelo o que
desenhar.

Testado com o quadro real de boca aberta:

| Expressão | Tempo | Resultado |
|---|---|---|
| confiante | 17,2s | boca fechada, sorriso leve, escritório desfocado |
| sério | 18,2s | boca fechada sem sorrir, parede de concreto, luz lateral |

**RISCO NOVO, e é real.** Até aqui a trava contra o modelo trocar a pessoa por
alguém inventado era a instrução de NÃO alterar o rosto. Pedir mudança de
expressão remove essa trava. A compensação é a seção IDENTIDADE, primeira e mais
longa do prompt, que lista item por item o que preservar e manda manter a
expressão original se não der para ajustar sem mudar a pessoa. **Mas isso é
instrução, não garantia.**

Se um dia sair capa com outra pessoa, o caminho certo NÃO é ajustar o prompt de
novo: é voltar para sobreposição de texto em código sobre a foto real, que é
mais feia e nunca inventa gente. Já há leve deriva de traços no caso "sério",
que é o limite a vigiar.

### A landing ganhou a seção da entrega

A landing contava a história do vídeo em prosa, e prosa não vende
transformação. Agora há uma seção com as **saídas reais do produto**, geradas de
uma gravação de verdade, ao lado do material cru de onde vieram.

**O antes é o argumento.** Sozinho, o depois parece uma imagem bonita que
qualquer um faria no Canva; com o antes ao lado, fica claro que houve trabalho.

Fica entre o Como funciona e o Preço: quem chegou ali já entendeu o que a
plataforma faz, e o que decide a compra é ver o resultado. Preço antes da prova
é pedir decisão sem argumento.

**Três problemas achados abrindo no navegador, não lendo o código:** dois itens
ficavam com caixa cinza vazia (trocadas pelos capítulos reais e pelos três
textos por rede); o corte vertical de 9:16 estourava a altura da linha ao lado
de um 16:9; e o celular precisou de conferência, que passou sem rolagem lateral.

**Decisão pendente do Bruno:** as imagens são o rosto dele, na home pública.
Ele é o dono e disse que vai usar a plataforma nas próprias empresas para
mostrar valor, mas aparecer na home é decisão dele. Trocar é substituir os
arquivos em `public/exemplo/`.

*Atualizado em 23/08/2026 por Claude Code.*

## Sessão 23/08/2026 (parte 42): o teste de ponta a ponta, e os quatro defeitos que ele achou

Rodado antes de o Bruno testar, a pedido dele. Estratégia: as rotas `enquadrar`
e `cortar-callback` são autenticadas por HMAC e não por sessão, então dá para
rodar o worker localmente contra o servidor local e exercitar o caminho real
inteiro (mesmo ffmpeg, mesmo agente de visão, mesmo storage, mesmos
manipuladores de rota). O que fica de fora é o salto de rede entre Railway e
Vercel, verificado à parte.

### Os quatro defeitos

**1. O worker desistia do aviso de conclusão na primeira falha.** O trabalho de
cortar leva minutos e gasta CPU e transferência de verdade; se o aviso se perde,
tudo isso vira lixo, o cliente vê "cortando" até o prazo e a única saída é
refazer. Aconteceu no teste quando o servidor do outro lado caiu no meio.
Agora insiste quatro vezes com espera crescente (5s, 15s, 45s, 135s), porque a
falha típica é um deploy do app, que leva perto de um minuto.

**2. Duas migrations nunca tinham sido aplicadas.** `completoUrl` e
`capaFonteUrl` só existiam no código: elas rodam no build da Vercel, e o PR não
tinha sido mergeado. O callback teria quebrado. Aplicadas pelo Prisma, com
registro correto para o build não tentar de novo.

**3. O recorte do slide cortava a primeira e a última palavra de cada linha.**
Este só apareceu **olhando o vídeo produzido**, não o banco: dava para ler "rês
negócios" sem o T e "eticon" sem o Ar. O prompt mandava apertar a caixa "sem
margem vazia" e o agente apertou demais. Como ele erra sempre para o mesmo lado,
a correção entrou nos dois lugares: o prompt passou a proibir cortar texto, e o
worker abre a caixa em 3% de cada lado, preso ao quadro. A folga vale só para a
tela; a caixa da pessoa é a janela da webcam e alargar traria pedaço de slide
para dentro do rosto.

**4. As caixas do enquadramento eram descartadas** pelo callback, que guardava
só cena, tratamento e motivo. Sem as coordenadas, "está cortando o slide" não
tem diagnóstico possível: não dá para saber se errou quem mediu ou quem aplicou.

### Dois erros meus no próprio teste, que valem registro

- **O token do Blob está entre aspas no `.env.local`**, e `cut -d= -f2-` levou as
  aspas junto, gerando 403. Conferido depois que o valor no Railway está correto.
- **Apontei o worker para a porta errada** do servidor local, o que produziu
  "fetch failed" no enquadramento e me fez desconfiar do código antes de
  desconfiar do teste.

Os dois reforçam a mesma regra: quando o teste falha, a primeira hipótese
razoável é o teste.

### O que funcionou, medido

| | |
|---|---|
| Vídeo completo | **811 MB → 176 MB** |
| Cortes | 6, todos 1080x1920, com áudio |
| Enquadramento | 6 de 6 classificados como misto, com motivo coerente |
| Capa do rosto | achou o Bruno olhando para a câmera, boca quase fechada |
| Consumo da visão | 11.439 tokens de entrada, 1.179 de saída |

O agente de visão descreveu cada cena com precisão ("slide comparando os três
negócios com webcam pequena no canto"). Ele está enxergando de verdade.

### Correção de número que eu tinha dado errado

Estimei R$ 0,07 por vídeo para a visão. O real medido é **R$ 0,19**, porque são
22 imagens e não 14 (12 dos trechos mais 10 candidatos de capa). Continua
pequeno perto dos R$ 1,51 do trabalho, mas o número estava errado.

### Observação de produto para o Bruno

A gravação dele é screencast do começo ao fim, então **6 de 6 cortes viraram o
layout empilhado** e nenhum tem ele em tela cheia. Funciona, mas quando ele
gravar olhando para a câmera os cortes ficam melhores. Vale entrar no roteiro de
gravação dele.

*Atualizado em 23/08/2026 por Claude Code.*

### Continuação da parte 42: os dois defeitos que só o vídeo mostrava

Depois do primeiro reprocessamento, mais dois consertos, ambos achados olhando
o corte produzido e não o banco.

**A folga de 3% não bastava, e agora ela tem medida.** No quadro do slide de
três colunas, o texto ocupa de **12,3% a 86,7%** da largura e o agente devolveu
**17% a 85%**: erro de 4,7% para dentro no lado esquerdo. Com 3% ainda cortava a
primeira letra de cada linha. Passou para **6%**, com o número escrito no código
para a próxima pessoa não ter que remedir. O custo é o texto sair 7% menor, o
que é invisível perto de perder a primeira palavra.

**A pessoa aparecia duas vezes no mesmo quadro.** No empilhado ela aparece
grande embaixo, e como a janela da webcam fica dentro da área do slide, o
recorte de cima pegava ela também: uma minúscula em cima e uma grande embaixo.
`semAPessoa` encurta a tela até onde a pessoa começa, o que não perde conteúdo
porque slide bem feito não põe texto embaixo da janela do apresentador. Só
encurta quando sobra tela de verdade.

**A lição que atravessa os dois:** o banco dizia "6 cortes prontos" e estava
certo. Seis cortes prontos não é seis cortes bons, e a verificação tem que
chegar até o artefato, aberto e olhado.

*Atualizado em 23/08/2026 por Claude Code.*

## Fechamento de 23/08/2026: o produto de vídeo está em produção

PR #30 mergeado, 23 commits. Deploy de produção verde em 56s, as 10 migrations
aplicadas, o worker do Railway respondendo.

**Estado verificado no banco de produção:** o vídeo de teste está em `cut`, com
6 cortes, o completo recodificado e a capa do rosto. Ou seja, o Bruno cai direto
na tela de cortes sem precisar reprocessar.

### O que a jornada de hoje mudou

O vídeo saiu de "decisão de rumo sem implementação" para fluxo completo:

```
sobe → transcreve → escolhe momentos → CORTA no worker do Railway
  (enquadramento decidido por visão, capa escolhida varrendo o rosto)
→ cliente marca o que sobe e para onde
→ título, descrição e capa automáticos
→ cronograma da semana
→ quadro do Gestor de Conteúdo
→ publica
```

### As três regras que ficaram, e valem mais que o código

1. **O que sai da Demandou nunca pode ser pior que o que entrou.** Ela achou um
   defeito invisível (áudio recodificado de 128k para 160k) e virou política:
   sem edição não recodifica, CRF 18, áudio copiado quando dá, resolução
   intocada, e fidelidade medida por entrega.
2. **Antes de oferecer um caminho, conferir que ele existe de ponta a ponta.**
   Aconteceu duas vezes hoje: o ramo do YouTube era código inalcançável desde a
   remoção do Veo, e dos cinco destinos de corte só um publicava vídeo.
3. **A verificação tem que chegar até o artefato.** O banco dizia "6 cortes
   prontos" e estava certo; seis cortes prontos não é seis cortes bons. Os três
   últimos defeitos do dia só apareceram abrindo o vídeo.

### O que falta

- Publicação de vídeo em LinkedIn, X e Facebook
- Cortar hesitação e recomeço de frase, com aprovação por trecho
- Preview da Vercel sem `DIRECT_URL`, que deixa todo PR sem verificação real
- Verificação da empresa na Meta e submissão da OAuth do Google, que agora
  dependem só da gravação do screencast

*Atualizado em 23/08/2026 por Claude Code.*

## Sessão 23/08/2026 (parte 43): a noite do backlog

O Bruno entrou pelo celular, apontou três coisas, deu autonomia e pediu para
zerar o backlog de código. Ordem dele mais a minha recomendação de sequência.

### 1. A plataforma não funcionava no celular

Diagnóstico pior que o sintoma: o `app-shell` fixava a barra lateral em 240px e
empurrava o conteúdo com `ml-60`, **sem nenhuma regra de tela pequena**, e a
barra lateral tinha **zero classes responsivas em 249 linhas**. Num telefone de
390px sobravam 150 para o conteúdo.

A barra virou gaveta, com barra superior própria, fundo que fecha ao tocar fora,
X e tecla Esc. No computador nada mudou, inclusive o recolher (conferido: 240
para 64 e de volta, com a preferência salva).

Toda variante "recolhida" passou a valer só do `lg` para cima: no celular a
gaveta é larga e mostra os rótulos, porque ícone sem rótulo em tela pequena vira
adivinhação.

**Medido pelo sintoma objetivo, rolagem lateral:**

| | antes | depois |
|---|---|---|
| Gestor de Conteúdo | 556px numa janela de 390 | 385 |

Culpados: a barra de 8 abas numa linha (passou a rolar por dentro) e a
navegação de semana com cinco controles (passou a quebrar linha).

De carona: o cabeçalho do projeto ganhou `top-14` no celular, e o texto do
upload dizia "Até 60 minutos" enquanto o limite subiu para 120 em 22/08.

Dívida antiga paga: a preferência de barra recolhida era lida num `useEffect`
com `setState`, erro de lint desde antes desta sessão. Virou
`useSyncExternalStore`, que é o primitivo para isso.

### 2. A edição não limpava erro de fala

Eu removia **silêncio**, e hesitação **tem áudio**. Estava adiado num card, e ele
bateu nisso na primeira vez que assistiu. Adiar estava errado.

Medido: 147 "é", 78 "então", 44 "né", 35 "aí". A abertura era "Bom, vamos lá
gente. Quero falar com vocês aqui de tema sobre, **é**, a minha trajetória", com
um recomeço logo depois. Depois da limpeza: "Quero falar com vocês aqui de tema
sobre, a minha trajetória". **Cerca de 30s só no primeiro bloco de 800
palavras**, contra 49,6s de todas as pausas do vídeo inteiro.

**Precisa de agente**, porque "é" é verbo e "então" liga ideias metade das
vezes: a diferença está no papel da palavra, não na palavra.

**E precisa de verificação em código em cima do agente**, porque ele erra do
jeito mais caro: devolveu "sobre, é" como hesitação, e cortar isso deixaria "de
tema a minha trajetória". `cortePlausivel` só aceita corte que ou é todo muleta,
ou tem palavra de conteúdo reaparecendo ao lado, que é a assinatura objetiva de
repetição e de recomeço.

Detalhe que custou um teste: a junção de cortes vizinhos precisa vir ANTES da
validação. Recomeço vem partido em dois, e aplicar só uma metade deixaria "eu
saí eu quero falar", pior que o original.

**Descoberta de custo que vale para o projeto inteiro.** Mesma entrada, mesmo
prompt:

| Esforço | Tempo | Saída | Custo por vídeo |
|---|---|---|---|
| alto | 97,9s | 10.213 tokens | R$ 3,65 |
| médio | 62,7s | 6.776 | |
| **baixo** | **~25s** | **~2.500** | **R$ 1,17** |

Resultado equivalente nos três, porque achar muleta é leitura e não raciocínio.
Regra escrita no código: tarefa de julgamento fica no padrão, tarefa mecânica
sobre lista vai em `low` COM verificação. Sem isso a margem virava negativa: o
trabalho de vídeo rende R$ 4,48 e o esforço alto sozinho custaria R$ 3,65.

### 3. O vídeo abre com gancho, não com "vamos lá"

Pesquisa que o Bruno mandou fazer, e os números mandaram no desenho: o
espectador decide em **3 segundos**; gancho desalinhado perde **mais de 40% nos
primeiros 5s**; gancho alinhado retém **78% até os 30s**; com 70% aos 30s o
YouTube empurra o vídeo. O padrão mais forte não é choque, é a **alça aberta**.

**Ressalva:** em 2024 o MrBeast abandonou publicamente a edição hiper-rápida,
desacelerou, e as views subiram. Copia-se a alça aberta, não o ritmo de 2020.

Testado no vídeo real, os dois ganchos escolhidos são alça aberta de verdade:
"anuncia dificuldade inesperada com a câmera, sem explicar por quê" e "revela
dois anos vendendo consultoria sem contar o que buscava".

A abertura sai em arquivo separado e é emendada ao corpo com `-c copy`, porque o
filtro `select` que remove pausas **não sabe reordenar**, e a abertura precisa
exatamente disso. Emenda em 0,15s, sem terceira geração de perda. Transição
conferida por medição de brilho: 222 no meio, 37,5 no fade, 226 quando o corpo
começa.

### 4. LinkedIn, X e Facebook passaram a publicar vídeo

O LinkedIn tinha o maquinário pronto mas só aceitava data URL, e com URL do
storage postava o **link como texto**, publicando um link quebrado no nome do
cliente. O X precisou de envio em três atos mais espera de transcodificação. O
Facebook usa busca por URL, em `/videos` e não `/feed`, porque vídeo como anexo
de feed vira link sem player.

Diferença deliberada: falha de imagem no X publica só o texto, falha de **vídeo**
é fatal, porque quem marcou um corte quer o corte.

### 5. O Preview da Vercel parou de falhar

Todo Preview falhava em 7 segundos porque o `build` rodava `prisma migrate
deploy` incondicional e o ambiente não tem variável de banco. **O check vermelho
de todo PR era falso alarme.**

A correção óbvia seria pior: dar a variável faria cada branch não mergeado
aplicar suas migrações em produção. O build virou um script que só migra quando
`VERCEL_ENV` é production.

**Verificado: primeiro Preview verde em 1 minuto**, contra 7 segundos de erro.

*Atualizado em 23/08/2026 por Claude Code.*

## Sessão 23/08/2026 (parte 44): dois bugs que só aparecem em vídeo longo

Os dois foram criados pela mesma coisa: a limpeza de fala, que entrou ontem,
triplicou o número de cortes por vídeo. O que aguentava 67 remoções passou a
receber 155, e duas peças quebraram.

### 1. O ffmpeg morria com "Cannot allocate memory", e não era memória

A remoção de trechos montava uma expressão única:

```
select='between(t,a,b)+between(t,c,d)+...'
```

Um termo por pedaço mantido. Com 67 remoções funcionava; com 155 o ffmpeg
respondia `Error opening output files: Cannot allocate memory`, que manda
procurar RAM e não tem nada a ver com o problema.

**Medido em 23/08, onde exatamente quebra:**

| Termos na expressão | Tamanho | Resultado |
|---|---|---|
| 40 | 932 chars | ok |
| 80 | 1.932 chars | ok |
| 120 | 2.932 chars | **falha ao parsear** |

O limite é do parser de expressão, entre 80 e 120 termos.

**A forma que escala** é `trim` mais `concat`: cada pedaço vira um NÓ do grafo
de filtros em vez de um termo de uma expressão só.

| Formulação | Segmentos | Resultado |
|---|---|---|
| `trim` + `concat` na linha de comando | 120 | ok em 4s |
| idem | 200 | ok em 14s |
| idem | 400 e 700 | falha do SHELL, não do ffmpeg |
| `trim` + `concat` com filtro em ARQUIVO | 400 | ok em 27s |
| idem | **700** | **ok em 157s** |

Passar de 200 segmentos exige o filtro em arquivo. O grafo cresce rápido: o
corte real de 23/08, com 161 remoções, gerou 322 nós e 22.007 caracteres, e 700
segmentos passam de 50 mil. O teto de linha de comando do Windows é 32.767
caracteres, então na máquina de desenvolvimento quem recusa é o SHELL, antes de
o ffmpeg ver qualquer coisa. No Linux do Railway o teto é muito maior e o
estouro viria depois, mas o filtro em arquivo funciona nos dois e tira a
diferença da conta.

**Armadilha de versão, e ela morde só em produção.** A opção que lê o filtro de
arquivo MUDOU DE NOME: até a 6 é `-filter_complex_script`, da 7 em diante é
`-/filter_complex`, e a antiga foi REMOVIDA. A máquina de desenvolvimento roda
ffmpeg 9; o contêiner do Railway roda o do Debian bookworm, que é 5.1. Escolher
pela versão detectada em tempo de execução é o que impede um bug que passa
local e quebra no Railway.

A rota `/saude` do worker passou a devolver a versão do ffmpeg e a opção
escolhida, para essa diferença nunca mais precisar de adivinhação.

### 2. O teto de tempo do ffmpeg era fixo em 30 minutos

Medido na gravação real: com o grafo de 294 nós mais a legenda, o ffmpeg roda a
cerca de **4x o tempo real**. Teto fixo de 30 minutos aguenta gravação de 2
horas e mata uma de 3, e o sintoma seria um corte sumindo sem erro que explique.
Agora o teto é um segundo por segundo de vídeo, com piso de 30 minutos, o que dá
quatro vezes a folga medida.

**Enquanto media isso, corrigi uma extrapolação minha errada.** Parei um corte
achando que ia estourar o teto, com base num palpite de que o arquivo final
teria 760 MB. Medido depois:

| Preset (CRF 18) | Tempo para 60s | Bitrate | SSIM vs fonte |
|---|---|---|---|
| medium | 14,8s (4,0x tempo real) | 0,88 Mbps | 0,9988 |
| fast | 15,6s (3,9x) | 0,86 Mbps | 0,9988 |
| veryfast | 9,8s (6,1x) | 0,77 Mbps | 0,9979 |
| ultrafast | 6,6s (9,1x) | 4,15 Mbps | 0,9996 |

A fonte é OBS a 4,43 Mbps. O CRF 18 sai a 0,88 Mbps, **cinco vezes menor**, com
SSIM 0,9988, porque o conteúdo é rosto falando e tela parada, que comprime bem.
O arquivo final tem uns 167 MB e a codificação leva uns 7 minutos, não 45.
`preset medium` fica como está: é o menor arquivo com qualidade praticamente
idêntica à fonte.

### 3. A abertura falhava em metade dos vídeos, calada

Achado por acidente enquanto testava o item 1. A escolha de ganchos usava
`maxTokens: 8000`, e o teto inclui os tokens de PENSAMENTO.

**Medido em 23/08, 8 execuções com a mesma entrada:**

| Teto | Falhas | Saída quando responde |
|---|---|---|
| 8.000 | ~metade, com `stop_reason: max_tokens` e ZERO texto | 6.188 a 6.248 |
| **16.000** | **0 de 8** | 5.271 a 9.312 |

O efeito era pior do que o número sugere. Quem chama pega a exceção e segue sem
abertura, então o corte nunca morria: o vídeo simplesmente saía sem gancho, e
nada no sistema dizia por quê. Um vídeo em cada dois perdia justamente a peça
que o Bruno pediu ontem por causa de retenção.

Duas correções: o teto virou 16.000, e a falha passou a ser registrada em vez de
engolida.

Medido também com esforço médio: resolve em 147 a 3.501 tokens, três vezes mais
barato, e escolhe os MESMOS trechos. Fica no padrão mesmo assim, porque escolher
gancho é julgamento e a regra da casa manda julgamento no padrão. O número para
trocar está no código, se o custo apertar.

### Verificacao no video real, 23/08 as 10:09

Rodado de ponta a ponta na gravacao de 1646s do Bruno, com 161 remocoes:

| Medida | Previsto | Obtido |
|---|---|---|
| Nos no grafo de filtro | ~322 | 322, em 22.007 caracteres |
| Duracao do corpo | 1508s (1646 menos 137,9) | 1509,1s |
| Duracao final com abertura | 1522s | 1523,15s |
| Bitrate | 0,88 Mbps | 0,946 Mbps |
| Tamanho | ~167 MB | 171 MB |

A abertura saiu com 14,0s exatos, que sao os dois ganchos de 7s. Decodificacao
do arquivo inteiro sem um unico erro. Deriva total entre audio e video de 88 ms
em 25 minutos, que e quantizacao de quadro de AAC e nao deriva progressiva: com
161 emendas, erro sistematico daria quase 4 segundos.

**O que ainda NAO foi verificado:** o mesmo corte contra o worker do Railway,
que roda ffmpeg 5.1 e portanto o outro nome da opcao de filtro. Enquanto isso
nao rodar, a correcao esta provada no ffmpeg 9 e apenas raciocinada no 5.1.

### 4. O envio ao storage podia ficar pendurado para sempre

Achado logo depois, e de novo por acidente. Depois do corte pronto o worker
ficou 38 minutos sem terminar, e eu matei o processo achando que estava travado.
**Errado pela segunda vez no mesmo dia, pelo mesmo motivo: extrapolei em vez de
medir.**

Medido depois, o envio ao Vercel Blob a partir desta maquina:

| Arquivo | Tempo | Velocidade |
|---|---|---|
| 1,9 MB | 28s | 0,07 MB/s |
| 19,1 MB | 577s | 0,033 MB/s |

Isso e 265 a 560 kbps de subida. Nessa faixa, os 171 MB do video completo levam
entre 41 e 86 minutos, entao aos 38 minutos o envio estava mais ou menos na
metade. O worker nao estava travado.

**Mas o bug existe assim mesmo, e e serio:** `subir()` nao tinha prazo nenhum.
Um envio que emperra de verdade prenderia o worker para sempre, vivo e ocioso,
segurando o video, e o cliente veria "cortando" ate o prazo do app estourar uma
hora e meia depois. Tres correcoes:

- **Fluxo em vez de `readFile`.** A versao anterior carregava o arquivo inteiro
  na memoria antes de comecar. O conteiner tem menos memoria que os arquivos que
  processa, e a descida ja tomava esse cuidado que a subida nao tomava.
- **`multipart` acima de 50 MB.** Divide, manda em paralelo e retenta a parte
  que falhar. Sem isso um solucao aos 90% joga fora tudo e recomeca do zero.
- **Prazo proporcional ao tamanho**, com piso de 10 minutos e teto de 45.

Verificado: fluxo com multipart sobe, e o prazo corta de verdade, abortando em
1,2s com mensagem que diz o que foi cortado e por que.

**Uma questao de produto que isto levantou e nao e bug:** a velocidade de subida
daqui e do BRUNO, e no Railway o envio sai de datacenter, entao nada disso afeta
producao. Mas o CLIENTE sobe a gravacao pela conexao dele. Uma gravacao de 3,33
GB a 265 kbps levaria 28 horas. Vale medir quanto tempo o upload leva na pratica
e decidir se a tela precisa avisar o tamanho recomendado antes de o cliente
escolher o arquivo.

### 5. O worker do Railway NAO sobe sozinho com o push

Descoberto em 23/08 e vale mais que os bugs acima, porque e o tipo de coisa que
faz alguem depurar por horas o codigo errado.

O servico `video-worker` no projeto `demandou` do Railway **nao esta ligado ao
GitHub**. Verificado pelo CLI: `source: null`, builder DOCKERFILE com
`dockerfilePath: /Dockerfile`. Ele foi publicado com `railway up` a partir da
pasta `worker/`, e continua assim. O merge no master publica o APP na Vercel e
nao toca no worker.

Consequencia pratica: depois de mexer em `worker/src/*`, o deploy e manual.

```bash
cd C:/Users/devan/opensquad-app/worker
railway link --project demandou --environment production   # so na primeira vez
railway up --service video-worker --detach
```

Para conferir que subiu, a rota de saude agora diz a versao:

```bash
curl https://video-worker-production-2eb6.up.railway.app/saude
```

**Confirmacao da armadilha de versao, medida em 23/08 as 11:34.** O mesmo codigo
respondeu coisas diferentes nos dois lugares, que era exatamente o previsto:

| Onde | ffmpeg | Opcao escolhida |
|---|---|---|
| maquina de desenvolvimento | 9.0 | `-/filter_complex` |
| conteiner do Railway | 5.1.9-0+deb12u1 | `-filter_complex_script` |

Se a opcao estivesse fixa no codigo, uma das duas quebraria, e como a de
desenvolvimento e a mais nova, o bug so apareceria em producao.

### Verificacao em PRODUCAO, 23/08 as 14:44

O mesmo corte rodado contra o worker do Railway, com ffmpeg 5.1.9 e portanto
`-filter_complex_script`. Chamadas de enquadramento e callback em demandou.com,
ou seja o caminho real inteiro.

| Medida | Esperado | Obtido |
|---|---|---|
| Status final | cut | **cut**, sem erro, 0 retentativas |
| Cortes com vertical, horizontal e capa | 6 de 6 | **6 de 6**, nenhuma falta |
| Duracao do completo | 1536,1s (1646 menos 130,9 de remocao, mais 21 de gancho) | **1537,15s** |
| Bitrate | ~945 kbps | 943 kbps |
| Tamanho | ~170 MB | 173 MB |
| Formato | 1080p30 h264 mais aac | confere |

A abertura decodifica sem um unico erro, que e o que importa: e ali que ficam as
emendas dos ganchos com o corpo.

**Com isto a correcao esta provada nas DUAS versoes do ffmpeg**, a 9 da maquina
de desenvolvimento e a 5.1 do conteiner, com a opcao de filtro certa em cada
uma.

Nota de ambiente: a conexao desta maquina estava entre 265 e 560 kbps de subida
neste dia, o que derrubou dois envios de arquivo e um download pela metade. Nada
disso e do produto; o Railway sobe e desce de datacenter.

## Sessao 23/08/2026 (parte 45): confirmacao de e-mail no cadastro

Todo usuario nascia com `emailVerified: false`, porque o cadastro por senha nunca
mandou e-mail de confirmacao. Isso obrigou a desligar `requireLocalEmailVerified`
em 21/08 (senao o login social nunca vinculava a conta existente) e permitia, em
tese, alguem cadastrar com e-mail alheio e herdar a conta do dono real.

### A decisao que evita tiro no pe

As duas travas (`requireEmailVerification` e `requireLocalEmailVerified`) sao
amarradas a `emailHabilitado()`, que so e verdadeiro quando `RESEND_API_KEY`
existe no ambiente. Ligar verificacao obrigatoria sem ter como MANDAR o e-mail
trancaria o produto inteiro: a pessoa se cadastra, nunca recebe nada, nunca
entra. Assim o codigo subiu antes da credencial e a trava fechou sozinha quando
a chave chegou, sem outro deploy. Mesmo padrao que os provedores sociais.

### Resend e nao SMTP do Titan

SMTP em funcao serverless e conexao longa com estado, e o runtime derruba socket
ocioso; o erro que aparece e de rede e nao de e-mail. O Resend e HTTP, ja estava
no `package.json` sem nunca ter sido usado, e ja esta no custo fixo. O Titan
continua recebendo, intocado: os registros do Resend usam SUBDOMINIO para envio
(`send.demandou.com`), entao nao encostam no SPF nem no MX da raiz.

**Nao habilitar "Enable Receiving" no Resend.** Isso pediria MX na raiz, que
substituiria os do Titan e derrubaria todo o e-mail recebido em demandou.com.

### A armadilha do cPanel da HostGator, que vai morder de novo

O Editor de Zona do cPanel **trunca valor TXT no caractere `+`**. O DKIM tem 218
caracteres e o `+` aparece na posicao 121: o registro gravou 121 caracteres e
parou ali. Nao da erro, so grava errado, e o sintoma e o Resend reprovar o
dominio sem dizer por que.

Comportamento observado nas tres tentativas, em 23/08:

| O que foi colado | O que o cPanel gravou |
|---|---|
| `p=...IDAQAB` (sem aspas) | 121 caracteres, cortado no `+` |
| `"p=...IDAQAB"` (aspas dos dois lados) | 219 caracteres, com a aspa final virando conteudo |
| `"p=...IDAQAB` (**aspa so na frente**) | 218 caracteres, exatos |

A aspa da frente e consumida como delimitador e faz o `+` passar; sem aspa no
fim, nao sobra lixo. **Vale para qualquer TXT com `+`**, ou seja o proximo DKIM,
qualquer chave de verificacao de servico, e SPF com mecanismos.

Conferir sempre pelo tamanho, e nao de olho:

```powershell
((Resolve-DnsName resend._domainkey.demandou.com -Type TXT -Server 8.8.8.8).Strings -join '').Length
```

### Verificado de ponta a ponta em producao, 23/08

| Etapa | Resultado |
|---|---|
| Cadastro sem a chave no ambiente | HTTP 200 com token, usuario entra, log avisa que nao enviou |
| Cadastro com a chave | HTTP 200 com **`token: null`**, sem sessao ate confirmar |
| Envio pelo Resend | 330 ms, de `contato@demandou.com` |
| Entrega | **caixa principal, nao spam**, remetente aparece como "Demandou" |
| Clique no link | conta passou a `emailVerified: true` |

Quem seria afetado, checado ANTES de ligar em producao: das 3 contas, as duas do
Bruno ja estavam verificadas; a unica que ficou trancada e
`d.eb.iy.oxe.d26.0@gmail.com`, endereco com pontos no Gmail, cadastro
descartavel, que e a "conta de robo" do card Ref 174. Trancar e ganho.

`sendOnSignIn` fica ligado de proposito: quem se cadastrou antes disto esta com
`emailVerified: false` e bateria numa parede sem saida; assim a tentativa de
entrar dispara e-mail novo em vez de so recusar.

## Sessao 23/08/2026 (parte 46): o corte ficou pessimo, e por que

O Bruno assistiu ao resultado e disse que a edicao ficou pessima. Estava certo,
e o erro de metodo foi meu: **de manha eu verifiquei que o arquivo era
tecnicamente valido e chamei isso de produto pronto**. Duracao batendo, zero
erro de decodificacao, SSIM alto. Nada disso diz se o corte e BOM. Eu tinha
escrito na propria wiki, horas antes, que a verificacao precisa chegar ate o
artefato, e nao cheguei: medi o encanamento em vez de assistir.

### O que o quadro mostrava, medido

| O que se via | Causa |
|---|---|
| Slide cortado no meio da ultima linha | `semAPessoa` cortava pelo eixo Y |
| Faixa BORRADA de 269 px no meio | o empilhado deixa buraco, o fundo desfocado preenche |
| 192 px vazios no topo | overlay comecava em 10% da altura, sem razao |
| Botoes VOLTAR/RECOMECAR no video | a caixa da pessoa incluia a barra do app de slides |
| Pessoa macia | webcam de 422x302 ampliada 2,56 vezes |
| Sem legenda, musica, transicao | nao existia no codigo |

**26% do quadro era desperdicio**, preenchido com uma copia ilegivel do proprio
slide que estava legivel logo acima.

### O corte do slide: escolhi o eixo errado

A webcam fica no canto inferior DIREITO (x=1488 y=778 w=422 h=302) dentro de uma
tela de x=209 y=119 w=1500 h=907. Cortar pela altura remove uma faixa da largura
INTEIRA por causa de uma janelinha que ocupa so o canto:

    pela altura  ate y=778  -> perde 27% e come o ultimo topico
    pela largura ate x=1488 -> perde 15% e nao come nada

O comentario que eu tinha escrito dizia "slide bem feito nao poe texto embaixo da
janela do apresentador". O slide do Bruno poe. Agora escolhe por AREA entre as
quatro formas de tirar a webcam encolhendo um lado so. Verificado nas caixas
reais dos 6 cortes: **17% mais slide em 5 deles**, e em nenhum o recorte novo
sobrepoe a webcam.

### O recorte da pessoa: medido antes de prometer

| | |
|---|---|
| Modelo | Selfie Segmenter do MediaPipe, 224 KB, CPU |
| Velocidade | 7,2 ms por quadro (139 por segundo) |
| Corte de 60 s | cerca de 13 s de segmentacao |
| Silhueta | cabelo e ombros limpos |

**Duas descobertas que fazem funcionar:**

1. **A caixa precisa ser apertada ANTES.** Com a caixa que o agente de visao
   devolve, que inclui a faixa branca do slide e a barra de botoes, o modelo
   inventa manchas em volta. Apertando so na janela da webcam, sai limpo de
   primeira. Apertar a caixa nao e estetica, e o que faz o recorte funcionar.

2. **A janela da webcam e a regiao que MUDA.** Barra de botoes e slide sao
   estaticos, entao diferenca entre quadros distantes acha a webcam sem
   heuristica de cor. Verificado: detectou y=95 h=563 contra 97 e 558 a olho.

Falhar no recorte nao derruba o corte: sem mascara sai na composicao antiga.

### Um bug que travaria para sempre

O `-t` estava entre dois `-i`, onde ele vira opcao de INPUT do ultimo arquivo em
vez de limitar a saida. Como o gradiente do fundo e uma fonte SEM FIM, o ffmpeg
codificava ate o disco acabar. O primeiro teste da composicao nova ficou 10
minutos sem terminar por causa disso. Agora o `-t` vem depois de todos os inputs
E o gradiente tem duracao propria, que sao duas travas para o mesmo erro.

### Decidido com o Bruno

- **Musica:** biblioteca com licenca comercial clara, pesquisada e aprovada por
  ele antes de entrar. Nada de pegar faixa solta.
- **Efeitos:** so o que sai da FALA. Emoji e frase de destaque escolhidos pelo
  agente a partir do que ele disse. Sem print de noticia, que traz direito
  autoral e risco de manchete inventada.

### O que falta nesta frente

- [ ] Legenda queimada palavra a palavra (o tempo por palavra ja existe, do
      Deepgram). E a maior alavanca de retencao em Shorts e hoje nao existe.
- [ ] Musica de biblioteca licenciada, com a voz abaixando a trilha
- [ ] Emoji e frase de destaque a partir da fala
- [ ] Julgar a composicao nova rodada sobre a FONTE ORIGINAL, e nao sobre o
      corte ja composto, que e entrada degradada

### Musica: o cliente traz o arquivo, e a razao e juridica

Decidido em 23/08 depois de pesquisa, e a decisao inverteu a minha primeira
recomendacao.

**O que quase deu errado.** Eu ia comprar assinatura de biblioteca "royalty
free" e usar. Nao serve para a Demandou. Praticamente toda licensa desse tipo
cobre voce usar a musica NO SEU conteudo. A Demandou faz outra coisa: poe a
musica no video de um cliente pagante, que publica no canal DELE. Isso e
sublicenciamento. A Artlist e explicita: a licenca padrao nao permite criar
projetos destinados a canais de terceiros. Um Content ID no Instagram cairia no
nome do cliente, por decisao nossa.

**A linha que separa legal de problema nao e a musica, e QUEM BAIXA O ARQUIVO.**

| Quem baixa | O que a Demandou vira | Precisa de sublicenca? |
|---|---|---|
| A Demandou hospeda ou serve catalogo | distribuidora | sim |
| O CLIENTE baixa e sobe o arquivo | ferramenta de edicao, como CapCut | nao |

Ideia do Bruno, e e a certa: um atalho que MANDA a pessoa ate a fonte, ela baixa,
e sobe. A Demandou nunca entra na cadeia de distribuicao.

**A armadilha que a pesquisa achou.** A biblioteca do YouTube tem DUAS licencas:

| Licenca | Onde vale |
|---|---|
| padrao do YouTube | so dentro do YouTube; uso comercial fora e proibido |
| Creative Commons CC-BY 4.0 | qualquer plataforma, com credito OBRIGATORIO |

A Demandou publica em cinco redes. Faixa da licenca padrao num corte que vai
para o Instagram esta fora da licenca, mesmo tendo sido baixada de boa fe. Entao
o produto so pode aceitar CC-BY, e o credito precisa entrar sozinho na descricao
do post.

**O que isto significa para o codigo:** a engenharia e a mesma em qualquer
cenario, que e o cliente subir um arquivo e a plataforma misturar com a voz por
cima. Serve para a biblioteca do YouTube, para quem ja assina Epidemic ou
Artlist, e para quem tem faixa propria. Nao trava o lancamento esperando
negociacao com ninguem.

Se um dia valer a pena embutir catalogo, os caminhos existem e sao acordo
comercial: a Epidemic Sound tem API feita para plataformas embutirem o catalogo,
e a Artlist tem plano Enterprise com licenca customizavel que cobre uso em
software. Os dois so fazem sentido com receita para justificar.

## Sessao 23/08/2026 (parte 47): a escolha dos cortes

O Bruno assistiu e foi direto: "pega uma parte totalmente desinteressante, com
erros na minha fala", "esta bem distante do padrao Premium". Estava certo, por
dois motivos independentes, e o segundo virou a licao mais util do dia.

### 1. Os cortes NUNCA receberam a limpeza de fala

A limpeza entrou em 22/08 e foi ligada so em `prepararCompleto`, ou seja so no
video do YouTube. Os cortes, que sao o que vai para Instagram, TikTok e
LinkedIn, continuavam saindo do arquivo CRU. Ninguem notou por um dia.

Medido nos seis cortes reais: **30 dos 332 segundos que iam ao ar eram pausa ou
muleta, 9% do que o publico assiste**, e isso e PISO, porque nem conta
autocorrecao como "software como servico, e software as a service".

Agora o trecho e limpo ANTES de tudo, com `prepararTrecho`. De brinde, isso
alinha a mascara do recorte por construcao: se a remocao viesse depois, mascara
e imagem ficariam em linhas do tempo diferentes e o recorte sairia deslocado.

### 2. Ninguem conferia a abertura, e meu conserto burlou minha propria metrica

Medido: **5 dos 6 cortes abriam com defeito.**

| Corte | Abria com | Defeito |
|---|---|---|
| 0 | "software como servico, e software as a service" | autocorrecao |
| 1 | "Diligencia, todo AQUELE negocio" | aponta pra fora |
| 3 | "AH, mas eu sou CLT" | muleta |
| 4 | "MESMO, pra fazer trabalho social" | meio de frase |
| 5 | "ENTAO por exemplo, AH voltei" | muleta dupla |

**A primeira tentativa foi codigo detectando muleta por lista de palavras e
aparando a primeira.** Passou nos seis, e produziu isto:

    "como servico, e software as a service"
    "negocio falou po, vai rolar"
    "por exemplo, ah voltei pro mercado"

Passou porque o detector so olhava a PRIMEIRA palavra. Tirei "Entao" e "por" nao
esta na lista. **O numero melhorou e o video nao.** Meu proprio codigo burlou
minha propria metrica.

Isso mostrou o que ja estava escrito no projeto e eu violei: julgar se uma
abertura prende e JULGAMENTO, nao regra. Tarefa mecanica vai para codigo, tarefa
de julgamento vai para o modelo.

**O desenho que ficou:** o agente devolve a FRASE DE ABERTURA, copiada da
transcricao, e o codigo so confere que ela EXISTE na gravacao antes de alinhar o
corte por ela. Abertura inventada nao alinha nada. O crivo mecanico continua,
mas como aviso no log, e nao como autoridade.

### 3. O agente julga bem e erra aritmetica de tempo

Medido na primeira rodada com o campo de abertura: **so 1 dos 7 cortes abria com
o que o agente prometeu**. Mas as aberturas escolhidas eram BOAS:

    "Em dois mil e vinte e quatro eu estava num emprego"
    "O problema e que eu vendi muita consultoria"
    "A pessoa fala nossa, mas voce fala super bem, ne"

O erro nao era o julgamento, era o TEMPO: a frase escolhida quase sempre estava
antes do `inicio` que ele devolveu. Erro de aritmetica de tempo e fraqueza
conhecida de modelo de linguagem.

Conclusao que vale para o projeto inteiro: **quando o modelo devolve texto E
numero sobre o mesmo trecho, o texto e a fonte da verdade e o numero e palpite.**
A busca pela abertura passou a andar para os DOIS lados, em aneis, ficando com a
ocorrencia mais proxima.

### 4. Teto de tokens da selecao subiu para 32000

Pedir a frase de abertura fez o agente pensar bem mais, porque escolher onde o
trecho comeca deixou de ser consequencia do intervalo e virou decisao propria.
Com 16000 ele gastava o teto inteiro pensando e voltava sem texto, exatamente
como em 22/08 com 4000. Terceira vez que o mesmo padrao aparece: **acrescentar
exigencia ao prompt aumenta o pensamento, e o teto precisa crescer junto.**

### Rumo que o Bruno definiu, e ainda nao esta construido

- **Cortes so com a pessoa**, ocupando quase a tela toda. Ressalva medida: a
  webcam dele tem 422x302 nesta gravacao, e encher 1080 de largura seria 2,56x
  de ampliacao. Ele vai gravar em tela cheia daqui em diante, o que resolve na
  origem.
- **Fundo gerado pelo nano banana**, com a pessoa num quadro dentro da arte
  quando a resolucao nao permitir tela cheia.
- **A plataforma precisa AVISAR** o que melhora o resultado, porque o cliente
  sobe video de toda qualidade.
- **A edicao precisa se adaptar ao tipo de video.** Vlog nao e screencast. Tem
  video que vale tirar o fundo e tem video que nao. Tem video que precisa de
  melhoria de som e tem video que nao. A musica precisa conversar com o tema.
  A arquitetura para isso ja existe no agente de visao, que ja olha quadros e
  decide enquadramento; falta estender para decidir TRATAMENTO.

## Sessao 24/08/2026 (parte 48): a frase repetida, o fim cortado, e o Seedance

O Bruno assistiu de novo e trouxe quatro pontos. Tres viraram correcao, um virou
uma conta que mudou a decisao dele.

### 1. O video completo repetia uma frase, e nao era a gravacao

Ele relatou que a frase sobre a Areticon aparece duas vezes seguidas, sem saber
se tinha falado duas vezes.

Verificado: **"areticon" aparece UMA vez na transcricao**, e nao existe nenhuma
sequencia de 8 palavras repetida na gravacao inteira. Ele falou uma vez so.

O `trim`/`concat` esta limpo: zero sobreposicoes entre os intervalos mantidos, e
a soma bate com a duracao. Sobrou a abertura, e o bug estava la:

    const distintos = validos.filter(
      (g, i) => i === 0 || Math.abs(g.inicio - validos[0].inicio) > 5
    );

Comparava so o INSTANTE DE INICIO, contra o primeiro gancho, exigindo 5 segundos
de diferenca. Ganchos de 480 a 492 e de 486 a 498 tem inicio a seis segundos de
distancia, passam nesse crivo, e **se sobrepoem em seis segundos**. Na abertura
isso e a mesma frase duas vezes seguidas.

Agora compara intervalo com intervalo, contra todos os aceitos, com dois
segundos de respiro.

### 2. Quatro dos sete cortes terminavam no meio da frase

Medido: "antes era o meu emprego, o CLT,", "a empresa ficou estagnada, nao no
produto,", "e esse e dos motivos, ta? Resumindo", "quer ver, ne? E ai eu vou".
O Bruno descreveu como "corta do nada no final".

`encaixarNaFrase` SEMPRE calculou onde a frase fecha. Eu usava esse numero so
para recortar a TRANSCRICAO, e deixava o video terminar no segundo que o modelo
chutou. E o mesmo defeito da abertura, do outro lado da mesma moeda.

**A regra ja estava escrita e eu so tinha aplicado metade:** onde houver texto e
numero sobre a mesma coisa, o texto manda.

### 3. Cortes so com a pessoa, sobre fundo gerado

Pedido dele: "tira os slides dos cortes, deixa apenas eu, e o fundo feito por
IA". Resolve de graca dois defeitos que eu vinha tentando consertar por
geometria: o slide cortado, que voltou de lado quando passei a escolher o
recorte por AREA (cortar largura trunca todas as linhas de texto, cortar altura
so perde as ultimas), e os 45% de quadro vazio.

A pessoa passa a ser escalada por **1400** e nao 1080. A silhueta recortada ocupa
cerca de 60% da caixa da webcam, entao escalar a caixa para 1080 deixava a pessoa
com 541 px, metade da tela, que foi o que ele reprovou.

O slide continua no video COMPLETO do YouTube, onde a tela e grande.

### 4. Seedance 2.5: a conta que mudou a decisao

Ele pediu para instalar a API do Seedance 2.5, descrevendo que ela "pega o modelo
do video e pode gerar os cortes com mais precisao". Duas coisas:

**O que ele e:** modelo de GERACAO de video (texto para video, imagem para video,
edicao, extensao), ate 30 segundos por geracao. **Ele nao escolhe cortes.** A
selecao de trecho continua sendo o agente de texto.

**O preco, medido em 24/08:**

| Resolucao | Por segundo | 30 segundos |
|---|---|---|
| 480p | US$ 0,138 | R$ 22 |
| 720p | US$ 0,296 | R$ 48 |
| 1080p | US$ 0,532 | R$ 86 |

Os cortes saem em 1080x1920. Sete cortes com fundo de 30 segundos em 720p custam
**R$ 336**. O trabalho de video rende **R$ 4,48**. Ate um laco de 5 segundos
repetido da R$ 56, doze vezes a receita.

**E a mesma conta que matou o Veo em 18/08**: R$ 18,05 de custo contra R$ 10,00
de receita. Apresentada assim, o Bruno escolheu nano banana.

Fundo com imagem custa centavos, sai em alta resolucao, e **fundo de corte nao
precisa se mexer**: o que se mexe e a pessoa. O movimento entra em ffmpeg com
zoom lento de 4%, que custa zero. O Seedance fica para quando existir plano com
preco que sustente.

### 5. O script de teste passou a importar producao em vez de imita-la

`scripts/tmp/rodar-corte.mjs` replicava a logica da rota `/cortar`. Isso custou
caro varias vezes: eu consertava o produto, o script continuava com a logica
velha, e o teste dizia uma coisa enquanto a producao fazia outra. Mesma familia
do erro de 22/08, quando testei a API da Anthropic em vez do caminho do
aplicativo.

Virou `rodar-corte.mts`, rodado com `tsx`, importando os modulos reais. So a
parte que a rota faz por sessao (achar o video, assinar o pedido) e propria.
**Se a rota mudar o desenho, o script quebra em vez de mentir.**

Comando:

```bash
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/rodar-corte.mts   https://demandou.com https://video-worker-production-2eb6.up.railway.app
```

### Aberto nesta frente

- [ ] Musica, transicoes e efeitos: o Bruno cobrou os tres e nenhum existe
- [ ] Legenda queimada palavra a palavra
- [ ] O nicho do projeto esta como "Produtividade e organizacao para freelancers
      e autonomos" e o conteudo dele e empreendedorismo, SaaS e energia. O fundo
      sai alinhado ao nicho CADASTRADO, nao ao que ele fala.
- [ ] A edicao adaptada ao tipo de video (vlog nao e screencast)
- [ ] Ajudar o Bruno a configurar a webcam 4K no OBS, que resolve na origem o
      problema de ampliacao

## Sessao 24/08/2026 (parte 49): o especialista, a legenda e os estilos

A sessao mudou de patamar quando o Bruno reenquadrou o problema:

> "meu video e otimo para o nome codigo, porque meu video e ruim, e os usuarios
> vao subir videos ruins. Claro que nao tem milagre, mas tem tecnologia. E o que
> fazemos: pegamos algo ruim e transformamos em algo incrivel. Isso e o conceito
> dos filtros do Instagram. Se conseguirmos deixar esse meu video bom, entao
> vamos conseguir deixar a plataforma pronta. Nao vou mandar outro video por
> esse motivo."

**Isso vira o padrao de teste do projeto.** A gravacao dele, com webcam de
422x302 num canto, fundo branco, fala sem roteiro e sem fecho de ideia, e o caso
de teste oficial. Nao pedir gravacao melhor.

### A pesquisa que passou a mandar no desenho

Feita em 24/08 a pedido dele, sobre o que faz conteudo curto funcionar:

| Achado | Fonte |
|---|---|
| A decisao acontece em **1 segundo**, nao 3. Feed de rolagem nao da 3 | vidIQ, Cut.Pro |
| **85% dos shorts sao assistidos SEM SOM** | Miraflow |
| Mudanca visual a cada **1,5 a 2 segundos** e o alvo de 2026 | Aibrify, OpusClip |
| Video abaixo de 90s retem so **metade** do publico | Aibrify |
| Formulas que mais viralizam: **afirmacao contraria, aviso de erro, chamada de identidade** | Socialync, vidIQ |
| Legenda **palavra a palavra** e o padrao, alto contraste, terco inferior | Blitzcut, Voice Creator |
| OpusClip pontua por gancho, fluxo e ritmo. Nota 80+ rende 2,3x mais views | OpusClip |
| Mas a nota e **direcional, nao previsao**: corte nota 40 as vezes bate nota 85 | ScaleReach |

**O achado mais caro: 85% assiste sem som, e os cortes nao tinham legenda
nenhuma.** Isso nao era acabamento faltando, era a maioria do publico nao
entendendo o video.

A ressalva do OpusClip importa: a nota serve para ORDENAR e para ser honesto, e
nao para prometer viralizacao.

### 1. O especialista parou de encher cota

Pedido do Bruno: "nao tem 6 cortes para tirar dali. Se nao tiver, nao gere, nao
podemos forcar. Temos que ser sinceros: olha, nosso especialista analisou e viu
que seu video tem 2 possiveis cortes, liste os criterios".

O prompt virou o de um editor de video curto, com **seis criterios pontuados de
0 a 10**: gancho, tese, prova, autonomia, emocao e fecho.

**A nota final e a MENOR das seis, e nao a media.** Um trecho com tese otima e
gancho fraco nao funciona, porque ninguem chega na tese. Media premiaria
justamente o desequilibrado, que e o que sai morno.

A nota e **recalculada em codigo**, porque "pegue o menor de seis numeros" e
aritmetica, e estes dois dias mostraram que o agente acerta julgamento e erra
conta.

Resultado no video real: **4 trechos em vez de 7**, e o diagnostico do agente:

> "A gravacao e um raio-x de 27 minutos sem nenhum corte pensado para quem
> assiste: conversa solta que emenda historia pessoal, pitch de tres produtos,
> tutorial e bencao final, tudo sem pausa para fechar ideia. Para a proxima
> gravacao, ele precisa terminar cada ideia com um ponto final antes de ja puxar
> a proxima, e abrir cada bloco com a virada, nao com o contexto."

O campo `diagnostico` entrou no `VideoJob` (migration
`20260824121028_diagnostico_do_video`) para o cliente ler.

### 2. Relatorio de valor

Pedido dele: "trazer o relatorio para o usuario mostra valor". Numeros reais:

    Sua gravacao tinha 27 min 26s e o video editado ficou com 25 min 18s.
    Removemos 140 trechos, somando 128 segundos: 67 eram pausa e silencio (50s)
    e o resto era hesitacao e recomeco de frase.
    Entre os vicios de linguagem cortados: 32 "e", 19 "ne", 3 "bom", 2 "entao".
    Do material aproveitavel sairam 4 cortes prontos para publicar.
    Um editor faria esse mesmo trabalho em cerca de 1h 22min.

**Duas decisoes que protegem a credibilidade do numero:**

- So conta o que a plataforma REMOVEU, e nao o que ela viu. O video tem 147 "e"
  e o relatorio diz 32, porque foram esses que cairam dentro de uma remocao.
  Prometer corte que nao aconteceu e o jeito mais rapido de o cliente parar de
  acreditar no resto.
- Usa **3 minutos de edicao por minuto de video**, que e o PISO da faixa de 3 a
  5 praticada. Da 1h22 em vez de 2h17. Prometer o piso e melhor que decepcionar
  na conferencia.

### 3. Estilos de edicao, escolhidos uma vez por projeto

Ideia dele, e a ORDEM que ele propos esta certa: o estilo precisa ser conhecido
ANTES da edicao, porque decide legenda, ritmo e som.

Quatro estilos em `lib/media/estilos.ts`: **dramatico, acelerado, serio e
animado**. Cada um define fonte, corpo, cor de destaque, palavras por vez,
intervalo de movimento, forca do zoom, mixagem e **respiro do corte**, que e o
que ele chamou de "precisao dos cortes".

No PROJETO e nao no upload, porque canal com estilo diferente a cada video nao
constroi reconhecimento.

O que NAO varia por estilo, porque a pesquisa fixou: legibilidade, alto
contraste e palavra a palavra.

### 4. Legenda palavra a palavra, em ASS com karaoke

`lib/media/legenda-falada.ts`. ASS e nao SRT porque destacar a palavra falada
AGORA exige mudar a cor DENTRO da linha, e SRT nao faz isso. A marca de karaoke
do ASS existe para exatamente isso e o ffmpeg desenha nativo.

Duas armadilhas resolvidas:

- **A marca de karaoke conta em CENTESIMOS de segundo**, nao em segundos. Errar
  a unidade faz a legenda inteira piscar no primeiro quadro.
- **`PrimaryColour` e a cor de quem JA foi falado**, e `SecondaryColour` a de
  quem ainda vem. O karaoke anda da secundaria para a primaria, entao o destaque
  entra em `PrimaryColour`, ao contrario do que o nome sugere.

**E uma decisao contra a pesquisa, de proposito.** Ela manda pôr legenda no
terco inferior central. Medido no corte real: a silhueta ocupa de y=1183 a
y=1870, e a legenda ali caia EM CIMA DA BOCA. A regra existe para desviar do
rosto e da interface do aplicativo; aqui obedecer ao numero violava a intencao.
A legenda foi para acima da cabeca (margem 800), que cumpre os dois objetivos.

### A sacada do Bruno sobre o fundo branco, ainda NAO implementada

> "o recorte do fundo fica com um borrado branco, porque o fundo original era
> branco. O agente deve saber disso: se o fundo original e branco, entao o fundo
> do reels deve ser cinematografico, mas branco, para diminuir o efeito ruim do
> borrado."

**Medido, e ele esta certo:** o anel em volta da silhueta tem brilho 85 e o fundo
ao redor tem 57. O halo e **28 pontos mais claro**, e e o branco da parede
vazando. Casando o brilho do fundo gerado com o do fundo original, o halo perde
contraste e some.

Como fazer: amostrar o brilho do fundo ORIGINAL (a regiao fora da mascara, que o
`recorte.py` ja calcula) e passar essa faixa ao prompt do nano banana.

### O que o Bruno reprovou e ainda esta aberto

- [ ] **Fundo com brilho casado ao original** (a sacada acima)
- [ ] **Qualidade do fundo**: ele chamou de "amador demais, imagem distorcida,
      sem qualidade". O prompt precisa melhorar e o resultado precisa ser
      conferido antes de subir
- [ ] **Efeitos, textos, emoji, sacadas de som** explorando as falas
- [ ] **Tudo isto vale para o VIDEO COMPLETO tambem**, e nao so para os cortes
- [ ] Tela para o cliente escolher o estilo do projeto
- [ ] Ligar a legenda e o estilo no worker: os modulos existem, o fluxo ainda
      nao os usa
- [ ] Musica: decidido que o CLIENTE traz o arquivo (ver parte 47)
- [ ] Ajudar o Bruno a configurar a webcam 4K no OBS

*Atualizado em 24/08/2026 por Claude Code.*


## Sessao 24/08/2026 (parte 50): a legenda ligada, e a fonte que nunca existiu

Pedido do Bruno, item 1 da lista dele: ligar a legenda e o estilo no worker, que
existiam em modulo e nao eram chamados por ninguem.

Ficou ligado, e no caminho apareceu um defeito que anulava os quatro estilos.

### 1. A fonte que o codigo pedia nao existe no conteiner

Antes de escrever qualquer linha, fui olhar o artefato. Baixei o `completo.mp4`
de PRODUCAO (174 MB, 17 MB/s de descida) e varri a faixa de baixo procurando a
caixa laranja do destaque. Achei nove blocos de quatro segundos, exatamente o
que `montarLegendasDestaque` promete. Extrai o quadro e ampliei.

**A legenda estava la, e desenhada em DejaVu Sans Bold. O codigo pedia Arial.**

O `libass` NAO falha quando a fonte pedida nao existe: ele escolhe outra em
silencio. O conteiner e `node:22-bookworm-slim` com ffmpeg do apt, nao tem
nenhuma fonte da Microsoft, e tinha a familia DejaVu de carona numa dependencia.

Isso era detalhe enquanto havia um estilo so. Com quatro estilos vira outra
coisa: eles pediam Georgia, Impact, Arial e Verdana, **nenhuma existe no
Debian**, os quatro sairiam com a MESMA tipografia, e a escolha do cliente nao
mudaria nada na tela.

| Estilo | Pedia antes | Passa a usar | Por que |
|---|---|---|---|
| dramatico | Georgia | **PT Serif Bold** | serifada, para historia pessoal |
| acelerado | Impact | **Anton** | o peso de titulo que virou padrao de corte |
| serio | Arial | **Liberation Sans** | metrica identica a da Arial, e nao remendo |
| animado | Verdana | **Bangers** | desenhada, para bastidor e humor |

As quatro sao OFL e moram em `worker/fontes`, e nao vem do apt. Duas razoes:
uma dependencia de rede a menos no build, e o teste local passa a desenhar com
os MESMOS arquivos que producao, entao quadro conferido aqui vale para la.

Cobertura de acento conferida lendo a tabela `cmap` de cada arquivo: as tres
fontes novas cobrem os 27 caracteres do portugues sem faltar nenhum.

**A prova ficou no Dockerfile, e nao na disciplina.** Mesma ideia da prova do
MediaPipe: `provar-fontes.py` manda o libass escolher de verdade, le a linha
`fontselect:` do log e compara o que foi entregue com o que foi pedido. Se
houver substituicao, **a imagem nao sobe**. Testado contra o caso real antes de
entrar: pedindo Anton nesta maquina ele acusou `ArialMT`, e pedindo Arial ele
aceitou (o libass devolve o nome PostScript, entao a comparacao e por prefixo
sem espacos, senao `PT Serif` contra `PTSerif-Bold` viraria falso positivo).

O `montarLegendasDestaque` do video COMPLETO tambem parou de pedir Arial.

### 2. O corpo fixo errava dos dois lados, medido

Primeiro quadro renderizado: duas linhas empilhadas em alturas diferentes (uma
entrava antes de a outra sair, e o libass empurra a de cima), e letra pequena
demais para telefone.

Medido nas 4.529 palavras da gravacao real:

| Estilo | Antes: mediana da linha | Maior linha | Depois: mediana |
|---|---|---|---|
| dramatico | 42% da largura | 79% | **63%** |
| acelerado | 13% | 47% | **31%** |
| serio | 53% | 85% (vazava) | **75%** |
| animado | 19% | 41% | **37%** |

Corpo fixo grande faz a palavra mais longa vazar, e no modo de uma palavra por
vez a quebra automatica nao salva, porque nao ha espaco onde quebrar. Corpo
pequeno o bastante para a pior palavra caber deixa a MEDIANA em 13%.

**O `corpo` do estilo virou um TETO.** Cada linha entra no maior corpo que ainda
cabe na largura util. A largura sai da tabela `hmtx` das proprias fontes, gerada
para `lib/media/metricas-de-fonte.ts` por `scripts/gerar-metricas-de-fonte.py`.

Media por caractere nao servia: medido, a pior palavra da PT Serif e **42% mais
larga que a media**, e dimensionar pela media estouraria a tela exatamente no
caso que a conta existe para evitar. Depois do ajuste, nenhuma linha passa de
76% em nenhum estilo.

Duas correcoes menores no mesmo caminho: cada bloco fica na tela ate o proximo
entrar (mata o empilhamento e o piscar entre palavras, com teto de 0,8 s para a
pausa longa), e `WrapStyle` passou de 2 para 0, que deixa a quebra automatica
como rede de seguranca em vez de deixar a frase correr para fora do quadro.

### 3. A conta de tempo virou uma so, e isso e o que impede a legenda de andar

O worker deduzia sozinho o que fica no trecho, descartando remocao menor que
0,05 s e pedaco mantido menor que 0,05 s. A legenda descontava TODAS as
remocoes. Diferenca pequena por trecho, e ela ACUMULA.

Agora `intervalosDoTrecho` calcula UMA lista, no app, e ela alimenta as tres
coisas que dependem do tempo: o que o worker emenda, a legenda vertical e a
legenda horizontal. O worker so executa o que recebeu.

**Provado contra o arquivo original**, baixando so o trecho por requisicao de
faixa (`scripts/tmp/provar-sincronia.mts`):

| Medida | Valor |
|---|---|
| duracao que a legenda assumiu | 69,37s |
| duracao medida no arquivo | 69,40s |
| diferenca | **32 ms**, que e um quadro a 30 fps |

### 4. O corpo do pedido saiu da rota, e o script de teste nao pode mais mentir

`scripts/tmp/rodar-corte.mts` ja importava os modulos reais desde 24/08, mas
continuava REESCREVENDO o corpo do pedido. Isso e a mesma familia de erro que
custou caro nos dias 23 e 24.

Virou `lib/media/pedido-de-corte.ts`, chamado pela rota E pelo script. A rota
ficou so com o que e dela: autenticar, tomar o estado no banco e despachar. O
script ficou so com achar o video e assinar.

### 5. O que o estilo muda hoje, e o que ainda nao muda

| Do estilo | Chega no video? |
|---|---|
| fonte, corpo, cor, destaque, palavras por vez, caixa alta | sim |
| `forcaDoZoom` do fundo | sim, substituiu o 4% fixo |
| `respiroDoCorte` | nao, mexe na etapa de SELECAO do trecho |
| `som` | nao, depende da musica, que o cliente traz |
| `intervaloDeMovimento` | nao, so faz sentido com os efeitos |

O estilo mora em `Project.videoStyle` (migration
`20260824153000_estilo_de_edicao_do_projeto`, coluna nula que cai no acelerado).
A TELA de escolha ainda nao existe.

### Verificacao em PRODUCAO, 24/08

Worker publicado com `railway up`, e o build passou, o que ja prova as quatro
fontes dentro do conteiner. Corte rodado contra ele com o codigo real.

| Corte | Duracao | Tamanho | Legenda na tela | Linha mais larga |
|---|---|---|---|---|
| 0 | 62,5s | 10,6 MB | **94% do tempo** | 48% |
| 1 | 57,4s | 9,6 MB | **94%** | 48% |
| 2 | 67,8s | 10,5 MB | **95%** | 48% |
| 3 | 38,9s | 6,4 MB | **88%** | 48% |

Quadro extraido e OLHADO: a legenda sai em Anton, amarela com contorno, acima da
cabeca, sem cobrir o rosto, com o acento desenhado certo.

### O que o quadro mostrou de ERRADO, e nao e a legenda

**O fundo gerado tem uma emenda dentro da propria imagem.** Medido: 768x1376, e
o maior salto de brilho esta na linha **727, que e 53% da altura**. Abaixo dela
a variacao media e de 0,22 por linha, ou seja **47% da imagem e uma area
chapada**. Nao e defeito de composicao, e o modelo obedecendo ao proprio prompt,
que manda "o terco central inferior fica reservado para a pessoa, entao mantenha
essa area calma e sem detalhe". Ele desenhou um retangulo vazio com borda dura.
Some-se a isso que 768x1376 vira 1080x1920 com ampliacao de 1,4x, e esta ai o
"amador demais, imagem distorcida" que o Bruno descreveu. **Diagnostico do item
3 da lista dele, com numero.**

**O halo branco piorou, e isso confirma a sacada dele.** Medido no corte novo: o
anel em volta da silhueta tem brilho 136 e o fundo ao redor 91, ou seja **45
pontos de diferenca**, contra 28 na medicao de ontem. Piorou porque o fundo novo
e mais escuro, que e exatamente o mecanismo que ele descreveu: o halo e o branco
da parede vazando, e quanto mais escuro o fundo gerado, mais ele aparece.
**Casar o brilho e o item 2 da lista dele, e o numero agora e maior.**

**A mascara vaza na base.** No quadro do corte 3 aparecem, embaixo, uma faixa
clara e um objeto do lado esquerdo: a borda inferior da janela da webcam entra
no maior componente conectado junto com a pessoa.

### Aberto nesta frente, na ordem que o Bruno pediu

- [ ] Fundo com brilho casado ao original (item 2, e a medicao subiu para 45)
- [ ] Qualidade do fundo (item 3): tirar do prompt a instrucao que produz a area
      chapada, e pedir resolucao maior que 768x1376
- [ ] Efeitos, emoji e som saindo da fala (item 4)
- [ ] Tudo isso no VIDEO COMPLETO tambem (item 5)
- [ ] Tela para escolher o estilo do projeto (item 6)
- [ ] Mascara vazando na base do recorte (achado hoje)
- [ ] Configurar a webcam 4K no OBS quando o Bruno avisar

*Atualizado em 24/08/2026 por Claude Code.*

## Sessao 24/08/2026 (parte 51): o brilho do fundo, e o prompt que cavava um buraco

Itens 2 e 3 da lista do Bruno, feitos juntos porque compartilham o mesmo arquivo
e o mesmo ciclo de verificacao: cada rodada em producao leva meia hora e custa
geracao de imagem.

### 1. A sacada dele valia mais do que parecia

Ele disse em 24/08: "o recorte do fundo fica com um borrado branco, porque o
fundo original era branco. O agente deve saber disso: se o fundo original e
branco, entao o fundo do reels deve ser cinematografico, mas branco".

**Medido no arquivo original: a parede da gravacao tem brilho 241 de 255. O
fundo gerado tinha 49.**

A borda da mascara e semitransparente por construcao, entao cada pixel dela
mistura a pessoa com o que estava atras dela. Com quase 200 pontos de diferenca
entre a parede e o fundo novo, essa mistura vira um anel gritante. Medido no
corte de producao de hoje: anel em 136 contra 91 do fundo ao redor.

Casar o brilho nao melhora o recorte. Ele tira do halo o contraste que o faz
aparecer, que e atacar a causa em vez do sintoma.

### 2. Onde medir, e por que o fundo mudou de lugar no fluxo

Para medir a parede e preciso saber ONDE a pessoa esta, e quem diz isso e o
agente de visao. Ate hoje o fundo era gerado antes de despachar o trabalho, e
naquele momento essa informacao ainda nao existe.

O fundo passou para a rota `/enquadrar`. **E o unico ponto do fluxo em que a
caixa da pessoa e os pixels do quadro existem ao mesmo tempo.** Qualquer outro
lugar exigiria uma ida e volta a mais entre o app e o worker.

**Como o numero atravessa a fronteira.** Os pixels estao no worker; o fundo e
gerado no app, porque a conta de IA do projeto vive num lugar so. O app nao tem
como decodificar JPEG: nao ha biblioteca de imagem nas dependencias, e
acrescentar uma por causa de um numero seria caro. Entao o worker manda o quadro
ja decodificado e reduzido a 128x72 em tons de cinza, 9 KB por trecho, nenhuma
dependencia nova dos dois lados. A grade nao chega no modelo de visao: ele so le
`quadros`, entao nao ha custo de token.

**Mede o ANEL, e nao a caixa.** A caixa que o agente devolve e a janela da
webcam, e a pessoa ocupa cerca de 60% dela.

| O que se mede | Brilho |
|---|---|
| caixa inteira | 198 |
| **anel externo, sem a faixa de baixo** | **241** |

E o 241 que a borda da mascara mistura. A faixa de baixo fica de fora porque ali
esta a mesa, o teclado ou o peito.

**Conferido antes de confiar**, com o codigo real dos dois lados: o anel medido
na grade de 128x72 da **243** contra **241** no pixel cheio. Dois pontos de erro
em 255. Caixa pequena demais devolve `null` em vez de inventar numero.

### 3. O que sobra e corrigido em ffmpeg, com limite

O modelo chega perto e nao acerta. Medido, pedindo fundo claro para um alvo de
241: ele devolveu **194** numa tentativa e **207** na outra.

O worker mede o que veio e empurra o resto com `eq=brightness`, no maximo **25
pontos**. O limite existe porque a alternativa e pior que o problema: empurrar um
fundo de 150 ate 241 lavaria a imagem inteira e destruiria a profundidade, que e
o motivo de gerar fundo em vez de usar cor solida.

Quando o limite morde, o log diz quanto sobrou. Isso importa: residuo grande quer
dizer que o PROMPT errou o alvo, e o conserto e la e nao na correcao.

### 4. O "amador demais" era culpa do nosso prompt

O Bruno viu o primeiro fundo e disse "amador demais, uma imagem distorcida, sem
qualidade". Diagnosticado com numero: 768x1376, maior salto de brilho na linha
727, que e 53% da altura, e abaixo dela variacao media de 0,22 por linha.
**Quase metade da imagem era area chapada com borda dura atravessando o quadro.**

Nao era o modelo. O prompt mandava "o terco central inferior fica reservado para
a pessoa, entao mantenha essa area calma e sem detalhe", e ele obedeceu ao pe da
letra desenhando um retangulo vazio.

**A troca que resolveu: dizer o que a fotografia E, em vocabulario de fotografia,
em vez de proibir conteudo numa regiao.** Lente de 85mm em f/1.8, parede de fundo
a tres ou quatro metros, e a metade de baixo como superficie continua fora de
foco. "Superficie continua fora de foco" produz um piso desfocado; "mantenha essa
area sem detalhe" produz um buraco.

Medido, mesmo assunto, quatro geracoes:

| Prompt | Tamanho | Brilho | Linhas chapadas | Maior salto |
|---|---|---|---|---|
| antigo, padrao | 768x1376 | 49 | 13% | 13 |
| antigo, 2K | 1536x2752 | 61 | 5% | 17 |
| **novo, 2K** | **1536x2752** | **194** | **0%** | 12 |
| **novo, 2K (2a)** | **1536x2752** | **207** | **0%** | 11 |

### 5. A resolucao: o codigo nunca pediu tamanho nenhum

`tryGeminiFlashImage` mandava `generationConfig` sem `imageConfig`, entao o
modelo devolvia o padrao de 768x1376. Para um corte de 1080x1920 isso e ampliar
1,4 vezes, e ampliacao amolece, que e a outra metade do "sem qualidade".

Medido em 24/08, mesmo prompt e mesmo modelo:

| imageConfig | Saida | Bytes | Tempo |
|---|---|---|---|
| nenhum | 768x1376 | 608 KB | 10,5s |
| **2K** | **1536x2752** | **2,4 MB** | **13,6s** |
| 4K | 3072x5504 | 7,6 MB | 22,8s |

Depois de reduzir para 1080 de largura, 2K e 4K ficam iguais aos olhos, entao 4K
seria pagar tres vezes a transferencia por nada. **2K e o menor tamanho que
dispensa ampliacao**, e entrou como `quality: "hd"`.

*Atualizado em 24/08/2026 por Claude Code.*

### Verificacao em PRODUCAO, 24/08, com quadro olhado

Rodado de ponta a ponta com o codigo real, app na Vercel e worker no Railway.

**A cadeia inteira funcionou, e o log conta a historia:**

    [cmt4p8cdc...] fundo com brilho 205, alvo 218, corrigindo 13 ponto(s)

O app mediu a parede em 218 (mediana dos quatro trechos), o modelo devolveu 205,
e o worker fechou os 13 que faltavam, dentro do limite de 25.

**O halo, que era o alvo:**

| | Anel em volta da silhueta contra o fundo ao redor |
|---|---|
| antes (fundo escuro) | **+45 pontos**, o anel saltava |
| agora (fundo casado) | **+6 e +7 pontos** de mediana nos dois cortes medidos |

Isso e 85% do halo removido, e o que sobra esta abaixo do que o olho separa numa
tela de telefone. A pior linha de um dos cortes ainda da +72, que e um reflexo
pontual e nao um anel.

**Os quatro cortes:**

| Corte | Duracao | Tamanho | Legenda na tela | Linha mais larga |
|---|---|---|---|---|
| 0 | 62,9s | 9,5 MB | **100% do tempo** | 59% |
| 1 | 57,9s | 9,1 MB | **100%** | 60% |
| 2 | 71,3s | 10,3 MB | **100%** | 62% |
| 3 | 38,9s | 6,1 MB | **100%** | 59% |

**O medidor teve que ser consertado junto, e a licao vale registrar.** Ele
procurava a legenda por BRILHO, o que funcionava enquanto o fundo era escuro.
Com o fundo claro, a faixa inteira passou do limiar e ele respondeu "legenda em
100% do tempo ocupando 100% da largura", que e o sintoma classico de metrica
medindo o cenario em vez do produto. Passou a procurar a COR: o fundo e neutro e
a legenda do estilo acelerado e amarela. Conferido depois da troca: o quadro com
MENOS amarelo tem 61 pixels contra mediana de 1.735, entao a legenda esta la em
todos, e nao e a madeira do fundo enganando a conta.

### O que o quadro novo cobrou

**A pessoa nao esta centralizada.** A composicao centraliza a CAIXA da webcam, e
a pessoa nao fica no meio da propria janela: no quadro medido a cabeca dele
aparece cerca de 100 px a esquerda do centro, que e 10% da largura. O conserto e
o `recorte.py` devolver o centro horizontal da MASCARA junto da caixa apertada,
e a composicao alinhar por ele. Virou card.

**A mascara continua vazando na base**, com uma faixa clara e um objeto do lado
esquerdo. Card ja aberto.

*Atualizado em 24/08/2026 por Claude Code.*

## Sessao 24/08/2026 (parte 52): a lista fechada

Itens 4, 5 e 6 do Bruno, mais os dois defeitos que o quadro de producao cobrou.

### 1. Os efeitos saem da fala, e o teto e baixo de proposito

Um agente le a transcricao do corte e devolve poucos momentos, cada um com um
emoji OU uma frase de destaque de ate quatro palavras.

**Ele devolve a PALAVRA e nao o segundo.** E a regra que resolveu a abertura e o
fim do corte: onde ha texto e numero sobre a mesma coisa, o texto manda. Ancora
que nao existe na fala vira efeito NENHUM, e nao efeito no lugar errado.

**Um efeito a cada 8 segundos, no maximo.** A pesquisa aponta mudanca visual a
cada 1,5 a 2 segundos, e e tentador ler isso como "poe um efeito a cada dois
segundos". Seria o caminho mais rapido para um video cansativo. A legenda
palavra a palavra JA cumpre esse alvo sozinha, trocando de duas a tres vezes por
segundo; o que falta e mudanca de ATENCAO, e ela nao se faz em cadencia de
metronomo.

### 2. O emoji entra como imagem, e isso foi medido

| Fonte tentada | Formato | Resultado |
|---|---|---|
| a do sistema (Segoe UI Emoji) | COLR | desenha, **sem cor**, so contorno |
| Noto Color Emoji | CBDT | o libass **nem escolhe**, cai para a Arial |

Entao o emoji e sobreposto como PNG. A paleta e fechada: 24 arquivos de 128 px
do projeto Noto Emoji sob Apache 2.0, 144 KB no total.

Fechada de proposito e nao por limitacao: da ao canal do cliente um vocabulario
visual constante em vez do que o modelo lembrar naquele dia, e tira do caminho o
emoji de rosto, que competiria com o rosto que ja esta na tela. Emoji fora da
paleta e DESCARTADO e nao substituido, porque reforco errado e pior que reforco
nenhum.

### 3. O som: o video tocava 13 dB abaixo do feed

Medido no corte de producao de 24/08:

| | |
|---|---|
| o que a Demandou entregava | **-27,2 LUFS** |
| o padrao que Instagram, TikTok e YouTube usam para nivelar | **-14 LUFS** |

Treze decibeis abaixo de tudo o que vem antes e depois na rolagem. Quem assiste
sem fone nao ouve, e sobe.

Isso nao e trilha nem efeito sonoro, nao depende de licenca de ninguem, e nao e
acabamento: e um defeito que saia em todo corte. `loudnorm=I=-14:TP=-1.5:LRA=11`
entra no vertical, no horizontal e no completo quando ja ha recodificacao. O
`TP=-1.5` deixa margem de pico porque as redes recomprimem o audio, e som que
encosta em zero volta distorcido do outro lado.

### 4. O video completo leva os reforcos, e NAO leva a legenda continua

As frases de destaque e os emoji entram no completo, com a fonte do estilo.

**A legenda palavra a palavra nao entra, e isso e decisao do Bruno de 23/08 e
nao esquecimento:** "legenda em tudo polui o video longo e compete com quem
fala". Os reforcos aqui sao pontuais e nao brigam com essa regra. Registrado
como decisao para ninguem "consertar" depois; se ele quiser inverter, e um
parametro.

### 5. A tela de estilo

Na tela de video e acima do envio, porque o estilo decide como editar e po-lo
depois seria pedir para o cliente escolher como editar um video ja editado.

Cada opcao mostra o proprio nome NA FONTE do estilo, porque a diferenca entre os
quatro e sobretudo tipografica e uma lista de nomes pediria adivinhacao. A tela
diz que a fonte ali e aproximacao, porque as de verdade vivem no conteiner do
worker e nao no navegador. Prometer o pixel exato numa previa que nao e o video
seria a mesma familia de erro que medir o encanamento e chamar de produto
pronto.

### 6. O MediaPipe passou a rodar na maquina de desenvolvimento

Foi o que permitiu diagnosticar os dois defeitos abaixo por medicao em vez de
adivinhacao. `pip install mediapipe` mais o modelo baixado para a pasta
temporaria, e o `recorte.py` roda local sobre a gravacao real.

Isso muda o custo de investigar recorte: antes cada hipotese custava um deploy e
meia hora de corte em producao.

### 7. A pessoa nao ficava centralizada

A composicao centralizava a CAIXA da webcam, e a pessoa nao fica no meio da
propria janela. Com o fundo escuro isso passava despercebido; com o fundo claro
ficou evidente.

O `recorte.py` passa a devolver o centro horizontal da mascara, medido **so na
metade de cima**, que e onde esta a cabeca: a metade de baixo e justamente onde
a mesa entra na mascara e puxaria o centro para o lado errado. E a MEDIANA do
trecho, e nao o valor de cada quadro, porque alinhar quadro a quadro faria a
pessoa deslizar de lado toda vez que ela se mexesse.

| | Desvio da cabeca em relacao ao centro da tela |
|---|---|
| antes | **-78 px** |
| depois | **-24 px** |

### 8. A faixa clara na base: tres tentativas, duas descartadas por medicao

Causa, medida com o modelo real: **o maior componente conectado nao e a pessoa**,
e a pessoa mais a mesa na frente dela e mais um objeto ao lado, porque o ombro
encosta nos dois e o segmentador liga tudo. Num quadro de oito amostrados, a
base da mascara mede 408 px contra 209 do tronco, ou seja 1,95 vezes, e
atravessa a caixa inteira. Nos outros sete ela se comporta, e a media entre
quadros do `recorte.py` espalha o defeito do quadro ruim para todos.

| Tentativa | Resultado medido |
|---|---|
| zerar tudo abaixo da linha ofensora | levava **44% da mascara** junto, inclusive o peito |
| erodir para quebrar a ponte | nao quebra: a ligacao e larga, nao fina. Com raio 13 a pessoa some antes |
| **transparencia gradual na base** | excesso cai de **+17 para +13** pontos sobre o fundo |

Ficou a terceira. Ela nao resolve por completo, e isso esta escrito no codigo em
vez de escondido: o que resolveria e trocar o modelo pelo `selfie_multiclass`,
que separa cabelo, pele e roupa em vez de devolver um bloco so. A base da pessoa
JA e cortada pela borda do quadro na composicao, entao a transparencia ali nao
perde conteudo: troca uma linha dura, que o olho le como recorte mal feito, por
uma passagem suave.

### A primeira rodada quebrou em dois lugares, e os dois erram calados

O corte de producao com tudo ligado falhou em dois pontos, e vale registrar
porque nenhuma das duas mensagens de erro menciona a causa.

**1. Um corte de quatro morreu no codificador.**

    Error while opening encoder for output stream 0:0
    maybe incorrect parameters such as bit_rate, rate, width or height

Nada ali fala de emoji nem de overlay. A causa: o fluxo do emoji era CURTO e
atrasado com `setpts`, ligado por `enable`. O `overlay` precisa de um quadro do
fluxo secundario para se configurar, e um fluxo que so passa a existir la na
frente e um convite a esse tipo de falha.

O detalhe que fecha o diagnostico: **passou no ffmpeg 9 da maquina de
desenvolvimento e quebrou no 5.1 do conteiner**, e so no unico corte cujo
primeiro emoji entrava perto do comeco, a 1,94s. Os outros tres, com o primeiro
emoji a 8s, 10s e 24s, passaram. Mesmo codigo, mesma paleta, quatro cortes, um
morto.

O conserto inverte o desenho: o fluxo do emoji cobre o video INTEIRO e quem faz
ele aparecer e sumir e o alpha. O `overlay` sempre tem quadro, e a aparicao vira
conta de alpha, que nao depende de sincronia.

**2. O video completo morreu com um erro que dizia exatamente o motivo.**

    -vf/-af/-filter e -filter_complex nao podem ser usados juntos
    para o mesmo fluxo

O audio do completo sai do `concat`, ou seja de dentro do grafo, e eu pedi
`-af loudnorm` por fora. Duas donas para o mesmo fluxo. A nivelacao passou para
dentro do grafo.

**3. E uma cor trocada, que so o teste local pegou.**

A composicao ja terminava em `format=yuv420p`, e o emoji passou a entrar DEPOIS
disso, com um fluxo rgba. Sem devolver o formato no fim, o codificador escolhia
outro, e o simbolo de aviso saia **verde e roxo** em vez de amarelo e preto.

Este nao teria aparecido em nenhum log: o arquivo sai valido, com duracao certa
e sem erro. So aparece olhando. Foi pego porque o teste local extrai o quadro e
compara com o esperado, que e a mesma regra que este projeto ja aprendeu duas
vezes.

O codificador do corte passou a exigir `-pix_fmt yuv420p` tambem, para o dia em
que alguem mexer no grafo e esquecer o formato no fim: sem isso o video sai num
formato que metade dos aparelhos nao decodifica, e o sintoma vira "o video nao
abre no celular dele".

*Atualizado em 24/08/2026 por Claude Code.*

## Sessao 24/08/2026 (parte 53): o fundo estava sem foco por prompt, e estourado por minha conta

O Bruno olhou os cortes e disse que a imagem do fundo estava pessima, e fez a
pergunta certa: "quando eu peco para ele gerar a imagem no chat do Gemini o
resultado e bem melhor, o que sera que esta pegando aqui?"

Nao era o modelo. Eram duas coisas nossas, e as duas viraram numero.

### 1. O prompt pedia uma imagem SEM FOCO

Ele dizia "85mm em f/1.8, o fundo inteiro suavemente desfocado". E o vocabulario
certo para retrato e o errado para isto: **uma foto em que NADA esta nitido nao
parece profundidade de campo, parece resolucao baixa.**

A medida que expoe isso nao e a nitidez media, e o BLOCO MAIS NITIDO da imagem:
ele diz se existe algum plano em foco. Medido com o mesmo modelo e o mesmo
assunto:

| Prompt | Bloco mais nitido |
|---|---|
| f/1.8, fundo inteiro desfocado | **2,23** |
| f/4 com a parede em foco | **14,98** |
| nitida de ponta a ponta | 12,23 |

Seis vezes e meia mais detalhe, sem trocar de modelo e sem custar um centavo a
mais. Ficou o f/4 e nao o "nitido de ponta a ponta": um pouco de desfoque no que
esta muito a frente e muito atras ainda da profundidade, e a diferenca de
nitidez entre os dois e pequena.

### 2. O MODELO nao era a causa, e isso valia medir antes de trocar

A tentacao era ir direto para o Nano Banana Pro, que e o que ele usa no chat.
Medido, mesmo prompt:

| Modelo | Bloco mais nitido | Custo por imagem |
|---|---|---|
| gemini-3.1-flash-image-preview | **8,15** | US$ 0,039 |
| gemini-3-pro-image-preview | 4,56 | US$ 0,134 |

**O Pro custa 3,4 vezes mais e nao e mais nitido.** Trocar teria gastado mais
para nao resolver nada, e teria escondido a causa real por tras de uma melhora
que nao existiria.

A diferenca que o Bruno sente no chat do Gemini nao vem do modelo, vem do
pedido: conversando com ele, ninguem manda desfocar tudo.

### 3. A minha correcao de brilho estava estourando a imagem

Somar brilho com `eq=brightness` e a ferramenta errada para clarear uma imagem
que JA e clara: ela empurra o que estava perto do teto para fora dele.

Medido na imagem que foi ao ar:

| | Brilho | Area estourada |
|---|---|---|
| a imagem gerada | 205 | **0,4%** |
| depois do `eq=brightness=+23` | 226 | **16,0%** |

Dezesseis por cento do quadro virou branco puro, sem textura nenhuma. Isso e
metade do "imagem pessima" que ele viu.

**Trocado por GAMA.** A curva de gama leva 0 em 0 e 255 em 255, entao ela
clareia o meio-tom sem NUNCA estourar:

| | Brilho | Area estourada |
|---|---|---|
| `eq=brightness=+23` | 226 | 16,0% |
| `eq=gamma=1.7` | 224 | **0,9%** |

Praticamente o mesmo ganho de brilho, com dezoito vezes menos estouro.

**E ganhou um limiar.** Medido no corte de producao: com 23 pontos de diferenca
entre o fundo e a parede, o halo ficou em +6, que ja e menos do que o olho
separa numa tela de telefone. Abaixo de 20 pontos a correcao nao tem o que
consertar, e mexer na imagem sem ganho e so risco.

### A licao, que vale alem deste caso

Duas vezes seguidas nesta sessao a causa de um defeito visual estava numa
instrucao NOSSA que o modelo obedeceu ao pe da letra:

- "mantenha essa area calma e sem detalhe" virou um retangulo vazio
- "o fundo inteiro suavemente desfocado" virou uma imagem sem foco nenhum

Nos dois casos a suspeita natural era o modelo, e nos dois a medicao apontou
para o prompt. **Antes de trocar de fornecedor, vale ler o que a gente pediu.**

*Atualizado em 24/08/2026 por Claude Code.*

## Sessao 24/08/2026 (parte 54): o Bruno simplificou o produto, e ele estava certo

No meio da caca ao bug do emoji, o Bruno cortou o no:

> "que loucura, acho que estamos complicando demais, era para ser uma edicao
> simples, com legenda que o usuario escolhe e com musica que o usuario escolhe,
> se tudo isso e por causa dos emoctions, remova. pense que preciso entregar
> isso hoje ainda"

Ele estava certo, e a conta e simples: o emoji derrubou o MESMO corte tres vezes
em producao, com tres construcoes diferentes do overlay, sempre com um erro que
nao o menciona. O que ele custou em rodadas de meia hora ja tinha passado do que
ele vale como acento.

### O que saiu e o que ficou

SAIU: o emoji sobreposto, nos cortes e no completo. O codigo do overlay fica no
worker, inerte, com a rede de seguranca que refaz o corte sem emoji se alguem
religar um dia.

FICOU, e e o produto que ele descreveu:
- legenda palavra a palavra, no estilo que o usuario escolhe na tela
- a frase de destaque que sai da fala (viaja dentro da legenda, nunca falhou)
- fundo gerado casado ao brilho da gravacao, nitido depois do prompt f/4
- volume nivelado a -14 LUFS
- musica: o usuario traz o arquivo, como decidido em 23/08

A mudanca foi so no app: o worker trata lista vazia como "nada a sobrepor".

### A rede de seguranca pagou o proprio custo na primeira rodada

A rodada que estava no ar quando ele decidiu ja levava a rede: se o corte
falhar com emoji, refaz sem. O log mostrou ela agindo:

    trecho 0 falhou COM emoji, tentando sem: ffmpeg saiu com 1: Error
    initializing output stream...

E o resultado da rodada, a primeira PERFEITA do dia:

| Artefato | Resultado |
|---|---|
| corte 0 | 62,2s, legenda 100% do tempo, linha mais larga 74% |
| corte 1 | 59,1s, 100%, 74% |
| corte 2 | 69,2s, 100%, 79% |
| corte 3 | 38,5s, 100%, 73% |
| video completo | 172 MB, presente |
| erros | nenhum |

Quadro extraido e olhado: fundo claro e nitido, halo invisivel, legenda grande
em Anton, pessoa perto do centro.

### O bug do emoji, para quem retomar

Nunca foi diagnosticado ate o fim, e nao precisa mais ser. O que se sabe, para
o caso de alguem religar: mesmo trecho, tres construcoes de overlay diferentes,
sempre "Error while opening encoder... width or height", so no ffmpeg 5.1 do
conteiner, nunca no 9 local, e so no trecho cujo primeiro emoji entra perto do
comeco. O grafo agora entra na mensagem de erro quando um corte falha, entao a
proxima investigacao comeca com o dado que faltou nestas tres.

### O placar do dia inteiro

A lista de seis itens do Bruno, fechada: legenda e estilo no worker (com a
descoberta da fonte que o libass substituia em silencio), fundo com brilho
casado (halo de +45 para +6), qualidade do fundo (duas causas nossas: prompt
pedindo desfoque total e correcao de brilho estourando 16% da imagem), efeitos
da fala (frases ficaram, emoji saiu por decisao dele), tudo no video completo,
e a tela de estilo. Mais: centralizacao pela mascara (78 para 24 px), a mascara
com transparencia na base, prova de fumaca do worker (8 caminhos de ffmpeg em
segundos), e prova de fontes na construcao da imagem.

*Atualizado em 24/08/2026 por Claude Code.*

## Sessao 24/08/2026 (parte 55): o Bruno assistiu, e as tres criticas viraram medida

Ele perguntou: "voce leu a transcricao ou viu o inicio do video?" A resposta
honesta era nao. Eu tinha medido cobertura de legenda, halo, nitidez e formato
de pixel, e nao tinha LIDO o que os cortes falam. E o mesmo erro do dia 23
("medi o encanamento em vez de assistir"), repetido com instrumentos mais
sofisticados.

### 1. "Eu, eu, eu": o agente de limpeza nao pega repeticao, e codigo pega

Lendo os cortes apareceu o que ele ouviu: "Eu, eu, eu sempre tive algo que eu,
que eu gostaria", "faz parte da, de de de mercado", "ele ele ele tem a
necessidade". A regra 3 do prompt de limpeza JA pedia isso ao agente.

Medido na gravacao real: o agente deixou passar **93 palavras repetidas e 12
expressoes repetidas, 40 segundos de copias**.

Repeticao imediata e aritmetica sobre a transcricao, nao julgamento.
`detectarRepeticoes` acha A-A e A-B-A-B pelos tempos, fica com a ULTIMA
ocorrencia (e ela que emenda na fala que continua) e respeita pausa grande
entre as copias, que costuma ser retomada legitima.

Verificado no que vai ao ar depois da rodada: cortes 0, 2 e 3 com ZERO
repeticoes, corte 1 com uma ("ele ele" com pausa acima do limiar). A remocao
total subiu de 126s para 146s.

### 2. "Por que uma casa de fundo?": porque o prompt pedia uma casa

A visao dele: "a ideia do fundo com nano banana e ter uma arte incrivel,
irresistivel, profissional, um design de verdade, esta parecendo fundo de
reuniao do teams".

Ele descreveu exatamente o que o prompt pedia: "um ambiente real de trabalho".
Sala fotorrealista atras de pessoa recortada E fundo de Teams.

O prompt virou uma peca de DESIGN: abstrata, nas cores da MARCA do projeto
(Project.colorPalette, no caso o verde esmeralda, o escuro e o menta do Fluxo
Criativo), com a direcao de arte vindo do ESTILO de edicao:

| Estilo | Direcao de arte |
|---|---|
| acelerado | formas geometricas grandes e ousadas, assimetricas |
| dramatico | luz cinematografica, veus e feixes em diagonal |
| serio | gradiente de estudio minimalista, quase monocromatico |
| animado | formas organicas leves com transparencias |

Tres direcoes foram geradas e OLHADAS antes de escolher. O brilho segue casado
ao da gravacao (a regra do halo) e o centro fica calmo para a pessoa e a
legenda. O nicho saiu do prompt: arte de marca nao precisa "sugerir
empreendedorismo", precisa ter as cores do canal.

Verificado no quadro da rodada nova: arte de marca entrou, halo invisivel
contra o fundo claro, composicao limpa.

### 3. "As escolhas": a parte que NAO mudou, dita com todas as letras

A selecao dos trechos e a mesma. O corte 0 continua abrindo com "hoje eu nao
tenho salario fixo" e terminando em "e software as a service", porque a selecao
nao foi refeita. Os trechos estao mais limpos, mas sao os mesmos trechos, com
as notas 6 e 7 que o especialista deu.

O diagnostico do especialista sobre a materia-prima continua valendo: a
gravacao nao fecha ideias. As opcoes registradas para o Bruno decidir depois de
assistir: regua mais dura na selecao (so nota 7 para cima, o que provavelmente
devolve 2 cortes em vez de 4), ou a gravacao nova em tela cheia, que ataca a
causa.

### O padrao de método que esta sessao cobrou duas vezes

A verificacao tem que chegar ate o CONTEUDO, nao so ate o artefato. Duracao,
formato, cobertura de legenda e nitidez dizem se o encanamento funciona; nao
dizem se o video presta. Ler a transcricao do corte antes de declarar pronto
passa a ser parte da verificacao, tao obrigatoria quanto extrair o quadro.

*Atualizado em 24/08/2026 por Claude Code.*

## Sessao 24/08/2026 (parte 56): o reset pragmatico no ar, e o que ele ensinou

O Bruno cortou o no de vez: "vamos precisar ser mais pragmaticos aqui, se nao
nunca vamos sair disso". E perguntou a pergunta que desmontou tres dias de
premissa: "qual a referencia que voce esta usando? parece que nunca assistiu um
reels na vida".

A resposta honesta: a referencia era prompt inventado a partir de pesquisa em
texto. O formato que o mercado inteiro usa em corte de fala (OpusClip, CapCut,
todo canal grande) nunca foi recortar a pessoa e colar numa arte gerada. E o
video REAL da pessoa, fundo real, cortado em 9:16 no rosto, legenda grande.

### O que saiu do fluxo em uma noite

| Peca | Por que saiu | O que morreu junto |
|---|---|---|
| fundo gerado por IA | tres artes reprovadas; premissa errada | halo, gosto de arte, uma geracao de imagem por video |
| recorte da pessoa (mascara) | so existia por causa do fundo | mascara vazando, descentralizacao, 13s por corte |
| emoji sobreposto | derrubou o mesmo corte tres vezes | a caca ao bug do encoder |
| ganchos de abertura do completo | video abria com palavra solta sem contexto | |

Todo o codigo fica no repositorio, desligado e documentado, para religar quando
valer (recorte como recurso premium, ganchos quando a selecao garantir frase
que se sustenta sozinha).

### O que ficou, que e o produto que o Bruno descreveu

Video real cortado na regiao da pessoa, legenda palavra a palavra no estilo do
projeto, limpeza de fala completa (pausas, agente, repeticoes por codigo),
frases de destaque, volume nivelado, e musica o usuario traz.

### Os dois ajustes que o primeiro quadro do formato novo cobrou

1. **A barra do app aparecia no corte** (VOLTAR/RECOMECAR): a caixa da pessoa
   que o agente de visao devolve inclui a interface abaixo da webcam. O corte
   central passou a aparar 12% da base da caixa.
2. **A legenda caia no rosto**: a margem 800 (acima da cabeca) valia para a
   composicao antiga com a pessoa pequena embaixo. Voltou ao terco inferior
   classico (380), que e onde o mercado poe.

E o medidor de legenda envelheceu pela TERCEIRA vez no dia: varria a faixa da
margem antiga e reportou 17% de cobertura onde havia 90%. Corrigido o medidor,
os quatro cortes dao 90 a 96% de cobertura com linha mais larga em 48%.

### Verificado no quadro final

Sem barra de botoes, sem halo, fundo real, pessoa grande, legenda no terco
inferior. Duas limitacoes honestas que ficam: a imagem e macia porque a webcam
da gravacao tem 422px e vira 1080 (2,56x de ampliacao, resolve com a gravacao
4K em tela cheia que o Bruno planeja), e a legenda ocasionalmente mostra uma
muleta sozinha ("E,") que o agente de limpeza nao marcou.

### As perguntas do Bruno que merecem registro

**"Nao tem biblioteca pronta?"** Para o visual, a biblioteca e o formato do
mercado, que agora e copiado. Para renderizacao existem (Remotion), mas
renderizar nunca foi o que falhou: o ffmpeg entregou tudo que foi pedido. O que
falhou foi O QUE era pedido.

**"Quer que eu rode no Codex?"** Sem objecao; a sugestao registrada foi validar
o reset primeiro, porque a limitacao era de premissa e nao de modelo, e se a
selecao continuar fraca, testar A/B o prompt de selecao la contra o daqui.

*Atualizado em 24/08/2026 por Claude Code.*

## Sessao 24/08/2026 (parte 57): os tres pedidos do completo, e o vilao do dia ganha nome

O Bruno assistiu o completo e trouxe tres pontos.

### 1. "Peguei um 'e eeeee' no inicio. Voce eliminou a edicao?"

Nao: a limpeza rodou (137,5s removidos naquela rodada). O que houve: o agente
marca a maioria das hesitacoes e deixa escapar algumas, e a que escapou estava
na abertura, onde mais doi.

Fomos ao dado, e ele decide sozinho: o "e," muleta aos 5,6s dura **0,48s**; o
"e" verbo de "essa e uma decisao" dura **0,10s**. A folga e enorme, entao virou
codigo: som de hesitacao ("e", "eh", "ah", "hum") com 0,38s ou mais SAI, sempre.

Provado na gravacao real antes de subir: **43 muletas arrastadas, 22,1s**,
incluindo a exata que ele ouviu, e nenhum som curto pego por engano.

### 2. "Toda vez que limpar, dar um efeito para a transicao ficar sutil"

Punch-in alternado, o tratamento padrao de jump cut: a cada emenda o
enquadramento alterna entre o plano normal e um 5,5% mais fechado, e o pulo
vira corte de camera intencional. 5,5% porque acima de ~8% vira zoom nervoso e
abaixo de ~4% o olho nao registra.

**Entrou nos cortes e FALHOU no completo**, e a falha fechou o diagnostico que
faltava o dia inteiro (abaixo).

### 3. "Se a pessoa aparece numa janela pequena, o agente deve dizer"

O worker mede a ampliacao que o corte vertical exige (1080 dividido pela
largura real da regiao da pessoa). Acima de 2x, o aviso entra no DIAGNOSTICO
do video, anexado ao do especialista: quantas vezes ampliou, por que perde
nitidez, e que tela cheia resolve. Na gravacao do Bruno: 2,6x.

### O vilao do dia, finalmente com nome

O punch-in no completo morreu com o MESMO erro do emoji:

    Failed to configure output pad on Parsed_scale_216
    Error reinitializing filters!

Isso fecha o diagnostico: **nunca foi o `movie=`**. A gravacao CRUA do cliente
muda de propriedade no meio do arquivo; quando muda, o ffmpeg reinicializa o
grafo; e qualquer grafo com nos de `scale`/`crop` sobre a entrada crua morre na
reinicializacao. O emoji caiu tres vezes por isso. O punch-in do completo caiu
pela mesma razao na primeira tentativa.

A regra que fica para qualquer trabalho futuro neste worker:

- **Entrada crua**: so `trim`/`concat` e filtros de audio. Nada de scale, crop,
  overlay ou subtitles em grafo complexo sobre ela.
- **Intermediario recodificado pelo proprio worker**: qualquer coisa, provado
  com punch-in, legenda, mascara e overlay nos cortes.
- Se o completo um dia ganhar um passe de normalizacao, punch-in e efeitos
  podem voltar nele.

*Atualizado em 24/08/2026 por Claude Code.*

## Sessao 25/08/2026, madrugada (parte 58): o agente sem caixa, e a defesa em camadas

A rodada com as tres correcoes voltou mostrando o SLIDE nos cortes. O
enquadramento guardado no banco contou o porque: o agente de visao DESCREVEU a
webcam no motivo dos quatro trechos ("webcam pequena do apresentador no canto
inferior direito") e devolveu pessoa null nos quatro. Os mesmos quadros deram
caixa nas rodadas anteriores. Nao determinismo puro, derrubando a composicao
que dependia da caixa.

### A defesa em camadas que ficou

1. **Prompt**: no caso misto, a caixa da pessoa e OBRIGATORIA sempre que houver
   webcam visivel, por menor que seja. (Na rodada seguinte o agente devolveu a
   caixa exata: x 0,775 contra 0,775 real.)

2. **Deteccao deterministica**: se o agente nao devolver, o `recorte.py` ganha o
   modo "caixa", que acha a pessoa pela regiao que SE MEXE entre quadros
   distantes, sem modelo. Provado no video real: erro de 0,2% na posicao. Os
   minimos de area viraram parametro, porque o piso de 15% calibrado para a
   caixa apertada rejeitava uma webcam legitima de 6% do quadro inteiro.

3. A caixa achada e a regiao do rosto (o que se mexe), e um 9:16 so dela seria
   8x de ampliacao. Ela cresce para o tronco ANCORADA no fundo, porque crescer
   para baixo incluiria a barra de botoes.

So se as duas primeiras falharem o corte cai no tratamento antigo.

### A verificacao que fecha a noite

| Artefato | Resultado |
|---|---|
| cortes | 4 de 4, PESSOA no quadro, fundo real, sem barra de botoes |
| legenda | 93% a 99% do tempo, linha mais larga 74% |
| completo | 1494s (151,7s limpos, incluindo as 43 muletas arrastadas) |
| punch-in | nos cortes, a cada emenda |
| aviso de nitidez | no diagnostico: ampliacao de 2,8x, grave em tela cheia |
| erros | nenhum |

### O estado com que o dia termina

O produto e o que o Bruno definiu de manha: edicao simples e honesta. Video
real, corte na pessoa, legenda no estilo escolhido, fala limpa por tres camadas
(pausas, agente, codigo), transicao sutil nas emendas, som nivelado, e a
plataforma dizendo ao cliente quando a materia-prima limita o resultado.

Aberto para as proximas sessoes: a musica que o usuario traz, a selecao de
trechos (regua mais dura ou A/B no Codex, oferta dele), o OBS da gravacao 4K,
e o teste do fluxo inteiro com uma gravacao em tela cheia, que e o que muda o
patamar de nitidez.

*Atualizado em 25/08/2026 por Claude Code.*

## Sessao 25/08/2026 (parte 59): aprovado, e o tira-estalo fecha a madrugada

O Bruno assistiu e aprovou: "ficou bom, amanha se eu conseguir gravar o video eu
testo de novo". Primeira aprovacao do dia, no formato pragmatico.

O que ele apontou como resto: "ainda tem alguns cortes secos, da aquele ruido,
da para perceber, mas quando colocar a musica os efeitos passa".

O ruido tem conserto na causa, sem esperar a musica: e o clique classico de
emenda de audio, quando um segmento termina num ponto qualquer da onda e o
seguinte comeca em outro. Entrou o TIRA-ESTALO: 15 ms de fade em cada ponta de
segmento, curto demais para o ouvido perceber como fade, levando a onda a zero
antes de cada emenda. Vale para o completo e para os cortes. E filtro de AUDIO
sobre a entrada crua, fora da zona de reinicializacao que derrubou os filtros
de video.

Deployado na madrugada; o teste dele com a gravacao nova ja pega.

### A fila da proxima sessao, na ordem

1. O teste do Bruno com a gravacao 4K em tela cheia (a ampliacao cai de 2,8x
   para perto de 1x, e e o que muda o patamar de tudo)
2. A musica que o usuario traz (engenharia decidida em 23/08: upload de arquivo,
   mixagem com a voz abaixando a trilha conforme o estilo)
3. A regua da selecao de trechos, ou o A/B do prompt no Codex que ele ofereceu
4. O OBS da webcam 4K, quando ele for gravar

*Atualizado em 25/08/2026 por Claude Code.*

## Sessao 25/08/2026 (parte 60): a musica, os efeitos e as transicoes, verificados

O Bruno pediu para nao fechar o dia sem avancar musica, efeitos e transicoes.
Construido e verificado em producao na mesma madrugada.

### A musica, no desenho juridico de 23/08

O cliente traz o arquivo, e a plataforma e ferramenta e nao distribuidora.

- **Upload na tela do video**, no cartao do estilo, direto do navegador para o
  storage (rota propria com token, DELETE que apaga o blob, espelho via PATCH
  para desenvolvimento local, 40 MB de teto). A dica de licenca fica na tela:
  assinatura propria, faixa autoral ou CC BY.
- **No projeto** (Project.videoMusicUrl), como o estilo: canal com trilha
  diferente a cada video nao constroi identidade sonora.
- **Mixagem do estilo**: volume por `som.volumeDaTrilha`, ducking por
  `sidechaincompress` com razao vinda de `som.abaixarSobAVoz` (a trilha abaixa
  quando a pessoa fala e volta nas pausas), fade de entrada 0,6s e de saida 1s,
  `-stream_loop` para gravacao mais longa que a faixa, e o `loudnorm` fechando
  a cadeia DEPOIS da mixagem.
- **O completo fica sem trilha de proposito**: video longo de fala no YouTube
  nao pede musica continua.

### Os efeitos e as transicoes

- Fade de video nas pontas de cada corte (0,25s entrando, 0,35s saindo).
- Push-in continuo no corte central com a forca do estilo (2% serio, 8%
  acelerado), ANTES da legenda, para o texto ficar cravado.
- Ja estavam: punch-in alternado nas emendas e o tira-estalo de audio.

### Verificado em producao

Rodada com um pad sintetico de teste anexado ao projeto (o Bruno troca pela
faixa dele na tela nova):

| Medida | Resultado |
|---|---|
| cortes | 4 de 4, sem erro |
| trilha no audio | presente nos 4, banda do pad em -17 dB |
| legenda | 94% a 97% do tempo |
| quadro | pessoa no quadro, fundo real, legenda no lugar |

A prova de fumaca ganhou os casos da trilha (inclusive faixa mais curta que o
corte, que exige o loop) e do push-in: oito caminhos, todos passando.

### O que o proximo teste do Bruno decide

Ele grava o video 4K em tela cheia, sobe a faixa real dele na tela, e o fluxo
inteiro roda no cenario bom pela primeira vez: ampliacao perto de 1x, trilha
de verdade, estilo escolhido. E o teste que valida o produto para lancamento.

*Atualizado em 25/08/2026 por Claude Code.*

## Sessao 25/08/2026 (parte 61): o popup da biblioteca, a metade que faltava

O Bruno corrigiu o rumo da musica: "o que tinhamos decidido e abrir um popup
para o usuario escolher a musica de uma biblioteca publica, imagina o usuario
ter que ter varias musicas salvas, nao faz sentido".

Ele esta certo, e o registro do dia 23 confirma: a decisao era "um atalho que
MANDA a pessoa ate a fonte, ela baixa, e sobe". O upload cru entregue de
madrugada era so a metade do "sobe", com o atalho engolido.

### O que o popup e, e o que ele nunca pode virar

Um ATALHO ATE A FONTE, com o envio ali mesmo. Tres bibliotecas publicas
(Pixabay Music sem credito obrigatorio, YouTube Audio Library so CC BY, Free
Music Archive), cada uma com a licenca resumida na linguagem de quem publica.

A linha juridica nao mudou: quem baixa o arquivo e o CLIENTE, na fonte. O
popup e catalogo de METADADOS, sem nenhum arquivo de audio e sem link direto
de download. Se um dia alguem quiser "melhorar" hospedando as faixas ou
baixando pelo servidor, esse alguem estara transformando a Demandou em
distribuidora sem sublicenca.

### As duas escolhas de desenho que valem registrar

**A busca ja abre filtrada pelo clima do ESTILO.** O estilo decide legenda,
ritmo, mixagem e arte; agora decide tambem o que procurar: acelerado abre
"upbeat energetic", serio abre "corporate background". Uma escolha do cliente
alimentando cinco decisoes.

**Portas de entrada por BUSCA, e nao links de faixa individual.** Link de
faixa em site alheio morre sem aviso, e popup com link quebrado e pior que
nenhum popup. Busca da fonte e estavel.

### Pendencia real desta frente

O credito automatico do CC BY na descricao do post ainda nao existe: hoje a
tela AVISA que o credito e obrigatorio, mas quem escreve e o cliente. Quando
entrar, deve ser um campo "autor da faixa" no projeto que os textos das redes
incluem sozinhos.

*Atualizado em 25/08/2026 por Claude Code.*

## Sessao 25/08/2026 (parte 52): ICP corrigido, personas e o preco mantido

Sessao inteira de estrategia, sem uma linha de codigo. O que mudou nos documentos:
`ESTRATEGIA.md` ganhou a secao "Decisoes de 25/08/2026" (que manda sobre as secoes
de ICP e canais de 13/08), e `PROJETO.md` teve os itens 3 (ICP) e 4 (precos)
atualizados. A nota completa vive no Notion, em `10-profissional/demandou`, com o
titulo "ICP, personas e a conta do trafego pago".

**O ICP estava desatualizado desde 22/08 e ninguem tinha percebido.** Ele foi escrito
quando o produto gerava post a partir de um tema. Com video como produto, a
materia-prima virou fala gravada, e o filtro mudou de desejo ("quem quer postar")
para comportamento: **quem ja produz fala gravada por outro motivo** (aula, reuniao,
webinar, palestra, treinamento). Quem nao grava precisaria criar um habito novo so
para usar a plataforma, e habito e exatamente o que faltou a ele quando parou de
postar.

**Correcao do Bruno que vale mais que o resto:** os conhecidos que tem a dor
resolveram contratando um social media, a R$ 1.200 a R$ 3.500 por mes. O melhor
comprador nao e quem tem a dor nao resolvida, e quem tem a dor **resolvida cara**,
porque tem orcamento provado e fatura recorrente. E o buraco que a Demandou tapa e
a reclamacao universal de todo social media, que e o cliente nunca mandar material.

**Jogada escolhida: substituir a PRODUCAO do especialista, nao o social media
inteiro.** A plataforma nao responde DM, nao faz stories nem community management.
Vender "demite seu social media" gera churn no mes 2. Vender para agencia e para o
freelancer (o Studio ja e isso, com projetos ilimitados) ficou parado com gatilho.

### Tres personas, com TAM e CPC medidos

| Persona | TAM medido | CPC | CAC |
|---|---|---|---|
| Consultor de gestao industrial | 113.705 consultorias CNAE 7020-4/00 | R$ 6 | R$ 620 |
| Contador consultivo | 101.228 organizacoes contabeis (CFC) | R$ 12 | R$ 1.240 |
| Advogado empresarial | 1,3 mi de advogados, ~15% socios | R$ 15 | R$ 1.550 |

**Regra de bolso: CAC = CPC x 103.** Com trial de cartao exigido, visita vira pagante
em 0,97% (2,2% de visita para cadastro x 44% de cadastro para pagante, os dois em
benchmark medido de 2026).

### O preco foi revisado e MANTIDO

Pro R$ 149 / R$ 1.490 anual, Business R$ 249 / R$ 2.490, Studio R$ 449 / R$ 4.490.
A analise comparou com R$ 397, R$ 697 e R$ 997 e recomendava R$ 397; o Bruno decidiu
manter, com os numeros na mesa. O que a decisao obriga a ser verdade:

| Persona | LTV/CAC no mensal | LTV/CAC no anual |
|---|---|---|
| Consultor | 1,44, nao fecha | 3,44, fecha no limite |
| Contador | 0,72, nao fecha | 1,72, nao fecha |
| Advogado | 0,58, nao fecha | 1,37, nao fecha |

1. **Trafego pago existe para o consultor apenas, e so vendendo o anual.**
2. **A conversao da landing virou parede mestra.** No benchmark de 2,2% nem o
   consultor tem folga; a conta so ganha ar em 3,5%, que e 60% acima do benchmark.
   Isso promove os Refs 148 (capturar e-mail na demo) e 149 (instrumentar o funil)
   de melhoria para pre-requisito de viabilidade.
3. **Teto de CPC no preco atual: R$ 6,89 no anual, R$ 2,89 no mensal.**
4. **A oferta de fundador nao tem desconto**, porque R$ 1.490 e o proprio preco de
   lista. A escassez vem da trava vitalicia e do atendimento pessoal, nunca de preco.
5. **Volante de caixa perto do equilibrio:** uma venda anual poe ~R$ 1.330 de caixa
   no dia 1 e R$ 812 de margem no ano, contra CAC de R$ 620, ou seja financia 1,3
   aquisicoes. Os dez primeiros precisam vir de rede, a CAC zero.

### O teste de trafego pago mudou de escopo e de criterio (Ref 97)

Roda numa persona so (consultor), vende so o anual, e aprova com **CPC abaixo de
R$ 6,89 E conversao de visita para cadastro acima de 3,5%**. E a descoberta que
muda o plano: **R$ 2.000 medem CPC e NAO medem conversao.** A R$ 6 de CPC sao 333
cliques e ~7 cadastros, que e anedota. Medir 2,2% com confianca pede ~1.000 cliques,
ou seja R$ 6.000 numa persona so. Virou card proprio para decidir antes de rodar.

### Uma premissa do Bruno confirmada contra o codigo, a favor dele

Sobre conselho de classe (OAB, CFP, CFM), ele afirmou que nao e problema da
Demandou, porque a plataforma e ferramenta de automacao e quem responde pelo
conteudo e o usuario, que aprova cada publicacao. Conferido em `app/terms/page.tsx`:
as clausulas ja existem em duas passagens (o usuario e o unico responsavel por
revisar, editar e aprovar antes de publicar; e responde integralmente pelo publicado,
inclusive por violacoes legais e de politicas de terceiros). Ressalva sem alarme:
clausula em contrato de adesao tem limite no CDC, e o Ref 119 (revisao dos termos por
advogado) segue no backlog sem prazo.

### Cards do planner

Atualizados: 97 (escopo e criterio do teste), 46 (coluna de gravacao existente e de
quem ja paga social media), 147 (oferta de fundador sem desconto), 148 (promovido a
pre-requisito), 153 (insumo passa a ser gravacao que a pessoa ja tem; custo da demo
corrigido de R$ 0,45 para R$ 0,04 medido), 165 (rastro de gravacao como segundo sinal).
Criados: elevar a conversao a 3,5%; decidir o orcamento do teste pago; reescrever
landing e abordagem com o filtro de gravacao; Jogada B parada com gatilho.

## Sessao 25/08/2026 (parte 62): a biblia de estilo dos overlays, e a primeira prova

O Bruno definiu o rumo da proxima camada do video: o usuario sobe video cru e a
plataforma devolve video editado com DESIGN por cima do video real (cartelas,
lousas, graficos, artes), copiando dois modelos de mercado que ele escolheu:
Dan Martell e Vox. Cadeia: Deepgram transcreve, Claude entende estilo e nicho e
marca os momentos por ANCORA TEXTUAL, Nano Banana Pro gera as artes, worker
cola no intermediario recodificado. Nao briga com o reset pragmatico: o reset
matou o fundo falso ATRAS da pessoa; isto e a camada POR CIMA, que os canais
premium usam.

### O "treinamento" que existe de verdade

Nano Banana nao aceita fine-tuning. O que funciona: prompt rigoroso mais
imagens de referencia anexadas na chamada (o Pro aceita ate 14). Entao o
treinamento virou artefato versionado: `docs/overlays/BIBLIA-DE-ESTILO.md`
mais 32 quadros de referencia em `docs/overlays/referencias/` (18 Vox, 14
Dan Martell), extraidos dos 5 videos que o Bruno indicou e curados a olho.

### O que foi medido, nao estimado

- Paleta Vox: fundo de estudio #D9DED7, rosa #CD145C, verde #33C886, amarelo
  #F4FA15, grifo #EBE927, papel #F7F7F7/#F9F3D9, verde de mapa #42883B.
- Paleta Dan Martell: lousa #050505 a #141414 com textura topografica #1C1C1C,
  ciano #12D4EA, glow #87DBE4, teal #087F7F, verde #1FE461, vermelho #EA0002.
- Cadencia: Vox mete um elemento novo a cada 8 a 15s; Dan Martell usa lousa
  cheia nos momentos de estrutura e 20 a 60s de fala limpa entre lousas.
- 25 arquetipos nomeados (12 Vox, 13 DM), cada um com quadro de referencia.

### As regras que a biblia carrega (das cicatrizes de 24-25/08)

1. Overlay so no intermediario recodificado, nunca na entrada crua.
2. Ancora textual, nunca segundo.
3. Grafico com numero real e CODIGO em template da marca; o modelo de imagem
   faz cartela, lousa, conceito e arte, onde nao ha numero que errar.
4. Movimento e do ffmpeg; a arte chega parada.
5. Texto na arte: ate 6 palavras, e LER o texto renderizado antes de colar
   (typo do modelo descarta e refaz).
6. A API nao devolve alpha: arte de quadro inteiro primeiro; elemento
   flutuante via chroma #00FF00 + colorkey e prova pendente.

### A primeira prova, aprovavel a olho

`scripts/tmp/provar-overlay.mjs` gerou no gemini-3-pro-image-preview (2K,
16:9, 4 referencias anexadas por pedido, ~25s cada): um cartao de pergunta
Vox ("COMO ESCALAR SEM VIRAR REFEM DO PROPRIO NEGOCIO?", acentos certos,
condensada verde sobre cinza) e uma lousa Dan Martell ("Os 3 Sistemas do
Negocio" com Sistemas em ciano, tiles 1-2-3, textura topografica). Texto em
portugues saiu correto nas duas. Enviadas ao Bruno para veredito.

### Aberto nesta frente

- [ ] Veredito do Bruno sobre as duas provas
- [ ] Prova do chroma para elemento flutuante (franja de glow e o risco)
- [ ] Decisao: paleta fiel a referencia ou paleta da MARCA do projeto (como
      o estilo ja faz no fundo dos posts)
- [ ] Agente marcador de momentos (prompt + schema de ancora textual)
- [ ] Motor no worker: colar a arte no intermediario com fade/slide
- [ ] Templates de grafico por codigo na paleta dos dois sistemas

Nada disso bloqueia o teste 4K do lancamento, que continua sendo o proximo
evento.

*Atualizado em 25/08/2026 por Claude Code.*

## Sessao 25/08/2026 (parte 63): a identidade nova do site, do painel do Bruno

O Bruno entregou o painel de identidade novo (dois JPEG no Downloads) e pediu
o ajuste do site. O que o painel muda: monograma dp em DEGRADE laranja com
contorno branco estilo adesivo e SEM disco de fundo, lockup "demandou." com
"postou." embaixo, e o grafite azulado como cor de fundo da marca.

Cores MEDIDAS no pixel do painel (o hex escrito em imagem gerada mente: o
cartao dizia #FF6020 e o laranja renderizado e outro): degrade #F1742E a
#BE4720, grafite #2A2A32 a #3A3A46, swatch cinza #585B6E.

### O que mudou no codigo

- `public/brand-mark.svg` (e favicons): mesma geometria vetorizada de 22/08
  (que ja era o desenho do Bruno), sem disco, com degrade. A geometria NAO
  foi recriada, so o acabamento.
- `BrandMarkAnimated`: degrade e sem disco; id de gradiente por instancia
  (`useId`), senao duas marcas na mesma pagina brigam pelo mesmo id.
- `BrandMarkImg`: os dois temas servem o MESMO svg (o contorno adesivo da
  contraste em qualquer fundo); parametro `variant` ficou por compatibilidade.
- Lockup "demandou. / postou." na navbar, rodape, sign-in, sign-up e planos.
- `app/icon.png` e `public/icon.png` regenerados por codigo (PIL desenha a
  mesma geometria em alta resolucao, degrade e fundo grafite #3A3A46).
- Paleta do tema escuro tingida com o grafite da marca MANTENDO a escada de
  luminosidade de 18/08 (1e1e25 / 2a2a33 / 31313c), acento #ef6122.
- Escala laranja do Tailwind alinhada num ponto so via `@theme` no
  globals.css (orange-400/500/600), porque os botoes usam bg-orange-500
  espalhado e cacar classe por classe seria fragil.

### Verificado

`npm run build` passou; app rodado local e OLHADO por captura: landing, hero,
navbar e sign-in com a marca nova, lockup e paleta. Capturas enviadas ao Bruno.

### Pendente

- O push para master (deploy) foi bloqueado pelo classificador de permissao
  da sessao; os DOIS commits estao prontos na master local (9e3feef docs da
  biblia, 19ff816 identidade). Falta `git push origin master`.
- ESTRATEGIA.md e PROJETO.md estao modificados por outra sessao e ficaram
  fora dos commits de proposito.
- Os arquivos antigos nao referenciados (logo-*.svg, logo*.png) ficaram no
  repo; limpar quando der.

*Atualizado em 25/08/2026 por Claude Code.*

## Sessao 30/08/2026 (parte 64): o teste de ponta a ponta do Bruno, medido antes de consertado

O Bruno gravou (2560x1440, 30 fps constante, 20 min, 1,16 GB, tela com webcam
na borda esquerda) e testou o fluxo inteiro gravando a tela. Trouxe quatro
achados. Regra da casa: ler o dado ANTES de propor conserto.

### 1. Popup de musica transparente

`escolher-musica.tsx` pintava o fundo com `var(--surface)`, que NAO EXISTE no
globals.css (a variavel e `--bg-surface`). O cartao do estilo tinha o mesmo
erro em dois lugares. Trocado. Licao barata: variavel CSS inexistente nao da
erro, da transparencia.

### 2. "Video esta em cut. A redacao roda depois da selecao"

O corte passou a rodar ANTES da redacao em 25/08 (estado `cut`), e o portao
da rota `write` continuava aceitando so `selected`. O botao "Escrever os
posts", que a tela oferece em `cut`, batia no 409. Aceita `cut` agora, e a
devolucao por falta de saldo volta ao estado de ORIGEM (`cut` quando ha
cortes), senao ofereceria "Cortar os videos" de novo e refaria meia hora de
worker.

### 3. A espera do corte demorava a aparecer

A tela consultava o estado UMA vez, 400 ms depois do clique. A rota `cortar`
com a funcao fria leva mais que isso para marcar `cutting`, e o ritmo de
consulta so liga quando algum video esta trabalhando. Resultado: ninguem
perguntava de novo ate a rota inteira responder, que no corte e depois da
limpeza de fala (minutos). Consultas escalonadas (0,4 s a 25 s).

### 4. "A imagem esta descasada do audio": nao estava, e o dado diz o que era

Medido no corte real (`vertical-0`, 49,4 s), casando o corte com o original
por correlacao de audio e por casamento de quadro na janela da webcam
(achada por template: x=129 y=459 300x417, ampliacao real de 3,6x):

| trecho do corte | video menos audio |
|---|---|
| 0 a 12 s (sem punch-in) | 0,00 a +0,07 s |
| 12 a 25 s (com punch-in, casado com o mesmo recorte) | -0,01 a +0,06 s |
| 25 a 33 s | -0,14 a +0,13 s |
| 36 a 39 s (com punch-in) | -0,02 a +0,09 s |

**Sincronia dentro de 2 quadros o corte inteiro.** O que pulava: o punch-in
recortava 5,5% ao redor do centro da TELA, e a webcam fica na borda esquerda,
entao a cada emenda a pessoa deslocava ~60 px na fonte (200 px no corte de
1080) e mudava de tamanho. E a limpeza tirou tres muletas em tres segundos
(segmentos de 0,72 s e 0,88 s), virando estrobo. Corrigido no worker:

- o punch-in centra na CAIXA DA PESSOA (`enq.pessoa`), com o centro da tela
  so como reserva;
- o plano so alterna em segmento de 1,2 s ou mais; segmento curto herda o
  plano do anterior.

Scripts de medicao ficaram no scratchpad da sessao; o metodo (correlacao de
audio por FFT + NCC de quadro na regiao da pessoa, com e sem o recorte do
punch-in) vale repetir quando alguem disser "descasado".

### 5. Legenda escrevendo "Aretcon": o glossario do cliente

Pedido do Bruno: um lugar para editar termos e o sistema aprender. Entrou a
FASE 1, sem editor de transcricao:

- `Project.videoTerms` (texto separado por virgula, coluna nula, migration
  `20260830200000_termos_do_projeto`, aplicada em producao).
- Campo "Termos do seu negocio" no cartao do estilo, na tela de video; salva
  ao sair do campo via PATCH do projeto.
- Na transcricao nova, os termos do cliente entram PRIMEIRO no `keyterm` da
  Deepgram (o orcamento continua 5, medido em 18/08).
- `lib/media/termos.ts`: correcao DETERMINISTICA das palavras (Levenshtein
  normalizado, janelas de 1 a N+1 palavras, limiar por tamanho, letra inicial
  obrigatoria em termo curto, lookahead que preserva artigo). Roda no
  callback da transcricao E em `montarPedidoDeCorte`, entao gravacao ja
  transcrita sai com legenda certa no proximo corte, sem transcrever de novo.
- Provado (`scripts/tmp/provar-termos.mts`): "Aretcon", "arete com", "sas"
  viram Areticon e SaaS; "casa", "caso", "sal", "saiu" ficam em paz; o artigo
  antes do termo e preservado. Limite honesto: "dois reais" nao vira "dor
  real" (e frase, nao nome; o keyterm e quem ajuda ali).

FASE 2, ainda aberta: editar a legenda de um corte pronto e refazer so a
queima, e o RAG aprender do que o cliente editou.

### Verificado e publicado

`npm run build` ok, `worker/fumaca.mjs` com os 8 caminhos ok, corretor
provado, migration aplicada. App em `0b5c96b` (master, Vercel) e worker via
`railway up`.

### Para o Bruno fechar o teste

- Recarregar a tela do video: o botao "Escrever os posts" passa a funcionar
  no video que esta em `cut`.
- Cadastrar "Areticon, SaaS" nos termos.
- Para ver o punch-in novo e a legenda corrigida NESTE video, o corte precisa
  rodar de novo (estado `selected`); e uma troca de status no banco, a
  pedido.
- O video foi gravado com tela + webcam pequena (ampliacao real de 3,6x); a
  gravacao em tela cheia continua sendo o que muda a nitidez.

*Atualizado em 30/08/2026 por Claude Code.*

## Sessao 31/08/2026 (parte 65): o segundo teste redesenha o fluxo, e a tela de agentes sai

O Bruno rodou o segundo teste de ponta a ponta e trouxe rumo de produto, nao
so defeito. O que ja virou codigo nesta sessao:

- **A etapa "Time de Agentes" saiu do assistente de setup** (decisao dele: o
  time e sempre completo e igual para todo projeto, a tela era uma escolha que
  nao escolhia nada e ainda listava agentes desatualizados, sem o Vitor
  Video). A pagina `/projects/[id]/agents` e o `AgentsConfig` foram removidos,
  junto do item "Agentes" na navegacao. Os agentes continuam criados sozinhos
  na ativacao (DEFAULT_AGENTS no PATCH do projeto). O assistente caiu de 7
  para 6 etapas, com o texto derivando de STEPS.length.
- **O campo "Termos do seu negocio" ficou generico**: o placeholder trazia os
  termos do PROPRIO Bruno (Areticon, Bem Natura) como exemplo para qualquer
  cliente. Reprovado por ele; agora explica "termos da sua area" sem citar
  ninguem.

### O rumo que ele definiu (registrado, ainda nao construido)

1. **Inverter a logica quando o conteudo nasce de video**: depois de conectar
   as redes, a PRIMEIRA etapa e subir o video; a IA deriva tema, voz e nicho
   DO CONTEUDO, e o cliente confirma. Hoje o assistente pede nicho e voz antes,
   e foi isso que produziu a colisao de 31/08 (gravacao pastoral num perfil
   compilado para negocio, selecao rejeitando tudo).
2. **Talvez so campanhas, sem projeto**: cliente com dois assuntos (o caso
   dele) cria uma campanha por tema na mesma semana e escolhe por campanha
   quais perfis conectados publicam. Em avaliacao de engenharia: a conexao
   OAuth nao pode viver na campanha (reconectar rede a cada campanha e
   inviavel); o desenho que sustenta isso e conexao no nivel da CONTA e
   campanha escolhendo destinos. Mexe em migracao do banco compartilhado e no
   roteiro do App Review da Meta, entao o conselho registrado e depois da
   validacao de lancamento.
3. Zero trecho aproveitavel nunca pode ser beco sem saida (parte da mesma
   frente: tema declarado no upload, "cortar mesmo assim" na tela).

*Atualizado em 31/08/2026 por Claude Code.*

## Sessao 31/08/2026 (parte 66): o e2e rodado por mim, e o fim do fluxo que era mudo

O Bruno pediu o teste de ponta a ponta comigo no volante. O video dele
("Proposito & Negocios", projeto novo misturando os dois assuntos) tinha
rodado ate "ready" com 4 cortes. O que os DADOS contaram:

- As 17:06, "Preparar os N cortes e levar para o quadro" agendou os cortes
  0, 2 e 3 (2 destinos cada) mais o completo: 7 cards no quadro. As 17:16, a
  aprovacao do corte 1 criou 4 posts SEM agenda, SEM card e SEM aviso.
- Ou seja: ele desmarcou o corte que queria (tudo nasce marcado; o clique
  dele "selecionando" na verdade DESmarcou) e o botao de aprovar funcionou
  gravando em lugar que nenhuma tela mostra. "Cliquei e nada aconteceu" era
  verdade na experiencia e mentira no banco.
- O corte 1 em si esta BOM: pessoa centrada, legenda certa, enquadramento
  estavel nas emendas (o punch-in novo do worker em acao, verificado no
  quadro extraido).
- A "capa cortada": capa 1280x720 e capa-arte 1376x768, paisagem, exibidas
  num quadro 9:16 com object-cover, que joga fora dois tercos da arte.
- O modal do card do Vitor no quadro nao tinha ramo para video_clip: caia no
  texto generico, sem player e sem destino.

### O que virou codigo agora

- Aprovar ganhou retorno visivel: toast dizendo que os posts estao na aba
  Posts (o minimo honesto ate o redesenho).
- O modal do card video_clip mostra O VIDEO (player) e o destino
  (metadata.destinoRotulo), antes do texto.
- O poster do corte passou a object-contain: arte paisagem aparece inteira
  com barras, em vez de cortada.

### O que virou card (o redesenho que o Bruno descreveu)

Depois da edicao, UMA central de aprovacao: ideias de conteudo geradas a
partir do video; o cliente escolhe o que vai para onde, com icone oficial de
cada rede; card do video completo para o YouTube com TUDO (thumb, descricao,
tags, player); cada corte como Short e como Reels com tudo; e conteudos
derivados (X, carrossel) sugeridos automaticamente. Os dois caminhos de hoje
(cortes->quadro e aprovacao->posts soltos) fundem nessa central. Capa
vertical 9:16 propria para corte tambem virou card (a arte de hoje e pensada
para o YouTube).

*Atualizado em 31/08/2026 por Claude Code.*

## Sessao 31/08/2026 (parte 67): a simplificacao com autonomia, primeiro corte

O Bruno, testando pelo celular, deu o veredito ("a plataforma esta confusa,
muitas etapas, muitas informacoes") e autonomia para simplificar pensando na
jornada. O que mudou nesta primeira leva, tudo buildado e publicado:

### Um caminho so, do corte a publicacao

- **A aba Video parou de duplicar aprovacao.** O bloco ClipApproval (textos
  por rede com botao "Aprovar e mandar para Posts", que criava posts sem
  agenda e sem card, invisiveis) SAIU da tela. O caminho e um: preparar os
  cortes, revisar e publicar no Gestor de Conteudo. A rota `approve` ficou
  sem uso pela interface (mantida por ora).
- **O agendamento passou a usar o texto DA REDE**: `legendaDoDestino` escolhe
  posts.x para o X, posts.linkedin para o LinkedIn, posts.instagram para
  Instagram e Facebook; o titulo+descricao ficou para YouTube e como reserva.
  Antes o card de todas as redes carregava o mesmo texto generico e a redacao
  por rede era jogada fora.
- **O card do Vitor no quadro virou o lugar de publicar**: alem do player e
  do destino (parte 66), agora mostra a PREVIA FIEL do post (SocialPostPreview
  com icone e cor oficiais: YouTube, Instagram e Facebook entraram no
  componente) e o botao "Publicar agora", que chama a rota de publicacao real
  com a conta conectada; sem conta, o botao explica. `by-day` devolvia so
  linkedin/twitter e escondia os posts de video: liberado para as cinco redes.
- **Editar o conteudo do card de video sincroniza o post** (o PATCH so
  sincronizava linkedin/twitter).

### Menos ruido

- **Linha de agente sem card na semana virou uma linha fina** ("Fulano: nada
  nesta semana") em vez de sete celulas "Vazio". No celular as linhas vazias
  dominavam a tela e o conteudo real sumia.
- Responsividade dos prints: o cartao "Publicar a gravacao no YouTube"
  quebrava uma palavra por linha (flex sem wrap: corrigido), e o rodape dos
  cortes ganhou wrap.

### O que continua aberto no card da central de aprovacao

Thumb, tags e hashtags visiveis no card do YouTube; pedir correcao
estruturada (refazer imagem, melhorar edicao, ajustar capa) alem do chat de
IA; icones oficiais tambem nos chips de destino da aba Video; auditoria de
responsividade completa (feita so nos pontos dos prints); e a fusao maior
(ideias de conteudo derivadas do video: X, carrossel). O redesenho segue
sendo o norte; esta leva tirou o beco e o ruido.

*Atualizado em 31/08/2026 por Claude Code.*

## Sessao 31/08/2026 (parte 68): a central de aprovacao, leva dois

"Vamos trabalhar nos itens abertos, implementar tudo." O que entrou:

- **O card do video completo virou um post de verdade.** O agendamento cria
  (ou reaproveita) o rascunho de YouTube com titulo e descricao com capitulos
  (montarPostDeVideo) e LIGA ao card. No modal: previa fiel de YouTube com a
  THUMB (o quadro-fonte da capa, servido por `tipo=capa-fonte` novo na rota
  de midia), descricao com capitulos, e Publicar agora funcionando (a rota de
  publish ja sobe video ao YouTube com maxDuration 800).
- **Thumb nos cards de corte** (`metadata.thumb` com a capa-arte) e na previa.
- **Hashtags visiveis**: a previa extrai as hashtags do texto e mostra como
  chips na cor da rede.
- **Derivados automaticos, sem custo novo de IA**: o melhor corte (maior
  nota) rende post de TEXTO no LinkedIn (Lucas, quarta) e no X (Tiago,
  quinta), usando os textos que a redacao ja escreveu; e a Diana ganha card
  de carrossel com as frases de capa do video (so o prompt: gerar imagem
  custa credito, o cliente dispara pelo chat do card). A semana deixa de ser
  so Vitor.
- **Ajustes rapidos no card de video**: chips que preenchem o chat de IA
  (encurtar, mais provocativo, trocar titulo, hashtags); a edicao via chat
  passou a sincronizar o post tambem para video_clip.
- **Icones oficiais nos chips de destino da aba Video** (componente novo
  `components/social/rede-icone.tsx`, uso nominativo das marcas), e avatar da
  previa na cor da rede (o var(--accent) usado antes nem existia).
- Responsividade: linha do video enviado quebra em telas estreitas.

### Aberto ainda (registrado no card da central)

Correcao estruturada FUNDA (refazer capa de um corte, melhorar a edicao do
video: exigem rotas novas no worker); a decisao da esteira (Vera/Paulo para
conteudo de video); auditoria de responsividade completa com tela logada.

*Atualizado em 31/08/2026 por Claude Code.*

## Sessao 31/08/2026 (parte 69): o veredito duro, a forense, e o piloto automatico

O Bruno rodou tudo de novo e o veredito foi "a plataforma sequer funcionou".
A forense ANTES do conserto, nos dados do video real (projeto novo "Jesus e o
Trabalho", cmthlvgzl, 16 min):

- **74 minutos do upload ao pronto**, com cada etapa esperando clique.
- **O Gestor vazio tinha causa mecanica**: a cadeia capas->redacao->quadro
  vivia no NAVEGADOR; ele atualizou a pagina no meio, a redacao cobrou os 50
  creditos e o agendamento nunca rodou (runs e cards zerados no banco).
- **A limpeza RODOU** (69,975s de uma janela de 75,44s, zero silencios >=0,5s
  no silencedetect). O que sobrou e vicio FALADO: "ne" (curto, nao arrastado,
  nao e pausa) e "eeee" transcrito como palavra curta.
- **Os cortes bruscos eram efeito da minha regra de 30/08**: segmento curto
  herdava o plano, entao emenda rapida ficou SEM mudanca de cena.
- **Legenda pulsando de tamanho**: o corpo por linha de 24/08 ajusta cada
  bloco, e bloco curto sobe ao teto enquanto bloco longo desce.
- **Capa horizontal em video vertical**: comporCapa pedia "16 por 9" fixo.

### O que mudou (app 
 worker publicados)

1. **Piloto automatico**: uploaded->transcreve->escolhe->corta->capas->
   redacao->quadro, tudo encadeado na tela com estado visivel, sem clique. O
   disparo em "ready" chama o agendamento IDEMPOTENTE, o que tambem CURA
   fluxos interrompidos: o video atual do Bruno termina o caminho sozinho na
   proxima visita a aba. Botoes manuais viraram retry de etapa que falhou.
2. **O botao "Preparar para o YouTube" morreu**: o agendamento ja cria o
   rascunho com capitulos e o card; a duplicata era confusao pura. O bloco de
   ready virou atalho para o Gestor.
3. **"ne" sai sempre** (VICIOS_SEMPRE na limpeza deterministica; nao depende
   de duracao nem do agente).
4. **Legenda com corpo UNIFORME por corte**: o menor corpo que faz todas as
   linhas caberem, com piso de 62% do teto (bloco patologico desce sozinho).
5. **Capa dos cortes em 9:16** (comporSobreImagem ganhou aspectRatio; a thumb
   16:9 do completo continua vindo do quadro-fonte).
6. **Punch-in em TODA emenda, 8%, centrado na pessoa** (worker): a regra de
   herdar plano em segmento curto foi revertida; o estrobo de 30/08 era o
   deslocamento lateral do zoom centrado na tela, ja resolvido pelo centro na
   caixa da pessoa. Fumaca dos 8 caminhos ok.

### O que segue aberto, com honestidade

- O tempo do WORKER continua o gargalo (corte de video de 16 min leva dezenas
  de minutos): profiling e paralelizacao viraram a proxima frente de perf.
- "eeee" que a Deepgram nao transcreve como palavra segue invisivel para as
  redes deterministicas; medir no proximo video se o caso sobrevive.
- Editor de legenda por corte (escolher e editar) e o card da fase 2 do
  glossario; o tamanho agora e uniforme e o estilo ja e escolha do projeto.

*Atualizado em 31/08/2026 por Claude Code.*

## Sessao 31/08/2026 (parte 70): a falha da transcricao com nome de fornecedor na tela

O Bruno recomecou num projeto novo e a transcricao falhou com "Deepgram nao
devolveu transcricao" NA TELA. Dois defeitos num so:

1. **Vazamento de fornecedor**: o cliente nao tem que saber que a Deepgram
   existe. O erro tecnico agora vai para o LOG do servidor (com o corpo bruto
   do callback, ate 2000 chars, que era o dado que faltava para investigar) e
   a tela recebe "A transcricao falhou desta vez. Nada se perdeu: vamos
   tentar de novo sozinhos." Mesmo tratamento no despacho e no callback.
2. **Falha transitoria exigia clique**: o mesmo arquivo tinha transcrito as
   22:02 e falhou as 23:50, tipico de falha do servico. O piloto automatico
   agora TENTA DE NOVO sozinho quando status=failed e attempts <
   MAX_TENTATIVAS, uma vez por contagem de tentativa; o teto de 3 continua.
   Isso destrava o video atual do Bruno na proxima visita a aba.

Pendencia registrada: varrer os OUTROS erros com nome de fornecedor (Gemini
em web-search/infographic aparecem em logs de campanha) com a mesma regra:
tecnico no log, humano na tela.

Causa raiz da falha em si: o callback da Deepgram veio sem alternatives; sem
o corpo bruto logado (defeito 1) nao dava para saber por que. Na proxima
ocorrencia o log conta.

*Atualizado em 31/08/2026 por Claude Code.*

## Sessao 31/08-01/09/2026 (parte 71): "revise suas premissas", e as premissas revisadas

O Bruno viu 10 minutos de espera e mandou revisar as premissas. A linha do
tempo real do video dele: transcricao falhou 23:50, ficou em failed ate a
PAGINA disparar o retry as 00:12 (retry morava na tela), transcreveu em 90s,
e a selecao iniciada as 00:13:53 TRAVOU em selecting sem erro (a funcao
morreu sem conseguir gravar o proprio estado; o teto de tempo interno da
chamada era maior que a paciencia de qualquer um).

Premissas revisadas, publicadas em a81ab0e:

1. **Selecao em esforco MEDIO com teto de 240s.** 90% da saida era
   pensamento (10.916 tokens, 121s). A medicao de 23/08 ja mostrava o medio
   equivalente na metade do tempo; o que protege a qualidade e a verificacao
   em codigo (ancora textual, nota minima, fala recortada por nos), nao o
   pensamento longo. O teto de 240s faz a falha virar failed com retry em
   vez de selecting mudo.
2. **Retry de transcricao no SERVIDOR**: o proprio callback re-despacha
   (attempts < 3), sem depender de aba aberta. Os 22 minutos de buraco do
   teste vieram dai.
3. **Worker instrumentado**: tempo por fase no log (fonte baixada,
   enquadramento, cada trecho, completo, total). O worker e o gargalo grande
   e o proximo corte de tempo sera com numero, nao chute.

A varredura de prazo (video-sweep, acionada pela consulta de status) e quem
destrava o selecting mudo do video atual; com a pagina aberta ela vira
failed e o piloto tenta de novo ja no deploy novo.

*Atualizado em 01/09/2026 por Claude Code.*

## Sessao 01/09/2026 (parte 72): a primeira medicao por fase, e os cortes que chegam na hora

A instrumentacao da parte 71 pagou na primeira rodada. O video real de 16 min
(1440p), medido no worker:

| fase | tempo acumulado |
|---|---|
| fonte baixada | 20s |
| enquadramento pronto | 46s |
| trecho 0 entregue | 159s |
| trecho 1 entregue | 211s |
| completo recodificado | 1047s |

**O completo era 80% do tempo** (836s de codificacao no preset medium), e o
cliente esperava 14 minutos por um arquivo que nao bloqueia nada do que ele
quer fazer (revisar e publicar cortes). Dois consertos, publicados:

1. **Aviso em DUAS FASES**: o worker manda os cortes assim que ficam prontos
   (aviso parcial; o app poe o video em "cut" e o piloto segue para capas,
   redacao e quadro), e o completo vai num segundo aviso quando terminar. O
   callback aceita o completo atrasado: anexa completoUrl e poe o card no
   quadro via `lib/media/completo-no-quadro.ts` (lib nova, usada tambem pelo
   agendamento, que perdeu o bloco inline). Corte aprovado nunca e tocado
   pelo segundo aviso.
2. **Preset do completo: medium para faster** (2 a 3x mais rapido em crf 18;
   a fidelidade nao e promessa, o worker JA mede SSIM e manda no resultado).

Expectativa nova, com os numeros de hoje: cortes na tela em ~4 min, quadro
completo em ~6-7 min, completo do YouTube chegando sozinho ~5 min depois.

Verificado tambem nesta rodada: legenda com corpo uniforme (quadros
extraidos), enquadramento estavel, limpeza com os "ne" (147 remocoes, 107s), e
o corte redespachado por mim depois que o deploy do worker matou o trabalho
em andamento (licao: deploy de worker espera fila vazia; o redespacho usou o
scripts/tmp/rodar-corte.mts, que monta o pedido com o codigo de producao).

*Atualizado em 01/09/2026 por Claude Code.*
