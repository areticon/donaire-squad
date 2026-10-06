import { decidirChoice, jevLigado, perguntarAoJev, probabilidadeDeSim, type UsoDoJev } from "@/lib/jev/cliente";

/**
 * A COERÊNCIA ENTRE A ARTE E O TEXTO É DA VERA (05/10/2026, noite).
 *
 * O que aconteceu no Fé & Gestão em 05/10: a frase desenhada na arte de
 * sexta ("Não deixe o medo do julgamento travar seu projeto") era a tese do
 * minuto 13 do vídeo, enquanto a legenda falava da tese do minuto 3 (os nãos
 * de Deus). A tese do dia saía de uma conta de módulo (`(dia - 2) % n`), que
 * deu a MESMA tese para segunda e para sexta, e o ângulo do Roberto para
 * aquele dia era outro. Ninguém conferiu: a Vera pelo JEV só recebia o texto
 * da peça, sem a frase da imagem, e o chat do card, ao "refazer" a arte,
 * reaproveitava a frase gravada e jogava fora a manchete nova.
 *
 * Regra do Bruno: isso não pode passar, muito menos pela Vera, cuja função
 * principal é garantir coerência entre tudo (marca, nicho, projeto,
 * referências, imagem com texto). Então:
 *
 * 1. `teseDoAnguloPeloJev`: a tese do dia é a que CASA com o ângulo do dia,
 *    escolhida pelo JEV, e não a da conta de módulo.
 * 2. `arteCoerenteComOTexto`: antes de pagar uma arte e depois de qualquer
 *    reescrita (Vera, chat do card, edição do cliente), o JEV diz se a frase
 *    da imagem (ou as dos slides) e o texto falam da mesma ideia. Quando não,
 *    a frase nasce de novo a partir do texto e a arte é refeita.
 * 3. A Vera pelo JEV (lib/squad/vera-pelo-jev.ts) recebe a frase da imagem e
 *    tem o critério "coerencia" ao lado de nicho, regras, dado e rede.
 *
 * O JEV decide; o Claude só escreve a frase nova quando há motivo.
 */

export type ArteEmTexto = { frase?: string | null; slides?: string[] | null };

/** Abaixo disto a frase e o texto NÃO falam da mesma ideia. */
export const COERENTE_A_PARTIR_DE = 0.5;

export function temArteParaConferir(a: ArteEmTexto | null | undefined): boolean {
  return Boolean(a && ((typeof a.frase === "string" && a.frase.trim()) || (Array.isArray(a.slides) && a.slides.some((s) => typeof s === "string" && s.trim()))));
}

/** A frase da imagem (ou as dos slides) e o texto da peça falam da mesma ideia? `null` com o JEV fora. */
export async function arteCoerenteComOTexto(p: {
  projectId?: string | null;
  texto: string;
  arte: ArteEmTexto;
  projeto?: { nicho?: string | null; marca?: string | null };
  etapa?: string;
  uso?: UsoDoJev;
}): Promise<{ coerente: boolean | null; nota: number | null }> {
  if (!temArteParaConferir(p.arte)) return { coerente: true, nota: null };
  if (!jevLigado() || !p.texto.trim()) return { coerente: null, nota: null };
  const slides = (p.arte.slides ?? []).filter((s): s is string => typeof s === "string" && Boolean(s.trim()));
  try {
    const state = {
      contexto:
        "Uma peça de rede social com uma parte VISUAL (uma frase desenhada na imagem, ou uma frase por slide) e um TEXTO (a legenda). Imagem e legenda precisam ser uma peça só: mesma ideia central, mesmo assunto, mesma tese. A legenda pode desenvolver, exemplificar ou aprofundar a frase; o que não pode é falar de outro assunto.",
      projeto: { nicho: p.projeto?.nicho ?? "não informado", marca: p.projeto?.marca ?? "não informada" },
      peca: {
        ...(p.arte.frase?.trim() ? { frase_na_imagem: p.arte.frase.trim().slice(0, 300) } : {}),
        ...(slides.length ? { frases_nos_slides: slides.map((s) => s.slice(0, 300)) } : {}),
        texto: p.texto.slice(0, 3500),
      },
    };
    const r = await perguntarAoJev(
      { projectId: p.projectId, etapa: p.etapa ?? "arte-coerencia", state, uso: p.uso },
      {
        coerente: {
          type: "noul",
          instructions:
            "A frase desenhada na imagem (`peca.frase_na_imagem`) ou as frases dos slides (`peca.frases_nos_slides`) e o texto da peça (`peca.texto`) falam da MESMA ideia central e do mesmo assunto, de modo que quem vê a imagem e lê a legenda sente uma peça só? Responda não quando a imagem fala de um assunto e a legenda de outro.",
        },
      }
    );
    const nota = probabilidadeDeSim(r.coerente);
    if (nota === null) return { coerente: null, nota: null };
    return { coerente: nota >= COERENTE_A_PARTIR_DE, nota };
  } catch (e) {
    console.warn("[coerencia-da-arte] JEV falhou (sem veredito):", e instanceof Error ? e.message : e);
    return { coerente: null, nota: null };
  }
}

/**
 * A tese do vídeo que casa com o ângulo do dia, pelo JEV. Devolve o índice
 * em `teses`; sem ângulo, sem JEV ou com confiança baixa, devolve `padrao`
 * (a conta antiga), para a esteira nunca parar por isso.
 */
export async function teseDoAnguloPeloJev(p: {
  projectId?: string | null;
  angulo: string;
  teses: Array<{ minuto: string; frase: string }>;
  padrao: number;
  uso?: UsoDoJev;
}): Promise<number> {
  const n = p.teses.length;
  if (n < 2 || !p.angulo.trim() || !jevLigado()) return p.padrao;
  const ids = p.teses.map((_, i) => `t${i + 1}`);
  try {
    const r = await perguntarAoJev(
      {
        projectId: p.projectId,
        etapa: "tese-do-dia",
        state: {
          contexto: "Um vídeo tem várias TESES (ideias defendidas em minutos diferentes). Para um dia da semana, o pesquisador escreveu o ÂNGULO do post daquele dia. A arte e a legenda do dia precisam nascer da tese que esse ângulo desenvolve.",
          angulo_do_dia: p.angulo.slice(0, 1200),
          teses: p.teses.map((t, i) => ({ id: ids[i], minuto: t.minuto, frase: t.frase.slice(0, 500) })),
        },
        uso: p.uso,
      },
      {
        tese: {
          type: "choice",
          instructions: "Qual tese em `teses` é a que o `angulo_do_dia` desenvolve (mesmo assunto, mesma ideia central)?",
          criteria: Object.fromEntries(p.teses.map((t, i) => [ids[i], `[${t.minuto}] ${t.frase.slice(0, 300)}`])),
        },
      }
    );
    const escolhida = decidirChoice(r.tese, ids, ids[Math.min(Math.max(p.padrao, 0), n - 1)], 0.4);
    return ids.indexOf(escolhida);
  } catch (e) {
    console.warn("[coerencia-da-arte] tese do dia pelo JEV falhou (fica a conta antiga):", e instanceof Error ? e.message : e);
    return p.padrao;
  }
}
