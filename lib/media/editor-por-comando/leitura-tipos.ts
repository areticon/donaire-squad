/**
 * A LEITURA DO VÍDEO (06/10/2026): o contrato do que `lib/media/leitura-do-video.ts`
 * grava em `video_jobs.completoMontagem.leitura`. O editor decide pelo
 * contexto do vídeo inteiro (regra do Bruno, 06/10, 01h: "a IA deve decidir a
 * edição baseado no contexto do vídeo"): gênero, cenário, quem está em cena,
 * o que acontece e o que a imagem mostra em cada trecho, e onde há área livre
 * para as peças.
 *
 * Esta cópia existe só até a mesclagem: o módulo da leitura está sendo escrito
 * em paralelo, e na mesclagem a importação troca para ele. Os nomes e os campos
 * são os MESMOS do contrato combinado; nada aqui pode divergir dele.
 *
 * Módulo puro, só tipos.
 */

/** Uma caixa no quadro, em fração (0 a 1) da largura e da altura. */
export type CaixaNoQuadro = { x: number; y: number; w: number; h: number };

export type PessoaLida = { id: string; nome?: string | null; papel?: string | null; descricao: string };

export type TrechoLido = {
  de: number;
  ate: number;
  pessoasEmCena: Array<{ id: string; caixa: CaixaNoQuadro; rosto?: CaixaNoQuadro | null; falando?: boolean }>;
  tela?: CaixaNoQuadro | null;
  quadro?: CaixaNoQuadro | null;
  movimento: "parado" | "pouco" | "muito";
  acontece: string;
  mostra: string[];
  falaDe: string;
  areaLivre: CaixaNoQuadro[];
};

export type LeituraDoVideo = {
  versao: 1;
  genero: "pessoa-falando" | "apresentacao-com-quadro" | "conversa" | "podcast" | "palestra" | "tela" | "vlog" | "demonstracao" | "outro";
  generoConfianca: number;
  cenario: string;
  formato: "16:9" | "9:16" | "1:1";
  pessoas: PessoaLida[];
  trechos: TrechoLido[];
  resumo: string;
  fontes: { medicao: boolean; visao: string | null };
  custoUsd: number;
};
