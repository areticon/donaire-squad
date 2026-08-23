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
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg ca-certificates python3 python3-pip \
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
