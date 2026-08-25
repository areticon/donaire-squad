# Bíblia de estilo dos overlays de design (Dan Martell e Vox)

Criada em 25/08/2026 a partir de medição direta dos vídeos de referência que o
Bruno escolheu. Este documento é o "treinamento" do Nano Banana: modelo de
imagem não aceita fine-tuning, então o estilo entra por duas alavancas, o
prompt rigoroso (os templates abaixo) e as imagens de referência anexadas em
cada chamada (`docs/overlays/referencias/`, o Pro aceita até 14 por pedido).

Vídeos medidos:

| Canal | Vídeo | O que rendeu |
|---|---|---|
| Vox | Why do we have grass lawns? (bR5kIPwg6_Q) | linguagem de arquivo e papel |
| Vox | Why it's hard for Americans to retire (ZT9NpPe0wRg) | linguagem de estúdio gráfico |
| Vox | How to balance paying debt vs. investing (a9vPm615xnY) | cartelas, gráficos e calculadoras |
| Dan Martell | Business is Hard Until You Build These Systems (eY9gpdaXW7w) | lousas pretas, listas, tabelas |
| Dan Martell | How to Make Money Like The Top 0.001% (mZxDw92UXmA) | anotações em cena, conceitos serifados |

## As regras de engenharia que mandam nesta frente

1. **Overlay só entra no intermediário recodificado pelo worker.** Na entrada
   crua do cliente, só `trim`/`concat` e filtro de áudio (lição do emoji,
   HANDOFF partes 52 a 57).
2. **Âncora textual, nunca segundo.** O agente que decide onde entra arte
   devolve a PALAVRA da transcrição. Âncora que não existe na fala vira arte
   nenhuma, não arte no lugar errado.
3. **Gráfico com número real é código, não modelo de imagem.** O modelo desenha
   bonito e erra número. O agente extrai o dado da fala; um template nosso
   renderiza barras, linhas e tabelas nesta paleta. O Nano Banana faz cartelas,
   lousas, conceitos, ícones e texturas, onde julgamento visual importa e o
   número não existe ou é decorativo.
4. **Movimento é do ffmpeg.** A imagem chega parada; fade, slide, draw-on e
   push-in são filtros sobre o intermediário.
5. **Texto dentro da arte: curto e conferido.** Até 6 palavras por elemento, em
   português correto no prompt (o modelo reproduz o que recebe). Antes de colar
   no vídeo, extrair o quadro e LER o texto renderizado; typo do modelo
   descarta a arte e refaz (a verificação chega até o conteúdo).
6. **Transparência: a API do Gemini não devolve alpha.** Dois caminhos, nesta
   ordem: (a) arte de quadro inteiro 16:9 ou 9:16, que já resolve lousa do
   Dan Martell e estúdio da Vox; (b) para elemento flutuante, gerar sobre
   fundo chroma `#00FF00` puro e tirar com `colorkey` + despill no ffmpeg.
   O caminho (b) precisa de prova antes de entrar em produção: glow e
   gradiente na borda franjam.

## Sistema 1: Vox

A Vox tem três sublinguagens, escolhidas pelo TIPO de momento na fala.

### Paleta medida (hex real dos quadros)

| Papel | Cor | Onde |
|---|---|---|
| fundo de estúdio | `#D9DED7` a `#D6D5D0` (cinza claro quente) | toda a linguagem de estúdio |
| rosa/magenta | `#CD145C` | gráficos, stats, números grandes |
| verde esmeralda | `#33C886` | barras, ícones, valores positivos |
| amarelo | `#F4FA15` | cartelas de rótulo e caixas de destaque |
| amarelo de grifo | `#EBE927` (60% opacidade sobre papel) | marca-texto em documento |
| texto | `#28292A` (quase preto) | títulos e rótulos |
| papel de arquivo | `#F7F7F7` limpo, `#F9F3D9` envelhecido | linguagem de arquivo |
| verde de mapa | `#42883B` (multiplicado sobre o mapa) | destaque de região em mapa antigo |

### Tipografia

- Título e pergunta grande: grotesca condensada ULTRA bold, caixa alta,
  entrelinha apertada, no verde ou no rosa sobre o cinza do estúdio.
- Rótulo e fonte de dado: sans bold pequena, caixa alta com espaçamento, cinza
  `#28292A`; a linha de fonte (ex.: US CENSUS) em corpo menor e verde.
- Stat: número gigante bold no rosa ou verde, rótulo em caixa alta pequena
  acima ou abaixo.
- Manchete de jornal: serifada preta sobre papel branco, com nome do veículo
  em serifada de cabeçalho.
- Rótulo sobre cena real: caixa alta branca espaçada sobre barra preta.

### Arquétipos (nome, quando usar, referência)

1. **cartao-pergunta**: a pergunta que estrutura o bloco, em condensada bold
   verde sobre o cinza, 3 a 4 linhas, canto esquerdo. Ref: `vox/cartao-pergunta.jpg`.
2. **palavra-cartao**: conceito de 1 a 3 palavras em condensada bold sobre o
   cinza (tipo LIFETIME BENEFIT), ou grade verde com ícone. Refs:
   `vox/palavra-cartao.jpg`.
3. **stat ao lado da pessoa**: número gigante rosa ou verde com rótulo em caixa
   alta, empilhado, no espaço vazio ao lado de quem fala. Refs:
   `vox/stats-pessoa.jpg`, `vox/barra-45k.jpg`.
4. **grafico**: linha grossa rosa ou barras verdes, fundo do estúdio, título
   bold centrado, fonte do dado abaixo do título, eixos finos, SEM moldura.
   Destaque com caixa amarela em volta do rótulo que importa. Refs:
   `vox/grafico-sp.jpg`, `vox/grafico-linha.jpg`, `vox/grafico-barras.jpg`,
   `vox/tabela.jpg`, `vox/barras-titulo.jpg`. **Sempre renderizado por código;
   a referência aqui é para o template, não para o modelo.**
5. **calculadora/cenario**: cartão de valores com caixas verdes (entradas) e
   rosa (saídas), rótulos em caixa alta pequena. Ref: `vox/cenario.jpg`.
   Código, não modelo.
6. **cartela-amarela**: rótulo curto em preto condensado sobre retângulo
   amarelo `#F4FA15`, leve rotação, sombra dura; usada em par de opostos
   (PAY DEBT vs INVEST). Ref: `vox/cartelas-amarelas.jpg`.
7. **icones-em-fila**: ícones de linha fina repetidos em fila para mostrar
   proporção (10 bonequinhos, 3 destacados), verde e rosa. Ref:
   `vox/icones-flaw.jpg`.
8. **lower-third**: nome em bold branco com sombra, cargo em linha fina
   abaixo, sem caixa. Ref: `vox/lower-third.jpg`.
9. **manchete**: página de jornal reconstruída sobre papel `#F7F7F7`, veículo
   no cabeçalho, manchete serifada, byline cinza. Ref: `vox/manchete.jpg`.
10. **documento-grifado**: recorte de texto impresso com marca-texto amarelo
    nas palavras que a fala cita. Ref: `vox/revista-grifo.jpg`.
11. **mapa-arquivo**: mapa ou gravura antiga sobre papel, com a região citada
    pintada de verde `#42883B` e rótulo em barra preta. Ref:
    `vox/mapa-verde.jpg`.
12. **rotulo-em-cena**: nome técnico sobre a cena real, barra preta e caixa
    alta branca espaçada. Ref: `vox/rotulo.jpg`.

### Prompt base (inglês, o texto da arte vai em português)

> Flat editorial motion-graphics still frame in the visual style of the
> attached reference images (Vox explainer): warm light-gray studio background
> `#D9DED7`, ultra-bold condensed sans-serif typography in uppercase, accent
> colors magenta `#CD145C`, emerald green `#33C886` and yellow `#F4FA15`,
> thin-line icons, generous negative space, no photographic elements, no
> gradients, no 3D, no watermark. 16:9, 1920x1080.
> [ARQUÉTIPO E LAYOUT]. All text must read exactly: "[TEXTO EM PORTUGUÊS]".

## Sistema 2: Dan Martell

Uma linguagem só, em dois modos: lousa de quadro inteiro (com a pessoa em
janelinha) e elemento em cena ao lado da pessoa.

### Paleta medida

| Papel | Cor | Onde |
|---|---|---|
| lousa preta | `#050505` a `#141414` | fundo dos quadros cheios e cards |
| textura da lousa | linhas topográficas sutis `#1C1C1C` | todo fundo preto |
| ciano | `#12D4EA` | palavra-chave, borda, título de card |
| brilho da borda | `#87DBE4` (glow externo) | retângulos arredondados |
| teal dos botões | gradiente `#087F7F` para `#12D4EA` | tiles numerados |
| verde de estado | `#1FE461` | item atual/concluído, barra positiva |
| vermelho | `#EA0002` | barra negativa, riscado, sublinhado de ênfase |
| texto | branco puro | títulos, listas, legendas |

### Tipografia

- Título de lousa: sans bold branca (peso de SF Pro Bold), caixa em Title
  Case, com A PALAVRA-CHAVE sublinhada em ciano ou trocada para ciano.
- Conceito nomeado: itálico SERIFADO branco elegante (tipo Baskerville
  Italic), usado para nome de framework (The Buyback Principle, Durable
  Revenue) e para números-conceito (10-80-10).
- Lista: numeração em tile arredondado ciano com número branco bold, item em
  sans bold branca.
- Legenda queimada (caption): 1 a 2 linhas de sans extrabold branca com
  sombra, palavra-chave em ciano ou com sublinhado vermelho.

### Arquétipos

1. **lousa-titulo**: quadro inteiro preto com textura topográfica, título no
   topo, elementos abaixo, pessoa em janelinha arredondada no canto inferior
   direito (a janelinha é do ffmpeg, a arte deixa o espaço vazio). Refs:
   `dan-martell/slate-fases.jpg`, `dan-martell/slate-7steps.jpg`.
2. **lousa-lista**: título + itens numerados com tiles ciano, revelados um a
   um (a revelação é corte entre variações da arte ou crop animado). Ref:
   `dan-martell/lista-numerada.jpg`.
3. **lousa-tabela**: tabela de duas colunas com borda ciano e glow, linhas
   finas. Ref: `dan-martell/tabela-task.jpg`. Conteúdo de tabela com dado
   real: código.
4. **lousa-barra**: barra de progresso ou régua em retângulo arredondado com
   borda ciano, rótulos em serifado itálico. Ref: `dan-martell/barra-1080.jpg`.
5. **lousa-calculadora**: cartão com fórmula em serifado itálico (Income /
   Hours), moldura ciano com glow. Ref: `dan-martell/calculadora.jpg`.
6. **card-lateral**: card preto arredondado flutuando ao lado da pessoa,
   título ciano pequeno, itens brancos revelados. Ref:
   `dan-martell/card-lista.jpg`.
7. **diagrama**: traço branco fino desenhado (curva, loop, setas) com pontos
   coloridos e rótulos serifados itálicos, sobre a lousa. Ref:
   `dan-martell/diagrama-loop.jpg`.
8. **grafico-em-cena**: eixos brancos desenhados à mão sobre a cena real,
   rótulos em serifado itálico, linha ciano ou verde. Ref:
   `dan-martell/grafico-eixos.jpg`.
9. **anotacao-em-cena**: linha tracejada branca, chaves e rótulos bold ao
   redor da pessoa, palavra-chave em ciano. Ref: `dan-martell/anotacao.jpg`.
10. **conceito-serifado**: nome do framework em serifado itálico branco
    grande, flutuando no espaço vazio da cena. Ref:
    `dan-martell/conceito-durable.jpg`.
11. **rabisco-destaque**: círculo rabiscado branco estilo giz em volta de uma
    palavra ou objeto. Ref: `dan-martell/icones-linha.jpg`.
12. **pill-caption**: legenda numerada em pílula escura translúcida com texto
    branco bold e ênfase sublinhada em vermelho. Ref:
    `dan-martell/pill-caption.jpg`.
13. **barras-comparacao**: duas barras verticais verde `#1FE461` e vermelha
    `#EA0002` sobre a cena, sem eixo, proporção exagerada. Ref:
    `dan-martell/barras-vv.jpg`. Com número real: código.

### Prompt base

> Premium dark motion-graphics still frame in the visual style of the attached
> reference images (business YouTube explainer): near-black background
> `#0A0A0A` with subtle dark topographic contour-line texture, rounded
> rectangles with thin cyan `#12D4EA` borders and soft outer glow, bold white
> sans-serif titles with the key word in cyan, elegant white italic serif for
> concept names, accents green `#1FE461` and red `#EA0002` only for status,
> no photographic elements, no watermark. 16:9, 1920x1080.
> [ARQUÉTIPO E LAYOUT]. Leave the bottom-right quadrant empty for a
> picture-in-picture speaker window. All text must read exactly:
> "[TEXTO EM PORTUGUÊS]".

## Cadência medida (para o agente que marca os momentos)

- Vox: um elemento gráfico novo a cada 8 a 15 segundos; quase nunca a tela
  fica mais de 20 s só na pessoa. O elemento fica na tela de 3 a 6 s (cartela,
  rótulo) ou 6 a 12 s (gráfico, mapa).
- Dan Martell: lousa cheia nos momentos de estrutura (lista, framework), 8 a
  20 s cada; entre lousas, 20 a 60 s de fala limpa com no máximo uma anotação
  em cena ou conceito serifado; caption queimada só em frase de efeito.
- Nos dois: o elemento entra JUNTO da palavra âncora, nunca antes.

## Licença e uso das referências

Os quadros em `referencias/` são frames de vídeos públicos dos dois canais,
usados internamente como referência de estilo para o modelo (estilo não é
protegido; as artes geradas são originais). Não republicar os quadros nem
usá-los em material do cliente.
