"""
A LEITURA DO VÍDEO, camada de medição (06/10/2026): quem está no quadro, onde,
se há tela ou quadro branco, e quanto a imagem mexe. Sem IA paga.

## Por que existe

Regra do Bruno (06/10, 01h): "a IA deve identificar o que é, o que está sendo
dito, qual o cenário e gerar os prompts de forma precisa; não é inteligente se
preparar só para uma pessoa falando: é se preparar para qualquer vídeo". Até
aqui o editor sabia duas coisas da imagem: câmera ou tela (por quadro-chave) e
a caixa de UM rosto medida num quadro só. Duas pessoas em pé, uma pessoa com um
quadro branco atrás, um podcast, uma palestra filmada de longe: tudo virava
"uma pessoa falando" e a peça caía em cima do que não podia tapar.

Esta camada mede, por amostra de tempo, o que dá para medir em código com o
que o contêiner já tem (MediaPipe Face Landmarker e Selfie Multiclass, OpenCV,
ffmpeg). O que não dá para medir (o que acontece, do que se fala, o cenário)
fica para a camada de visão, no app (lib/media/leitura-do-video.ts). Aqui
ninguém decide edição: a saída é medida, e quem decide continua sendo o JEV.

## O que sai, por amostra

- pessoas: caixa do corpo (segmentador multiclasse, componentes conexos) e do
  rosto (Face Landmarker, até 6 rostos), e a abertura da boca (blendshape
  jawOpen), que ao longo do trecho diz quem está falando;
- tela: a maior região retangular de células estáticas, de fundo uniforme e
  cheias de traço fino (texto), fora da pessoa;
- quadro: a maior região retangular de células planas e claras (ou escuras e
  sem cor, lousa) com alguma escrita, atrás da pessoa, que por isso pode
  incluir as células da pessoa;
- mov: diferença média entre esta amostra e a anterior (cinza 32x18), que vira
  "parado", "pouco" ou "muito" no app.

## Amostragem

Quadro-chave (`-skip_frame nokey`): o completo tem um a cada 2 s, e decodificar
só eles custa segundos num vídeo de 20 min. Quando a cadência é maior que 3 s
(celular com GOP longo), o app pede `modo: "fps1"` e a decodificação é inteira,
a 1 quadro por segundo.

## Contrato

Entra (argumento 1, JSON): {"video", "modelo_rosto", "modelo_segmentacao",
"largura": 480, "modo": "chave"|"fps1", "ate": segundos|null, "max_pessoas": 6}.
Sai (stdout, uma linha JSON): {"ok": true, "largura", "altura", "amostras":
[{"t", "mov", "luz", "pessoas": [{"caixa": [x,y,w,h], "rosto": [..]|null,
"boca": 0..1|null}], "tela": [..]|null, "quadro": [..]|null}], "tempos": {...}}.
Caixas em fração do quadro (0 a 1). Erro: {"ok": false, "erro": "..."}.
"""

import json
import re
import subprocess
import sys
import threading
import time

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

# A grade de células para tela e quadro: 24 x 14 cabe em 16:9 e em 9:16 (as
# células ficam altas, o que não atrapalha: a decisão é por região).
COLUNAS, LINHAS = 24, 14

# Classes do selfie_multiclass_256x256: 0 fundo, 1 cabelo, 2 pele do corpo,
# 3 pele do rosto, 4 roupa, 5 acessórios. Pessoa é tudo menos o fundo.
CLASSES_DE_PESSOA = (1, 2, 3, 4, 5)

# Componente de pessoa abaixo disto é ruído do segmentador (mão na borda, sombra).
AREA_MINIMA_DA_PESSOA = 0.012


def dimensoes(video):
    saida = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate:format=duration", "-of", "json", video],
        capture_output=True, text=True, check=True,
    ).stdout
    j = json.loads(saida)
    s = j["streams"][0]
    num, den = (s.get("r_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den or 1)
    return int(s["width"]), int(s["height"]), fps, float(j.get("format", {}).get("duration") or 0)


def quadros(video, largura, modo, ate):
    """Gera (indice, imagem RGB) e devolve ao fim a lista de tempos, pela showinfo."""
    w0, h0, _, _ = dimensoes(video)
    largura = min(largura, w0)
    altura = int(round(h0 * largura / w0 / 2)) * 2
    filtro = f"scale={largura}:{altura}:flags=area,format=rgb24,showinfo"
    if modo == "fps1":
        filtro = "fps=1," + filtro
    args = ["ffmpeg", "-nostdin", "-hide_banner", "-v", "info"]
    if modo != "fps1":
        args += ["-skip_frame", "nokey"]
    args += ["-i", video]
    if ate:
        args += ["-t", str(float(ate))]
    args += ["-vf", filtro, "-fps_mode", "passthrough", "-an", "-f", "rawvideo", "-"]
    p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    tempos = []

    def ler_erro():
        resto = b""
        for pedaco in iter(lambda: p.stderr.read(4096), b""):
            resto += pedaco
            for m in re.finditer(rb"pts_time:\s*([\d.]+)", resto):
                tempos.append(float(m.group(1)))
            corte = resto.rfind(b"pts_time:")
            resto = resto[corte + 1:] if corte >= 0 else b""

    fio = threading.Thread(target=ler_erro, daemon=True)
    fio.start()
    tamanho = largura * altura * 3
    i = 0
    while True:
        dados = p.stdout.read(tamanho)
        if len(dados) < tamanho:
            break
        yield i, np.frombuffer(dados, np.uint8).reshape((altura, largura, 3))
        i += 1
    p.stdout.close()
    p.wait()
    fio.join(timeout=5)
    quadros.tempos = tempos


def caixa_de(x0, y0, x1, y1, w, h):
    return [round(max(0.0, x0 / w), 4), round(max(0.0, y0 / h), 4),
            round(min(1.0, (x1 - x0) / w), 4), round(min(1.0, (y1 - y0) / h), 4)]


TOM_IGUAL = 24


def superficies(celulas, pessoa, tom):
    """As superfícies candidatas (tela ou quadro), cada uma um conjunto de
    células do MESMO tom dominante, ligadas entre si mesmo passando pela
    pessoa (a superfície fica atrás dela).

    O tom é o que separa o quadro branco da parede cinza ao lado, e a parede
    azul clara do papel na mesa: a parede lisa e o quadro são os dois "lisos",
    mas não têm o mesmo tom. Devolve uma lista de (máscara das células,
    caixa [x, y, w, h] envolvente das células da superfície, sem a pessoa)."""
    grade = (celulas | pessoa).astype(np.uint8)
    n, rotulos = cv2.connectedComponents(grade, connectivity=8)
    saida = []
    for j in range(1, n):
        comp = (rotulos == j) & celulas
        if comp.sum() < 4:
            continue
        tons = tom[comp]
        # O tom mais comum do componente, com tolerância; o que foge dele é
        # outra superfície (a parede em volta do quadro) e fica de fora.
        hist = np.bincount((tons // 8).astype(np.int64), minlength=32)
        k = int(hist.argmax())
        centro = k * 8 + 4
        mesmas = comp & (np.abs(tom.astype(np.int16) - centro) <= TOM_IGUAL)
        if mesmas.sum() < 4:
            continue
        # Só o que continua ligado depois do corte por tom (passando pela pessoa).
        n2, rot2 = cv2.connectedComponents((mesmas | pessoa).astype(np.uint8), connectivity=8)
        melhor = None
        for q in range(1, n2):
            parte = (rot2 == q) & mesmas
            if melhor is None or parte.sum() > melhor.sum():
                melhor = parte
        if melhor is None or melhor.sum() < 4:
            continue
        linhas_com, colunas_com = np.where(melhor)
        r0, r1 = linhas_com.min(), linhas_com.max() + 1
        c0, c1 = colunas_com.min(), colunas_com.max() + 1
        saida.append((melhor, [round(c0 / COLUNAS, 4), round(r0 / LINHAS, 4), round((c1 - c0) / COLUNAS, 4), round((r1 - r0) / LINHAS, 4)]))
    return saida


def tom_dominante(bloco):
    hist = np.bincount((bloco.ravel() // 8).astype(np.int64), minlength=32)
    return float(int(hist.argmax()) * 8 + 4)


def celulas_do(mapa, reduzir):
    """Reduz um mapa (h x w) para a grade de células com a função dada."""
    h, w = mapa.shape[:2]
    saida = np.zeros((LINHAS, COLUNAS), dtype=np.float32)
    for r in range(LINHAS):
        y0, y1 = r * h // LINHAS, (r + 1) * h // LINHAS
        for c in range(COLUNAS):
            x0, x1 = c * w // COLUNAS, (c + 1) * w // COLUNAS
            saida[r, c] = reduzir(mapa[y0:y1, x0:x1])
    return saida


def fracao_dominante(bloco):
    """Quanto do bloco está perto do tom mais comum (fundo uniforme de tela e quadro)."""
    hist = np.bincount((bloco.ravel() // 8).astype(np.int64), minlength=32)
    k = int(hist.argmax())
    perto = hist[max(0, k - 1):k + 2].sum()
    return float(perto) / max(1, bloco.size)


def medir(config):
    t0 = time.time()
    video = config["video"]
    largura = int(config.get("largura") or 480)
    modo = config.get("modo") or "chave"
    ate = config.get("ate")
    max_pessoas = int(config.get("max_pessoas") or 6)
    w0, h0, fps, duracao = dimensoes(video)

    rosto = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=config["modelo_rosto"]),
        running_mode=vision.RunningMode.IMAGE,
        num_faces=max_pessoas,
        output_face_blendshapes=True,
        min_face_detection_confidence=0.5,
    ))
    segmentador = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=config["modelo_segmentacao"]),
        running_mode=vision.RunningMode.IMAGE,
        output_category_mask=True,
        output_confidence_masks=False,
    ))

    amostras = []
    anterior_pequeno = None
    anterior_celulas = None
    tempos_de = {"rosto": 0.0, "segmentacao": 0.0, "grade": 0.0}
    for i, rgb in quadros(video, largura, modo, ate):
        h, w = rgb.shape[:2]
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        pequeno = cv2.resize(gray, (32, 18), interpolation=cv2.INTER_AREA).astype(np.int16)
        mov = float(np.abs(pequeno - anterior_pequeno).mean()) if anterior_pequeno is not None else 0.0
        anterior_pequeno = pequeno

        # 1. Rostos (com a boca) e 2. pessoas (segmentação por componente).
        imagem = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        ta = time.time()
        r = rosto.detect(imagem)
        tempos_de["rosto"] += time.time() - ta
        rostos = []
        for k, marcos in enumerate(r.face_landmarks or []):
            xs = [m.x for m in marcos]
            ys = [m.y for m in marcos]
            boca = None
            if r.face_blendshapes and k < len(r.face_blendshapes):
                for b in r.face_blendshapes[k]:
                    if b.category_name == "jawOpen":
                        boca = round(float(b.score), 3)
            rostos.append({
                "caixa": [round(max(0.0, min(xs)), 4), round(max(0.0, min(ys)), 4),
                          round(min(1.0, max(xs) - min(xs)), 4), round(min(1.0, max(ys) - min(ys)), 4)],
                "boca": boca,
            })

        ta = time.time()
        categoria = segmentador.segment(imagem).category_mask.numpy_view()
        tempos_de["segmentacao"] += time.time() - ta
        pessoa = np.isin(categoria, CLASSES_DE_PESSOA).astype(np.uint8)
        pessoa = cv2.morphologyEx(pessoa, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        n, rotulos, stats, _ = cv2.connectedComponentsWithStats(pessoa, connectivity=8)
        corpos = []
        for j in range(1, n):
            x, y, cw, ch, area = stats[j]
            if area < AREA_MINIMA_DA_PESSOA * w * h:
                continue
            corpos.append({"caixa": caixa_de(x, y, x + cw, y + ch, w, h), "area": int(area)})
        corpos.sort(key=lambda c: -c["area"])
        corpos = corpos[:max_pessoas]

        # Duas pessoas que se encostam viram UM componente no segmentador (os
        # ombros se tocam). Um corpo com dois ou mais rostos dentro é partido
        # na vertical, no meio entre os rostos vizinhos, e cada parte vira o
        # corpo de um rosto, com a caixa apertada pela máscara daquela fatia.
        partidos = []
        for c in corpos:
            x, y, cw, ch = c["caixa"]
            dentro = sorted(
                [f for f in rostos if x <= f["caixa"][0] + f["caixa"][2] / 2 <= x + cw and y <= f["caixa"][1] + f["caixa"][3] / 2 <= y + ch],
                key=lambda f: f["caixa"][0],
            )
            if len(dentro) < 2:
                partidos.append(c)
                continue
            centros = [f["caixa"][0] + f["caixa"][2] / 2 for f in dentro]
            divisoes = [x] + [(centros[k] + centros[k + 1]) / 2 for k in range(len(centros) - 1)] + [x + cw]
            for k in range(len(dentro)):
                px0, px1 = int(divisoes[k] * w), int(divisoes[k + 1] * w)
                py0, py1 = int(y * h), int((y + ch) * h)
                fatia = pessoa[py0:py1, px0:px1]
                ys, xs = np.where(fatia > 0)
                if len(xs) < AREA_MINIMA_DA_PESSOA * w * h:
                    continue
                partidos.append({"caixa": caixa_de(px0 + xs.min(), py0 + ys.min(), px0 + xs.max() + 1, py0 + ys.max() + 1, w, h), "area": int(len(xs))})
        corpos = partidos[:max_pessoas]

        # Rosto dentro de um corpo: a pessoa tem os dois. Rosto sem corpo
        # (segmentador não viu, pessoa pequena ou longe): a caixa do corpo é
        # estimada pelo rosto. Corpo sem rosto (de costas, longe): fica sem.
        pessoas = []
        usados = set()
        for f in rostos:
            fx, fy, fw, fh = f["caixa"]
            cx, cy = fx + fw / 2, fy + fh / 2
            dono = None
            for idx, c in enumerate(corpos):
                x, y, cw, ch = c["caixa"]
                if idx not in usados and x <= cx <= x + cw and y <= cy <= y + ch:
                    dono = idx
                    break
            if dono is not None:
                usados.add(dono)
                pessoas.append({"caixa": corpos[dono]["caixa"], "rosto": f["caixa"], "boca": f["boca"]})
            else:
                x0, y0 = max(0.0, cx - 1.6 * fw), max(0.0, fy - 0.4 * fh)
                x1, y1 = min(1.0, cx + 1.6 * fw), min(1.0, fy + 4.5 * fh)
                pessoas.append({"caixa": [round(x0, 4), round(y0, 4), round(x1 - x0, 4), round(y1 - y0, 4)],
                                "rosto": f["caixa"], "boca": f["boca"]})
        for idx, c in enumerate(corpos):
            if idx not in usados:
                pessoas.append({"caixa": c["caixa"], "rosto": None, "boca": None})
        pessoas = pessoas[:max_pessoas]

        # 3. Tela e quadro, pela grade de células.
        ta = time.time()
        borrado = cv2.GaussianBlur(gray, (3, 3), 0)
        bordas = (cv2.Canny(borrado, 60, 160) > 0).astype(np.float32)
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        c_borda = celulas_do(bordas, lambda b: float(b.mean()))
        c_luma = celulas_do(gray, lambda b: float(b.mean()))
        c_desvio = celulas_do(gray, lambda b: float(b.std()))
        c_sat = celulas_do(hsv[:, :, 1], lambda b: float(b.mean()))
        c_dominante = celulas_do(gray, fracao_dominante)
        c_tom = celulas_do(gray, tom_dominante)
        c_pessoa = celulas_do(pessoa, lambda b: float(b.mean()))
        c_mexe = np.abs(c_luma - anterior_celulas) if anterior_celulas is not None else np.zeros_like(c_luma)
        anterior_celulas = c_luma
        tempos_de["grade"] += time.time() - ta

        e_pessoa = c_pessoa > 0.25
        estatica = c_mexe < 6
        # A SUPERFÍCIE: célula parada, de fundo uniforme (metade do bloco no
        # mesmo tom), fora da pessoa. Ela é "texto" quando cheia de traço fino
        # (slide, interface, escrita grande) ou "lisa" quando clara (quadro
        # branco, flipchart, slide vazio) ou escura e sem cor (lousa).
        uniforme = (c_dominante >= 0.45) & estatica & ~e_pessoa
        texto = uniforme & (c_borda >= 0.05)
        lisa = uniforme & (c_desvio < 22) & (c_borda < 0.09) & ((c_luma >= 160) | ((c_luma <= 85) & (c_sat <= 60)))
        superficie = texto | lisa
        escrita = superficie & (c_borda >= 0.012)
        tela = None
        quadro = None
        for mascara, regiao in superficies(superficie, e_pessoa, c_tom):
            total = max(1, int(mascara.sum()))
            # Faixa fina (rodapé, topo de parede, barra de programa) não é
            # tela nem quadro: a região precisa de corpo nos dois eixos, e a
            # superfície precisa preencher a caixa (fora da pessoa).
            c0, r0 = int(round(regiao[0] * COLUNAS)), int(round(regiao[1] * LINHAS))
            nc, nr = max(1, int(round(regiao[2] * COLUNAS))), max(1, int(round(regiao[3] * LINHAS)))
            fora_da_pessoa = max(1, int((~e_pessoa[r0:r0 + nr, c0:c0 + nc]).sum()))
            tem_corpo = regiao[2] >= 0.2 and regiao[3] >= 0.2 and regiao[2] * regiao[3] >= 0.08 and total >= 0.5 * fora_da_pessoa
            if not tem_corpo:
                continue
            # Texto dominando: tela (slide, programa, página). Liso com escrita
            # em pelo menos 15% das células: quadro. Liso sem escrita é parede
            # ou slide vazio, e não entra. A visão desempata depois (temTela /
            # temQuadro): texto grande num quadro branco parece slide aqui.
            if (texto & mascara).sum() >= 0.5 * total:
                if tela is None or regiao[2] * regiao[3] > tela[2] * tela[3]:
                    tela = regiao
            elif (escrita & mascara).sum() >= 0.15 * total and regiao[2] * regiao[3] >= 0.12:
                if quadro is None or regiao[2] * regiao[3] > quadro[2] * quadro[3]:
                    quadro = regiao

        amostras.append({
            "i": i,
            "mov": round(mov, 2),
            "luz": round(float(gray.mean()), 1),
            "pessoas": pessoas,
            "tela": tela,
            "quadro": quadro,
        })

    tempos = getattr(quadros, "tempos", []) or []
    passo = 1.0 if modo == "fps1" else 2.0
    for a in amostras:
        a["t"] = round(tempos[a["i"]], 3) if a["i"] < len(tempos) else round(a["i"] * passo, 3)
        del a["i"]
    rosto.close()
    segmentador.close()
    return {
        "ok": True,
        "largura": w0,
        "altura": h0,
        "fps": round(fps, 3),
        "duracao": round(duracao, 3),
        "modo": modo,
        "amostras": amostras,
        "tempos": {k: round(v, 2) for k, v in tempos_de.items()} | {"total": round(time.time() - t0, 2)},
    }


if __name__ == "__main__":
    try:
        cfg = json.loads(sys.argv[1])
        print(json.dumps(medir(cfg), ensure_ascii=False))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "erro": f"{type(e).__name__}: {e}"}))
        sys.exit(1)
