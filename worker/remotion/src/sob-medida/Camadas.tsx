import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { carregarFontesDoTema, escuroDoTema, limitar, misturar, rgba, saiSuave, vivo } from "./base";
import { Capitulo, Citacao, Fecho, FraseImpacto, PainelLateral, PalavraChave, Pergaminho, PerguntaResposta, RotuloInferior, Titulo } from "./pecas/texto";
import { Cartoes, Checklist, Comparacao, Escada, Fluxo, LinhaDoTempo } from "./pecas/estrutura";
import { Barras, Cifrao, Mapa, NumeroDestaque, Progresso } from "./pecas/dados";
import { Circulo, Desenho, IconeComRotulo, MolduraDoCartao, Seta, Sublinhado } from "./pecas/apontar";
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
const DE_TELA = new Set(["cartoes", "linha-do-tempo", "escada", "comparacao", "fluxo", "frase-impacto", "citacao"]);

export const Camadas: React.FC<PropsDasCamadas> = (bruto) => {
  carregarFontesDoTema();
  // No vidro escuro, o acento é o VIVO (o mesmo matiz da marca, legível).
  const props = bruto.tema.visual === "vidro" ? { ...bruto, tema: { ...bruto.tema, acento: vivo(bruto.tema.acento) } } : bruto;
  const frame = useCurrentFrame();
  const t = tempoDoQuadro(props.trechos, frame, props.fps);
  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {/* A largura das peças inclui o respiro: sem isto o cartão do número vazava no 9:16 (prova de 03/10). */}
      <style>{"*{box-sizing:border-box}"}</style>
      {props.camadas.map((c) => {
        const ctx0 = contexto(c, t, props);
        const Peca = PECAS[c.peca];
        if (!ctx0 || !Peca) return null;
        const ctx = !ctx0.vertical && DE_TELA.has(c.peca) ? { ...ctx0, u: ctx0.u * 1.28 } : ctx0;
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
  const tema = tema0.visual === "vidro" ? { ...tema0, acento: vivo(tema0.acento) } : tema0;
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
      {cartao ? <div style={{ position: "absolute", left: cartao.x, top: cartao.y, width: cartao.w, height: cartao.h, borderRadius: 28 * u, boxShadow: `0 ${30 * u}px ${80 * u}px rgba(0,0,0,.6)`, background: "#000" }} /> : null}
    </AbsoluteFill>
  );
};
