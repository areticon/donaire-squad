# Opensquad SaaS — Documento de Contexto do Projeto

> **Use este arquivo para passar contexto ao assistente quando mudar de pasta.**
> Cole o conteudo deste arquivo no inicio de uma nova conversa.

---

## O que e o Opensquad SaaS

Plataforma SaaS de gestao de redes sociais com agentes de IA. O usuario configura um "squad" de agentes autonomos que pesquisam, escrevem, criam infograficos e publicam conteudo no LinkedIn, X, Instagram, etc.

**Repositorio principal dos agentes (Opensquad):** `c:\Users\devan\donaire-squad\`
**Repositorio do app SaaS (Next.js):** `c:\Users\devan\opensquad-app\` ← voce esta aqui

---

## Stack Tecnica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 14 App Router + TypeScript |
| UI | Tailwind CSS + componentes custom (dark mode, laranja) |
| Auth | Clerk (login/cadastro/sessoes) |
| Banco | Neon PostgreSQL + Prisma ORM v7 + adapter PrismaNeon |
| Realtime | Pusher Channels |
| Pagamentos | Stripe (Checkout + Billing Portal + Webhooks) |
| IA - conteudo | Claude API (Anthropic) via route handlers |
| IA - imagens | OpenRouter + Gemini (google/gemini-3.1-flash-image-preview) |
| Publicacao | Blotato HTTP API |
| Deploy | Vercel |
| Cron | Vercel Cron (agendamento de posts) |

---

## Estrutura de Pastas

```
opensquad-app/
app/
  (marketing)/page.tsx        <- Landing page
  (auth)/sign-in/             <- Clerk sign-in
  (auth)/sign-up/             <- Clerk sign-up
  (app)/layout.tsx            <- App shell autenticado (com sidebar)
  (app)/dashboard/page.tsx    <- Dashboard com metricas
  (app)/projects/             <- Lista de projetos
  (app)/projects/[id]/page.tsx        <- Kanban 7 etapas
  (app)/projects/[id]/live/           <- Live view dos agentes
  (app)/projects/[id]/posts/          <- Posts para aprovacao
  (app)/projects/[id]/agents/         <- Config de agentes
  (app)/projects/[id]/settings/       <- Redes sociais
  (app)/billing/page.tsx      <- Planos e pagamento
  api/
    stripe/checkout/route.ts  <- Criar sessao checkout
    stripe/portal/route.ts    <- Portal billing
    webhooks/stripe/route.ts  <- Webhook Stripe
    webhooks/clerk/route.ts   <- Webhook Clerk
    pipeline/run/route.ts     <- Executar pipeline de agentes
    pipeline/status/route.ts  <- Status do run atual
    ai/assist/route.ts        <- Claude assistant para Kanban
    projects/route.ts         <- CRUD projetos
    projects/[id]/route.ts    <- Update/delete projeto
    projects/[id]/agents/     <- CRUD agentes
    posts/[id]/route.ts       <- Update post
    posts/[id]/publish/       <- Publicar post via Blotato
    social/connect/route.ts   <- Conectar redes sociais
    cron/pipeline/route.ts    <- Cron job agendamento
components/
  ui/         <- button, card, badge, input, textarea, progress, sidebar
  landing/    <- navbar, hero, features, how-it-works, pricing, footer
  kanban/     <- kanban-board.tsx (7 etapas com Claude assistant)
  agents/     <- agents-config.tsx
  social/     <- social-connect-panel.tsx
  office/     <- live-view.tsx (visualizacao em tempo real)
  posts/      <- posts-panel.tsx (aprovacao e publicacao)
lib/
  db/prisma.ts     <- PrismaClient com PrismaNeon adapter
  stripe/          <- Stripe client lazy-initialized
  claude/          <- Claude client lazy-initialized
  blotato/         <- Blotato HTTP API
  pusher/          <- Pusher server + client
  utils.ts         <- cn(), formatDate(), etc.
prisma/
  schema.prisma    <- Schema completo (users, projects, agents, posts, runs)
prisma.config.ts   <- Config Prisma v7
middleware.ts      <- Clerk auth middleware
vercel.json        <- Cron config (hourly) + maxDuration pipeline
```

---

## Variaveis de Ambiente

Arquivo: `.env.local` na raiz do projeto.

**Ja preenchidas:**
- `DATABASE_URL` — Neon PostgreSQL (mesmo banco do donaire-squad)
- `OPENROUTER_API_KEY` — Para geracao de imagens com Gemini
- `BLOTATO_API_KEY` — Para publicacao nas redes sociais

**Ainda pendentes (configurar antes de rodar):**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` — clerk.com
- `ANTHROPIC_API_KEY` — console.anthropic.com
- `NEXT_PUBLIC_PUSHER_KEY` + `PUSHER_APP_ID` + `PUSHER_SECRET` — pusher.com
- `STRIPE_SECRET_KEY` + precos — stripe.com (pode deixar para depois)

---

## Estado Atual do Projeto

**TypeScript:** Zero erros (npx tsc --noEmit passou limpo)

**Build de producao:** Quase pronto. Pendente:
1. Preencher variaveis do Clerk para o build nao falhar nas paginas de auth
2. Rodar `npx prisma migrate dev` apos ter DATABASE_URL configurado
3. A `app/api/stripe/portal/route.ts` ficou vazia durante problema de disco — precisa ser recriada

**Banco de dados:** Schema do Prisma criado mas migracao ainda nao foi rodada no Neon.
Para rodar: `cd c:\Users\devan\opensquad-app && npx prisma migrate dev --name init`

---

## Proximos Passos (em ordem)

1. **Clerk** — Criar conta em clerk.com > New Application > copiar as 2 keys para .env.local
2. **Anthropic** — Copiar API key de console.anthropic.com para .env.local
3. **Pusher** — Criar conta em pusher.com > Channels > New App > copiar 4 credenciais
4. **Rodar migracao** — `npx prisma migrate dev --name init`
5. **Testar local** — `npm run dev` e abrir localhost:3000
6. **Deploy Vercel** — Fazer push para GitHub e conectar no Vercel
7. **Stripe** — Configurar planos e webhook (para quando quiser cobrar)

---

## Agentes do Donaire-Squad (referencia)

Os agentes existem em `c:\Users\devan\donaire-squad\squads\conteudo-linkedin\agents\`:
- `roberto-radar` — Pesquisador
- `lucas-linkedin` — Redator LinkedIn
- `tiago-twitter` — Redator X/Twitter
- `daniela-design` — Visual Designer (gera infograficos via Gemini)
- `vera-veredito` — Revisora
- `paulo-publicador` — Publicador via Blotato

O pipeline do SaaS (api/pipeline/run/route.ts) porta a logica desses agentes para API routes do Next.js, chamando Claude API diretamente.

---

## Credenciais Importantes (NAO COMPARTILHE)

- Neon: `ep-rapid-dream-ak1vdjhk-pooler.c-3.us-west-2.aws.neon.tech` / banco `neondb`
- Blotato: conectado ao LinkedIn e X do Bruno Donaire
- OpenRouter: modelo `google/gemini-3.1-flash-image-preview` para infograficos

---

## Como Continuar o Desenvolvimento

Ao abrir o projeto `opensquad-app` no Cursor, cole este arquivo no contexto e diga:
"Estou continuando o desenvolvimento do Opensquad SaaS. Veja o PROJETO.md para contexto."
