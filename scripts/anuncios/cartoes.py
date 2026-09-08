# -*- coding: utf-8 -*-
"""
Cartoes de texto dos anuncios da Demandou.

Existe porque a gravacao de 04/09 saiu muda (o OBS nao pegou o microfone) e
anuncio em feed roda mudo de qualquer jeito: quem explica o produto e o texto
na tela, nao a narracao. A identidade sai do codigo do app (app/globals.css) e
o monograma e o arquivo oficial, nunca redesenhado.
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont

BG = (0x1e, 0x1e, 0x25)
LARANJA = (0xef, 0x61, 0x22)
TEXTO = (0xf2, 0xf3, 0xf6)
FRACO = (0x95, 0x99, 0xa6)
MARCA = "C:/Users/devan/opensquad-app/public/brand-mark-on-dark.png"
MONT = "fontes/Montserrat.ttf"
INTER = "fontes/Inter.ttf"


def fonte(caminho, tamanho, variacao):
    f = ImageFont.truetype(caminho, tamanho)
    f.set_variation_by_name(variacao)
    return f


def quebrar(texto, f, largura, d):
    linhas, atual = [], ""
    for p in texto.split():
        teste = (atual + " " + p).strip()
        if d.textlength(teste, font=f) <= largura:
            atual = teste
        else:
            if atual:
                linhas.append(atual)
            atual = p
    if atual:
        linhas.append(atual)
    return linhas


def fundo(w, h):
    """Fundo da marca com um brilho laranja de canto, bem discreto."""
    im = Image.new("RGB", (w, h), BG)
    # Mascara borrada, e nao circulos empilhados: sem o borrao a soma dos
    # circulos deixa uma borda visivel, que na tela cheia parece defeito.
    brilho = Image.new("L", (w, h), 0)
    r = int(w * 0.40)
    ImageDraw.Draw(brilho).ellipse([-r, -r, r, r], fill=26)
    brilho = brilho.filter(ImageFilter.GaussianBlur(int(w * 0.09)))
    im.paste(Image.new("RGB", (w, h), LARANJA), (0, 0), brilho)
    return im


def assinatura(im, d, x, y, altura, cor_texto=TEXTO):
    """O bloco de marca: monograma mais 'demandou.' e 'postou.', como na navbar."""
    marca = Image.open(MARCA).convert("RGBA")
    m = marca.resize((altura, altura), Image.LANCZOS)
    im.paste(m, (x, y), m)
    fnome = fonte(MONT, int(altura * 0.62), "Bold")
    fsub = fonte(INTER, int(altura * 0.34), "Regular")
    tx = x + altura + int(altura * 0.28)
    d.text((tx, y + int(altura * 0.08)), "demandou.", font=fnome, fill=cor_texto)
    d.text((tx, y + int(altura * 0.72)), "postou.", font=fsub, fill=FRACO)


def cartao(w, h, titulo, sub=None, saida="cartao.png"):
    im = fundo(w, h)
    d = ImageDraw.Draw(im)
    margem = int(w * 0.085)
    ft = fonte(MONT, int(w * 0.058), "ExtraBold")
    fs = fonte(INTER, int(w * 0.026), "Regular")
    linhas = quebrar(titulo, ft, w - 2 * margem, d)
    alt_linha = int(w * 0.072)
    bloco = len(linhas) * alt_linha + (int(w * 0.05) + int(w * 0.036) if sub else 0)
    y = (h - bloco) // 2
    d.rectangle([margem, y - int(w * 0.045), margem + int(w * 0.062), y - int(w * 0.045) + int(w * 0.005)], fill=LARANJA)
    for ln in linhas:
        d.text((margem, y), ln, font=ft, fill=TEXTO)
        y += alt_linha
    if sub:
        y += int(w * 0.018)
        for ln in quebrar(sub, fs, w - 2 * margem, d):
            d.text((margem, y), ln, font=fs, fill=FRACO)
            y += int(w * 0.036)
    assinatura(im, d, margem, h - margem - int(w * 0.032), int(w * 0.032))
    im.save(saida)
    return saida


def cartao_final(w, h, saida="final.png"):
    """O ultimo quadro: marca grande, endereco e o convite."""
    im = fundo(w, h)
    d = ImageDraw.Draw(im)
    marca = Image.open(MARCA).convert("RGBA")
    lado = int(w * 0.13)
    m = marca.resize((lado, lado), Image.LANCZOS)
    fnome = fonte(MONT, int(w * 0.075), "ExtraBold")
    fsub = fonte(INTER, int(w * 0.028), "Regular")
    fend = fonte(MONT, int(w * 0.038), "Bold")
    frase = "Grave uma vez. Publique a semana inteira."
    bloco = lado + int(w * 0.05) + int(w * 0.085) + int(w * 0.05) + int(w * 0.045) + int(w * 0.07)
    y = (h - bloco) // 2
    im.paste(m, ((w - lado) // 2, y), m)
    y += lado + int(w * 0.035)
    t = "demandou."
    d.text(((w - d.textlength(t, font=fnome)) / 2, y), t, font=fnome, fill=TEXTO)
    y += int(w * 0.105)
    for ln in quebrar(frase, fsub, int(w * 0.8), d):
        d.text(((w - d.textlength(ln, font=fsub)) / 2, y), ln, font=fsub, fill=FRACO)
        y += int(w * 0.04)
    y += int(w * 0.03)
    end = "demandou.com"
    lg = d.textlength(end, font=fend)
    pad_x, pad_y = int(w * 0.035), int(w * 0.018)
    cx = (w - lg) / 2
    d.rounded_rectangle([cx - pad_x, y - pad_y, cx + lg + pad_x, y + int(w * 0.045) + pad_y],
                        radius=int(w * 0.014), fill=LARANJA)
    d.text((cx, y), end, font=fend, fill=(0xff, 0xff, 0xff))
    y += int(w * 0.045) + pad_y + int(w * 0.035)
    conv = "7 dias grátis para testar"
    d.text(((w - d.textlength(conv, font=fsub)) / 2, y), conv, font=fsub, fill=FRACO)
    im.save(saida)
    return saida


if __name__ == "__main__":
    cartao(1920, 1080, "Você grava uma vez por semana.", "O resto acontece sem você.", "amostra-169.png")
    cartao_final(1920, 1080, "amostra-final.png")
    print("ok")
