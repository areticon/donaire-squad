# Verificação OAuth do Google (escopos do YouTube)

> Preparado em 22/08/2026. Projeto `demandoupostou`, Google Auth Platform.
> O que isso destrava: qualquer cliente conectar o YouTube sem ver a tela
> "O Google não verificou este app".

## Por que o aviso existia sem submissão nenhuma

O Google só enxerga os escopos **registrados** na tela de permissão. Os do
YouTube nunca tinham sido declarados lá: o código pedia direto na URL do
login. Por isso a Central de verificação dizia "verificação não é necessária"
enquanto o usuário via o aviso de app não verificado. Escopo pedido e não
declarado é tratado como escopo não aprovado.

Registrados em 22/08:

| Escopo | Para quê |
|---|---|
| `youtube.upload` | Publicar o vídeo no canal do próprio cliente |
| `youtube.readonly` | Identificar qual canal o cliente conectou |

## Justificativa (colar no campo "Como os escopos serão usados?")

> Demandou (demandou.com) is a subscription SaaS that helps professionals keep
> a consistent presence on social media. The customer records a video; our AI
> agents transcribe it, select the best excerpts and produce content for the
> customer's own social accounts.
>
> youtube.upload: we upload the finished video to the customer's own YouTube
> channel, and only after the customer reviews the content and explicitly
> clicks "Publicar" (Publish). There is no automatic posting without per-post
> approval by the customer.
>
> youtube.readonly: we call channels.list(mine=true) once, at connection time,
> to identify which channel the customer connected. We display it in the
> connections panel and use its id to target the upload. We do not read, store
> or process any other channel data.
>
> More limited scopes are not sufficient: youtube.upload alone does not allow
> identifying the connected channel, and there is no narrower read scope that
> returns channel identity.

## O que o vídeo publica, e por quê

**A gravação inteira, com capítulos.** Não os trechos recortados, porque
recorte de vídeo não existe no produto (verificado no código em 22/08: sem
ffmpeg, sem dependência de mídia). Os trechos escolhidos pelo squad viram
marcadores de capítulo na descrição, o que aproveita o mesmo trabalho de
seleção e entrega valor real a quem assiste.

Conferido com os cinco trechos reais de uma gravação de 27 minutos: 6
capítulos, o primeiro em `0:00`, o menor com 69 segundos. As três regras do
YouTube (primeiro marcador em zero, mínimo de três, mínimo de 10 segundos
cada) fecham com folga.

## Roteiro do vídeo de demonstração

Requisitos do Google: mostrar a tela de consentimento com os escopos, mostrar
o app usando os dados, e o vídeo precisa estar acessível por link (YouTube
não listado serve).

1. Abrir `demandou.com`, entrar, e ir até a etapa de redes do projeto.
2. Clicar em Conectar no YouTube. **Mostrar a tela de consentimento inteira**,
   com os dois escopos legíveis, e autorizar.
3. De volta à plataforma, mostrar o **nome do canal conectado** aparecendo no
   painel. É o uso visível do `youtube.readonly`.
4. Na tela do vídeo, com a gravação já processada, clicar em **Preparar para o
   YouTube**. Mostrar o aviso de que o rascunho foi criado.
5. Abrir o quadro de posts, abrir o rascunho de YouTube, **mostrar a descrição
   com os capítulos** e clicar em **Publicar**. É o uso do `youtube.upload`, e
   mostra a aprovação explícita por post, que é o ponto que o Google quer ver.
6. Abrir o YouTube na conta e mostrar o vídeo publicado, com os capítulos.
7. Mostrar a desconexão, provando que o cliente controla o acesso.

**Grave com um vídeo curto.** O envio atravessa a nossa função em fluxo, sem
carregar na memória, mas quanto menor o arquivo menos tempo de gravação parada
esperando barra de progresso. Um recorte de 1 a 2 minutos basta para demonstrar
e evita um screencast com três minutos de espera no meio.

## Ressalva que o próprio painel levanta

A tela avisa para não implantar escopo não verificado em tráfego de produção,
porque consome a cota de usuários não verificados. A cota é de 100 usuários e
estamos em 1, então não é problema agora, mas é motivo para **não** divulgar a
conexão do YouTube para clientes antes da aprovação.

## Relação com o App Review da Meta

Os dois pedem screencast do mesmo tipo. Gravar na mesma sessão, com o mesmo
projeto de teste: um vídeo para a Meta (Instagram) e um para o Google
(YouTube). Ver `docs/app-review-meta.md`.
