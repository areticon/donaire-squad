# Prepara o GÊMEO NOVO (01/10) para a landing e para o pitch v3, sem gasto:
# 1. transcreve a fala com o Whisper local (palavra a palavra, em CPU);
# 2. grava gemeo-fala.json (palavras com início e fim), que o montar_pitch3.py
#    usa para o corte e para a legenda do trecho do gêmeo;
# 3. gera o vídeo curto do cartão da landing (4:3, legenda queimada, som junto
#    para o "Ouvir a voz") e a capa.
# Uso: python gemeo_novo.py <caminho do mp4> [nome-de-saida]   (saída padrão: gemeo-0110)
import json, os, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
os.chdir(AQUI)
P = os.path.dirname(AQUI)
OUT = "C:/Users/devan/opensquad-app/public/pitch"
VID = sys.argv[1]
NOME = sys.argv[2] if len(sys.argv) > 2 else "gemeo-0110"
TESTE = os.environ.get("TESTE")  # só transcreve e monta em tmp/, sem tocar no public/
os.makedirs("tmp/whisper", exist_ok=True)


def sonda(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                        "-of", "json", f], capture_output=True, text=True, check=True)
    j = json.loads(r.stdout)
    return j["streams"][0]["width"], j["streams"][0]["height"], float(j["format"]["duration"])


W, H, D = sonda(VID)
print("gêmeo", W, "x", H, round(D, 2), "s")

# 1. Whisper local, com tempo por palavra. Com FALA_PRONTA=1 usa o
# gemeo-fala.json que já está na pasta (v4: tempos medidos no vídeo longo de
# onde o trecho foi cortado, porque o Whisper no trecho curto perde a primeira
# palavra quando a fala começa no quadro zero).
FALA_PRONTA = os.environ.get("FALA_PRONTA")
ff_wav = "tmp/whisper/gemeo.wav"
if FALA_PRONTA:
    pal = [tuple(x) for x in json.load(open("gemeo-fala.json", encoding="utf-8"))]
else:
  subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", VID, "-vn", "-ac", "1", "-ar", "16000", ff_wav], check=True)
  subprocess.run(["whisper", ff_wav, "--model", os.environ.get("MODELO", "small"), "--language", "pt", "--word_timestamps", "True",
                "--output_format", "json", "--output_dir", "tmp/whisper", "--fp16", "False"], check=True, capture_output=True)
  tr = json.load(open("tmp/whisper/gemeo.json", encoding="utf-8"))
  pal = [(w["word"].strip(), float(w["start"]), float(w["end"])) for s in tr["segments"] for w in s.get("words", []) if w["word"].strip()]
# O texto que o gêmeo fala é conhecido (o roteiro mandado à ElevenLabs). O
# Whisper acerta os tempos, mas erra palavra ("gênero" no lugar de "gêmeo") e
# pontuação; com o mesmo número de palavras, fica o tempo do Whisper e a
# grafia do roteiro.
TEXTO = os.environ.get("TEXTO")
if TEXTO:
    certas = TEXTO.split()
    if len(certas) != len(pal):
        raise SystemExit(f"o roteiro tem {len(certas)} palavras e o Whisper ouviu {len(pal)}: confira antes de trocar")
    pal = [(c, s, e) for c, (_, s, e) in zip(certas, pal)]
json.dump(pal, open("gemeo-fala.json", "w", encoding="utf-8"), ensure_ascii=False)
print("fala:", " ".join(p[0] for p in pal))


def ts(s):
    m, s = divmod(max(0, s), 60)
    return f"0:{int(m):02d}:{s:05.2f}"


# 2. Legenda em grupos curtos (até ~22 letras ou fim de frase), como a do gêmeo antigo.
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
open("tmp/gemeo-card.ass", "w", encoding="utf-8").write(ass)

# 3. Recorte 4:3 do cartão. Vídeo largo: corta as laterais. Vídeo em pé: corta
# embaixo e preserva o alto do quadro (o rosto fica no terço de cima).
if W / H >= 4 / 3:
    cw, ch = int(H * 4 / 3) // 2 * 2, H
    crop = f"crop={cw}:{ch}:{(W - cw) // 2}:0"
else:
    cw, ch = W, int(W * 3 / 4) // 2 * 2
    topo = min(int(H * 0.08), H - ch)
    crop = f"crop={cw}:{ch}:0:{topo}"
dest = "tmp" if TESTE else OUT
vf = f"{crop},scale=960:720,ass=tmp/gemeo-card.ass:fontsdir=../fontes"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", VID, "-vf", vf, "-c:v", "libx264", "-crf", "25", "-preset", "slow", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", f"{dest}/{NOME}.mp4"], check=True)
capa_t = float(os.environ.get("CAPA_T", min(D * 0.55, D - 0.3)))
subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{capa_t:.2f}", "-i", VID, "-frames:v", "1", "-vf", f"{crop},scale=960:720", "-q:v", "3",
                f"{dest}/{NOME}.jpg"], check=True)
print("ok", len(linhas), "linhas de legenda ->", dest, NOME, "| recorte", crop)
