/**
 * O QUE A JANELA "APROVEITAR O ROTEIRO" E O SERVIDOR DIVIDEM (02/10/2026).
 * Módulo puro: a janela é componente de cliente. Quem grava e cobra mora em
 * `lib/media/aproveitar-roteiro.ts`.
 */
import { REDES_DO_FORMATO, type DiaDoPlano, type FormatoDoDia, type RedeDoPlano } from "@/lib/media/semana-do-video";
import { estimarCampanha } from "@/lib/credits/estimativa";

export type OpcaoDeAproveitar = "carrossel" | "imagens" | "posts";

/** Cada opção vira UM dia livre do plano, no formato da semana do vídeo. */
export const OPCOES_DE_APROVEITAR: Array<{ id: OpcaoDeAproveitar; rotulo: string; formato: Exclude<FormatoDoDia, "free" | "short">; dica: string }> = [
  { id: "carrossel", rotulo: "Carrossel", formato: "carousel", dica: "Três lâminas com as ideias do vídeo" },
  { id: "imagens", rotulo: "Imagens", formato: "image", dica: "Uma frase do vídeo como peça visual" },
  { id: "posts", rotulo: "Posts de texto", formato: "text", dica: "Um texto por rede, na sua voz" },
];

/** As redes que a janela oferece para as peças escritas. */
export const REDES_DE_APROVEITAR: Array<{ id: RedeDoPlano; nome: string }> = [
  { id: "linkedin", nome: "LinkedIn" },
  { id: "instagram", nome: "Instagram" },
  { id: "twitter", nome: "X" },
  { id: "facebook", nome: "Facebook" },
];

/** O que o vídeo já gerou e o que ainda cabe na semana dele. */
export type OQueJaExiste = {
  /** Posts escritos (fora os cortes). */
  posts: number;
  /** Por formato do post ("text", "image", "carousel", "video"...). */
  porFormato: Record<string, number>;
  /** Por rede ("linkedin", "instagram"...). */
  porRede: Record<string, number>;
  /** Cortes prontos. */
  cortes: number;
  /** Trechos do roteiro que não viraram corte (dá para escolher mais). */
  candidatosSemCorte: number;
  /** Dias da semana do vídeo ainda sem peça. */
  diasLivres: Array<{ dia: number; iso: string; nome: string }>;
  redesConectadas: RedeDoPlano[];
};

/**
 * Monta os dias novos de um pedido: uma opção por dia livre, com as redes
 * marcadas que aceitam aquele formato. A janela e o servidor contam igual.
 */
export function diasDoPedido(pedido: { formatos: OpcaoDeAproveitar[]; redes: RedeDoPlano[] }, livres: Array<{ dia: number }>): Array<{ dia: number; plano: DiaDoPlano }> {
  const dias: Array<{ dia: number; plano: DiaDoPlano }> = [];
  for (const [i, f] of pedido.formatos.entries()) {
    const livre = livres[i];
    if (!livre) break;
    const formato = OPCOES_DE_APROVEITAR.find((o) => o.id === f)!.formato;
    const redes = pedido.redes.filter((r) => (REDES_DO_FORMATO[formato] as RedeDoPlano[]).includes(r));
    dias.push({ dia: livre.dia, plano: { formato, redes } });
  }
  return dias;
}

/** O preço, pela conta da campanha (`estimarCampanha`, a mesma do "Nova campanha"). */
export function creditosDoPedido(dias: Array<{ plano: DiaDoPlano }>): number {
  return estimarCampanha({ dias: dias.map((d) => ({ tipo: d.plano.formato, redes: d.plano.redes })), redesConectadas: 1 });
}

/** Quantas peças deste formato o vídeo já tem. */
export function jaGeradoDoFormato(e: OQueJaExiste, opcao: OpcaoDeAproveitar): number {
  const formato = OPCOES_DE_APROVEITAR.find((o) => o.id === opcao)!.formato;
  return e.porFormato[formato] ?? 0;
}
