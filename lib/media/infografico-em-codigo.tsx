import sharp from "sharp";
import { ImageResponse } from "@vercel/og";
import { destaqueDaFrase, encaixarFrase, fontesDaArte, fontesDoSatori, TAMANHO_DA_PROPORCAO, type MarcaDaArte } from "@/lib/media/arte-com-frase";
import type { ConteudoDoInfografico } from "@/lib/media/infographic";
import type { ProporcaoPedida } from "@/lib/media/formatos-das-redes";

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
 */
export async function montarInfograficoEmCodigo(c: ConteudoDoInfografico, marca: MarcaDaArte, proporcao: ProporcaoPedida): Promise<Buffer> {
  const { largura: W, altura: H } = TAMANHO_DA_PROPORCAO[proporcao];
  const { familia } = marca;
  const { acento, escuro, claro } = marca.cores;
  const f = await fontesDaArte();
  const deitada = W / H > 1.2;
  const m = Math.round(Math.min(W, H) * 0.075);
  const u = Math.min(W, H) / 1000; // unidade de medida: tudo escala com o lado menor

  const fundo = familia === "impacto" ? escuro : familia === "colagem" ? claro : "#fbfaf7";
  const tinta = familia === "impacto" ? "#ffffff" : escuro;
  const tintaSuave = familia === "impacto" ? "rgba(255,255,255,0.78)" : "rgba(20,20,20,0.72)";
  const fundoDoCartao = familia === "impacto" ? "rgba(255,255,255,0.07)" : familia === "colagem" ? "#ffffff" : "transparent";
  const fonteDoTitulo = familia === "sobrio" ? "Serif" : "Anton";

  const secoes = (c.sections ?? []).slice(0, 4);
  const temDestaque = Boolean(c.highlight?.value && c.highlight?.label);
  // O número do destaque não se repete no rodapé (a sexta de 30/09 trazia
  // "72%" no bloco laranja e de novo embaixo).
  const numeros = (c.keyNumbers ?? [])
    .filter((n) => n.value && n.label && (!temDestaque || n.value.trim() !== c.highlight!.value.trim()))
    .slice(0, 3);

  // O título no maior corpo que cabe em duas linhas (três na peça em pé).
  const tituloCru = (c.title ?? "").trim();
  const titulo = familia === "sobrio" ? tituloCru : tituloCru.toUpperCase();
  const encaixe = encaixarFrase({
    frase: titulo,
    fonte: familia === "sobrio" ? "PT Serif" : "Anton",
    largura: W - 2 * m,
    altura: deitada ? H * 0.2 : H * 0.2,
    entrelinha: 1.1,
    corpoMaximo: Math.round((deitada ? 92 : 72) * u),
    folga: 0.3,
  });
  const destaque = destaqueDaFrase(titulo);

  // Grade das seções: em linha na peça deitada, 2x2 na peça em pé.
  const colunas = deitada ? Math.max(1, secoes.length) : secoes.length > 2 ? 2 : 1;
  // O corpo do texto sai do espaço que cada cartão tem: cartão largo e alto
  // com letra miúda deixava metade vazia (sexta, 30/09).
  const corpoDoTexto = Math.round((deitada ? (secoes.length > 3 ? 25 : 28) : secoes.length > 2 ? 21 : 30) * u);

  const palavraDoTitulo = (w: string, i: number) => {
    const eh = w === destaque;
    if (eh && familia === "colagem") {
      return (
        <div key={i} style={{ display: "flex", position: "relative", marginRight: encaixe.corpo * 0.26 }}>
          <div style={{ position: "absolute", left: -6, right: -6, top: encaixe.corpo * 0.3, bottom: 2, background: acento, opacity: 0.9, transform: "rotate(-1.5deg)" }} />
          <span style={{ position: "relative" }}>{w}</span>
        </div>
      );
    }
    return (
      <span key={i} style={{ marginRight: encaixe.corpo * 0.26, color: eh ? acento : undefined }}>
        {w}
      </span>
    );
  };

  const cartao = (s: ConteudoDoInfografico["sections"][number], i: number) => (
    <div
      key={i}
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        overflow: "hidden",
        flex: 1,
        margin: 8 * u,
        padding: familia === "sobrio" ? `${14 * u}px ${6 * u}px` : 22 * u,
        background: fundoDoCartao,
        borderRadius: familia === "colagem" ? 4 : 14 * u,
        borderTop: familia === "sobrio" ? `${5 * u}px solid ${acento}` : "none",
        boxShadow: familia === "colagem" ? "0 8px 22px rgba(0,0,0,0.12)" : "none",
        transform: familia === "colagem" ? `rotate(${i % 2 ? 0.8 : -0.8}deg)` : "rotate(0deg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 * u }}>
        <div
          style={{
            display: "flex",
            width: 46 * u,
            height: 46 * u,
            borderRadius: 999,
            background: acento,
            color: "#111111",
            fontFamily: "Anton",
            fontSize: 28 * u,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            marginRight: 12 * u,
            flexShrink: 0,
          }}
        >
          {String(i + 1)}
        </div>
        <div style={{ display: "flex", fontFamily: "Sans", fontWeight: 700, fontSize: corpoDoTexto * 1.08, color: tinta, lineHeight: 1.15 }}>{s.heading}</div>
      </div>
      {s.stat ? (
        <div style={{ display: "flex", fontFamily: "Anton", fontSize: corpoDoTexto * (deitada ? 1.9 : 1.6), color: acento, lineHeight: 1.05, marginBottom: 6 * u }}>{s.stat}</div>
      ) : null}
      <div style={{ display: "flex", fontFamily: "Sans", fontWeight: 400, fontSize: corpoDoTexto, color: tintaSuave, lineHeight: 1.3 }}>{s.body}</div>
    </div>
  );

  const linhasDeCartoes: Array<typeof secoes> = [];
  for (let i = 0; i < secoes.length; i += colunas) linhasDeCartoes.push(secoes.slice(i, i + colunas));

  const resposta = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: fundo, padding: m, position: "relative" }}>
        {familia === "impacto" && <div style={{ position: "absolute", left: 0, top: 0, width: W, height: 10 * u, background: acento }} />}
        {familia === "colagem" && <div style={{ display: "flex", width: 110 * u, height: 12 * u, background: escuro, marginBottom: 16 * u }} />}
        {familia === "sobrio" && <div style={{ display: "flex", width: 120 * u, height: 5 * u, background: acento, marginBottom: 18 * u }} />}
        {encaixe.linhas.map((l, li) => (
          <div key={li} style={{ display: "flex", fontFamily: fonteDoTitulo, fontSize: encaixe.corpo, color: tinta, lineHeight: 1.08 }}>
            {l.split(" ").map((w, wi) => palavraDoTitulo(w, li * 30 + wi))}
          </div>
        ))}
        {c.subtitle ? (
          <div style={{ display: "flex", fontFamily: "Sans", fontWeight: 400, fontSize: (deitada ? 24 : 27) * u, color: tintaSuave, marginTop: 12 * u, marginBottom: 14 * u, lineHeight: 1.3 }}>
            {c.subtitle}
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: deitada ? "row" : "column", flex: 1, marginTop: 6 * u }}>
          {temDestaque && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
        overflow: "hidden",
                width: deitada ? W * 0.2 : "auto",
                margin: 8 * u,
                padding: 22 * u,
                background: acento,
                borderRadius: familia === "colagem" ? 4 : 14 * u,
                transform: familia === "colagem" ? "rotate(-1.5deg)" : "rotate(0deg)",
              }}
            >
              <div style={{ display: "flex", fontFamily: "Anton", fontSize: (deitada ? 78 : 80) * u, color: "#111111", lineHeight: 1 }}>{c.highlight!.value}</div>
              <div style={{ display: "flex", fontFamily: "Sans", fontWeight: 700, fontSize: corpoDoTexto, color: "#111111", marginTop: 8 * u, lineHeight: 1.25 }}>{c.highlight!.label}</div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            {linhasDeCartoes.map((linha, li) => (
              <div key={li} style={{ display: "flex", flexDirection: "row", flex: 1 }}>
                {linha.map((s, si) => cartao(s, li * colunas + si))}
              </div>
            ))}
          </div>
        </div>
        {numeros.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              marginTop: 12 * u,
              paddingTop: 14 * u,
              borderTop: `${3 * u}px solid ${familia === "impacto" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)"}`,
            }}
          >
            {numeros.map((n, i) => (
              <div key={i} style={{ display: "flex", flex: 1, alignItems: "center", marginRight: 12 * u }}>
                <div style={{ display: "flex", fontFamily: "Anton", fontSize: (deitada ? 40 : 44) * u, color: acento, marginRight: 12 * u }}>{n.value}</div>
                <div style={{ display: "flex", fontFamily: "Sans", fontWeight: 700, fontSize: corpoDoTexto * 0.95, color: tinta, lineHeight: 1.2 }}>{n.label}</div>
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
