# App Review da Meta: dossiê de submissão

> Preparado em 21/08/2026. App **Demandou** (id 1808987136949506), configuração
> "API com login do Instagram" (Instagram App ID 1073129042249854).
> O que este review destrava: **qualquer cliente da Demandou** conectar o
> Instagram e publicar. Hoje só funciona para contas de teste do app.

## As quatro peças que a submissão exige

1. **Configuração do app completa.** FEITA em 21/08: ícone 1024, política de
   privacidade, termos, exclusão de dados apontando para o callback real,
   domínio, categoria. O aviso "ineligible for submission" sumiu.
2. **Verificação da empresa.** PENDENTE, e é o único bloqueio duro. Emperrou
   em 20/08 num sistema de risco (e-mail aceito e recusado em seguida, padrão
   de conta nova). Regra combinada: retomar por volta de **23/08** na Central
   de Segurança do portfólio empresarial Demandou. Sem ela a Meta não conclui
   review de app Business.
3. **Screencast** demonstrando cada permissão em uso real. Roteiro abaixo.
4. **Justificativas + instruções de teste** para o revisor. Textos prontos
   abaixo, em inglês (fila de review em inglês anda melhor que em português).

## Escopo desta primeira submissão

Somente as duas permissões do Instagram:

- `instagram_business_basic`
- `instagram_business_content_publish`

O Facebook (`pages_manage_posts` etc.) fica para uma segunda submissão,
depois desta aprovar. Motivo: cada permissão a mais é superfície de reprovação
a mais, o fluxo do Facebook foi codificado hoje e ainda não foi testado de
ponta a ponta, e a prioridade de produto é o Instagram. Re-submissão de app já
aprovado costuma andar mais rápido que a primeira.

## Ordem de execução

1. Bruno percorre a jornada completa em produção (o teste que já ia fazer).
   Publicar o primeiro post real no Instagram É o pré-requisito do vídeo: não
   se grava screencast de fluxo que nunca rodou.
2. Corrigir o que o teste quebrar.
3. Gravar o screencast limpo (roteiro abaixo). OBS já instalado.
4. Em ~23/08, retomar a verificação da empresa na Central de Segurança.
5. Com a verificação aprovada: submeter as duas permissões com os textos
   deste arquivo.
6. Aprovado: publicar o app (sai de "Não publicado") e o Instagram abre para
   qualquer cliente.

## Roteiro do screencast (3 a 5 minutos, sem cortes no fluxo crítico)

Gravar a tela inteira do navegador, idioma da interface pode ser português
(o revisor segue o vídeo, não o texto). Sem narração é aceitável; legendas
curtas ajudam. Um vídeo só cobre as duas permissões.

1. **Login**: abrir demandou.com, entrar com a conta de teste do revisor
   (credenciais abaixo), mostrando a URL na barra.
2. **Conexão** (`instagram_business_basic`): no assistente de setup, etapa
   "Redes Sociais", clicar em Conectar no Instagram. Mostrar a tela de
   consentimento da Meta INTEIRA, com as permissões listadas, e autorizar
   com a conta profissional de teste. De volta à plataforma, mostrar o nome
   de usuário e avatar do Instagram aparecendo conectado (é o uso visível do
   basic: identificar a conta conectada).
3. **Publicação** (`instagram_business_content_publish`): abrir um post
   pronto com imagem no kanban, clicar em Publicar, escolher Instagram.
   Mostrar o status mudando para publicado e o link do post.
4. **Prova**: abrir instagram.com na conta de teste e mostrar o post no feed.
5. **Desconexão**: painel de conexões, desconectar o Instagram, mostrando que
   o usuário controla a conexão.

## Textos para a submissão (colar no formulário)

### instagram_business_basic — "Tell us how you'll use this permission"

> Demandou (demandou.com) is a SaaS that helps solo professionals keep a
> consistent presence on social media. AI agents research, write and design
> posts; the customer reviews and approves each post before anything is
> published. We use instagram_business_basic to identify the Instagram
> professional account the customer connected (username, name, avatar) so we
> can display which account content will be published to, in the project's
> connection panel and in the publishing flow. This is shown in the screencast
> right after the OAuth consent: the connected account's username and avatar
> appear in the "Redes Sociais" (Social Networks) panel.

### instagram_business_content_publish — "Tell us how you'll use this permission"

> Demandou publishes the customer's approved posts to their own Instagram
> professional account. The flow is: AI drafts a post (text + image), the
> customer reviews it on our kanban board and explicitly clicks "Publicar"
> (Publish). Only then do we create a media container and publish it via the
> content publishing API to the account the customer connected. There is no
> automatic posting without prior customer approval of each post. The
> screencast shows the full flow: reviewing the post, clicking publish,
> the post appearing on instagram.com on the connected account.

### Instruções de teste para o revisor (campo "Testing instructions")

> 1. Go to https://demandou.com/sign-in
> 2. Log in with: reviewer@demandou.com / [SENHA AQUI NA HORA]
> 3. The account lands on a project in setup. In step 1 ("Redes Sociais"),
>    click "Conectar" next to Instagram and authorize with an Instagram
>    professional (Business or Creator) account.
> 4. Skip the remaining setup steps ("Continuar depois") or complete them.
> 5. Open the project's posts board. A draft post with an image is already
>    prepared. Click the post, then "Publicar" and choose Instagram.
> 6. The post is published to the connected Instagram account via the
>    content publishing API.
> 7. To disconnect: project settings, "Redes Sociais", disconnect.
> Notes: the platform UI is in Brazilian Portuguese, our target market.
> "Conectar" = Connect, "Publicar" = Publish, "Configurações" = Settings.

## Conta de teste do revisor (preparar antes de submeter)

- Usuário `reviewer@demandou.com` criado direto no banco com senha forte,
  `plan: "pro"` e créditos, para o revisor NUNCA esbarrar em checkout
  (o portão de plano mandaria um usuário sem plano para a página de preços
  com cartão, e revisor não paga). Um projeto em setup já criado, com um
  post de imagem pronto no kanban para ele só clicar em Publicar.
- Instagram do lado de lá: o revisor usa conta profissional própria da Meta.
  Se o formulário exigir credenciais de Instagram, criar na hora uma conta
  profissional de teste dedicada (não usar @prdonaire, que é a conta real).

## Depois da aprovação

- Publicar o app (alternar de "Não publicado" para ativo).
- Testar conexão com uma conta que NÃO é testadora do app.
- Abrir a segunda submissão, do Facebook, reaproveitando este dossiê.
