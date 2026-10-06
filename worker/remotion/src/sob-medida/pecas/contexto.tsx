import React from "react";
import { ComDestaque, corDoTexto, corFraca, escuroDoTema, estiloDoApoio, estiloDoTitulo, Icone, limitar, lista, luz, misturar, progressoDoItem, rgba, saiSuave, texto, type Ctx } from "../base";
import { brilho, Cantoneiras, itemAceso, molaFisica, sombraFunda, TextoCinetico, Vidro } from "../kit";
import { SeloVivo } from "./texto";

/**
 * AS PEÇAS DE CONTEXTO (06/10/2026). Regra do Bruno (06/10, 01h): "a IA deve
 * decidir a edição baseado no contexto do vídeo", para QUALQUER vídeo (uma
 * pessoa com quadro, duas conversando, tela compartilhada, palestra, cozinha,
 * vlog). O JEV escolhe cada uma por momento quando a leitura do trecho
 * permite (lib/media/editor-por-comando/leitura-no-plano.ts) e o resolvedor
 * mede a CAIXA dela (props.caixa, fração do quadro) na área livre do trecho,
 * nunca sobre rosto, tela ou quadro. Aqui é só o desenho, na LINGUAGEM do
 * vídeo (o tema): papel no documental, vidro no tecnológico, bloco no
 * impacto, filete dourado no luxo, brilho no neon. Nenhum nome de estilo
 * decide se a peça entra; o tema só muda a aparência; a cor da marca fica nos
 * detalhes (a barra, o fio, o número, o brilho).
 *
 *   nome-de-quem-fala    o terço inferior: a barra da marca, o nome e o papel de quem fala (conversa, podcast)
 *   realce-de-quem-fala  a moldura acesa em volta de quem fala (duas ou mais pessoas); ninguém escurece
 *   zoom-no-ponto        a moldura na região da tela ou do quadro já aproximada pela câmera (o resolvedor pede o zoom)
 *   destaque-na-tela     a mesma moldura, sem zoom (o resto da tela continua visível)
 *   cartao-de-passo      o cartão pequeno: o número do passo, o nome, o detalhe dito, o ícone (receita, tutorial, vlog)
 *   frase-chave          a frase inteira num cartão na área livre (palestra, aula, sermão)
 *   slide                o slide na folha ao lado: o título e os itens que acendem quando ditos (palestra, aula)
 */

type Caixa = { x: number; y: number; w: number; h: number };

/** A caixa medida pelo resolvedor (fração do quadro) em pixels; sem ela, a reserva. */
function caixaEmPx(c: Ctx, reserva: Caixa): Caixa {
  const cx = c.props.caixa as Partial<Caixa> | undefined;
  const ok = cx && typeof cx === "object" && [cx.x, cx.y, cx.w, cx.h].every((v) => typeof v === "number" && Number.isFinite(v)) && cx.w! > 0.02 && cx.h! > 0.02;
  const f = ok ? (cx as Caixa) : reserva;
  return { x: Math.round(f.x * c.W), y: Math.round(f.y * c.H), w: Math.round(f.w * c.W), h: Math.round(f.h * c.H) };
}

/** O acabamento da linguagem, lido do tema (nunca de um nome de estilo). */
function acabamento(c: Ctx) {
  const { tema } = c;
  const luxo = tema.acabamento === "luxo";
  const ouro = "#C9A24A";
  return {
    papel: tema.visual === "documental",
    luxo,
    neon: tema.linguagem === "neon",
    impacto: tema.visual === "impacto",
    marca: tema.acentoMarca ?? tema.acento,
    acento: luxo ? ouro : tema.acento,
    tinta: tema.vox?.tinta ?? escuroDoTema(tema),
  };
}

/** A MOLDURA de uma região (o realce, o zoom, o destaque): o fio da marca com as cantoneiras, na linguagem do vídeo. */
function Moldura({ c, caixa, forca = 1 }: { c: Ctx; caixa: Caixa; forca?: number }) {
  const { u } = c;
  const a = acabamento(c);
  const e = molaFisica(c.t, 160, 15);
  const fio = (a.papel ? 5 : 3) * u;
  const raio = a.papel ? 2 * u : a.impacto ? 8 * u : a.luxo ? 6 * u : 18 * u;
  const cor = a.papel ? (c.tema.vox?.fio ?? "#c0392b") : a.acento;
  return (
    <div style={{ position: "absolute", left: caixa.x, top: caixa.y, width: caixa.w, height: caixa.h, opacity: limitar(c.t / 0.12) * c.fica * forca, transform: `scale(${(1.06 - 0.06 * e).toFixed(4)})`, transformOrigin: "50% 50%" }}>
      <div style={{ position: "absolute", inset: 0, border: `${fio}px solid ${cor}`, borderRadius: raio, boxShadow: a.neon ? brilho(cor, u, 1.4) : a.papel ? `0 ${3 * u}px ${10 * u}px rgba(0,0,0,.25)` : `0 0 ${18 * u}px ${rgba(cor, 0.45)}, inset 0 0 ${18 * u}px ${rgba(cor, 0.12)}`, clipPath: `inset(0 ${(1 - saiSuave(c.t / 0.45)) * 100}% 0 0)` }} />
      {!a.papel ? <Cantoneiras c={c} w={caixa.w} h={caixa.h} cor={cor} abre={saiSuave((c.t - 0.1) / 0.4)} tam={Math.min(40, caixa.w / 8, caixa.h / 8) / u} /> : null}
    </div>
  );
}

/** A pílula do rótulo no canto de uma moldura. */
function Pilula({ c, txt, x, y, atraso = 0.3 }: { c: Ctx; txt: string; x: number; y: number; atraso?: number }) {
  const { u } = c;
  const a = acabamento(c);
  if (!txt) return null;
  const e = saiSuave((c.t - atraso) / 0.35);
  const fundo = a.papel ? (c.tema.vox?.realce ?? "#ffe11f") : a.acento;
  const letra = a.papel ? (c.tema.vox?.tintaNoRealce ?? "#1b1a17") : luz(a.acento) > 0.62 ? "#111318" : "#ffffff";
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translateY(${(1 - e) * 14 * u}px)`, opacity: e * c.fica, ...estiloDoTitulo(c, 26), color: letra, background: fundo, padding: `${7 * u}px ${16 * u}px`, borderRadius: a.papel ? 2 * u : 999, boxShadow: a.neon ? brilho(a.acento, u, 0.8) : sombraFunda(u, 0.5), whiteSpace: "nowrap" }}>
      {txt}
    </div>
  );
}

// ─────────────────────────────── quem fala ───────────────────────────────

/** NOME DE QUEM FALA: a barra da marca que cresce, o nome e o papel, no terço inferior perto de quem fala. */
export function NomeDeQuemFala(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const a = acabamento(c);
  const caixa = caixaEmPx(c, vertical ? { x: 0.15, y: 0.66, w: 0.7, h: 0.1 } : { x: 0.04, y: 0.72, w: 0.34, h: 0.14 });
  const nome = texto(p.nome).replace(/\*\*/g, "");
  const papel = texto(p.papel).replace(/\*\*/g, "");
  if (!nome) return null;
  const barra = saiSuave(c.t / 0.3);
  const corpo = saiSuave((c.t - 0.12) / 0.45);
  const letras = Math.floor(papel.length * limitar((c.t - 0.5) / 0.6));
  const tam = Math.min(vertical ? 46 : 44, (caixa.w / u / Math.max(5, nome.length)) * (tema.caixaAlta ? 1.55 : 1.85));
  return (
    <div style={{ position: "absolute", left: caixa.x, top: caixa.y, width: caixa.w, display: "flex", alignItems: "stretch", opacity: c.fica, transform: `translateX(${(1 - c.fica) * -30 * u}px)` }}>
      <div style={{ width: 8 * u, flex: "none", borderRadius: a.papel ? 0 : 4 * u, background: a.acento, boxShadow: a.neon ? brilho(a.acento, u, 0.9) : `0 0 ${10 * u}px ${rgba(a.acento, 0.5)}`, transform: `scaleY(${barra})`, transformOrigin: "bottom", zIndex: 2 }} />
      <div style={{ clipPath: `inset(-30% ${(1 - corpo) * 100}% -30% 0)`, maxWidth: caixa.w - 8 * u }}>
        <Vidro c={c} raio={a.papel ? 2 : 6} estilo={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: `${14 * u}px ${26 * u}px ${15 * u}px` }}>
          <div style={{ ...estiloDoTitulo(c, tam), color: corDoTexto(c), whiteSpace: "nowrap" }}>
            <TextoCinetico c={c} texto={nome} estilo={{}} inicio={0.2} varrer={false} />
          </div>
          {papel ? (
            <div style={{ ...estiloDoApoio(c, 22), fontFamily: tema.fonteMono, letterSpacing: "0.06em", marginTop: 6 * u, whiteSpace: "nowrap", color: a.papel ? "#5b5650" : corFraca(c) }}>
              {papel.slice(0, letras)}
              <span style={{ opacity: letras < papel.length ? 1 : 0, color: a.acento }}>▍</span>
            </div>
          ) : null}
        </Vidro>
      </div>
    </div>
  );
}

/** REALCE DE QUEM FALA: a moldura acesa em volta de quem fala, com o rótulo; ninguém escurece. */
export function RealceDeQuemFala(c: Ctx) {
  const { u } = c;
  const caixa = caixaEmPx(c, { x: 0.3, y: 0.1, w: 0.4, h: 0.85 });
  // A moldura fica um pouco maior que a pessoa (ela nunca é cortada pelo fio) e respira devagar.
  const folga = 10 * u + 4 * u * Math.sin(c.t * 2.2);
  const m = { x: caixa.x - folga, y: caixa.y - folga, w: caixa.w + 2 * folga, h: caixa.h + 2 * folga };
  const rotulo = texto(c.props.rotulo).replace(/\*\*/g, "");
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Moldura c={c} caixa={m} forca={0.9} />
      <Pilula c={c} txt={rotulo} x={m.x + 14 * u} y={Math.min(c.H - 60 * u, m.y + m.h - 54 * u)} />
    </div>
  );
}

// ─────────────────────────────── tela e quadro ───────────────────────────────

/** ZOOM NO PONTO: a moldura na região da tela ou do quadro, na posição dela DEPOIS do zoom que o resolvedor pediu. */
export function ZoomNoPonto(c: Ctx) {
  const { u } = c;
  const caixa = caixaEmPx(c, { x: 0.15, y: 0.15, w: 0.7, h: 0.7 });
  const rotulo = texto(c.props.rotulo).replace(/\*\*/g, "");
  // Presa ao quadro: depois do zoom a região pode encostar nas bordas.
  const m = { x: Math.max(6 * u, caixa.x), y: Math.max(6 * u, caixa.y), w: Math.min(c.W - 12 * u, caixa.w), h: Math.min(c.H - 12 * u, caixa.h) };
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Moldura c={c} caixa={m} />
      <Pilula c={c} txt={rotulo} x={m.x + 14 * u} y={Math.max(8 * u, m.y - 52 * u)} />
    </div>
  );
}

/** DESTAQUE NA TELA: a moldura na região da tela ou do quadro, sem zoom. */
export function DestaqueNaTela(c: Ctx) {
  const { u } = c;
  const caixa = caixaEmPx(c, { x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
  const rotulo = texto(c.props.rotulo).replace(/\*\*/g, "");
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Moldura c={c} caixa={caixa} />
      <Pilula c={c} txt={rotulo} x={caixa.x + 14 * u} y={caixa.y + caixa.h > c.H - 70 * u ? caixa.y + 12 * u : caixa.y + caixa.h + 10 * u} />
    </div>
  );
}

// ─────────────────────────────── os cartões ───────────────────────────────

/** O cartão na área livre: entra com mola, fica, sai; a aparência é a do Vidro da linguagem. */
function Cartao({ c, caixa, children }: { c: Ctx; caixa: Caixa; children: React.ReactNode }) {
  const { u } = c;
  const a = acabamento(c);
  const e = molaFisica(c.t, 170, 17);
  return (
    <div style={{ position: "absolute", left: caixa.x, top: caixa.y, width: caixa.w, opacity: limitar(c.t / 0.14) * c.fica, transform: `translateY(${((1 - e) * 36 + (1 - c.fica) * 14) * u}px) scale(${(0.96 + 0.04 * e).toFixed(4)}) rotate(${a.papel ? -0.8 : 0}deg)`, transformOrigin: "50% 100%" }}>
      <Vidro c={c} estilo={{ padding: `${22 * u}px ${28 * u}px`, borderLeft: a.impacto || a.luxo ? `${6 * u}px solid ${a.acento}` : undefined }}>
        {children}
      </Vidro>
    </div>
  );
}

/** CARTÃO DE PASSO, INGREDIENTE OU LUGAR: o número da marca, o título, o detalhe dito e o ícone. */
export function CartaoDePasso(c: Ctx) {
  const { props: p, u, vertical } = c;
  const a = acabamento(c);
  const caixa = caixaEmPx(c, vertical ? { x: 0.15, y: 0.5, w: 0.7, h: 0.22 } : { x: 0.6, y: 0.18, w: 0.36, h: 0.26 });
  const numero = texto(p.numero).replace(/\*\*/g, "");
  const titulo = texto(p.titulo).replace(/\*\*/g, "");
  const detalhe = texto(p.texto).replace(/\*\*/g, "");
  const icone = texto(p.icone);
  if (!titulo) return null;
  const tamTitulo = Math.min(vertical ? 50 : 46, ((caixa.w - (numero ? 92 : 0) * u - (icone ? 70 : 0) * u) / u / Math.max(4, titulo.length)) * 1.8);
  const letras = Math.floor(detalhe.length * limitar((c.t - 0.55) / 0.7));
  return (
    <Cartao c={c} caixa={caixa}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 * u }}>
        {numero ? (
          <div style={{ flex: "none", width: 74 * u, height: 74 * u, borderRadius: a.papel ? 4 * u : a.impacto ? 10 * u : "50%", background: a.acento, color: luz(a.acento) > 0.62 ? "#111318" : "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", ...estiloDoTitulo(c, 40), boxShadow: a.neon ? brilho(a.acento, u, 0.9) : sombraFunda(u, 0.5), transform: `scale(${molaFisica(c.t - 0.1, 220, 14).toFixed(3)})` }}>
            {numero}
          </div>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...estiloDoTitulo(c, tamTitulo), color: corDoTexto(c) }}>
            <TextoCinetico c={c} texto={titulo} estilo={{}} inicio={0.15} varrer={false} />
          </div>
          {detalhe ? (
            <div style={{ ...estiloDoApoio(c, 26), marginTop: 8 * u, color: a.papel ? "#5b5650" : corFraca(c) }}>
              {detalhe.slice(0, letras)}
              <span style={{ opacity: letras < detalhe.length ? 1 : 0, color: a.acento }}>▍</span>
            </div>
          ) : null}
        </div>
        {icone ? (
          <div style={{ flex: "none", opacity: saiSuave((c.t - 0.3) / 0.4), filter: a.neon ? `drop-shadow(0 0 ${8 * u}px ${rgba(a.acento, 0.8)})` : undefined }}>
            <Icone nome={icone} tam={56 * u} cor={a.acento} />
          </div>
        ) : null}
      </div>
    </Cartao>
  );
}

/** FRASE-CHAVE: a frase inteira num cartão na área livre, com o destaque na cor da marca e o autor quando dito. */
export function FraseChave(c: Ctx) {
  const { props: p, u, vertical } = c;
  const a = acabamento(c);
  const caixa = caixaEmPx(c, vertical ? { x: 0.07, y: 0.5, w: 0.86 , h: 0.26 } : { x: 0.52, y: 0.18, w: 0.44, h: 0.28 });
  const frase = texto(p.texto);
  const autor = texto(p.autor).replace(/\*\*/g, "");
  if (!frase) return null;
  const limpa = frase.replace(/\*\*/g, "");
  // A letra cabe na caixa: pela largura (as palavras quebram) e pela altura.
  const linhas = Math.max(1, Math.ceil((limpa.length * 0.52 * 40 * u) / Math.max(1, caixa.w - 56 * u)));
  const tam = Math.min(vertical ? 46 : 42, Math.max(26, ((caixa.h - 60 * u) / u / Math.max(1, linhas)) * 0.8));
  return (
    <Cartao c={c} caixa={caixa}>
      <div style={{ position: "absolute", left: 14 * u, top: -6 * u, fontFamily: "Playfair Display, serif", fontSize: 96 * u, lineHeight: 1, color: rgba(a.acento, a.papel ? 0.55 : 0.75), opacity: saiSuave((c.t - 0.1) / 0.4) }}>“</div>
      <div style={{ ...estiloDoTitulo(c, tam), color: corDoTexto(c), paddingLeft: 26 * u, textTransform: "none" }}>
        <TextoCinetico c={c} texto={frase} estilo={{}} inicio={0.2} atraso={0.05} />
      </div>
      {autor ? (
        <div style={{ ...estiloDoApoio(c, 24), marginTop: 12 * u, paddingLeft: 26 * u, color: a.papel ? "#5b5650" : corFraca(c), opacity: saiSuave((c.t - 0.9) / 0.4) }}>
          <span style={{ display: "inline-block", width: 26 * u, height: 3 * u, background: a.acento, verticalAlign: "middle", marginRight: 10 * u }} />
          {autor}
        </div>
      ) : null}
    </Cartao>
  );
}

// ─────────────────────────────── o slide ───────────────────────────────

/**
 * SLIDE: desenhado dentro da folha sobre a gravação (Camadas.tsx, o W e o H
 * já são os da folha): o selo, o título e os itens; o item dito acende e os
 * outros ficam apagados, como nas peças de estrutura.
 */
export function Slide(c: Ctx) {
  const { props: p, u, W, H } = c;
  const a = acabamento(c);
  const itens = lista<{ texto?: unknown }>(p.itens).slice(0, 4);
  const titulo = texto(p.titulo);
  const rotulo = texto(p.rotulo).replace(/\*\*/g, "");
  const pad = Math.min(W, H) * 0.07;
  const larg = W - 2 * pad;
  const tamTitulo = Math.min(56, (larg / u / Math.max(6, titulo.replace(/\*\*/g, "").length)) * 1.7);
  const alturaDoTitulo = (rotulo ? 46 : 0) * u + tamTitulo * u * 1.15 + 26 * u;
  const alturaDosItens = Math.max(1, H - 2 * pad - alturaDoTitulo);
  const linha = Math.min(84 * u, alturaDosItens / Math.max(1, itens.length));
  const tamItem = Math.min(34, (linha / u) * 0.42, (larg / u / 18) * 1.2);
  const fundo = a.papel ? "transparent" : a.impacto ? rgba("#000000", 0.3) : rgba(escuroDoTema(c.tema), 0.35);
  return (
    <div style={{ position: "absolute", inset: 0, background: fundo, color: corDoTexto(c), fontFamily: c.tema.fonteTexto }}>
      <div style={{ position: "absolute", left: pad, top: pad, width: larg }}>
        {rotulo ? <SeloVivo c={c} texto={rotulo} estilo={{ marginBottom: 12 * u }} atraso={0.15} /> : null}
        <div style={{ ...estiloDoTitulo(c, tamTitulo), color: corDoTexto(c), textShadow: a.papel ? "none" : `0 ${3 * u}px ${14 * u}px rgba(0,0,0,.5)` }}>
          <TextoCinetico c={c} texto={titulo} estilo={{}} inicio={0.2} />
        </div>
        <div style={{ width: larg * 0.3, height: 4 * u, marginTop: 14 * u, background: a.acento, boxShadow: a.neon ? brilho(a.acento, u, 0.8) : undefined, transform: `scaleX(${saiSuave((c.t - 0.35) / 0.4)})`, transformOrigin: "left" }} />
      </div>
      <div style={{ position: "absolute", left: pad, top: pad + alturaDoTitulo, width: larg }}>
        {itens.map((it, k) => {
          const q = progressoDoItem(c, k, 0.3);
          const { e, desfoque, pulso } = itemAceso(q);
          const aceso = q > 0.05;
          const txt = texto(it.texto).replace(/\*\*/g, "");
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 16 * u, height: linha, opacity: 0.25 + 0.75 * e, filter: desfoque ? `blur(${desfoque * u * 0.4}px)` : undefined, transform: `translateX(${(1 - e) * 18 * u}px)` }}>
              <div style={{ flex: "none", width: 14 * u, height: 14 * u, borderRadius: a.papel ? 0 : "50%", background: aceso ? a.acento : rgba(corDoTexto(c), 0.35), boxShadow: aceso ? `0 0 ${(10 + 14 * pulso) * u}px ${rgba(a.acento, 0.8)}` : undefined, transform: a.papel ? "rotate(45deg)" : undefined }} />
              <div style={{ ...estiloDoTitulo(c, tamItem), textTransform: "none", fontWeight: aceso ? c.tema.pesoTitulo : 400, color: corDoTexto(c), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {aceso ? <ComDestaque c={c} texto={txt} /> : txt}
              </div>
            </div>
          );
        })}
      </div>
      {a.papel ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 6 * u, background: c.tema.vox?.realce ?? misturar(a.acento, "#ffffff", 0.2) }} /> : null}
    </div>
  );
}
