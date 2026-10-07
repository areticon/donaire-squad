# Versão vertical 9:16 do pitch v3 (01/10), para Reels, Shorts, TikTok e status.
#
# Não remonta as cenas: o vídeo horizontal sem legenda (tmp/video.mp4) entra
# inteiro no meio do quadro vertical, na largura toda (1080x608), e o que muda é
# a moldura em volta: a marca no alto, a legenda GRANDE logo abaixo do vídeo
# (no celular a legenda queimada do horizontal ficaria pequena demais) e o
# endereço embaixo. O som é o mesmo do horizontal, copiado sem recodificar.
# Uso: python vertical.py  (depois de montar_pitch3.py)
import json, os, re, subprocess

AQUI = os.path.dirname(os.path.abspath(__file__))
os.chdir(AQUI)
P = os.path.dirname(AQUI)
PUB = "C:/Users/devan/opensquad-app/public"
F = P.replace("\\", "/") + "/fontes"
HORIZONTAL = "demandou-pitch-v3.mp4"


def ff(args):
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", *args], capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-3000:])
        raise SystemExit(1)


# 1. A moldura (fundo, marca, endereço) desenhada em HTML, 1080x1920, opaca.
marca = open(f"{PUB}/brand-mark-branco.svg", encoding="utf-8").read()
marca = re.sub(r"<!--.*?-->", "", marca, flags=re.S).strip().replace("<svg ", '<svg width="132" height="132" ', 1)
html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: Geist; font-weight: 400; src: url('file:///{F}/Geist-400.ttf'); }}
@font-face {{ font-family: Geist; font-weight: 600; src: url('file:///{F}/Geist-600.ttf'); }}
@font-face {{ font-family: GeistMono; font-weight: 500; src: url('file:///{F}/GeistMono-500.ttf'); }}
@font-face {{ font-family: Mont; font-weight: 700; src: url('file:///{F}/Montserrat-Bold.ttf'); }}
* {{ box-sizing: border-box; margin: 0; }}
html, body {{ width: 1080px; height: 1920px; overflow: hidden; background: #06111f; color: #e8eef6; font-family: Geist, sans-serif; position: relative; }}
.abs {{ position: absolute; }}
.selo {{ display: inline-flex; align-items: center; gap: 12px; font-family: GeistMono; font-weight: 500; font-size: 24px; letter-spacing: .16em;
  text-transform: uppercase; color: #dfe6ef; padding: 12px 24px; border-radius: 999px;
  background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.02)); border: 1px solid rgba(255,255,255,.14); }}
.selo i {{ width: 11px; height: 11px; border-radius: 50%; background: #ef6122; display: inline-block; }}
</style></head><body>
<div class="abs" style="inset:0;background-image:linear-gradient(to right, rgba(31,53,83,.45) 1px, transparent 1px),linear-gradient(to bottom, rgba(31,53,83,.45) 1px, transparent 1px);background-size:48px 48px"></div>
<div class="abs" style="inset:0;background:radial-gradient(ellipse at 30% 0%, rgba(21,50,90,.8), rgba(6,17,31,0) 55%)"></div>
<div class="abs" style="right:-260px;top:-200px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle, rgba(241,116,46,.22), rgba(241,116,46,0) 65%)"></div>
<div class="abs" style="left:0;right:0;top:250px;display:flex;justify-content:center;align-items:center;gap:4px;margin-left:-24px">{marca}
  <span style="font-family:Mont;font-weight:700;font-size:80px;color:#fff;letter-spacing:-0.01em">demandou.</span></div>
<div class="abs" style="left:0;right:0;top:430px;text-align:center"><span class="selo"><i></i>Conteúdo de autoridade para empresas</span></div>
<div class="abs" style="left:0;right:0;top:1700px;text-align:center;font-size:40px;font-weight:600;color:#ffffff">demandou.com</div>
</body></html>"""
open("tmp/vertical.html", "w", encoding="utf-8").write(html)
js = """
import { chromium } from "file:///C:/Users/devan/opensquad-app/node_modules/playwright/index.mjs";
const nav = await chromium.launch();
const pg = await nav.newPage({ viewport: { width: 1080, height: 1920 } });
await pg.goto("file:///" + process.argv[2]);
await pg.evaluate(() => document.fonts.ready);
await pg.screenshot({ path: process.argv[3] });
await nav.close();
"""
open("tmp/vertical.mjs", "w", encoding="utf-8").write(js)
subprocess.run(["node", "tmp/vertical.mjs", os.path.abspath("tmp/vertical.html").replace("\\", "/"), "tmp/vertical-moldura.png"], check=True)

# 2. A legenda do horizontal, redesenhada para o vertical: mesma fala e mesmos
# tempos, letra maior, logo abaixo do vídeo.
ass = open("tmp/legenda.ass", encoding="utf-8").read()
eventos = [l for l in ass.splitlines() if l.startswith("Dialogue:")]
cab = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Leg,Geist SemiBold,66,&H00FFFFFF,&H00FFFFFF,&H281F1106,&H00000000,0,0,0,0,100,100,0,0,3,16,0,8,70,70,1330,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
open("tmp/legenda-vertical.ass", "w", encoding="utf-8").write(cab + "\n".join(eventos) + "\n")

# 3. Composição: moldura + vídeo no meio + legenda + som do horizontal.
ff(["-loop", "1", "-framerate", "30", "-i", "tmp/vertical-moldura.png", "-i", "tmp/video.mp4", "-i", HORIZONTAL,
    "-filter_complex",
    "[1:v]scale=1080:608:flags=lanczos,setsar=1[v];[0:v][v]overlay=0:620:shortest=1,"
    "ass=tmp/legenda-vertical.ass:fontsdir=../fontes,format=yuv420p[o]",
    "-map", "[o]", "-map", "2:a", "-c:v", "libx264", "-crf", "19", "-preset", "slow", "-c:a", "copy",
    "-movflags", "+faststart", "-shortest", "demandou-pitch-v3-vertical.mp4"])
print("vertical pronto")
