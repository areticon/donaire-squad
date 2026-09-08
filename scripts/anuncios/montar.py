# -*- coding: utf-8 -*-
"""
Monta os anuncios da Demandou a partir da gravacao de tela de 04/09.

Duas saidas por plano: 16:9 para Google e YouTube, 4:5 para Meta. O 16:9 usa a
tela cheia com cartao de texto entre as etapas; o 4:5 nunca deixa a interface
sozinha, porque no celular ela fica pequena demais para ler (visto em 04/09):
la o texto da etapa fica GRANDE em cima e a gravacao entra como faixa, com a
marca embaixo. Mesmo corte, mesma duracao, leitura diferente.
"""
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageDraw

import cartoes as C

FONTE = "C:/Users/devan/Videos/2026-09-04 10-01-26.mp4"
RECORTE = "crop=2560:1336:0:54"  # tira a barra de titulo e a madeira da mesa
CODEC = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
         "-r", "30", "-video_track_timescale", "30000", "-an"]

# Cada item: cartao (texto que aparece sozinho) ou trecho da gravacao. O campo
# "etapa" do trecho e o que fica escrito em cima no 4:5.
PLANO60 = [
    {"tipo": "cartao", "dur": 2.4, "titulo": "Você grava uma vez por semana.", "sub": "O resto acontece sem você."},
    {"tipo": "video", "a": 238.0, "b": 251.5, "dur": 5.5, "etapa": "Manda a gravação e vai fazer outra coisa"},
    {"tipo": "cartao", "dur": 2.2, "titulo": "Sete agentes assumem a semana.", "sub": "Cada um com uma função."},
    {"tipo": "video", "a": 296.0, "b": 336.0, "dur": 6.0, "etapa": "Ouvindo, pesquisando, escolhendo, cortando"},
    {"tipo": "video", "a": 483.0, "b": 489.0, "dur": 4.5, "etapa": "Roberto pesquisa antes de qualquer um escrever"},
    {"tipo": "video", "a": 496.0, "b": 508.0, "dur": 5.0, "etapa": "A semana inteira montada, dia por dia"},
    {"tipo": "cartao", "dur": 2.2, "titulo": "Corte legendado, capa e texto por rede.", "sub": "Prontos no dia certo."},
    {"tipo": "video", "a": 513.0, "b": 520.0, "dur": 5.0, "etapa": "Cortes legendados, com capa"},
    {"tipo": "cartao", "dur": 2.2, "titulo": "Você aprova. Ele publica.", "sub": "YouTube, Instagram, LinkedIn e X."},
    {"tipo": "video", "a": 585.0, "b": 596.0, "dur": 5.0, "etapa": "Publicar agora ou deixar agendado"},
    {"tipo": "video", "a": 597.0, "b": 601.5, "dur": 3.5, "etapa": "Publicado"},
    {"tipo": "video", "a": 726.0, "b": 736.0, "dur": 4.5, "etapa": "No ar no YouTube"},
    {"tipo": "video", "a": 770.0, "b": 780.0, "dur": 4.5, "etapa": "No ar no Instagram"},
    {"tipo": "final", "dur": 4.7},
]

# A versao longa: a mesma jornada com as etapas de configuracao que o corte de
# 60 s nao cabe. Os logins ficam de fora de proposito, porque a gravacao mostra
# o e-mail do Bruno na tela dos provedores.
PLANO_LONGO = [
    {"tipo": "cartao", "dur": 2.6, "titulo": "Você grava uma vez por semana.", "sub": "O resto acontece sem você."},
    {"tipo": "cartao", "dur": 2.3, "titulo": "Conte quem você é.", "sub": "Uma vez só, no começo."},
    {"tipo": "video", "a": 88.0, "b": 146.0, "dur": 9.5, "etapa": "Seu nicho, seu público, sua voz"},
    {"tipo": "cartao", "dur": 2.3, "titulo": "Escolha o estilo da sua semana.", "sub": "Você decide o que sai em cada dia."},
    {"tipo": "video", "a": 170.0, "b": 215.0, "dur": 7.5, "etapa": "O estilo do canal, do seu jeito"},
    {"tipo": "video", "a": 215.0, "b": 244.0, "dur": 7.2, "etapa": "Texto, imagem, carrossel, thread ou enquete"},
    {"tipo": "cartao", "dur": 2.3, "titulo": "Manda a gravação e vai fazer outra coisa.", "sub": "Um arquivo, e nada além disso."},
    {"tipo": "video", "a": 244.0, "b": 258.0, "dur": 6.0, "etapa": "Uma gravação por semana"},
    {"tipo": "cartao", "dur": 2.3, "titulo": "Sete agentes assumem a semana.", "sub": "Cada um com uma função."},
    {"tipo": "video", "a": 296.0, "b": 390.0, "dur": 10.0, "etapa": "Ouvindo, pesquisando, escolhendo, cortando"},
    {"tipo": "cartao", "dur": 2.3, "titulo": "Ninguém escreve antes da pesquisa.", "sub": "Teses, fontes e dados, com a data."},
    {"tipo": "video", "a": 483.0, "b": 489.0, "dur": 5.0, "etapa": "Roberto pesquisa e entrega o briefing"},
    {"tipo": "cartao", "dur": 2.3, "titulo": "A semana inteira escrita e revisada.", "sub": "Um card por dia, um post por rede."},
    {"tipo": "video", "a": 496.0, "b": 508.0, "dur": 6.0, "etapa": "Lucas, Tiago e Diana escrevem. Vera revisa."},
    {"tipo": "cartao", "dur": 2.3, "titulo": "Corte legendado, com capa pronta.", "sub": "Do vídeo que você já gravou."},
    {"tipo": "video", "a": 512.0, "b": 522.0, "dur": 7.0, "etapa": "Vitor corta, legenda e faz a capa"},
    {"tipo": "cartao", "dur": 2.3, "titulo": "Você aprova. Ele publica.", "sub": "Agora ou no horário que você marcou."},
    {"tipo": "video", "a": 585.0, "b": 596.0, "dur": 7.0, "etapa": "Publicar agora ou deixar agendado"},
    {"tipo": "video", "a": 597.0, "b": 601.5, "dur": 3.5, "etapa": "Publicado"},
    {"tipo": "cartao", "dur": 2.3, "titulo": "No ar, sem você tocar em nada.", "sub": "YouTube, Instagram, LinkedIn e X."},
    {"tipo": "video", "a": 724.0, "b": 738.0, "dur": 6.0, "etapa": "No ar no YouTube"},
    {"tipo": "video", "a": 768.0, "b": 780.0, "dur": 6.0, "etapa": "No ar no Instagram"},
    {"tipo": "final", "dur": 5.0},
]


FORMATOS = {
    "16x9": {"w": 1920, "h": 1080},
    "4x5": {"w": 1080, "h": 1350},
}


def moldura_45(etapa, saida):
    """O quadro do 4:5: titulo da etapa em cima, buraco da faixa no meio, marca embaixo."""
    w, h = 1080, 1350
    im = C.fundo(w, h)
    d = ImageDraw.Draw(im)
    margem = 72
    ft = C.fonte(C.MONT, 60, "ExtraBold")
    linhas = C.quebrar(etapa, ft, w - 2 * margem, d)[:3]
    y = 300 - len(linhas) * 74
    d.rectangle([margem, y - 46, margem + 84, y - 40], fill=C.LARANJA)
    for ln in linhas:
        d.text((margem, y), ln, font=ft, fill=C.TEXTO)
        y += 74
    # A faixa da gravacao entra por cima, em 1080x564, a partir de y=560.
    d.rectangle([0, 552, w, 1132], fill=(0x14, 0x14, 0x19))
    C.assinatura(im, d, margem, h - margem - 62, 62)
    fend = C.fonte(C.MONT, 34, "Bold")
    end = "demandou.com"
    d.text((w - margem - d.textlength(end, font=fend), h - margem - 46), end, font=fend, fill=C.LARANJA)
    im.save(saida)
    return saida


def render(idx, item, formato, pasta):
    f = FORMATOS[formato]
    saida = f"{pasta}/{formato}-{idx:02d}.mp4"
    dur = item["dur"]
    if item["tipo"] in ("cartao", "final"):
        png = f"{pasta}/{formato}-{idx:02d}.png"
        if item["tipo"] == "final":
            C.cartao_final(f["w"], f["h"], png)
        else:
            C.cartao(f["w"], f["h"], item["titulo"], item.get("sub"), png)
        cmd = ["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", png, "-t", f"{dur}", *CODEC, saida]
    else:
        vel = (item["b"] - item["a"]) / dur
        if formato == "16x9":
            vf = f"{RECORTE},setpts=PTS/{vel:.4f},fps=30,scale=1920:-2:flags=lanczos,pad=1920:1080:0:39:color=#1e1e25"
            cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{item['a']}", "-i", FONTE,
                   "-t", f"{item['b'] - item['a']:.3f}", "-vf", vf, "-t", f"{dur}", *CODEC, saida]
        else:
            png = moldura_45(item["etapa"], f"{pasta}/{formato}-{idx:02d}.png")
            fc = (f"[0:v]{RECORTE},setpts=PTS/{vel:.4f},fps=30,scale=1080:-2:flags=lanczos[v];"
                  f"[1:v][v]overlay=0:560:shortest=0[o]")
            cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{item['a']}", "-i", FONTE,
                   "-loop", "1", "-i", png, "-filter_complex", fc, "-map", "[o]",
                   "-t", f"{dur}", *CODEC, saida]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(idx, formato, "FALHOU", r.stderr[-400:])
    return saida


def montar(plano, formato, pasta, saida, trilha):
    os.makedirs(pasta, exist_ok=True)
    with ThreadPoolExecutor(4) as ex:
        partes = list(ex.map(lambda p: render(p[0], p[1], formato, pasta), list(enumerate(plano))))
    lista = f"{pasta}/lista-{formato}.txt"
    with open(lista, "w") as fh:
        for p in partes:
            fh.write(f"file '{os.path.basename(p)}'\n")
    mudo = f"{pasta}/mudo-{formato}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lista,
                    "-c", "copy", mudo], check=True)
    # `loudnorm` a -16 LUFS: sem isto a trilha sai a -21,7 LUFS (medido em
    # 08/09), oito decibeis abaixo do que as redes usam para nivelar o feed, e
    # o anuncio tocaria mudo perto do que vem antes dele na rolagem. Nao vai a
    # -14 de proposito: aqui nao ha fala, e musica no nivel de fala incomoda.
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mudo, "-i", trilha,
                    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", saida], check=True)
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", saida], capture_output=True, text=True).stdout.strip()
    print(f"{saida}: {float(dur):.1f}s")
    return saida


if __name__ == "__main__":
    destino = sys.argv[1] if len(sys.argv) > 1 else "C:/Users/devan/Videos/demandou-anuncios"
    os.makedirs(destino, exist_ok=True)
    alvo = sys.argv[2] if len(sys.argv) > 2 else "tudo"
    if alvo in ("tudo", "60"):
        subprocess.run([sys.executable, "trilha.py", "62", "trilha60.wav"], check=True)
        montar(PLANO60, "16x9", "seg60", f"{destino}/demandou-60s-google-16x9.mp4", "trilha60.wav")
        montar(PLANO60, "4x5", "seg60", f"{destino}/demandou-60s-meta-4x5.mp4", "trilha60.wav")
    if alvo in ("tudo", "longo"):
        total = sum(i["dur"] for i in PLANO_LONGO) + 2
        subprocess.run([sys.executable, "trilha.py", f"{total}", "trilhaLonga.wav"], check=True)
        montar(PLANO_LONGO, "16x9", "segL", f"{destino}/demandou-completo-google-16x9.mp4", "trilhaLonga.wav")
        montar(PLANO_LONGO, "4x5", "segL", f"{destino}/demandou-completo-meta-4x5.mp4", "trilhaLonga.wav")
