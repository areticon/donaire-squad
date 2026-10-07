# O vídeo curto do gêmeo para o cartão da landing (01/10): o OmniHuman da fala
# de apresentação, recortado em 4:3, com a legenda queimada (tempos da
# ElevenLabs) e o áudio junto, para quem clicar ouvir.
import json, os, subprocess

AQUI = os.path.dirname(os.path.abspath(__file__))
os.chdir(AQUI)
G = "C:/Users/devan/Documents/Demandou/gemeo-teste"
VID = f"{G}/videos/gemeo-omnihuman-apresentacao.mp4"
AL = json.load(open(f"{G}/fala/apresentacao.json", encoding="utf-8"))
OUT = "C:/Users/devan/opensquad-app/public/pitch"

pal, atual, a0, ult = [], "", None, 0
for c, s, e in zip(AL["characters"], AL["character_start_times_seconds"], AL["character_end_times_seconds"]):
    if c.isspace():
        if atual:
            pal.append((atual, a0, ult))
        atual, a0 = "", None
    else:
        a0 = s if a0 is None else a0
        atual += c
        ult = e
if atual:
    pal.append((atual, a0, ult))


def ts(s):
    m, s = divmod(max(0, s), 60)
    return f"0:{int(m):02d}:{s:05.2f}"


linhas, g = [], []
for j, (p, s, e) in enumerate(pal):
    g.append((p, s, e))
    txt = " ".join(x[0] for x in g)
    if len(txt) >= 22 or (p[-1] in ".,:?!" and len(g) >= 2) or j == len(pal) - 1:
        prox = pal[j + 1][1] if j + 1 < len(pal) else g[-1][2] + 0.5
        linhas.append(f"Dialogue: 0,{ts(g[0][1])},{ts(min(prox, g[-1][2] + 0.4))},Leg,,0,0,0,,{txt.rstrip(',.:')}")
        g = []
ass = """[Script Info]
ScriptType: v4.00+
PlayResX: 960
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Leg,Geist SemiBold,40,&H00FFFFFF,&H00FFFFFF,&H281F1106,&H00000000,0,0,0,0,100,100,0,0,3,12,0,2,40,40,34,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" + "\n".join(linhas) + "\n"
open("tmp-gemeo.ass", "w", encoding="utf-8").write(ass)
vf = "crop=1440:1080:0:40,scale=960:720,ass=tmp-gemeo.ass:fontsdir=fontes"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", VID, "-vf", vf, "-c:v", "libx264", "-crf", "25", "-preset", "slow", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", f"{OUT}/gemeo-apresentacao.mp4"], check=True)
# Capa com os olhos abertos (11,5 s), sem legenda.
subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "11.5", "-i", VID, "-frames:v", "1", "-vf", "crop=1440:1080:0:40,scale=960:720", "-q:v", "3",
                f"{OUT}/gemeo-apresentacao.jpg"], check=True)
print("ok", len(linhas), "linhas de legenda")
