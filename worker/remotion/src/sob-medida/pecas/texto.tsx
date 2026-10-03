import React from "react";
import { Img } from "remotion";
import {
  ComDestaque,
  corDoTexto,
  corFraca,
  entradaDoBloco,
  escuroDoTema,
  estiloDoApoio,
  estiloDoPainel,
  estiloDoTitulo,
  limitar,
  lista,
  margens,
  misturar,
  mola,
  Numero,
  posicionar,
  progressoDoItem,
  rgba,
  saiSuave,
  Selo,
  sobreOAcento,
  texto,
  type Ctx,
} from "../base";

/** TÍTULO COM HIERARQUIA: rótulo (selo), título (com destaque) e apoio. A peça de base do pitch. */
export function Titulo(c: Ctx) {
  const { props: p, u, vertical } = c;
  const tam = Number(p.tamanho) || (vertical ? 66 : 74);
  const larg = vertical ? margens(c).largura : 1240 * u;
  const pos = texto(p.posicao, "topo-esquerda");
  const centro = pos === "centro";
  return (
    <div style={{ ...posicionar(c, pos), ...entradaDoBloco(c, c.entra) }}>
      <div style={{ maxWidth: larg, textAlign: centro ? "center" : "left", display: "flex", flexDirection: "column", alignItems: centro ? "center" : "flex-start" }}>
        {p.rotulo ? <Selo c={c} texto={texto(p.rotulo)} estilo={{ marginBottom: 18 * u }} /> : null}
        <div style={{ ...estiloDoPainel(c), display: "inline-block", padding: `${26 * u}px ${34 * u}px` }}>
          <div style={{ ...estiloDoTitulo(c, tam), color: corDoTexto(c) }}>
            <ComDestaque c={c} texto={texto(p.titulo)} />
          </div>
          {p.apoio ? <div style={{ ...estiloDoApoio(c, tam * 0.4), marginTop: 14 * u }}>{texto(p.apoio)}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** CAPÍTULO: o número no quadrado da marca e o título curto, no canto (fica enquanto o assunto dura). */
export function Capitulo(c: Ctx) {
  const { props: p, u, vertical } = c;
  const m = margens(c);
  return (
    <div style={{ position: "absolute", left: m.x, top: m.topo, display: "flex", alignItems: "center", gap: 22 * u, ...entradaDoBloco(c, c.entra, 18) }}>
      <Numero c={c} n={texto(p.numero, "1")} tam={vertical ? 66 : 74} />
      <div style={{ ...estiloDoPainel(c), padding: `${16 * u}px ${28 * u}px` }}>
        <div style={{ ...estiloDoTitulo(c, vertical ? 48 : 56), color: corDoTexto(c) }}>
          <ComDestaque c={c} texto={texto(p.titulo)} />
        </div>
      </div>
    </div>
  );
}

/** RÓTULO INFERIOR: quem fala ou o que é, com a barra da marca que corre antes do texto. */
export function RotuloInferior(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const m = margens(c);
  const barra = saiSuave(c.t / 0.35);
  const corpo = saiSuave((c.t - 0.12) / 0.45);
  return (
    <div style={{ position: "absolute", left: m.x, top: vertical ? m.base - 250 * u : c.H - 330 * u, display: "flex", alignItems: "stretch", gap: 0, opacity: c.fica }}>
      <div style={{ width: 10 * u, borderRadius: 6 * u, background: tema.acento, transform: `scaleY(${barra})`, transformOrigin: "bottom" }} />
      <div style={{ ...estiloDoPainel(c), borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: `${18 * u}px ${30 * u}px`, clipPath: `inset(0 ${(1 - corpo) * 100}% 0 0)` }}>
        <div style={{ ...estiloDoTitulo(c, vertical ? 44 : 46), color: corDoTexto(c) }}>
          <ComDestaque c={c} texto={texto(p.nome)} />
        </div>
        {p.descricao ? <div style={{ ...estiloDoApoio(c, vertical ? 26 : 26), marginTop: 6 * u }}>{texto(p.descricao)}</div> : null}
      </div>
    </div>
  );
}

/** FRASE DE IMPACTO: a tese no meio da tela, grande. */
export function FraseImpacto(c: Ctx) {
  const { props: p, u, vertical } = c;
  const tam = Number(p.tamanho) || (vertical ? 88 : 116);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", ...entradaDoBloco(c, c.entra, 34) }}>
      <div style={{ ...estiloDoPainel(c), padding: `${32 * u}px ${54 * u}px`, maxWidth: vertical ? c.W - 110 * u : 1500 * u, textAlign: "center", marginTop: vertical ? -260 * u : -60 * u }}>
        <div style={{ ...estiloDoTitulo(c, tam), color: corDoTexto(c) }}>
          <ComDestaque c={c} texto={texto(p.texto)} />
        </div>
        {p.apoio ? <div style={{ ...estiloDoApoio(c, tam * 0.3), marginTop: 18 * u }}>{texto(p.apoio)}</div> : null}
      </div>
    </div>
  );
}

/** PALAVRA-CHAVE: a palavra dita, numa pílula da marca que estoura de lado (ritmo, sem tampar). */
export function PalavraChave(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const m = margens(c);
  const s = 0.6 + 0.4 * mola(c.t / 0.45);
  const direita = texto(p.lado) === "direita";
  return (
    <div
      style={{
        position: "absolute",
        top: vertical ? m.topo + 40 * u : c.H * 0.2,
        ...(direita ? { right: m.x } : { left: m.x }),
        opacity: limitar(c.t / 0.12) * c.fica,
        transform: `scale(${s}) rotate(${direita ? 2 : -2}deg)`,
        transformOrigin: direita ? "right center" : "left center",
      }}
    >
      <div
        style={{
          ...estiloDoTitulo(c, vertical ? 70 : 76),
          background: tema.visual === "documental" ? "#fffdf6" : tema.acento,
          color: tema.visual === "documental" ? "#1b1a17" : sobreOAcento(tema),
          padding: `${12 * u}px ${30 * u}px`,
          borderRadius: (tema.visual === "vidro" ? 18 : 8) * u,
          boxShadow: `0 ${18 * u}px ${44 * u}px rgba(0,0,0,.45)`,
          whiteSpace: "nowrap",
        }}
      >
        {texto(p.texto)}
      </div>
    </div>
  );
}

/** CITAÇÃO: aspas grandes da marca, a frase e quem disse. */
export function Citacao(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const tam = vertical ? 58 : 68;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", ...entradaDoBloco(c, c.entra, 30) }}>
      <div style={{ ...estiloDoPainel(c), padding: `${46 * u}px ${60 * u}px ${40 * u}px`, maxWidth: vertical ? c.W - 110 * u : 1440 * u, marginTop: vertical ? -280 * u : -40 * u, position: "relative" }}>
        <div style={{ position: "absolute", left: 34 * u, top: -70 * u, fontFamily: "Playfair Display", fontWeight: 900, fontSize: 220 * u, lineHeight: 1, color: tema.acento }}>“</div>
        <div style={{ ...estiloDoTitulo(c, tam), fontFamily: tema.visual === "impacto" ? tema.fonteTitulo : "Playfair Display", fontWeight: tema.visual === "impacto" ? tema.pesoTitulo : 600, textTransform: "none", color: corDoTexto(c), marginTop: 30 * u }}>
          <ComDestaque c={c} texto={texto(p.texto)} />
        </div>
        {p.autor ? (
          <div style={{ marginTop: 26 * u, display: "flex", alignItems: "center", gap: 14 * u }}>
            <span style={{ width: 42 * u, height: 3 * u, background: tema.acento, display: "inline-block" }} />
            <span style={{ ...estiloDoApoio(c, 28), fontFamily: tema.fonteMono, letterSpacing: "0.08em", textTransform: "uppercase" }}>{texto(p.autor)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * PERGAMINHO: o rolo que se abre com o versículo ou a palavra antiga (tema
 * bíblico, história). Papel envelhecido, varetas escuras, letra serifada.
 */
export function Pergaminho(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const larg = vertical ? c.W - 150 : 1100 * u;
  const altAberto = vertical ? 600 * u : 560 * u;
  const abre = saiSuave((c.t - 0.15) / 0.9);
  const alt = 30 * u + (altAberto - 30 * u) * abre;
  const tinta = "#3a2a17";
  const vareta = (topo: boolean) => (
    <div
      style={{
        position: "absolute",
        left: -34 * u,
        right: -34 * u,
        height: 34 * u,
        [topo ? "top" : "bottom"]: -17 * u,
        borderRadius: 999,
        background: "linear-gradient(180deg,#7a5230,#4a2f17 55%,#2e1c0d)",
        boxShadow: `0 ${8 * u}px ${18 * u}px rgba(0,0,0,.45)`,
      }}
    />
  );
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: limitar(c.t / 0.2) * c.fica }}>
      <div style={{ position: "relative", width: larg, height: alt, marginTop: vertical ? -300 * u : -30 * u }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            background: "radial-gradient(ellipse at 50% 40%, #f6ead0 0%, #ead8ad 62%, #d6bd86 100%)",
            boxShadow: `inset 0 0 ${60 * u}px rgba(120,80,30,.35), 0 ${26 * u}px ${60 * u}px rgba(0,0,0,.5)`,
          }}
        >
          <div style={{ position: "absolute", inset: 0, opacity: 0.18, background: "repeating-linear-gradient(0deg, rgba(90,60,20,.25) 0 1px, transparent 1px 7px)" }} />
          <div style={{ position: "absolute", left: 70 * u, right: 70 * u, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", opacity: limitar((abre - 0.55) / 0.45) }}>
            <div style={{ fontFamily: "Playfair Display", fontStyle: "italic", fontWeight: 500, fontSize: (vertical ? 46 : 54) * u, lineHeight: 1.28, color: tinta }}>
              {texto(p.texto).split(/\*\*(.+?)\*\*/g).map((t, i) => (i % 2 ? <b key={i} style={{ fontWeight: 800, color: misturar(tema.acento, tinta, 0.35) }}>{t}</b> : <React.Fragment key={i}>{t}</React.Fragment>))}
            </div>
            {p.referencia ? (
              <div style={{ marginTop: 28 * u, fontFamily: "Playfair Display", fontWeight: 700, fontSize: 30 * u, letterSpacing: "0.14em", textTransform: "uppercase", color: misturar(tema.acento, tinta, 0.45) }}>
                {texto(p.referencia)}
              </div>
            ) : null}
          </div>
        </div>
        {vareta(true)}
        {vareta(false)}
      </div>
    </div>
  );
}

/** PERGUNTA E RESPOSTA: a dúvida no vidro, a resposta na pílula da marca (as objeções do pitch). */
export function PerguntaResposta(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const m = margens(c);
  const r = c.passos.length ? c.passos[0] : saiSuave((c.t - 0.5) / 0.4);
  return (
    <div style={{ position: "absolute", left: m.x, top: m.topo, maxWidth: vertical ? m.largura : 1300 * u, ...entradaDoBloco(c, c.entra, 20) }}>
      <div style={{ ...estiloDoPainel(c), display: "inline-block", padding: `${20 * u}px ${32 * u}px`, marginBottom: 16 * u }}>
        <div style={{ ...estiloDoTitulo(c, vertical ? 58 : 64), color: corDoTexto(c) }}><ComDestaque c={c} texto={texto(p.pergunta)} /></div>
      </div>
      <br />
      <div
        style={{
          display: "inline-block",
          padding: `${18 * u}px ${30 * u}px`,
          borderRadius: 20 * u,
          background: `linear-gradient(100deg, ${tema.acento}, ${misturar(tema.acento, "#000000", 0.22)})`,
          boxShadow: `0 ${20 * u}px ${50 * u}px rgba(0,0,0,.4)`,
          opacity: r,
          transform: `translateY(${(1 - r) * 24 * u}px)`,
        }}
      >
        <div style={{ ...estiloDoTitulo(c, vertical ? 46 : 50), color: sobreOAcento(tema) }}>{texto(p.resposta).replace(/\*\*/g, "")}</div>
      </div>
    </div>
  );
}

/**
 * PAINEL LATERAL: o vidro alto de um lado, com rótulo, título e itens que
 * acendem quando ditos. Vai com a câmera puxada para o outro lado (o editor
 * pede o enquadramento junto), para a pessoa continuar na tela.
 */
export function PainelLateral(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const m = margens(c);
  const direita = texto(p.lado) === "direita";
  const itens = lista<{ texto?: string }>(p.itens);
  const larg = vertical ? m.largura : 760 * u;
  const e = saiSuave(c.entra);
  return (
    <div
      style={{
        position: "absolute",
        top: vertical ? m.topo : c.H * 0.5,
        ...(direita ? { right: m.x } : { left: m.x }),
        width: larg,
        ...estiloDoPainel(c),
        padding: `${40 * u}px ${44 * u}px`,
        opacity: e * c.fica,
        transform: vertical ? `translateY(${(1 - e) * -30 * u}px)` : `translateY(-50%) translateX(${(1 - e) * (direita ? 60 : -60) * u}px)`,
      }}
    >
      {p.rotulo ? <Selo c={c} texto={texto(p.rotulo)} estilo={{ marginBottom: 24 * u }} /> : null}
      <div style={{ ...estiloDoTitulo(c, vertical ? 62 : 70), color: corDoTexto(c) }}>
        <ComDestaque c={c} texto={texto(p.titulo)} />
      </div>
      <div style={{ marginTop: 30 * u, display: "flex", flexDirection: "column", gap: 18 * u }}>
        {itens.map((it, k) => {
          const q = progressoDoItem(c, k, 0.15);
          return (
            <div key={k} style={{ display: "flex", alignItems: "flex-start", gap: 18 * u, opacity: 0.25 + 0.75 * q, transform: `translateX(${(1 - q) * 16 * u}px)` }}>
              <span style={{ marginTop: 12 * u, width: 14 * u, height: 14 * u, borderRadius: "50%", flex: "0 0 auto", background: q > 0.5 ? tema.acento : rgba("#ffffff", 0.25) }} />
              <span style={{ fontFamily: tema.fonteTexto, fontWeight: 600, fontSize: (vertical ? 40 : 44) * u, lineHeight: 1.3, color: corDoTexto(c) }}>{texto(it.texto)}</span>
            </div>
          );
        })}
      </div>
      {p.apoio ? <div style={{ ...estiloDoApoio(c, 26), marginTop: 26 * u, color: corFraca(c) }}>{texto(p.apoio)}</div> : null}
    </div>
  );
}

/** FECHO: a marca do cliente, a frase final e a chamada (vai sobre o plano "gráfico"). */
export function Fecho(c: Ctx) {
  const { props: p, u, tema, vertical, logoUrl } = c;
  const e = saiSuave(c.entra);
  const e2 = saiSuave((c.t - 0.35) / 0.6);
  const e3 = saiSuave((c.t - 0.7) / 0.6);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34 * u, opacity: c.fica, paddingBottom: vertical ? 300 * u : 40 * u }}>
      <div style={{ opacity: e, transform: `scale(${0.92 + 0.08 * e})` }}>
        {logoUrl ? (
          <Img src={logoUrl} style={{ maxHeight: (vertical ? 170 : 150) * u, maxWidth: (vertical ? 760 : 620) * u, objectFit: "contain" }} />
        ) : (
          <div style={{ ...estiloDoTitulo(c, Math.min(vertical ? 92 : 100, (c.W * 0.86) / u / Math.max(6, texto(p.marca).length * 0.66))), color: "#ffffff", whiteSpace: "nowrap" }}>{texto(p.marca)}</div>
        )}
      </div>
      {p.rotulo ? <div style={{ opacity: e }}><Selo c={c} texto={texto(p.rotulo)} /></div> : null}
      <div style={{ ...estiloDoTitulo(c, vertical ? 58 : 64), color: tema.visual === "documental" ? "#f4efe4" : "#eef2f7", textAlign: "center", maxWidth: vertical ? c.W - 120 * u : 1500 * u, opacity: e2, transform: `translateY(${(1 - e2) * 20 * u}px)` }}>
        <ComDestaque c={c} texto={texto(p.titulo)} />
      </div>
      {p.chamada ? (
        <div style={{ opacity: e3, transform: `translateY(${(1 - e3) * 20 * u}px)`, padding: `${22 * u}px ${44 * u}px`, borderRadius: 16 * u, background: misturar(tema.acento, "#000000", 0.12), color: sobreOAcento(tema), fontFamily: tema.fonteTexto, fontWeight: 600, fontSize: (vertical ? 38 : 40) * u }}>
          {texto(p.chamada)}
        </div>
      ) : null}
    </div>
  );
}
