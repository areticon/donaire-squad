# Demandou: contexto do projeto

> Documento de entrada. Reescrito em 18/08/2026, atualizado em 29/09/2026 (noite). Se
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
| UI | Tailwind, tema CLARO padrão desde 28/09 (escuro opcional, chave `tema` no localStorage); escritório 3D em react-three-fiber com bonecos de massinha |
| Auth | better-auth próprio, com login por senha, Google e LinkedIn |
| Banco | Supabase Postgres + Prisma 7 com adapter-pg |
| Storage | Vercel Blob: store **privado** para gravações; store **público** para mídia que vai ao ar e material que o cliente sobe (`/api/campanha/material`) |
| Pagamentos | Stripe, só cartão, **contrato anual pago à vista** (Starter R$ 35.964, Pro R$ 47.964, Enterprise R$ 68.004), sem teste grátis |
| Texto | **Claude Opus 5** em todos os agentes, com prefixo cacheado de 1 h |
| Imagem | **GPT Image 2** em qualidade média, uma geração por proporção; Gemini só como alternativa |
| Vídeo por IA | **Veo 3.1** rápido ou cheio, 8 a 60 s, narração em português com voz escolhida; faststart em TypeScript na entrega |
| Transcrição | Deepgram nova-3 **multilíngue** |
| Publicação | APIs diretas de LinkedIn, X, Facebook, Instagram (feed, reels, stories) e TikTok (sandbox, auditoria pendente); YouTube pela esteira de gravação |
| Pesquisa | Gemini com busca Google (radar da semana e brief do Roberto) e **API oficial do X** (`X_BEARER_TOKEN`, busca recente) |
| Fila | Tabela `Trabalho` própria, com duas trilhas por grupo (campanha e vídeo) |
| Deploy | Vercel, com `prisma migrate deploy` no build |

**Vídeo gerado por IA saiu em 18/08 e VOLTOU em 19/09**, com as três regras que
faltavam: um fornecedor sem cascata, custo gravado em `ai_usage` a cada
geração, e carteira de crédito separada do plano. Desde 21/09 ele vai de 8 a
60 segundos: acima de 8 s é uma cadeia de gerações encadeadas na fila, e o
crédito é por GERAÇÃO, não por segundo. Vídeo a partir da gravação do próprio
cliente continua existindo, e é outro caminho (a esteira do Vitor).

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
4. **Preços (tabela de 02/09/2026, conferida em `lib/planos.ts`):** Essencial
   R$ 397 (entrada, 7 dias grátis com cartão), **Autoridade R$ 697** (o
   herói, em destaque) e Estúdio R$ 1.997 (5 marcas, para social media e
   agência). Os nomes antigos (Pro, Business, Studio) sobrevivem como CHAVE
   TÉCNICA no banco e nas envs do Stripe, e nunca aparecem para o cliente. Os
   três têm **plano anual a 10
   mensalidades** (R$ 3.970, R$ 6.970 e R$ 19.970), e o card mostra o mensal
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
4b. **Uma conta, um lugar** (21/09). Preço que a tela mostra e preço que o
   servidor cobra saem da MESMA função, e a tabela de crédito mora em
   `lib/credits/tabela.ts`, sem dependência, para os dois lados importarem.
   A regra nasceu de dois defeitos no mesmo dia: a janela da campanha dizia
   688 créditos e o servidor recusava por custar mais que o saldo, e o crédito
   do vídeo era proporcional aos segundos quando o gerador cobra por chamada.
   **Conta que existe em dois lugares é conta que vai divergir**, e quem
   descobre é sempre o cliente.

5. **O vídeo é o produto, não um formato entre outros** (decisão de 22/08, que
   promove a decisão anterior). O cliente grava um vídeo e o squad edita e
   transforma em conteúdo para todas as redes. Consequências práticas: a
   verificação do app OAuth no Google deixa de ser item de backlog e vira
   caminho crítico; a Ideação passa a ter dois caminhos (a partir de um vídeo,
   gerando shorts e reels; ou a partir de um tema com IA, gerando imagem,
   carrossel, artigo e texto); e a landing precisa contar essa história.
7. **O onboarding começa conectando as redes, e a segunda etapa é a Marca**
   (21/08, reordenado em 17/09). A ordem é `Redes, Marca, Voz, Ideação,
   Agenda, Ativação`. Conectar primeiro é a abertura sem fricção; a Marca vem
   logo depois porque é onde a pessoa sobe os documentos, e **é deles que as
   etapas seguintes são preenchidas**: a rota `sugerir-campos` lê o que foi
   compilado dos PDFs e escreve nicho, público, descrição e voz, que a pessoa
   então revisa. Até 17/09 o assistente pedia essas três coisas ANTES de
   aceitar o documento que as responde, e o botão de preencher com IA mandava
   ao modelo o formulário vazio, ou seja, adivinhava em vez de ler. Voz
   continua antes de Ideação (22/08). A análise automática do perfil da rede
   é a fase seguinte.
6. **Tráfego pago é a decisão em aberto.** O cenário que fecha existe, mas
   depende de duas variáveis não medidas. Ver a nota do CAC no Notion.
8. **Nenhum número sem fonte vai ao ar** (09/09). A régua é de código, não
   de prompt: cada frase com número precisa aparecer na pesquisa bruta, perto
   de uma palavra de conteúdo da própria frase. O brief é devolvido ao
   Roberto, a Vera recebe as violações medidas, e a tesoura corta antes de
   gravar. Custo assumido: número verdadeiro que a busca não trouxe também
   cai. Preferimos post com menos números a número inventado em nome de
   cliente. Ver `afirmacoesSemLastro` em `app/api/pipeline/run/route.ts`.
9. **Proveniência guardada** (09/09). O card do Roberto leva a pesquisa
   bruta e as fontes em `metadata`. "Bate com o brief" não é verificação: é
   conferir a cópia contra a cópia.
10. **Um post tem sempre um de quatro estados, com a mesma palavra e cor em
    toda tela** (10/09): Publicado, Agendado (sai sozinho), Rascunho (não
    sai), Falhou (motivo e o que fazer). Estado é derivado do dado na hora de
    mostrar, nunca texto gravado. `lib/posts/estado.ts`. A Agenda é de
    leitura; agir continua no card do Paulo (um lugar só para a mesma ação).
11. **O que dá para medir, mede-se antes de pedir opinião** (09/09). Limites
    de rede, tamanho de tweet, lastro de número: vão prontos para a Vera, com
    a regra de reprovar escrita. Modelo não conta caractere.
12. **Limite de plano vira comportamento de produto sem ninguém decidir**
    (09/09). O cron diário do plano gratuito sobreviveu à migração para o pago
    e virou "seu post sai amanhã". Hoje o cron roda a cada 5 minutos; toda
    restrição herdada de plano é revisada quando o plano muda.
13. **Páginas do LinkedIn exigem um segundo app** com a Community Management
    API, que não convive com o Sign In no mesmo app (09/09). O app pessoal
    fica como está; o de páginas só tem escopos de organização.

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

## Decidido e ainda não feito (22/09/2026)

**1. FEITO em 22/09 (parte 162).** O roteiro do vídeo ganhou doutrina de
história (tese antes das cenas, gancho definido pelos três primeiros segundos,
ligação obrigatória por MAS ou POR ISSO, só o que o post diz, o específico
contra o genérico) e três guardas de código: número que a narração afirma e o
post não tem, narração que não cabe no tempo, e cena sem fala num vídeo que
pediu voz. O clipe de 8 s passou a usar o MESMO caminho. A Vera não revisa
roteiro, de propósito: o que é medível virou código, e ela custaria mais uma
chamada de Opus por dia de vídeo. A régua de fala virou 2,4 palavras por
segundo, medida contra o mp4 do dia 21. Provado com dois clipes de 8 s
gerados de verdade (US$ 2,40).

O que fica aberto disso: em 8 segundos cabem o gancho e a virada, e o fecho
fica apertado. Quem tem tese para entregar precisa de 15 s ou 30 s, e isso é
escolha de produto, não de prompt.

**2. Reel e story de PÁGINA do Facebook estão escritos da documentação, e não
medidos contra a API.** As páginas dependem do App Review da Meta (card 520).
Instagram (feed, reel e story) e Facebook feed rodam pelo caminho já provado.

**3. A proporção segue o formato no VÍDEO, e não na ARTE.** Uma imagem marcada
como story sai em 4:5, o retrato do Instagram, e não em 9:16: ela publica e o
Instagram encaixa, mas não ocupa a tela cheia. Consertar soma uma proporção ao
dia, ou seja uma geração a mais (42 créditos por dia), e por isso é decisão de
preço, não detalhe de implementação.

**4. A escolha do formato não alcança o post único nem a campanha por vídeo.**
Ela vive na janela da campanha por tema, que é o caminho principal. Os dois
outros continuam saindo no feed, que é o que sempre fizeram.

**5. Refazer não tem caminho para o vídeo por IA.** Refazer um dia de vídeo
refaz texto e arte do quadro; o clipe se refaz pelo caminho do vídeo
(`refazerCorte`, `refazerCapa`), que é outro botão e outra carteira.

**6. A cota do Google é o teto do produto.** Tier 1 dá 10 gerações de vídeo por
dia para a plataforma inteira, e um vídeo de 60 s gasta 9. O Tier 2 sobe para
50. A janela já avisa quando não cabe, e o teto vive em
`VIDEO_GERACOES_POR_DIA`.

## Portão 2 do lançamento, implantado em 22/09 (parte 164)

O que impedia a plataforma de aguentar mais de um cliente:

- **Teto de vídeo por plano**: Essencial 2 gerações por dia (15 s), Autoridade
  4 (30 s), Estúdio 9 (60 s). O teto do dia é o menor entre o que sobra na
  plataforma e o que o plano permite, e a guarda roda antes do débito.
- **Teto de armazenamento**: 12, 24 e 96 GB, medidos contra o consumo real
  (uma gravação pesa ~900 MB). Bloqueia o upload novo, nunca apaga o antigo.
- **Painel de admin em `/admin`**, com margem por cliente. 404 para quem não é
  admin.
- **Peça reprovada não cobra para ser refeita**, com teto de 3 por projeto por
  dia.
- **Cota presa há mais de uma hora avisa os admins.**

Ficou de fora, por ser decisão de dinheiro dele: separar o banco de produção
do de desenvolvimento (R$ 138/mês contra R$ 116 de custo fixo total).

Achado pelo painel no primeiro minuto: **38 contas, 19 nas últimas 24 h,
nenhuma com projeto, 15 com padrão de robô**. Não vaza dinheiro, mas polui a
métrica de conversão e pede barreira no cadastro antes de abrir ao público.

## Estado em 29/09/2026 (partes 176 a 189 do HANDOFF)

**Público e venda.** Empresas que faturam acima de R$ 100 mil por mês, venda
por demonstração com os sócios (Bruno Donaire e Matheus Gaberline), contrato
anual à vista. Planos: Starter R$ 2.997/mês (20 mil créditos, 2 vídeos por IA
de 30 s no Cheio), Pro R$ 3.997 (40 mil, 4 vídeos, 4 edições de estúdio),
Enterprise R$ 5.667 (60 mil, 10 vídeos, 10 edições). videoCredits 4.160 / 8.320 /
20.800. Vídeo próprio do cliente não gasta crédito e é o caminho incentivado.

**No ar desde 22/09:**
- Tema claro padrão; escritório 3D redesenhado com bonecos de massinha e avatar
  personalizável do usuário (`aparenciaDoBoneco`).
- TikTok (Login Kit, PKCE, publicação; sandbox até a auditoria).
- Radar da semana e memória de 8 semanas (`lib/research/radar-da-semana.ts`),
  com a API oficial do X (`lib/research/x-search.ts`): temas novos, sem repetir.
- Material próprio por dia (`components/posts/origem-do-dia.tsx`,
  `config.midiaDoCliente`), vários destinos por rede (`destinosDaRede`), texto
  editável no card do Paulo.
- Vídeo: refazer pelo chat (`lib/media/regerar-video.ts`), espera curta no
  engasgo do Veo (1, 2, 3, 5 min), checkpoint que descarta operação morta,
  espera o arquivo ficar ACTIVE antes de estender, faststart
  (`lib/media/faststart.ts`), voz do narrador.
- Andamento de cada dia no calendário (`lib/pipeline/andamento-dos-dias.ts`).
- Métricas por rede com motivo (`lib/analytics/sincronizar.ts`) e painel com
  gráficos (`lib/painel/numeros-do-painel.ts`, `components/painel/graficos.tsx`).
- Faixa do plano que se atualiza sozinha (`/api/plano-na-tela`).
- Landing atualizada com o vídeo novo; pitch deck v4 (artefato
  ANNpbVV4DKDhBB9EQCxMRv) com mercado pesquisado.

**Próximas frentes, na ordem:**
1. Linha editorial: tela de ideias e roteiros de vídeo, e o roteiro alimenta o
   editor.
2. Modo de edição de vídeo: estilo escolhido na lista
   (`docs/estilos-de-edicao-de-video.md`) ou escrito pelo cliente, vários
   arquivos com a cena de cada um, imagens com posição e forma no vídeo,
   duração máxima por plano (1 h Starter, 2 h Pro, 5 h Enterprise).
3. Relatório automático de resultados com retreino dos agentes.
4. Agente de tráfego pago (Meta; cria em pausa, só gasta com aprovação e teto
   do cliente).
5. Agente vendedor no WhatsApp (depois).

**Dependências externas:** revisões da Meta, do LinkedIn e do TikTok em
análise; permissões de métricas (pages_read_engagement,
instagram_business_manage_insights, video.list) e de anúncios (ads_management)
ficam para a revisão seguinte; conta de anúncios de teste.

## Fim de 29/09/2026: o teste do Bruno (partes 192 a 195 do HANDOFF)

**No ar desde 29/09:**
- Três portas de entrada (aba Criar, onde o projeto abre): editar o próprio
  vídeo (recomendado), gêmeo digital (em teste) e gerar tudo com IA, com a
  sugestão de intercalar. Abas: Criar, Linha editorial, Gestor, Posts,
  Resultados, Configurações, Editar setup, Treinamento.
- Squad de 11 por rede: Roberto, Lucas (LinkedIn), Xavier (X), Igor
  (Instagram), Fernanda (Facebook), Tiago (TikTok), Yan (YouTube), Diana,
  Vitor, Paulo e a Vera como gerente, que grava lições para quem erra.
- Escritório com mesa dupla, sala da Vera, sala do usuário e visitas dos
  agentes com pedido de retorno e sugestões para o documento do projeto.
- Linha editorial (ideias pelo radar e roteiro por cenas editável).
- Catálogo de estilo em camadas (24 linguagens com arte, câmera, efeitos,
  look, texto livre interpretado), gravado em `Project.videoEstiloEscolha`.
- Limites por plano: 1 h, 2 h e 5 h; arquivo de 4, 8 e 20 GB; transcrição de
  arquivo grande pelo áudio extraído no worker.

**O teste mostrou que a edição ainda não cumpre o que a tela promete.** No
vídeo de 22 min do projeto Empreendedorismo Cristão: miniatura quebrada nos
cards (aponta para o MP4), capa com o rosto distorcido pela IA, cortes sem
efeitos e com um "né" no meio da fala, estilo Vox escolhido e não aplicado
(só o perfil de legenda "sério" chega ao worker; a Higgsfield não está ligada
à edição), vídeo completo sem player, "agendado" sem aprovação (é só a data
planejada, mas engana), corte reprovado pela Vera chegando ao cliente, artes
fora do estilo, marcador "===LINKEDIN===" vazando para uma peça e o crédito
da edição cerca de 10 vezes abaixo do custo real.

**Próximas frentes, TODAS para 30/09 (reunião com investidor):** a lista
completa e ordenada está em `CONTINUAR.md` e no card bloqueante do planner.
Por último, o vídeo curto de venda para a landing.

## Documentos irmãos

- `ESTRATEGIA.md`: ICP, canais, posicionamento
- `MODELO_DE_NEGOCIO_v2.md`: custos abertos e margem (o storage está defasado)
- `HANDOFF.md`: histórico de sessões, o que foi feito e por quê
- `docs/estilos-de-edicao-de-video.md`: catálogo dos 24 estilos de edição para o editor de vídeo

## Memória persistente

Notion, página **Donaire Brains**, pasta `10-profissional/demandou`. As notas
vivas são a tabela de custos, o mapa da jornada e a nota do CAC.
Tarefas no banco **Ações, Bem Natura e Família**, com prefixo "Demandou:".
