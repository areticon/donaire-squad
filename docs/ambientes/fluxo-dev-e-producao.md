# Ambientes da Demandou: dev e produção

Preparado em 06/10/2026, antes da separação das contas. Nada aqui criou recurso de nuvem: o código, os scripts e os modelos estão prontos para que, no dia em que as contas da Demandou existirem, o ambiente de dev suba em minutos. Relatório de origem: wiki "Demandou: stack, segregação de contas e ambientes" e `Documents\Demandou\stack-0610`.

## 1. As peças

| Peça | Produção | Dev |
|---|---|---|
| Branch | `backup-0210` (vira `producao` quando o Bruno quiser renomear; o script lê `DEMANDOU_RAMO_PRODUCAO`) | `dev` |
| App | Vercel, `npx vercel --prod`, demandou.com | Vercel Preview do mesmo projeto, alias fixo dev.demandou.com |
| Banco | Supabase `demandou` (ref `lvrolepscwpexrakemrq`) | Supabase `demandou-dev` (Free, organização Demandou) |
| Worker | Railway `demandou`, ambiente `production` | Railway `demandou`, ambiente `dev`, App Sleeping |
| Mídia | store de Blob de produção | store `demandou-dev` |
| Migração | no build de produção (como hoje) | no build do Preview, só com `DEMANDOU_AMBIENTE=dev` e banco que não seja o de produção |
| Crons | `vercel.json` (só produção) | nenhum; chamar `/api/cron/pipeline` e `/api/cron/fila` à mão com `CRON_SECRET` |

## 2. O fluxo: o que vai para onde

1. Todo trabalho novo é commitado na `dev`.
2. `node scripts/deploy/copia-limpa.mjs --alvo dev --executar` publica app e worker de dev a qualquer hora (dev não tem janela). O worker de dev também só sobe com `/saude` ocioso.
3. Prova em dev.demandou.com: login com a conta da semente, abrir o quadro, a mudança funcionando, `npx tsx --test scripts/testes/*.test.mts`.
4. Aprovação do Bruno.
5. Avanço da produção só por fast-forward: `git checkout backup-0210 && git merge --ff-only dev`.
6. `node scripts/deploy/copia-limpa.mjs --alvo producao --executar` na janela (terça a quinta, 11h00 às 13h30). O script recusa: fora da janela, branch errada, árvore suja, commit que não passou pela `dev`, worker com `/saude` ocupado.
7. Prova pós-deploy e registro no HANDOFF e no planner.

Conserto urgente: o mesmo caminho, mais curto. Commit na `dev`, deploy de dev, prova rápida, fast-forward, produção na janela. Fora da janela, só com o Bruno decidindo, e o script não tem atalho para isso (publicar à mão, como hoje, continua possível e é decisão dele).

O que nunca vai para produção sem passar por dev: migração de banco (sempre aditiva: coluna ou tabela nova; apagar ou renomear em dois deploys), mudança no worker, mudança em cobrança, publicação ou contrato.

## 3. A trava dos ambientes

`lib/ambiente/trava-do-banco.mjs` (e a cópia `worker/src/trava-do-ambiente.mjs`). Só lê variáveis; nunca abre conexão nem roda comando no banco.

| Onde roda | Quando | O que recusa |
|---|---|---|
| `lib/db/prisma.ts` | primeira consulta do app | dev com banco, worker ou endereço de produção, Stripe `sk_live_`, Blotato ligado, ZapSign em produção; produção com banco que não seja o dela |
| `prisma.config.ts` | toda migração e `prisma generate` | o mesmo, antes de o Prisma conectar |
| `scripts/build.mjs` | build na Vercel | o mesmo, e decide se o Preview migra |
| `worker/src/index.mjs` | partida, entrada do `/cortar` e todo callback | worker de dev entregando em demandou.com; worker de produção entregando em dev.demandou.com |

Como sabe o ambiente: `DEMANDOU_AMBIENTE` explícito, ou `VERCEL_ENV` (production é produção, preview é dev), ou `RAILWAY_ENVIRONMENT_NAME` no worker. Contradição entre eles é erro. Na máquina do Bruno (local), apontar para o banco de produção só gera aviso, porque é assim que ele trabalha hoje.

Testes: `npx tsx --test scripts/testes/trava-do-ambiente-0610.test.mts`.

## 4. Scripts

| Script | Para quê |
|---|---|
| `scripts/deploy/copia-limpa.mjs` | deploy pela cópia limpa, dev ou produção. Sem `--executar` só mostra o plano; `--preparar` monta a cópia e roda o tsc sem publicar |
| `scripts/dev/com-env-dev.mjs` | roda um comando com o `.env.dev.local` e a trava (migrar, semear, conferir) |
| `scripts/dev/semente-dev.mts` | semente mínima: conta admin, conta de cliente de teste, um projeto em cada com o squad padrão. Sem dado de cliente |
| `scripts/dev/conferir-banco-dev.mts` | só leitura: em que banco está e quantos registros tem |
| `docs/ambientes/env.dev.modelo` | todas as variáveis de dev, sem segredo, com as que a trava confere marcadas |

## 5. Subir o ambiente no dia em que as contas existirem (minha parte, cerca de 1 hora)

1. Receber os valores da seção 7.
2. Montar o `.env.dev.local` a partir do modelo (fora do git: `.env*` já está no `.gitignore`).
3. `node scripts/dev/com-env-dev.mjs` (só a trava) e depois `node scripts/dev/com-env-dev.mjs npx prisma migrate deploy`.
4. `DEMANDOU_SEMENTE_SENHA=... node scripts/dev/com-env-dev.mjs npx tsx scripts/dev/semente-dev.mts` e `... npx tsx scripts/dev/conferir-banco-dev.mts`.
5. Railway: `railway environment new dev --duplicate production` (de `worker/` da pasta principal), trocar as variáveis do serviço pelo bloco WORKER do modelo, gerar domínio, ligar App Sleeping.
6. Vercel: conferir o que o Preview tem hoje (`npx vercel env ls preview`); remover `DATABASE_URL` e `DIRECT_URL` antigas do Preview e gravar as de dev com `npx vercel env add NOME preview`, uma a uma.
7. `npx vercel domains add dev.demandou.com` (depois do CNAME do Bruno).
8. `node scripts/deploy/copia-limpa.mjs --alvo dev --executar` e prova em dev.demandou.com.

## 6. Ensaio de quinta, 08/10, 11h

Dois roteiros, conforme o estado das contas na quinta.

### 6.1 Ensaio completo (contas da Demandou prontas e seção 5 feita)

| Hora | Passo | Quem | Prova |
|---|---|---|---|
| 11h00 | Conferir `/saude` dos dois workers ociosos | Claude | `emAndamento`, `trabalhos` e fila em zero |
| 11h05 | Mudança trivial na `dev` (um texto do rodapé) e commit | Claude | hash na `dev` |
| 11h10 | `copia-limpa.mjs --alvo dev --executar` | Claude | Preview no ar em dev.demandou.com |
| 11h20 | Bruno entra com a conta de cliente de teste, vê a mudança, abre o quadro | Bruno | print ou "ok" |
| 11h25 | Prova da trava: gravar no Preview um `DATABASE_URL` com o ref de produção, publicar, ver o build recusar; desfazer | Claude | log do build com "[trava build] ... BANCO DE PRODUÇÃO" |
| 11h35 | Prova do worker de dev com `WORKER_TRABALHO_FALSO=1`: subir um vídeo curto no projeto de teste | Bruno e Claude | callback chega em dev, nada aparece em produção |
| 11h50 | Aprovação; `git merge --ff-only dev` na branch de produção | Bruno aprova, Claude executa | hash igual nas duas |
| 11h55 | `copia-limpa.mjs --alvo producao --so app --executar` | Claude | demandou.com com a mudança |
| 12h05 | Prova pós-deploy: login, quadro, `/saude` | Claude | ok |
| 12h15 | Registro no HANDOFF, wiki e planner | Claude | card atualizado |

### 6.2 Ensaio seco (contas ainda não separadas; nada de nuvem novo)

Prova tudo o que não depende das contas, sem criar recurso e sem gasto.

| Passo | O que prova |
|---|---|
| `npx tsx --test scripts/testes/trava-do-ambiente-0610.test.mts` | a trava recusa cada cruzamento e deixa a produção de hoje passar |
| `node scripts/deploy/copia-limpa.mjs --alvo producao` estando na `dev` | recusa branch errada |
| o mesmo na branch de produção fora da janela | recusa fora da janela |
| `node scripts/deploy/copia-limpa.mjs --alvo dev --so app --preparar` | a cópia limpa monta, gera o Prisma e passa no tsc |
| (opcional, com a senha do Postgres 17 local) `.env.dev.local` apontando para `postgresql://postgres:<senha>@localhost:5432/demandou_dev`, migração, semente e conferência pelo `com-env-dev.mjs` | migrações e semente rodam num banco vazio; nada toca a produção |
| Bruno decide a data da separação e o ensaio completo vira o da semana seguinte | prazo de 10/10 fica com o que depende de código cumprido |

## 7. O que depende do Bruno (e os valores de que preciso)

Sem eles o ambiente não sobe; nada aqui tem custo novo além do já aprovado no relatório (Railway Pro e Vercel Pro passam a ser da Demandou; o ambiente dev do Railway custa entre US$ 2 e US$ 10 por mês com App Sleeping).

1. Criar a organização Supabase "Demandou" e, dentro dela, o projeto `demandou-dev` (Free, região us-east-2, igual à produção). Me passar: o ref do projeto e a senha do banco (ou as duas URLs prontas, pooler 6543 e direta 5432), colados no `.env.novas` da pasta do projeto, nunca no chat.
2. Railway: com o projeto `demandou` já no workspace da Demandou (ou, se preferir não esperar, autorizar que eu crie o ambiente `dev` onde ele está hoje), me dizer "pode criar o ambiente dev". Eu crio, gravo as variáveis e ligo o App Sleeping. Valor de que preciso: nenhum além da autorização.
3. Vercel: com o projeto no time da Demandou, criar a store de Blob `demandou-dev` (Storage, Create, Blob) e me passar os dois tokens e o id da store (no `.env.novas`).
4. HostGator: criar o registro CNAME `dev` apontando para `cname.vercel-dns.com`. Me avisar quando salvar.
5. Stripe, modo de teste: gerar `sk_test`, `pk_test`, recriar os 11 preços e o cupom no modo de teste (ou me autorizar a criá-los pela API de teste, sem custo), e criar o webhook de teste para `https://dev.demandou.com/api/webhooks/stripe`. Me passar: as duas chaves e o `whsec` do webhook.
6. Decidir as chaves de IA de dev: as mesmas da produção com os tetos baixos do modelo (zero trabalho) ou chaves próprias com limite mensal depois da separação. Me passar só a decisão.
7. Opcional: registrar `https://dev.demandou.com` como retorno nos apps do Google e do LinkedIn, se quiser provar login social em dev.
8. Opcional, para o ensaio seco: a senha do Postgres 17 local (no `.env.novas`).
9. Confirmar o ensaio de quinta, 08/10, 11h: completo (itens 1 a 5 feitos até quarta) ou seco.
10. Decidir se a `backup-0210` é renomeada para `producao` (o script já aceita qualquer nome por `DEMANDOU_RAMO_PRODUCAO`).
