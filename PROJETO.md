# Demandou: contexto do projeto

> Documento de entrada. Reescrito em 18/08/2026, ao fim de uma sessão longa que
> mudou stack, produto e economia. Se algo aqui divergir do código, o código
> manda.

## O que é

SaaS de conteúdo multi-agente. Um squad de agentes de IA pesquisa, escreve,
desenha e publica conteúdo nas redes do cliente. Site: demandou.com, **no ar**.

**Onde o código vive:** `C:\Users\devan\opensquad-app`
**Repositório:** `areticon/donaire-squad` (nome histórico, do protótipo)
**Branch padrão:** `master`. Não existe `main`.
**Branch de trabalho:** `feat/own-auth`, sincronizado com o master.
**Produção na Vercel:** projeto `donaire-squad-1aos`, serve demandou.com.

`C:\Users\devan\donaire-squad` é clone antigo do protótipo. Não é o projeto vivo.

## Stack real (verificada no código)

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (Turbopack) + TypeScript |
| UI | Tailwind, tema escuro na paleta do Discord |
| Auth | better-auth próprio |
| Banco | Supabase Postgres + Prisma 7 com adapter-pg |
| Storage | Vercel Blob, store **privado** |
| Pagamentos | Stripe, só cartão |
| Texto | **Claude Sonnet 5** com prompt caching |
| Imagem | Gemini (três modelos em cascata, a consolidar) |
| Transcrição | Deepgram nova-3 **multilíngue** |
| Publicação | APIs diretas de LinkedIn e X |
| Deploy | Vercel, com `prisma migrate deploy` no build |

**Vídeo gerado por IA (Veo) foi removido em 18/08.** Vídeo agora vem da gravação
do próprio cliente.

## Ambientes

**Um só, por decisão.** Produção usa o projeto Supabase `demandou`, e o
`.env.local` aponta para o mesmo banco. Com zero cliente é aceitável. Quando
entrarem os 10 primeiros, assinar o Supabase Pro e separar.

O motivo de não ter separado agora: o plano gratuito permite 2 projetos por
organização e a `donaire` já usa os dois. O Pro custaria R$ 138 por mês, mais
que o dobro do custo fixo atual de R$ 116.

## Decisões que valem mais que o código

1. **Sem intermediários.** Clerk, Pusher e Blotato saíram. Fornecedor de
   capacidade (Anthropic, Google, Deepgram, Stripe) é diferente de
   intermediário substituível.
2. **Micro-SaaS lucrativo.** Solo, sem investimento, lucro desde cedo. Meta: 30
   pagantes em 90 dias.
3. **ICP: quem vende conhecimento.** Canal dos primeiros clientes: rede Recrie,
   filtrada. O Recrie é canal, não nicho.
4. **Preços:** Pro R$ 149 (entrada e herói, 7 dias grátis com cartão),
   Business R$ 249, Studio R$ 449. Existem no Stripe desde 18/08.
5. **O cliente grava um vídeo por semana** e o squad transforma em conteúdo para
   todas as redes. Inverte o hábito vendido.
6. **Tráfego pago é a decisão em aberto.** O cenário que fecha existe, mas
   depende de duas variáveis não medidas. Ver a nota do CAC no Notion.

## Armadilhas já pagas, não repetir

**Banco e infraestrutura**
- Supabase host direto é IPv6 apenas. Use sempre o pooler.
- Supabase concede acesso total a `anon` em tudo no schema public. Revogado por
  migration, inclusive para tabelas futuras.
- Migrations precisam de `DIRECT_URL`, porque o pooler em transaction mode não
  aceita o DDL do Prisma Migrate.
- **Variável usada no build precisa ser Non-sensitive na Vercel.** Sensitive não
  é exposta durante o build, só em runtime, e o painel nunca mostra o valor de
  volta (o que parece falha de gravação, mas é o recurso funcionando).

**IA e modelos**
- Prompt caching exige 1024 tokens de prefixo. Projeto sem documentos de
  contexto não cacheia, e a API não avisa.
- Mudar um byte nas regras globais invalida o cache de tudo.
- **No Sonnet 5 o pensamento adaptativo vem ligado por padrão.** Nunca leia
  `content[0]` supondo texto: junte todos os blocos de texto.
- O modelo estoura o limite de 280 do X mesmo instruído. Valide em código.
- JSON com quebra de linha crua dentro de string é inválido, e o modelo emite
  isso de vez em quando. Onde o texto tem quebra de linha, use delimitador.

**Mídia**
- Blob privado não é alcançável por serviço externo. Leitura é server-side.
- Rotas de vídeo precisam de `maxDuration`. O padrão de 10s não serve.
- **O nova-3 em pt-BR apaga jargão em inglês, sem erro e sem rastro.** Por isso
  `language=multi` mais `keyterm` com os nomes próprios do cliente.
- `keyterm` satura entre 5 e 10 termos. Glossário grande não funciona.
- A Deepgram devolve 200 com lixo dentro quando o idioma está errado.
- **O bitrate de gravação é a maior alavanca de margem do produto de vídeo**, e
  a transferência é 58% do custo, não a transcrição nem a IA.

**Integrações**
- Teste com curl não envia header `Origin`, então esconde erro de CSRF.
- Pedir um meio de pagamento não ativado faz o Stripe recusar a sessão inteira.
- Constante compartilhada entre cliente e servidor precisa morar em módulo sem
  import de servidor, senão o driver do banco vai para o bundle do navegador.

**A regra geral que resume todas:** em integração com terceiro, medir o que
voltou. Nunca confiar no código de status nem na instrução dada.

## Documentos irmãos

- `ESTRATEGIA.md`: ICP, canais, posicionamento
- `MODELO_DE_NEGOCIO_v2.md`: custos abertos e margem (o storage está defasado)
- `HANDOFF.md`: histórico de sessões, o que foi feito e por quê

## Memória persistente

Notion, página **Donaire Brains**, pasta `10-profissional/demandou`. As notas
vivas são a tabela de custos, o mapa da jornada e a nota do CAC.
Tarefas no banco **Ações, Bem Natura e Família**, com prefixo "Demandou:".
