import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { carregarFontesDoTema, escuroDoTema, limitar, misturar, rgba, saiSuave, vivo } from "./base";
import { Capitulo, Citacao, Fecho, FraseImpacto, PainelLateral, PalavraChave, Pergaminho, PerguntaResposta, RotuloInferior, Titulo, TituloAtras, Transicao } from "./pecas/texto";
import { Cartoes, Checklist, Comparacao, Escada, Fluxo, LinhaDoTempo, PassosFoco } from "./pecas/estrutura";
import { Barras, Cifrao, GraficoLinha, Mapa, NumeroDestaque, Progresso } from "./pecas/dados";
import { Circulo, Desenho, IconeComRotulo, MolduraDoCartao, Seta, Sublinhado } from "./pecas/apontar";
import { Busca, Chat, Ferramentas, GradeAzul, IlustracaoTraco, LegendaDestaque, MarcaBrilho, Material, Notebook, PalavraGigante, PilhaPassos, Seguir } from "./pecas/lousa";
import { CarimboSobre, Censura, Colagem, Cronologia, FundoColagem, Jornal, MapaAntigo, MarcaTexto, rasgado } from "./pecas/vox";
import { ImagemJanela } from "./pecas/midia";
import { Inscrever } from "./pecas/inscrever";
import { CartaoDePasso, DestaqueNaTela, FraseChave, NomeDeQuemFala, RealceDeQuemFala, Slide, ZoomNoPonto } from "./pecas/contexto";
import { molaFisica, sombraFunda } from "./kit";
import type { CamadaResolvida, ContextoDaPeca, PropsDasCamadas, PropsDoFundo, Trecho } from "./tipos";

/**
 * A BIBLIOTECA DE PEÇAS do editor sob medida (03/10/2026). O nome é o que o
 * editor escreve na edição; o catálogo com as props e o "quando usar" mora no
 * app (lib/media/editor-sob-medida/pecas.ts), que é o que vai ao prompt.
 */
export const PECAS: Record<string, (c: ContextoDaPeca) => React.ReactElement | null> = {
  titulo: Titulo,
  capitulo: Capitulo,
  "rotulo-inferior": RotuloInferior,
  "frase-impacto": FraseImpacto,
  "palavra-chave": PalavraChave,
  citacao: Citacao,
  pergaminho: Pergaminho,
  "pergunta-resposta": PerguntaResposta,
  "painel-lateral": PainelLateral,
  fecho: Fecho,
  cartoes: Cartoes,
  "linha-do-tempo": LinhaDoTempo,
  escada: Escada,
  checklist: Checklist,
  comparacao: Comparacao,
  fluxo: Fluxo,
  numero: NumeroDestaque,
  barras: Barras,
  cifrao: Cifrao,
  progresso: Progresso,
  mapa: Mapa,
  seta: Seta,
  circulo: Circulo,
  icone: IconeComRotulo,
  desenho: Desenho,
  sublinhado: Sublinhado,
  "moldura-do-cartao": MolduraDoCartao,
  // A segunda volta do acabamento (03/10): profundidade, foco e dados.
  "titulo-atras": TituloAtras,
  "passos-foco": PassosFoco,
  "grafico-linha": GraficoLinha,
  transicao: Transicao,
  // As peças da lousa (04/10), dos 14 quadros reais do Dan Martell (pecas/lousa.tsx).
  "palavra-gigante": PalavraGigante,
  busca: Busca,
  "legenda-destaque": LegendaDestaque,
  "grade-azul": GradeAzul,
  "pilha-passos": PilhaPassos,
  "marca-brilho": MarcaBrilho,
  notebook: Notebook,
  "ilustracao-traco": IlustracaoTraco,
  chat: Chat,
  material: Material,
  seguir: Seguir,
  ferramentas: Ferramentas,
  // As peças do estilo Vox (04/10), do quadro de treino vox-01 do dono (pecas/vox.tsx).
  colagem: Colagem,
  jornal: Jornal,
  "mapa-antigo": MapaAntigo,
  censura: Censura,
  "marca-texto": MarcaTexto,
  carimbo: CarimboSobre,
  "fundo-colagem": FundoColagem,
  cronologia: Cronologia,
  // A imagem gerada em janela, com a moldura da linguagem do vídeo (05/10, noite: editor por comando em dois eixos).
  "imagem-janela": ImagemJanela,
  // A chamada de curtir e se inscrever (05/10, noite), nos momentos que o JEV escolheu, desenhada na linguagem do vídeo.
  inscrever: Inscrever,
  // As peças de contexto (06/10): o editor decide pelo contexto do vídeo inteiro (quem fala, tela, quadro, área livre).
  "nome-de-quem-fala": NomeDeQuemFala,
  "realce-de-quem-fala": RealceDeQuemFala,
  "zoom-no-ponto": ZoomNoPonto,
  "destaque-na-tela": DestaqueNaTela,
  "cartao-de-passo": CartaoDePasso,
  "frase-chave": FraseChave,
  slide: Slide,
};

/** O instante (s, tempo da base) que o quadro condensado `f` mostra. */
export function tempoDoQuadro(trechos: Trecho[], f: number, fps: number): number {
  let lo = 0;
  let hi = trechos.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (trechos[m].c0 <= f) lo = m;
    else hi = m - 1;
  }
  const t = trechos[lo];
  if (!t) return 0;
  return t.t0 + Math.min(t.n - 1, Math.max(0, f - t.c0)) / fps;
}

/** O contexto de uma camada no instante `t` (null fora dela). */
export function contexto(camada: CamadaResolvida, t: number, p: PropsDasCamadas): ContextoDaPeca | null {
  if (t < camada.de || t >= camada.ate) return null;
  const local = t - camada.de;
  const dur = camada.ate - camada.de;
  // No 9:16 o quadro é alto: a peça precisa de letra maior para ler no celular
  // (prova de 03/10: o painel e a comparação saíram pequenos demais em pé).
  const u = (Math.min(p.largura, p.altura) / 1080) * (p.altura > p.largura ? 1.3 : 1);
  return {
    t: local,
    dur,
    entra: limitar(local / Math.max(0.05, camada.entrada)),
    fica: saiSuave((camada.ate - t) / Math.max(0.05, camada.saida)),
    passos: camada.eventos.map((e) => limitar((t - e) / Math.max(0.05, camada.evento))),
    eventosLocais: camada.eventos.map((e) => e - camada.de),
    props: camada.props,
    tema: p.tema,
    W: p.largura,
    H: p.altura,
    vertical: p.altura > p.largura,
    u,
    logoUrl: p.logoUrl,
  };
}

/** As peças de tela cheia: no 16:9 a tela é só delas, e elas crescem para ocupá-la. */
const DE_TELA = new Set(["cartoes", "linha-do-tempo", "escada", "comparacao", "fluxo", "frase-impacto", "citacao", "passos-foco", "grafico-linha"]);

/**
 * AS PASSADAS (03/10, segunda volta): a mesma árvore de peças é desenhada até
 * três vezes, e o CSS decide o que aparece em cada uma (o layout é idêntico,
 * então tudo casa no ffmpeg):
 *   - "frente": tudo, menos o que vai atrás da pessoa;
 *   - "atras": só o que leva `data-atras` (o título gigante), que o ffmpeg
 *     põe POR BAIXO da pessoa recortada;
 *   - "vidro": só as caixas de vidro, em branco chapado: a máscara com que o
 *     ffmpeg desfoca a gravação atrás delas.
 */
const CSS_DAS_PASSADAS: Record<string, string> = {
  frente: ".passe [data-atras]{visibility:hidden!important}",
  atras: ".passe *{visibility:hidden}.passe [data-atras],.passe [data-atras] *{visibility:visible}",
  vidro:
    ".passe *{color:transparent!important;text-shadow:none!important;background:none!important;box-shadow:none!important;border-color:transparent!important;filter:none!important;backdrop-filter:none!important;-webkit-text-fill-color:transparent!important}.passe svg,.passe img{visibility:hidden!important}.passe [data-atras]{visibility:hidden!important}.passe [data-vidro]{background:#fff!important}",
};

/**
 * A FOLHA SOBRE A GRAVAÇÃO (05/10, noite; regra 1 do Bruno): o cenário do
 * cliente nunca é trocado sem pedido. Sem o pedido, a peça de TELA CHEIA
 * (jornal, colagem, cartões, número, citação, mapa...) não cobre a pessoa: o
 * resolvedor marca `props.sobreAGravacao` e ela é desenhada aqui, inteira e
 * do mesmo jeito, dentro de uma folha menor no lado livre do rosto (no 9:16,
 * na faixa livre), que entra com mola, fica e sai. A moldura da folha é a da
 * LINGUAGEM do vídeo (papel rasgado no documental, vidro, bloco, filete
 * dourado, neon): o tema só muda a aparência, nunca decide o que entra.
 */
function medidasDaFolha(p: PropsDasCamadas, lado: string, caixa?: unknown): { x: number; y: number; w: number; h: number } {
  const W = p.largura;
  const H = p.altura;
  // A caixa que o resolvedor mediu pelo rosto (fração do quadro) manda; sem ela, as medidas padrão.
  const cx = caixa && typeof caixa === "object" ? (caixa as { x?: number; y?: number; w?: number; h?: number }) : null;
  if (cx && [cx.x, cx.y, cx.w, cx.h].every((v) => typeof v === "number" && Number.isFinite(v)) && cx.w! > 0.1 && cx.h! > 0.1) {
    return { x: Math.round(cx.x! * W), y: Math.round(cx.y! * H), w: Math.round(cx.w! * W), h: Math.round(cx.h! * H) };
  }
  if (H > W) {
    const w = Math.round(W * 0.92);
    const h = Math.round(H * 0.44);
    return { x: Math.round((W - w) / 2), y: lado === "topo" ? Math.round(H * 0.05) : Math.round(H * 0.5), w, h };
  }
  const w = Math.round(W * 0.56);
  const h = Math.round(H * 0.78);
  return { x: lado === "esquerda" ? Math.round(W * 0.035) : W - w - Math.round(W * 0.035), y: Math.round(H * 0.1), w, h };
}

function FolhaSobreAGravacao({ c, p, children }: { c: ContextoDaPeca; p: PropsDasCamadas; children: React.ReactNode }) {
  const { tema } = c;
  const u = c.u;
  const m = medidasDaFolha(p, String(c.props.lado ?? ""), c.props.folha);
  const papel = tema.visual === "documental";
  const luxo = tema.acabamento === "luxo";
  const neon = tema.linguagem === "neon";
  const ouro = "#C9A24A";
  const entra = molaFisica(c.t, 150, 16);
  const sai = c.fica;
  const semente = Math.round(m.x + m.y) % 13;
  const borda = 10 * u;
  const moldura: React.CSSProperties = papel
    ? { background: "#f4eddc", clipPath: rasgado(m.w + 2 * borda, m.h + 2 * borda, semente, 14 * u) }
    : luxo
      ? { background: `linear-gradient(135deg, ${ouro}, ${misturar(ouro, "#ffffff", 0.35)}, ${ouro})`, borderRadius: 10 * u }
      : neon
        ? { background: tema.acento, borderRadius: 22 * u, boxShadow: brilhoDaFolha(tema.acento, u) }
        : tema.visual === "impacto"
          ? { background: "#0b0c0f", borderRadius: 18 * u, borderBottom: `${12 * u}px solid ${tema.acento}` }
          : { background: rgba("#ffffff", 0.22), border: `${1.5 * u}px solid ${rgba("#ffffff", 0.4)}`, borderRadius: 28 * u, backdropFilter: `blur(${12 * u}px)` };
  return (
    <div
      style={{
        position: "absolute",
        left: m.x - borda,
        top: m.y - borda,
        width: m.w + 2 * borda,
        height: m.h + 2 * borda,
        filter: `drop-shadow(0 ${26 * u}px ${48 * u}px rgba(0,0,0,.55)) drop-shadow(0 ${4 * u}px ${8 * u}px rgba(0,0,0,.35))`,
        opacity: limitar(c.t / 0.1) * sai,
        transform: `translateY(${((1 - entra) * 70 * u + (1 - sai) * 40 * u).toFixed(1)}px) scale(${(0.94 + 0.06 * entra).toFixed(3)}) rotate(${papel ? (semente % 2 ? -1.2 : 1) : 0}deg)`,
        transformOrigin: "50% 60%",
      }}
    >
      <div style={{ position: "absolute", inset: 0, ...moldura }} />
      <div style={{ position: "absolute", left: borda, top: borda, width: m.w, height: m.h, overflow: "hidden", borderRadius: papel ? 0 : luxo ? 6 * u : neon ? 16 * u : tema.visual === "impacto" ? 10 * u : 22 * u }}>{children}</div>
    </div>
  );
}

const brilhoDaFolha = (cor: string, u: number) => `0 0 ${30 * u}px ${rgba(cor, 0.55)}, 0 0 ${80 * u}px ${rgba(cor, 0.25)}`;

/** O contexto da peça dentro da folha: a largura e a altura passam a ser as da folha (a peça se desenha para ela). */
function contextoNaFolha(ctx: ContextoDaPeca, p: PropsDasCamadas): ContextoDaPeca {
  const m = medidasDaFolha(p, String(ctx.props.lado ?? ""), ctx.props.folha);
  const vertical = m.h > m.w;
  return { ...ctx, W: m.w, H: m.h, vertical, u: (Math.min(m.w, m.h) / 1080) * (vertical ? 1.3 : 1.12) };
}

export const Camadas: React.FC<PropsDasCamadas> = (bruto) => {
  carregarFontesDoTema();
  // O acento é o VIVO em todo acabamento (o mesmo matiz da marca, que brilha); a cor original segue em `acentoMarca`.
  const props = { ...bruto, tema: { ...bruto.tema, acentoMarca: bruto.tema.acentoMarca ?? bruto.tema.acento, acento: vivo(bruto.tema.acento) } };
  const frame = useCurrentFrame();
  const t = tempoDoQuadro(props.trechos, frame, props.fps);
  const passe = props.passe ?? "frente";
  return (
    <AbsoluteFill className="passe" style={{ backgroundColor: "transparent" }}>
      {/* A largura das peças inclui o respiro: sem isto o cartão do número vazava no 9:16 (prova de 03/10). */}
      <style>{"*{box-sizing:border-box}" + (CSS_DAS_PASSADAS[passe] ?? "")}</style>
      {props.camadas.map((c) => {
        const ctx0 = contexto(c, t, props);
        const Peca = PECAS[c.peca];
        if (!ctx0 || !Peca) return null;
        // As de tela crescem para ocupar a tela; no 9:16 também (prova de 03/10,
        // segunda volta: a comparação e a citação ocupavam só o terço de cima).
        const ctx = DE_TELA.has(c.peca) ? { ...ctx0, u: ctx0.u * (ctx0.vertical ? 1.2 : 1.28) } : ctx0;
        // A folha sobre a gravação (regra 1): a peça de tela desenhada menor, no lado livre, sem cobrir a pessoa.
        if (c.props.sobreAGravacao) {
          const dentro = contextoNaFolha(ctx0, props);
          const ctxF = DE_TELA.has(c.peca) ? { ...dentro, u: dentro.u * 1.18 } : dentro;
          return (
            <AbsoluteFill key={c.id} style={{ fontFamily: props.tema.fonteTexto }}>
              <FolhaSobreAGravacao c={ctx0} p={props}>
                <Peca {...ctxF} />
              </FolhaSobreAGravacao>
            </AbsoluteFill>
          );
        }
        return (
          <AbsoluteFill key={c.id} style={{ fontFamily: props.tema.fonteTexto }}>
            <Peca {...ctx} />
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

/**
 * O FUNDO DA MARCA (os planos "cartão" e "gráfico"): o escuro da marca com a
 * grade fina e o brilho do acento, como o pitch; no documental, papel claro
 * quente. Renderizado uma vez como imagem parada.
 */
export const FundoDaMarca: React.FC<PropsDoFundo> = ({ largura, altura, tema: tema0, cartao }) => {
  const tema = { ...tema0, acento: vivo(tema0.acento) };
  const u = Math.min(largura, altura) / 1080;
  const doc = tema.visual === "documental";
  const escuro = escuroDoTema(tema);
  const fundo = doc ? misturar(tema.escuro, "#1a1712", 0.65) : escuro;
  if (tema.visual === "impacto") {
    // Alta retenção: o fundo é a cor da marca, viva, com a grade clara.
    return (
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 30% 20%, ${misturar(tema.acento, "#ffffff", 0.12)}, ${misturar(tema.acento, "#000000", 0.28)} 75%)` }}>
        <AbsoluteFill style={{ backgroundImage: `linear-gradient(to right, rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.12) 1px, transparent 1px)`, backgroundSize: `${56 * u}px ${56 * u}px` }} />
        {cartao ? <div style={{ position: "absolute", left: cartao.x, top: cartao.y, width: cartao.w, height: cartao.h, borderRadius: 28 * u, boxShadow: `0 ${30 * u}px ${80 * u}px rgba(0,0,0,.45)`, background: "#000" }} /> : null}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: fundo }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(to right, ${rgba(doc ? "#c8b48a" : "#3a5a85", doc ? 0.08 : 0.28)} 1px, transparent 1px), linear-gradient(to bottom, ${rgba(doc ? "#c8b48a" : "#3a5a85", doc ? 0.08 : 0.28)} 1px, transparent 1px)`,
          backgroundSize: `${48 * u}px ${48 * u}px`,
        }}
      />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 30% 0%, ${rgba(misturar(escuro, "#2a5a9a", 0.5), 0.75)}, ${rgba(escuro, 0)} 60%)` }} />
      <div style={{ position: "absolute", right: -200 * u, top: -260 * u, width: 900 * u, height: 900 * u, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(tema.acento, 0.2)}, ${rgba(tema.acento, 0)} 65%)` }} />
      {/* As linhas topográficas e a vinheta (03/10, segunda volta): o fundo do cartão deixa de ser chapado. */}
      <svg width={largura} height={altura} style={{ position: "absolute", inset: 0, opacity: doc ? 0.12 : 0.2 }}>
        {Array.from({ length: 16 }, (_, i) => {
          const cx = largura * 0.66;
          const cy = altura * 0.52;
          const r0 = (60 + i * 58) * u;
          const pts: string[] = [];
          for (let a = 0; a <= 72; a++) {
            const ang = (a / 72) * Math.PI * 2;
            const w = 1 + 0.16 * Math.sin(ang * 3 + i * 0.6) + 0.08 * Math.sin(ang * 7 - i * 0.3);
            pts.push(`${(cx + Math.cos(ang) * r0 * w * 1.25).toFixed(1)},${(cy + Math.sin(ang) * r0 * w * 0.85).toFixed(1)}`);
          }
          return <polygon key={i} points={pts.join(" ")} fill="none" stroke={i % 4 === 0 ? rgba(tema.acento, 0.9) : "rgba(255,255,255,.7)"} strokeWidth={(i % 4 === 0 ? 1.4 : 0.9) * u} />;
        })}
      </svg>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 75% 70% at 50% 45%, transparent 55%, rgba(0,0,0,.5) 100%)" }} />
      {cartao ? <div style={{ position: "absolute", left: cartao.x, top: cartao.y, width: cartao.w, height: cartao.h, borderRadius: 28 * u, boxShadow: `0 ${30 * u}px ${80 * u}px rgba(0,0,0,.6)`, background: "#000" }} /> : null}
    </AbsoluteFill>
  );
};
