"""
A FOTO DO GÊMEO DIGITAL (01/10/2026): escolhe, entre as fotos que o cliente
mandou, a melhor para o gerador, e recorta um quadrado em volta do rosto.

## Por que existe

O gerador (OmniHuman 1.5, no fal.ai) anima UMA foto com a fala. A foto decide
metade do resultado: olho fechado, cabeça virada ou rosto pequeno no quadro
viram um vídeo inteiro com o mesmo defeito, pago por segundo. O cliente manda
de 1 a 5 fotos; quem escolhe é o código, com o mesmo critério da capa
(quadro-da-capa.py), e o recorte é sempre quadrado porque foi o formato que
deu o melhor resultado no teste de 01/10 (saída 1440x1440 sem tarja).

## O que recusa, e por quê

- Foto sem rosto: não há o que animar.
- Foto com MAIS DE UMA pessoa: o gerador pode animar a pessoa errada, e o
  gêmeo é só de quem autorizou (Código Civil, art. 20). Recusa em vez de
  adivinhar qual é o cliente.
- Cabeça virada mais de 30 graus: o gerador inventa o outro lado do rosto.

## Contrato

Entra (argumento 1, JSON): {"fotos": [caminhos], "saida": caminho .jpg,
"modelo_rosto": caminho do Face Landmarker, "lado_maximo": 1440}.
Sai (stdout, uma linha JSON): {"escolhida": índice ou null, "avaliacoes":
[{"indice", "rosto", "varios", "nota", "piscada", "giro", "tamanho",
"largura", "altura", "motivo"}], "lado": n}.
"""

import json
import sys

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions


def avaliar(detector, bgr):
    """A nota da foto para o gerador. Mesmos pesos da capa, com recusas."""
    altura, largura = bgr.shape[:2]
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    r = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    base = {"largura": int(largura), "altura": int(altura)}
    if not r.face_landmarks:
        return {**base, "rosto": False, "motivo": "Não achei um rosto nesta foto."}
    if len(r.face_landmarks) > 1:
        return {**base, "rosto": True, "varios": True, "motivo": "Tem mais de uma pessoa nesta foto."}
    pts = r.face_landmarks[0]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    caixa = {"x": min(xs), "y": min(ys), "w": max(xs) - min(xs), "h": max(ys) - min(ys)}
    b = {c.category_name: c.score for c in r.face_blendshapes[0]} if r.face_blendshapes else {}
    piscada = max(b.get("eyeBlinkLeft", 0), b.get("eyeBlinkRight", 0))
    boca = b.get("jawOpen", 0)
    sorriso = (b.get("mouthSmileLeft", 0) + b.get("mouthSmileRight", 0)) / 2
    giro = 0.0
    if r.facial_transformation_matrixes:
        m = np.array(r.facial_transformation_matrixes[0])
        giro = float(np.degrees(np.arctan2(m[0][2], m[2][2])))
    tamanho = caixa["w"] * caixa["h"]
    # Resolução do rosto em pixels: um rosto de 120 px vira um vídeo borrado
    # em 1440, então a nota pesa o tamanho ABSOLUTO além da fração do quadro.
    rosto_px = caixa["h"] * altura
    nota = (
        -3.0 * piscada
        - 2.0 * boca
        + 0.8 * sorriso
        + min(tamanho, 0.12) * 8
        + min(rosto_px, 600) / 600
        - (1.5 if abs(giro) > 25 else abs(giro) / 40)
    )
    avaliacao = {
        **base,
        "rosto": True,
        "varios": False,
        "nota": round(nota, 4),
        "piscada": round(piscada, 3),
        "giro": round(giro, 1),
        "tamanho": round(tamanho, 4),
        "caixa": {k: round(v, 4) for k, v in caixa.items()},
    }
    if abs(giro) > 30:
        avaliacao["motivo"] = "O rosto está virado demais. Use uma foto de frente."
    elif piscada > 0.6:
        avaliacao["motivo"] = "Os olhos parecem fechados nesta foto."
    return avaliacao


def recortar(bgr, caixa, lado_maximo):
    """Quadrado em volta do rosto, com ombros, sem passar da borda da foto.

    O lado é 3,2 vezes a altura do rosto: cabeça e ombros, que é o
    enquadramento de quem fala para a câmera. O centro desce um pouco abaixo
    do meio do rosto para os ombros entrarem. Foto em que o rosto ocupa quase
    tudo vira o maior quadrado que cabe.
    """
    altura, largura = bgr.shape[:2]
    rosto_h = caixa["h"] * altura
    # 3,6 e 0,30 desde 01/10: com 3,2 o gêmeo do Bruno saiu "muito perto"; a foto
    # aprovada no teste tinha cabeça, ombros e começo do peito.
    lado = int(min(largura, altura, max(rosto_h * 3.6, 1)))
    cx = (caixa["x"] + caixa["w"] / 2) * largura
    cy = (caixa["y"] + caixa["h"] / 2) * altura + 0.30 * rosto_h
    x0 = int(min(max(cx - lado / 2, 0), largura - lado))
    y0 = int(min(max(cy - lado / 2, 0), altura - lado))
    quadrado = bgr[y0:y0 + lado, x0:x0 + lado]
    if lado > lado_maximo:
        quadrado = cv2.resize(quadrado, (lado_maximo, lado_maximo), interpolation=cv2.INTER_AREA)
        lado = lado_maximo
    return quadrado, lado


def main():
    cfg = json.loads(sys.argv[1])
    detector = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=cfg["modelo_rosto"]),
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=True,
            # Duas, e não uma: é assim que a foto com outra pessoa é recusada.
            num_faces=2,
        )
    )
    avaliacoes = []
    imagens = []
    for i, caminho in enumerate(cfg["fotos"]):
        # cv2.imread aplica a orientação do EXIF (foto de celular em pé), o que
        # o ffmpeg não faz com JPEG: por isso o recorte também é feito aqui.
        bgr = cv2.imread(caminho, cv2.IMREAD_COLOR)
        if bgr is None:
            avaliacoes.append({"indice": i, "rosto": False, "motivo": "Não consegui abrir esta imagem."})
            imagens.append(None)
            continue
        a = avaliar(detector, bgr)
        a["indice"] = i
        avaliacoes.append(a)
        imagens.append(bgr)

    validas = [a for a in avaliacoes if a.get("rosto") and not a.get("varios") and not a.get("motivo")]
    # Sem foto perfeita, aceita a melhor com rosto único mesmo com aviso (olho
    # meio fechado é melhor que nenhum gêmeo); virada demais nunca.
    if not validas:
        validas = [a for a in avaliacoes if a.get("rosto") and not a.get("varios") and abs(a.get("giro", 99)) <= 30]
    if not validas:
        print(json.dumps({"escolhida": None, "avaliacoes": avaliacoes}))
        return
    melhor = max(validas, key=lambda a: a["nota"])
    quadrado, lado = recortar(imagens[melhor["indice"]], melhor["caixa"], int(cfg.get("lado_maximo", 1440)))
    cv2.imwrite(cfg["saida"], quadrado, [cv2.IMWRITE_JPEG_QUALITY, 93])
    # O QUADRO INTEIRO (03/10, vídeo de treino): além do recorte no rosto, a
    # imagem completa do melhor quadro, que é a referência de corpo, roupa e
    # luz para compor a pessoa num cenário (mesa, palco, escritório).
    if cfg.get("saida_inteira"):
        cv2.imwrite(cfg["saida_inteira"], imagens[melhor["indice"]], [cv2.IMWRITE_JPEG_QUALITY, 93])
    print(json.dumps({"escolhida": melhor["indice"], "avaliacoes": avaliacoes, "lado": lado}))


if __name__ == "__main__":
    main()
