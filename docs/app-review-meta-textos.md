# App Review da Meta: os textos para colar, submissao de cinco permissoes

> Escrito em 17/09/2026, conferido contra o codigo e nao contra o dossie de
> 21/08 (`docs/app-review-meta.md`), que descreve uma submissao de DUAS
> permissoes do Instagram e usa nomes de tela que nao existem mais.
>
> App Demandou `1808987136949506`. Video pronto:
> `C:\Users\devan\Videos\demandou-app-review\final\demandou-meta.mp4`
> (177 s, 8,3 MB). A Meta pede ANEXO, nao link. O mesmo arquivo serve para as
> cinco permissoes.

## As cinco, e onde cada uma vive no codigo

| Permissao | Onde e usada |
| --- | --- |
| `instagram_business_basic` | `lib/oauth/instagram.ts`, identifica a conta conectada |
| `instagram_business_content_publish` | publicacao em `lib/publish/oauth-post.ts` |
| `pages_show_list` | `lib/oauth/facebook.ts`, `/me/accounts` lista as paginas |
| `pages_read_engagement` | exigida pela Meta junto com manage_posts para publicar como pagina |
| `pages_manage_posts` | publicacao na pagina, com o token da pagina |

---

## instagram_business_basic

Demandou (demandou.com) helps a solo professional keep a consistent presence on social media. AI agents research, write and design the posts; the customer reviews and approves each piece before anything is published.

We use instagram_business_basic to identify the Instagram professional account the customer connected: username, name and avatar. We display it in the project's social networks panel and in the publishing flow, so the customer always sees which account a piece will go to before approving it.

In the screencast this appears right after the Instagram consent screen: the connected account's username and avatar show up in the "Redes Sociais" (Social Networks) panel.

---

## instagram_business_content_publish

Demandou publishes the customer's approved posts to their own Instagram professional account.

The flow is: an AI agent drafts the piece (text plus image), the customer reviews it on the content board, selects that specific piece and clicks "Publicar agora" (Publish now). Only then do we create a media container and publish it through the content publishing API, to the account the customer connected. Nothing is ever published without the customer approving that exact piece.

The screencast shows the whole flow: the draft with text and image, the approval piece by piece, the publish, and the post appearing on instagram.com on the connected account.

---

## pages_show_list

After the customer authorizes Facebook, we call /me/accounts to list the Pages they administer, and we show that list in the project's social networks panel so the customer can choose which Page will receive the posts.

Without it we cannot know which Pages the customer has, and we would have to ask them to type a Page ID by hand.

In the screencast this appears right after the Facebook consent screen: the Pages the member administers are listed in the panel, and the customer picks one.

---

## pages_read_engagement

We request pages_read_engagement because the Pages API requires it together with pages_manage_posts in order to publish on behalf of a Page: it is what allows our Page access token to act on the Page the customer selected.

We do not read insights, comments or messages, and we display no engagement data anywhere in the product. Our only read call is /me/accounts, to list the Pages the customer administers.

---

## pages_manage_posts

We use pages_manage_posts to publish the piece the customer approved on the Facebook Page they selected, using that Page's access token.

It is one publish per approved piece, always after an explicit approval on the content board. We do not edit or delete existing posts, and nothing is published without that approval.

The screencast shows the approved piece being published and then the post itself on the Facebook Page.

---

## Instrucoes de teste para web (o campo onde a submissao parou)

1. Open https://demandou.com/sign-in
2. Log in with: reviewer@demandou.com / DemandouReview2026!
3. Open the project named "Demandou".
4. Go to "Configuracoes" (Settings), tab "Redes sociais" (Social networks). The connected Instagram account and Facebook Page are listed there. To test the connection flow, click the trash icon to disconnect, then "Conectar" (Connect) and authorize with your own Instagram professional account or Facebook Page.
5. To test publishing, open "Gestor de Conteudo" (Content Manager). In the "Paulo Publicador" card, tick the checkbox of one piece and click "Publicar agora" (Publish now). The piece is published to the connected account, and a link to the published post appears.
6. To disconnect, go back to "Configuracoes", "Redes sociais", and click the trash icon next to the account. This deletes the stored access token from our database.

Notes: the interface is in Brazilian Portuguese, our target market. Conectar = Connect, Publicar = Publish, Configuracoes = Settings, Redes sociais = Social networks.

---

## PRE-REQUISITO MEDIDO EM 17/09, e ele quebra o passo 5

A conta `reviewer@demandou.com` (plano business, 2758 creditos, projeto
"Demandou") tem **um unico rascunho com imagem, e ele e de LinkedIn**. Os posts
de Instagram e de Facebook que existiam ja foram publicados, e `imageUrl` em
base64 e limpa apos publicar, por desenho.

Ou seja: hoje o revisor entra, segue o passo 5 e **nao acha peca de Instagram
nem de Facebook para publicar**.

E o mesmo mecanismo de 14/09, quando o roteiro descrevia uma conta de revisao
que o proprio trabalho tinha mudado. Antes de enviar, gerar uma campanha no
projeto "Demandou" para deixar pecas de Instagram e Facebook em rascunho, com
imagem. Isso e o mesmo trabalho do caso zero (cards 183 e 158).

As redes JA ESTAO reconectadas (medido em 17/09): Instagram "Bruno Donaire",
Facebook "Demandou" e os tres do LinkedIn.
