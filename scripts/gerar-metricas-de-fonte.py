"""
Gera `lib/media/metricas-de-fonte.ts` a partir dos arquivos de fonte do worker.

## Por que a largura precisa ser EXATA e nao estimada

A legenda dos cortes e dimensionada linha a linha: cada linha entra no maior
corpo que ainda cabe na largura util. Para isso e preciso saber quanto uma
linha mede ANTES de desenhar, e o ASS nao tem ajuste automatico.

Uma media por caractere nao serve. Medido em 24/08 sobre as 4.529 palavras da
gravacao real: na PT Serif a media e 0,532 em por caractere e a pior palavra da
0,754, ou seja 42% acima. Dimensionar pela media faria a palavra "errada" sair
42% mais larga que o previsto, passando da tela justamente no caso que a conta
existe para evitar.

Com a tabela de avancos por caractere a conta e exata para qualquer texto
latino, e o unico erro que sobra e o kerning, que em fonte de legenda e
desprezivel e sempre para MENOS.

## Como rodar

    python scripts/gerar-metricas-de-fonte.py

Rode de novo sempre que uma fonte entrar, sair ou mudar de versao em
`worker/fontes`. O arquivo gerado vai para o repositorio de proposito: assim o
app nao precisa ler TTF em tempo de execucao nem carregar as fontes na Vercel.
"""

import json
import struct
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FONTES = {
    "PT Serif": "PT_Serif-Bold.ttf",
    "Anton": "Anton-Regular.ttf",
    "Liberation Sans": "LiberationSans-Bold.ttf",
    "Bangers": "Bangers-Regular.ttf",
}

# Latin-1 imprimivel mais o que aparece em transcricao em portugues. Fora
# disso, quem usa a tabela cai na largura media, que e o comportamento certo
# para um caractere raro.
CARACTERES = (
    [chr(c) for c in range(0x20, 0x7F)]
    + [chr(c) for c in range(0xA0, 0x180)]
    + list("‘’“”–—…")
)


def tabelas(d):
    n = struct.unpack(">H", d[4:6])[0]
    t = {}
    for i in range(n):
        p = 12 + 16 * i
        t[d[p : p + 4]] = struct.unpack(">II", d[p + 8 : p + 16])
    return t


def ler(path):
    d = path.read_bytes()
    t = tabelas(d)
    ho, _ = t[b"head"]
    upem = struct.unpack(">H", d[ho + 18 : ho + 20])[0]
    hh, _ = t[b"hhea"]
    num_h = struct.unpack(">H", d[hh + 34 : hh + 36])[0]
    hm, _ = t[b"hmtx"]
    adv = [struct.unpack(">H", d[hm + 4 * i : hm + 4 * i + 2])[0] for i in range(num_h)]

    co, _ = t[b"cmap"]
    n = struct.unpack(">H", d[co + 2 : co + 4])[0]
    melhor = None
    for i in range(n):
        p = co + 4 + 8 * i
        pid, eid, so = struct.unpack(">HHI", d[p : p + 8])
        if (pid, eid) in ((3, 1), (3, 10), (0, 3), (0, 4)):
            melhor = co + so
    fmt = struct.unpack(">H", d[melhor : melhor + 2])[0]
    mapa = {}
    if fmt == 4:
        segX2 = struct.unpack(">H", d[melhor + 6 : melhor + 8])[0]
        seg = segX2 // 2
        endo = melhor + 14
        starto = endo + segX2 + 2
        deltao = starto + segX2
        rangeo = deltao + segX2
        for i in range(seg):
            fim = struct.unpack(">H", d[endo + 2 * i : endo + 2 * i + 2])[0]
            ini = struct.unpack(">H", d[starto + 2 * i : starto + 2 * i + 2])[0]
            delta = struct.unpack(">h", d[deltao + 2 * i : deltao + 2 * i + 2])[0]
            ro = struct.unpack(">H", d[rangeo + 2 * i : rangeo + 2 * i + 2])[0]
            if ini == 0xFFFF:
                continue
            for ch in range(ini, min(fim, 0x2FFF) + 1):
                if ro == 0:
                    g = (ch + delta) & 0xFFFF
                else:
                    gp = rangeo + 2 * i + ro + 2 * (ch - ini)
                    if gp + 2 > len(d):
                        continue
                    g = struct.unpack(">H", d[gp : gp + 2])[0]
                    if g:
                        g = (g + delta) & 0xFFFF
                if g:
                    mapa[ch] = g
    else:
        raise SystemExit(f"{path.name}: formato de cmap {fmt} nao tratado")

    def avanco(ch):
        g = mapa.get(ord(ch))
        if g is None:
            return None
        return (adv[g] if g < len(adv) else adv[-1]) / upem

    return avanco


def main():
    pasta = RAIZ / "worker" / "fontes"
    blocos = []
    for nome, arquivo in FONTES.items():
        avanco = ler(pasta / arquivo)
        larguras = {}
        for ch in CARACTERES:
            a = avanco(ch)
            if a is not None:
                larguras[ch] = round(a, 4)
        media = round(sum(larguras.values()) / len(larguras), 4)
        # json.dumps e nao repr: a chave precisa de aspas e escape de JSON,
        # e repr entrega aspas simples e deixa a propria aspa dupla crua, o
        # que gera TypeScript que nao compila.
        pares = "".join(
            f"    {json.dumps(ch)}: {v},\n" for ch, v in sorted(larguras.items())
        )
        blocos.append(
            f'  "{nome}": {{\n'
            f"    /** Largura de um caractere desconhecido. */\n"
            f"    media: {media},\n"
            f"    porCaractere: {{\n{pares}    }},\n"
            f"  }},"
        )

    saida = RAIZ / "lib" / "media" / "metricas-de-fonte.ts"
    saida.write_text(
        "// GERADO por scripts/gerar-metricas-de-fonte.py. Nao editar a mao.\n"
        "//\n"
        "// A largura de avanco de cada caractere, em fracoes do corpo da fonte,\n"
        "// tirada da tabela hmtx dos arquivos em worker/fontes. Serve para saber\n"
        "// quanto uma linha de legenda vai medir ANTES de desenhar, que e o que\n"
        "// permite dar a cada linha o maior corpo que ainda cabe na tela.\n"
        "//\n"
        "// Media por caractere nao resolveria: medido nas 4.529 palavras da\n"
        "// gravacao real, a pior palavra da PT Serif e 42% mais larga que a media,\n"
        "// e dimensionar pela media estouraria a tela exatamente no caso que a\n"
        "// conta existe para evitar.\n\n"
        "export type MetricaDeFonte = {\n"
        "  media: number;\n"
        "  porCaractere: Record<string, number>;\n"
        "};\n\n"
        "export const METRICAS: Record<string, MetricaDeFonte> = {\n"
        + "\n".join(blocos)
        + "\n};\n\n"
        "/** Largura de um texto, em fracoes do corpo da fonte. */\n"
        "export function larguraEmCorpos(texto: string, fonte: string): number {\n"
        "  const m = METRICAS[fonte];\n"
        "  // Sem metrica da fonte, um palpite largo e melhor que um estreito: ele\n"
        "  // encolhe a legenda a toa, e a alternativa estoura a tela.\n"
        "  if (!m) return texto.length * 0.62;\n"
        "  let total = 0;\n"
        "  for (const ch of texto) total += m.porCaractere[ch] ?? m.media;\n"
        "  return total;\n"
        "}\n",
        encoding="utf-8",
    )
    print(f"escrito: {saida.relative_to(RAIZ)}")
    for nome in FONTES:
        print(f"  {nome}")


if __name__ == "__main__":
    main()
