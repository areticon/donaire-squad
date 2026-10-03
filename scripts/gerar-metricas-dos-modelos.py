"""
Gera `lib/modelos-de-arte/metricas.ts` a partir das fontes do book de modelos
(lib/media/fontes-da-capa/modelos, Google Fonts, licença OFL).

A prévia (navegador) e a arte de verdade (Satori, no servidor) encaixam o texto
pela MESMA conta, com a largura de cada caractere tirada da tabela hmtx. É isso
que faz a arte gerada quebrar a frase nas mesmas linhas que a prévia mostrou.

    python scripts/gerar-metricas-dos-modelos.py
"""

import json
from pathlib import Path
from fontTools.ttLib import TTFont

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "lib" / "media" / "fontes-da-capa" / "modelos"
SAIDA = RAIZ / "lib" / "modelos-de-arte" / "metricas.ts"

CARACTERES = [chr(c) for c in range(32, 127)] + list("áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ“”‘’…•ªº°€")

metricas = {}
for arq in sorted(PASTA.glob("*.ttf")):
    f = TTFont(arq)
    upm = f["head"].unitsPerEm
    cmap = f.getBestCmap()
    hmtx = f["hmtx"]
    por = {}
    for c in CARACTERES:
        g = cmap.get(ord(c))
        if g is None:
            continue
        por[c] = round(hmtx[g][0] / upm, 4)
    media = round(sum(por[c] for c in "abcdefghijklmnopqrstuvwxyz" if c in por) / 26, 4)
    metricas[arq.stem] = {"media": media, "porCaractere": por}

linhas = [
    "// GERADO por scripts/gerar-metricas-dos-modelos.py. Não editar à mão.",
    "// Largura de avanço de cada caractere, em frações do corpo, das fontes do book",
    "// de modelos (lib/media/fontes-da-capa/modelos). Usada pela prévia e pela arte.",
    "",
    "export const METRICAS_DOS_MODELOS: Record<string, { media: number; porCaractere: Record<string, number> }> = "
    + json.dumps(metricas, ensure_ascii=False, separators=(",", ":"))
    + ";",
    "",
]
SAIDA.parent.mkdir(parents=True, exist_ok=True)
SAIDA.write_text("\n".join(linhas), encoding="utf-8")
print("ok", len(metricas), "fontes ->", SAIDA)
