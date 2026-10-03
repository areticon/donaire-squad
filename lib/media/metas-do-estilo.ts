import type { BibliaDoEstilo, MetasDoEstilo, NomeDaMeta } from "@/lib/media/biblias/tipos";

/**
 * AS METAS DE UM PROJETO: a bíblia do estilo ajustada pelo nicho (01/10/2026).
 *
 * O padrão do nicho vem da medição dos vídeos de referência
 * (lib/referencias/padrao-visual.ts): só números e etiquetas, nunca o vídeo de
 * terceiro. Ele PUXA a meta da bíblia para perto do que rende no nicho, com
 * peso de até 0,6 (decisão do Bruno de 01/10), e a meta nunca sai da faixa de
 * identidade do estilo: se o nicho corta a cada 2,5 s e o cliente escolheu
 * Vox (cena de 4 a 7 s), a meta vai a 4 s, não a 2,5 s. Vocabulário,
 * tipografia, paleta, marca e tom não mudam com o nicho.
 *
 * Módulo puro.
 */

export const PESO_MAXIMO_DO_NICHO = 0.6;

/** O padrão medido no nicho (o que o cartão "ritmo:nicho" guarda em `medidas`). */
export type PadraoDeRitmoDoNicho = {
  /** Vídeos medidos e perfis distintos. */
  videos: number;
  perfis: number;
  /** ISO da medição. */
  medidoEm: string;
  /** As medianas dos vídeos que rendem acima da mediana do perfil (ou de todos, se poucos). */
  valores: Partial<Record<NomeDaMeta, number>>;
  /** Etiquetas abstratas de imagem (enquadramento, luz, saturação, ambiente). */
  olhar?: string[];
};

export type MetasDoProjeto = {
  metas: Record<NomeDaMeta, number>;
  /** O que o nicho mudou, em português, para a tela e para o log. */
  ajustes: string[];
  /** O peso que o nicho teve (0 sem padrão). */
  peso: number;
};

const ROTULO: Record<NomeDaMeta, (v: number) => string> = {
  cenaSeg: (v) => `cena de ${v.toFixed(1).replace(".", ",")} s`,
  mudancaACadaSeg: (v) => `algo novo a cada ${v.toFixed(1).replace(".", ",")} s`,
  ganchoAteSeg: (v) => `gancho até ${v.toFixed(1).replace(".", ",")} s`,
  textoNaTela: (v) => `texto na tela em ${Math.round(v * 100)}% do tempo`,
  rostoNaTela: (v) => `rosto em ${Math.round(v * 100)}% do tempo`,
  brollNaTela: (v) => `imagem de apoio em ${Math.round(v * 100)}% do tempo`,
  elementosPorMinuto: (v) => `${Math.round(v)} elementos por minuto`,
  batidasPorMinuto: (v) => `trilha a ${Math.round(v)} batidas por minuto`,
};

/** A confiança no padrão: cresce com vídeos e perfis medidos, cai com a idade. */
export function pesoDoNicho(p: PadraoDeRitmoDoNicho | null | undefined, agora = Date.now()): number {
  if (!p || p.videos < 5 || p.perfis < 2) return 0;
  const idadeDias = (agora - new Date(p.medidoEm).getTime()) / 86_400_000;
  const frescor = idadeDias <= 60 ? 1 : idadeDias <= 120 ? 0.5 : 0;
  return Math.round(PESO_MAXIMO_DO_NICHO * Math.min(1, p.videos / 30) * Math.min(1, p.perfis / 3) * frescor * 100) / 100;
}

export function metasDoProjeto(b: BibliaDoEstilo, nicho?: PadraoDeRitmoDoNicho | null): MetasDoProjeto {
  const peso = pesoDoNicho(nicho);
  const metas = {} as Record<NomeDaMeta, number>;
  const ajustes: string[] = [];
  for (const nome of Object.keys(b.metas) as NomeDaMeta[]) {
    const f = (b.metas as MetasDoEstilo)[nome];
    const doNicho = nicho?.valores?.[nome];
    let v = f.padrao;
    if (peso > 0 && typeof doNicho === "number" && Number.isFinite(doNicho)) {
      v = Math.min(f.max, Math.max(f.min, f.padrao + peso * (doNicho - f.padrao)));
      // Ajuste de menos de 5% não vale uma linha na tela.
      if (Math.abs(v - f.padrao) / Math.max(0.01, Math.abs(f.padrao)) >= 0.05) ajustes.push(`${ROTULO[nome](v)} (o estilo pede ${ROTULO[nome](f.padrao)}; o nicho, ${ROTULO[nome](doNicho)})`);
    }
    metas[nome] = Math.round(v * 100) / 100;
  }
  return { metas, ajustes, peso };
}

/** As metas em linhas para o prompt do diretor e do revisor. */
export function metasNoPrompt(m: MetasDoProjeto): string {
  const x = m.metas;
  const n = (v: number) => v.toFixed(1).replace(".", ",");
  const linhas = [
    `- Cena média de ${n(x.cenaSeg)} s; algo muda na tela pelo menos a cada ${n(x.mudancaACadaSeg)} s.`,
    `- Gancho visual até ${n(x.ganchoAteSeg)} s.`,
    `- Grafismo de texto em cerca de ${Math.round(x.textoNaTela * 100)}% do tempo; rosto em cerca de ${Math.round(x.rostoNaTela * 100)}%; imagem de apoio em tela cheia em cerca de ${Math.round(x.brollNaTela * 100)}%.`,
    `- Cerca de ${Math.round(x.elementosPorMinuto)} elementos por minuto.`,
  ];
  if (m.ajustes.length) linhas.push(`- Ajustado ao que rende no nicho do cliente (peso ${m.peso.toFixed(2).replace(".", ",")}): ${m.ajustes.join("; ")}.`);
  return linhas.join("\n");
}
