"""A SINCRONIA DE UM PEDAÇO DO GÊMEO (04/10/2026).

Mede, sem IA paga, duas coisas num pedaço que o gerador devolveu:

  boca_ms   quanto o SOM vem depois da BOCA. A boca é a abertura dos lábios
            (Face Landmarker, pontos 13 e 14 sobre a altura do rosto) a cada
            quadro; o som é o volume da fala (250 a 3500 Hz) na mesma grade, 4
            vezes mais fina que os quadros. O deslocamento é o da maior
            correlação entre as duas curvas, procurado em até 400 ms para cada
            lado. Positivo: som atrasado. Numa gravação real (o vídeo de treino
            do Bruno, 03/10) dá de +8 a +25 ms: a boca abre um pouco antes do
            som sair, e é essa a referência do natural;
  fala_ms   quanto o áudio do pedaço está deslocado em relação à FALA que nós
            mandamos (correlação cruzada da forma de onda). É o que deixa
            trocar o áudio recomprimido do gerador pela nossa fala original sem
            perder a posição.

Uso: python3 gemeo-sincronia.py '{"video": "...", "fala": "... ou null", "modelo": "..."}'
Imprime uma linha JSON.
"""
import json
import subprocess
import sys

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

cfg = json.loads(sys.argv[1])
SR = 16000
SUB = 4


def pcm(arquivo, filtro=None):
    args = ["ffmpeg", "-v", "error", "-nostdin", "-i", arquivo, "-vn", "-ac", "1", "-ar", str(SR)]
    if filtro:
        args += ["-af", filtro]
    b = subprocess.run(args + ["-f", "s16le", "-"], capture_output=True, timeout=120).stdout
    return np.frombuffer(b, np.int16).astype(np.float32) / 32768


def suave(x, k):
    k = max(1, int(k))
    return np.convolve(x, np.ones(k) / k, mode="same")


def deslocamento_da_fala(gerado, nosso):
    """Quanto `gerado` está atrasado em relação a `nosso`, em ms (±500)."""
    n = min(len(gerado), len(nosso), SR * 12)
    if n < SR // 2:
        return None
    a = np.fft.rfft(nosso[:n], 2 * n)
    b = np.fft.rfft(gerado[:n], 2 * n)
    c = np.fft.irfft(b * np.conj(a))
    m = SR // 2
    janela = np.concatenate([c[-m:], c[: m + 1]])
    return round(float(np.argmax(janela) - m) * 1000 / SR, 1)


def boca_e_som(video, modelo):
    cap = cv2.VideoCapture(video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    lm = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=modelo),
            running_mode=vision.RunningMode.VIDEO,
            num_faces=1,
        )
    )
    boca = []
    i = 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        h, w = f.shape[:2]
        if max(h, w) > 720:
            e = 720 / max(h, w)
            f = cv2.resize(f, (int(w * e), int(h * e)))
        r = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(f, cv2.COLOR_BGR2RGB)), int(i * 1000 / fps))
        v = np.nan
        if r.face_landmarks:
            p = r.face_landmarks[0]
            v = abs(p[14].y - p[13].y) / (abs(p[152].y - p[10].y) + 1e-6)
        boca.append(v)
        i += 1
    lm.close()
    boca = np.array(boca, dtype=np.float64)
    n = len(boca)
    if n < fps * 2:
        return None, None, 0
    vistos = ~np.isnan(boca)
    if vistos.sum() < n * 0.6:
        return None, None, int(vistos.sum())
    idx = np.arange(n)
    boca = np.interp(idx, idx[vistos], boca[vistos])

    a = pcm(video, "highpass=f=250,lowpass=f=3500")
    passo = SR / (fps * SUB)
    na = int(len(a) / passo)
    env = np.array([np.sqrt(np.mean(a[int(k * passo): int((k + 1) * passo)] ** 2) + 1e-12) for k in range(na)])
    env = suave(env, 3)
    env = env - suave(env, fps * SUB)
    bg = np.interp(np.arange(na) / (fps * SUB), idx / fps, boca)
    bg = bg - suave(bg, fps * SUB)
    m = min(len(bg), len(env))
    x, y = bg[:m] - bg[:m].mean(), env[:m] - env[:m].mean()
    if x.std() == 0 or y.std() == 0:
        return None, None, n
    teto = int(0.4 * fps * SUB)
    melhor, cmelhor = 0, -9.0
    for L in range(-teto, teto + 1):
        c = np.corrcoef(x[: m - L], y[L:])[0, 1] if L >= 0 else np.corrcoef(x[-L:], y[: m + L])[0, 1]
        if c > cmelhor:
            cmelhor, melhor = c, L
    return round(melhor * 1000 / (fps * SUB)), round(float(cmelhor), 3), n


saida = {"boca_ms": None, "corr": None, "fala_ms": None, "quadros": 0}
try:
    saida["boca_ms"], saida["corr"], saida["quadros"] = boca_e_som(cfg["video"], cfg["modelo"])
except Exception as e:  # a medida nunca derruba a junção
    saida["erro_boca"] = str(e)[:300]
if cfg.get("fala"):
    try:
        saida["fala_ms"] = deslocamento_da_fala(pcm(cfg["video"]), pcm(cfg["fala"]))
    except Exception as e:
        saida["erro_fala"] = str(e)[:300]
print(json.dumps(saida))
