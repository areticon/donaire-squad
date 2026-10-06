# A linguagem dos 26 estilos de vídeo, pesquisada (06/10/2026)

Pedido do Bruno às 2h20 de 06/10: "ative um agente que vai melhorar o prompt de todos os modelos de vídeo que temos; ele faz pesquisa e melhora o prompt, como fizemos com o Vox e o Dan Martell, para todos os exemplos da plataforma. Quando o cliente disser 'quero meu vídeo no estilo mapa, porque falo de demografia, põe o mapa, faz uma animação no mapa', como o prompt tem que ser para isso funcionar bem?"

Este documento registra a pesquisa, o que cada estilo exige e as decisões. O que o produto lê está em código:

- `lib/media/editor-por-comando/comando-dos-estilos.ts`, `LINGUAGEM_DOS_ESTILOS`: por estilo, o comando pronto em português (o que a miniatura preenche), o bloco de linguagem em inglês para imagem e B-roll, como cada tipo de elemento se desenha, o ritmo sugerido, a família de componentes e as referências.
- `lib/media/editor-por-comando/linguagem.ts`, `FAMILIAS[].semente` e `criterio`: a semente de cada uma das 9 famílias (o que o redator recebe e o que a reserva usa sem ele).
- `lib/biblioteca-de-design/semente.ts`: as 26 sementes de vídeo gravam o comando e o bloco pesquisado; as 53 de imagem gravam o prompt do modelo ou o brief do desenho em código por arquétipo.
- `lib/modelos-de-arte/prompts-com-foto.ts`, `BASE_COM_FOTO`: a base dos 18 modelos com foto ganhou lente, grão, "o campo real do cliente" e a lista do que evitar (stock, HDR, flare, aperto de mão genérico, dinheiro voando).

Regras que valeram em tudo: nada hardcoded por estilo (o estilo é só linguagem: muda como as peças se desenham e os prompts de imagem e B-roll; nenhuma condição no código); o JEV decide o tipo por momento e o Claude só escreve; imagem pelos melhores modelos; a cor da marca só nos detalhes (as cores das referências, o amarelo da Vox, o ciano do Dan Martell, o amarelo do Hormozi, nunca entram); sem travessão.

## Como o prompt chega às imagens e ao B-roll hoje

1. A miniatura preenche o comando (`comandoDoEstilo`): a ficha do estilo em português + as cores da marca (`coresNoComando`) + o nicho e o público + a sugestão de ritmo. O cliente edita. Teto da tela: 1500 caracteres (`normalizarComando`), por isso cada comando de estilo tem até 650.
2. O JEV lê o comando e escolhe a família (`decidirLinguagem`, critérios em `FAMILIAS[].criterio`). Sem JEV, `familiaPorPalavras` cai na família pelas palavras do comando: a prova confere que os 26 comandos caem na família da ficha.
3. O redator (Sonnet) escreve o bloco de estilo de 35 a 60 palavras a partir do comando, do nicho, da marca, da leitura do vídeo e da semente da família (`escreverBlocoDeEstilo`). Sem ele, `blocoDeEstiloDeReserva` monta a reserva com a semente + o comando + as cores.
4. `promptDaMidia` = a cena deste trecho (o redator escreve por momento) + o bloco de estilo + a guarda (sem texto, sem pessoa real, câmera sempre em movimento no vídeo).
5. A biblioteca de design grava, por estilo, o comando como `pedidoOriginal` e o bloco pesquisado como `linguagem` (teto 900).

Pendente (sem custo): `escreverBlocoDeEstilo` ainda não lê `LINGUAGEM_DOS_ESTILOS[id].bloco` diretamente (a ficha chega ao redator pelo comando e pela semente da família); o caminho direto é a pendência "bloco de estilo pela biblioteca" da RETOMADA. A ficha `pecas` (como cada elemento se desenha, em inglês) está exportada e pronta para entrar no pedido do redator quando essa pendência for feita.

## O exemplo do Bruno: "estilo mapa, falo de demografia, faz uma animação no mapa"

O estilo é o **jornalismo de mapa (Johnny Harris)**. O comando pronto diz, com todas as letras: "Quando eu falar de lugar, região ou caminho, entra um mapa de satélite ou de relevo com grão de filme, a câmera chega do alto até o ponto, a fronteira ou a rota se desenha com traço à mão em passos, o nome vem numa etiqueta de papel. Para demografia e dados por região: o mapa recebe pontos ou áreas que acendem na cor da marca, com o número ao lado."

O que faz funcionar, em três camadas:

- **O JEV escolhe o tipo "imagem" ou "lista-datas" nos momentos de lugar e de dado por região**, porque o comando diz que o mapa é o personagem e o critério do tipo imagem fala de "um lugar". Na família papel, a janela de imagem é a peça `colagem`, e a peça `mapa-antigo` (worker/remotion/src/sob-medida/pecas/vox.tsx) desenha o mapa rasgado, a câmera chegando no ponto (`x`, `y` de 0 a 1) e o círculo que se desenha no evento, com o nome numa tira de papel. A cronologia (`cronologia`) anda marco a marco na palavra de cada ano. É animação em código, não imagem gerada: o número e o lugar são sempre os ditos.
- **O prompt de imagem do mapa** (quando a cena do momento é um mapa gerado, em tela cheia ou na janela) pede: projeção plana vista de cima, satélite ou relevo sombreado, época (mapa antigo gravado para história, satélite atual para hoje), rótulos em condensada com espaçamento, fronteiras e rotas como linha de tinta à mão, regiões tingidas com a cor da marca em baixa opacidade, pontos pequenos de tinta para densidade, grão de filme e vazamento de luz, e o que evitar: globo 3D brilhante, ícones vetoriais, neon, easing liso. Isso está no `bloco` da ficha `johnny-harris`. Nenhum texto na imagem: os rótulos entram em código.
- **A animação**: em passos (stepped), não deslizando; a câmera desce do espaço até o lugar; a fronteira se desenha; os pontos acendem na ordem em que a fala cita; para fluxo migratório, setas desenhadas de origem a destino. Isso é o que a ficha `pecas` descreve e o que a `cronologia` e o `mapa-antigo` já fazem; os pontos de densidade e as setas de fluxo em mapa de satélite ainda não existem como peça (ver pendências).

Fontes: aescripts.com (How Johnny Harris Makes Maps; o montagem de mapas com GEOlayers 3: satélite, relevo, marcadores, câmera do espaço ao lugar); fcpxfullaccess.com (Vox e Johnny Harris no Final Cut: imperfeição de propósito, texturas, setas desenhadas, animação em passos, tarja no mesmo traço); motionarray.com (texturas, film burns, light leaks, grão); populationeducation.org (o vídeo dos pontos da população mundial: um ponto por coordenada, aparecendo no tempo); researchgate (mapas coropléticos animados: região grande e vazia domina o olho, cartograma corrige; mudança sutil se percebe melhor sem classes).

## As famílias de componentes (o que o worker sabe desenhar)

O worker tem três visuais (`tema.visual`): **documental** (cartão de papel creme, letra escura, Playfair, pílula redonda), **vidro** (painel escuro de vidro fosco, borda fina clara, letra clara, Geist) e **impacto** (bloco preto fosco ou bloco na cor de destaque, Archivo Black), mais o acabamento **luxo** (metal e respiro) e a linguagem **neon** (brilho). As 9 famílias de `linguagem.ts` são combinações disso; o estilo cai numa família e muda só o COMO (prompt das imagens, letra, cores). Mapa decidido por estilo:

| Família | Visual do worker | Estilos |
|---|---|---|
| papel | documental | vox, johnny-harris, crime-real, wes-anderson |
| realista | documental | bbc, natgeo, 60-minutes, institucional, depoimento |
| vidro | vidro | ali-abdaal, podcast |
| giz | vidro tecnológico | quadro-branco, lousa |
| minimalista | vidro tecnológico | ted, keynote, carrossel-animado, minimalista |
| luxo | impacto luxo | consorcio |
| traco | impacto | kurzgesagt |
| impacto | impacto | vlog, mrbeast, hormozi, ugc, tipografia, vhs, tela-dividida |
| neon | vidro + brilho | nenhum estilo do catálogo cai aqui por padrão; entra pelo comando ("neon", "futurista") |

Limite honesto: o quadro branco (fundo branco, marcador) cai na família giz, cujo worker desenha vidro escuro; as IMAGENS saem brancas pelo bloco da ficha, mas as peças em código continuam escuras. Idem o Wes Anderson (pastel) na família papel, e o Ali Abdaal (claro) no vidro escuro. Resolver isso é peça nova no worker (um tema claro), não prompt.

## Por estilo: o que a pesquisa mostrou e o que mudou

Cada linha: o que caracteriza, de onde veio, o que a ficha nova pede. As referências completas estão na ficha (`referencias`).

1. **Vox (explicativo editorial)**. Papel amassado escaneado, meio-tom, borda de tesoura, jornal com tipo de época ilegível, fita, caneta, marca-texto com borda seca, carimbo, gravuras, tudo colado com 2 a 6 graus de rotação e parallax em passos. Fontes: a medição de 25/08 (BIBLIA-DE-ESTILO, sistema 1), cliptude.com (vocabulário halftone, archival, paper-cutout, stepped cut-on-twos; evitar PowerPoint plano, 3D liso, vetor), calliopelabs.co (paleta de arquivo), flatpackfx e tutsplus (recorte, sombra, fita translúcida, parallax 2.5D). Mudou: o comando ganhou barras que crescem, mapa antigo com círculo e cronologia de papel como comportamento por momento; o bloco ganhou materiais e a lista do que evitar.
2. **BBC (noticiário e reportagem)**. Tarja preta com toque de cor, serifa no título e sem serifa no detalhe (rebrand 2019, Reith), foto de reportagem com luz disponível, mapa plano. Fontes: newscaststudio.com, bbc.github.io/gel. Mudou: a referência antiga não existia; o comando diz como a tarja, o número com fonte, o mapa e a citação se desenham, e proíbe efeito e emoji.
3. **National Geographic (documentário cinematográfico)**. Cor fiel, nunca saturada (entrevista de Sophie Darlington sobre Lion, indiewire.com; gasperdesouza.com), luz de fim de tarde, aéreo, macro, câmera lenta, texto mínimo em serifa fina, mapa de relevo com rota que se desenha. Mudou: bloco com golden hour, grão fino, haze, pessoas pequenas na paisagem; evitar HDR, neon, vetor.
4. **Johnny Harris (jornalismo de mapa)**. Ver a seção do exemplo do Bruno. Mudou: o mapa virou o elemento central com projeção, época, rótulos, tinta e animação em passos; demografia por pontos e áreas na cor da marca.
5. **Crime real (investigação)**. Luz dura lateral, grade fria dessaturada, mural de prova com fio vermelho, documentos tarjados, letra de máquina, flash na revelação, silêncio antes da virada. Fontes: filmmakermagazine.com, factualamerica.com, wikipedia (evidence board), spotlightfx. Mudou: comando e bloco descrevem o mural e a cronologia como dossiê; evitar cor saturada e ícone bonitinho.
6. **60 Minutes (entrevista de revista)**. Fundo preto, key a 45 graus, contraluz, plano e contraplano, tarja limpa, citação entre aspas, sem trilha. Fontes: uglyhedgehog.com, documentary.org, neewer.com. Mudou: realce em quem fala e citação como elementos; apoio só em fotografia documental.
7. **Kurzgesagt (animação explicativa)**. Vetor plano, formas arredondadas, degradê suave dentro da forma, cores vivas (a paleta deles, azul, ciano, roxo, magenta, amarelo, substituída pela da marca), personagens sem rosto detalhado, partículas. Fontes: artsatmichigan.umich.edu, midlibrary.io, aquaproductions. Mudou: família traço; número gigante animado e infográfico que se monta; nada de foto.
8. **Quadro branco**. Mão que desenha motiva mais do que empurrar conteúdo (springer), todo desenho a serviço do ponto, metáforas (lâmpada, engrenagem), tipografia que parece à mão (truscribe, b2w). Mudou: comando pede traço preto fino com uma cor da marca para grifar, listas escritas item a item, mapa como esboço; bloco pede marcador sobre branco e evita foto e degradê.
9. **Ali Abdaal (professor com imagens de apoio)**. Ambiente claro e arrumado, B-roll por ideia, palavra-chave surgindo, títulos numerados, cartões limpos, capturas de tela, zoom leve de 10%; nos Shorts, gráfico fixo no topo que muda a cada 3 a 8 s (writepanda.ai medido quadro a quadro; techbullion.com; hitpaw). Mudou: família vidro (cartões limpos); comando com cartão de lista, citação de livro, captura de tela; bloco claro e quente.
10. **Dan Martell (lousa de negócios)**. A medição de 25/08 (BIBLIA-DE-ESTILO, sistema 2): lousa quase preta com textura topográfica, retângulo arredondado com borda ciano e glow (aqui, a cor da marca), tiles numerados, itálico serifado para o nome do framework, barras verde e vermelha, anotação tracejada em cena, pill caption. A busca na web não trouxe nada melhor do que a medição própria. Mudou: o comando descreve todos os arquétipos medidos como comportamento por momento.
11. **TED (palestra de palco)**. Palco escuro, luz no rosto, o círculo vermelho virou anel de luz (blog.ted.com), a edição some. Mudou: família minimalista; nome e título na primeira fala, título centrado na troca de ideia, frase-tese em cartão, slide ao lado; nada de ícone.
12. **Keynote da Apple (lançamento de produto)**. Uma frase por tela, tipografia fina com tracking largo, produto em estúdio preto ou branco, plataforma fosca, reflexo controlado, macro (developer.apple.com; prompt Apple-style em youmind.com). Mudou: rótulo fino apontando o recurso, número gigante sozinho, antes e depois em silêncio; evitar flare e câmera nervosa.
13. **Institucional cinematográfico**. História antes do polimento (theteam.co.uk), pessoas reais trabalhando com câmera na mão (Microsoft, herenow.film), grão e foco suave (Airbnb), grade quente. Mudou: frases de valor centradas em fusão lenta, nome fino, número do resultado, linha do tempo da empresa; evitar sorriso de banco de imagem e aperto de mão.
14. **Depoimento de cliente**. Nome e cargo no terço inferior, abrir com o resultado (teraleap.io), B-roll do cliente usando o produto como prova (thoughtcastmedia). Mudou: número quando dito, antes e depois, citação; fotografia do negócio real, nunca cena genérica.
15. **Casey Neistat (vlog de fundador)**. Jump cut como estilo, whip pan, timelapse, imperfeição de propósito, títulos e marcadores feitos à mão (indepthcine.com, vloggingpro). Mudou: cartão de lugar e data à mão, título do dia desenhado, palavras grossas, cor vibrante; nada de cenário trocado.
16. **Podcast em vídeo**. Troca por quem fala, terço inferior, título de tópico, molduras da marca (onreplay.com.au, kometmedia). Mudou: família vidro; nome de cada pessoa na primeira fala, realce em quem fala, capítulo, citação e número em cartão; nada cobrindo rosto nem microfone.
17. **MrBeast (alta retenção)**. Algo muda a cada segundo, 23 a 38 cortes por minuto, estímulo novo a cada 20 a 30 s, legenda Komika Axis com contorno, cor saturada (vidpros.com, sendshort.ai); e o próprio MrBeast desacelerou em 2024 (washingtonpost.com). Mudou: palavra-tese gigante, número explodindo, emoji e ícone grande, dois blocos de cor; bloco com cor que estoura no feed e evitar grade fosca.
18. **Hormozi (corte com legenda dinâmica)**. Condensada pesada em caixa alta, contorno preto, palavra-chave em amarelo (aqui, na cor da marca), 2 a 4 palavras por vez, zoom de 10 a 20%, jump cut a cada 1 a 3 s, emoji pontual (ascynd.io, riverside.com). Mudou: o comando descreve a legenda com todas as medidas e o ícone pontual.
19. **Autoridade high ticket (consórcio)**. A medição própria de 02/10 em 163 posts (lib/media/biblias/consorcio.ts) continua mandando: fala desde o primeiro segundo, legenda no meio da tela, prova quando é dita; 303.london (texto mínimo, transição suave) e as paletas preto e dourado. Mudou: a palavra "quadro" saiu do comando (levava a reserva à família giz); bloco com metal escovado, pedra, couro, cidade à noite, e evitar dinheiro voando e brilho dourado falso.
20. **Nativo do TikTok (UGC)**. Celular na mão, luz natural, enquadramento imperfeito, legenda com menos de 8 palavras, tela verde, pergunta e resposta (fluxnote.io, videoselz.com). Mudou: print atrás como tela verde, seta e círculo, corte no gesto; bloco com a cor de celular e evitar grade cinematográfica.
21. **Tipografia animada**. Tempo, escala, rotação e opacidade combinados, pausa entre palavras, legível por 0,5 s (ikagency.com, trydemotion). Mudou: palavras a cada 0,3 a 0,8 s, cartela com a frase inteira, formas geométricas como única decoração; nenhuma foto.
22. **Carrossel animado**. Lâmina em altura cheia com barra de progresso no topo (framer.com), mudança pequena entre lâminas como stop motion (yoursocial.team). Mudou: família minimalista; uma ideia por cartela, 3 a 5 s, deslize de 0,4 s, antes e depois em duas cartelas.
23. **Wes Anderson (simetria e pastel)**. Simetria, pastel, tableau, kitsch, deadpan (pastemagazine.com); nomear os tons exatos no prompt (openart.ai, kling.ai). Mudou: família papel (colagem de objetos como vitrine); títulos centrados em letra clássica, capítulos numerados, letreiro de loja; bloco com maquete e luz chapada.
24. **Retrô e VHS**. Tracking, aberração cromática, scanlines, color bleed, timecode de VCR, REC (glitchart.studio, borisfx.com). Mudou: família impacto (a neon só pelo comando); contador de fita, falha só na virada, rebobinar como transição; bloco com fotos de álbum dos anos 80 e 90.
25. **Minimalista corporativo**. Linhas finas, paleta limitada, espaço aberto intencional (contentbeta.com, fontfabric.com). Mudou: as palavras "passo a passo" e "tecnologia" saíram do comando (levavam a reserva à família vidro); número sozinho, cartões brancos, duas colunas, etapas em linha.
26. **Tela dividida e reação**. Dois painéis, rótulo em cada lado, escala igual, vertical um em cima do outro (shortgenius.com, aicut.pro). Mudou: x e check na cor da marca, seta e círculo, zoom no ponto quando a fala diz "olha isso"; bloco pede o mesmo enquadramento nas duas metades.

## As 9 famílias: o que mudou na semente

Cada semente ganhou materiais, luz, grão, composição e o que evitar (antes eram 8 a 12 palavras). A da família giz ficou neutra sobre a cor do quadro ("dark slate or clean white, as the command says") porque serve ao Dan Martell e ao quadro branco. Os critérios ganharam os nomes dos estilos que caem em cada família, para o JEV reconhecer o comando preenchido pela miniatura.

## As 53 sementes de imagem

- 18 modelos com foto (prompts-com-foto.ts) e 8 da família Vox (prompts-vox.ts): a linguagem é o prompt. `BASE_COM_FOTO` ganhou lente, grão, "o campo real do cliente", cor só em detalhe e a lista do que evitar; os prompts por modelo não mudaram (a composição e a zona quieta estavam certas).
- 28 modelos só texto (desenhados em código): a linguagem era uma linha genérica ("Layout archetype X"); agora `DESENHO_DO_ARQUETIPO` descreve cada arquétipo como brief de design (o que está na tela, a tipografia, onde a cor da marca entra), para a galeria e para o JEV comparar um pedido novo com o que existe.

## Decisões

- O comando em português carrega o comportamento por elemento (é o que o JEV e o redator leem hoje); o bloco em inglês carrega o acabamento das imagens (é o que a biblioteca grava); `pecas` em inglês fica exportado para o redator quando a pendência "bloco de estilo pela biblioteca" for feita.
- Teto de 650 caracteres por comando de estilo: com cores (até 170), nicho e público (até 2 x 170) e a sugestão de ritmo (até 350) cabe nos 1500 da tela, provado com nicho e público longos para os 26.
- Teto de 900 no bloco: o teto da linguagem da biblioteca (`TETO.linguagem`).
- A família de cada estilo é dado da ficha (conteúdo), e as palavras do comando levam à mesma família pela reserva sem JEV (provado para os 26). Duas armadilhas achadas e corrigidas: "quadro" no consórcio (caía em giz) e "passo a passo" e "tecnologia" no minimalista (caíam em vidro); "telejornal" na BBC (caía em papel por "jornal").
- `escreverBlocoDeEstilo` ganhou um terceiro parâmetro opcional `redator` (padrão `askClaude`), só para a prova sem IA paga; a lógica não mudou.

## Pendências (sem suavizar)

- As 79 sementes já gravadas no banco em 06/10 de madrugada continuam com a linguagem antiga: `garantirSemente` só cria, não atualiza. Precisa de um script de atualização (UPDATE em designs_da_biblioteca por tipo e catalogoId, só origem "semente"), que escreve no banco e por isso não rodou aqui.
- `escreverBlocoDeEstilo` não lê a ficha do estilo diretamente; a ficha chega pelo comando e pela semente da família. O caminho direto (quando o comando veio de uma miniatura ou de um design da biblioteca, usar o `bloco` gravado e só pedir ao redator o ajuste ao nicho) é a pendência "bloco de estilo pela biblioteca".
- Peças que a pesquisa pede e o worker não tem: mapa de satélite ou relevo com pontos de densidade e setas de fluxo (hoje só o mapa antigo rasgado da família papel); mural de prova com fio vermelho; tema claro para quadro branco, Wes Anderson e Ali Abdaal; contador de fita e scanlines do VHS; barra de progresso do carrossel. Tudo isso é componente Remotion, não prompt.
- Nenhuma imagem foi gerada: as prévias custam e esperam OK (49 da biblioteca, US$ 2,45 a 4,90).
- A família neon não tem estilo do catálogo; só entra pelo comando escrito.
