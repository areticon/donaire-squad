import React from "react";
import { Img } from "remotion";
import { corDoTexto, corFraca, escuroDoTema, estiloDoApoio, estiloDoTitulo, limitar, lista, luz, margens, misturar, posicionar, rgba, saiSuave, sobreOAcento, texto, vivo as vivoDe, type Ctx } from "../base";
import { acaso, brilho, Cantoneiras, entradaMola, EtiquetaHud, molaFisica, Palco, TextoCinetico, Vidro } from "../kit";

/**
 * AS PEÇAS DE TEXTO (03/10, segunda volta): toda frase entra palavra a
 * palavra, com o destaque que se desenha e a varredura de luz; as caixas são
 * de vidro de verdade (a gravação atrás desfoca) e as telas cheias têm palco.
 */

/** Um id estável da camada para sementes e filtros (a peça não recebe o id). */
export const semente = (c: Ctx) => Math.round((c.dur * 1000 + String(JSON.stringify(c.props)).length * 7) % 997);

/** O selo do rótulo: mono, com o losango de luz da marca. */
export function SeloVivo({ c, texto: t, estilo, atraso = 0 }: { c: Ctx; texto: string; estilo?: React.CSSProperties; atraso?: number }) {
  const { u, tema } = c;
  const e = saiSuave((c.t - atraso) / 0.35);
  const doc = tema.visual === "documental";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12 * u,
        fontFamily: tema.fonteMono,
        fontWeight: 500,
        fontSize: 20 * u,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: doc ? "#f4ead6" : "#e6edf6",
        padding: `${9 * u}px ${18 * u}px`,
        borderRadius: 999,
        background: doc ? "rgba(20,16,10,.55)" : "linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.03))",
        border: `${1 * u}px solid ${doc ? "rgba(255,240,210,.25)" : "rgba(255,255,255,.18)"}`,
        clipPath: `inset(0 ${(1 - e) * 100}% 0 0 round 999px)`,
        textShadow: "0 1px 6px rgba(0,0,0,.5)",
        ...estilo,
      }}
    >
      <i style={{ width: 9 * u, height: 9 * u, background: tema.acento, display: "inline-block", transform: "rotate(45deg)", boxShadow: brilho(tema.acento, u, 0.5) }} />
      {t}
    </div>
  );
}

/** TÍTULO COM HIERARQUIA: o selo, o título palavra a palavra no vidro que se abre, e o apoio. */
export function Titulo(c: Ctx) {
  if (c.vertical) return TituloSemTarja(c);
  const { props: p, u, vertical, tema } = c;
  const tam = Number(p.tamanho) || (vertical ? 66 : 74);
  const larg = vertical ? margens(c).largura : 1240 * u;
  const pos = texto(p.posicao, "topo-esquerda");
  const centro = pos === "centro";
  const abre = saiSuave(c.t / 0.4);
  const n = texto(p.titulo).split(/\s+/).length;
  return (
    <div style={{ ...posicionar(c, pos), opacity: c.fica, transform: `translateY(${(1 - c.fica) * 14 * u}px)` }}>
      <div style={{ maxWidth: larg, textAlign: centro ? "center" : "left", display: "flex", flexDirection: "column", alignItems: centro ? "center" : "flex-start" }}>
        {p.rotulo ? <SeloVivo c={c} texto={texto(p.rotulo)} estilo={{ marginBottom: 16 * u }} /> : null}
        <div style={{ ...entradaMola(c, 0, 26), clipPath: `inset(-40% ${(1 - abre) * 100}% -40% 0)` }}>
          <Vidro c={c} estilo={{ display: "inline-block", padding: `${24 * u}px ${36 * u}px ${26 * u}px ${42 * u}px` }}>
            {/* A barra de luz da marca na borda. */}
            <div style={{ position: "absolute", left: 0, top: 18 * u, bottom: 18 * u, width: 5 * u, borderRadius: 3 * u, background: tema.acento, boxShadow: brilho(tema.acento, u, 0.7), transform: `scaleY(${saiSuave((c.t - 0.15) / 0.35)})` }} />
            <div style={{ ...estiloDoTitulo(c, tam), color: corDoTexto(c) }}>
              <TextoCinetico c={c} texto={texto(p.titulo)} estilo={{}} inicio={0.18} atraso={Math.min(0.07, 0.5 / Math.max(1, n))} />
            </div>
            {p.apoio ? <div style={{ ...estiloDoApoio(c, tam * 0.4), marginTop: 12 * u, opacity: saiSuave((c.t - 0.55) / 0.4), transform: `translateY(${(1 - saiSuave((c.t - 0.55) / 0.4)) * 10 * u}px)` }}>{texto(p.apoio)}</div> : null}
          </Vidro>
        </div>
      </div>
    </div>
  );
}

/**
 * O TÍTULO NO CORTE 9:16 (03/10, segunda volta, pedido do dono: "tarjas
 * escuras com texto em cima da pessoa" eram o nível de antes): sem caixa, a
 * letra GRANDE palavra a palavra direto sobre a imagem, com a sombra funda que
 * a separa do fundo, o destaque na luz da marca e o fio de luz que corre
 * embaixo. O vidro só fica no selo.
 */
function TituloSemTarja(c: Ctx) {
  const { props: p, u, tema } = c;
  const m = margens(c);
  const txt = texto(p.titulo);
  const n = txt.split(/\s+/).length;
  const maior = Math.max(...txt.replace(/\*\*/g, "").split(/\s+/).map((w) => w.length), 4);
  const tam = Math.min(Number(p.tamanho) || 104, (m.largura / u) / (maior * (tema.caixaAlta ? 0.78 : 0.6)));
  const embaixo = texto(p.posicao) === "baixo";
  const linha = saiSuave((c.t - 0.2 - n * 0.06) / 0.5);
  return (
    <div style={{ position: "absolute", left: m.x, right: m.x, top: embaixo ? c.H * 0.63 : m.topo, opacity: c.fica, transform: `translateY(${(1 - c.fica) * 16 * u}px)`, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {p.rotulo ? <SeloVivo c={c} texto={texto(p.rotulo)} estilo={{ marginBottom: 16 * u }} /> : null}
      <div style={{ ...estiloDoTitulo(c, tam), color: "#ffffff", lineHeight: 1.02, textShadow: `0 ${4 * u}px ${2 * u}px rgba(0,0,0,.55), 0 ${10 * u}px ${36 * u}px rgba(0,0,0,.75), 0 0 ${3 * u}px rgba(0,0,0,.6)` }}>
        <TextoCinetico c={c} texto={txt} estilo={{}} inicio={0.1} atraso={Math.min(0.08, 0.6 / Math.max(1, n))} modo={tema.visual === "impacto" ? "estourar" : "subir"} semTraco />
      </div>
      <div style={{ marginTop: 14 * u, width: m.largura * 0.5 * linha, height: 5 * u, borderRadius: 3 * u, background: `linear-gradient(90deg, transparent, ${tema.acento}, transparent)`, boxShadow: brilho(tema.acento, u, 0.8) }} />
      {p.apoio ? <div style={{ ...estiloDoApoio(c, 40), color: "#f2f5fa", marginTop: 12 * u, textShadow: "0 3px 14px rgba(0,0,0,.85)", opacity: saiSuave((c.t - 0.6) / 0.4) }}>{texto(p.apoio)}</div> : null}
    </div>
  );
}

/** CAPÍTULO: o número grande em luz, a linha que corre e o título palavra a palavra. */
export function Capitulo(c: Ctx) {
  const { props: p, u, vertical, tema } = c;
  const m = margens(c);
  const s = molaFisica(c.t, 220, 15);
  const tam = vertical ? 96 : 110;
  return (
    <div style={{ position: "absolute", left: m.x, top: m.topo, display: "flex", alignItems: "center", gap: 26 * u, opacity: c.fica }}>
      <div style={{ position: "relative", width: tam * u, height: tam * u, transform: `scale(${0.3 + 0.7 * s}) rotate(${(1 - s) * -25}deg)`, opacity: limitar(c.t / 0.1) }}>
        <Vidro c={c} forte raio={26} estilo={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "Geist", fontWeight: 700, fontSize: tam * 0.56 * u, color: sobreOAcento(tema), textShadow: "0 2px 10px rgba(0,0,0,.25)" }}>{texto(p.numero, "1")}</span>
        </Vidro>
        <div style={{ position: "absolute", inset: -14 * u, borderRadius: 34 * u, border: `${2 * u}px solid ${rgba(tema.acento, 0.6 * (1 - saiSuave((c.t - 0.2) / 0.8)))}`, transform: `scale(${1 + saiSuave((c.t - 0.2) / 0.8) * 0.4})` }} />
      </div>
      <div style={{ ...entradaMola(c, 0.12, 20) }}>
        <Vidro c={c} estilo={{ padding: `${16 * u}px ${30 * u}px` }}>
          <EtiquetaHud c={c} texto={`Parte ${texto(p.numero, "1")}`} estilo={{ fontSize: 16 * u, marginBottom: 6 * u }} />
          <div style={{ ...estiloDoTitulo(c, vertical ? 48 : 56), color: corDoTexto(c) }}>
            <TextoCinetico c={c} texto={texto(p.titulo)} estilo={{}} inicio={0.25} />
          </div>
        </Vidro>
      </div>
    </div>
  );
}

/** RÓTULO INFERIOR: a barra de luz cresce, o vidro abre atrás dela, o nome sobe e a descrição é datilografada. */
export function RotuloInferior(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const m = margens(c);
  const barra = saiSuave(c.t / 0.3);
  const corpo = saiSuave((c.t - 0.12) / 0.45);
  const desc = texto(p.descricao);
  const letras = Math.floor(desc.length * limitar((c.t - 0.55) / 0.6));
  return (
    <div style={{ position: "absolute", left: m.x, top: vertical ? m.base - 250 * u : c.H - 330 * u, display: "flex", alignItems: "stretch", opacity: c.fica, transform: `translateX(${(1 - c.fica) * -30 * u}px)` }}>
      <div style={{ width: 8 * u, borderRadius: 4 * u, background: tema.acento, boxShadow: brilho(tema.acento, u, 0.8), transform: `scaleY(${barra})`, transformOrigin: "bottom", zIndex: 2 }} />
      <div style={{ clipPath: `inset(-30% ${(1 - corpo) * 100}% -30% 0)` }}>
        <Vidro c={c} raio={6} estilo={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: `${16 * u}px ${32 * u}px ${18 * u}px` }}>
          <div style={{ ...estiloDoTitulo(c, vertical ? 44 : 46), color: corDoTexto(c) }}>
            <TextoCinetico c={c} texto={texto(p.nome)} estilo={{}} inicio={0.2} varrer={false} />
          </div>
          {desc ? (
            <div style={{ ...estiloDoApoio(c, 24), fontFamily: tema.fonteMono, letterSpacing: "0.06em", marginTop: 8 * u, whiteSpace: "nowrap" }}>
              {desc.slice(0, letras)}
              <span style={{ opacity: letras < desc.length ? 1 : 0, color: tema.acento }}>▍</span>
            </div>
          ) : null}
        </Vidro>
      </div>
    </div>
  );
}

/** FRASE DE IMPACTO: a tese no palco, gigante, palavra a palavra, com a mira em volta. */
export function FraseImpacto(c: Ctx) {
  const { props: p, u, vertical, tema } = c;
  const tam = Number(p.tamanho) || (vertical ? 96 : 128);
  const n = texto(p.texto).split(/\s+/).length;
  const w = vertical ? c.W - 120 * u : Math.min(c.W - 240 * u, 1560 * u);
  return (
    <Palco c={c} semente={semente(c)}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: w, textAlign: "center", marginTop: vertical ? -260 * u : -40 * u }}>
          <Cantoneiras c={c} w={w} h={(vertical ? 420 : 380) * u} abre={(c.t - 0.3) / 0.5} />
          <div style={{ position: "relative", top: (vertical ? 210 : 190) * u, transform: "translateY(-50%)" }}>
            <div style={{ ...estiloDoTitulo(c, tam), color: tema.visual === "documental" ? "#f6efe2" : "#ffffff", textShadow: `0 ${6 * u}px ${30 * u}px rgba(0,0,0,.6)` }}>
              <TextoCinetico c={c} texto={texto(p.texto)} estilo={{}} inicio={0.3} atraso={Math.min(0.09, 0.7 / Math.max(1, n))} modo={tema.visual === "impacto" ? "estourar" : "subir"} />
            </div>
            {p.apoio ? <div style={{ ...estiloDoApoio(c, tam * 0.3), color: "rgba(230,236,245,.75)", marginTop: 26 * u, opacity: saiSuave((c.t - 0.9) / 0.5) }}>{texto(p.apoio)}</div> : null}
          </div>
        </div>
      </div>
    </Palco>
  );
}

/** PALAVRA-CHAVE: a palavra carimbada com mola, brilho e as linhas de velocidade. */
export function PalavraChave(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const m = margens(c);
  const s = molaFisica(c.t, 320, 14);
  const direita = texto(p.lado) === "direita";
  const linhas = saiSuave(c.t / 0.3) * (1 - saiSuave((c.t - 0.3) / 0.4));
  return (
    <div style={{ position: "absolute", top: vertical ? m.topo + 40 * u : c.H * 0.2, ...(direita ? { right: m.x } : { left: m.x }), opacity: limitar(c.t / 0.08) * c.fica, transform: `scale(${0.3 + 0.7 * s}) rotate(${(direita ? 3 : -3) * s}deg)`, transformOrigin: direita ? "right center" : "left center" }}>
      <svg width={600 * u} height={260 * u} style={{ position: "absolute", left: direita ? "auto" : -120 * u, right: direita ? -120 * u : "auto", top: -70 * u, overflow: "visible", opacity: linhas }}>
        {Array.from({ length: 9 }, (_, i) => {
          const y = 30 * u + i * 24 * u;
          const l = (60 + acaso(i, 3) * 160) * u;
          return <line key={i} x1={direita ? 600 * u - l : 0} y1={y} x2={direita ? 600 * u : l} y2={y} stroke={i % 3 ? "#ffffff" : tema.acento} strokeWidth={3 * u} strokeLinecap="round" opacity={0.7} />;
        })}
      </svg>
      <Vidro c={c} forte raio={tema.visual === "vidro" ? 18 : 10} estilo={{ padding: `${12 * u}px ${32 * u}px` }}>
        <div style={{ ...estiloDoTitulo(c, Math.min(vertical ? 96 : 80, (c.W - 2 * m.x - 80 * u) / u / Math.max(3, texto(p.texto).length * (tema.caixaAlta ? 0.86 : 0.64)))), whiteSpace: "nowrap", color: tema.visual === "documental" ? "#1b1a17" : sobreOAcento(tema), textShadow: tema.visual === "documental" ? "none" : "0 2px 12px rgba(0,0,0,.25)" }}>{texto(p.texto)}</div>
      </Vidro>
    </div>
  );
}

/** CITAÇÃO: no palco, as aspas de luz, a frase serifada palavra a palavra e o autor com o traço. */
export function Citacao(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const tam = vertical ? 66 : 70;
  const s = molaFisica(c.t - 0.15, 160, 14);
  const n = texto(p.texto).split(/\s+/).length;
  return (
    <Palco c={c} semente={semente(c)}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", maxWidth: vertical ? c.W - 120 * u : Math.min(c.W - 260 * u, 1500 * u), marginTop: vertical ? -280 * u : -40 * u, padding: `0 ${40 * u}px` }}>
          <div style={{ position: "absolute", left: -30 * u, top: -170 * u, fontFamily: "Playfair Display", fontWeight: 900, fontSize: 300 * u, lineHeight: 1, color: tema.acento, textShadow: brilho(tema.acento, u, 1.2), transform: `scale(${s}) rotate(${(1 - s) * -20}deg)`, opacity: limitar(c.t / 0.2) * 0.9 }}>“</div>
          <div style={{ ...estiloDoTitulo(c, tam), fontFamily: tema.visual === "impacto" ? tema.fonteTitulo : "Playfair Display", fontWeight: tema.visual === "impacto" ? tema.pesoTitulo : 600, textTransform: "none", color: "#f7f3ea", textShadow: `0 ${4 * u}px ${24 * u}px rgba(0,0,0,.6)` }}>
            <TextoCinetico c={c} texto={texto(p.texto)} estilo={{}} inicio={0.4} atraso={Math.min(0.06, 1.1 / Math.max(1, n))} />
          </div>
          {p.autor ? (
            <div style={{ marginTop: 30 * u, display: "flex", alignItems: "center", gap: 16 * u, opacity: saiSuave((c.t - 1.1) / 0.4) }}>
              <span style={{ width: 70 * u, height: 3 * u, background: tema.acento, display: "inline-block", boxShadow: brilho(tema.acento, u, 0.5), transform: `scaleX(${saiSuave((c.t - 1.1) / 0.5)})`, transformOrigin: "left" }} />
              <span style={{ ...estiloDoApoio(c, 28), fontFamily: tema.fonteMono, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(235,240,248,.8)" }}>{texto(p.autor)}</span>
            </div>
          ) : null}
        </div>
      </div>
    </Palco>
  );
}

/**
 * PERGAMINHO: no palco quente, o rolo se abre em perspectiva sob a luz de
 * vela, e o versículo aparece palavra a palavra, como tinta assentando.
 */
export function Pergaminho(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const larg = vertical ? c.W - 150 * u : 1150 * u;
  const altAberto = vertical ? 640 * u : 580 * u;
  const abre = saiSuave((c.t - 0.35) / 0.9);
  const alt = 34 * u + (altAberto - 34 * u) * abre;
  const tinta = "#3a2a17";
  const vela = 0.85 + 0.15 * Math.sin(c.t * 9) * Math.sin(c.t * 3.7);
  const palavras = texto(p.texto).replace(/\*\*/g, "").split(/\s+/).filter(Boolean);
  const ini = 1.05;
  const passo = Math.min(0.07, 1.4 / Math.max(1, palavras.length));
  const vareta = (topo: boolean) => (
    <div style={{ position: "absolute", left: -38 * u, right: -38 * u, height: 38 * u, [topo ? "top" : "bottom"]: -19 * u, borderRadius: 999, background: "linear-gradient(180deg,#9a6a3d,#5b3a1c 50%,#2a190b)", boxShadow: `0 ${10 * u}px ${22 * u}px rgba(0,0,0,.55), inset 0 ${2 * u}px 0 rgba(255,220,170,.35)` }}>
      <div style={{ position: "absolute", left: -10 * u, top: -6 * u, width: 30 * u, height: 50 * u, borderRadius: 999, background: "radial-gradient(circle at 40% 35%, #e3b46a, #7a4b1f 70%)" }} />
      <div style={{ position: "absolute", right: -10 * u, top: -6 * u, width: 30 * u, height: 50 * u, borderRadius: 999, background: "radial-gradient(circle at 40% 35%, #e3b46a, #7a4b1f 70%)" }} />
    </div>
  );
  return (
    <Palco c={{ ...c, tema: { ...tema, visual: "documental" } }} semente={semente(c)} transicao={2}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 50% 45% at 50% ${vertical ? 32 : 45}%, rgba(255,190,110,${0.28 * vela}), transparent 70%)` }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", perspective: 1600 * u }}>
        <div style={{ position: "relative", width: larg, height: alt, marginTop: vertical ? -300 * u : -30 * u, transform: `rotateX(${(1 - abre) * 28 + 6}deg)`, transformStyle: "preserve-3d" }}>
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: `radial-gradient(ellipse at 50% 35%, #fbf1da 0%, #ecd9ae 60%, #cfae72 100%)`, boxShadow: `inset 0 0 ${70 * u}px rgba(120,80,30,.45), 0 ${30 * u}px ${70 * u}px rgba(0,0,0,.6)` }}>
            <div style={{ position: "absolute", inset: 0, opacity: 0.2, background: "repeating-linear-gradient(0deg, rgba(90,60,20,.25) 0 1px, transparent 1px 7px)" }} />
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 40%, rgba(255,230,180,${0.25 * vela}), transparent 60%)` }} />
            <div style={{ position: "absolute", left: 80 * u, right: 80 * u, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
              <div style={{ fontFamily: "Playfair Display", fontStyle: "italic", fontWeight: 500, fontSize: (vertical ? 48 : 56) * u, lineHeight: 1.3, color: tinta }}>
                {palavras.map((w, k) => {
                  const q = saiSuave((c.t - ini - k * passo) / 0.4);
                  return (
                    <span key={k} style={{ display: "inline-block", marginRight: "0.26em", opacity: q, filter: `blur(${(1 - q) * 6 * u}px)`, transform: `translateY(${(1 - q) * 8 * u}px)` }}>
                      {w}
                    </span>
                  );
                })}
              </div>
              {p.referencia ? (
                <div style={{ marginTop: 30 * u, fontFamily: "Playfair Display", fontWeight: 700, fontSize: 30 * u, letterSpacing: "0.18em", textTransform: "uppercase", color: misturar(tema.acento, tinta, 0.4), opacity: saiSuave((c.t - ini - palavras.length * passo - 0.2) / 0.5) }}>
                  {texto(p.referencia)}
                </div>
              ) : null}
            </div>
          </div>
          {vareta(true)}
          {vareta(false)}
        </div>
      </div>
    </Palco>
  );
}

/** PERGUNTA E RESPOSTA: a dúvida no vidro, e a resposta que estoura na luz da marca quando é dita. */
export function PerguntaResposta(c: Ctx) {
  const { props: p, u, vertical } = c;
  const m = margens(c);
  const evento = c.passos.length ? c.passos[0] : saiSuave((c.t - 0.5) / 0.4);
  const tResp = c.passos.length ? evento * 0.6 : c.t - 0.5;
  const topo = vertical && texto(p.posicao) === "baixo" ? m.base - 300 * u : m.topo;
  const s = molaFisica(tResp, 260, 15);
  return (
    <div style={{ position: "absolute", left: m.x, top: topo, maxWidth: vertical ? m.largura : 1300 * u, opacity: c.fica }}>
      <div style={{ ...entradaMola(c, 0, 24), display: "inline-block", marginBottom: 16 * u }}>
        <Vidro c={c} estilo={{ display: "inline-block", padding: `${18 * u}px ${32 * u}px` }}>
          <div style={{ ...estiloDoTitulo(c, vertical ? 58 : 64), color: corDoTexto(c) }}>
            <TextoCinetico c={c} texto={texto(p.pergunta)} estilo={{}} inicio={0.12} varrer={false} />
          </div>
        </Vidro>
      </div>
      <br />
      <div style={{ display: "inline-block", opacity: limitar(evento * 4), transform: `scale(${0.5 + 0.5 * s}) translateY(${(1 - s) * 20 * u}px)`, transformOrigin: "left center" }}>
        <Vidro c={c} forte raio={20} estilo={{ padding: `${16 * u}px ${30 * u}px` }}>
          <div style={{ ...estiloDoTitulo(c, vertical ? 48 : 52) }}>{texto(p.resposta).replace(/\*\*/g, "")}</div>
        </Vidro>
      </div>
    </div>
  );
}

/**
 * PAINEL LATERAL: o vidro alto de um lado; o item dito acende (nítido, com a
 * luz da marca) e os outros ficam desfocados e apagados, como as listas do
 * Dan Martell.
 */
export function PainelLateral(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const m = margens(c);
  const direita = texto(p.lado) === "direita";
  const itens = lista<{ texto?: string }>(p.itens);
  const larg = vertical ? m.largura : 760 * u;
  const e = molaFisica(c.t, 150, 17);
  const acesos = itens.map((_, k) => (c.passos.length > k ? c.passos[k] : limitar((c.t - 0.4 - k * 0.15) / 0.4)));
  let atual = -1;
  acesos.forEach((q, k) => q > 0.05 && (atual = k));
  return (
    <div style={{ position: "absolute", top: vertical ? m.topo : c.H * 0.5, ...(direita ? { right: m.x } : { left: m.x }), width: larg, opacity: limitar(c.t / 0.15) * c.fica, transform: vertical ? `translateY(${(1 - e) * -40 * u}px)` : `translateY(-50%) translateX(${(1 - e) * (direita ? 80 : -80) * u}px) perspective(${1400 * u}px) rotateY(${(1 - e) * (direita ? -14 : 14)}deg)` }}>
      <Vidro c={c} estilo={{ padding: `${40 * u}px ${44 * u}px` }}>
        {p.rotulo ? <SeloVivo c={c} texto={texto(p.rotulo)} estilo={{ marginBottom: 22 * u }} atraso={0.15} /> : null}
        <div style={{ ...estiloDoTitulo(c, vertical ? 62 : 70), color: corDoTexto(c) }}>
          <TextoCinetico c={c} texto={texto(p.titulo)} estilo={{}} inicio={0.2} />
        </div>
        <div style={{ marginTop: 30 * u, display: "flex", flexDirection: "column", gap: 16 * u }}>
          {itens.map((it, k) => {
            const q = acesos[k];
            const ativo = k === atual;
            const visto = q > 0.05;
            const pulso = ativo ? Math.sin(limitar(q) * Math.PI) : 0;
            return (
              <div key={k} style={{ position: "relative", display: "flex", alignItems: "center", gap: 18 * u, padding: `${10 * u}px ${16 * u}px`, borderRadius: 14 * u, background: ativo ? rgba(tema.acento, 0.16) : "transparent", border: `${1 * u}px solid ${ativo ? rgba(tema.acento, 0.55) : "transparent"}`, boxShadow: ativo ? `0 0 ${30 * u}px ${rgba(tema.acento, 0.25 + 0.3 * pulso)}` : "none", opacity: visto ? (ativo ? 1 : 0.5) : 0.22, filter: ativo || !visto ? "none" : `blur(${1.6 * u}px)`, transform: `translateX(${(1 - saiSuave(q)) * 18 * u}px) scale(${ativo ? 1 + 0.03 * pulso : 0.98})`, transformOrigin: "left center" }}>
                <span style={{ width: 40 * u, height: 40 * u, flex: "0 0 auto", borderRadius: 10 * u, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Geist", fontWeight: 700, fontSize: 22 * u, color: ativo ? sobreOAcento(tema) : corFraca(c), background: ativo ? tema.acento : "rgba(255,255,255,.08)", boxShadow: ativo ? brilho(tema.acento, u, 0.6) : "none" }}>{k + 1}</span>
                <span style={{ fontFamily: tema.fonteTexto, fontWeight: 600, fontSize: (vertical ? 40 : 46) * u, lineHeight: 1.25, color: corDoTexto(c) }}>{texto(it.texto)}</span>
              </div>
            );
          })}
        </div>
        {p.apoio ? <div style={{ ...estiloDoApoio(c, 26), marginTop: 24 * u, color: corFraca(c) }}>{texto(p.apoio)}</div> : null}
      </Vidro>
    </div>
  );
}

/** FECHO: no palco, a marca acende com o brilho, a frase final palavra a palavra e a chamada com a varredura. */
export function Fecho(c: Ctx) {
  const { props: p, u, tema, vertical, logoUrl } = c;
  const s = molaFisica(c.t - 0.2, 140, 14);
  const e3 = saiSuave((c.t - 1.1) / 0.5);
  const varre = limitar((c.t - 1.6) / 0.7);
  return (
    <Palco c={c} semente={semente(c)} transicao={0}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34 * u, paddingBottom: vertical ? 300 * u : 40 * u }}>
        <div style={{ opacity: limitar((c.t - 0.2) / 0.3), transform: `scale(${0.7 + 0.3 * s})`, filter: `drop-shadow(0 0 ${30 * u}px ${rgba(tema.acento, 0.55)})` }}>
          {logoUrl ? (
            <Img src={logoUrl} style={{ maxHeight: (vertical ? 170 : 150) * u, maxWidth: (vertical ? 760 : 620) * u, objectFit: "contain" }} />
          ) : (
            <div style={{ ...estiloDoTitulo(c, Math.min(vertical ? 92 : 104, (c.W * 0.84) / u / Math.max(6, texto(p.marca).length * (tema.caixaAlta ? 0.86 : 0.62)))), color: "#ffffff", whiteSpace: "nowrap" }}>{texto(p.marca)}</div>
          )}
        </div>
        {p.rotulo ? <SeloVivo c={c} texto={texto(p.rotulo)} atraso={0.5} /> : null}
        <div style={{ ...estiloDoTitulo(c, vertical ? 60 : 66), color: "#f2f6fb", textAlign: "center", maxWidth: vertical ? c.W - 120 * u : 1500 * u, textShadow: "0 4px 24px rgba(0,0,0,.6)" }}>
          <TextoCinetico c={c} texto={texto(p.titulo)} estilo={{}} inicio={0.6} />
        </div>
        {p.chamada ? (
          <div style={{ position: "relative", overflow: "hidden", opacity: e3, transform: `translateY(${(1 - e3) * 20 * u}px)`, padding: `${22 * u}px ${46 * u}px`, borderRadius: 16 * u, background: `linear-gradient(180deg, ${misturar(tema.acento, "#ffffff", 0.15)}, ${misturar(tema.acento, "#000000", 0.15)})`, color: sobreOAcento(tema), fontFamily: tema.fonteTexto, fontWeight: 600, fontSize: (vertical ? 38 : 40) * u, boxShadow: `${brilho(tema.acento, u, 0.8)}, inset 0 ${2 * u}px 0 rgba(255,255,255,.3)` }}>
            {texto(p.chamada)}
            <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", left: `${-40 + varre * 160}%`, background: "linear-gradient(100deg, transparent, rgba(255,255,255,.55), transparent)", transform: "skewX(-20deg)" }} />
          </div>
        ) : null}
      </div>
    </Palco>
  );
}

/**
 * TÍTULO ATRÁS DA PESSOA (a profundidade): a palavra gigante é desenhada na
 * passada de trás (`data-atras`) e a pessoa recortada da gravação passa POR
 * CIMA dela; o selo e o apoio ficam na frente. A palavra deriva devagar
 * (paralaxe contra a pessoa) e acende com o brilho da marca.
 */
export function TituloAtras(c: Ctx) {
  const { props: p, u, tema, vertical, W, H } = c;
  const txt = texto(p.texto, texto(p.titulo)).replace(/\*\*/g, "");
  const linhas = vertical && txt.split(/\s+/).length > 1 ? txt.split(/\s+/).reduce<string[]>((acc, w) => {
    const ult = acc[acc.length - 1];
    if (ult && (ult + " " + w).length <= 9) acc[acc.length - 1] = ult + " " + w;
    else acc.push(w);
    return acc;
  }, []).slice(0, 3) : [txt];
  const maior = Math.max(...linhas.map((l) => l.length), 3);
  const fonte = tema.visual === "documental" ? "Playfair Display" : tema.fonteTitulo === "Geist" ? "Archivo Black" : tema.fonteTitulo;
  const largura = vertical ? W * 0.92 : W * 0.9;
  // No 9:16 a cabeça mora no terço de cima (prova de 03/10: a segunda linha
  // sumia inteira atrás do rosto): o título fica ACIMA da cabeça, a pessoa só
  // corta a base das letras, e ele cabe na faixa de cima.
  const largo = fonte === "Anton" || fonte === "Oswald" ? 0.5 : fonte === "Archivo Black" ? 0.84 : 0.74;
  const tam = Math.min(vertical ? 300 : 330, largura / u / (maior * largo), vertical ? (H * 0.3) / u / (linhas.length * 0.95) : 999);
  const deriva = 1 + 0.05 * saiSuave(c.t / Math.max(2, c.dur));
  // Com a cabeça medida (props.cabeca, fração do quadro), a base das letras
  // fica um pouco abaixo do alto da cabeça: a pessoa corta só a base.
  const altura = linhas.length * tam * u * 0.92;
  const cabeca = Number(p.cabeca);
  const cy = Number.isFinite(cabeca) && cabeca > 0
    ? Math.max(altura / 2 + H * 0.03, Math.min(H * 0.45, H * (cabeca + (vertical ? 0.04 : 0.07)) - altura / 2))
    : vertical ? H * (linhas.length > 1 ? 0.21 : 0.2) : H * 0.42;
  // A COR DO TÍTULO (05/10 à noite): a cor da marca como ela é (acentoMarca), ou o escuro quando a marca é clara
  // demais para ler; nunca o degradê branco-rosa com brilho do acento avivado (o "ESSENCIAL" rosado e lavado do
  // vídeo cmuvv0jje). Sombra funda e um fio claro para ler sobre qualquer gravação.
  const marca = tema.acentoMarca ?? tema.acento;
  const corDoTitulo = luz(marca) > 0.72 ? escuroDoTema(tema) : marca;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: c.fica }}>
      {/* ATRÁS da pessoa: a palavra gigante. */}
      <div data-atras="1" style={{ position: "absolute", left: 0, right: 0, top: cy, transform: `translateY(-50%) scale(${deriva})`, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {linhas.map((l, i) => {
          const letras = l.split("");
          return (
            <div key={i} style={{ fontFamily: fonte, fontWeight: fonte === "Geist" ? 800 : 400, fontSize: tam * u, lineHeight: 0.92, letterSpacing: "-0.01em", textTransform: "uppercase", whiteSpace: "nowrap", display: "flex" }}>
              {letras.map((ch, k) => {
                const tk = c.t - 0.05 - (i * letras.length + k) * 0.03;
                const s = molaFisica(tk, 200, 16);
                return (
                  <span key={k} style={{ display: "inline-block", overflow: "hidden", paddingBottom: "0.04em", whiteSpace: "pre", ...(ch === " " ? { width: "0.3em" } : {}) }}>
                    <span style={{ display: "inline-block", transform: `translateY(${(1 - s) * 100}%)`, color: corDoTitulo, WebkitTextStroke: `${1.2 * u}px rgba(255,255,255,.22)`, textShadow: `0 ${2 * u}px 0 rgba(0,0,0,.35), 0 ${12 * u}px ${34 * u}px rgba(0,0,0,.6)` }}>{ch === " " ? " " : ch}</span>
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      {/* NA FRENTE: o selo e o apoio. */}
      {p.rotulo || p.apoio ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: vertical ? H * 0.66 : H * 0.74, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * u }}>
          {p.rotulo ? <SeloVivo c={c} texto={texto(p.rotulo)} atraso={0.45} /> : null}
          {p.apoio ? (
            <div style={{ ...entradaMola(c, 0.6, 20) }}>
              <Vidro c={c} estilo={{ padding: `${12 * u}px ${26 * u}px` }}>
                <div style={{ ...estiloDoTitulo(c, vertical ? 42 : 40), color: corDoTexto(c), textAlign: "center" }}>
                  <TextoCinetico c={c} texto={texto(p.apoio)} estilo={{}} inicio={0.7} varrer={false} />
                </div>
              </Vidro>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A TRANSIÇÃO entre planos (câmera e cartão, câmera e inserção): o worker
 * põe uma em cada troca de plano; o corte acontece no meio dela, escondido
 * pela luz. "luz": a faixa de luz inclinada que atravessa; "whip": riscos de
 * velocidade e o clarão; "flash": o clarão branco curto.
 */
export function Transicao(c: Ctx) {
  const { props: p, u, tema, W, H } = c;
  const tipo = texto(p.tipo, "luz");
  const k = limitar(c.t / Math.max(0.1, c.dur));
  const pico = Math.sin(k * Math.PI);
  if (tipo === "flash") return <div style={{ position: "absolute", inset: 0, background: "#ffffff", opacity: 0.55 * pico ** 2 }} />;
  if (tipo === "whip") {
    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, transparent, ${rgba("#ffffff", 0.35 * pico)}, transparent)` }} />
        {Array.from({ length: 26 }, (_, i) => {
          const y = acaso(i, 4) * H;
          const l = (0.3 + acaso(i, 6) * 0.7) * W;
          const x = -l + (W + l) * limitar(k * 1.3 - acaso(i, 8) * 0.3);
          return <div key={i} style={{ position: "absolute", left: x, top: y, width: l, height: (2 + acaso(i, 9) * 8) * u, background: i % 4 ? "rgba(255,255,255,.7)" : tema.acento, filter: `blur(${3 * u}px)`, opacity: pico }} />;
        })}
      </div>
    );
  }
  const x = -0.4 * W + k * 1.8 * W;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at ${(x / W) * 100}% 50%, ${rgba("#ffffff", 0.45 * pico)}, transparent 60%)` }} />
      <div style={{ position: "absolute", left: x - 160 * u, top: -H * 0.2, width: 320 * u, height: H * 1.4, transform: "rotate(14deg)", background: `linear-gradient(90deg, transparent, ${rgba(tema.acento, 0.55 * pico)}, ${rgba("#ffffff", 0.95 * pico)}, ${rgba(tema.acento, 0.55 * pico)}, transparent)`, filter: `blur(${18 * u}px)` }} />
    </div>
  );
}

export { semente as sementeDaPeca };
