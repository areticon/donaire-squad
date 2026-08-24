"""
Prova, na CONSTRUCAO da imagem, que cada fonte dos estilos existe de verdade.

## Por que isto precisa existir

O libass NAO falha quando a fonte pedida nao esta instalada. Ele escolhe outra
em silencio e desenha. O video sai valido, com texto legivel, e ninguem percebe.

Foi exatamente o que aconteceu ate 24/08. O estilo do video completo pedia
Arial; o conteiner Debian nao tem nenhuma fonte da Microsoft e tinha so a
familia DejaVu, que entrou de carona numa dependencia. Verificado no quadro do
video de producao: a legenda estava la, desenhada em DejaVu Sans Bold. Com os
quatro estilos de edicao isso fica pior que um detalhe, porque os quatro sairiam
com a MESMA tipografia e a escolha do cliente nao mudaria nada na tela.

## Como a prova funciona

O libass registra a decisao no log: `fontselect: (FAMILIA, peso, italico) -> ...`
e no fim da linha vem o nome do que ele REALMENTE abriu. Se o nome que saiu for
diferente do que entrou, houve substituicao. Aqui isso derruba a construcao, e
o problema aparece no build em vez de virar um video com a fonte errada.

Mesma ideia da prova do MediaPipe logo acima no Dockerfile: fazer o que o
produto faz, e nao uma versao mais facil.
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

# Precisa bater com `lib/media/estilos.ts`. Uma fonte que sai de la e nao sai
# daqui volta a ser substituida em silencio.
FONTES = ["PT Serif", "Anton", "Liberation Sans", "Bangers"]

MODELO = """[Script Info]
ScriptType: v4.00+
PlayResX: 640
PlayResY: 200

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: P,{fonte},48,&H00FFFFFF,&H00000000,&H00000000,{negrito},1,3,0,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,P,,0,0,0,,Acao e coracao, gestao
"""


def provar(fonte: str, negrito: int) -> None:
    with tempfile.TemporaryDirectory() as pasta:
        alvo = Path(pasta) / "p.ass"
        alvo.write_text(MODELO.format(fonte=fonte, negrito=negrito), encoding="utf-8")
        r = subprocess.run(
            ["ffmpeg", "-v", "info", "-f", "lavfi",
             "-i", "color=c=black:s=640x200:d=0.1",
             "-vf", f"subtitles={alvo.name}", "-frames:v", "1", "-f", "null", "-"],
            cwd=pasta, capture_output=True, text=True,
        )
        log = r.stderr
        if r.returncode != 0:
            raise SystemExit(f"ffmpeg falhou com {fonte}:\n{log[-800:]}")

        linhas = [l for l in log.splitlines() if "fontselect" in l]
        if not linhas:
            raise SystemExit(
                f"{fonte}: o libass nao registrou fontselect, entao nao da para "
                f"provar nada. Log:\n{log[-800:]}"
            )

        # `fontselect: (Anton, 400, 0) -> /caminho/Anton-Regular.ttf, 0, Anton`
        for l in linhas:
            m = re.search(r"fontselect:\s*\(([^,]+),.*->\s*(.+)$", l)
            if not m:
                continue
            pedida, resultado = m.group(1).strip(), m.group(2).strip()
            if resultado.lower().startswith("none") or "not found" in l.lower():
                raise SystemExit(f"{fonte}: o libass nao achou fonte nenhuma. {l}")
            entregue = resultado.split(",")[-1].strip()
            # Compara sem espaco e por prefixo, porque o libass registra o nome
            # PostScript e nao o da familia: "PT Serif" volta como
            # "PTSerif-Bold" e "Liberation Sans" como "LiberationSans-Bold".
            # Comparacao exata acusaria substituicao onde nao houve; prefixo
            # ainda recusa a troca de verdade, porque "DejaVuSans-Bold" nao
            # comeca com "ptserif".
            def achatar(t):
                return t.lower().replace(" ", "").replace("_", "")
            if not achatar(entregue).startswith(achatar(pedida)):
                raise SystemExit(
                    f"SUBSTITUICAO SILENCIOSA: o estilo pede '{pedida}' e o "
                    f"conteiner entregou '{entregue}'. Instale a fonte no "
                    f"Dockerfile ou corrija o nome em lib/media/estilos.ts.\n{l}"
                )
            print(f"  ok  {pedida} -> {entregue}")
            return
        raise SystemExit(f"{fonte}: nao consegui ler a linha do fontselect:\n{linhas}")


if __name__ == "__main__":
    print("provando as fontes dos estilos de edicao:")
    for f in FONTES:
        # Negrito de verdade e negrito sintetizado escolhem faces diferentes, e
        # os dois precisam resolver, porque o estilo escolhe um ou outro.
        provar(f, 0)
        provar(f, -1)
    print("todas as fontes existem, nenhuma substituicao", file=sys.stderr)
