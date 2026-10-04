import React from "react";
import { Icone, limitar, lista, misturar, rgba, saiSuave, texto, type Ctx } from "../base";
import { acaso, molaFisica } from "../kit";
import { luzDaMarca, marcaPorNome } from "../marcas";

/**
 * AS PEÇAS DA LOUSA (04/10/2026). O dono mandou 14 quadros reais do Dan
 * Martell como TREINO (docs/overlays/referencias/dan-martell/bruno-0410,
 * dm-01 a dm-14) e pediu a mesma composição, letra, brilho, gradiente e
 * movimento, na cor de acento da marca (azul vivo no padrão da lousa):
 *
 *   palavra-gigante   dm-01  a palavra do impacto em branco pesado, com a menor por cima, sobre a gravação escurecida e desfocada
 *   busca             dm-02/03  a barra de vidro com o texto sendo digitado e a pílula "Pensando..." no fundo azul com brilho embaixo
 *   legenda-destaque  dm-04  a legenda grande em negrito com UMA palavra sublinhada pela barra do acento
 *   grade-azul        dm-05  a grade de cor azul e escura por cima do B-roll (o resolvedor põe sozinho)
 *   pilha-passos      dm-06/07  os losangos numerados em pilha isométrica, o passo dito aceso e com a chamada ao lado
 *   marca-brilho      dm-08  o ícone com brilho e o nome grande ao lado da pessoa
 *   notebook          dm-09  o notebook em 3D com a tela de formulário e o cursor que preenche
 *   ilustracao-traco  dm-10  o desenho de traço apagado ao fundo e a frase digitada por cima
 *   chat              dm-11  a caixa de prompt de IA embaixo, com o texto digitando
 *   material          dm-12  a capa do material com o título condensado e o ícone de neon, folhas em leque atrás
 *   seguir            dm-13  o celular com o perfil do PRÓPRIO cliente e a pílula da chamada
 *   ferramentas       dm-14  os ícones das ferramentas em placas brancas com moldura cromada, no feixe de luz
 *
 * Marca citada na fala usa o ícone oficial (marcas.ts, Simple Icons); sem
 * ela na biblioteca, o ícone genérico do catálogo.
 */

// ─────────────────────────────── partes comuns ───────────────────────────────

const GEIST = "Geist, sans-serif";
const PESADA = '"Liberation Sans", Geist, sans-serif';

const semAsteriscos = (s: string) => s.replace(/\*\*/g, "");

/** O texto digitado até o instante (cps letras por segundo, a partir de `inicio`). */
function digitado(txt: string, t: number, inicio: number, cps: number): { visivel: string; acabou: boolean } {
  const n = Math.max(0, Math.floor((t - inicio) * cps));
  return { visivel: txt.slice(0, n), acabou: n >= txt.length };
}

/** A velocidade da digitação: termina em `fracao` da duração (nunca mais devagar que 14 letras/s). */
const velocidade = (txt: string, dur: number, inicio: number, fracao = 0.55) => Math.max(14, txt.length / Math.max(0.7, dur * fracao - inicio));

/** O cursor de texto: sólido enquanto digita, piscando depois. */
function Cursor({ t, acabou, cor = "#ffffff", largura = 0.07 }: { t: number; acabou: boolean; cor?: string; largura?: number }) {
  const liga = !acabou || Math.floor(t * 2.2) % 2 === 0;
  return <span style={{ display: "inline-block", width: `${largura}em`, height: "0.95em", marginLeft: "0.04em", verticalAlign: "-0.12em", background: cor, opacity: liga ? 1 : 0 }} />;
}

/** O ícone da marca citada (oficial) ou o genérico do catálogo. */
function IconeOuMarca({ marca, icone, tam, cor, traco = 2, corDaMarca = true, contorno }: { marca?: unknown; icone?: unknown; tam: number; cor: string; traco?: number; corDaMarca?: boolean; contorno?: string }) {
  const m = marcaPorNome(marca);
  if (m) {
    const preenche = corDaMarca ? m.hex : cor;
    return (
      <svg width={tam} height={tam} viewBox="0 0 24 24" style={{ overflow: "visible" }}>
        {contorno && corDaMarca && luzDaMarca(m.hex) < 0.18 ? <path d={m.path} fill="none" stroke={contorno} strokeWidth={0.6} /> : null}
        <path d={m.path} fill={preenche} />
      </svg>
    );
  }
  return <Icone nome={texto(icone, "estrela")} tam={tam} cor={cor} traco={traco} />;
}

/** A tela cheia da lousa: entra e sai por dissolução e a câmera empurra devagar. */
function TelaLousa({ c, fundo, children }: { c: Ctx; fundo: React.ReactNode; children?: React.ReactNode }) {
  const e = saiSuave(c.t / 0.35);
  const empurra = 1 + 0.035 * saiSuave(c.t / Math.max(1, c.dur));
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: Math.min(e, c.fica) }}>
      <div style={{ position: "absolute", inset: 0 }}>{fundo}</div>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${empurra * (0.965 + 0.035 * e)})`, transformOrigin: "50% 50%" }}>{children}</div>
    </div>
  );
}

/** O azul profundo dos dm-02/03: cantos pretos, meio marinho e o brilho que sobe de baixo. */
function FundoAzul({ c }: { c: Ctx }) {
  if (luxo(c)) return <FundoLuxo c={c} />;
  const a = acentoDa(c);
  const deriva = Math.sin(c.t * 0.6) * 2;
  const brilhoForte = 0.9 + 0.08 * Math.sin(c.t * 1.3);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: [
          `radial-gradient(ellipse 58% 46% at ${50 + deriva}% 100%, ${rgba(misturar(a, "#e8fbff", 0.85), brilhoForte)} 0%, ${rgba(misturar(a, "#bfe8ff", 0.55), 0.92)} 24%, ${rgba(a, 0.6)} 50%, transparent 82%)`,
          `radial-gradient(ellipse 85% 80% at 50% 60%, ${misturar(a, "#000000", 0.5)} 0%, ${misturar(a, "#000000", 0.72)} 55%, #020309 100%)`,
        ].join(", "),
      }}
    />
  );
}

/** O feixe de luz dos dm-06 e dm-14: preto com uma faixa de luz azul esverdeada atravessando. */
function FundoFeixe({ c, giro = 0 }: { c: Ctx; giro?: number }) {
  if (luxo(c)) return <FundoLuxo c={c} de="feixe" />;
  const { W, H, tema } = c;
  const feixe = misturar(misturar(acentoDa(c), "#13c4d8", 0.45), "#000000", 0.35);
  const d = Math.sin(c.t * 0.5) * W * 0.01;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#010205", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: W * 0.5 - W * 0.16 + d, top: -H * 0.3, width: W * 0.32, height: H * 1.6, transform: `rotate(${giro}deg)`, background: `linear-gradient(90deg, transparent, ${rgba(feixe, 0.42)} 35%, ${rgba(misturar(feixe, "#ffffff", 0.15), 0.55)} 50%, ${rgba(feixe, 0.42)} 65%, transparent)`, filter: `blur(${Math.min(W, H) * 0.05}px)` }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 45% 30% at 45% 100%, ${rgba(misturar(acentoDa(c), "#000000", 0.3), 0.35)}, transparent 75%)` }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 75% at 50% 50%, transparent 55%, rgba(0,0,0,.6) 100%)" }} />
    </div>
  );
}

// ─────────────────────────────── o acabamento de luxo ───────────────────────────────

/**
 * O ACABAMENTO DE LUXO (04/10, a autoridade high ticket, estilo "consorcio"):
 * as mesmas peças e a mesma composição, com outro material: preto profundo e
 * marinho, dourado metálico com reflexo, toque de vermelho, mármore e metal
 * escovado, serifa elegante no título e sem serifa fina no apoio, brilho
 * dourado suave no lugar do neon.
 */
const OURO = "#d4af37";
const OURO_METAL = "linear-gradient(100deg, #7a5a1c 0%, #f7e7a8 26%, #c9a24a 48%, #fff4c8 64%, #9c7426 100%)";
const OURO_ARO = "linear-gradient(145deg, #fff4c8 0%, #9c7426 14%, #f7e7a8 28%, #6e5017 42%, #f3dc94 56%, #8a6a23 72%, #fff1bf 86%, #7a5a1c 100%)";
const SERIFA = '"Playfair Display", Georgia, serif';
const VERMELHO = "#b3122e";
const luxo = (c: Ctx) => c.tema.acabamento === "luxo";
/** O acento das peças: o da marca no tecnológico, o dourado no luxo. */
const acentoDa = (c: Ctx): string => (luxo(c) ? OURO : c.tema.acento);
const tintaDeOuro: React.CSSProperties = { background: OURO_METAL, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", textShadow: "none" };
const brilhoDeOuro = (u: number, k = 1) => `drop-shadow(0 0 ${6 * u * k}px rgba(212,175,55,.5)) drop-shadow(0 ${3 * u}px ${10 * u}px rgba(0,0,0,.6)) drop-shadow(0 0 ${22 * u}px rgba(0,0,0,.55))`;
const MARMORE = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900'><filter id='m'><feTurbulence type='fractalNoise' baseFrequency='.004 .012' numOctaves='5' seed='7'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -9 4.6'/></filter><rect width='900' height='900' filter='url(#m)'/></svg>"
)}")`;
const ESCOVADO = "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 1px, transparent 1px 3px, rgba(0,0,0,.05) 3px 4px)";

/** O fundo do luxo: preto profundo e marinho, o mármore escuro e a luz dourada que vem de `de`. */
function FundoLuxo({ c, de = "baixo" }: { c: Ctx; de?: "baixo" | "feixe" | "canto" }) {
  const { W, H } = c;
  const d = Math.sin(c.t * 0.5) * 2;
  const luz =
    de === "feixe"
      ? `linear-gradient(${104 + d}deg, transparent 30%, rgba(201,162,74,.16) 45%, rgba(247,231,168,.22) 50%, rgba(201,162,74,.16) 55%, transparent 70%)`
      : de === "canto"
      ? `radial-gradient(ellipse 70% 65% at 95% 108%, rgba(212,175,55,.42) 0%, rgba(140,100,30,.22) 38%, transparent 75%)`
      : `radial-gradient(ellipse 55% 42% at ${50 + d}% 104%, rgba(247,231,168,.62) 0%, rgba(201,162,74,.36) 30%, transparent 78%)`;
  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 85% 80% at 50% 50%, #0d1830 0%, #070b18 50%, #020206 100%)", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: MARMORE, backgroundSize: `${Math.max(W, H)}px ${Math.max(W, H)}px`, opacity: 0.018, mixBlendMode: "screen" }} />
      <div style={{ position: "absolute", inset: 0, background: luz }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: H * 0.004, background: `linear-gradient(90deg, transparent, ${rgba(VERMELHO, 0.0)}, transparent)` }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 75% at 50% 50%, transparent 55%, rgba(0,0,0,.65) 100%)" }} />
    </div>
  );
}

/** Brilho branco de texto sobre o escuro (o título dos dm-06/07, o nome do dm-08). */
const brilhoBranco = (u: number, k = 1) => `0 0 ${8 * u * k}px rgba(255,255,255,.75), 0 0 ${24 * u * k}px rgba(255,255,255,.45), 0 0 ${60 * u * k}px rgba(255,255,255,.2)`;

// ─────────────────────────────── dm-01: palavra gigante ───────────────────────────────

/**
 * A PALAVRA GIGANTE do impacto: a gravação escurece e desfoca (a caixa de
 * vidro do tamanho da tela) e a palavra chega pesada, em branco, com a menor
 * apoiada no alto dela ("estraga TUDO").
 */
export function PalavraGigante(c: Ctx) {
  const { W, H, vertical, props: p } = c;
  const palavra = semAsteriscos(texto(p.palavra ?? p.texto)).trim();
  const apoio = semAsteriscos(texto(p.apoio)).trim();
  const n = Math.max(2, palavra.length);
  // A largura da palavra em "em": maiúscula larga, minúscula estreita (prova de 04/10: ESSENCIAL saía cortada no 9:16).
  const emDaPalavra = Math.max(1.2, [...palavra].reduce((t, ch) => t + (/[A-ZÁÂÃÀÉÊÍÓÔÕÚÇMW]/.test(ch) ? 0.67 : /[mw]/.test(ch) ? 0.86 : /[iljtf]/.test(ch) ? 0.3 : 0.56), 0));
  const fs = Math.min(H * (vertical ? 0.26 : 0.56), (W * (vertical ? 0.88 : 0.8)) / (emDaPalavra * 0.96 * 1.04));
  const fsA = Math.max(fs * 0.27, Math.min(W, H) * 0.06);
  const veu = saiSuave(c.t / 0.3) * c.fica;
  const m = molaFisica(c.t - 0.04, 200, 17);
  const ma = molaFisica(c.t - 0.2, 190, 17);
  const deriva = 1 + 0.03 * saiSuave(c.t / Math.max(1, c.dur));
  const largura = n * 0.58 * fs;
  const L = luxo(c);
  const estiloPalavra: React.CSSProperties = L
    ? { fontFamily: SERIFA, fontWeight: 800, letterSpacing: "-0.02em", ...tintaDeOuro, filter: brilhoDeOuro(c.u, 1.6), paddingBottom: fs * 0.08 }
    : { fontFamily: PESADA, fontWeight: 700, letterSpacing: "-0.045em", color: "#ffffff", textShadow: `0 ${fs * 0.02}px ${fs * 0.12}px rgba(0,0,0,.25)` };
  const estiloApoio: React.CSSProperties = L
    ? { fontFamily: GEIST, fontWeight: 400, fontSize: fsA * 0.5, letterSpacing: "0.34em", textTransform: "uppercase", color: "#f3ead4", top: -fsA * 0.55 }
    : { fontFamily: PESADA, fontWeight: 700, fontSize: fsA, letterSpacing: "-0.03em", color: "#ffffff", top: -fsA * 0.82 };
  return (
    <>
      <div data-vidro="1" style={{ position: "absolute", inset: 0, background: L ? "rgba(3,6,16,.74)" : "rgba(0,0,0,.7)", opacity: veu }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: c.fica }}>
        <div style={{ position: "relative", transform: `scale(${(1.22 - 0.22 * m) * deriva})`, opacity: limitar(c.t / 0.12), marginTop: apoio ? fsA * 0.6 : 0 }}>
          <div style={{ fontSize: L ? fs * 0.92 : fs, lineHeight: 0.9, whiteSpace: "nowrap", ...estiloPalavra }}>{palavra}</div>
          {apoio ? (
            <div
              style={{
                position: "absolute",
                left: Math.min(largura * 0.18, fs * 0.5),
                lineHeight: 1,
                whiteSpace: "nowrap",
                ...estiloApoio,
                opacity: limitar((c.t - 0.2) / 0.12),
                transform: `translateX(${(1 - ma) * -fsA * 0.8}px)`,
              }}
            >
              {apoio}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────── dm-02/03: barra de busca ───────────────────────────────

/** A esfera de partículas do "Pensando..." (dm-03), girando. */
function Esfera({ tam, t, cor, segunda = "#7b5cff" }: { tam: number; t: number; cor: string; segunda?: string }) {
  const N = 150;
  const pontos: React.ReactNode[] = [];
  const giro = t * 1.4;
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = i * 2.399963 + giro;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (z < -0.15) continue;
    const s = (0.035 + 0.05 * (z + 1) * 0.5) * tam * (0.6 + 0.6 * acaso(i, 3));
    const roxo = acaso(i, 9) > 0.55;
    pontos.push(<circle key={i} cx={tam / 2 + x * tam * 0.44} cy={tam / 2 + y * tam * 0.44} r={s / 2} fill={roxo ? segunda : cor} opacity={0.45 + 0.55 * (z + 1) * 0.5} />);
  }
  return (
    <svg width={tam} height={tam} style={{ flex: "0 0 auto", filter: `drop-shadow(0 0 ${tam * 0.08}px ${rgba(cor, 0.5)})` }}>
      <circle cx={tam / 2} cy={tam / 2} r={tam * 0.46} fill={rgba(cor, 0.12)} />
      {pontos}
    </svg>
  );
}

/** A seta do mouse (preenchida no acento, borda clara). */
function SetaDoMouse({ tam, cor }: { tam: number; cor: string }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" style={{ overflow: "visible", filter: `drop-shadow(0 ${tam * 0.06}px ${tam * 0.1}px rgba(0,0,0,.35))` }}>
      <path d="M3 2 L21 10.5 L13 12.6 L9.6 21 Z" fill={cor} stroke={misturar(cor, "#ffffff", 0.45)} strokeWidth={1.1} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A BARRA DE BUSCA: vidro claro com brilho branco no fundo azul; a pergunta
 * é digitada com o cursor e a seta do mouse chega na lupa. No evento (a IA
 * "pensa"), a barra vira a pílula "Pensando..." com a esfera de partículas.
 */
export function Busca(c: Ctx) {
  const { W, H, u, vertical, props: p, tema } = c;
  const q = semAsteriscos(texto(p.texto)).trim();
  const pensa = p.pensando === false ? "" : texto(p.pensando, "Pensando...");
  const ev = pensa && c.passos.length ? saiSuave(c.passos[0]) : 0;
  const ini = 0.45;
  const d = digitado(q, c.t, ini, velocidade(q, c.dur, ini, pensa && c.passos.length ? 0.4 : 0.55));
  const bw = vertical ? W * 0.88 : W * 0.6;
  const fs = Math.min(vertical ? 60 * u : 0.05 * H, (bw - 200 * u) / (Math.max(10, q.length) * 0.55) * (vertical ? 1.9 : 1));
  const chega = molaFisica(c.t - 0.1, 180, 16);
  const pw = vertical ? W * 0.62 : W * 0.33;
  const largura = bw + (pw - bw) * ev;
  const raio = 40 * u;
  const marca = marcaPorNome(p.marca);
  const mouse = molaFisica(c.t - ini - 0.3, 120, 15);
  const L = luxo(c);
  const tinta = L ? "#f3ead4" : "#111318";
  return (
    <TelaLousa c={c} fundo={<FundoAzul c={c} />}>
      <div style={{ position: "absolute", left: 0, right: 0, top: vertical ? H * 0.4 : H * 0.43, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            position: "relative",
            width: largura,
            minHeight: vertical ? 150 * u : 0.135 * H,
            borderRadius: raio,
            background: L ? "linear-gradient(180deg, rgba(38,40,48,.94), rgba(12,13,18,.96))" : "linear-gradient(180deg, #f1f4fa, #dde4ef)",
            border: L ? `${1.6 * u}px solid rgba(212,175,55,.85)` : "none",
            boxShadow: L
              ? `0 0 ${22 * u}px rgba(212,175,55,.35), 0 ${20 * u}px ${60 * u}px rgba(0,0,0,.6), inset 0 ${1.5 * u}px 0 rgba(255,244,200,.25)`
              : `0 0 ${26 * u}px rgba(255,255,255,.55), 0 0 ${80 * u}px rgba(190,215,255,.35), inset 0 ${2 * u}px 0 rgba(255,255,255,.9)`,
            transform: `translateY(-50%) scale(${0.82 + 0.18 * chega})`,
            opacity: limitar((c.t - 0.1) / 0.15),
            display: "flex",
            alignItems: "center",
            padding: `${22 * u}px ${48 * u}px`,
          }}
        >
          {/* A busca (some no evento). */}
          <div style={{ display: "flex", alignItems: "center", width: "100%", opacity: 1 - limitar(ev * 2.2), position: ev > 0.45 ? "absolute" : "relative", left: ev > 0.45 ? 48 * u : undefined, right: ev > 0.45 ? 48 * u : undefined }}>
            {marca ? <span style={{ marginRight: 22 * u, display: "inline-flex" }}><IconeOuMarca marca={p.marca} tam={fs * 1.05} cor={tinta} contorno="#ffffff" /></span> : null}
            <div style={{ flex: 1, fontFamily: GEIST, fontSize: fs, lineHeight: 1.15, color: tinta, letterSpacing: "-0.01em", fontWeight: L ? 500 : 700 }}>
              {d.visivel}
              <Cursor t={c.t} acabou={d.acabou} cor={L ? OURO : tinta} largura={0.06} />
            </div>
            <svg width={fs * 1.15} height={fs * 1.15} viewBox="0 0 24 24" fill="none" stroke={L ? OURO : tinta} strokeWidth={2.4} strokeLinecap="round" style={{ marginLeft: 24 * u, flex: "0 0 auto" }}>
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="M15.5 15.5 L21 21" />
            </svg>
          </div>
          {/* A pílula "Pensando...". */}
          {ev > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 30 * u, width: "100%", justifyContent: "center", opacity: limitar((ev - 0.35) * 2.5) }}>
              <Esfera tam={fs * 1.6} t={c.t} cor={acentoDa(c)} segunda={L ? "#fff1bf" : "#7b5cff"} />
              <span style={L ? { fontFamily: SERIFA, fontStyle: "italic", fontWeight: 500, fontSize: fs * 1.1, ...tintaDeOuro } : { fontFamily: GEIST, fontWeight: 400, fontSize: fs * 1.05, background: `linear-gradient(90deg, ${misturar(acentoDa(c), "#000000", 0.15)}, ${misturar(acentoDa(c), "#7b5cff", 0.35)})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{pensa}</span>
            </div>
          ) : null}
          {/* A seta do mouse chegando na lupa. */}
          {ev < 0.5 ? (
            <div style={{ position: "absolute", right: -fs * 0.4, bottom: -fs * 1.25, transform: `translate(${(1 - mouse) * 260 * u}px, ${(1 - mouse) * 180 * u}px)`, opacity: limitar((c.t - ini - 0.3) / 0.2) * (1 - ev * 2) }}>
              <SetaDoMouse tam={fs * 1.5} cor={acentoDa(c)} />
            </div>
          ) : null}
        </div>
      </div>
    </TelaLousa>
  );
}

// ─────────────────────────────── dm-04: legenda com a palavra sublinhada ───────────────────────────────

/**
 * A LEGENDA DA LOUSA: a frase inteira em branco negrito embaixo e UMA palavra
 * (entre **asteriscos**) sublinhada pela barra do acento, que corre quando a
 * palavra é dita (o evento).
 */
export function LegendaDestaque(c: Ctx) {
  const { W, H, u, vertical, props: p, tema } = c;
  const bruto = texto(p.texto).trim();
  const partes = bruto.split(/\*\*(.+?)\*\*/g);
  const corre = c.passos.length ? saiSuave(c.passos[0] * 1.4) : saiSuave((c.t - 0.15) / 0.35);
  const fs = vertical ? 58 * u : 70 * u;
  const e = saiSuave(c.t / 0.14);
  const a = acentoDa(c);
  return (
    <div
      style={{
        position: "absolute",
        left: vertical ? W * 0.06 : W * 0.05,
        right: vertical ? W * 0.06 : W * 0.05,
        top: vertical ? H * 0.665 : H * 0.735,
        textAlign: "center",
        fontFamily: GEIST,
        fontWeight: 700,
        fontSize: fs,
        lineHeight: 1.22,
        letterSpacing: "-0.012em",
        color: "#ffffff",
        textShadow: `0 ${3 * u}px ${16 * u}px rgba(0,0,0,.55), 0 0 ${3 * u}px rgba(0,0,0,.35)`,
        opacity: e * c.fica,
        transform: `translateY(${(1 - e) * 10 * u}px)`,
      }}
    >
      {partes.map((pt, i) =>
        i % 2 === 0 ? (
          <React.Fragment key={i}>{pt}</React.Fragment>
        ) : (
          <span key={i} style={{ position: "relative", display: "inline-block" }}>
            {pt}
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: "-0.02em",
                right: "-0.02em",
                bottom: "-0.2em",
                height: "0.15em",
                borderRadius: 999,
                background: luxo(c) ? OURO_METAL : `linear-gradient(90deg, ${misturar(a, "#ffffff", 0.25)}, ${a})`,
                boxShadow: `0 0 ${10 * u}px ${rgba(a, 0.6)}`,
                transform: `scaleX(${corre})`,
                transformOrigin: "left",
              }}
            />
          </span>
        )
      )}
    </div>
  );
}

// ─────────────────────────────── dm-05: grade azul do B-roll ───────────────────────────────

/** A GRADE DE COR da lousa sobre o B-roll: azul profundo, sombras fundas e a vinheta. */
export function GradeAzul(c: Ctx) {
  // No luxo, o marinho fundo com o calor do dourado nas luzes (imóvel, carro, relógio).
  const a = luxo(c) ? "#0a1430" : misturar(acentoDa(c), "#000000", 0.6);
  const e = saiSuave(c.t / 0.2) * c.fica;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: e }}>
      <div style={{ position: "absolute", inset: 0, background: rgba(a, luxo(c) ? 0.5 : 0.62) }} />
      {luxo(c) ? <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 50% at 70% 30%, rgba(212,175,55,.16), transparent 70%)" }} /> : null}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${rgba("#000000", 0.25)}, transparent 35%, transparent 65%, ${rgba("#000000", 0.45)})` }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 75% 70% at 50% 45%, transparent 45%, rgba(0,0,0,.6) 100%)" }} />
    </div>
  );
}

// ─────────────────────────────── dm-06/07: pilha de passos ───────────────────────────────

/**
 * A PILHA DE PASSOS: o título com brilho no alto e os losangos numerados em
 * pilha isométrica; o passo dito acende com o brilho do acento e ganha a
 * linha de chamada com o nome ao lado; os que vêm depois ficam apagados.
 */
export function PilhaPassos(c: Ctx) {
  const { W, H, u, vertical, props: p, tema } = c;
  const itens = lista<{ rotulo?: string; texto?: string }>(p.itens).slice(0, 5);
  const n = Math.max(1, itens.length);
  const prog = itens.map((_, k) => (c.passos.length > k ? c.passos[k] : 0));
  let atual = -1;
  prog.forEach((q, k) => {
    if (q > 0) atual = k;
  });
  const titulo = semAsteriscos(texto(p.titulo));
  const a = acentoDa(c);
  const y0 = vertical ? H * 0.3 : H * 0.25;
  const y1 = vertical ? H * 0.84 : H * 0.97;
  const passo = (y1 - y0) / n;
  const dh = Math.min(passo * 1.06, vertical ? H * 0.12 : H * 0.165);
  const dw = dh / 0.52;
  const cx = vertical ? W * 0.3 : W * 0.5;
  const lado = dw / Math.SQRT2;
  const fsTitulo = vertical ? 70 * u : 0.072 * H;
  const fsRotulo = vertical ? 46 * u : 0.036 * H;
  const L = luxo(c);
  const losango = (k: number) => {
    const q = prog[k];
    const aceso = k <= atual;
    const ativo = k === atual;
    const chega = molaFisica(c.t - 0.2 - k * 0.09, 170, 15);
    const cy = y0 + passo * (k + 0.5);
    const luz = ativo ? 1 : aceso ? 0.6 : 0;
    const pulso = ativo ? Math.sin(limitar(q) * Math.PI) * 0.4 : 0;
    const quadrado = (extra: React.CSSProperties, conteudo?: React.ReactNode) => (
      <div style={{ position: "absolute", left: (dw - lado) / 2, top: (dw - lado) / 2, width: lado, height: lado, borderRadius: lado * 0.2, transform: `scaleY(0.52) rotate(45deg)`, transformOrigin: "50% 50%", ...extra }}>{conteudo}</div>
    );
    return (
      <div key={k} style={{ position: "absolute", left: cx - dw / 2, top: cy - dw / 2 - (ativo ? 6 * u * limitar(q) : 0), width: dw, height: dw, zIndex: k + 1, opacity: limitar((c.t - 0.2 - k * 0.09) / 0.15), transform: `translateY(${(1 - chega) * -80 * u}px)` }}>
        {/* A espessura: a borda cromada de baixo. */}
        <div style={{ position: "absolute", inset: 0, transform: `translateY(${dh * 0.09}px)` }}>
          {quadrado({ background: L ? "linear-gradient(135deg, #c9a24a, #6e5017 60%, #2a1f08)" : `linear-gradient(135deg, #b9c0ca, #5d6470 60%, #2a2f37)`, boxShadow: luz && L ? `0 0 ${(30 + 20 * pulso) * u}px ${rgba(a, 0.6 * luz)}, 0 0 ${110 * u}px ${rgba(a, 0.3 * luz)}` : luz ? `0 0 ${(40 + 30 * pulso) * u}px ${rgba(a, 0.95 * luz)}, 0 0 ${120 * u}px ${rgba(a, 0.7 * luz)}, 0 0 ${220 * u}px ${rgba(a, 0.35 * luz)}` : "none" })}
        </div>
        {quadrado(
          {
            background: L ? OURO_ARO : `linear-gradient(135deg, #ffffff, #c9cfd8 40%, #f4f6f9 70%, #9aa2ad)`,
            padding: lado * 0.045,
            boxShadow: luz ? `0 0 ${(26 + 20 * pulso) * u}px ${rgba(misturar(a, "#ffffff", 0.2), luz)}, 0 0 ${80 * u}px ${rgba(a, 0.6 * luz)}` : `0 0 ${10 * u}px rgba(255,255,255,.25)`,
          },
          <div style={{ width: "100%", height: "100%", borderRadius: lado * 0.17, background: L ? (aceso ? "radial-gradient(circle at 30% 30%, #1a2a4a, #070c18 75%)" : "radial-gradient(circle at 30% 30%, #121a2c, #05070d 75%)") : aceso ? `radial-gradient(circle at 30% 30%, ${misturar(a, "#0b1a2a", 0.72)}, #071019 75%)` : "radial-gradient(circle at 30% 30%, #1a2230, #06090e 75%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: L ? SERIFA : GEIST, fontWeight: 700, fontSize: lado * (L ? 0.5 : 0.46), color: aceso ? "#ffffff" : "rgba(255,255,255,.92)", transform: "rotate(-12deg) scale(1.05, 1.25)", textShadow: aceso ? `0 0 ${10 * u}px ${rgba(a, 0.8)}` : "none", ...(L ? tintaDeOuro : {}), lineHeight: 1 }}>{k + 1}</span>
          </div>
        )}
      </div>
    );
  };
  const chamada = atual >= 0 ? itens[atual] : null;
  const qa = atual >= 0 ? saiSuave(prog[atual] * 1.3) : 0;
  const cyA = y0 + passo * (atual + 0.5);
  const xTip = cx + dw / 2 + 4 * u;
  const linha = vertical ? 46 * u : W * 0.075;
  return (
    <TelaLousa c={c} fundo={<FundoFeixe c={c} />}>
      {titulo ? (
        <div style={{ position: "absolute", left: W * 0.05, right: W * 0.05, top: vertical ? H * 0.1 : H * 0.07, textAlign: "center", fontFamily: L ? SERIFA : GEIST, fontWeight: 700, fontSize: fsTitulo * (L ? 1.05 : 1), lineHeight: 1.08, letterSpacing: L ? "0" : "-0.02em", color: L ? "#f6efdc" : "#ffffff", textShadow: L ? `0 0 ${18 * u}px rgba(212,175,55,.45), 0 ${3 * u}px ${12 * u}px rgba(0,0,0,.6)` : brilhoBranco(u), opacity: saiSuave((c.t - 0.05) / 0.3), transform: `translateY(${(1 - saiSuave(c.t / 0.4)) * 20 * u}px)` }}>
          {titulo}
        </div>
      ) : null}
      {itens.map((_, k) => losango(k))}
      {chamada ? (
        <div style={{ position: "absolute", left: xTip, top: cyA, zIndex: 20, display: "flex", alignItems: "center", transform: "translateY(-50%)" }}>
          <span style={{ width: 12 * u, height: 12 * u, borderRadius: "50%", border: `${2.2 * u}px solid ${L ? OURO : "#fff"}`, flex: "0 0 auto", opacity: limitar(qa * 3) }} />
          <span style={{ width: linha * qa, height: 2.2 * u, background: L ? OURO_METAL : "#fff", flex: "0 0 auto" }} />
          <span style={{ marginLeft: 14 * u, fontFamily: GEIST, fontWeight: L ? 400 : 700, fontSize: fsRotulo, lineHeight: 1.12, color: "#ffffff", maxWidth: W - xTip - linha - (vertical ? W * 0.05 : W * 0.04), opacity: limitar((qa - 0.5) * 2), transform: `translateX(${(1 - qa) * 16 * u}px)` }}>
            {semAsteriscos(texto(chamada.rotulo ?? chamada.texto))}
          </span>
        </div>
      ) : null}
    </TelaLousa>
  );
}

// ─────────────────────────────── dm-08: logo com brilho ───────────────────────────────

/**
 * A MARCA COM BRILHO ao lado da pessoa: o ícone (o oficial, quando a fala
 * cita a marca; a logo do próprio cliente com `usarLogo`; senão o genérico)
 * em branco com brilho, e o nome grande embaixo.
 */
export function MarcaBrilho(c: Ctx) {
  const { W, H, u, vertical, props: p, logoUrl } = c;
  const nome = semAsteriscos(texto(p.nome)).trim();
  const lado = p.lado === "esquerda" ? "esquerda" : "direita";
  const cx = vertical ? W * 0.5 : lado === "direita" ? W * 0.745 : W * 0.255;
  const tamIcone = vertical ? H * 0.14 : H * 0.235;
  const fs = vertical ? Math.min(92 * u, (W * 0.86) / Math.max(4, nome.length * 0.56)) : Math.min(0.1 * H, (W * 0.42) / Math.max(4, nome.length * 0.56));
  const topo = vertical ? H * 0.5 : H * 0.17;
  const m = molaFisica(c.t - 0.05, 170, 14);
  const mn = molaFisica(c.t - 0.22, 180, 16);
  const pulso = 1 + 0.25 * Math.max(0, Math.sin(limitar((c.t - 0.2) / 0.6) * Math.PI));
  const brilhoIcone = `drop-shadow(0 0 ${6 * u * pulso}px rgba(255,255,255,.9)) drop-shadow(0 0 ${22 * u * pulso}px rgba(255,255,255,.55)) drop-shadow(0 0 ${50 * u}px rgba(255,255,255,.25))`;
  const usarLogo = p.usarLogo === true && logoUrl;
  const L = luxo(c);
  const brilhoDoIcone = L ? `drop-shadow(0 0 ${5 * u * pulso}px rgba(247,231,168,.7)) drop-shadow(0 0 ${20 * u * pulso}px rgba(212,175,55,.45)) drop-shadow(0 ${4 * u}px ${12 * u}px rgba(0,0,0,.5))` : brilhoIcone;
  const estiloNome: React.CSSProperties = L
    ? { fontFamily: SERIFA, fontWeight: 700, letterSpacing: "0", ...tintaDeOuro, filter: brilhoDeOuro(u, 1.2), paddingBottom: fs * 0.1 }
    : { fontFamily: GEIST, fontWeight: 700, letterSpacing: "-0.025em", color: "#ffffff", textShadow: `${brilhoBranco(u, 0.8)}, 0 ${4 * u}px ${30 * u}px rgba(0,0,0,.35)` };
  return (
    <div style={{ position: "absolute", left: cx, top: topo, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", opacity: c.fica }}>
      <div style={{ transform: `scale(${0.6 + 0.4 * m})`, opacity: limitar(c.t / 0.15), filter: brilhoDoIcone, height: tamIcone, display: "flex", alignItems: "center" }}>
        {usarLogo ? (
          <img src={String(logoUrl)} style={{ height: tamIcone, maxWidth: tamIcone * 2.4, objectFit: "contain" }} />
        ) : (
          <IconeOuMarca marca={p.marca ?? p.nome} icone={p.icone} tam={tamIcone} cor={L ? "#e9cf7a" : "#ffffff"} traco={1.6} corDaMarca={false} />
        )}
      </div>
      <div style={{ marginTop: tamIcone * (vertical ? 0.14 : 0.1), fontSize: fs, lineHeight: 1, whiteSpace: "nowrap", ...estiloNome, opacity: limitar((c.t - 0.22) / 0.15), transform: `translateY(${(1 - mn) * 30 * u}px)` }}>
        {nome}
      </div>
    </div>
  );
}

// ─────────────────────────────── dm-09: notebook com a tela ───────────────────────────────

/**
 * O NOTEBOOK EM 3D com a tela de um formulário do processo: a cada evento o
 * cursor (com o brilho do acento) vai ao campo seguinte e o valor é digitado.
 */
export function Notebook(c: Ctx) {
  const { W, H, u, vertical, props: p, tema } = c;
  const campos = lista<{ rotulo?: string; valor?: string }>(p.campos).slice(0, 4);
  const titulo = semAsteriscos(texto(p.titulo, "Novo pedido"));
  const sub = semAsteriscos(texto(p.subtitulo));
  const LW = vertical ? W * 0.94 : W * 0.74;
  const LH = LW * 0.63;
  const a = acentoDa(c);
  const prog = campos.map((_, k) => (c.passos.length > k ? c.passos[k] : c.passos.length ? 0 : limitar((c.t - 0.8 - k * 0.9) / 0.6)));
  let atual = 0;
  prog.forEach((q, k) => {
    if (q > 0) atual = k;
  });
  const entra = molaFisica(c.t - 0.05, 120, 16);
  const giro = -16 + 3 * saiSuave(c.t / Math.max(1, c.dur));
  const sx = LW * 0.92; // a tela útil
  const sy = LH * 0.9;
  const fsT = sy * 0.075;
  const fsL = sy * 0.034;
  const topoCampos = sy * (sub ? 0.33 : 0.27);
  const passoCampo = sy * 0.16;
  // O cursor desliza entre os campos.
  const alvoY = (k: number) => topoCampos + passoCampo * k + fsL * 1.5 + sy * 0.04;
  const k0 = Math.max(0, atual - 1);
  const qMov = saiSuave(limitar((prog[atual] ?? 0) * 2));
  const cursorY = atual === 0 ? alvoY(0) : alvoY(k0) + (alvoY(atual) - alvoY(k0)) * qMov;
  const cursorX = sx * 0.42 + Math.sin(c.t * 1.3) * sx * 0.01;
  const chegaCursor = molaFisica(c.t - 0.6, 110, 15);
  return (
    <TelaLousa c={c} fundo={luxo(c) ? <FundoLuxo c={c} de="canto" /> : <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 65% at 50% 40%, #2a2c31, #0e0f12 65%, #060607)" }} />}>
      <div style={{ position: "absolute", left: (W - LW) / 2, top: vertical ? H * 0.22 : H * 0.06, width: LW, perspective: 2600 * u }}>
        <div style={{ transform: `translateY(${(1 - entra) * 120 * u}px) rotateY(${giro}deg) rotateX(6deg) rotateZ(-1.5deg)`, transformStyle: "preserve-3d", opacity: limitar(c.t / 0.2) }}>
          {/* A tampa com a tela. */}
          <div style={{ position: "relative", width: LW, height: LH, borderRadius: 34 * u, background: "linear-gradient(160deg, #3b3f46, #0b0c0e 30%)", padding: `${LH * 0.04}px ${LW * 0.035}px ${LH * 0.06}px`, boxShadow: `0 0 0 ${3 * u}px ${luxo(c) ? "#c9a24a" : "#9aa0a8"}, 0 ${40 * u}px ${90 * u}px rgba(0,0,0,.6)` }}>
            <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 10 * u, overflow: "hidden", background: "linear-gradient(180deg, #f6f9fc, #edf2f8)" }}>
              <div style={{ position: "absolute", left: sx * 0.12, top: sy * 0.08, right: sx * 0.08 }}>
                <div style={{ fontFamily: GEIST, fontWeight: 700, fontSize: fsT, color: "#14161a", letterSpacing: "-0.02em" }}>{titulo}</div>
                {sub ? <div style={{ fontFamily: GEIST, fontWeight: 400, fontSize: fsL * 0.95, color: "#6b7280", marginTop: sy * 0.015 }}>{sub}</div> : null}
              </div>
              {campos.map((f, k) => {
                const q = prog[k];
                const val = semAsteriscos(texto(f.valor));
                const d = digitado(val, q * 1.2, 0.15, Math.max(10, val.length / 0.6));
                const foco = k === atual && q > 0;
                return (
                  <div key={k} style={{ position: "absolute", left: sx * 0.12, top: topoCampos + passoCampo * k, width: sx * 0.62 }}>
                    <div style={{ fontFamily: GEIST, fontWeight: 600, fontSize: fsL, color: "#1f2328" }}>{semAsteriscos(texto(f.rotulo))}</div>
                    <div style={{ marginTop: sy * 0.012, height: sy * 0.085, borderRadius: 10 * u, background: "#ffffff", border: `${1.6 * u}px solid ${foco ? a : "#d3d9e2"}`, boxShadow: foco ? `0 0 0 ${4 * u}px ${rgba(a, 0.18)}` : "none", display: "flex", alignItems: "center", padding: `0 ${sx * 0.02}px`, fontFamily: GEIST, fontWeight: 500, fontSize: fsL * 1.15, color: "#111" }}>
                      {q > 0 ? (
                        <>
                          {d.visivel}
                          {foco ? <Cursor t={c.t} acabou={d.acabou} cor="#111" largura={0.05} /> : null}
                        </>
                      ) : (
                        <span style={{ color: "#9aa3af" }}>...</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* O cursor do mouse com o brilho do acento. */}
              <div style={{ position: "absolute", left: cursorX, top: cursorY, transform: `translate(${(1 - chegaCursor) * sx * 0.3}px, ${(1 - chegaCursor) * sy * 0.3}px)`, opacity: limitar((c.t - 0.6) / 0.2) }}>
                <div style={{ position: "absolute", left: -sy * 0.09, top: -sy * 0.09, width: sy * 0.2, height: sy * 0.2, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(a, 0.45)}, transparent 70%)` }} />
                <SetaDoMouse tam={sy * 0.075} cor={a} />
              </div>
              {/* O reflexo do vidro da tela. */}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, rgba(255,255,255,.35) 0%, transparent 28%)", pointerEvents: "none" }} />
            </div>
          </div>
          {/* A base com o teclado. */}
          <div style={{ position: "relative", width: LW * 1.08, marginLeft: -LW * 0.04, height: LW * 0.3, transform: "rotateX(72deg)", transformOrigin: "50% 0", borderRadius: `${10 * u}px ${10 * u}px ${30 * u}px ${30 * u}px`, background: "linear-gradient(180deg, #2a2d33, #3b3f46)", boxShadow: `0 0 0 ${3 * u}px #8d939b` }}>
            <div style={{ position: "absolute", left: "8%", right: "8%", top: "8%", height: "56%", borderRadius: 6 * u, backgroundImage: `repeating-linear-gradient(90deg, #121417 0 ${LW * 0.05}px, transparent ${LW * 0.05}px ${LW * 0.058}px), repeating-linear-gradient(180deg, transparent 0 ${LW * 0.044}px, #2a2d33 ${LW * 0.044}px ${LW * 0.052}px)` }} />
            <div style={{ position: "absolute", left: "34%", right: "34%", bottom: "8%", height: "22%", borderRadius: 6 * u, background: "#30343a", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }} />
          </div>
        </div>
      </div>
    </TelaLousa>
  );
}

// ─────────────────────────────── dm-10: ilustração de traço ───────────────────────────────

type Ponto = [number, number];

function curvaFechada(pts: Ponto[]): string {
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + "Z";
}

function curvaAberta(pts: Ponto[]): string {
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function dentro(pt: Ponto, poli: Ponto[]): boolean {
  let s = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, yi] = poli[i];
    const [xj, yj] = poli[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) s = !s;
  }
  return s;
}

/** O cérebro de traço (vista de lado), em 1000 x 800: contorno, sulcos, cerebelo e tronco. */
function tracosDoCerebro(): string[] {
  const cortex: Ponto[] = [[175, 430], [168, 330], [212, 232], [298, 152], [420, 96], [560, 80], [700, 104], [812, 170], [884, 262], [904, 362], [884, 452], [832, 520], [760, 560], [690, 574], [640, 598], [560, 610], [470, 592], [398, 602], [318, 590], [248, 552], [198, 500]];
  const cerebelo: Ponto[] = [[622, 602], [700, 574], [800, 560], [858, 600], [846, 662], [784, 704], [694, 704], [632, 666]];
  const tracos: string[] = [curvaFechada(cortex), curvaFechada(cerebelo)];
  // O tronco.
  tracos.push("M598,612 C606,660 612,710 618,770", "M662,642 C664,690 668,730 672,770");
  // As fissuras grandes (lateral e central).
  tracos.push(curvaAberta([[318, 478], [400, 452], [490, 440], [570, 420], [640, 402], [700, 372]]));
  tracos.push(curvaAberta([[566, 92], [552, 170], [540, 250], [522, 330], [500, 420]]));
  // Os giros: cada um é uma "salsicha" dobrada (a espinha suave e o contorno
  // dos dois lados, fechado), como no traço de anatomia.
  const encolhido: Ponto[] = cortex.map(([x, y]) => [540 + (x - 540) * 0.95, 345 + (y - 345) * 0.93]);
  for (let i = 0; i < 120; i++) {
    let x = 0;
    let y = 0;
    let achou = false;
    for (let tent = 0; tent < 30 && !achou; tent++) {
      x = 200 + acaso(i * 31 + tent, 17) * 680;
      y = 100 + acaso(i * 37 + tent, 19) * 480;
      achou = dentro([x, y], encolhido);
    }
    if (!achou) continue;
    let ang = acaso(i, 23) * Math.PI * 2;
    const espinha: Ponto[] = [[x, y]];
    const passos = 4 + Math.floor(acaso(i, 41) * 4);
    for (let k = 0; k < passos; k++) {
      ang += (acaso(i * 17 + k, 29) - 0.5) * 1.5;
      const nx = x + Math.cos(ang) * 30;
      const ny = y + Math.sin(ang) * 30;
      if (!dentro([nx, ny], encolhido)) break;
      x = nx;
      y = ny;
      espinha.push([x, y]);
    }
    if (espinha.length < 3) continue;
    const larg = 12 + acaso(i, 43) * 7;
    const esq: Ponto[] = [];
    const dir: Ponto[] = [];
    espinha.forEach((pt, k) => {
      const a0 = espinha[Math.max(0, k - 1)];
      const a1 = espinha[Math.min(espinha.length - 1, k + 1)];
      const dx = a1[0] - a0[0];
      const dy = a1[1] - a0[1];
      const L = Math.hypot(dx, dy) || 1;
      const w = larg * (k === 0 || k === espinha.length - 1 ? 0.7 : 1);
      esq.push([pt[0] - (dy / L) * w, pt[1] + (dx / L) * w]);
      dir.push([pt[0] + (dy / L) * w, pt[1] - (dx / L) * w]);
    });
    tracos.push(curvaFechada([...esq, ...dir.reverse()]));
  }
  // As estrias do cerebelo.
  for (let j = 1; j <= 7; j++) {
    const yy = 580 + j * 15;
    tracos.push(curvaAberta([[640 + j * 3, yy + 8], [700, yy - 4], [770, yy - 6], [835 - j * 4, yy + 4]]));
  }
  return tracos;
}

/** A lâmpada de traço (a ideia), em 1000 x 800. */
function tracosDaLampada(): string[] {
  const t: string[] = [];
  t.push("M500,90 C350,90 260,200 260,320 C260,410 310,460 360,510 C395,545 410,580 410,620 L590,620 C590,580 605,545 640,510 C690,460 740,410 740,320 C740,200 650,90 500,90 Z");
  t.push("M410,650 L590,650", "M415,685 L585,685", "M425,720 L575,720", "M455,755 C470,775 530,775 545,755");
  t.push("M440,610 L440,440 C440,400 470,380 500,410 C530,380 560,400 560,440 L560,610");
  t.push("M455,470 C475,450 490,470 500,455 C510,470 525,450 545,470");
  for (let i = 0; i < 9; i++) {
    const ang = Math.PI * (1.05 + (i / 8) * 0.9);
    const r0 = 300;
    const r1 = 360 + (i % 2) * 30;
    t.push(`M${(500 + Math.cos(ang) * r0).toFixed(1)},${(330 + Math.sin(ang) * r0).toFixed(1)} L${(500 + Math.cos(ang) * r1).toFixed(1)},${(330 + Math.sin(ang) * r1).toFixed(1)}`);
  }
  return t;
}

let _cerebro: string[] | null = null;
let _lampada: string[] | null = null;

/**
 * A ILUSTRAÇÃO DE TRAÇO: o desenho grande e apagado (cérebro, lâmpada ou um
 * ícone do catálogo) se desenha ao fundo azul e a frase é digitada por cima.
 */
export function IlustracaoTraco(c: Ctx) {
  const { W, H, u, vertical, props: p, tema } = c;
  const frase = semAsteriscos(texto(p.texto)).trim();
  const qual = texto(p.desenho, "cerebro");
  const a = acentoDa(c);
  const ini = 0.5;
  const d = digitado(frase, c.t, ini, velocidade(frase, c.dur, ini, 0.6));
  const desenha = saiSuave((c.t - 0.05) / 1.8);
  const tam = vertical ? W * 1.05 : Math.min(H * 1.05, W * 0.62);
  const tracos = qual === "lampada" ? (_lampada ??= tracosDaLampada()) : qual === "cerebro" || !qual ? (_cerebro ??= tracosDoCerebro()) : null;
  const fs = vertical ? 76 * u : 0.084 * H;
  const L = luxo(c);
  const traco = L ? "rgba(233,207,122,.26)" : "rgba(205,220,255,.24)";
  const fundo = L ? (
    <FundoLuxo c={c} de="canto" />
  ) : (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: [
          `radial-gradient(ellipse 75% 70% at 95% 110%, ${rgba(misturar(a, "#00b4ff", 0.45), 1)} 0%, ${rgba(misturar(a, "#00b4ff", 0.2), 0.8)} 35%, transparent 78%)`,
          `radial-gradient(ellipse 55% 45% at 5% 105%, ${rgba(misturar(a, "#1428a0", 0.5), 0.75)} 0%, transparent 70%)`,
          `linear-gradient(170deg, #030409 0%, #04060f 45%, ${misturar(a, "#000000", 0.7)} 100%)`,
        ].join(", "),
      }}
    />
  );
  return (
    <TelaLousa c={c} fundo={fundo}>
      <div style={{ position: "absolute", left: (W - tam) / 2, top: (H - tam * 0.8) / 2 - (vertical ? H * 0.04 : 0), width: tam, height: tam * 0.8, opacity: 0.85 }}>
        {tracos ? (
          <svg width={tam} height={tam * 0.8} viewBox="0 0 1000 800" fill="none" stroke={traco} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {tracos.map((dd, i) => (
              <path key={i} d={dd} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - limitar(desenha * 1.4 - (i % 12) * 0.03)} />
            ))}
          </svg>
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", opacity: desenha }}>
            <IconeOuMarca icone={qual} marca={p.marca} tam={tam * 0.75} cor={traco} traco={0.35} corDaMarca={false} />
          </div>
        )}
      </div>
      <div style={{ position: "absolute", left: W * 0.07, right: W * 0.07, top: "50%", transform: "translateY(-50%)", textAlign: "center", fontFamily: L ? SERIFA : GEIST, fontWeight: L ? 600 : 700, fontSize: fs, lineHeight: 1.12, letterSpacing: "-0.015em", color: "#ffffff", textShadow: `0 ${2 * u}px ${24 * u}px rgba(0,0,0,.45)` }}>
        {d.visivel}
        <Cursor t={c.t} acabou={d.acabou} largura={0.07} cor={L ? OURO : "#ffffff"} />
      </div>
    </TelaLousa>
  );
}

// ─────────────────────────────── dm-11: caixa de chat ───────────────────────────────

/**
 * A CAIXA DE CHAT (prompt de IA) embaixo, sobre a pessoa: vidro escuro com
 * borda clara, o pedido sendo digitado com o cursor e a barra de baixo (o +,
 * a pílula, o nome do assistente, o microfone e o botão de voz no acento).
 */
export function Chat(c: Ctx) {
  const { W, H, u, vertical, props: p, tema } = c;
  const pedido = semAsteriscos(texto(p.texto)).trim();
  const rotulo = texto(p.rotulo, "Pedir aprovação");
  const marca = marcaPorNome(p.marca);
  const assistente = texto(p.assistente, marca?.titulo ?? "Assistente");
  const ini = 0.45;
  const d = digitado(pedido, c.t, ini, velocidade(pedido, c.dur, ini, 0.7));
  const m = molaFisica(c.t - 0.02, 170, 17);
  const fs = vertical ? 34 * u : 31 * u;
  const fsB = fs * 0.78;
  const a = acentoDa(c);
  const barras = [0.45, 0.85, 0.6, 0.95, 0.5];
  return (
    <div style={{ position: "absolute", left: vertical ? W * 0.05 : W * 0.07, right: vertical ? W * 0.05 : W * 0.065, top: vertical ? H * 0.565 : H * 0.645, opacity: limitar(c.t / 0.15) * c.fica, transform: `translateY(${(1 - m) * 60 * u}px)` }}>
      <div data-vidro="1" style={{ position: "relative", borderRadius: 34 * u, background: luxo(c) ? "linear-gradient(180deg, rgba(24,26,34,.94), rgba(8,9,14,.96))" : "linear-gradient(180deg, rgba(52,52,55,.93), rgba(34,34,37,.95))", border: `${1.8 * u}px solid ${luxo(c) ? "rgba(212,175,55,.85)" : "rgba(235,235,240,.7)"}`, boxShadow: `0 ${18 * u}px ${50 * u}px rgba(0,0,0,.35)`, padding: `${30 * u}px ${34 * u}px ${22 * u}px` }}>
        <div style={{ fontFamily: GEIST, fontWeight: 400, fontSize: fs, lineHeight: 1.42, color: "#f4f4f6", minHeight: fs * 1.42 * 2 }}>
          {d.visivel}
          <Cursor t={c.t} acabou={d.acabou} largura={0.06} />
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 18 * u, gap: 16 * u }}>
          <span style={{ fontFamily: GEIST, fontWeight: 400, fontSize: fs * 1.25, color: "#d8d8dc", width: fs * 1.2, textAlign: "center" }}>+</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 * u, border: `${1.4 * u}px solid rgba(255,255,255,.22)`, borderRadius: 999, padding: `${8 * u}px ${18 * u}px`, fontFamily: GEIST, fontSize: fsB, color: "#d0d0d5" }}>
            <Icone nome="aperto" tam={fsB * 1.05} cor="#d0d0d5" traco={1.8} />
            {rotulo}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 * u, fontFamily: GEIST, fontWeight: 600, fontSize: fsB, color: "#f2f2f4" }}>
            {marca ? <IconeOuMarca marca={p.marca} tam={fsB * 1.05} cor="#fff" contorno="#ffffff" /> : null}
            {assistente}
          </span>
          <Icone nome="microfone" tam={fsB * 1.15} cor="#d8d8dc" traco={1.8} />
          <span style={{ width: fs * 1.7, height: fs * 1.7, borderRadius: "50%", background: luxo(c) ? OURO_METAL : `linear-gradient(180deg, ${misturar(a, "#ffffff", 0.15)}, ${a})`, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: fs * 0.08, boxShadow: `0 0 ${16 * u}px ${rgba(a, 0.45)}` }}>
            {barras.map((b, i) => (
              <span key={i} style={{ width: fs * 0.08, borderRadius: 99, background: "#fff", height: fs * 0.7 * (0.35 + 0.65 * b * (0.6 + 0.4 * Math.abs(Math.sin(c.t * 5 + i * 1.3)))) }} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────── dm-12: capa do material ───────────────────────────────

function Folha({ c, w, h, giro, dx, dy, titulo, k }: { c: Ctx; w: number; h: number; giro: number; dx: number; dy: number; titulo: string; k: number }) {
  const { u, tema } = c;
  const linhas = Array.from({ length: 11 }, (_, i) => i);
  return (
    <div style={{ position: "absolute", left: -w / 2 + dx, top: -h / 2 + dy, width: w, height: h, transform: `rotate(${giro}deg)`, transformOrigin: "50% 90%", background: luxo(c) ? "#f7f1e3" : "#fbfbfc", borderRadius: 8 * u, boxShadow: `0 ${20 * u}px ${50 * u}px rgba(0,0,0,.55)`, overflow: "hidden" }}>
      <div style={{ height: h * 0.075, background: "#eef0f3", display: "flex", alignItems: "center", gap: w * 0.03, padding: `0 ${w * 0.05}px`, fontFamily: GEIST, fontSize: h * 0.025, color: "#3c4048" }}>
        <span style={{ width: h * 0.03, height: h * 0.038, background: acentoDa(c), borderRadius: 2 * u }} />
        {titulo}
      </div>
      <div style={{ padding: `${h * 0.05}px ${w * 0.08}px` }}>
        <div style={{ height: h * 0.022, width: "62%", background: "#1d1f24", marginBottom: h * 0.035 }} />
        {linhas.map((i) => {
          const cor = i % 5 === 1 ? acentoDa(c) : i % 7 === 3 ? (luxo(c) ? "#0d1830" : "#f2c94c") : luxo(c) ? "#d8cfbb" : "#c9ccd3";
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: w * 0.03, marginBottom: h * 0.028 }}>
              {i % 3 === 0 ? <span style={{ width: h * 0.014, height: h * 0.014, borderRadius: "50%", background: acentoDa(c) }} /> : null}
              <span style={{ height: h * 0.014, width: `${45 + acaso(i + k * 13, 5) * 45}%`, background: cor, borderRadius: 2 * u }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A CAPA DO MATERIAL (e-book, guia, planilha, oferta): a capa preta com o
 * título condensado gigante e o ícone de neon no acento, as folhas do
 * material abrindo em leque atrás, no azul-marinho com a grade fina.
 */
export function Material(c: Ctx) {
  const { W, H, u, vertical, props: p, tema, logoUrl } = c;
  const titulo = semAsteriscos(texto(p.titulo)).trim().toUpperCase();
  const palavras = titulo.split(/\s+/).filter(Boolean).slice(0, 4);
  const a = acentoDa(c);
  const CW = vertical ? W * 0.62 : W * 0.29;
  const CH = CW / 0.78;
  const cx = W / 2;
  const cy = vertical ? H * 0.46 : H * 0.52;
  const sobe = molaFisica(c.t - 0.1, 150, 16);
  const abre = saiSuave((c.t - 0.35) / 0.7);
  const col = CW * 0.46;
  const acende = limitar((c.t - 0.55) / 0.25) * (0.92 + 0.08 * Math.sin(c.t * 4));
  const L = luxo(c);
  const fundo = L ? (
    <FundoLuxo c={c} />
  ) : (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 70% at 50% 45%, #0c2446 0%, #071530 45%, #02060e 100%)" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(to right, rgba(140,180,255,.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(140,180,255,.06) 1px, transparent 1px)", backgroundSize: `${64 * u}px ${64 * u}px`, maskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, #000 30%, transparent 85%)", WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, #000 30%, transparent 85%)" }} />
    </div>
  );
  const folhas = [
    { giro: -17, dx: -CW * 0.62, dy: CH * 0.04 },
    { giro: -8, dx: -CW * 0.36, dy: -CH * 0.02 },
    { giro: 9, dx: CW * 0.42, dy: 0 },
  ];
  return (
    <TelaLousa c={c} fundo={fundo}>
      <div style={{ position: "absolute", left: cx, top: cy }}>
        {folhas.map((f, k) => (
          <Folha key={k} c={c} w={CW * 0.95} h={CH * 0.95} giro={f.giro * abre} dx={f.dx * abre} dy={f.dy} titulo={semAsteriscos(texto(p.titulo)).trim()} k={k} />
        ))}
        <div style={{ position: "absolute", left: -CW / 2, top: -CH / 2, width: CW, height: CH, background: L ? `${ESCOVADO}, radial-gradient(ellipse at 30% 20%, #1b1d26, #050608 70%)` : "linear-gradient(160deg, #0b0b0d, #000000 60%)", boxShadow: L ? `0 ${30 * u}px ${80 * u}px rgba(0,0,0,.7), inset 0 0 0 ${CW * 0.022}px #050608, inset 0 0 0 ${CW * 0.026}px rgba(212,175,55,.8)` : `0 ${30 * u}px ${80 * u}px rgba(0,0,0,.7)`, transform: `translateY(${(1 - sobe) * 90 * u}px) scale(${0.9 + 0.1 * sobe})`, opacity: limitar(c.t / 0.2), overflow: "hidden" }}>
          <div style={{ position: "absolute", left: CW * 0.08, top: CH * 0.12, width: col, display: "flex", flexDirection: "column", gap: CH * 0.01 }}>
            {palavras.map((w, i) => {
              const fsL = Math.min(CH * (L ? 0.2 : 0.3), col / (Math.max(1, w.length) * (L ? 0.82 : 0.56)));
              return (
                <div key={i} style={L ? { fontFamily: SERIFA, fontWeight: 800, fontSize: fsL, lineHeight: 1.02, whiteSpace: "nowrap", ...tintaDeOuro, filter: brilhoDeOuro(u, 0.8) } : { fontFamily: "Anton, Oswald, sans-serif", fontSize: fsL, lineHeight: 0.92, color: "#ffffff", whiteSpace: "nowrap", letterSpacing: "0.005em" }}>
                  {w}
                </div>
              );
            })}
          </div>
          {/* O objeto de neon: o caderno de vidro com o ícone e as marcas. */}
          <div style={{ position: "absolute", right: CW * 0.07, top: CH * 0.3, width: CW * 0.36, height: CH * 0.46, borderRadius: CW * 0.04, border: `${3 * u}px solid ${rgba(misturar(a, "#ffffff", 0.35), acende)}`, boxShadow: `0 0 ${18 * u}px ${rgba(a, 0.8 * acende)}, inset 0 0 ${18 * u}px ${rgba(a, 0.5 * acende)}`, background: `linear-gradient(160deg, ${rgba(a, 0.18)}, rgba(0,0,0,.2))`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: CH * 0.05, gap: CH * 0.03 }}>
            <div style={{ filter: `drop-shadow(0 0 ${8 * u}px ${rgba(a, acende)}) drop-shadow(0 0 ${20 * u}px ${rgba(a, 0.7 * acende)})` }}>
              <IconeOuMarca marca={p.marca} icone={texto(p.icone, "documento")} tam={CW * 0.17} cor={misturar(a, "#ffffff", 0.3)} traco={1.6} corDaMarca={false} />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: CW * 0.02, opacity: acende }}>
                <span style={{ width: CW * 0.12, height: 3 * u, background: misturar(a, "#ffffff", 0.3), boxShadow: `0 0 ${6 * u}px ${a}` }} />
                <span style={{ width: CW * 0.04, height: CW * 0.04, borderRadius: 3 * u, border: `${2 * u}px solid ${misturar(a, "#ffffff", 0.3)}`, boxShadow: `0 0 ${6 * u}px ${a}` }} />
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", right: CW * 0.05, bottom: CH * 0.08, width: CW * 0.42, height: CH * 0.08, background: `radial-gradient(ellipse at 50% 50%, ${rgba(a, 0.6 * acende)}, transparent 70%)`, filter: `blur(${6 * u}px)` }} />
          {L ? <div style={{ position: "absolute", right: CW * 0.12, top: 0, width: CW * 0.07, height: CH * 0.2, background: `linear-gradient(180deg, ${VERMELHO}, #7a0c1f)`, clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)", boxShadow: "0 0 6px rgba(0,0,0,.5)" }} /> : null}
          {logoUrl ? <img src={String(logoUrl)} style={{ position: "absolute", left: CW * 0.08, bottom: CH * 0.06, height: CH * 0.07, maxWidth: CW * 0.4, objectFit: "contain", filter: "brightness(0) invert(1)" }} /> : null}
        </div>
      </div>
    </TelaLousa>
  );
}

// ─────────────────────────────── dm-13: seguir o cliente ───────────────────────────────

/**
 * A CHAMADA PARA SEGUIR: o celular inclinado com o perfil do PRÓPRIO cliente
 * (o @ e a foto ou logo dele; nunca o perfil de outra pessoa) e, ao lado, a
 * pílula de vidro com o ícone da rede e a chamada.
 */
export function Seguir(c: Ctx) {
  const { W, H, u, vertical, props: p, tema, logoUrl } = c;
  const arroba = texto(p.arroba).trim().replace(/^@?/, "@");
  const nome = semAsteriscos(texto(p.nome)).trim();
  const bio = semAsteriscos(texto(p.bio)).trim();
  const chamada = semAsteriscos(texto(p.chamada, `Siga ${arroba}`)).trim();
  const rede = texto(p.rede, "instagram");
  const a = acentoDa(c);
  const PH = vertical ? H * 0.5 : H * 0.84;
  const PW = PH * 0.49;
  const px = vertical ? W / 2 - PW / 2 : W * 0.25 - PW / 2;
  const py = vertical ? H * 0.08 : (H - PH) / 2;
  const chega = molaFisica(c.t - 0.05, 130, 15);
  const abre = saiSuave((c.t - 0.45) / 0.45);
  const fsP = PW * 0.055;
  const pillW = vertical ? W * 0.9 : W * 0.57;
  const pillH = vertical ? 170 * u : H * 0.11;
  const fsC = Math.min(vertical ? 40 * u : H * 0.036, ((pillW - pillH * 1.4) / Math.max(12, chamada.length * 0.57)) * (vertical ? 2 : 1));
  const iniciais = (nome || arroba.replace("@", "")).split(/[\s._]+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("");
  const destaques = ["pergunta", "livro", "video", "mensagem", "estrela"];
  return (
    <TelaLousa c={c} fundo={luxo(c) ? <FundoLuxo c={c} de="canto" /> : <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 70% at 40% 45%, #17181c, #050506 70%)" }} />}>
      <div style={{ position: "absolute", left: px, top: py, width: PW, height: PH, perspective: 2000 * u, transform: `translateX(${(1 - chega) * -W * 0.4}px)` }}>
        <div style={{ width: "100%", height: "100%", transform: `rotateY(${vertical ? 0 : 10}deg) rotateZ(-2.5deg)`, borderRadius: PW * 0.15, padding: PW * 0.032, background: luxo(c) ? OURO_ARO : `linear-gradient(140deg, ${misturar(a, "#ffffff", 0.35)}, ${misturar(a, "#000000", 0.25)} 45%, ${misturar(a, "#ffffff", 0.15)})`, boxShadow: `0 ${30 * u}px ${70 * u}px rgba(0,0,0,.6)` }}>
          <div style={{ width: "100%", height: "100%", borderRadius: PW * 0.12, background: "#0d0e11", overflow: "hidden", padding: `${PW * 0.05}px ${PW * 0.05}px`, fontFamily: GEIST, color: "#fff", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: fsP * 0.85, fontWeight: 600 }}>
              <span>9:41</span>
              <span style={{ width: PW * 0.28, height: PW * 0.065, borderRadius: 99, background: "#000" }} />
              <span style={{ width: PW * 0.08, height: PW * 0.035, borderRadius: 3 * u, border: `${1.5 * u}px solid #fff` }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: PW * 0.04, marginTop: PW * 0.05, fontSize: fsP * 1.15, fontWeight: 700 }}>
              <span style={{ fontWeight: 400 }}>‹</span>
              <span>{arroba.replace("@", "")}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: PW * 0.05, marginTop: PW * 0.05 }}>
              <div style={{ width: PW * 0.24, height: PW * 0.24, borderRadius: "50%", padding: PW * 0.01, background: `conic-gradient(${a}, #ff3d81, #ffb347, ${a})`, flex: "0 0 auto" }}>
                <div style={{ width: "100%", height: "100%", borderRadius: "50%", border: `${PW * 0.01}px solid #0d0e11`, overflow: "hidden", background: `linear-gradient(135deg, ${misturar(a, "#ffffff", 0.2)}, ${misturar(a, "#000000", 0.35)})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: PW * 0.08, fontWeight: 700 }}>
                  {logoUrl ? <img src={String(logoUrl)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : iniciais}
                </div>
              </div>
              <div style={{ fontSize: fsP, fontWeight: 600 }}>{nome || arroba}</div>
            </div>
            <div style={{ marginTop: PW * 0.04, fontSize: fsP * 0.85, lineHeight: 1.35, color: "#e6e6ea", minHeight: fsP * 2.4 }}>
              {bio || (
                <>
                  <div style={{ height: fsP * 0.5, width: "82%", background: "#2b2d33", borderRadius: 99, marginBottom: fsP * 0.4 }} />
                  <div style={{ height: fsP * 0.5, width: "64%", background: "#2b2d33", borderRadius: 99 }} />
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: PW * 0.025, marginTop: PW * 0.04 }}>
              <span style={{ flex: 1, textAlign: "center", padding: `${PW * 0.018}px 0`, borderRadius: PW * 0.025, background: luxo(c) ? OURO_METAL : a, color: luxo(c) ? "#1a1305" : "#fff", fontSize: fsP * 0.85, fontWeight: 600 }}>Seguir</span>
              <span style={{ flex: 1, textAlign: "center", padding: `${PW * 0.018}px 0`, borderRadius: PW * 0.025, background: "#2b2d33", fontSize: fsP * 0.85, fontWeight: 600 }}>Mensagem</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: PW * 0.05 }}>
              {destaques.map((d, i) => (
                <span key={i} style={{ width: PW * 0.145, height: PW * 0.145, borderRadius: "50%", border: `${PW * 0.008}px solid ${a}`, display: "inline-flex", alignItems: "center", justifyContent: "center", background: rgba(a, 0.15) }}>
                  <Icone nome={d} tam={PW * 0.07} cor="#fff" traco={2} />
                </span>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: PW * 0.008, marginTop: PW * 0.05, marginLeft: -PW * 0.05, marginRight: -PW * 0.05 }}>
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} style={{ aspectRatio: "3 / 4", background: `linear-gradient(${120 + i * 25}deg, ${misturar(a, "#000000", 0.25 + 0.4 * acaso(i, 3))}, ${misturar(a, "#0d0e11", 0.55 + 0.3 * acaso(i, 7))})`, position: "relative" }}>
                  <div style={{ position: "absolute", left: "12%", bottom: "14%", width: "60%", height: "9%", background: "rgba(255,255,255,.75)", borderRadius: 2 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* A pílula da chamada. */}
      <div style={{ position: "absolute", left: vertical ? (W - pillW) / 2 : W * 0.385, top: vertical ? H * 0.66 : H / 2 - pillH / 2, width: pillW, minHeight: pillH, clipPath: `inset(0 ${(1 - abre) * 100}% 0 0 round ${pillH * 0.3}px)` }}>
        <div style={{ width: "100%", minHeight: pillH, borderRadius: pillH * 0.3, background: luxo(c) ? "linear-gradient(180deg, #23252e, #0d0e13 55%, #07080b)" : "linear-gradient(180deg, #4a4c54, #24252b 55%, #1a1b20)", border: `${2.4 * u}px solid ${luxo(c) ? "rgba(212,175,55,.9)" : "rgba(255,255,255,.7)"}`, boxShadow: `inset 0 ${2 * u}px 0 rgba(255,255,255,.35), 0 ${16 * u}px ${40 * u}px rgba(0,0,0,.5)`, display: "flex", alignItems: "center", gap: pillH * 0.22, padding: `${pillH * 0.16}px ${pillH * 0.3}px` }}>
          <span style={{ flex: "0 0 auto", display: "inline-flex" }}>
            <IconeOuMarca marca={rede} icone="camera" tam={pillH * 0.48} cor="#ffffff" corDaMarca={false} />
          </span>
          <span style={{ fontFamily: GEIST, fontWeight: 700, fontSize: fsC, lineHeight: 1.2, color: "#ffffff" }}>{chamada}</span>
        </div>
      </div>
    </TelaLousa>
  );
}

// ─────────────────────────────── dm-14: ferramentas em placas ───────────────────────────────

/**
 * AS FERRAMENTAS CITADAS: cada uma numa placa branca com moldura cromada, no
 * escuro com o feixe de luz; entra quando é dita. Marca citada usa o ícone
 * oficial na cor dela; sem a marca, o ícone genérico no acento.
 */
export function Ferramentas(c: Ctx) {
  const { W, H, u, vertical, props: p, tema, logoUrl } = c;
  const itens = lista<{ marca?: string; icone?: string; rotulo?: string; usarLogo?: boolean }>(p.itens).slice(0, 4);
  const n = Math.max(1, itens.length);
  const prog = itens.map((_, k) => (c.passos.length > k ? c.passos[k] : limitar((c.t - 0.2 - k * 0.15) / 0.5)));
  const coluna = vertical && n <= 3;
  const grade = vertical && n === 4;
  const T = vertical ? (coluna ? Math.min(W * 0.42, (H * 0.72) / n - 50 * u) : W * 0.4) : Math.min(H * 0.29, (W * 0.84) / n - W * 0.05);
  const gap = vertical ? 70 * u : W * 0.06 - (n > 3 ? W * 0.02 : 0);
  const comRotulo = itens.some((it) => it.rotulo);
  const fsR = vertical ? 34 * u : H * 0.032;
  const a = acentoDa(c);
  return (
    <TelaLousa c={c} fundo={<FundoFeixe c={c} giro={14} />}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: grade ? "grid" : "flex", gridTemplateColumns: grade ? "repeat(2, auto)" : undefined, flexDirection: coluna ? "column" : "row", gap, alignItems: "center" }}>
          {itens.map((it, k) => {
            const q = prog[k];
            const m = molaFisica(q * 0.9, 190, 14);
            const logo = it.usarLogo && logoUrl;
            const marca = marcaPorNome(it.marca);
            return (
              <div key={k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 * u, opacity: limitar(q * 4), transform: `perspective(${1200 * u}px) translateY(${(1 - m) * 50 * u}px) scale(${0.6 + 0.4 * m}) rotateX(${(1 - m) * 25}deg)` }}>
                <div style={{ width: T, height: T, borderRadius: T * 0.22, padding: T * 0.06, background: luxo(c) ? OURO_ARO : "linear-gradient(145deg, #ffffff 0%, #8d939b 12%, #ffffff 24%, #3f444b 40%, #f4f5f7 52%, #6b717a 66%, #ffffff 80%, #50565e 100%)", boxShadow: `0 ${18 * u}px ${40 * u}px rgba(0,0,0,.55), 0 0 ${2 * u}px rgba(255,255,255,.8)` }}>
                  <div style={{ width: "100%", height: "100%", borderRadius: T * 0.18, background: luxo(c) ? "linear-gradient(180deg, #fbf7ec, #e8dfc9)" : "linear-gradient(180deg, #fdfdfe, #e4e6ea)", boxShadow: `inset 0 ${3 * u}px ${8 * u}px rgba(0,0,0,.18), inset 0 ${-2 * u}px ${4 * u}px rgba(255,255,255,.9)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {logo ? (
                      <img src={String(logoUrl)} style={{ width: T * 0.62, height: T * 0.62, objectFit: "contain" }} />
                    ) : (
                      <div style={{ filter: `drop-shadow(0 ${3 * u}px ${2 * u}px rgba(0,0,0,.22))` }}>
                        <IconeOuMarca marca={it.marca} icone={it.icone} tam={T * (marca ? 0.5 : 0.52)} cor={misturar(a, "#000000", 0.1)} traco={2.4} />
                      </div>
                    )}
                  </div>
                </div>
                {comRotulo ? <div style={{ fontFamily: GEIST, fontWeight: 600, fontSize: fsR, color: "#ffffff", textShadow: brilhoBranco(u, 0.4), minHeight: fsR * 1.2 }}>{semAsteriscos(texto(it.rotulo))}</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </TelaLousa>
  );
}
