import type { Jev } from "@/lib/media/jornada/decisoes";

/**
 * A LEITURA AUTOMÁTICA SÓ DO TEXTO (decisão 9 do Bruno; E4): cada elemento
 * gerado que tem texto pedido passa por uma leitura. O Gemini TRANSCREVE o
 * texto da imagem (só descreve); o JEV COMPARA com o texto pedido (grafia,
 * acento, número, marca). Errado: gera de novo UMA vez. Não replaneja nada,
 * não mexe em mais nada. Errado de novo (decisão 1): o elemento sai do vídeo
 * e a entrega avisa em qual momento, para o cliente pedir de novo.
 */

export const SISTEMA_DA_LEITURA_DO_TEXTO = `Você lê o texto de uma imagem gerada para um vídeo. Você NÃO decide nada: só transcreve.
Responda em JSON {"texto":"..."} com TODO texto legível da imagem, letra por letra, com acentos e pontuação, na ordem de leitura, separado por " | " (vazio se não há texto). Não corrija erros: transcreva como está escrito.`;

export const ESQUEMA_DA_LEITURA_DO_TEXTO = { type: "OBJECT", properties: { texto: { type: "STRING" } }, required: ["texto"] };

const semAcento = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const normal = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Os fatos que o código mede (o JEV lê; sem o JEV, decidem sozinhos). */
export function fatosDoTexto(lido: string, pedido: string) {
  const l = normal(lido);
  const p = normal(pedido);
  const presente = Boolean(p) && l.includes(p);
  // Com a palavra lá, o acento pedido tem de estar lá também (o modelo "esquece" o til).
  const acentoCerto = presente && lido.toLowerCase().replace(/\s+/g, " ").includes(pedido.toLowerCase().replace(/\s+/g, " "));
  const palavrasDoPedido = new Set(p.split(" ").filter(Boolean));
  const sobra = l.split(" ").filter((w) => w && !palavrasDoPedido.has(w));
  return { presente, acentoCerto, palavrasAMais: sobra.slice(0, 12) };
}

/** O texto confere? O JEV decide pela leitura e pelos fatos; sem o JEV, o padrão seguro dos fatos. */
export async function textoConfere(lido: string, pedido: string, jev: Jev | null, projectId?: string | null): Promise<{ ok: boolean; porQue: string }> {
  const f = fatosDoTexto(lido, pedido);
  const padrao = f.presente && f.acentoCerto && f.palavrasAMais.length <= 2;
  if (!jev) return { ok: padrao, porQue: `pelos fatos (sem o JEV): ${JSON.stringify(f)}` };
  try {
    const r = await jev(
      { projectId, etapa: "jornada-leitura-do-texto", state: { regra: "o texto da imagem tem de ser igual ao pedido: grafia, acentos, números e nome de marca; palavra inventada a mais é erro" } },
      { t: { type: "noul", instructions: { pergunta: "O texto lido na imagem confere com o texto pedido?", pedido, lido, fatos: f } } }
    );
    const x = r.t;
    if (x && x.type === "noul" && typeof x.noul === "number") {
      if (x.noul >= 0.6) return { ok: true, porQue: `JEV: confere (${Math.round(x.noul * 100)}%)` };
      if (x.noul <= 0.4) return { ok: false, porQue: `JEV: não confere (${Math.round(x.noul * 100)}%)` };
    }
  } catch {
    // Sem resposta do JEV: o padrão seguro dos fatos.
  }
  return { ok: padrao, porQue: `pelos fatos: ${JSON.stringify(f)}` };
}

/** O que a segunda geração pede, em inglês, pelo que foi lido errado. */
export function reforcoDoTexto(lido: string, pedido: string): string {
  return `The text was read as "${lido.slice(0, 120)}". It must read exactly "${pedido}", letter by letter, with every accent, and nothing else.`;
}
