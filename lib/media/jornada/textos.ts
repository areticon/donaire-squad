import { primeiroJson } from "@/lib/media/jornada/json";
import { contextoEmTexto, type ContextoDaJornada } from "@/lib/media/jornada/contexto";
import type { Redator } from "@/lib/media/jornada/ideias";
import { semTravessao } from "@/lib/media/jornada/estado";
import type { EntradaDoPrompt } from "@/lib/media/jornada/prompts";
import { NOMES_DOS_ICONES } from "@/lib/media/jornada/icones";
import { numeroFoiDito } from "@/lib/media/jornada/numeros";

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
export type TextoDoElemento = {
  titulo: string;
  destaque: string;
  itens: ItemDoTexto[];
  /** Só no gráfico (07/10): a forma que o momento pede, em texto livre ("numero", "cronometro", "lista", "linha-do-tempo", "icone", "comparacao"...). O desenho conhece as comuns; a desconhecida vira título com itens. */
  tipo?: string;
  /** O número dito (o desenho conta de 0 até ele), como foi dito ("24h", "88%", "7"). */
  numero?: string;
  /** Um ícone da lista do worker, quando ajuda. */
  icone?: string;
};

export const SISTEMA_DOS_TEXTOS = `Você é o redator do texto que entra POR CIMA dos elementos visuais de um vídeo, desenhado em código num painel de vidro, como num vídeo de apresentação bem editado. Você só escreve; outro sistema decide se entra.

Para cada elemento você recebe a fala daquele momento (com o que vem logo depois), a descrição do elemento e o texto que a própria arte já traz.

Escreva para cada elemento:
- "titulo": até 7 palavras, em português do Brasil, a ideia daquele momento dita com força, como manchete de apresentação ("As saídas de sempre travam.", "Um time inteiro trabalhando por você."). Tirado do que a pessoa diz, nunca inventando número, promessa ou fato que ela não disse. Nunca repita o texto que a arte já traz.
- "destaque": um trecho EXATO do título (1 a 3 palavras, copiado letra por letra) que leva a cor de destaque: a palavra que carrega o sentido.
- "itens": de 0 a 3 itens curtos (até 4 palavras cada), cada um com "palavra": UMA palavra que está escrita na fala dada, no ponto em que o item deve aparecer (o item entra quando ela é dita). Os itens dão o RITMO do vídeo: algo novo aparece a cada 1,5 a 2 s, como numa boa apresentação. Sempre que a fala enumera tarefas, problemas, passos, nomes ou consequências, ou traz duas ou mais ideias concretas em sequência, escreva os itens, um por ideia, na ordem em que são ditas (as palavras de cada item em ordem de fala, a primeira pelo menos meio segundo depois do começo). Só deixe sem itens quando a fala daquele trecho tem uma ideia só. Nunca invente o que a pessoa não disse. A fala vem de transcrição automática e pode ter letra trocada ("feras" no lugar de "férias"): no "texto" do item e no título escreva a palavra que a pessoa quis dizer, com a grafia certa; só o campo "palavra" é copiado exatamente como está na fala.

Quando o elemento é um GRÁFICO (desenhado em código ao lado da pessoa, sem imagem), ele É o texto: escreva também
- "tipo": a forma que o momento pede, em uma palavra: "titulo", "numero" (um número dito, que cresce na tela), "cronometro" (tempo, prazo, horas), "lista" (itens enumerados), "linha-do-tempo" (passos ou etapas em ordem), "icone" (um ícone com a frase), "comparacao" (antes e depois, isto ou aquilo), "pergunta", "citacao", ou outra que o momento pedir;
- "numero": só quando a pessoa disse um número ou uma quantidade ("24h", "7", "88%", "3x"), como foi dito;
- "icone": um nome da LISTA DE ÍCONES, quando um ícone reforça a ideia.
O gráfico precisa de impacto: título curto e forte, e os itens no ritmo da fala.

Sem travessão (use vírgula ou dois pontos). Sem emoji. Sem aspas no título.

Responda só com JSON: {"textos":{"<id>":{"titulo":"...","destaque":"...","itens":[{"texto":"...","palavra":"..."}],"tipo":"...","numero":"...","icone":"..."}}}`;

export type EntradaDoTexto = Pick<EntradaDoPrompt, "id" | "descricao" | "textoNaImagem"> & { fala: string; grafico?: boolean };

export function pedidoDosTextos(entradas: EntradaDoTexto[], contexto: ContextoDaJornada): string {
  const linhas = entradas.map((e) =>
    [
      `ID ${e.id}${e.grafico ? " (GRÁFICO: desenhado em código, sem imagem)" : ""}`,
      `  fala: "${e.fala}"`,
      `  elemento: ${e.descricao}`,
      e.grafico ? null : `  texto que a arte já traz: ${e.textoNaImagem ? `"${e.textoNaImagem}"` : "nenhum"}`,
    ]
      .filter(Boolean)
      .join("\n")
  );
  const icones = entradas.some((e) => e.grafico) ? `\n\nLISTA DE ÍCONES: ${NOMES_DOS_ICONES.join(", ")}` : "";
  return `CONTEXTO\n${contextoEmTexto(contexto)}\n\nELEMENTOS\n${linhas.join("\n\n")}${icones}`;
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
  const extra = x as { tipo?: unknown; numero?: unknown; icone?: unknown };
  const tipo = String(extra.tipo ?? "").trim().toLowerCase().slice(0, 30);
  const numero = semTravessao(String(extra.numero ?? "").trim()).slice(0, 12);
  const icone = String(extra.icone ?? "").trim();
  // O número só vale se o VALOR EXATO foi dito, em dígito ou por extenso (08/10: "2.645" passou porque qualquer
  // número por extenso na fala contava como prova).
  const numeroDito = Boolean(numero) && numeroFoiDito(numero, fala);
  return { titulo, destaque, itens, ...(tipo ? { tipo } : {}), ...(numeroDito ? { numero } : {}), ...(NOMES_DOS_ICONES.includes(icone) ? { icone } : {}) };
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
