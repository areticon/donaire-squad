import sharp from "sharp";
import { ImageResponse } from "@vercel/og";
import { destaqueDaFrase, fontesDaArte, fontesDoSatori, TAMANHO_DA_PROPORCAO, type MarcaDaArte } from "@/lib/media/arte-com-frase";
import type { ConteudoDoInfografico } from "@/lib/media/infographic";
import type { ProporcaoPedida } from "@/lib/media/formatos-das-redes";
import { planejarInfografico, tituloDaFamilia, tituloDaTipografia, type FamiliaDoInfografico } from "@/lib/media/plano-do-infografico";
import type { BlocoMedido } from "@/lib/media/caber-texto";

/**
 * O INFOGRÁFICO MONTADO EM CÓDIGO (30/09/2026).
 *
 * Duas saídas foram consideradas para o infográfico depois da regra "texto em
 * arte gerada por IA é sempre código":
 *
 *   (a) montar em código: os dados já saem estruturados da extração (título,
 *       subtítulo, seções, número de destaque, números-chave), e um template
 *       com a marca desenha;
 *   (b) deixar o modelo de imagem desenhar e conferir por visão cada palavra.
 *
 * Ficou a (a). A (b) só reduz a chance do erro, e a sexta do teste de 30/09
 * mostra por quê: o infográfico tinha título e números certos e, num balão de
 * fala desenhado pelo modelo, "Usar chocoers maxsto fbite". Um revisor por
 * visão que lê imagem de 1200 pixels deixaria passar um balão desses com
 * frequência, e cada nova tentativa custa outra geração. Em código o erro de
 * escrita não existe, a geração custa zero e a marca (cores, fontes, família
 * da linguagem) sai igual em todo infográfico.
 *
 * O que se perde é a ilustração: o template usa formas, números grandes e a
 * cor da marca, e nenhum desenho do modelo. Para infográfico isso é ganho: é
 * a peça em que o dado tem de ser lido, e não a cena.
 *
 * 06/10/2026: o desenho só PINTA o plano (lib/media/plano-do-infografico.ts).
 * Cada texto sai nas linhas medidas e na altura medida, com `flexShrink: 0`:
 * o Satori não encolhe caixa abaixo do texto nem quebra linha por conta
 * própria, e por isso nada fica por cima de nada nem é cortado no meio.
 */
/** A luz de uma cor (0 escuro, 1 claro), para a tinta suave contrastar com o fundo aprovado. */
function luz(hex: string): number {
  const c = hex.replace("#", "");
  const h = c.length === 3 ? c.split("").map((x) => x + x).join("") : c.slice(0, 6);
  const v = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return Number.isFinite(v(0)) ? 0.299 * v(0) + 0.587 * v(2) + 0.114 * v(4) : 1;
}

export async function montarInfograficoEmCodigo(c: ConteudoDoInfografico, marca: MarcaDaArte, proporcao: ProporcaoPedida): Promise<Buffer> {
  const { largura: W, altura: H } = TAMANHO_DA_PROPORCAO[proporcao];
  const familia = marca.familia as FamiliaDoInfografico;
  const { acento, escuro, claro } = marca.cores;
  const f = await fontesDaArte();
  // A IDENTIDADE APROVADA MANDA (06/10): com ela, o fundo é o papel "fundo"
  // aprovado, a letra é o papel "título" e o título sai na família da letra
  // aprovada. Antes o infográfico só olhava a família herdada do estilo de
  // VÍDEO (Vox virava "colagem" em papel creme) e ignorava a aprovação.
  const papeis = (marca.cores as { papeis?: { fundo: string; titulo: string; destaque: string } }).papeis;
  const aprovada = marca.identidadeAprovada === true && Boolean(papeis);
  const titulo = aprovada && marca.tipografia ? tituloDaTipografia(marca.tipografia) : tituloDaFamilia(familia);
  const p = planejarInfografico(c, familia, W, H, titulo);
  const { m, u } = p;

  const fundoPadrao = familia === "impacto" ? escuro : familia === "colagem" ? claro : "#fbfaf7";
  const fundo = aprovada ? papeis!.fundo : fundoPadrao;
  const fundoEscuro = luz(fundo) < 0.45;
  const tinta = aprovada ? papeis!.titulo : familia === "impacto" ? "#ffffff" : escuro;
  const tintaSuave = fundoEscuro ? "rgba(255,255,255,0.78)" : "rgba(20,20,20,0.72)";
  const fundoDoCartao = fundoEscuro ? "rgba(255,255,255,0.07)" : familia === "colagem" ? "#ffffff" : familia === "impacto" ? "rgba(0,0,0,0.05)" : "transparent";
  const fonteDoTitulo = titulo.fonte === "PT Serif" ? "Serif" : titulo.fonte === "Liberation Sans" ? "Sans" : "Anton";
  const destaqueDoTitulo = destaqueDaFrase(p.titulo.linhas.join(" "));

  /** As linhas de um bloco medido, uma div por linha, na altura medida. */
  const linhas = (b: BlocoMedido, estilo: Record<string, unknown>, chave: string) =>
    b.linhas.map((l, i) => (
      <div key={`${chave}-${i}`} style={{ display: "flex", flexShrink: 0, height: b.altura / Math.max(1, b.linhas.length), fontSize: b.corpo, lineHeight: 1, alignItems: "center", whiteSpace: "nowrap", ...estilo }}>
        {l}
      </div>
    ));

  const palavraDoTitulo = (w: string, i: number, ultima: boolean) => {
    const eh = w === destaqueDoTitulo;
    const mr = ultima ? 0 : p.titulo.espaco;
    if (eh && familia === "colagem") {
      return (
        <div key={i} style={{ display: "flex", position: "relative", marginRight: mr }}>
          <div style={{ position: "absolute", left: -6, right: -6, top: p.titulo.corpo * 0.3, bottom: 2, background: acento, opacity: 0.9, transform: "rotate(-1.5deg)" }} />
          <span style={{ position: "relative" }}>{w}</span>
        </div>
      );
    }
    return (
      <span key={i} style={{ marginRight: mr, color: eh ? acento : undefined }}>
        {w}
      </span>
    );
  };

  const k = p.cartoes;
  const cartao = (i: number) => {
    const it = k.itens[i];
    return (
      <div
        key={i}
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
          width: k.largura,
          height: k.altura,
          margin: k.margem,
          padding: `${k.padV}px ${k.padH}px`,
          background: fundoDoCartao,
          borderRadius: familia === "colagem" ? 4 : 14 * u,
          borderTop: familia === "sobrio" ? `${k.bordaTopo}px solid ${acento}` : "none",
          boxShadow: familia === "colagem" ? "0 8px 22px rgba(0,0,0,0.12)" : "none",
          transform: familia === "colagem" ? `rotate(${i % 2 ? 0.8 : -0.8}deg)` : "rotate(0deg)",
        }}
      >
        <div style={{ display: "flex", flexShrink: 0, alignItems: "center", height: it.titulo.altura, marginBottom: it.numero || it.texto.linhas.length ? it.titulo.depois : 0 }}>
          <div
            style={{
              display: "flex",
              flexShrink: 0,
              width: k.circulo,
              height: k.circulo,
              borderRadius: 999,
              background: acento,
              color: "#111111",
              fontFamily: "Anton",
              fontSize: 28 * u,
              alignItems: "center",
              justifyContent: "center",
              marginRight: k.gapCirculo,
            }}
          >
            {String(i + 1)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
            {linhas(it.titulo, { fontFamily: "Sans", fontWeight: 700, color: tinta }, `t${i}`)}
          </div>
        </div>
        {it.numero ? (
          <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, height: it.numero.altura, marginBottom: it.texto.linhas.length ? it.numero.depois : 0 }}>
            {linhas(it.numero, { fontFamily: "Anton", color: acento }, `n${i}`)}
          </div>
        ) : null}
        {it.texto.linhas.length ? (
          <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, height: it.texto.altura }}>
            {linhas(it.texto, { fontFamily: "Sans", fontWeight: 400, color: tintaSuave }, `p${i}`)}
          </div>
        ) : null}
      </div>
    );
  };

  const fileiras: number[][] = [];
  for (let i = 0; i < k.itens.length; i += k.colunas) fileiras.push(k.itens.slice(i, i + k.colunas).map((_, j) => i + j));

  const d = p.destaque;
  const numeroEmLinhas = (n: { linhas: string[]; corpo: number; altura: number }, cor: string, chave: string) => (
    <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, height: n.altura }}>
      {n.linhas.map((l, i) => (
        <div key={`${chave}-${i}`} style={{ display: "flex", flexShrink: 0, height: n.corpo, fontFamily: "Anton", fontSize: n.corpo, lineHeight: 1, color: cor, whiteSpace: "nowrap" }}>
          {l}
        </div>
      ))}
    </div>
  );

  const resposta = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: fundo, padding: m, position: "relative" }}>
        {familia === "impacto" && <div style={{ position: "absolute", left: 0, top: 0, width: W, height: 10 * u, background: acento }} />}
        {familia === "colagem" && <div style={{ display: "flex", flexShrink: 0, width: 110 * u, height: 12 * u, background: escuro, marginBottom: 16 * u }} />}
        {familia === "sobrio" && <div style={{ display: "flex", flexShrink: 0, width: 120 * u, height: 5 * u, background: acento, marginBottom: 18 * u }} />}
        {p.titulo.linhas.map((l, li) => {
          const ws = l.split(" ");
          return (
            <div key={li} style={{ display: "flex", flexShrink: 0, height: p.titulo.corpo * p.titulo.entrelinha, alignItems: "center", fontFamily: fonteDoTitulo, fontWeight: 700, fontSize: p.titulo.corpo, color: tinta, lineHeight: 1, whiteSpace: "nowrap" }}>
              {ws.map((w, wi) => palavraDoTitulo(w, li * 30 + wi, wi === ws.length - 1))}
            </div>
          );
        })}
        {p.subtitulo ? (
          <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, height: p.subtitulo.bloco.altura, marginTop: p.subtitulo.mt, marginBottom: p.subtitulo.mb }}>
            {linhas(p.subtitulo.bloco, { fontFamily: "Sans", fontWeight: 400, color: tintaSuave }, "sub")}
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: p.destaqueAoLado ? "row" : "column", flex: 1, marginTop: 6 * u }}>
          {d && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                flexShrink: 0,
                width: d.largura,
                height: d.altura,
                margin: d.margem,
                padding: d.pad,
                background: acento,
                borderRadius: familia === "colagem" ? 4 : 14 * u,
                transform: familia === "colagem" ? "rotate(-1.5deg)" : "rotate(0deg)",
              }}
            >
              {numeroEmLinhas(d.valor, "#111111", "dv")}
              <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, height: d.rotulo.altura, marginTop: 8 * u }}>
                {linhas(d.rotulo, { fontFamily: "Sans", fontWeight: 700, color: "#111111" }, "dr")}
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            {fileiras.map((fileira, fi) => (
              <div key={fi} style={{ display: "flex", flexDirection: "row", flexShrink: 0 }}>
                {fileira.map((i) => cartao(i))}
              </div>
            ))}
          </div>
        </div>
        {p.rodape && (
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              flexShrink: 0,
              alignItems: "flex-start",
              marginTop: p.rodape.mt,
              paddingTop: p.rodape.pt,
              borderTop: `${p.rodape.borda}px solid ${fundoEscuro ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)"}`,
            }}
          >
            {p.rodape.itens.map((n, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1, marginRight: i < p.rodape!.itens.length - 1 ? p.rodape!.gap : 0 }}>
                {numeroEmLinhas(n.valor, acento, `rv${i}`)}
                <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, height: n.rotulo.altura, marginTop: 4 * u }}>
                  {linhas(n.rotulo, { fontFamily: "Sans", fontWeight: 700, color: tinta }, `rr${i}`)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    { width: W, height: H, fonts: fontesDoSatori(f) }
  );
  const png = Buffer.from(await resposta.arrayBuffer());
  return sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}
