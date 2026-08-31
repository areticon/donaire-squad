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
3. **ICP (revisto em 25/08): quem JÁ GRAVA fala por outro motivo.** O filtro
   deixou de ser desejo ("quem quer postar") e virou comportamento, porque a
   matéria-prima do produto passou a ser fala gravada. Quem não grava precisaria
   criar um hábito novo, e hábito é o que faltou a ele quando parou de postar.
   Ordem dos filtros: matéria-prima existente, depois dor visível (postou e
   sumiu), depois valor de um cliente dele. E o melhor comprador é quem tem a
   dor **resolvida cara**, ou seja já paga R$ 1.200 a R$ 3.500 por mês a um
   social media: orçamento provado em vez de orçamento a criar. Três personas
   com TAM e CPC medidos em `ESTRATEGIA.md`. Canal dos primeiros clientes: rede
   Recrie, filtrada. O Recrie é canal, não nicho.
4. **Preços:** Pro R$ 149 (entrada e herói, 7 dias grátis com cartão),
   Business R$ 249, Studio R$ 449. Os três têm **plano anual a 10
   mensalidades** (R$ 1.490, R$ 2.490 e R$ 4.490), e o card mostra o mensal
   equivalente em destaque, não o total do ano. O anual existe pelo CAC, não
   pelo desconto: põe a margem no caixa antes de a fatura do anúncio fechar.
   Anual à vista não tem multa de fidelidade, e não deve ter: o caixa já
   entrou, e cobrar sobre valor pago é cobrança dupla (art. 51 do CDC).
   **Revisado e MANTIDO em 25/08**, contra as alternativas de R$ 397, R$ 697 e
   R$ 997. A decisão obriga três coisas: tráfego pago só na persona do consultor
   e só vendendo o anual (teto de CPC R$ 6,89); a conversão da landing sai de
   melhoria e vira parede mestra, porque a conta só fecha em 3,5% de visita para
   cadastro, que é 60% acima do benchmark; e a oferta de fundador não tem
   desconto (R$ 1.490 é o preço de lista), então a escassez vem da trava
   vitalícia e do atendimento pessoal, nunca de preço.
5. **O vídeo é o produto, não um formato entre outros** (decisão de 22/08, que
   promove a decisão anterior). O cliente grava um vídeo e o squad edita e
   transforma em conteúdo para todas as redes. Consequências práticas: a
   verificação do app OAuth no Google deixa de ser item de backlog e vira
   caminho crítico; a Ideação passa a ter dois caminhos (a partir de um vídeo,
   gerando shorts e reels; ou a partir de um tema com IA, gerando imagem,
   carrossel, artigo e texto); e a landing precisa contar essa história.
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
- **No "Login do Facebook para Empresas", `/me/accounts` não devolve página
  nenhuma.** O token é vinculado ao portfólio: as páginas saem por
  `/me/businesses` e, em cada portfólio, `owned_pages` e `client_pages`; o
  token de publicação da página exige uma terceira chamada, na leitura direta
  dela. Provado no log com as três permissões de página "granted" e
  `{"data":[]}` na resposta.
- **E `/me/businesses` exige `business_management`.** Sem ela o token não
  enxerga portfólio nenhum, e como as páginas só saem por lá, o app fica cego
  para tudo mesmo com todas as permissões de página concedidas.
- Página e app precisam estar no mesmo portfólio; vínculo entre portfólios
  diferentes ("Conectar ativos") não é oferecido para páginas.

**Storage**
- **Token do Vercel Blob quebra em silêncio.** O store segue ativo e listando
  arquivos antigos, e só o upload novo falha, com "Access denied, please
  provide a valid token for this resource". Em 22/08 o token estava inválido
  em produção e local, e o produto de vídeo ficou quebrado sem ninguém notar,
  porque ninguém tinha subido vídeo desde a rotação. Testar token novo com
  `vercel blob put --access private --rw-token <token>` ANTES de gravar em
  qualquer ambiente: reproduz o erro exato do navegador em cinco segundos.
- `vercel env pull` escreve `[SENSITIVE]` no lugar do valor de variáveis
  sensíveis. Comparar tamanho de string puxada assim leva a diagnóstico errado.

**IA e modelos, parte 2**
- **`max_tokens` inclui os tokens de PENSAMENTO.** No Sonnet 5 o pensamento
  adaptativo vem ligado por padrão, então teto apertado não gera resposta
  curta, gera resposta VAZIA: a resposta volta só com blocos de pensamento e
  `stop_reason: max_tokens`. Regra da casa: nada abaixo de 4000 em chamada que
  faz trabalho de verdade. Subir o teto não encarece por si, porque o cobrado é
  o que o modelo gera.
- **E o pensamento costuma ser a MAIOR parte da saída, não a resposta.** Medido
  em 22/08 na seleção de trechos de um vídeo de 27 minutos: 10.916 tokens de
  saída para menos de 1.000 tokens de JSON. Consequência prática: para prever
  quanto tempo uma chamada leva, olhe o tamanho da ENTRADA, não o da resposta
  esperada, e não conte com encolher a resposta para caber num teto de tempo.
- **Não peça ao modelo que copie de volta o que você já tem.** A seleção pedia
  a fala verbatim de cada trecho, que já estava no banco com marcação de tempo
  por palavra. Recortar em código é instantâneo, de graça e mais fiel, porque
  o modelo era só *instruído* a não editar. Cuidado ao fazer isso: os tempos
  que ele devolve são aproximados e abrem o trecho no meio da frase, então o
  recorte precisa encaixar em fronteira de frase.

**Serverless**
- **Função morta por timeout não consegue gravar erro.** A Vercel derruba no
  `maxDuration` e o `catch` nunca roda: o status fica como estava e a interface
  parece que nada aconteceu. Falha silenciosa por construção. Trabalho longo
  não pode viver dentro do ciclo da requisição.
- **E o que torna esse silêncio indetectável é o vocabulário do estado.** Se
  "pronto para rodar" e "rodando" forem o mesmo valor, os dois casos são
  literalmente indistinguíveis, e nenhum log conserta isso. Estado de trabalho
  precisa ser diferente de estado de espera, e precisa de `startedAt` com
  prazo. Quem lê declara morto o que passou do prazo, porque o morto não fala.
- **A Vercel aqui é Pro** (confirmado em 22/08): teto de função 800s e cron por
  minuto. A nota antiga de "2 crons do plano gratuito" está errada.
- Verificação de duplicata na aplicação não resolve corrida: as duas rotas leem
  antes de qualquer uma escrever. Só restrição no banco resolve.

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
