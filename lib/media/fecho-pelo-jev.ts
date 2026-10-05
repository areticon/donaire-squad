import { decidirChoice, decidirNoul, jevLigado, perguntarAoJev, type PerguntaDoJev, type RespostaDoJev } from "@/lib/jev/cliente";

/**
 * A CONFERÊNCIA DO FECHO PELO JEV (05/10/2026).
 *
 * `conferirFecho` (select-clips.ts) decide se um corte termina com o
 * raciocínio concluído e, se não, em qual frase depois dele a conclusão
 * aterrissa (estende) ou em qual frase de dentro um ponto já fechou (recua).
 * É decisão, não escrita: pela regra do Bruno de 05/10 vai ao JEV. O Sonnet
 * de esforço médio que fazia isso custava US$ 0,003 por corte e uns 10 s; o
 * JEV custa centésimos de centavo e responde em meio segundo.
 *
 * O que é regra fixa fica em código, antes do JEV:
 * - despedida ("Deus abençoe", "até mais", "se inscreve") NUNCA fecha corte:
 *   o fim recua para a última frase antes dela.
 *
 * Padrões seguros quando o JEV não sabe: "concluído" (o corte fica como está)
 * e "nenhuma" (não estende nem recua). FECHO_PELO_JEV=0 volta ao Claude.
 */

export type FraseNumerada = { n: number; texto: string; fim: number };

export type DecisaoDoFecho = {
  concluido: boolean;
  fraseDoFecho: number | null;
  recuarAte: number | null;
  motivo: string;
};

export const DESPEDIDA =
  /\b(deus (te |os |lhes |a )?aben[çc]oe|at[ée] (mais|a pr[óo]xima|o pr[óo]ximo)|se inscreve|inscreva-se|deixa (o|seu) like|curte (a[ií]|o v[ií]deo)|espero que (voc[êe] )?(tenha|tenham) (ajudado|gostado)|um (grande )?abra[çc]o|tchau|fica com deus|valeu(,| pessoal| galera| gente))\b/i;

export function fechoPeloJevLigado(): boolean {
  return jevLigado() && process.env.FECHO_PELO_JEV !== "0";
}

/**
 * A despedida do vídeo nas frases finais do corte: a decisão em código. Devolve
 * a frase para onde recuar (a última antes da despedida), ou null quando a
 * última frase não é despedida.
 */
export function recuoPorDespedida(finais: FraseNumerada[]): number | null {
  if (!finais.length || !DESPEDIDA.test(finais[finais.length - 1].texto)) return null;
  for (let i = finais.length - 2; i >= 0; i--) if (!DESPEDIDA.test(finais[i].texto)) return finais[i].n;
  return null;
}

/** Das respostas do JEV à decisão, no mesmo formato que o Claude devolvia. Puro. */
export function decisaoDoFecho(
  respostas: Record<string, RespostaDoJev | undefined>,
  finais: FraseNumerada[],
  frases: FraseNumerada[]
): DecisaoDoFecho {
  const porDespedida = recuoPorDespedida(finais);
  if (porDespedida !== null) return { concluido: false, fraseDoFecho: null, recuarAte: porDespedida, motivo: "termina na despedida do vídeo" };
  if (finais.length && DESPEDIDA.test(finais[finais.length - 1].texto)) {
    return { concluido: false, fraseDoFecho: null, recuarAte: null, motivo: "só despedida" };
  }
  // Na dúvida o corte fica como está: mexer no fim sem certeza é pior.
  if (decidirNoul(respostas.concluido, true)) return { concluido: true, fraseDoFecho: null, recuarAte: null, motivo: "concluído" };
  const opcoesDepois = [...frases.map((f) => String(f.n)), "nenhuma"] as const;
  const fecho = decidirChoice(respostas.fecho, opcoesDepois, "nenhuma");
  if (fecho !== "nenhuma") return { concluido: false, fraseDoFecho: Number(fecho), recuarAte: null, motivo: "conclui depois" };
  const opcoesDentro = [...finais.slice(0, -1).map((f) => String(f.n)), "nenhuma"] as const;
  const recuo = decidirChoice(respostas.recuo, opcoesDentro, "nenhuma");
  if (recuo !== "nenhuma") return { concluido: false, fraseDoFecho: null, recuarAte: Number(recuo), motivo: "recua ao ponto fechado" };
  return { concluido: false, fraseDoFecho: null, recuarAte: null, motivo: "sem onde fechar" };
}

/** As perguntas ao JEV sobre um corte. Exportado para o teste conferir as opções. */
export function perguntasDoFecho(finais: FraseNumerada[], frases: FraseNumerada[]): Record<string, PerguntaDoJev> {
  const ultima = finais.length;
  const perguntas: Record<string, PerguntaDoJev> = {
    concluido: {
      type: "noul",
      instructions: `O corte, terminando na frase ${ultima} de \`frases_finais_do_corte\` (a última), termina com o raciocínio CONCLUÍDO, de modo que quem assiste só o corte sai entendendo o ponto? Uma cena forte no meio de uma história não é conclusão se o ponto que ela ilustra vem depois. Frase que anuncia o que vem ("vamos ver", "o próximo passo é"), muda de assunto, só pede confirmação ("né?", "tá?") ou é despedida do vídeo NÃO é conclusão.`,
    },
  };
  if (frases.length) {
    perguntas.fecho = {
      type: "choice",
      instructions: "Se o corte NÃO conclui na última frase final, em qual frase de `depois_do_corte` o raciocínio conclui (a primeira em que o ponto aterrissa)? \"nenhuma\" quando a conclusão não aparece nessas frases.",
      criteria: Object.fromEntries([...frases.map((f) => [String(f.n), f.texto.slice(0, 300)]), ["nenhuma", "a conclusão não aparece nas frases depois do corte"]]),
    };
  }
  if (finais.length > 1) {
    perguntas.recuo = {
      type: "choice",
      instructions: "Se o corte NÃO conclui e a conclusão NÃO aparece depois, em qual frase de `frases_finais_do_corte` (antes da última) um raciocínio completo já terminou, de modo que cortar ali deixa um ponto entendível? \"nenhuma\" quando nenhuma serve.",
      criteria: Object.fromEntries([...finais.slice(0, -1).map((f) => [String(f.n), f.texto.slice(0, 300)]), ["nenhuma", "nenhuma frase final deixa um ponto completo"]]),
    };
  }
  return perguntas;
}

/**
 * A decisão de um corte. Null quando o caminho está desligado (quem chama
 * usa o Claude); lança quando o JEV falhou (quem chama já trata o erro).
 */
export async function conferirFechoPeloJev(
  p: { titulo?: string; ideia?: string; finais: FraseNumerada[]; frases: FraseNumerada[]; projectId?: string },
  perguntar: typeof perguntarAoJev = perguntarAoJev
): Promise<DecisaoDoFecho | null> {
  if (!fechoPeloJevLigado()) return null;
  if (!p.finais.length) return { concluido: true, fraseDoFecho: null, recuarAte: null, motivo: "sem frases" };
  const porDespedida = recuoPorDespedida(p.finais);
  if (porDespedida !== null || DESPEDIDA.test(p.finais[p.finais.length - 1].texto)) return decisaoDoFecho({}, p.finais, p.frases);
  const state = {
    contexto:
      "Um CORTE de vídeo curto (Reels, Shorts) recortado de uma gravação longa. Quem assiste só o corte precisa sair entendendo o ponto. `frases_finais_do_corte` são as últimas frases que vão ao ar (a última é o fim atual); `depois_do_corte` é o que vem em seguida na gravação e ainda não está no corte.",
    titulo: p.titulo ?? "",
    ideia: p.ideia ?? "",
    frases_finais_do_corte: p.finais.map((f) => ({ n: f.n, texto: f.texto })),
    depois_do_corte: p.frases.length ? p.frases.map((f) => ({ n: f.n, texto: f.texto })) : "(nada: o corte não pode avançar)",
  };
  const r = await perguntar({ projectId: p.projectId, etapa: "fecho", state }, perguntasDoFecho(p.finais, p.frases));
  return decisaoDoFecho(r, p.finais, p.frases);
}
