import { primeiroJson } from "@/lib/media/jornada/json";
import { contextoEmTexto, type ContextoDaJornada } from "@/lib/media/jornada/contexto";
import type { Redator } from "@/lib/media/jornada/ideias";
import { semTravessao } from "@/lib/media/jornada/estado";
import type { EntradaDoPrompt } from "@/lib/media/jornada/prompts";

/**
 * O TEXTO EM CAMADA DE CADA ELEMENTO (07/10/2026), a receita do vídeo da
 * landing liberada pelo Bruno: por cima da mídia gerada entra um título curto
 * num painel de vidro, com um trecho em destaque, e até 3 itens que aparecem
 * cada um na palavra falada (o ritmo da landing: algo novo a cada ~2 s).
 *
 * O Claude SÓ ESCREVE (este módulo); se o texto entra, quem decide é o JEV
 * (montagem.ts); o código só confere e desenha (TextoDaJornada.tsx no worker).
 */

export type ItemDoTexto = { texto: string; palavra: string };
export type TextoDoElemento = { titulo: string; destaque: string; itens: ItemDoTexto[] };

export const SISTEMA_DOS_TEXTOS = `Você é o redator do texto que entra POR CIMA dos elementos visuais de um vídeo, desenhado em código num painel de vidro, como num vídeo de apresentação bem editado. Você só escreve; outro sistema decide se entra.

Para cada elemento você recebe a fala daquele momento (com o que vem logo depois), a descrição do elemento e o texto que a própria arte já traz.

Escreva para cada elemento:
- "titulo": até 7 palavras, em português do Brasil, a ideia daquele momento dita com força, como manchete de apresentação ("As saídas de sempre travam.", "Um time inteiro trabalhando por você."). Tirado do que a pessoa diz, nunca inventando número, promessa ou fato que ela não disse. Nunca repita o texto que a arte já traz.
- "destaque": um trecho EXATO do título (1 a 3 palavras, copiado letra por letra) que leva a cor de destaque: a palavra que carrega o sentido.
- "itens": de 0 a 3 itens curtos (até 4 palavras cada), cada um com "palavra": UMA palavra que está escrita na fala dada, no ponto em que o item deve aparecer (o item entra quando ela é dita). Os itens dão o RITMO do vídeo: algo novo aparece a cada 1,5 a 2 s, como numa boa apresentação. Sempre que a fala enumera tarefas, problemas, passos, nomes ou consequências, ou traz duas ou mais ideias concretas em sequência, escreva os itens, um por ideia, na ordem em que são ditas (as palavras de cada item em ordem de fala, a primeira pelo menos meio segundo depois do começo). Só deixe sem itens quando a fala daquele trecho tem uma ideia só. Nunca invente o que a pessoa não disse. A fala vem de transcrição automática e pode ter letra trocada ("feras" no lugar de "férias"): no "texto" do item e no título escreva a palavra que a pessoa quis dizer, com a grafia certa; só o campo "palavra" é copiado exatamente como está na fala.

Sem travessão (use vírgula ou dois pontos). Sem emoji. Sem aspas no título.

Responda só com JSON: {"textos":{"<id>":{"titulo":"...","destaque":"...","itens":[{"texto":"...","palavra":"..."}]}}}`;

export type EntradaDoTexto = Pick<EntradaDoPrompt, "id" | "descricao" | "textoNaImagem"> & { fala: string };

export function pedidoDosTextos(entradas: EntradaDoTexto[], contexto: ContextoDaJornada): string {
  const linhas = entradas.map((e) => [`ID ${e.id}`, `  fala: "${e.fala}"`, `  elemento: ${e.descricao}`, `  texto que a arte já traz: ${e.textoNaImagem ? `"${e.textoNaImagem}"` : "nenhum"}`].join("\n"));
  return `CONTEXTO\n${contextoEmTexto(contexto)}\n\nELEMENTOS\n${linhas.join("\n\n")}`;
}

const normal = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** O texto de um elemento, conferido em código (puro): tamanhos, destaque dentro do título, palavra do item na fala. */
export function conferirTexto(cru: unknown, fala: string): TextoDoElemento | null {
  const x = (cru ?? {}) as { titulo?: unknown; destaque?: unknown; itens?: unknown };
  const titulo = semTravessao(String(x.titulo ?? "").replace(/["“”]/g, "").trim());
  if (!titulo || titulo.split(/\s+/).length > 9 || titulo.length > 64) return null;
  let destaque = semTravessao(String(x.destaque ?? "").trim());
  if (!destaque || !titulo.toLowerCase().includes(destaque.toLowerCase())) destaque = "";
  const f = ` ${normal(fala)} `;
  const itens = (Array.isArray(x.itens) ? x.itens : [])
    .map((i) => ({ texto: semTravessao(String((i as ItemDoTexto)?.texto ?? "").trim()), palavra: String((i as ItemDoTexto)?.palavra ?? "").trim() }))
    .filter((i) => i.texto && i.texto.split(/\s+/).length <= 5 && i.texto.length <= 34 && normal(i.palavra) && f.includes(` ${normal(i.palavra).split(" ")[0]} `))
    .slice(0, 3);
  return { titulo, destaque, itens };
}

/** Os textos de todos os elementos: uma chamada por bloco de 10; falhou, o elemento segue sem texto (nunca derruba a montagem). */
export async function escreverTextos(entradas: EntradaDoTexto[], o: { contexto: ContextoDaJornada; redator: Redator }): Promise<{ textos: Record<string, TextoDoElemento>; erros: string[] }> {
  const textos: Record<string, TextoDoElemento> = {};
  const erros: string[] = [];
  const blocos: EntradaDoTexto[][] = [];
  for (let i = 0; i < entradas.length; i += 10) blocos.push(entradas.slice(i, i + 10));
  await Promise.all(
    blocos.map(async (b) => {
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        try {
          const pedido = pedidoDosTextos(b, o.contexto) + (tentativa ? "\n\nResponda com JSON válido (aspas internas escapadas)." : "");
          const j = primeiroJson(await o.redator(SISTEMA_DOS_TEXTOS, pedido)) as { textos?: Record<string, unknown> };
          for (const e of b) {
            const t = conferirTexto(j.textos?.[e.id], e.fala);
            if (t) textos[e.id] = t;
          }
          return;
        } catch (err) {
          if (tentativa) erros.push(`textos: ${err instanceof Error ? err.message.slice(0, 140) : err}`);
        }
      }
    })
  );
  return { textos, erros };
}
