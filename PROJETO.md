# Demandou: contexto do projeto

> Documento de entrada. Reescrito em 18/08/2026 e atualizado em 21/08/2026. Se
> algo aqui divergir do código, o código manda.

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
| Auth | better-auth próprio, com login por senha, Google e LinkedIn |
| Banco | Supabase Postgres + Prisma 7 com adapter-pg |
| Storage | Vercel Blob, store **privado** |
| Pagamentos | Stripe, só cartão |
| Texto | **Claude Sonnet 5** com prompt caching |
| Imagem | Gemini (três modelos em cascata, a consolidar) |
| Transcrição | Deepgram nova-3 **multilíngue** |
| Publicação | APIs diretas de LinkedIn, X e Instagram |
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
   Business R$ 249, Studio R$ 449. Os três têm **plano anual a 10
   mensalidades** (R$ 1.490, R$ 2.490 e R$ 4.490), e o card mostra o mensal
   equivalente em destaque, não o total do ano. O anual existe pelo CAC, não
   pelo desconto: põe a margem no caixa antes de a fatura do anúncio fechar.
   Anual à vista não tem multa de fidelidade, e não deve ter: o caixa já
   entrou, e cobrar sobre valor pago é cobrança dupla (art. 51 do CDC).
5. **O cliente grava um vídeo por semana** e o squad transforma em conteúdo para
   todas as redes. Inverte o hábito vendido.
7. **O onboarding começa conectando as redes** (decisão de 21/08). Conectar
   primeiro é o que permite ler o perfil e pré-preencher o resto, e o
   assistente **preenche os campos** em vez de sugerir em texto, sempre com
   opção de ajuste. A análise automática do perfil é a fase seguinte.
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
- **A Meta busca a mídia por URL pública.** Blob privado e data URL não
  alcançam; quem resolve é a rota assinada `/api/media/ig/[token]`.
- **O LinkedIn não expõe leitura dos posts do membro.** Só perfil básico e
  publicar. Qualquer análise do conteúdo do cliente depende de Instagram e X.
- **`NEXT_PUBLIC_*` é resolvida em tempo de build.** Gravar a variável na
  Vercel não basta, e a ausência não gera erro nenhum: o recurso só some. Onde
  o servidor puder responder em runtime, prefira isso (ver
  `/api/auth/providers`).
- **Logo próprio na tela de consentimento do Google dispara verificação de
  marca**, mesmo com escopos básicos. E ela reprova semelhança com marcas
  conhecidas, o que é um bom detector gratuito de risco de trademark.
- Teste com curl não envia header `Origin`, então esconde erro de CSRF.
- Pedir um meio de pagamento não ativado faz o Stripe recusar a sessão inteira.
- Constante compartilhada entre cliente e servidor precisa morar em módulo sem
  import de servidor, senão o driver do banco vai para o bundle do navegador.

**Confiança e reputação do domínio**
- **Site que vende sem identificar o fornecedor é lido como phishing.** O
  demandou.com foi marcado pelo Google como "página enganosa" em 20/08 porque
  pedia senha e cartão sem dizer quem era o dono: razão social, CNPJ, endereço
  e contato existiam só dentro de `/terms`. Isso também é obrigação legal, pelo
  Decreto 7.962/2013 art. 2º.
- Página de login que exibe a marca do Google ou do LinkedIn acima de um campo
  de senha, em domínio sem tráfego, é o padrão que a heurística procura.
- Sem `X-Frame-Options` ou `frame-ancestors`, qualquer site embute a nossa tela
  de login dentro de uma página de golpe.
- `returnTo` sem validação vira redirecionamento aberto pelo truque do
  userinfo: `https://demandou.com@site-de-golpe.com` mostra o nosso domínio e
  leva para outro.
- **www e apex servindo o mesmo site quebra OAuth em silêncio.** Cookie é
  host-only: quem navega pelo www inicia o login com o cookie no www e o
  callback chega no apex sem cookie, dando state_mismatch. O redirect 308 de
  www para apex no next.config elimina a classe. Diagnóstico veio do log de
  produção em tempo real, não de suposição.

**Banco, parte 2: o pooler**
- **`DATABASE_URL` na porta 5432 é modo SESSÃO e derruba a produção.** Cada
  conexão fica presa ao cliente, teto de 15, e em serverless isso estoura.
  Runtime usa a **6543** (modo transação, multiplexa); `DIRECT_URL` fica na
  5432 porque migrations precisam dela. Diagnóstico contra produção usa a
  6543 e fecha a conexão no `finally`.

**Meta, além do Instagram**
- App Business com "Login do Facebook para Empresas" **não aceita permissão
  solta no `scope`**: exige uma Configuração criada no painel, passada por
  `config_id`.
- A lista de permissões disponíveis é filtrada pelo **caso de uso** do app.
- Sem `auth_type=rerequest`, a Meta oferece "continuar com as configurações
  anteriores" e reaproveita concessão velha, inclusive de tentativa falha.
- **Página dentro de portfólio empresarial não aparece em `/me/accounts`** se
  o app estiver em outro portfólio. Permissão concedida e lista vazia é
  sintoma de propriedade de ativo, não de permissão.

**Interface**
- **Retorno de integração precisa falar na tela.** Fluxo de OAuth que volta
  calado transforma bug de 5 minutos em investigação de uma hora.

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
