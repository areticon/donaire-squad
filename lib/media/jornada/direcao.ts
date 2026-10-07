import { primeiroJson } from "@/lib/media/jornada/json";
import { contextoEmTexto, type ContextoDaJornada } from "@/lib/media/jornada/contexto";
import type { Jev } from "@/lib/media/jornada/decisoes";
import type { Redator } from "@/lib/media/jornada/ideias";
import { semTravessao } from "@/lib/media/jornada/estado";

/**
 * A DIREÇÃO VISUAL DA EDIÇÃO, CRIADA NA HORA (08/10/2026). Regra do Bruno: "a regra de cada edição tem que
 * sempre ser criada na hora, baseado no conteúdo, nicho, marca"; o número dourado foi um exemplo para um vídeo,
 * não uma regra. Até aqui o código cravava o tratamento (no mesmo dia chegou a cravar "dinheiro vira dourado").
 *
 * Agora, a cada edição: o Claude ESCREVE de 2 a 3 direções (cores do destaque e do número, peso da letra,
 * energia do movimento), a partir do conteúdo, do nicho e da marca; o JEV ESCOLHE uma; o código só desenha a
 * escolhida, dentro de limites seguros (cor válida, peso e energia num intervalo). Os cortes do mesmo vídeo usam
 * a direção do completo. Sem resposta válida, a peça usa a cor da marca, como antes.
 */

export type DirecaoDaEdicao = {
  nome: string;
  /** De 2 a 4 cores (#rrggbb) do degradê do número e do destaque, de cima para baixo. */
  cores: string[];
  /** A cor do brilho em volta do número (#rrggbb). */
  brilho: string;
  /** O peso da letra do número e do título (500 a 900). */
  peso: number;
  /** A energia do movimento: contida (devagar e sutil), media, alta (rápida e com pop). */
  energia: "contida" | "media" | "alta";
  porque: string;
};

export const SISTEMA_DA_DIRECAO = `Você é o diretor de arte de um editor de vídeo que serve qualquer nicho. Para ESTA edição, escreva de 2 a 3 direções visuais diferentes para os textos e números desenhados por cima do vídeo (títulos, números que contam, itens), feitas para este conteúdo, este nicho, este público e esta marca. Não existe padrão: um consultor financeiro high ticket, uma confeitaria de bairro e um pastor pedem direções diferentes, e a mesma marca pode pedir direções diferentes conforme o tema do vídeo.

Para cada direção:
- "nome": duas a quatro palavras;
- "cores": de 2 a 4 cores em hexadecimal (#rrggbb), o degradê do número e da palavra em destaque, de cima para baixo; parta das cores da marca quando fizer sentido, e use outra só se o conteúdo pedir (um valor de conquista, uma data, um alerta);
- "brilho": a cor do brilho em volta do número (#rrggbb);
- "peso": o peso da letra, de 500 a 900;
- "energia": "contida", "media" ou "alta" (a velocidade e o impacto do movimento);
- "porque": uma linha ligando a direção ao conteúdo, ao nicho e à marca.

Português do Brasil, sem travessão. Responda só com JSON: {"direcoes":[{"nome":"...","cores":["#...","#..."],"brilho":"#...","peso":800,"energia":"media","porque":"..."}]}`;

const HEX = /^#[0-9a-f]{6}$/i;

/** A direção lida e conferida em código (puro): cores válidas, peso e energia nos limites. */
export function conferirDirecao(cru: unknown): DirecaoDaEdicao | null {
  const x = (cru ?? {}) as Record<string, unknown>;
  const cores = (Array.isArray(x.cores) ? x.cores : []).map((c) => String(c).trim()).filter((c) => HEX.test(c)).slice(0, 4);
  if (cores.length < 2) return null;
  const brilho = HEX.test(String(x.brilho ?? "")) ? String(x.brilho) : cores[Math.min(1, cores.length - 1)];
  const peso = Math.max(500, Math.min(900, Math.round(Number(x.peso) / 100) * 100 || 700));
  const energia = x.energia === "contida" || x.energia === "alta" ? x.energia : "media";
  return { nome: semTravessao(String(x.nome ?? "direção").slice(0, 40)), cores, brilho, peso, energia, porque: semTravessao(String(x.porque ?? "").slice(0, 200)) };
}

/** As direções escritas pelo Claude e a escolha do JEV. Nunca lança: sem direção válida, devolve null (vale a marca). */
export async function direcaoDaEdicao(o: { contexto: ContextoDaJornada; resumo: string; redator: Redator; jev: Jev | null; projectId?: string | null }): Promise<{ direcao: DirecaoDaEdicao | null; propostas: DirecaoDaEdicao[]; aviso: string | null }> {
  try {
    const pedido = `CONTEXTO\n${contextoEmTexto(o.contexto)}\n\nCORES DA MARCA: acento ${o.contexto.cores.acento}, escuro ${o.contexto.cores.escuro}, claro ${o.contexto.cores.claro}\n\nO VÍDEO (a fala, resumida): ${o.resumo.slice(0, 1800)}`;
    const j = primeiroJson(await o.redator(SISTEMA_DA_DIRECAO, pedido)) as { direcoes?: unknown[] };
    const propostas = (Array.isArray(j.direcoes) ? j.direcoes : []).map(conferirDirecao).filter((d): d is DirecaoDaEdicao => Boolean(d)).slice(0, 3);
    if (!propostas.length) return { direcao: null, propostas, aviso: "direção visual: o redator não devolveu direção válida; valeu a cor da marca" };
    if (propostas.length === 1 || !o.jev) return { direcao: propostas[0], propostas, aviso: null };
    const r = await o.jev(
      { projectId: o.projectId, etapa: "jornada-direcao", state: { tarefa: "escolher a direção visual dos textos e números desta edição", nicho: o.contexto.nicho, marca: o.contexto.marca } },
      {
        direcao: {
          type: "choice",
          instructions: { pergunta: "Qual direção visual serve melhor a ESTE vídeo, a este nicho e a esta marca?", resumo: o.resumo.slice(0, 600) },
          criteria: Object.fromEntries(propostas.map((p, i) => [`d${i}`, `${p.nome}: ${p.porque} (cores ${p.cores.join(" ")}, energia ${p.energia})`])),
        },
      }
    );
    const escolha = r.direcao && r.direcao.type === "choice" ? Number(String(r.direcao.choice).replace("d", "")) : 0;
    return { direcao: propostas[Number.isInteger(escolha) && propostas[escolha] ? escolha : 0], propostas, aviso: null };
  } catch (e) {
    return { direcao: null, propostas: [], aviso: `direção visual: ${e instanceof Error ? e.message.slice(0, 120) : e}; valeu a cor da marca` };
  }
}
