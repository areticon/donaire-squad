# Vídeo de pitch, versão 3 (01/10): a v2 com o logo de volta ao de 25/08 no fecho
# e o gêmeo novo do Bruno. O resto é a v2 sem mudança.
# Versão 2 (01/10): foco em dor, barreiras, produto (o squad)
# e objeções; economia em porcentagem, nunca preço. Identidade nova da marca
# (azul-marinho e branco, laranja discreto, destaques em degradê), Geist.
# Camadas de texto desenhadas em HTML (camadas.mjs) e compostas no ffmpeg sobre
# telas reais em 2x, o gêmeo digital real do Bruno, cortes reais e cenas da
# Higgsfield. Saída 1920x1080.
import json, os, re, subprocess, unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
os.chdir(AQUI)
P = os.path.dirname(AQUI)  # scratchpad/pitch
T4 = f"{P}/telas4k"
PUB = "C:/Users/devan/opensquad-app/public"
VV = "C:/Users/devan/Documents/Demandou/video-venda"
GEMEO = "C:/Users/devan/Documents/Demandou/gemeo-teste/videos/gemeo-omnihuman.mp4"
os.makedirs("tmp", exist_ok=True)
TEMPO = 1.08
PAD = 0.25
FPS = 30
V = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=yuv420p,setsar=1"
ENC = ["-c:v", "libx264", "-crf", "15", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-an"]
SO = os.environ.get("SO")  # remontar só um bloco, para iterar


def dur(f):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f],
                                capture_output=True, text=True).stdout.strip())


def ff(args):
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", *args], capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-3000:])
        raise SystemExit(1)


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if not unicodedata.combining(c)))


# ───────────────────────── narração ─────────────────────────
PALAVRAS, DURS = [], []
for i in range(9):
    ff(["-i", f"voz-{i}.mp3", "-af", f"atempo={TEMPO}", "-ar", "44100", f"tmp/n{i}.wav"])
    al = json.load(open(f"voz-{i}.json", encoding="utf-8"))
    pal, atual, a0, ult = [], "", None, 0
    for c, s, e in zip(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]):
        if c.isspace():
            if atual:
                pal.append((atual, a0 / TEMPO, ult / TEMPO))
            atual, a0 = "", None
        else:
            if a0 is None:
                a0 = s
            atual += c
            ult = e
    if atual:
        pal.append((atual, a0 / TEMPO, ult / TEMPO))
    PALAVRAS.append(pal)
    DURS.append(dur(f"tmp/n{i}.wav") + PAD)


def q(b, palavra, n=0):
    alvo = norm(palavra)
    ach = [p for p in PALAVRAS[b] if norm(p[0]) == alvo]
    if len(ach) <= n:
        raise SystemExit(f"'{palavra}' não está no bloco {b}: {[p[0] for p in PALAVRAS[b]]}")
    return ach[n][1]


# O trecho do gêmeo, com o áudio dele (01/10, versão com a voz clonada do Bruno
# e o OmniHuman 1.5): "Oi, eu sou o gêmeo digital do Bruno. Ele me criou com uma
# foto e um minuto da voz dele." Os tempos saem do alinhamento da ElevenLabs.
# VERSÃO 3 (01/10): o gêmeo é o NOVO, que o Bruno mandou (caminho em GEMEO_NOVO).
# A fala dele vem do Whisper local (gemeo_novo.py grava gemeo-fala.json com
# início e fim de cada palavra): o trecho do gêmeo vai do começo até o fim da
# última palavra, com a voz original dele, e a legenda sai desses tempos.
GEMEO = os.environ.get("GEMEO_NOVO")
if not GEMEO or not os.path.exists(GEMEO):
    raise SystemExit("defina GEMEO_NOVO com o mp4 do gêmeo novo (o antigo não entra na v3)")
_fala = json.load(open("gemeo-fala.json", encoding="utf-8"))
G_DUR = dur(GEMEO)
# Mesmo corte da v2: o gêmeo fala até "dele." (quem é e como foi feito) e o
# resto da fala dele ("sem tempo pra gravar? Deixa comigo") entra mudo na
# objeção "Sem tempo de gravar?", como antes. Assim a duração do pitch fica
# praticamente a mesma e nada além do gêmeo muda.
_fim = next(i for i, (w, _, _) in enumerate(_fala) if w.lower().startswith("dele"))
G_INI = 0.0
G_FIM = (_fala[_fim + 1][1] - 0.05) if _fim + 1 < len(_fala) else min(G_DUR - 0.05, _fala[_fim][2] + 0.3)
GEMEO_FALA = [(w, s) for w, s, _ in _fala[: _fim + 1]]
G_MUDO = 6.6  # trecho mudo usado na objeção "sem tempo de gravar" (ajustado ao tamanho no b6)
# Encaixa o gêmeo na caixa de 860x860 sem distorcer, seja ele quadrado, largo ou em pé.
G_CAIXA = ("[1:v]scale=860:860:force_original_aspect_ratio=decrease,setsar=1[g];"
           "[0:v][g]overlay=x=960+(860-overlay_w)/2:y=150+(860-overlay_h)/2:shortest=1,fps=30,format=yuv420p[v]")

# ───────────────────────── camadas em HTML ─────────────────────────
LOGOS = json.load(open("logos.json", encoding="utf-8"))
F = P.replace("\\", "/") + "/fontes"
CSS = f"""
@font-face {{ font-family: Geist; font-weight: 400; src: url('file:///{F}/Geist-400.ttf'); }}
@font-face {{ font-family: Geist; font-weight: 600; src: url('file:///{F}/Geist-600.ttf'); }}
@font-face {{ font-family: Geist; font-weight: 700; src: url('file:///{F}/Geist-700.ttf'); }}
@font-face {{ font-family: GeistMono; font-weight: 500; src: url('file:///{F}/GeistMono-500.ttf'); }}
@font-face {{ font-family: Mont; font-weight: 700; src: url('file:///{F}/Montserrat-Bold.ttf'); }}
* {{ box-sizing: border-box; margin: 0; }}
html, body {{ width: 1920px; height: 1080px; background: transparent; overflow: hidden; }}
body {{ font-family: Geist, sans-serif; color: #e8eef6; position: relative; }}
.abs {{ position: absolute; }}
.hl {{ background: linear-gradient(100deg, #ffc59a, #f1742e); -webkit-background-clip: text; background-clip: text; color: transparent; }}
.prata {{ background: linear-gradient(100deg, #ffffff, #9fb0c6); -webkit-background-clip: text; background-clip: text; color: transparent; }}
.vidro {{ background: rgba(6,17,31,.94); border: 1px solid rgba(255,255,255,.12); border-radius: 22px; box-shadow: 0 24px 60px rgba(0,0,0,.45); }}
.titulo {{ font-weight: 600; letter-spacing: -0.025em; line-height: 1.04; }}
.selo {{ display: inline-flex; align-items: center; gap: 12px; font-family: GeistMono; font-weight: 500; font-size: 20px; letter-spacing: .16em;
  text-transform: uppercase; color: #dfe6ef; padding: 10px 20px; border-radius: 999px;
  background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.02)); border: 1px solid rgba(255,255,255,.14); }}
.selo i {{ width: 10px; height: 10px; border-radius: 50%; background: #ef6122; display: inline-block; }}
.fraco {{ color: #9aabc2; }}
.numero {{ display: inline-flex; width: 74px; height: 74px; border-radius: 18px; align-items: center; justify-content: center;
  font-weight: 700; font-size: 44px; color: #fff; background: linear-gradient(135deg, #f1742e, #c4470f); }}
"""
CAMADAS = []


def camada(nome, html):
    CAMADAS.append({"nome": nome, "html": html})
    return f"camadas/{nome}.png"


def titulo_box(texto, x=80, y=70, tam=72, largura=None, sub=None, selo=None):
    w = f"max-width:{largura}px;" if largura else ""
    s = f'<div class="selo" style="margin-bottom:18px"><i></i>{selo}</div><br>' if selo else ""
    sb = f'<div class="fraco" style="font-size:{int(tam * 0.42)}px;margin-top:14px;font-weight:400;line-height:1.3">{sub}</div>' if sub else ""
    return (f'<div class="abs" style="left:{x}px;top:{y}px;{w}">{s}<div class="vidro" style="display:inline-block;padding:26px 34px">'
            f'<div class="titulo" style="font-size:{tam}px">{texto}</div>{sb}</div></div>')


def fundo_html(brilho=True):
    g = ('<div class="abs" style="right:-200px;top:-260px;width:900px;height:900px;border-radius:50%;'
         'background:radial-gradient(circle, rgba(241,116,46,.20), rgba(241,116,46,0) 65%)"></div>') if brilho else ""
    return ('<div class="abs" style="inset:0;background:#06111f"></div>'
            '<div class="abs" style="inset:0;background-image:linear-gradient(to right, rgba(31,53,83,.45) 1px, transparent 1px),'
            'linear-gradient(to bottom, rgba(31,53,83,.45) 1px, transparent 1px);background-size:48px 48px"></div>'
            '<div class="abs" style="inset:0;background:radial-gradient(ellipse at 30% 0%, rgba(21,50,90,.75), rgba(6,17,31,0) 60%)"></div>' + g)


FUNDO = camada("fundo", fundo_html())


def logo_rede(nome, tam=72):
    l = LOGOS[nome]
    svg = re.sub(r'width="\d+" height="\d+"', f'width="{int(tam * .55)}" height="{int(tam * .55)}"', l["svg"])
    return (f'<span style="display:inline-flex;width:{tam}px;height:{tam}px;border-radius:{int(tam * .24)}px;align-items:center;'
            f'justify-content:center;background:{l["bg"]}">{svg}</span>')


# ───────────────────────── ferramentas de cena ─────────────────────────
def camadas_sobre(base, saida, d, lista, extra_in=None):
    """Põe camadas PNG (tela cheia) sobre um vídeo base, com entrada suave.
    lista: (png, ini, fim[, sobe]) ; sobe=deslocamento inicial em px."""
    ins = ["-i", base]
    fc, atual = "", "0:v"
    for k, it in enumerate(lista):
        png, ini, fim = it[0], max(0.0, it[1]), min(d, it[2])
        sobe = it[3] if len(it) > 3 else 26
        # modo: "" entra e sai suave; "entra" só entra suave; "seco" troca sem
        # esmaecer. Estados de um mesmo painel trocam "seco": esmaecer um sobre
        # o outro deixava o painel transparente no meio da troca (prova de 01/10).
        modo = it[4] if len(it) > 4 else ""
        ins += ["-loop", "1", "-framerate", str(FPS), "-t", f"{d:.3f}", "-i", png]
        fo = max(ini + 0.3, fim - 0.22)
        fi = "" if modo == "seco" else f",fade=t=in:st={ini:.3f}:d=0.28:alpha=1"
        fout = "" if modo in ("seco", "entra") else f",fade=t=out:st={fo:.3f}:d=0.22:alpha=1"
        fc += (f"[{k + 1}:v]format=rgba{fi}{fout}[c{k}];"
               f"[{atual}][c{k}]overlay=x=0:y='if(lt(t,{ini:.3f}+0.35),(1-(t-{ini:.3f})/0.35)*{sobe},0)':eval=frame:"
               f"enable='between(t,{ini:.3f},{fim:.3f})'[o{k}];")
        atual = f"o{k}"
    fc += f"[{atual}]format=yuv420p[v]"
    ff([*ins, "-filter_complex", fc, "-map", "[v]", "-t", f"{d:.3f}", *ENC, saida])


def camera(img, saida, d, quadros, iw=3840):
    """Câmera sobre uma tela em 2x: passa de um enquadramento a outro.
    quadros: [(t, zoom, cx, cy)] em coordenadas da imagem; entre dois quadros a
    câmera anda com suavização, e depois do último segue num zoom lento."""
    def lerp(a, b, e):
        return f"({a}+({b}-{a})*{e})"
    tt = "(in/30)"
    z, cx, cy = str(quadros[-1][1]), str(quadros[-1][2]), str(quadros[-1][3])
    # Monta de trás para frente: if(t<t1, trecho0, if(t<t2, trecho1, ...))
    for k in range(len(quadros) - 1, 0, -1):
        t0, z0, x0, y0 = quadros[k - 1]
        t1, z1, x1, y1 = quadros[k]
        p = f"min(1,max(0,({tt}-{t0})/({t1}-{t0})))"
        e = f"({p}*{p}*(3-2*{p}))"
        z = f"if(lt({tt},{t1}),{lerp(z0, z1, e)},{z})"
        cx = f"if(lt({tt},{t1}),{lerp(x0, x1, e)},{cx})"
        cy = f"if(lt({tt},{t1}),{lerp(y0, y1, e)},{cy})"
    # Deriva lenta depois do último quadro (3% de zoom até o fim).
    tl = quadros[-1][0]
    z = f"({z})*(1+0.03*max(0,{tt}-{tl})/{max(0.5, d - tl):.3f})"
    vf = (f"zoompan=z='{z}':x='({cx})-iw/zoom/2':y='({cy})-ih/zoom/2':d=1:s=1920x1080:fps=30,setsar=1,format=yuv420p")
    ff(["-loop", "1", "-framerate", str(FPS), "-t", f"{d:.3f}", "-i", img, "-vf", vf, *ENC, "-t", f"{d:.3f}", saida])


def clipe(entrada, saida, d, vf="", ss=0.0, vel=None):
    pre = f"setpts={vel:.4f}*PTS," if vel else ""
    ff(["-ss", f"{ss}", "-i", entrada, "-t", f"{d:.3f}", "-vf", pre + V + ("," + vf if vf else ""), *ENC, "-t", f"{d:.3f}", saida])


def fundo_video(saida, d):
    ff(["-loop", "1", "-framerate", str(FPS), "-t", f"{d:.3f}", "-i", FUNDO, "-vf", "format=yuv420p", *ENC, saida])


def emendar(partes, saida):
    ins = sum([["-i", p] for p in partes], [])
    ff([*ins, "-filter_complex", "".join(f"[{i}:v]" for i in range(len(partes))) + f"concat=n={len(partes)}:v=1:a=0[v]",
        "-map", "[v]", *ENC, saida])


# ───────────────────────── roteiro visual ─────────────────────────
# Cada bloco: (função que monta tmp/sN.mp4). As camadas são declaradas primeiro
# e desenhadas de uma vez só pelo camadas.mjs.
BLOCOS = []
DUR_BLOCO = {}

# ═══ 0. A DOR ═══
d = DURS[0]
DUR_BLOCO[0] = d
L0a = camada("b0a", titulo_box('Sua empresa precisa <span class="hl">aparecer</span>.', tam=78))
L0b = camada("b0b", titulo_box('Postar todo dia, em 6 redes,<br>é um <span class="hl">segundo emprego</span>.', tam=78))
L0c = camada("b0c", '<div class="abs" style="left:0;right:0;top:380px;text-align:center"><div class="vidro" style="display:inline-block;padding:30px 54px">'
              '<div class="titulo" style="font-size:120px">O perfil <span class="hl">some</span>.</div></div></div>')


def b0():
    d = DUR_BLOCO[0]  # a duração DESTE bloco (o "d" global é o do último bloco declarado)
    corte = q(0, "Quando") - 0.15
    clipe(f"{P}/cena-dor-mesa.mp4", "tmp/b0a.mp4", corte, "eq=brightness=-0.06:saturation=0.85,vignette=PI/5", vel=max(1, corte / 5.0))
    clipe(f"{VV}/cena-dor.mp4", "tmp/b0b.mp4", d - corte, "eq=brightness=-0.1:saturation=0.8,vignette=PI/4", vel=max(1, (d - corte) / 5.0))
    emendar(["tmp/b0a.mp4", "tmp/b0b.mp4"], "tmp/base0.mp4")
    camadas_sobre("tmp/base0.mp4", "tmp/s0.mp4", d, [
        (L0a, 0.1, q(0, "Mas") - 0.05),
        (L0b, q(0, "Mas"), corte),
        (L0c, q(0, "perfil") - 0.2, d + 1),
    ])


BLOCOS.append(b0)

# ═══ 1. AS BARREIRAS ═══
d = DURS[1]
DUR_BLOCO[1] = d
L1t = camada("b1t", titulo_box('As saídas de sempre <span class="hl">travam</span>.', tam=72))


def cartao_barreira(k, titulo, texto):
    x = 80 + k * 600
    return camada(f"b1c{k}", f'<div class="abs vidro" style="left:{x}px;top:420px;width:560px;padding:34px 36px">'
                  f'<div style="display:flex;align-items:center;gap:16px;margin-bottom:14px">'
                  f'<span style="width:48px;height:48px;border-radius:14px;background:rgba(239,97,34,.16);display:inline-flex;align-items:center;justify-content:center;color:#f1742e;font-size:30px;font-weight:700">×</span>'
                  f'<span class="titulo" style="font-size:44px">{titulo}</span></div>'
                  f'<div class="fraco" style="font-size:30px;line-height:1.3">{texto}</div></div>')


L1c = [cartao_barreira(0, "Time próprio", "Caro, e traz passivo trabalhista"),
       cartao_barreira(1, "Agência", "Demora, e fala genérico"),
       cartao_barreira(2, "Fazer sozinho", "Não sobra agenda para o negócio")]


def b1():
    d = DUR_BLOCO[1]  # a duração DESTE bloco (o "d" global é o do último bloco declarado)
    clipe(f"{P}/cena-custo.mp4", "tmp/base1.mp4", d, "eq=brightness=-0.22:saturation=0.7,boxblur=4:1", vel=max(1, d / 5.0))
    camadas_sobre("tmp/base1.mp4", "tmp/s1.mp4", d, [
        (L1t, 0.1, d + 1),
        (L1c[0], q(1, "time"), d + 1, 40),
        (L1c[1], q(1, "agência"), d + 1, 40),
        (L1c[2], q(1, "sozinho"), d + 1, 40),
    ])


BLOCOS.append(b1)

# ═══ 2. O SQUAD ═══
d = DURS[2]
DUR_BLOCO[2] = d
AGENTES = {
    "roberto": ("roberto-radar", "Roberto", "Pesquisa o seu mercado", "#3b82f6"),
    "diana": ("diana-design", "Diana", "Desenha artes e carrosséis", "#a855f7"),
    "vitor": ("vitor-video", "Vitor", "Edita vídeo completo e cortes", "#f43f5e"),
    "vera": ("vera-veredito", "Vera", "Revisa tudo antes de você", "#eab308"),
    "paulo": ("paulo-publicador", "Paulo", "Publica na hora certa", "#22c55e"),
}
REDATORES = ["lucas-linkedin", "igor-instagram", "xavier-x", "fernanda-facebook", "yan-youtube", "tiago-tiktok"]


def painel_squad(aceso):
    def av(id_, cor, tam=64):
        return (f'<span style="width:{tam}px;height:{tam}px;border-radius:50%;overflow:hidden;display:inline-flex;align-items:flex-end;'
                f'border:2px solid {cor};background:radial-gradient(circle at 50% 35%, {cor}55, {cor}22);flex:0 0 auto">'
                f'<img src="file:///{PUB}/agentes/{id_}-avatar-p.webp" style="width:100%;height:100%;object-fit:cover"></span>')

    def linha(chave, conteudo, cor):
        on = aceso == chave or aceso == "todos"
        estilo = (f"background:{cor}22;border:1px solid {cor}aa;" if on else "border:1px solid transparent;opacity:.42;")
        return f'<div style="display:flex;align-items:center;gap:16px;padding:12px 16px;border-radius:16px;{estilo}">{conteudo}</div>'

    linhas = []
    for chave in ["roberto"]:
        a = AGENTES[chave]
        linhas.append(linha(chave, av(a[0], a[3]) + f'<div><div style="font-weight:600;font-size:30px">{a[1]}</div>'
                                                    f'<div class="fraco" style="font-size:22px">{a[2]}</div></div>', a[3]))
    cores = ["#1d4ed8", "#db2777", "#475569", "#6366f1", "#dc2626", "#0ea5e9"]
    mini = "".join(f'<span style="margin-left:{0 if k == 0 else -14}px">{av(r, cores[k], 46)}</span>' for k, r in enumerate(REDATORES))
    linhas.append(linha("redatores", f'<div style="display:flex">{mini}</div><div><div style="font-weight:600;font-size:30px">Um redator por rede</div>'
                                     f'<div class="fraco" style="font-size:22px">Escreve no seu tom</div></div>', "#9fb0c6"))
    for chave in ["diana", "vitor", "vera", "paulo"]:
        a = AGENTES[chave]
        linhas.append(linha(chave, av(a[0], a[3]) + f'<div><div style="font-weight:600;font-size:30px">{a[1]}</div>'
                                                    f'<div class="fraco" style="font-size:22px">{a[2]}</div></div>', a[3]))
    return (f'<div class="abs vidro" style="left:60px;top:150px;width:600px;padding:24px 18px">'
            f'<div class="selo" style="margin:0 0 14px 14px"><i></i>O seu squad</div>{"".join(linhas)}</div>')


L2t = camada("b2t", titulo_box('Um time de agentes de IA<br><span class="hl">trabalhando por você</span>.', tam=74))
L2p = {k: camada(f"b2p-{k}", painel_squad(k)) for k in ["roberto", "redatores", "diana", "vitor", "vera", "paulo"]}

# Onde está cada agente no print 2x do escritório (coordenadas da imagem 3840x2160).
POS = {"geral": (2150, 1230), "roberto": (1950, 930), "redatores": (2230, 1060), "diana": (2424, 1215),
       "vitor": (2715, 1140), "vera": (2640, 1530), "paulo": (2655, 1285)}


def alvo(chave, z, tela_x=1300):
    # O agente fica à direita do painel: na tela, em x = tela_x.
    ax, ay = POS[chave]
    return z, ax - (tela_x - 960) * 2 / z, ay


def b2():
    d = DUR_BLOCO[2]  # a duração DESTE bloco (o "d" global é o do último bloco declarado)
    tR, tW, tD, tV, tVe, tP = q(2, "Roberto"), q(2, "redator"), q(2, "Diana"), q(2, "Vitor"), q(2, "Vera"), q(2, "Paulo")
    zs = {"roberto": 2.7, "redatores": 2.2, "diana": 2.8, "vitor": 2.8, "vera": 2.6, "paulo": 2.8}
    quadros = [(0, 1.25, 2150, 1230), (tR - 0.6, 1.25, 2150, 1230)]
    for chave, t in [("roberto", tR), ("redatores", tW), ("diana", tD), ("vitor", tV), ("vera", tVe), ("paulo", tP)]:
        z, cx, cy = alvo(chave, zs[chave])
        quadros.append((t - 0.1, z, cx, cy))
        quadros.append((t + 0.5, z, cx, cy))
    quadros = [quadros[0]] + [qq for k, qq in enumerate(quadros[1:], 1) if qq[0] > quadros[k - 1][0]]
    camera(f"{T4}/escritorio.png", "tmp/base2.mp4", d, quadros)
    marcas = [("roberto", tR), ("redatores", tW), ("diana", tD), ("vitor", tV), ("vera", tVe), ("paulo", tP)]
    lista = [(L2t, 0.1, tR - 0.15)]
    for k, (chave, t) in enumerate(marcas):
        fim = marcas[k + 1][1] if k + 1 < len(marcas) else d + 1
        ultimo = k + 1 == len(marcas)
        lista.append((L2p[chave], t - 0.15, fim - 0.15 if not ultimo else d + 1, 0 if k else 26,
                      "entra" if k == 0 else ("seco" if not ultimo else "seco")))
    camadas_sobre("tmp/base2.mp4", "tmp/s2.mp4", d, lista)


BLOCOS.append(b2)

# ═══ 3. COMO COMEÇAR: vídeo próprio e o anúncio do gêmeo ═══
d = DURS[3]
DUR_BLOCO[3] = d
L3t = camada("b3t", titulo_box('Você escolhe <span class="hl">como começar</span>.', tam=72))
L3v = camada("b3v", '<div class="abs" style="left:90px;top:70px;display:flex;align-items:center;gap:22px"><span class="numero">1</span>'
              '<div class="vidro" style="padding:18px 30px"><div class="titulo" style="font-size:58px">A partir do <span class="hl">seu vídeo</span></div></div></div>'
              '<div class="abs fraco" style="left:90px;top:900px;font-size:30px">Vídeo completo editado · cortes com legenda · posts e carrosséis da semana</div>')
L3g = camada("b3g", '<div class="abs" style="left:90px;top:70px;display:flex;align-items:center;gap:22px"><span class="numero">2</span>'
              '<div class="vidro" style="padding:18px 30px"><div class="titulo" style="font-size:58px">O seu <span class="hl">gêmeo digital</span></div></div></div>')


def b3():
    d = DUR_BLOCO[3]  # a duração DESTE bloco (o "d" global é o do último bloco declarado)
    tS, tG = q(3, "sobe") - 0.1, q(3, "Ou") - 0.05
    camera(f"{T4}/criar.png", "tmp/b3a.mp4", tS, [(0, 1.35, 2200, 1150), (tS, 1.55, 2200, 1150)])
    b = tG - tS
    ff(["-loop", "1", "-framerate", "30", "-t", f"{b:.3f}", "-i", FUNDO, "-ss", "8", "-i", f"{P}/completo-trecho.mp4", "-ss", "2", "-i", f"{P}/corte-jetro.mp4",
        "-filter_complex", "[1:v]scale=1120:630,setsar=1[h];[2:v]scale=-2:740,setsar=1[vv];"
        "[0:v][h]overlay=90:220:shortest=1[x];[x][vv]overlay=1330:190:shortest=1,fps=30,format=yuv420p[v]",
        "-map", "[v]", "-t", f"{b:.3f}", *ENC, "tmp/b3b.mp4"])
    c = d - tG
    ff(["-loop", "1", "-framerate", "30", "-t", f"{c:.3f}", "-i", FUNDO, "-ss", f"{G_INI}", "-i", GEMEO,
        "-filter_complex", G_CAIXA,
        "-map", "[v]", "-t", f"{c:.3f}", *ENC, "tmp/b3c.mp4"])
    emendar(["tmp/b3a.mp4", "tmp/b3b.mp4", "tmp/b3c.mp4"], "tmp/base3.mp4")
    camadas_sobre("tmp/base3.mp4", "tmp/s3.mp4", d, [
        (L3t, 0.05, tS),
        (L3v, tS + 0.05, tG),
        (L3g, tG + 0.05, d + 1),
    ])


BLOCOS.append(b3)

# ═══ G. O GÊMEO FALANDO (o áudio é dele) ═══
DG = G_FIM - G_INI
DUR_BLOCO["g"] = DG
LGa = camada("bga", '<div class="abs" style="left:90px;top:70px;display:flex;align-items:center;gap:22px"><span class="numero">2</span>'
              '<div class="vidro" style="padding:18px 30px"><div class="titulo" style="font-size:58px">O seu <span class="hl">gêmeo digital</span></div></div></div>'
              '<div class="abs" style="left:90px;top:260px;width:780px">'
              '<div class="titulo" style="font-size:54px;margin-bottom:22px">Grava por você,<br>com o seu rosto e a sua voz.</div>'
              '<div class="fraco" style="font-size:28px;line-height:1.4">Este é o gêmeo do Bruno, sócio da Demandou: uma foto e um minuto da voz dele, com a autorização dele.</div></div>'
              '<div class="abs selo" style="left:90px;top:560px"><i></i>Áudio original do gêmeo</div>')


def bg():
    ff(["-loop", "1", "-framerate", "30", "-t", f"{DG:.3f}", "-i", FUNDO, "-ss", f"{G_INI}", "-i", GEMEO,
        "-filter_complex", G_CAIXA,
        "-map", "[v]", "-t", f"{DG:.3f}", *ENC, "tmp/baseg.mp4"])
    camadas_sobre("tmp/baseg.mp4", "tmp/sg.mp4", DG, [(LGa, 0.0, DG + 1, 0)])


BLOCOS.append(bg)

# ═══ 4. DO ZERO ═══
d = DURS[4]
DUR_BLOCO[4] = d
L4 = camada("b4", '<div class="abs" style="left:90px;top:70px;display:flex;align-items:center;gap:22px"><span class="numero">3</span>'
             '<div class="vidro" style="padding:18px 30px"><div class="titulo" style="font-size:58px">Tudo do zero, <span class="hl">com IA</span></div></div></div>')
L4b = camada("b4b", '<div class="abs vidro" style="left:90px;top:900px;padding:16px 26px;font-size:30px">Pesquisa com fontes · temas novos toda semana · texto, arte e vídeo narrado</div>')


def b4():
    d = DUR_BLOCO[4]  # a duração DESTE bloco (o "d" global é o do último bloco declarado)
    a = min(2.6, d * 0.5)
    camera(f"{T4}/linha.png", "tmp/b4a.mp4", a, [(0, 1.6, 1500, 1250), (a, 1.75, 1500, 1350)])
    c = d - a
    pecas = [f"{P}/deck/peca-ferramenta.jpg", f"{P}/deck/peca-citado.jpg", f"{P}/deck/peca-calado.jpg", f"{P}/deck/peca-50min.jpg"]
    ins = sum([["-loop", "1", "-framerate", "30", "-t", f"{c:.3f}", "-i", x] for x in pecas], [])
    fc = ""
    for i in range(4):
        fc += f"[{i + 1}:v]scale=400:500,setsar=1[p{i}];"
    ant = "0:v"
    for i in range(4):
        t0 = 0.05 + i * 0.16
        fc += f"[{ant}][p{i}]overlay=x={105 + i * 440}:y='if(lt(t,{t0}),1080,max(260,1080-(t-{t0})*3200))':eval=frame[g{i}];"
        ant = f"g{i}"
    fc += f"[{ant}]format=yuv420p[v]"
    ff(["-loop", "1", "-framerate", "30", "-t", f"{c:.3f}", "-i", FUNDO, *ins, "-filter_complex", fc, "-map", "[v]", "-t", f"{c:.3f}", *ENC, "tmp/b4b.mp4"])
    emendar(["tmp/b4a.mp4", "tmp/b4b.mp4"], "tmp/base4.mp4")
    camadas_sobre("tmp/base4.mp4", "tmp/s4.mp4", d, [(L4, 0.05, d + 1), (L4b, a + 0.2, d + 1)])


BLOCOS.append(b4)

# ═══ 5. REDES E FORMATOS ═══
d = DURS[5]
DUR_BLOCO[5] = d
REDES = [("LinkedIn", "LinkedIn", "Perfil e página"), ("Instagram", "Instagram", "Feed, reels, stories, carrossel"),
         ("Facebook", "Facebook", "Página, feed e reels"), ("X", "X", "Post e thread"),
         ("YouTube", "YouTube", "Vídeo completo e Shorts"), ("TikTok", "TikTok", "Vídeo curto")]
FORMATOS = ["Texto", "Imagem", "Carrossel", "Infográfico", "Enquete", "Thread", "Vídeo curto", "Vídeo longo"]


def tile_rede(k, aceso):
    nome, chave, sub = REDES[k]
    x = 80 + k * 300
    op = "1" if aceso else ".28"
    borda = "rgba(241,116,46,.75)" if aceso else "rgba(255,255,255,.10)"
    return (f'<div class="abs" style="left:{x}px;top:250px;width:280px;height:250px;opacity:{op};border-radius:22px;border:1.5px solid {borda};'
            f'background:rgba(11,26,46,.92);padding:26px 22px">{logo_rede(chave, 76)}'
            f'<div style="font-weight:600;font-size:32px;margin-top:20px">{nome}</div>'
            f'<div class="fraco" style="font-size:21px;line-height:1.3;margin-top:6px">{sub}</div></div>')


def chip(k, aceso):
    x = 80 + (k % 8) * 222
    op = "1" if aceso else ".28"
    bg = "linear-gradient(100deg, #f1742e, #c4470f)" if aceso else "rgba(255,255,255,.06)"
    return (f'<div class="abs" style="left:{x}px;top:540px;width:206px;height:64px;border-radius:999px;opacity:{op};background:{bg};'
            f'border:1px solid rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:25px">{FORMATOS[k]}</div>')


L5t = camada("b5t", titulo_box('Em todas as redes. <span class="hl">Em todos os formatos.</span>', tam=64, y=60))
L5base = camada("b5base", "".join(tile_rede(k, False) for k in range(6)) + "".join(chip(k, False) for k in range(8)))
L5r = [camada(f"b5r{k}", tile_rede(k, True)) for k in range(6)]
L5f = [camada(f"b5f{k}", chip(k, True)) for k in range(8)]


def faixa_de_pecas():
    """Uma faixa com peças reais (cortes, completo, artes, cartões do calendário) que corre por baixo."""
    os.makedirs("tmp/faixa", exist_ok=True)
    itens = []
    for nome, src, ss in [("c1", f"{P}/corte-doze.mp4", 14), ("c2", f"{P}/corte-jetro.mp4", 31), ("c3", f"{P}/corte-moises.mp4", 6)]:
        ff(["-ss", str(ss), "-i", src, "-frames:v", "1", "-vf", "scale=-2:300", f"tmp/faixa/{nome}.png"])
        itens.append(f"tmp/faixa/{nome}.png")
    ff(["-ss", "20", "-i", f"{P}/completo-trecho.mp4", "-frames:v", "1", "-vf", "scale=-2:300", "tmp/faixa/comp.png"])
    # Cartões reais do calendário (print 2x): thread, infográfico, carrossel, enquete.
    for nome, crop in [("thread", "380:430:1960:1255"), ("info", "380:470:2425:840"), ("carro", "380:470:2890:840"), ("enq", "380:300:3355:840")]:
        ff(["-i", f"{T4}/calendario.png", "-frames:v", "1", "-vf", f"crop={crop},scale=-2:300", f"tmp/faixa/{nome}.png"])
    for nome in ["peca-ferramenta", "peca-citado", "peca-calado", "peca-50min"]:
        ff(["-i", f"{P}/deck/{nome}.jpg", "-frames:v", "1", "-vf", "scale=-2:300", f"tmp/faixa/{nome}.png"])
    ordem = ["c1", "peca-ferramenta", "thread", "comp", "info", "c2", "peca-calado", "carro", "enq", "c3", "peca-citado", "peca-50min"]
    ins = sum([["-i", f"tmp/faixa/{n}.png"] for n in ordem], [])
    fc = "".join(f"[{i}:v]pad=iw+24:300:0:0:color=0x06111f@0[p{i}];" for i in range(len(ordem)))
    fc += "".join(f"[p{i}]" for i in range(len(ordem))) + f"hstack=inputs={len(ordem)}[v]"
    ff([*ins, "-filter_complex", fc, "-map", "[v]", "-frames:v", "1", "tmp/faixa.png"])


def b5():
    d = DUR_BLOCO[5]  # a duração DESTE bloco (o "d" global é o do último bloco declarado)
    faixa_de_pecas()
    ff(["-loop", "1", "-framerate", "30", "-t", f"{d:.3f}", "-i", FUNDO, "-loop", "1", "-framerate", "30", "-t", f"{d:.3f}", "-i", "tmp/faixa.png",
        "-filter_complex", "[1:v]format=rgba,colorchannelmixer=aa=0.95[f];[0:v][f]overlay=x='60-t*55':y=650:eval=frame,format=yuv420p[v]",
        "-map", "[v]", "-t", f"{d:.3f}", *ENC, "tmp/base5.mp4"])
    lista = [(L5t, 0.05, d + 1), (L5base, 0.05, d + 1, 0)]
    for k, (nome, _, _) in enumerate(REDES):
        lista.append((L5r[k], q(5, nome.rstrip(",")) - 0.08, d + 1, 0))
    falas = ["Texto", "imagem", "carrossel", "infográfico", "enquete", "thread", "curto", "longo"]
    for k, w in enumerate(falas):
        lista.append((L5f[k], q(5, w) - 0.08, d + 1, 0))
    camadas_sobre("tmp/base5.mp4", "tmp/s5.mp4", d, lista)


BLOCOS.append(b5)

# ═══ 6. AS OBJEÇÕES ═══
d = DURS[6]
DUR_BLOCO[6] = d


def pergunta(k, p, r):
    return camada(f"b6q{k}", f'<div class="abs" style="left:80px;top:70px">'
                  f'<div class="vidro" style="display:inline-block;padding:20px 32px;margin-bottom:16px"><div class="titulo" style="font-size:64px">{p}</div></div><br>'
                  f'<div style="display:inline-block;padding:18px 30px;border-radius:20px;background:linear-gradient(100deg,#f1742e,#c4470f);'
                  f'box-shadow:0 20px 50px rgba(0,0,0,.4)"><div class="titulo" style="font-size:50px;color:#fff">{r}</div></div></div>')


L6 = [pergunta(0, "Parece robô?", "Sai na sua voz, e revisado."),
      pergunta(1, "Sem tempo de gravar?", "O gêmeo segura a semana."),
      pergunta(2, "Medo de errar?", "Nada sai sem a sua aprovação."),
      pergunta(3, "Já tem agência?", "Aqui a semana sai no mesmo dia.")]


def b6():
    d = DUR_BLOCO[6]  # a duração DESTE bloco (o "d" global é o do último bloco declarado)
    t = [0, q(6, "Sem") - 0.1, q(6, "Medo") - 0.1, q(6, "Já") - 0.1, d]
    # 1: o post escrito na voz do Bruno, no cartão real de aprovação.
    camera(f"{T4}/card-aberto.png", "tmp/b6a.mp4", t[1], [(0, 1.9, 1900, 1050), (t[1], 2.05, 1900, 1120)])
    # 2: o gêmeo, sem som.
    ff(["-loop", "1", "-framerate", "30", "-t", f"{t[2] - t[1]:.3f}", "-i", FUNDO, "-ss", f"{max(0.0, min(G_MUDO, G_DUR - (t[2] - t[1]) - 0.1)):.2f}", "-i", GEMEO,
        "-filter_complex", G_CAIXA,
        "-map", "[v]", "-t", f"{t[2] - t[1]:.3f}", *ENC, "tmp/b6b.mp4"])
    # 3: "Aprovado pela Vera, esperando você", e "sai se você aprovar".
    camera(f"{T4}/card-info.png", "tmp/b6c.mp4", t[3] - t[2], [(0, 1.8, 1360, 660), (t[3] - t[2], 1.9, 1400, 640)])
    # 4: a semana inteira pronta no calendário.
    camera(f"{T4}/calendario.png", "tmp/b6d.mp4", t[4] - t[3], [(0, 1.5, 2600, 1150), (t[4] - t[3], 1.62, 2600, 1150)])
    emendar(["tmp/b6a.mp4", "tmp/b6b.mp4", "tmp/b6c.mp4", "tmp/b6d.mp4"], "tmp/base6.mp4")
    camadas_sobre("tmp/base6.mp4", "tmp/s6.mp4", d, [(L6[k], t[k] + 0.05, t[k + 1], 20) for k in range(4)])


BLOCOS.append(b6)

# ═══ 7. A ECONOMIA ═══
d = DURS[7]
DUR_BLOCO[7] = d
L7a = camada("b7a", '<div class="abs" style="left:110px;top:150px;width:1700px;height:700px;border-radius:36px;'
              'background:linear-gradient(135deg,#15325a,#0a1f3b);border:1px solid rgba(255,255,255,.10);overflow:hidden">'
              '<div class="abs" style="right:-160px;top:-220px;width:760px;height:760px;border-radius:50%;background:radial-gradient(circle, rgba(241,116,46,.28), rgba(241,116,46,0) 65%)"></div>'
              '<div class="abs" style="left:80px;top:70px"><div class="selo"><i></i>Economia</div>'
              '<div class="titulo" style="font-size:44px;margin-top:30px" class="prata">Você economiza até</div>'
              '<div class="titulo hl" style="font-size:260px;line-height:1;margin-top:6px">88%</div>'
              '<div class="titulo prata" style="font-size:48px;margin-top:8px">contra um time próprio</div></div></div>')


def pilula(k, titulo, sub):
    return camada(f"b7p{k}", f'<div class="abs vidro" style="left:1080px;top:{250 + k * 170}px;width:640px;padding:22px 30px">'
                  f'<div style="font-weight:600;font-size:38px">{titulo}</div><div class="fraco" style="font-size:24px;margin-top:4px">{sub}</div></div>')


L7p = [pilula(0, "Produz mais", "Toda semana, em todas as redes"),
       pilula(1, "Com mais qualidade", "Pesquisa com fontes e revisão antes de sair"),
       pilula(2, "Sem passivo trabalhista", "Sem contratar equipe com carteira assinada")]
L7n = camada("b7n", '<div class="abs fraco" style="left:110px;top:880px;font-size:22px">Postando todo dia em 6 redes, contra time próprio com carteira assinada, salário de mercado e encargos. A conta e as fontes estão na calculadora em demandou.com.</div>')


def b7():
    d = DUR_BLOCO[7]  # a duração DESTE bloco (o "d" global é o do último bloco declarado)
    fundo_video("tmp/base7.mp4", d)
    camadas_sobre("tmp/base7.mp4", "tmp/s7.mp4", d, [
        (L7a, 0.05, d + 1), (L7n, 0.6, d + 1, 0),
        (L7p[0], q(7, "Produz") - 0.05, d + 1, 30), (L7p[1], q(7, "qualidade,") - 0.05, d + 1, 30), (L7p[2], q(7, "passivo") - 0.1, d + 1, 30),
    ])


BLOCOS.append(b7)

# ═══ 8. O FECHO ═══
FIM_EXTRA = 2.6
d = DURS[8] + FIM_EXTRA
DUR_BLOCO[8] = d
L8a = camada("b8a", '<div class="abs" style="left:0;right:0;top:330px;text-align:center"><div class="vidro" style="display:inline-block;padding:30px 50px">'
              '<div class="titulo" style="font-size:84px">Você cuida do seu negócio.</div></div></div>')
L8b = camada("b8b", '<div class="abs" style="left:0;right:0;top:520px;text-align:center"><div class="vidro" style="display:inline-block;padding:26px 46px">'
              '<div class="titulo" style="font-size:84px">O conteúdo <span class="hl">fica com a gente</span>.</div></div></div>')
# Versão 3 (01/10): o fecho volta ao logo de 25/08, como o site. Fundo escuro
# pede a marca branca (public/brand-mark-branco.svg, a geometria oficial só com
# a cor trocada) e o nome em Montserrat negrito, o logotipo de antes.
MARCA_SVG = open(f"{PUB}/brand-mark-branco.svg", encoding="utf-8").read()
MARCA_SVG = re.sub(r"<!--.*?-->", "", MARCA_SVG, flags=re.S).strip().replace("<svg ", '<svg width="150" height="150" ', 1)
LOGO_SVG = (f'<div style="display:flex;align-items:center;gap:6px;margin-left:-30px">{MARCA_SVG}'
            '<span style="font-family:Mont;font-weight:700;font-size:92px;color:#fff;letter-spacing:-0.01em">demandou.</span></div>')
L8c = camada("b8c", fundo_html() +
             f'<div class="abs" style="left:0;right:0;top:270px;display:flex;justify-content:center">{LOGO_SVG}</div>'
             '<div class="abs" style="left:0;right:0;top:450px;text-align:center"><span class="selo"><i></i>conteúdo de autoridade para empresas</span></div>'
             '<div class="abs titulo" style="left:0;right:0;top:560px;text-align:center;font-size:62px">Sua empresa vira referência. <span class="hl">Sem tomar a sua agenda.</span></div>'
             '<div class="abs" style="left:0;right:0;top:730px;text-align:center"><span style="display:inline-block;padding:22px 44px;border-radius:16px;'
             'background:#c4470f;color:#fff;font-weight:600;font-size:40px">Faça a sua conta em demandou.com</span></div>')


def b8():
    d = DUR_BLOCO[8]  # a duração DESTE bloco (o "d" global é o do último bloco declarado)
    clipe(f"{P}/cena-chamada.mp4", "tmp/base8.mp4", d, "eq=brightness=-0.3:saturation=0.6,boxblur=8:2", vel=max(1, d / 5.0))
    t_conta = q(8, "Faça") - 0.1
    camadas_sobre("tmp/base8.mp4", "tmp/s8.mp4", d, [
        (L8a, 0.05, t_conta), (L8b, q(8, "conteúdo") - 0.05, t_conta), (L8c, t_conta, d + 1, 0),
    ])


BLOCOS.append(b8)

# ───────────────────────── desenhar camadas e montar ─────────────────────────
json.dump(CAMADAS, open("camadas.json", "w", encoding="utf-8"), ensure_ascii=False)
open("estilo.css", "w", encoding="utf-8").write(CSS)
r = subprocess.run(["node", "camadas.mjs"], capture_output=True, text=True)
print(r.stdout.strip(), r.stderr[-800:])

ORDEM = ["0", "1", "2", "3", "g", "4", "5", "6", "7", "8"]
FUNCS = dict(zip(ORDEM, BLOCOS))
for k in ORDEM:
    if SO and k not in SO.split(","):
        continue
    FUNCS[k]()
    print("bloco", k, "ok")

if SO and not os.environ.get("MONTAR"):
    raise SystemExit("só os blocos " + SO)

# Emenda com transições curtas.
X = 0.25
arqs = [f"tmp/s{k}.mp4" for k in ORDEM]
duras = [dur(a) for a in arqs]
inicios, acc = [], 0.0
for dd in duras:
    inicios.append(acc)
    acc += dd - X
trans = ["fade", "slideleft", "fade", "fade", "fade", "slideleft", "fade", "slideleft", "fadeblack"]
fc, ant = "", "0:v"
for i in range(1, len(arqs)):
    fc += f"[{ant}][{i}:v]xfade=transition={trans[i - 1]}:duration={X}:offset={inicios[i]:.3f}[x{i}];"
    ant = f"x{i}"
ins = sum([["-i", a] for a in arqs], [])
ff([*ins, "-filter_complex", fc.rstrip(";"), "-map", f"[{ant}]", *ENC, "tmp/video.mp4"])
total = dur("tmp/video.mp4")
INI = dict(zip(ORDEM, inicios))


# Legenda: narração e a fala do gêmeo.
def ts(s):
    h, s = divmod(max(0, s), 3600)
    m, s = divmod(s, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def grupos(pal, base):
    out, g = [], []
    for j, (p, s, e) in enumerate(pal):
        g.append((p, s, e))
        txt = " ".join(x[0] for x in g)
        if len(txt) >= 28 or (p[-1] in ".,:?!" and len(g) >= 2) or j == len(pal) - 1:
            prox = pal[j + 1][1] if j + 1 < len(pal) else g[-1][2] + 0.3
            out.append((base + g[0][1], base + min(prox, g[-1][2] + 0.35), txt.rstrip(",.:")))
            g = []
    return out


linhas = []
mapa = {"0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8}
for k, b in mapa.items():
    linhas += grupos(PALAVRAS[b], INI[k])
gp = [(w, s - G_INI, s - G_INI + 0.3) for w, s in GEMEO_FALA]
gp = [(w, s, (gp[i + 1][1] if i + 1 < len(gp) else s + 0.45)) for i, (w, s, _) in enumerate(gp)]
linhas += grupos(gp, INI["g"])
ass = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Leg,Geist SemiBold,50,&H00FFFFFF,&H00FFFFFF,&H281F1106,&H00000000,0,0,0,0,100,100,0,0,3,14,0,2,80,80,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" + "\n".join(f"Dialogue: 0,{ts(a)},{ts(b)},Leg,,0,0,0,,{t}" for a, b, t in sorted(linhas)) + "\n"
open("tmp/legenda.ass", "w", encoding="utf-8").write(ass)

# Som: narração por bloco, a voz do gêmeo no bloco dele, e a trilha baixa.
ff(["-ss", f"{G_INI}", "-i", GEMEO, "-t", f"{DG:.3f}", "-vn", "-af", "afade=t=in:d=0.08,afade=t=out:st=" + f"{DG - 0.15:.3f}:d=0.15", "-ar", "44100", "tmp/gemeo.wav"])
fontes_audio = [(f"tmp/n{mapa[k]}.wav", INI[k]) for k in mapa] + [("tmp/gemeo.wav", INI["g"])]
ins = sum([["-i", a] for a, _ in fontes_audio], [])
aud = "".join(f"[{i}:a]adelay={int(t * 1000)}|{int(t * 1000)}[a{i}];" for i, (_, t) in enumerate(fontes_audio))
n = len(fontes_audio)
aud += (f"[{n}:a]volume=0.11,afade=t=in:d=1,afade=t=out:st={total - 2.5:.2f}:d=2.5[m];"
        + "".join(f"[a{i}]" for i in range(n)) + f"[m]amix=inputs={n + 1}:normalize=0,loudnorm=I=-14:TP=-1.5[a]")
ff([*ins, "-stream_loop", "-1", "-i", f"{VV}/trilha.mp3", "-i", "tmp/video.mp4",
    "-filter_complex", aud + f";[{n + 1}:v]ass=tmp/legenda.ass:fontsdir=../fontes[v]", "-map", "[v]", "-map", "[a]", "-t", f"{total:.3f}",
    "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
    "demandou-pitch-v3.mp4"])
print("pronto", round(total, 1), "s", {k: round(v, 2) for k, v in INI.items()})
