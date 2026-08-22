# Imagem do worker de vídeo.
#
# node:22-bookworm-slim mais ffmpeg do apt, e não uma imagem "ffmpeg oficial"
# com node instalado por cima: o apt do Debian entrega ffmpeg 5.x com libx264 e
# libmp3lame, que é tudo que a gente usa, e a imagem fica em torno de 250 MB em
# vez de 1 GB.
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# As dependências primeiro, para a camada de npm ficar em cache quando só o
# código mudar.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

# O Railway injeta PORT. O servidor lê dela e cai em 8080 fora do Railway.
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/index.mjs"]
