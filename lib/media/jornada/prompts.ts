import type { Jev } from "@/lib/media/jornada/decisoes";
import type { Redator } from "@/lib/media/jornada/ideias";
import { primeiroJson } from "@/lib/media/jornada/json";
import { contextoEmTexto, type ContextoDaJornada } from "@/lib/media/jornada/contexto";
import type { LeituraDoVideo, TrechoLido } from "@/lib/media/leitura-do-video";
import type { ElementoAprovado } from "@/lib/media/jornada/estado";

/**
 * O PASSO 6 DA JORNADA (E4): o Sonnet escreve UM prompt por elemento, em
 * inglês, para o modelo de imagem ou de vídeo da Higgsfield. Ele recebe, por
 * elemento: a descrição aprovada (que já incorpora o pedido do cliente), os
 * pedidos literais, o texto exato da arte, a fala do momento, o que a leitura
 * do vídeo viu naquele trecho, o formato e a proporção, e o contexto da
 * empresa, da marca e do nicho. Uma chamada por bloco de elementos.
 *
 * Sem bloco de estilo colado, sem guarda de estilo, sem molde. O código só
 * acrescenta o que é técnico e vale para qualquer nicho: o texto exato entre
 * aspas (ou "sem texto"), o fundo liso do recorte, nenhuma pessoa real
 * reconhecível e o pedido literal do cliente ("must appear exactly as asked").
 */

export type EntradaDoPrompt = {
  id: string;
  descricao: string;
  pedidos: string[];
  textoNaImagem: string | null;
  fala: string;
  cena: string | null;
  formato: ElementoAprovado["formato"];
  midia: ElementoAprovado["midia"];
  proporcao: string;
  papel: ElementoAprovado["papel"];
};

/** A proporção pedida ao gerador pelo formato e pelo quadro do vídeo. */
export function proporcaoDoElemento(formato: ElementoAprovado["formato"], quadro: "9:16" | "16:9"): string {
  // O B-roll nasce deitado (16:9) e o worker recorta o centro no vertical: o Kling em 9:16 entregou a cena de lado na prova de 07/10.
  if (formato === "broll") return "16:9";
  if (formato === "tela-cheia") return quadro;
  if (formato === "janela") return quadro === "9:16" ? "4:3" : "3:4";
  // No vertical o lugar livre costuma ser a faixa acima da cabeça: o recorte nasce bem deitado para caber nela grande.
  return quadro === "9:16" ? "21:9" : "1:1";
}

function trechoEm(leitura: LeituraDoVideo | null, t: number): TrechoLido | null {
  if (!leitura?.trechos?.length) return null;
  return leitura.trechos.find((x) => t >= x.de && t < x.ate) ?? leitura.trechos.at(-1) ?? null;
}

/** A entrada de cada elemento aprovado (puro). */
export function entradasDosPrompts(elementos: readonly ElementoAprovado[], leitura: LeituraDoVideo | null, quadro: "9:16" | "16:9"): EntradaDoPrompt[] {
  return elementos.map((el) => {
    const tr = trechoEm(leitura, el.gatilho.t);
    return {
      id: el.id,
      descricao: el.descricao,
      pedidos: [...el.pedidos],
      textoNaImagem: el.textoNaImagem,
      fala: el.momento.frase,
      cena: tr ? `${tr.acontece}${tr.mostra.length ? `; visible: ${tr.mostra.join(", ")}` : ""}` : null,
      formato: el.formato,
      midia: el.midia,
      proporcao: proporcaoDoElemento(el.formato, quadro),
      papel: el.papel,
    };
  });
}

export const SISTEMA_DOS_PROMPTS = `You write image and video generation prompts for a video editor that serves any niche. For each element you get: the approved description (Portuguese), the client's literal requests, the exact text the artwork must carry, the speech at that moment (Portuguese), what the video shows at that moment, the format and the aspect ratio, and the context of the company, the brand and the niche.

Write ONE prompt per element, in English, 60 to 140 words, as a director of photography and art director would: the concrete subject, composition, camera or framing, lighting, materials, palette (brand colors only as accents), mood fitted to that niche and audience, and for "video" the camera movement over 3 seconds (a video is always shot landscape, upright, horizon level, with the main subject in the center third, because it may be cropped to vertical). The prompt must deliver exactly the approved description and every client request. The company and the niche are the ones in CONTEXT; brands, logos and signs visible in the background of the footage are just the setting, never the client's brand or the subject, and never go into the prompt. For format "recorte-sobre" the element will be cut out and placed over the footage: describe ONE isolated object, logo, badge or illustration on a plain flat light gray background, no scene, no environment behind it; when the aspect ratio is 21:9 compose the element as a wide, low horizontal arrangement (a row, a banner, objects side by side) that fills the width, because it sits in a horizontal strip above the person's head. For "janela" and "tela-cheia" describe a full composed image. When the text in the artwork is "none", describe NO letters, words or numbers at all: show the idea with objects, shapes and composition. In a 9:16 full-screen image keep the lower third free of text and key details (the captions sit there). In any full-screen image or video keep every text and the main subject inside the central 80% of the frame (a slow push-in crops the edges); nothing important touches the border. Never a real recognizable person, never the speaker or a look-alike of the speaker, no extra text. Do not mention a style template. No em dash.

Answer only JSON: {"prompts":{"<id>":"<prompt>"}}`;

/** O pedido ao Sonnet para um bloco de elementos (puro). */
export function pedidoDosPrompts(entradas: EntradaDoPrompt[], contexto: ContextoDaJornada, leitura: LeituraDoVideo | null): string {
  const linhas = entradas.map((e) =>
    [
      `ID ${e.id}`,
      `  approved description: ${e.descricao}`,
      e.pedidos.length ? `  client requests (literal): ${e.pedidos.map((p) => `"${p}"`).join("; ")}` : null,
      `  text in the artwork: ${e.textoNaImagem ? `"${e.textoNaImagem}"` : "none"}`,
      `  speech at this moment: "${e.fala}"`,
      e.cena ? `  the footage shows (setting only, not the brand): ${e.cena}` : null,
      `  role: ${e.papel}; media: ${e.midia}; format: ${e.formato}; aspect ratio ${e.proporcao}`,
    ]
      .filter(Boolean)
      .join("\n")
  );
  return `CONTEXT\n${contextoEmTexto(contexto)}\n${leitura ? `Video setting (background only, not the brand): ${leitura.cenario}.` : ""}\n\nELEMENTS\n${linhas.join("\n\n")}`;
}

/**
 * O PROMPT FINAL: o do Sonnet e só o técnico que vale para qualquer nicho.
 * Nada de bloco de estilo, nada de cor fixa, nada de molde.
 */
export function promptFinal(doSonnet: string, e: Pick<EntradaDoPrompt, "textoNaImagem" | "pedidos" | "formato" | "midia">, reforco?: string): string {
  const partes: string[] = [];
  if (reforco) partes.push(`FIX FROM THE PREVIOUS ATTEMPT: ${reforco}`);
  partes.push(String(doSonnet ?? "").trim().slice(0, 2400));
  if (e.pedidos.length) partes.push(`Client request, must appear exactly as asked: ${e.pedidos.map((p) => `"${p}"`).join("; ")}.`);
  if (e.midia !== "video") {
    partes.push(
      e.textoNaImagem
        ? `The ONLY text in the image, in Brazilian Portuguese, spelled exactly letter by letter with every accent: "${e.textoNaImagem}". No other words, letters or numbers.`
        : "No text, letters or numbers anywhere."
    );
  } else partes.push("No text, no captions, no logos burned in.");
  if (e.formato === "recorte-sobre") partes.push("Single isolated subject centered on a plain flat uniform solid background, no scene, generous empty margin on every side, nothing touching the edges.");
  partes.push("No real recognizable person. High resolution, crisp, no watermark.");
  return partes.join(" ").slice(0, 4500);
}

/** Os prompts de um bloco pelo Sonnet; com pedido do cliente, o JEV confere e o Sonnet reescreve uma vez. */
export async function escreverPrompts(
  entradas: EntradaDoPrompt[],
  o: { contexto: ContextoDaJornada; leitura: LeituraDoVideo | null; redator: Redator; jev?: Jev | null; projectId?: string | null }
): Promise<{ prompts: Record<string, string>; erros: string[] }> {
  const prompts: Record<string, string> = {};
  const erros: string[] = [];
  const blocos: EntradaDoPrompt[][] = [];
  for (let i = 0; i < entradas.length; i += 8) blocos.push(entradas.slice(i, i + 8));
  await Promise.all(
    blocos.map(async (b) => {
      try {
        // JSON quebrado (aspas dentro do prompt) pede o mesmo texto de novo, uma vez.
        let j: { prompts?: Record<string, unknown> };
        try {
          j = primeiroJson(await o.redator(SISTEMA_DOS_PROMPTS, pedidoDosPrompts(b, o.contexto, o.leitura))) as typeof j;
        } catch {
          j = primeiroJson(await o.redator(SISTEMA_DOS_PROMPTS, `${pedidoDosPrompts(b, o.contexto, o.leitura)}

Return strictly valid JSON: escape any double quote inside a prompt or use single quotes.`)) as typeof j;
        }
        for (const e of b) {
          const p = String(j.prompts?.[e.id] ?? "").trim();
          if (p.length >= 40) prompts[e.id] = p;
          else erros.push(`${e.id}: o Sonnet não escreveu o prompt`);
        }
      } catch (err) {
        erros.push(`prompts: ${err instanceof Error ? err.message.slice(0, 140) : err}`);
      }
    })
  );
  // O PEDIDO DO CLIENTE CHEGA AO PROMPT: o JEV confere; se não atende, o Sonnet reescreve uma vez.
  const comPedido = entradas.filter((e) => e.pedidos.length && prompts[e.id]);
  if (o.jev && comPedido.length) {
    try {
      const perguntas = Object.fromEntries(comPedido.map((e) => [e.id, { type: "noul" as const, instructions: { pergunta: "Este prompt atende a todos os pedidos do cliente?", pedidos: e.pedidos, prompt: prompts[e.id] } }]));
      const r = await o.jev({ projectId: o.projectId, etapa: "jornada-prompt-pedido", state: { tarefa: "conferir se o prompt de imagem atende ao pedido do cliente" } }, perguntas);
      const refazer = comPedido.filter((e) => { const x = r[e.id]; return x && x.type === "noul" && x.noul < 0.4; });
      if (refazer.length) {
        const texto = await o.redator(SISTEMA_DOS_PROMPTS, `${pedidoDosPrompts(refazer, o.contexto, o.leitura)}\n\nThe previous prompts did not deliver the client requests. Deliver them exactly.`);
        const j = primeiroJson(texto) as { prompts?: Record<string, unknown> };
        for (const e of refazer) {
          const p = String(j.prompts?.[e.id] ?? "").trim();
          if (p.length >= 40) prompts[e.id] = p;
        }
      }
    } catch (err) {
      erros.push(`conferência do pedido: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
    }
  }
  return { prompts, erros };
}
