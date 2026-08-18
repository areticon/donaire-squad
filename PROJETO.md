# Demandou: contexto do projeto

> Documento de entrada. Reescrito em 18/08/2026. A versão anterior estava
> desatualizada em quase tudo: dizia Next 14, Clerk, Neon e Blotato, todos já
> substituídos. Se algo aqui divergir do código, o código manda.

## O que é

SaaS de conteúdo multi-agente. Um squad de agentes de IA pesquisa, escreve,
desenha e publica conteúdo nas redes do cliente. Site: demandou.com.

**Onde o código vive:** `C:\Users\devan\opensquad-app`
**Repositório:** `areticon/donaire-squad` (o nome é histórico, do protótipo)
**Branch de trabalho atual:** `feat/own-auth`
**Produção na Vercel:** projeto `donaire-squad-1aos`, serve demandou.com

`C:\Users\devan\donaire-squad` é um clone antigo do protótipo Opensquad.
Não é o projeto vivo. Serve só como referência de tom de voz e aprendizados.

## Stack real (verificada no código)

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (Turbopack) + TypeScript |
| UI | Tailwind, tema escuro, laranja |
| Auth | **better-auth próprio** (não Clerk) |
| Banco | **Supabase Postgres** (não Neon) + Prisma 7 com adapter-pg |
| Storage | Vercel Blob, store **privado** |
| Pagamentos | Stripe |
| Texto | Claude Sonnet 4.5 com prompt caching |
| Imagem | Gemini |
| Vídeo gerado | Veo |
| Transcrição | Deepgram nova-3 |
| Publicação | APIs diretas de LinkedIn e X (Blotato saindo) |
| Deploy | Vercel |

## Decisões que valem mais que o código

1. **Sem intermediários.** Clerk e Pusher e Blotato saem; integrações próprias
   com as redes. Fornecedor de capacidade (Anthropic, Google, Deepgram,
   Stripe) é diferente de intermediário substituível.
2. **Micro-SaaS lucrativo.** Solo, sem investimento, lucro desde cedo.
   Meta: 30 pagantes em 90 dias.
3. **ICP: quem vende conhecimento** (consultor, mentor, coach, profissional
   liberal, prestador B2B). Canal dos primeiros clientes: rede Recrie,
   filtrada. O Recrie é canal, não nicho.
4. **Preços:** Pro R$149 (entrada e herói, 7 dias grátis), Business R$249,
   Studio R$449. Starter de R$49 foi removido em 18/08.
5. **Nova direção de produto:** o cliente grava um vídeo por semana e o squad
   transforma em conteúdo para todas as redes. Inverte o hábito vendido.

## Armadilhas já pagas, não repetir

- **Supabase host direto é IPv6 apenas.** Use sempre o pooler.
- **Supabase concede acesso total a `anon` em tudo no schema public.** Já
  revogado por migration, inclusive para tabelas futuras.
- **Prompt caching exige 1024 tokens de prefixo.** Projeto sem documentos de
  contexto não cacheia, e a API não avisa.
- **Mudar um byte nas regras globais invalida o cache de tudo.**
- **Blob privado não é alcançável por serviço externo.** Sem URL assinada no
  SDK; leitura é server-side em stream.
- **Rotas de vídeo precisam de `maxDuration`.** O padrão de 10s não serve.
- **Teste com curl não envia header `Origin`**, então esconde erro de CSRF que
  o navegador pega. Teste também com `Origin`.

## Documentos irmãos

- `ESTRATEGIA.md`: ICP, canais, posicionamento, decisões de negócio
- `MODELO_DE_NEGOCIO_v2.md`: custos abertos, margem, planos, projeções
- `HANDOFF.md`: histórico de sessões, o que foi feito e por quê

## Memória persistente

Notion, página **Donaire Brains**, pasta `10-profissional/demandou`.
Tarefas no banco **Ações, Bem Natura e Família**, com prefixo "Demandou:".
