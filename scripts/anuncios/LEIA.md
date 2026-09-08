# Anúncios da Demandou

O que monta os anúncios a partir da gravação de tela de 04/09
(`C:\Users\devan\Videos\2026-09-04 10-01-26.mp4`, 812 s, 2560x1440, sem áudio).

    python trilha.py 62 trilha60.wav          # a cama sonora, sintetizada aqui
    python montar.py "C:/Users/devan/Videos/demandou-anuncios" 60     # os dois de 57 s
    python montar.py "C:/Users/devan/Videos/demandou-anuncios" longo  # os dois de 1:49

Antes da primeira vez, as fontes da marca (o script espera `fontes/` ao lado):

    mkdir fontes
    curl -sL -o fontes/Montserrat.ttf "https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf"
    curl -sL -o fontes/Inter.ttf "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf"

Precisa de ffmpeg, Pillow e numpy. O monograma sai de
`public/brand-mark-on-dark.png`, que é o arquivo oficial e não se redesenha.

O texto de cada etapa vive em `PLANO60` e `PLANO_LONGO`, dentro de `montar.py`.
O desenho dos cartões foi aprovado no canvas do Claude Design:
https://claude.ai/code/artifact/0b868157-f3e3-403b-8331-7c0e4efe9f6c
