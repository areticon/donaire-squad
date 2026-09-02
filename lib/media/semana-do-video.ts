/**
 * A semana a partir do vídeo: o que o cliente escolhe, dia a dia.
 *
 * Até 02/09 a campanha derivada da gravação era fixa: Lucas na quarta, Tiago
 * na quinta, Diana no sábado, sem ninguém perguntar. O Bruno reprovou: "o
 * usuário ainda assim deve escolher como quer a campanha, dia após dia da
 * semana". Este módulo é a linguagem comum entre o planejador da tela, o
 * projeto (onde a escolha fica guardada) e a esteira (que escreve as peças).
 *
 * Segunda é sempre o vídeo (completo mais cortes) e não entra aqui. Terça a
 * domingo têm um formato ou ficam sem post. Sem importar nada de servidor,
 * de propósito: o planejador do cliente importa daqui.
 */

export type FormatoDoDia =
  | "text"
  | "image"
  | "carousel"
  | "infographic"
  | "thread"
  | "poll"
  | "free";

/** Chaves "2".."7" (terça a domingo). Ausente ou nulo é dia sem post. */
export type SemanaDoVideo = Partial<Record<"2" | "3" | "4" | "5" | "6" | "7", FormatoDoDia | null>>;

export const DIAS_DA_SEMANA: Array<{ dia: 2 | 3 | 4 | 5 | 6 | 7; curto: string; nome: string }> = [
  { dia: 2, curto: "Ter", nome: "terça" },
  { dia: 3, curto: "Qua", nome: "quarta" },
  { dia: 4, curto: "Qui", nome: "quinta" },
  { dia: 5, curto: "Sex", nome: "sexta" },
  { dia: 6, curto: "Sáb", nome: "sábado" },
  { dia: 7, curto: "Dom", nome: "domingo" },
];

/**
 * Os formatos que o cliente enxerga, com o custo em créditos ALÉM do texto.
 * Os números são os mesmos da campanha de texto (imagem 8, carrossel 24 com
 * três slides, infográfico 5), para o cliente não ver dois preços para a
 * mesma coisa.
 */
export const FORMATOS: Array<{ id: FormatoDoDia; rotulo: string; creditos: number; dica: string }> = [
  { id: "text", rotulo: "Texto", creditos: 0, dica: "Post de texto na sua voz" },
  { id: "image", rotulo: "Imagem", creditos: 8, dica: "Uma frase do vídeo como peça visual" },
  { id: "carousel", rotulo: "Carrossel", creditos: 24, dica: "Três slides, uma ideia por slide" },
  { id: "infographic", rotulo: "Infográfico", creditos: 5, dica: "Os dados da pesquisa em uma peça" },
  { id: "thread", rotulo: "Thread", creditos: 0, dica: "Uma sequência no X" },
  { id: "poll", rotulo: "Enquete", creditos: 0, dica: "Uma pergunta para o público responder" },
  { id: "free", rotulo: "Livre", creditos: 0, dica: "O squad decide o formato do dia" },
];

export const ROTULO_DO_FORMATO: Record<FormatoDoDia, string> = Object.fromEntries(
  FORMATOS.map((f) => [f.id, f.rotulo])
) as Record<FormatoDoDia, string>;

/**
 * A sugestão do squad, que a tela mostra preenchida: terça texto, quarta
 * imagem, quinta thread, sábado carrossel; sexta e domingo sem post. Cabe em
 * uma semana sem cansar, e cobre texto, visual e conversa.
 */
export const SEMANA_SUGERIDA: SemanaDoVideo = {
  "2": "text",
  "3": "image",
  "4": "thread",
  "5": null,
  "6": "carousel",
  "7": null,
};

const FORMATOS_VALIDOS = new Set<string>(FORMATOS.map((f) => f.id));

/** Lê o que veio do banco ou da tela e devolve uma semana válida. */
export function normalizarSemana(bruto: unknown): SemanaDoVideo {
  if (!bruto || typeof bruto !== "object") return { ...SEMANA_SUGERIDA };
  const fonte = bruto as Record<string, unknown>;
  const semana: SemanaDoVideo = {};
  for (const { dia } of DIAS_DA_SEMANA) {
    const chave = String(dia) as keyof SemanaDoVideo;
    const v = fonte[chave];
    semana[chave] = typeof v === "string" && FORMATOS_VALIDOS.has(v) ? (v as FormatoDoDia) : null;
  }
  return semana;
}

/**
 * O formato de verdade de um dia "livre". Alterna visual e texto para a
 * semana não ficar de um jeito só, e nunca cai em carrossel (é o mais caro,
 * e o cliente não pediu por ele).
 */
export function resolverLivre(dia: number): Exclude<FormatoDoDia, "free"> {
  const ordem: Array<Exclude<FormatoDoDia, "free">> = ["text", "image", "thread", "text", "infographic", "text"];
  return ordem[(dia - 2 + ordem.length) % ordem.length];
}

/** Créditos estimados além do vídeo, para a tela dizer antes do envio. */
export function creditosDaSemana(semana: SemanaDoVideo): number {
  let total = 0;
  for (const { dia } of DIAS_DA_SEMANA) {
    const f = semana[String(dia) as keyof SemanaDoVideo];
    if (!f) continue;
    const formato = f === "free" ? resolverLivre(dia) : f;
    total += FORMATOS.find((x) => x.id === formato)?.creditos ?? 0;
  }
  return total;
}

/** Os dias com post, em ordem, já com o "livre" resolvido. */
export function diasDaSemana(semana: SemanaDoVideo): Array<{ dia: number; formato: Exclude<FormatoDoDia, "free">; escolhido: FormatoDoDia }> {
  const dias: Array<{ dia: number; formato: Exclude<FormatoDoDia, "free">; escolhido: FormatoDoDia }> = [];
  for (const { dia } of DIAS_DA_SEMANA) {
    const f = semana[String(dia) as keyof SemanaDoVideo];
    if (!f) continue;
    dias.push({ dia, formato: f === "free" ? resolverLivre(dia) : f, escolhido: f });
  }
  return dias;
}
