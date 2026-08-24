# Imagem do worker de vídeo.
#
# node:22-bookworm-slim mais ffmpeg do apt, e não uma imagem "ffmpeg oficial"
# com node instalado por cima: o apt do Debian entrega ffmpeg 5.x com libx264 e
# libmp3lame, que é tudo que a gente usa, e a imagem fica bem menor.
FROM node:22-bookworm-slim

# Python entra por UMA razão: recortar a pessoa do fundo.
#
# O Bruno olhou os cortes em 23/08 e disse que estavam pessimos, com razão. O
# conserto que ele pediu foi recortar a pessoa e trocar o fundo, e isso precisa
# de um modelo de segmentação. O único que roda rápido em CPU sem GPU é o Selfie
# Segmenter do MediaPipe, que só tem binding maduro em Python. Medido no vídeo
# real: 7,2 ms por quadro.
#
# `opencv-python-headless` e não `opencv-python`: a versão cheia arrasta Qt, GTK
# e mais de 400 MB de bibliotecas de janela, que num contêiner sem tela nunca
# são usadas.
# libegl1, libgl1 e libglib2.0-0 não são enfeite. O MediaPipe carrega EGL na
# IMPORTAÇÃO, mesmo quando o trabalho é só inferência em CPU, e sem elas o import
# morre com "libEGL.so.1: cannot open shared object file".
#
# Descoberto em produção em 23/08, no primeiro deploy com recorte. O corte saiu
# inteiro, na composição antiga, porque a rede de segurança segurou, e o único
# sinal foi uma linha no log. Sem aquela linha, o sintoma seria "o recorte que a
# gente implementou simplesmente não aparece", que é a pior forma de bug.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg ca-certificates python3 python3-pip \
        libegl1 libgles2 libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages \
        mediapipe==1.0.1 \
        opencv-python-headless==4.11.0.86 \
        numpy==2.2.6

WORKDIR /app

# O modelo de segmentação vai na imagem, e não é baixado em tempo de execução.
# São 224 KB, e baixar a cada trabalho seria uma dependência de rede nova num
# caminho que já tem download de vídeo para dar errado.
ADD https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite /app/modelos/selfie_segmenter.tflite
RUN chmod 644 /app/modelos/selfie_segmenter.tflite

# PROVA EM TEMPO DE CONSTRUCAO, e nao verificacao em producao.
#
# Isto existe porque a mesma falha me pegou tres vezes seguidas em 23/08, e
# sempre da mesma forma: o verificador testava MENOS do que o produto faz, dava
# verde, e o recorte caia calado na composicao antiga.
#
#   1a  `import mediapipe`            passa; falta libEGL.so.1
#   2a  `import ...tasks.python.vision` passa; falta libGLESv2.so.2
#   3a  so `create_from_options` de verdade carrega tudo
#
# Cada biblioteca so e aberta no momento exato em que e usada, entao a unica
# checagem honesta e FAZER o que o produto faz: criar o segmentador com o modelo
# real. Aqui, se faltar qualquer biblioteca, a IMAGEM NAO SOBE, e o problema
# aparece na construcao em vez de virar um corte pior sem explicacao.
RUN python3 -c "from mediapipe.tasks.python import vision, BaseOptions; seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(     base_options=BaseOptions(model_asset_path='/app/modelos/selfie_segmenter.tflite'),     output_category_mask=False, output_confidence_masks=True)); import numpy, cv2, mediapipe as mp; img = mp.Image(image_format=mp.ImageFormat.SRGB, data=numpy.zeros((64,64,3), numpy.uint8)); r = seg.segment(img); assert r.confidence_masks, 'segmentador nao devolveu mascara'; seg.close(); print('recorte provado na construcao:', mp.__version__)"

# AS FONTES DOS ESTILOS DE EDICAO.
#
# O libass NAO falha quando a fonte pedida nao existe: ele escolhe outra em
# silencio e desenha. O video sai valido, legivel, e ninguem percebe.
#
# Foi o que aconteceu ate 24/08. Verificado no quadro do video completo de
# PRODUCAO: o estilo pedia Arial, e o que apareceu foi DejaVu Sans Bold, porque
# este conteiner nao tem nenhuma fonte da Microsoft e so tinha a familia DejaVu,
# que entrou de carona numa dependencia. Com quatro estilos de edicao isso
# deixa de ser detalhe: os quatro sairiam com a MESMA tipografia e a escolha do
# cliente nao mudaria nada na tela.
#
# As quatro fontes moram no REPOSITORIO, e nao vem do apt nem de download em
# tempo de construcao. Duas razoes. Uma dependencia de rede a mais no build e
# uma forma a mais de o deploy falhar por motivo que nao tem nada a ver com o
# codigo. E, mais importante, o teste local passa a desenhar com os MESMOS
# arquivos que o conteiner, entao um quadro conferido aqui vale para la; com a
# fonte vindo do apt, o que eu olho na maquina de desenvolvimento nao e o que o
# cliente recebe.
#
# A Liberation Sans tem as MESMAS metricas da Arial, entao ela e a substituta
# certa e nao um remendo. Todas sao OFL, que permite embutir e distribuir.
#
#   PT Serif Bold  -> estilo dramatico   (serifada, para historia pessoal)
#   Anton          -> estilo acelerado   (o peso de titulo que virou padrao de corte)
#   Liberation Sans-> estilo serio       (neutra, metrica de Arial)
#   Bangers        -> estilo animado     (desenhada, para bastidor e humor)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY fontes/*.ttf /usr/local/share/fonts/

# PROVA EM TEMPO DE CONSTRUCAO, pela mesma razao da prova do MediaPipe acima:
# a falha aqui e SILENCIOSA por natureza, entao a unica checagem honesta e
# mandar o libass escolher de verdade e conferir o que ele escolheu. Se faltar
# qualquer fonte, ou se o nome em lib/media/estilos.ts nao bater com o que esta
# instalado, a IMAGEM NAO SOBE.
COPY fontes/provar-fontes.py /tmp/provar-fontes.py
RUN fc-cache -f > /dev/null && python3 /tmp/provar-fontes.py && rm /tmp/provar-fontes.py

# A PALETA DE EMOJI.
#
# Sao imagens e nao texto porque o libass deste ffmpeg desenha emoji so em
# contorno, sem cor. Medido em 24/08 com as duas fontes que poderiam servir: a
# do sistema, em formato COLR, saiu monocromatica, e a Noto Color Emoji, em
# formato CBDT, o libass nem chega a escolher, cai para a Arial.
#
# Sao 24 arquivos de 128 px, 144 KB no total, do projeto Noto Emoji do Google
# sob Apache 2.0, com o arquivo de licenca ao lado. A lista e fechada de
# proposito: ela da ao canal do cliente um vocabulario visual constante em vez
# do que o modelo lembrar naquele dia.
COPY emoji ./emoji

# As dependências primeiro, para a camada de npm ficar em cache quando só o
# código mudar.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

# O Railway injeta PORT. O servidor lê dela e cai em 8080 fora do Railway.
ENV NODE_ENV=production
ENV MODELO_SEGMENTACAO=/app/modelos/selfie_segmenter.tflite
EXPOSE 8080

CMD ["node", "src/index.mjs"]
