# Montagem do vídeo de pitch da landing (01/10). ffmpeg puro, 1920x1080 a 30 fps.
# Dor, custo, solução, os três casos (vídeo, gêmeo, do zero), economia e chamada.
# Narração ElevenLabs (voz pronta da biblioteca), cenas Higgsfield sem rosto real
# e sem texto, telas reais do dev local, cortes reais do Bruno e o logo oficial.
# Os títulos aparecem no instante em que a palavra é dita (tempos da ElevenLabs),
# e a legenda queimada sai dos mesmos tempos.
import json, os, re, subprocess, sys, unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
os.chdir(AQUI)
os.makedirs("tmp", exist_ok=True)
TEMPO = 1.06
PAD = 0.3
LARANJA = "0xF97316"
FUNDO = "0x1e1e25"
PRETO_T = "fontes/Montserrat-Black.ttf"
BOLD_T = "fontes/Montserrat-Bold.ttf"
INTER_T = "fontes/Inter-SemiBold.ttf"
VV = "C:/Users/devan/Documents/Demandou/video-venda"
MARCA = "C:/Users/devan/opensquad-app/public/brand-mark-on-dark.png"
V = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=yuv420p,setsar=1"
ENC = ["-c:v", "libx264", "-crf", "17", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-an"]


def dur(f):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f],
                                capture_output=True, text=True).stdout.strip())


def ff(args):
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", *args], capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-2500:])
        raise SystemExit(1)


# ── narração e tempos ──
def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if not unicodedata.combining(c)))


PALAVRAS = []  # por bloco: lista de (palavra, ini, fim) já no tempo acelerado
DURS = []
for i in range(8):
    ff(["-i", f"voz-{i}.mp3", "-af", f"atempo={TEMPO}", "-ar", "44100", f"tmp/n{i}.wav"])
    al = json.load(open(f"voz-{i}.json", encoding="utf-8"))
    ch, ini, fim = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    pal, atual, a0 = [], "", None
    for c, s, e in zip(ch, ini, fim):
        if c.isspace():
            if atual:
                pal.append((atual, a0 / TEMPO, ultimo / TEMPO))
            atual, a0 = "", None
        else:
            if a0 is None:
                a0 = s
            atual += c
            ultimo = e
    if atual:
        pal.append((atual, a0 / TEMPO, ultimo / TEMPO))
    PALAVRAS.append(pal)
    DURS.append(dur(f"tmp/n{i}.wav") + PAD)
print("blocos", [round(d, 2) for d in DURS], "total", round(sum(DURS), 1))


def quando(b, palavra, n=0):
    alvo = norm(palavra)
    achados = [p for p in PALAVRAS[b] if norm(p[0]) == alvo]
    if len(achados) <= n:
        raise SystemExit(f"palavra '{palavra}' não está no bloco {b}")
    return achados[n][1]


# ── texto na tela ──
_n = [0]


def arq(t):
    _n[0] += 1
    p = f"tmp/t{_n[0]}.txt"
    open(p, "w", encoding="utf-8").write(t)
    return p


def txt(t, x, y, tam, ini, fim, caixa=True, cor="white", fonte=PRETO_T, borda=18, fundo_cor=LARANJA):
    alfa = f"if(lt(t,{ini}+0.18),(t-{ini})/0.18,if(gt(t,{fim}-0.2),({fim}-t)/0.2,1))"
    box = f":box=1:boxcolor={fundo_cor}@0.96:boxborderw={borda}" if caixa else ":shadowcolor=black@0.55:shadowx=3:shadowy=3"
    return (f"drawtext=fontfile={fonte}:expansion=none:textfile={arq(t)}:x={x}:y={y}:fontsize={tam}:fontcolor={cor}{box}"
            f":alpha='{alfa}':enable='between(t,{ini:.3f},{fim:.3f})'")


def video(entrada, saida, d, vf, ss=0.0, vel=None):
    """Um trecho de vídeo com duração exata d; vel estica (câmera lenta) se o clipe for curto."""
    pre = f"setpts={vel:.4f}*PTS," if vel else ""
    ff(["-ss", f"{ss}", "-i", entrada, "-t", f"{d:.3f}", "-vf", pre + vf, *ENC, "-t", f"{d:.3f}", saida])


def imagem(entrada, saida, d, crop=None, zoom=0.0007, extra=""):
    """Imagem parada com avanço lento, para não parecer slide."""
    c = f"crop={crop}," if crop else ""
    q = int(d * 30) + 2
    vf = (f"{c}scale=2112:1188:force_original_aspect_ratio=increase,crop=2112:1188,"
          f"zoompan=z='min(1+{zoom}*on,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={q}:s=1920x1080:fps=30,format=yuv420p,setsar=1")
    if extra:
        vf += "," + extra
    ff(["-loop", "1", "-i", entrada, "-t", f"{d:.3f}", "-vf", vf, *ENC, saida])


def emendar(partes, saida):
    ins = sum([["-i", p] for p in partes], [])
    ff([*ins, "-filter_complex", "".join(f"[{i}:v]" for i in range(len(partes))) + f"concat=n={len(partes)}:v=1:a=0[v]",
        "-map", "[v]", *ENC, saida])


GRADE = (f"drawgrid=w=48:h=48:t=1:c=0x31313c@0.55")


def fundo_marca(d, saida, extra=""):
    vf = f"{GRADE}" + ("," + extra if extra else "")
    ff(["-f", "lavfi", "-i", f"color=c={FUNDO}:s=1920x1080:r=30", "-t", f"{d:.3f}", "-vf", vf, *ENC, saida])


def numero(n, titulo, ini, fim, y=70):
    """O selo do caso: número na caixa laranja e o nome do caminho ao lado."""
    return ",".join([
        txt(str(n), 80, y, 92, ini, fim, borda=22),
        txt(titulo, 200, y + 6, 74, ini + 0.12, fim, caixa=True, fundo_cor="0x1e1e25", borda=18),
    ])


# ════════════════ BLOCO 0: A DOR ════════════════
d = DURS[0]
corte = 5.0
f = ",".join([V, "eq=brightness=-0.05:saturation=0.9", "vignette=PI/5",
              txt("GRAVAR.", 90, 150, 104, quando(0, "Gravar,"), corte),
              txt("EDITAR.", 90, 290, 104, quando(0, "editar,"), corte),
              txt("ESCREVER.", 90, 430, 104, quando(0, "escrever,"), corte),
              txt("DESENHAR.", 90, 570, 104, quando(0, "desenhar"), corte),
              txt("PUBLICAR EM 4 REDES.", 90, 710, 104, quando(0, "publicar"), corte)])
video("cena-dor-mesa.mp4", "tmp/b0a.mp4", corte, f)
r = d - corte
t_some = quando(0, "some.") - corte
f = ",".join([V, "eq=brightness=-0.08:saturation=0.85", "vignette=PI/4",
              txt("O PERFIL SOME.", 90, 140, 120, max(0.2, t_some - 0.1), r),
              txt("E QUEM SOME NÃO É LEMBRADO.", 96, 300, 64, quando(0, "lembrado.") - corte - 0.6, r, caixa=False)])
video(f"{VV}/cena-dor.mp4", "tmp/b0b.mp4", r, f, vel=r / 5.04)
emendar(["tmp/b0a.mp4", "tmp/b0b.mp4"], "tmp/s0.mp4")

# ════════════════ BLOCO 1: O CUSTO ════════════════
d = DURS[1]
f = ",".join([V, "eq=brightness=-0.04", "vignette=PI/5",
              txt("TIME PRÓPRIO", 90, 140, 84, quando(1, "time,"), d),
              txt("AGÊNCIA", 90, 270, 84, quando(1, "agência"), d),
              txt("FREELANCER POR PEÇA", 90, 400, 84, quando(1, "freelancer"), d),
              txt("+ DE R$ 20 MIL POR MÊS", 90, 610, 112, quando(1, "vinte"), d, fundo_cor="0xffffff", cor="0x1e1e25")])
video("cena-custo.mp4", "tmp/s1.mp4", d, f, vel=d / 5.04)

# ════════════════ BLOCO 2: A SOLUÇÃO ════════════════
d = DURS[2]
a = 1.7
# A marca: o símbolo oficial (public/brand-mark-on-dark.png) e o nome em
# Montserrat, que é exatamente como a navbar do site monta o logotipo.
ff(["-f", "lavfi", "-i", f"color=c={FUNDO}:s=1920x1080:r=30", "-loop", "1", "-i", MARCA, "-t", f"{a:.3f}",
    "-filter_complex",
    f"[0:v]{GRADE}[g];[1:v]scale=230:230[m];[g][m]overlay=560:360,"
    + txt("demandou.", 820, 405, 130, 0.0, a + 1, caixa=False, fonte=BOLD_T) + ","
    + txt("postou.", 828, 560, 54, 0.15, a + 1, caixa=False, fonte=INTER_T, cor="0x9599a6") + ",format=yuv420p[v]",
    "-map", "[v]", *ENC, "tmp/b2a.mp4"])
b = 2.9
t_squad = quando(2, "squad") - a
video(f"deck/agentes-2809.mp4", "tmp/b2b.mp4", b, ",".join([V, txt("UM SQUAD DE AGENTES DE IA", 80, 70, 76, max(0, t_squad), b)]), ss=6)
c = d - a - b
imagem("telas/criar.png", "tmp/b2c.mp4", c, crop="1140:641:510:200", zoom=0.0005,
       extra=txt("VOCÊ ESCOLHE COMO COMEÇAR", 80, 70, 70, 0.1, c))
emendar(["tmp/b2a.mp4", "tmp/b2b.mp4", "tmp/b2c.mp4"], "tmp/s2.mp4")

# ════════════════ BLOCO 3: CASO 1, A PARTIR DE UM VÍDEO ════════════════
d = DURS[3]
a = 3.0
video("cena-camera.mp4", "tmp/b3a.mp4", a, ",".join([V, numero(1, "A PARTIR DE UM VÍDEO", 0.15, a)]), ss=1.0)
# O vídeo completo (horizontal) ao lado de um corte vertical, os dois reais.
b = 4.6
t_comp = max(0.1, quando(3, "completo,") - a - 0.3)
ff(["-f", "lavfi", "-i", f"color=c={FUNDO}:s=1920x1080:r=30", "-ss", "8", "-i", "completo-trecho.mp4", "-ss", "2", "-i", "corte-jetro.mp4",
    "-t", f"{b:.3f}", "-filter_complex",
    f"[0:v]{GRADE}[g];[1:v]scale=1120:630,setsar=1[h];[2:v]scale=-2:820,setsar=1[vv];"
    f"[g][h]overlay=90:260:shortest=1[x];[x][vv]overlay=1330:170:shortest=1,"
    + txt("VÍDEO COMPLETO EDITADO", 90, 150, 56, t_comp, b) + ","
    + txt("CORTE VERTICAL COM LEGENDA", 1240, 1010 - 0, 40, t_comp + 0.6, b, borda=12) + ",fps=30,format=yuv420p[v]",
    "-map", "[v]", *ENC, "-t", f"{b:.3f}", "tmp/b3b.mp4"])
c = d - a - b
# Dois cortes e duas peças reais lado a lado: a semana que saiu de uma gravação.
ff(["-f", "lavfi", "-i", f"color=c={FUNDO}:s=1920x1080:r=30", "-ss", "3", "-i", "corte-moises.mp4", "-ss", "4", "-i", "corte-doze.mp4",
    "-loop", "1", "-i", "deck/peca-50min.jpg", "-loop", "1", "-i", "deck/peca-ferramenta.jpg", "-t", f"{c:.3f}", "-filter_complex",
    f"[0:v]{GRADE}[g];[1:v]scale=-2:700,setsar=1[a];[2:v]scale=-2:700,setsar=1[b];[3:v]scale=-2:500,setsar=1[p1];[4:v]scale=-2:500,setsar=1[p2];"
    f"[g][a]overlay=106:200:shortest=1[x1];[x1][p1]overlay=540:300[x2];[x2][b]overlay=980:200:shortest=1[x3];[x3][p2]overlay=1414:300,"
    + txt("A SEMANA INTEIRA, EDITADA", 90, 70, 72, 0.1, c) + ",fps=30,format=yuv420p[v]",
    "-map", "[v]", *ENC, "-t", f"{c:.3f}", "tmp/b3c.mp4"])
emendar(["tmp/b3a.mp4", "tmp/b3b.mp4", "tmp/b3c.mp4"], "tmp/s3.mp4")

# ════════════════ BLOCO 4: CASO 2, O GÊMEO DIGITAL ════════════════
d = DURS[4]
a = 5.0
video("cena-gemeo.mp4", "tmp/b4a.mp4", a, ",".join([V, numero(2, "O SEU GÊMEO DIGITAL", 0.15, a)]))
b = d - a
t_teste = max(0.2, quando(4, "testes.") - a - 0.8)
imagem("telas/gemeo.png", "tmp/b4b.mp4", b, crop="960:540:600:210", zoom=0.0006,
       extra=",".join([txt("FOTOS + 1 MINUTO DA SUA VOZ", 80, 70, 64, 0.1, b),
                       txt("EM FASE FINAL DE TESTES", 80, 930, 54, t_teste, b, fundo_cor="0x1e1e25")]))
emendar(["tmp/b4a.mp4", "tmp/b4b.mp4"], "tmp/s4.mp4")

# ════════════════ BLOCO 5: CASO 3, DO ZERO ════════════════
d = DURS[5]
a = 2.8  # só o começo da cena: depois disso o calendário de papel ganha números inventados
video("cena-do-zero.mp4", "tmp/b5a.mp4", a, ",".join([V, numero(3, "DO ZERO, COM IA", 0.15, a)]))
b = 4.8
t_pesq = max(0.1, quando(5, "pesquisa") - a)
imagem("telas/live2.png", "tmp/b5b.mp4", b, crop="1600:900:285:180", zoom=0.0006,
       extra=txt("PESQUISA, TEMAS E A SEMANA PRONTA", 80, 70, 64, t_pesq, b))
c = d - a - b
# As quatro peças reais entram uma a uma (deslizando de baixo).
pecas = ["deck/peca-ferramenta.jpg", "deck/peca-citado.jpg", "deck/peca-calado.jpg", "deck/peca-50min.jpg"]
ins = sum([["-loop", "1", "-i", p] for p in pecas], [])
fc = f"[0:v]{GRADE}[g0];"
for i in range(4):
    fc += f"[{i + 1}:v]scale=400:500,setsar=1[p{i}];"
for i in range(4):
    x0 = 105 + i * 440
    t0 = 0.15 + i * 0.22
    fc += f"[g{i}][p{i}]overlay=x={x0}:y='if(lt(t,{t0}),1080,max(250,1080-(t-{t0})*2600))':eval=frame[g{i + 1}];"
fc += f"[g4]" + txt("TEXTO, ARTE, CARROSSEL E VÍDEO", 105, 90, 66, 0.2, c) + "," \
    + txt("VOCÊ SÓ APROVA.", 105, 830, 96, max(0.5, quando(5, "aprova.") - a - b - 0.3), c) + ",format=yuv420p[v]"
ff(["-f", "lavfi", "-i", f"color=c={FUNDO}:s=1920x1080:r=30", *ins, "-t", f"{c:.3f}", "-filter_complex", fc, "-map", "[v]", *ENC, "tmp/b5c.mp4"])
emendar(["tmp/b5a.mp4", "tmp/b5b.mp4", "tmp/b5c.mp4"], "tmp/s5.mp4")

# ════════════════ BLOCO 6: A ECONOMIA ════════════════
# Números de lib/calculadora/custos.ts, predefinição "Todo dia" (4 redes).
d = DURS[6]
BARRAS = [
    ("Time próprio", 31140, quando(6, "time"), "0x9599a6"),
    ("Agência", 25185, quando(6, "agência,"), "0x9599a6"),
    ("Freelancer por peça", 18400, quando(6, "agência,") + 0.7, "0x9599a6"),
    ("Demandou (Enterprise)", 5667, quando(6, "demandou,"), LARANJA),
]
MAXW = 800
fc = f"[0:v]{GRADE}[g0];"
for i, (_, valor, t0, cor) in enumerate(BARRAS):
    w = max(40, int(MAXW * valor / 31140))
    # A barra cresce dentro de uma trilha do tamanho final (overlay com eval por
    # quadro): drawbox não reavalia a largura a cada quadro.
    fc += (f"color=c={FUNDO}:s={w}x70:r=30,trim=duration={d:.3f}[tr{i}];color=c={cor}:s={w}x70:r=30,trim=duration={d:.3f}[bar{i}];"
           f"[tr{i}][bar{i}]overlay=x='-{w}+min(1,max(0,(t-{t0:.3f})/0.7))*{w}':eval=frame[bb{i}];"
           f"[g{i}][bb{i}]overlay=640:{250 + i * 150}[g{i + 1}];")
partes = [txt("POSTANDO TODO DIA, EM 4 REDES", 90, 80, 64, 0.1, d)]
for i, (nome, valor, t0, cor) in enumerate(BARRAS):
    y = 250 + i * 150
    partes.append(txt(nome, 90, y + 18, 40, t0, d, caixa=False, fonte=BOLD_T))
    w = max(40, int(MAXW * valor / 31140))
    rotulo = f"R$ {valor:,}".replace(",", ".") + " por mês"
    partes.append(txt(rotulo, 640 + w + 24, y + 14, 46, t0 + 0.6, d, caixa=False, fonte=PRETO_T,
                      cor=("0xF97316" if cor == LARANJA else "white")))
t82 = quando(6, "oitenta")
partes.append(txt("ATÉ 82% A MENOS", "w-text_w-110", 850, 84, t82, d))
partes.append(txt("Salários de mercado (Glassdoor 2026), 80% de encargos e preços de agência e freelancer pesquisados. Simule em demandou.com",
                  90, 172, 24, 1.0, d, caixa=False, fonte=INTER_T, cor="0x9599a6"))
fc += "[g4]" + ",".join(partes) + ",format=yuv420p[v]"
ff(["-f", "lavfi", "-i", f"color=c={FUNDO}:s=1920x1080:r=30", "-t", f"{d:.3f}", "-filter_complex", fc, "-map", "[v]", *ENC, "tmp/s6.mp4"])

# ════════════════ BLOCO 7: A CHAMADA ════════════════
d = DURS[7] + 1.6
t_falou = quando(7, "Você")
f7 = (f"[0:v]{V},eq=brightness=-0.32:saturation=0.75,boxblur=10:2[b];[1:v]scale=170:170[m];[b][m]overlay=600:150[x];[x]"
      + ",".join([
          txt("demandou.", 800, 178, 110, 0.0, d, caixa=False, fonte=BOLD_T),
          txt("FAÇA A SUA CONTA EM DEMANDOU.COM", "(w-text_w)/2", 470, 78, 0.3, d),
          txt("e agende uma demonstração", "(w-text_w)/2", 610, 58, quando(7, "agende"), d, caixa=False, fonte=BOLD_T),
          txt("Você falou. demandou. postou.", "(w-text_w)/2", 800, 64, t_falou, d, caixa=False, fonte=BOLD_T, cor="0xFB923C"),
      ]) + ",format=yuv420p[v]")
ff(["-i", "cena-chamada.mp4", "-loop", "1", "-i", MARCA, "-t", f"{d:.3f}", "-filter_complex", f7, "-map", "[v]", *ENC, "tmp/s7.mp4"])

# ════════════════ EMENDA, LEGENDA E SOM ════════════════
X = 0.25
duras = [dur(f"tmp/s{i}.mp4") for i in range(8)]
inicios, acc = [], 0.0
for i, dd in enumerate(duras):
    inicios.append(acc)
    acc += dd - X
transicoes = ["slideleft", "fade", "wipeleft", "slideleft", "slideleft", "fade", "fadeblack"]
fc, ant = "", "0:v"
for i in range(1, 8):
    off = inicios[i]
    fc += f"[{ant}][{i}:v]xfade=transition={transicoes[i - 1]}:duration={X}:offset={off:.3f}[x{i}];"
    ant = f"x{i}"
fc = fc.rstrip(";")
ins = sum([["-i", f"tmp/s{i}.mp4"] for i in range(8)], [])
ff([*ins, "-filter_complex", fc, "-map", f"[{ant}]", *ENC, "tmp/video.mp4"])
total = dur("tmp/video.mp4")


# A legenda: blocos de até ~30 caracteres, cortados na pontuação.
def ts(s):
    h, s = divmod(max(0, s), 3600)
    m, s = divmod(s, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


linhas = []
for b, pal in enumerate(PALAVRAS):
    grupo = []
    for j, (p, s, e) in enumerate(pal):
        grupo.append((p, s, e))
        texto = " ".join(g[0] for g in grupo)
        fim_frase = p[-1] in ".,:?!"
        if len(texto) >= 26 or (fim_frase and len(grupo) >= 2) or j == len(pal) - 1:
            ini = inicios[b] + grupo[0][1]
            prox = pal[j + 1][1] if j + 1 < len(pal) else grupo[-1][2] + 0.3
            fim = inicios[b] + min(prox, grupo[-1][2] + 0.35)
            limpo = texto.rstrip(",.:")
            linhas.append(f"Dialogue: 0,{ts(ini)},{ts(fim)},Leg,,0,0,0,,{limpo}")
            grupo = []
ass = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Leg,Montserrat Thin,56,&H00FFFFFF,&H00FFFFFF,&H50101015,&H00000000,-1,0,0,0,100,100,0,0,3,12,0,2,80,80,46,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" + "\n".join(linhas) + "\n"
open("tmp/legenda.ass", "w", encoding="utf-8").write(ass)

aud = "".join(f"[{i}:a]adelay={int(inicios[i] * 1000)}|{int(inicios[i] * 1000)}[n{i}];" for i in range(8))
aud += f"[8:a]volume=0.13,afade=t=in:d=1,afade=t=out:st={total - 2.5:.2f}:d=2.5[m];"
aud += "[n0][n1][n2][n3][n4][n5][n6][n7][m]amix=inputs=9:normalize=0,loudnorm=I=-14:TP=-1.5[a]"
ins = sum([["-i", f"tmp/n{i}.wav"] for i in range(8)], [])
ff([*ins, "-stream_loop", "-1", "-i", f"{VV}/trilha.mp3", "-i", "tmp/video.mp4",
    "-filter_complex", aud + f";[9:v]ass=tmp/legenda.ass:fontsdir=fontes[v]", "-map", "[v]", "-map", "[a]", "-t", f"{total:.3f}",
    "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
    "demandou-pitch.mp4"])
print("pronto", round(total, 1), "s", "inicios", [round(x, 2) for x in inicios])
