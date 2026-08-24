"""
Recorta a pessoa do fundo, quadro a quadro, e devolve a máscara como vídeo.

## Por que Python dentro de um worker Node

Segmentação de pessoa precisa de um modelo, e o único que roda rápido em CPU sem
GPU é o Selfie Segmenter do MediaPipe, que só tem binding maduro em Python. O
contêiner ganhou Python por causa disto e por mais nada.

Medido na gravação real do Bruno em 23/08: 7,2 ms por quadro, ou 139 por
segundo. Um corte de 60 segundos a 30 quadros custa cerca de 13 segundos de
processamento. O modelo tem 224 KB.

## O contrato com o Node

Entra: o vídeo, a caixa da pessoa em fração do quadro, e o trecho de tempo.
Sai: um vídeo em tons de cinza (a máscara) e uma linha de JSON no stdout com a
caixa APERTADA, que o Node usa para recortar a imagem colorida. Os dois precisam
usar exatamente a mesma caixa, senão a máscara fica deslocada da pessoa.

## As duas descobertas que fazem isto funcionar

**1. A caixa precisa ser apertada antes, senão o modelo produz lixo.** Com a
caixa que o agente de visão devolve, que inclui a faixa branca do slide e a
barra de botões do app, a segmentação inventa manchas em volta. Apertando só na
janela da webcam, sai limpa de primeira.

**2. A janela da webcam é a região que MUDA.** A barra de botões e o slide são
estáticos. Diferença entre quadros distantes acha a webcam sem heurística de cor
nenhuma, e funciona para qualquer gravação de tela. Verificado no vídeo real: a
detecção devolveu y=95 e altura 563, contra 97 e 558 medidos a olho.
"""

import json
import subprocess
import sys

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

# Confiança abaixo disto vira fundo. É onde mora o lixo: com 0,5 entram pedaços
# de prateleira e de almofada; com 0,6 a silhueta fica limpa sem comer ombro.
LIMIAR = 0.60

# Quanto a máscara nova pesa contra a acumulada. Artefato de segmentação PISCA,
# o corpo não, então a média entre quadros mata o artefato e preserva a pessoa.
# 0,45 é o ponto em que o piscar some sem a silhueta ficar borrada no movimento.
PESO_DO_NOVO = 0.45

# Quanto da base da máscara vira transparência gradual, em fração da altura.
#
# ## Por que isto existe
#
# O Bruno olhou o corte de 24/08 e havia uma faixa clara atravessando a base da
# pessoa. Investigado com o modelo real rodando sobre a gravação real: o maior
# componente conectado NÃO é a pessoa, é a pessoa mais a mesa na frente dela e
# mais um objeto ao lado, porque o ombro encosta nos dois e o segmentador liga
# tudo. Medido em 8 quadros: num deles a base da máscara mede 408 px de largura
# contra 209 do tronco, ou seja 1,95 vezes, e ela atravessa a caixa inteira.
#
# Duas coisas foram tentadas e MEDIDAS antes desta:
#
#   zerar tudo abaixo da linha ofensora  -> levava 44% da máscara junto,
#                                           inclusive o peito da pessoa
#   erodir para quebrar a ponte          -> não quebra, a ligação é larga e não
#                                           fina; com raio 13 a pessoa some antes
#
# O que resta é atacar onde o defeito aparece. A base da pessoa JÁ é cortada
# pela borda do quadro na composição, então uma transparência gradual ali não
# perde conteúdo: ela troca uma linha dura, que o olho lê como recorte mal
# feito, por uma passagem suave, e leva a faixa junto.
#
# Não resolve por completo, e isso está registrado: medido na composição, o
# excesso de brilho da faixa sobre o fundo cai de +17 para +13 pontos. O que
# resolveria de vez é trocar o modelo pelo `selfie_multiclass`, que separa
# cabelo, pele e roupa do resto em vez de devolver um bloco só.
BASE_ESMAECIDA = 0.14


def caixa_da_webcam(video, caixa, inicio, duracao):
    """A sub-região que realmente é vídeo, dentro da caixa que veio do agente.

    Amostra quatro quadros espalhados pelo trecho e fica com o maior bloco onde
    houve movimento. O que não mexe em oito segundos de fala é interface, não
    pessoa.
    """
    amostras = []
    for f in (0.15, 0.4, 0.65, 0.9):
        t = inicio + duracao * f
        dados = subprocess.run(
            ["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", video,
             "-vframes", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
            capture_output=True,
        ).stdout
        if not dados:
            continue
        img = cv2.imdecode(np.frombuffer(dados, np.uint8), cv2.IMREAD_GRAYSCALE)
        if img is None:
            continue
        H, W = img.shape
        x, y = int(caixa["x"] * W), int(caixa["y"] * H)
        w, h = int(caixa["w"] * W), int(caixa["h"] * H)
        amostras.append(img[y:y + h, x:x + w].astype(np.int16))

    if len(amostras) < 2:
        return caixa

    mov = np.zeros(amostras[0].shape, np.float32)
    for a, b in zip(amostras, amostras[1:]):
        mov = np.maximum(mov, np.abs(a - b).astype(np.float32))
    mov = cv2.GaussianBlur(mov, (0, 0), 3)

    ativo = (mov > 8).astype(np.uint8)
    ativo = cv2.morphologyEx(
        ativo, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (31, 31))
    )
    n, _, stats, _ = cv2.connectedComponentsWithStats(ativo, 8)
    if n <= 1:
        return caixa

    i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, y, w, h, area = stats[i]
    ah, aw = amostras[0].shape

    # Achado pequeno demais é ruído, não janela de webcam. Melhor ficar com a
    # caixa original do que recortar em cima de um reflexo.
    if area < 0.15 * ah * aw or w < 0.2 * aw or h < 0.2 * ah:
        return caixa

    return {
        "x": caixa["x"] + caixa["w"] * (x / aw),
        "y": caixa["y"] + caixa["h"] * (y / ah),
        "w": caixa["w"] * (w / aw),
        "h": caixa["h"] * (h / ah),
    }


def main():
    cfg = json.loads(sys.argv[1])
    video, saida = cfg["video"], cfg["saida"]
    inicio, duracao = float(cfg["inicio"]), float(cfg["duracao"])
    fps = float(cfg.get("fps", 30))

    caixa = caixa_da_webcam(video, cfg["caixa"], inicio, duracao)

    sonda = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", video],
        capture_output=True, text=True,
    ).stdout.strip().split(",")
    W, H = int(sonda[0]), int(sonda[1])

    # Dimensões PARES, porque libx264 recusa ímpar e o erro que aparece fala de
    # altura de plano, não de recorte.
    cx, cy = int(caixa["x"] * W) // 2 * 2, int(caixa["y"] * H) // 2 * 2
    cw, ch = int(caixa["w"] * W) // 2 * 2, int(caixa["h"] * H) // 2 * 2

    ler = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-ss", f"{inicio:.3f}", "-i", video,
         "-t", f"{duracao:.3f}", "-vf", f"crop={cw}:{ch}:{cx}:{cy},fps={fps}",
         "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
        stdout=subprocess.PIPE,
    )
    escrever = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray",
         "-s", f"{cw}x{ch}", "-r", str(fps), "-i", "-",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "12",
         "-pix_fmt", "yuv420p", saida],
        stdin=subprocess.PIPE,
    )

    opcoes = vision.ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=cfg["modelo"]),
        output_category_mask=False,
        output_confidence_masks=True,
    )
    nucleo = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    acumulada = None
    quadros = 0
    centros = []

    # A rampa que esmaece a base, calculada UMA vez: ela não muda de quadro para
    # quadro e multiplicar por um vetor pronto é de graça.
    linhas_esmaecidas = max(1, int(ch * BASE_ESMAECIDA))
    rampa = np.ones(ch, np.float32)
    rampa[ch - linhas_esmaecidas:] = np.linspace(1, 0, linhas_esmaecidas, dtype=np.float32)
    rampa = rampa[:, None]

    with vision.ImageSegmenter.create_from_options(opcoes) as segmentador:
        while True:
            cru = ler.stdout.read(cw * ch * 3)
            if len(cru) < cw * ch * 3:
                break
            bgr = np.frombuffer(cru, np.uint8).reshape(ch, cw, 3)

            imagem = mp.Image(
                image_format=mp.ImageFormat.SRGB,
                data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB),
            )
            bruta = segmentador.segment(imagem).confidence_masks[0].numpy_view()

            binaria = (bruta > LIMIAR).astype(np.uint8)
            binaria = cv2.morphologyEx(binaria, cv2.MORPH_OPEN, nucleo)
            binaria = cv2.morphologyEx(binaria, cv2.MORPH_CLOSE, nucleo)

            # Só o maior pedaço conectado. A pessoa é um bloco só; prateleira,
            # jarra e almofada não são, e é assim que elas somem.
            n, rotulos, stats, _ = cv2.connectedComponentsWithStats(binaria, 8)
            if n > 1:
                maior = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
                binaria = (rotulos == maior).astype(np.uint8)

            # Onde a pessoa está, na horizontal, dentro do recorte.
            #
            # A composição centraliza a CAIXA, e a pessoa não fica no meio da
            # própria janela da webcam. Medido na gravação real: a cabeça fica
            # em 46% da caixa, e o corte saía com ela 78 px à esquerda do centro
            # da tela. Alinhando por aqui, o desvio cai para 24 px. Com o fundo
            # escuro isso passava despercebido; com o fundo claro ficou
            # evidente.
            #
            # Medido só na METADE DE CIMA, que é onde está a cabeça: a metade de
            # baixo é justamente onde a mesa entra na máscara, e ela puxaria o
            # centro para o lado errado.
            colunas = binaria[: ch // 2].sum(axis=0)
            if colunas.sum() > 0:
                xs = np.nonzero(colunas > 0)[0]
                centros.append((xs[0] + xs[-1]) / 2 / max(1, cw))

            atual = cv2.GaussianBlur(binaria.astype(np.float32), (0, 0), 2.0)
            acumulada = atual if acumulada is None else (
                PESO_DO_NOVO * atual + (1 - PESO_DO_NOVO) * acumulada
            )

            escrever.stdin.write(
                (np.clip(acumulada * rampa, 0, 1) * 255).astype(np.uint8).tobytes()
            )
            quadros += 1

    escrever.stdin.close()
    escrever.wait()
    ler.stdout.close()
    ler.wait()

    # O Node precisa da caixa APERTADA para recortar a imagem colorida no mesmo
    # lugar. Em pixels, e não em fração, para não haver arredondamento diferente
    # dos dois lados.
    # O centro é a MEDIANA do trecho, e não o valor de cada quadro. Alinhar
    # quadro a quadro faria a pessoa deslizar de lado toda vez que ela se
    # mexesse, e isso é pior que ficar deslocada: desalinhamento parado o olho
    # aceita, movimento sem motivo ele não.
    centro = float(np.median(centros)) if centros else 0.5

    print(json.dumps({
        "ok": quadros > 0,
        "quadros": quadros,
        "recorte": {"x": cx, "y": cy, "w": cw, "h": ch},
        "centro": round(centro, 4),
    }))


if __name__ == "__main__":
    main()
