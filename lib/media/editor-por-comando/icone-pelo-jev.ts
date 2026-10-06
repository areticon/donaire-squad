import { decidirChoice, type perguntarAoJev, type PerguntaDoJev } from "@/lib/jev/cliente";
import { ICONES_DE_LINHA } from "@/lib/media/editor-por-comando/icones-de-linha";

/**
 * O ÍCONE DAS PEÇAS VETORIAIS PELO JEV (06/10/2026, tarefa D). Regra do
 * Bruno: Claude só escreve, o JEV decide. O redator escreve a frase e SUGERE
 * o nome do ícone (mais até 3 alternativos); o código junta os candidatos (os
 * sugeridos que existem no catálogo e os do catálogo cujo "do que se trata"
 * casa com a frase) e o JEV ESCOLHE entre eles, com a frase do momento. Nome
 * fora do catálogo nunca vai ao worker (a peça sai sem ícone, o traço da marca
 * no lugar).
 *
 * Peças com ícone: "icone-com-frase" (props.icone) e "cartoes-em-linha"
 * (props.itens[k].icone).
 */

export const PECAS_COM_ICONE_DE_LINHA = new Set(["icone-com-frase", "cartoes-em-linha"]);

const normalizar = (s: string) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^a-z0-9 -]/g, " ");

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "um", "uma", "para", "com", "sem", "no", "na", "em", "que", "seu", "sua", "voce", "nao", "mais", "por"]);

/** Os nomes do catálogo cujo nome ou descrição casam com o texto (mais palavras em comum primeiro). */
export function iconesPorTexto(texto: string, max = 3): string[] {
  const palavras = new Set(normalizar(texto).split(/\s+/).filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p)));
  if (!palavras.size) return [];
  const pontos = Object.entries(ICONES_DE_LINHA)
    .map(([nome, sobre]) => {
      const alvo = normalizar(`${nome.replace(/-/g, " ")} ${sobre}`).split(/[\s,]+/);
      // Casa a palavra inteira ou o radical (as 5 primeiras letras: "dormir" e "dorme", "edicao" e "editar" não, mas "edicao" e "edicoes" sim).
      const n = [...palavras].filter((p) => alvo.some((a) => a === p || (p.length >= 5 && a.length >= 5 && a.slice(0, 5) === p.slice(0, 5)))).length;
      return { nome, n };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  return pontos.slice(0, max).map((x) => x.nome);
}

const valido = (n: unknown): n is string => typeof n === "string" && Object.prototype.hasOwnProperty.call(ICONES_DE_LINHA, n.trim().toLowerCase());

/** Os candidatos de um ícone: os sugeridos pelo redator que existem, depois os do catálogo pela frase; sem repetir, até 5. */
export function candidatosDoIcone(sugerido: unknown, alternativos: unknown, texto: string): string[] {
  const sug = [sugerido, ...(Array.isArray(alternativos) ? alternativos : [])].filter(valido).map((n) => n.trim().toLowerCase());
  return [...new Set([...sug, ...iconesPorTexto(texto)])].slice(0, 5);
}

type Alvo = { chave: string; texto: string; candidatos: string[]; aplicar: (nome: string | null) => void };

/**
 * Escolhe pelo JEV o ícone de cada peça vetorial do plano, nas props escritas
 * pelo redator (muda `textos` no lugar). Um candidato só: ele, sem perguntar.
 * Sem JEV (ou com erro): o primeiro candidato válido (o sugerido pelo redator
 * quando existe). Remove `iconesAlternativos` das props.
 */
export async function escolherIconesPeloJev(
  momentos: Array<{ id: string; peca: string | null; fala: string }>,
  textos: Record<string, Record<string, unknown>>,
  jev: typeof perguntarAoJev | null,
  ctx: { projectId?: string | null; nicho?: string | null },
  erros: string[] = []
): Promise<number> {
  const alvos: Alvo[] = [];
  for (const m of momentos) {
    const props = textos[m.id];
    if (!props || !m.peca || !PECAS_COM_ICONE_DE_LINHA.has(m.peca)) continue;
    if (m.peca === "icone-com-frase") {
      const frase = String(props.frase ?? props.texto ?? "").replace(/\*\*/g, "");
      const candidatos = candidatosDoIcone(props.icone, props.iconesAlternativos, `${frase} ${m.fala}`);
      delete props.iconesAlternativos;
      alvos.push({ chave: `icone_${m.id}`, texto: `A frase na tela é "${frase.slice(0, 120)}" e a fala do momento é "${m.fala.slice(0, 240)}".`, candidatos, aplicar: (n) => (n ? (props.icone = n) : delete props.icone) });
    } else if (Array.isArray(props.itens)) {
      (props.itens as Array<Record<string, unknown>>).forEach((it, k) => {
        if (!it || typeof it !== "object") return;
        const titulo = String(it.titulo ?? "").replace(/\*\*/g, "");
        const candidatos = candidatosDoIcone(it.icone, it.iconesAlternativos, titulo);
        delete it.iconesAlternativos;
        alvos.push({ chave: `icone_${m.id}_${k}`, texto: `O cartão se chama "${titulo.slice(0, 60)}", dentro da fala "${m.fala.slice(0, 200)}".`, candidatos, aplicar: (n) => (n ? (it.icone = n) : delete it.icone) });
      });
    }
  }
  if (!alvos.length) return 0;
  const perguntas: Record<string, PerguntaDoJev> = {};
  for (const a of alvos) {
    if (a.candidatos.length < 2) continue;
    perguntas[a.chave] = {
      type: "choice",
      instructions: `${ctx.nicho ? `Nicho do projeto: ${ctx.nicho.slice(0, 160)}. ` : ""}${a.texto} Qual ícone de linha mostra melhor esta ideia para quem assiste, de relance?`,
      criteria: Object.fromEntries(a.candidatos.map((n) => [n, ICONES_DE_LINHA[n]])),
    };
  }
  let r: Awaited<ReturnType<typeof perguntarAoJev>> = {};
  if (jev && Object.keys(perguntas).length) {
    try {
      r = await jev({ projectId: ctx.projectId ?? null, etapa: "editor-por-comando-icone", state: `Escolha do ícone de linha das peças do vídeo${ctx.nicho ? ` (nicho: ${ctx.nicho.slice(0, 160)})` : ""}: o ícone precisa ser lido de relance e mostrar a ideia da frase, sem ambiguidade.` }, perguntas);
    } catch (err) {
      erros.push(`escolha do ícone pelo JEV falhou: ${err instanceof Error ? err.message.slice(0, 100) : err}`);
    }
  }
  let escolhidos = 0;
  for (const a of alvos) {
    const nome = a.candidatos.length ? decidirChoice(r[a.chave], a.candidatos, a.candidatos[0], 0.3) : null;
    a.aplicar(nome);
    if (nome) escolhidos++;
  }
  return escolhidos;
}
