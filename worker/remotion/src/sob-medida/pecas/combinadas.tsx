import React from "react";
import { escuroDoTema, limitar, lista, misturar, rgba, saiSuave, texto, type Ctx } from "../base";
import { Contador, acaso, contagem, molaFisica } from "../kit";

/**
 * A CAMADA EXATA DA PEÇA COMBINADA (06/10/2026; proposta aprovada pelo Bruno
 * às 12h03). O fundo é um vídeo gerado sem texto (Higgsfield), que o worker
 * põe como plano de inserção com um empurrão de 10% do centro; esta camada vai
 * por cima, transparente, com o que precisa ser exato: os pontos ou alfinetes
 * dos itens ditos, a etiqueta de cada um, a linha da rota ou o fio ligando, o
 * título e o número dito. App: lib/media/editor-por-comando/combinada.ts.
 *
 * O que vem decidido (nada aqui escolhe):
 *   - `itens`, `titulo`, `numero`: o redator escreveu, o código conferiu;
 *   - `ligacao` ("rota", "fio", "nenhuma") e `marcador` ("ponto", "alfinete"):
 *     o JEV escolheu o fundo e a ligação; o marcador é dado do fundo;
 *   - `comFundo` e `zoomDoFundo`: o resolvedor, pelo vídeo pronto.
 * O TEMA só muda COMO cada coisa é desenhada (papel, vidro, bloco, luxo):
 * nenhum estilo decide o que entra.
 *
 * ALINHAMENTO: os pontos e as etiquetas andam com o empurrão do worker (a
 * mesma escala, do mesmo centro, no mesmo tempo), e só aparecem depois do
 * mergulho de câmera da borda da inserção (meio segundo). Sem o vídeo pronto
 * (`comFundo` falso), a peça desenha o próprio fundo e o resolvedor a põe na
 * folha sobre a gravação.
 */

type Item = { rotulo?: string };
type Ponto = { x: number; y: number };

/**
 * As posições dos itens (fração do quadro), dentro da área segura: acima da
 * faixa da legenda e longe das bordas. Na ROTA, um arco da esquerda para a
 * direita na ordem dita; no fio e sem ligação, um mural solto. O acaso é
 * estável (a mesma camada desenha sempre igual em todo quadro).
 */
export function posicoesDosItens(n: number, ligacao: string, vertical: boolean, semente: number): Ponto[] {
  const y0 = vertical ? 0.24 : 0.24;
  const y1 = vertical ? 0.6 : 0.66;
  const x0 = vertical ? 0.16 : 0.14;
  const x1 = vertical ? 0.84 : 0.86;
  const j = (i: number, k: number) => (acaso(i + 1, semente + k) - 0.5) * 0.05;
  if (n <= 0) return [];
  if (n === 1) return [{ x: 0.5, y: (y0 + y1) / 2 }];
  if (ligacao === "rota") {
    return Array.from({ length: n }, (_, k) => {
      const f = k / (n - 1);
      return { x: x0 + (x1 - x0) * f + j(k, 1) * 0.5, y: y1 - (y1 - y0) * (0.25 + 0.75 * Math.sin(Math.PI * (0.15 + 0.7 * f))) + j(k, 2) };
    });
  }
  const moldes: Record<number, Ponto[]> = {
    2: [{ x: 0.3, y: 0.4 }, { x: 0.7, y: 0.52 }],
    3: [{ x: 0.25, y: 0.36 }, { x: 0.72, y: 0.34 }, { x: 0.5, y: 0.6 }],
    4: [{ x: 0.24, y: 0.34 }, { x: 0.7, y: 0.3 }, { x: 0.3, y: 0.6 }, { x: 0.74, y: 0.6 }],
    5: [{ x: 0.2, y: 0.34 }, { x: 0.5, y: 0.27 }, { x: 0.8, y: 0.35 }, { x: 0.33, y: 0.61 }, { x: 0.68, y: 0.62 }],
  };
  return (moldes[Math.min(5, n)] ?? moldes[5]).map((q, k) => ({ x: limitar(q.x + j(k, 3), x0, x1), y: limitar(y0 + (q.y - 0.27) * ((y1 - y0) / 0.35) + j(k, 4), y0, y1) }));
}

/** A cor da linha e do fio: a tinta do fio da marca no papel, o acento no resto (o ouro cede à cor da marca no luxo só no fio). */
function corDaLigacao(c: Ctx): string {
  const fio = c.tema.vox?.fio;
  if (c.tema.visual === "documental") return fio && /^#[0-9a-f]{6}$/i.test(fio) ? fio : "#b8231b";
  if (c.tema.acabamento === "luxo" && !c.tema.corPedida) return "#C9A24A";
  return c.tema.acento;
}

/** A etiqueta de um item, no acabamento do tema. */
function estiloDaEtiqueta(c: Ctx, k: number): React.CSSProperties {
  const { tema, u } = c;
  const base: React.CSSProperties = { whiteSpace: "nowrap", padding: `${10 * u}px ${20 * u}px`, fontSize: (c.vertical ? 34 : 30) * u, lineHeight: 1.1 };
  if (tema.visual === "documental") {
    return { ...base, background: "#f3ead6", color: tema.vox?.tinta ?? "#16130e", fontFamily: tema.fonteTitulo, fontWeight: 700, borderRadius: 2 * u, boxShadow: `0 ${8 * u}px ${18 * u}px rgba(0,0,0,.45)`, transform: `rotate(${(acaso(k + 3, 7) - 0.5) * 5}deg)` };
  }
  if (tema.acabamento === "luxo") {
    return { ...base, background: "rgba(8,8,10,.86)", color: "#f1e6c8", fontFamily: tema.fonteTitulo, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", border: `${1.5 * u}px solid ${tema.corPedida ?? "#C9A24A"}`, borderRadius: 4 * u };
  }
  if (tema.visual === "impacto") {
    return { ...base, background: "#0b0c0f", color: "#ffffff", fontFamily: tema.fonteTitulo, fontWeight: 800, textTransform: "uppercase", borderRadius: 10 * u, borderBottom: `${7 * u}px solid ${tema.acento}`, boxShadow: `0 ${10 * u}px ${24 * u}px rgba(0,0,0,.5)` };
  }
  return { ...base, background: rgba(escuroDoTema(tema), 0.82), color: "#f2f6fb", fontFamily: tema.fonteTexto, fontWeight: 600, border: `${1.2 * u}px solid rgba(255,255,255,.22)`, borderRadius: 14 * u, boxShadow: `0 ${10 * u}px ${30 * u}px rgba(0,0,0,.45), inset 0 ${1 * u}px 0 rgba(255,255,255,.12)` };
}

/** O ponto (fundo aéreo, rede) ou o alfinete (mural, mesa). */
function Marcador({ c, q, p, k, marcador }: { c: Ctx; q: Ponto; p: number; k: number; marcador: string }) {
  const { u, tema } = c;
  if (p <= 0) return null;
  const e = molaFisica(p * 0.7, 260, 14);
  const cor = corDaLigacao(c);
  const x = q.x * c.W;
  const y = q.y * c.H;
  if (marcador === "alfinete") {
    const r = 12 * u;
    return (
      <g transform={`translate(${x} ${y}) scale(${e.toFixed(3)})`}>
        <ellipse cx={4 * u} cy={6 * u} rx={r * 0.9} ry={r * 0.45} fill="rgba(0,0,0,.35)" />
        <circle cx={0} cy={0} r={r} fill={cor} stroke="rgba(0,0,0,.25)" strokeWidth={1.2 * u} />
        <circle cx={-r * 0.35} cy={-r * 0.35} r={r * 0.32} fill="rgba(255,255,255,.6)" />
      </g>
    );
  }
  const onda = (c.t * 0.8 + k * 0.27) % 1;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx={0} cy={0} r={(16 + 34 * onda) * u} fill="none" stroke={rgba(cor, 0.75 * (1 - onda) * limitar(p * 2))} strokeWidth={2.2 * u} />
      <circle cx={0} cy={0} r={11 * u * e} fill={cor} style={{ filter: tema.visual === "documental" ? "none" : `drop-shadow(0 0 ${10 * u}px ${cor})` }} />
      <circle cx={0} cy={0} r={4.5 * u * e} fill="#ffffff" />
    </g>
  );
}

/** A linha da rota (curva suave) ou o fio (com a barriga do peso), do item a ao b, desenhada até `p`. */
function Ligacao({ c, a, b, p, tipo }: { c: Ctx; a: Ponto; b: Ponto; p: number; tipo: string }) {
  const { u, tema } = c;
  if (p <= 0) return null;
  const ax = a.x * c.W;
  const ay = a.y * c.H;
  const bx = b.x * c.W;
  const by = b.y * c.H;
  const fio = tipo === "fio";
  const mx = (ax + bx) / 2;
  const my = fio ? (ay + by) / 2 + Math.abs(bx - ax) * 0.1 + 18 * u : Math.min(ay, by) - Math.abs(bx - ax) * 0.18;
  const comp = Math.hypot(bx - ax, by - ay) * 1.15;
  const k = saiSuave(limitar(p));
  const cor = corDaLigacao(c);
  const papel = tema.visual === "documental";
  const traco = (fio ? 3.4 : papel ? 4.5 : 5) * u;
  return (
    <g>
      {!papel && !fio ? <path d={`M${ax} ${ay} Q${mx} ${my} ${bx} ${by}`} fill="none" stroke={rgba(cor, 0.35)} strokeWidth={traco * 3} strokeLinecap="round" strokeDasharray={comp} strokeDashoffset={comp * (1 - k)} /> : null}
      <path
        d={`M${ax} ${ay} Q${mx} ${my} ${bx} ${by}`}
        fill="none"
        stroke={cor}
        strokeWidth={traco}
        strokeLinecap="round"
        strokeDasharray={papel && !fio ? `${14 * u} ${9 * u}` : comp}
        strokeDashoffset={papel && !fio ? 0 : comp * (1 - k)}
        opacity={papel && !fio ? k : 1}
        style={{ filter: `drop-shadow(0 ${3 * u}px ${3 * u}px rgba(0,0,0,.4))` }}
      />
    </g>
  );
}

/** O fundo próprio, só sem o vídeo pronto (a peça entra na folha sobre a gravação). */
function FundoProprio({ c }: { c: Ctx }) {
  const { tema, u } = c;
  const papel = tema.visual === "documental";
  const escuro = escuroDoTema(tema);
  return (
    <div style={{ position: "absolute", inset: 0, background: papel ? "#e9dcc0" : `radial-gradient(ellipse at 40% 30%, ${misturar(escuro, "#2a4a72", 0.35)}, ${escuro} 72%)` }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `radial-gradient(${papel ? "rgba(90,70,40,.22)" : "rgba(150,190,235,.28)"} ${1.6 * u}px, transparent ${1.8 * u}px)`,
          backgroundSize: `${26 * u}px ${26 * u}px`,
        }}
      />
    </div>
  );
}

export function CamadaExata(c: Ctx) {
  const { props: p, u, tema, W, H, vertical } = c;
  const itens = lista<Item>(p.itens).filter((x) => texto(x?.rotulo).trim()).slice(0, 5);
  const ligacao = texto(p.ligacao, "nenhuma");
  const marcador = texto(p.marcador, "ponto");
  const comFundo = p.comFundo === true;
  const semente = Math.round(c.dur * 97) % 31;
  const pos = posicoesDosItens(itens.length, ligacao, vertical, semente);
  // O empurrão do worker (do centro, linear no tempo do plano): a camada dos pontos acompanha.
  const zoom = comFundo ? Math.max(0, Number(p.zoomDoFundo) || 0) : 0;
  const escala = 1 + zoom * limitar(c.t / Math.max(0.1, c.dur));
  // Nada aparece antes do mergulho de câmera da borda da inserção (o worker volta do zoom em 0,45 s).
  const solta = limitar((c.t - 0.45) / 0.3);
  const prog = itens.map((_, k) => Math.min(solta, c.passos.length > k ? c.passos[k] : limitar((c.t - 0.55 - k * 0.35) / 0.45)));
  const sai = c.fica;
  const numero = p.numero && typeof p.numero === "object" ? (p.numero as { valor?: number; prefixo?: string; sufixo?: string; rotulo?: string }) : null;
  const valor = Number(numero?.valor);
  const titulo = texto(p.titulo).replace(/\*\*/g, "");
  const tNum = 0.6;
  const cont = Number.isFinite(valor) ? contagem(Math.max(0, c.t - tNum), 1.2, valor) : null;
  const papel = tema.visual === "documental";
  return (
    <div style={{ position: "absolute", inset: 0, opacity: sai }}>
      {comFundo ? null : <FundoProprio c={c} />}
      {/* A vinheta leve sobre o vídeo de fundo: as etiquetas leem em qualquer fundo. */}
      {comFundo ? <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 75% at 50% 45%, rgba(0,0,0,.08) 40%, rgba(0,0,0,.45) 100%)", opacity: limitar(c.t / 0.5) }} /> : null}
      <div style={{ position: "absolute", inset: 0, transform: `scale(${escala.toFixed(4)})`, transformOrigin: "50% 50%" }}>
        <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {ligacao !== "nenhuma" ? pos.slice(1).map((q, i) => <Ligacao key={`l${i}`} c={c} a={pos[i]} b={q} p={prog[i + 1] * 1.25} tipo={ligacao} />) : null}
          {pos.map((q, k) => (
            <Marcador key={`m${k}`} c={c} q={q} p={prog[k]} k={k} marcador={marcador} />
          ))}
        </svg>
        {itens.map((it, k) => {
          const q = pos[k];
          const e = molaFisica(prog[k] * 0.8, 220, 15);
          if (prog[k] <= 0) return null;
          // A etiqueta vai acima do ponto; perto do topo, embaixo.
          const embaixo = q.y < 0.33;
          return (
            <div key={`e${k}`} style={{ position: "absolute", left: q.x * W, top: q.y * H, opacity: limitar(prog[k] * 2.5) }}>
              <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(-50%, ${embaixo ? `${26 * u}px` : `calc(-100% - ${26 * u}px)`}) translateY(${((1 - e) * (embaixo ? -24 : 24) * u).toFixed(1)}px) scale(${(0.9 + 0.1 * e).toFixed(3)})` }}>
                <div style={estiloDaEtiqueta(c, k)}>{texto(it.rotulo)}</div>
                {papel ? <div style={{ position: "absolute", left: "50%", top: -9 * u, width: 58 * u, height: 18 * u, transform: "translateX(-50%) rotate(-3deg)", background: "rgba(255,250,235,.55)", boxShadow: "0 1px 2px rgba(0,0,0,.15)" }} /> : null}
              </div>
            </div>
          );
        })}
      </div>
      {titulo ? (
        <div style={{ position: "absolute", left: vertical ? 56 : 80 * u, top: vertical ? 0.1 * H : 64 * u, maxWidth: (numero ? 0.5 : 0.8) * W, opacity: limitar((c.t - 0.2) / 0.4), transform: `translateY(${((1 - saiSuave((c.t - 0.2) / 0.5)) * 18 * u).toFixed(1)}px)` }}>
          <div style={{ ...estiloDaEtiqueta(c, 9), transform: "none", whiteSpace: "normal", fontSize: (vertical ? 50 : 46) * u, padding: `${12 * u}px ${24 * u}px`, fontFamily: tema.fonteTitulo, ...(tema.visual === "vidro" ? { borderLeft: `${6 * u}px solid ${tema.acento}` } : {}) }}>{titulo}</div>
        </div>
      ) : null}
      {numero && cont ? (
        <div style={{ position: "absolute", right: vertical ? 56 : 80 * u, top: vertical ? 0.1 * H : 56 * u, textAlign: "right", opacity: limitar((c.t - tNum) / 0.3) }}>
          <div style={{ display: "inline-block", ...estiloDaEtiqueta(c, 11), transform: "none", padding: `${10 * u}px ${24 * u}px` }}>
            <Contador
              c={c}
              id={`cx-${semente}`}
              valor={valor}
              progresso={cont.p}
              velocidade={cont.vel}
              prefixo={texto(numero.prefixo)}
              sufixo={texto(numero.sufixo)}
              estilo={{ fontFamily: tema.fonteTitulo, fontWeight: 800, fontSize: (vertical ? 110 : 96) * u, lineHeight: 1, color: tema.visual === "impacto" ? tema.acento : papel ? "#16130e" : "#ffffff" }}
            />
            {numero.rotulo ? <div style={{ fontFamily: tema.fonteTexto, fontSize: 24 * u, fontWeight: 600, marginTop: 6 * u, opacity: 0.85 }}>{texto(numero.rotulo)}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
