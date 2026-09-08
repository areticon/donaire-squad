# -*- coding: utf-8 -*-
"""
Trilha sintetizada para os anuncios.

Existe porque a gravacao saiu muda e escolher musica licenciada nao e decisao
minha: isto e uma cama sonora simples, gerada aqui, sem direito de terceiro
envolvido, para o anuncio nao rodar em silencio absoluto. Trocar por trilha
licenciada depois e so substituir o arquivo na montagem.

Desenho: 100 BPM, quatro acordes de duas barras (Am7, Fmaj7, Cmaj7, G), pad
com ataque lento, baixo na fundamental, e um pulso curto no tempo 1 e 3. Tudo
baixo de proposito: e cama, nao musica de primeiro plano.
"""
import sys
import wave
import numpy as np

SR = 44100
BPM = 100
BATIDA = 60.0 / BPM


def nota(freq, dur, harmonicos=(1.0, 0.42, 0.18, 0.08)):
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    onda = np.zeros_like(t)
    for i, amp in enumerate(harmonicos, start=1):
        onda += amp * np.sin(2 * np.pi * freq * i * t + i * 0.7)
    # Ataque lento e cauda longa: o que faz soar pad e nao apito.
    ataque = np.clip(t / 0.6, 0, 1)
    queda = np.clip((dur - t) / 1.2, 0, 1) ** 1.5
    return onda * ataque * queda / sum(harmonicos)


def acorde(freqs, dur):
    som = np.zeros(int(SR * dur))
    for f in freqs:
        som += nota(f, dur)
    return som / max(len(freqs), 1)


def pulso(dur=0.5, freq=62):
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    env = np.exp(-t * 14)
    varredura = freq * (1 + 2.2 * np.exp(-t * 28))
    return np.sin(2 * np.pi * np.cumsum(varredura) / SR) * env


def chiado(dur=0.09):
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    ruido = np.random.default_rng(7).normal(0, 1, n)
    # Diferenca do ruido: filtro passa-alta pobre, e o suficiente para um chic.
    return np.diff(np.concatenate([[0.0], ruido])) * np.exp(-t * 40)


def gerar(segundos, saida):
    total = int(SR * segundos)
    mix = np.zeros(total + SR)
    barra = BATIDA * 4
    # Am7, Fmaj7, Cmaj7, G, na oitava media, com a fundamental uma oitava abaixo.
    prog = [
        (110.00, [220.00, 261.63, 329.63, 392.00]),
        (87.31, [174.61, 220.00, 261.63, 329.63]),
        (130.81, [196.00, 261.63, 329.63, 392.00]),
        (98.00, [196.00, 246.94, 293.66, 392.00]),
    ]
    i = 0
    pos = 0.0
    while pos < segundos:
        baixo, notas = prog[i % len(prog)]
        dur = barra * 2
        bloco = acorde(notas, dur) * 0.55 + nota(baixo, dur, (1.0, 0.25)) * 0.45
        p = int(pos * SR)
        n = min(len(bloco), len(mix) - p)
        mix[p:p + n] += bloco[:n] * 0.30
        # Pulso no primeiro e no terceiro tempo de cada barra.
        for b in range(0, 8, 2):
            q = int((pos + b * BATIDA) * SR)
            pl = pulso()
            m = min(len(pl), len(mix) - q)
            if m > 0:
                mix[q:q + m] += pl[:m] * 0.16
        for b in range(0, 16):
            q = int((pos + b * BATIDA / 2) * SR)
            ch = chiado()
            m = min(len(ch), len(mix) - q)
            if m > 0:
                mix[q:q + m] += ch[:m] * 0.05
        pos += dur
        i += 1
    mix = mix[:total]
    # Entrada e saida suaves: corte seco em pad soa como defeito de arquivo.
    ent = int(SR * 1.2)
    sai = int(SR * 2.5)
    mix[:ent] *= np.linspace(0, 1, ent)
    mix[-sai:] *= np.linspace(1, 0, sai)
    pico = np.max(np.abs(mix)) or 1.0
    mix = mix / pico * 0.5  # cama discreta, com folga de pico
    dados = (mix * 32767).astype("<i2")
    with wave.open(saida, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(dados.tobytes())
    return saida


if __name__ == "__main__":
    seg = float(sys.argv[1]) if len(sys.argv) > 1 else 60.0
    print(gerar(seg, sys.argv[2] if len(sys.argv) > 2 else "trilha.wav"))
