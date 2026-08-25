import type { NomeDoEstilo } from "@/lib/media/estilos";

/**
 * As fontes públicas de música que o popup oferece.
 *
 * ## O que este arquivo é, e o que ele nunca pode virar
 *
 * É um catálogo de METADADOS: nomes, licenças e portas de entrada. Nenhum
 * arquivo de áudio, nenhum link direto de download. A linha jurídica decidida
 * em 23/08 é que quem baixa o arquivo é o CLIENTE, na fonte: se a Demandou
 * hospedasse ou servisse a faixa, viraria distribuidora e precisaria de
 * sublicença (a Artlist proíbe explicitamente projetos para canais de
 * terceiros). Como atalho até a fonte, a Demandou segue ferramenta de edição.
 *
 * ## Por que fontes com busca, e não faixas com link direto
 *
 * Link de faixa individual em site alheio morre sem aviso, e um popup cheio de
 * links quebrados é pior que nenhum popup. A porta de entrada é a BUSCA da
 * fonte já filtrada pelo clima, que é estável, e os termos de busca vêm do
 * estilo de edição do projeto.
 */

export type FonteDeMusica = {
  nome: string;
  /** O resumo da licença, na linguagem de quem vai publicar. */
  licenca: string;
  /** O que o cliente precisa fazer além de baixar. Vazio quando nada. */
  obrigacao: string;
  /** Monta a URL de busca da fonte para um termo. */
  busca: (termo: string) => string;
};

export const FONTES_DE_MUSICA: FonteDeMusica[] = [
  {
    nome: "Pixabay Music",
    licenca: "Uso comercial liberado, sem crédito obrigatório.",
    obrigacao: "",
    busca: (termo) => `https://pixabay.com/music/search/${encodeURIComponent(termo)}/`,
  },
  {
    nome: "YouTube Audio Library",
    licenca: "Use SÓ as faixas marcadas Creative Commons (CC BY).",
    obrigacao:
      "A licença padrão do YouTube só vale dentro do YouTube, e a Demandou publica em cinco redes. Filtre por CC BY e dê o crédito na descrição.",
    busca: () => "https://studio.youtube.com/channel/UC/music",
  },
  {
    nome: "Free Music Archive",
    licenca: "Faixas CC BY: uso comercial com crédito ao artista.",
    obrigacao: "Confira a licença da faixa e dê o crédito na descrição do post.",
    busca: (termo) =>
      `https://freemusicarchive.org/search/?quicksearch=${encodeURIComponent(termo)}`,
  },
];

/**
 * Os climas de busca de cada estilo de edição.
 *
 * O estilo já decide legenda, ritmo, mixagem e a arte; decide também o que
 * procurar na biblioteca. Termos em inglês porque é o idioma de catálogo das
 * três fontes.
 */
export const CLIMA_DO_ESTILO: Record<NomeDoEstilo, string[]> = {
  dramatico: ["cinematic emotional", "piano emotional", "epic inspiring"],
  acelerado: ["upbeat energetic", "sport rock", "hip hop beat"],
  serio: ["corporate background", "minimal ambient", "technology background"],
  animado: ["happy ukulele", "fun pop", "playful acoustic"],
};
