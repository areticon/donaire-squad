import React from "react";
import { Composition } from "remotion";
import { Montagem } from "./Montagem";
import { Fundos, TIPOS_DE_FUNDO, type PropsDosFundos } from "./partes/fundo-colagem";
import type { PropsDaMontagem } from "./tipos";

/**
 * Uma composição só, que se mede pelas props: largura, altura, fps e duração
 * vêm do plano resolvido. O mesmo código serve ao corte 9:16 e ao completo 16:9.
 *
 * "Fundos" é a colagem de fundo (kraft, folhas, jornal, fita), renderizada
 * uma vez por montagem como imagens paradas, um fundo por quadro; ver
 * partes/fundo-colagem.tsx e `prepararFundos` em worker/src/montagem.mjs.
 */
export const Raiz: React.FC = () => (
  <>
    <Composition
      id="Montagem"
      component={Montagem as unknown as React.FC<Record<string, unknown>>}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={30}
      defaultProps={{} as Record<string, unknown>}
      calculateMetadata={({ props }) => {
        const m = (props as unknown as PropsDaMontagem).montagem;
        if (!m) return {};
        if (m.versao !== 1) throw new Error(`plano de montagem versão ${String(m.versao)} desconhecida pelo worker`);
        return { width: m.largura, height: m.altura, fps: m.fps, durationInFrames: Math.max(1, Math.ceil(m.duracao * m.fps)) };
      }}
    />
    <Composition
      id="Fundos"
      component={Fundos as unknown as React.FC<Record<string, unknown>>}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={TIPOS_DE_FUNDO.length}
      defaultProps={{ largura: 1080, altura: 1920, marca: { acento: "#F97316", escuro: "#1e1f22" }, papelUrl: null } as Record<string, unknown>}
      calculateMetadata={({ props }) => {
        const p = props as unknown as PropsDosFundos;
        return { width: p.largura, height: p.altura };
      }}
    />
  </>
);
