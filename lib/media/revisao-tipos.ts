/**
 * Os tipos da revisão do plano (01/10/2026), sem banco nem IA: a tela de
 * roteiro (cliente) e o roteiro em texto importam daqui. O revisor mora em
 * lib/media/revisor-da-montagem.ts.
 */

export type ProblemaDaRevisao = {
  /** Índice da cena no plano; null: problema do plano inteiro. */
  cena: number | null;
  gravidade: "alta" | "media" | "baixa";
  /** De onde veio: o código (número) ou o revisor (julgamento). */
  origem: "codigo" | "revisor";
  regra: string;
  problema: string;
  correcao: string;
};

export type MedidasDoPlano = {
  duracao: number;
  cenas: number;
  cenaMedia: number;
  /** Segundo do primeiro gancho visual (elemento, punch ou layout que não é o narrador cheio). */
  gancho: number;
  /** A maior janela sem nada mudando na tela, e onde começa. */
  maiorJanela: number;
  maiorJanelaEm: number;
  elementosPorMinuto: number;
  punchPorMinuto: number;
  /** Frações do tempo. */
  rosto: number;
  broll: number;
  texto: number;
  /** Fração das cenas com fundo que são escuras. */
  fundoEscuro: number;
};

/** Para a tela e o banco: o que o revisor achou e o que foi corrigido. */
export type ResumoDaRevisao = {
  /** 0 a 10; -1 quando a revisão por IA falhou (só o código conferiu). */
  nota: number;
  problemas: Array<Pick<ProblemaDaRevisao, "cena" | "gravidade" | "origem" | "problema">>;
  corrigidas: number;
  /** "corrigido": cenas trocadas; "aprovado": nada a corrigir; "sem-correcao": falhou ao corrigir. */
  resultado: "aprovado" | "corrigido" | "sem-correcao";
  medidas: MedidasDoPlano;
  /** As mesmas medidas depois da correção. */
  depois?: MedidasDoPlano;
  estilo: string;
  feitoEm: string;
};
