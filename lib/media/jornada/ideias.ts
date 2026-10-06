import { primeiroJson } from "@/lib/media/jornada/json";
import type { LeituraDoVideo, TrechoLido } from "@/lib/media/leitura-do-video";
import { contextoEmTexto, type ContextoDaJornada } from "@/lib/media/jornada/contexto";
import type { Frase, Palavra } from "@/lib/media/jornada/linha-do-tempo";
import { semTravessao, type MidiaDaJornada, type PapelDoElemento } from "@/lib/media/jornada/estado";

/**
 * O PASSO 4 DA JORNADA, primeiro movimento (E2): as IDEIAS de elemento,
 * escritas pelo Sonnet (ele só ESCREVE; quem escolhe é o JEV, em decisoes.ts).
 *
 * Para cada frase da fala (o momento candidato), até 2 ideias em português,
 * concretas e visuais, tiradas do que a fala diz ali, do que a leitura do
 * vídeo viu naquele trecho e do contexto da empresa, da marca e do nicho (o
 * nicho puxa o imaginário: consórcio puxa conquista e patrimônio, culinária
 * puxa ingrediente e preparo; é contexto, nunca regra de código). Nada de
 * lista de tipos, nada de bloco de estilo, nada de peça desenhada: cada ideia
 * vira uma mídia gerada por IA (imagem, recorte ou vídeo).
 *
 * Logos de redes e de empresas citadas, a abertura do vídeo e as chamadas
 * (curtir, inscrever) também são ideias como as outras: a IA propõe se fazem
 * sentido para o destino do vídeo, e o JEV decide se entram. Nada fixo.
 */

export const MODELO_DAS_IDEIAS = process.env.JORNADA_REDATOR || "claude-sonnet-5";

export type IdeiaCrua = {
  frase: number;
  gatilho: { palavra: string; indice: number; t: number };
  descricao: string;
  textoNaImagem: string | null;
  midia: MidiaDaJornada;
  papel: PapelDoElemento;
  porque: string;
};

export const SISTEMA_DAS_IDEIAS = `Você é o redator de um editor de vídeo que serve qualquer nicho, do médico ao cozinheiro. Você ESCREVE ideias de elementos visuais para momentos da fala; você não decide quais entram (outro sistema decide).

Para cada frase numerada, escreva de 0 a 2 ideias. Frase de ligação, hesitação ou sem imagem possível fica sem ideia.

Cada ideia:
- "frase": o número da frase.
- "gatilho": UMA palavra da própria frase, escrita como está, que chama o elemento (o elemento aparece quando ela é dita).
- "descricao": em português, uma frase concreta e visual do que aparece (o objeto, a cena, a composição, a cor, o movimento), tirada do que a fala diz naquele momento e do que a leitura do vídeo mostra. Use o contexto da empresa, da marca e do nicho para escolher o imaginário que mais faz sentido para aquele público. Nada genérico ("ícone de sucesso"); nada que o vídeo já mostra.
- "textoNaImagem": null, ou o texto EXATO que a arte deve trazer, até 5 palavras: só palavras ditas no momento, um número dito ou o nome de uma marca ou rede citada. Na chamada, a própria chamada curta.
- "midia": "recorte" (um objeto, ícone ou logo isolado que entra sobre a gravação), "imagem" (uma composição que entra numa janela ou em tela cheia) ou "video" (B-roll em movimento, cena sem pessoa conhecida, com a voz por baixo).
- "papel": "elemento"; ou "abertura" (só nas primeiras frases: um elemento de abertura que apresenta o tema do vídeo); ou "chamada" (curtir, inscrever, seguir, salvar): proponha chamada só se fizer sentido para o destino e a duração do vídeo (vídeo curto vertical não pede inscrever; vídeo longo no YouTube pode pedir).
- "porque": uma linha com a ligação com a fala.

Logos de redes sociais e de empresas citadas: descreva o logo como elemento (ele será gerado por IA). Nunca uma pessoa real reconhecível, nunca a pessoa que fala, nunca texto além do textoNaImagem. Português do Brasil, sem travessão (use vírgula ou dois pontos).

Responda só com JSON: {"ideias":[{"frase":1,"gatilho":"...","descricao":"...","textoNaImagem":null,"midia":"recorte","papel":"elemento","porque":"..."}]}`;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function trechoNoInstante(leitura: LeituraDoVideo | null, t: number): TrechoLido | null {
  if (!leitura?.trechos?.length) return null;
  return leitura.trechos.find((x) => t >= x.de && t < x.ate) ?? leitura.trechos.at(-1) ?? null;
}

/** O pedido ao Sonnet para um bloco de frases: o contexto, a leitura e as frases com o que se vê em cada uma. */
export function pedidoDasIdeias(frases: Frase[], contexto: ContextoDaJornada, leitura: LeituraDoVideo | null): string {
  const cabeca = leitura
    ? `LEITURA DO VÍDEO: ${leitura.genero}, cenário: ${leitura.cenario}. ${leitura.resumo}`
    : "LEITURA DO VÍDEO: indisponível.";
  const linhas = frases.map((f) => {
    const tr = trechoNoInstante(leitura, f.inicio);
    const cena = tr ? ` [em cena: ${tr.acontece}${tr.mostra.length ? `; mostra: ${tr.mostra.join(", ")}` : ""}]` : "";
    return `${f.indice}. (${mmss(f.inicio)}) "${f.texto}"${cena}`;
  });
  return `CONTEXTO\n${contextoEmTexto(contexto)}\n\n${cabeca}\n\nFRASES\n${linhas.join("\n")}`;
}

const normal = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const NUMEROS_FALADOS = /\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|vinte|trinta|quarenta|cinquenta|cem|cento|mil|milhao|milhoes|bilhao|por cento|metade|dobro)\b/;

/**
 * O TEXTO DA ARTE só com o que foi dito (regra do E2): cada palavra do texto
 * aparece na fala do momento (ou das vizinhas), ou é o nome da marca do
 * projeto, ou é um número quando a fala tem número. Na chamada, até 4 palavras.
 */
export function textoPermitido(texto: string | null | undefined, fala: string, o: { papel: PapelDoElemento; marca?: string | null }): string | null {
  const t = semTravessao(String(texto ?? "").replace(/["“”]/g, "").trim());
  if (!t) return null;
  const palavras = normal(t).split(" ").filter(Boolean);
  if (!palavras.length || palavras.length > 6) return null;
  if (o.papel === "chamada") return palavras.length <= 4 ? t : null;
  const f = ` ${normal(fala)} `;
  const marca = normal(o.marca ?? "");
  const temNumero = /\d/.test(fala) || NUMEROS_FALADOS.test(normal(fala));
  const ok = palavras.every((w) => f.includes(` ${w} `) || (marca && ` ${marca} `.includes(` ${w} `)) || (/^\d+$/.test(w) && temNumero) || (w.length <= 2 && f.includes(w)));
  return ok ? t : null;
}

/** As ideias que o Sonnet devolveu, conferidas em código: gatilho na própria frase, texto só dito, mídia e papel válidos. */
export function lerIdeias(texto: string, frases: Frase[], palavras: Palavra[], contexto: Pick<ContextoDaJornada, "marca">): IdeiaCrua[] {
  let cru: unknown;
  try {
    cru = primeiroJson(texto);
  } catch {
    return [];
  }
  const lista = Array.isArray((cru as { ideias?: unknown })?.ideias) ? ((cru as { ideias: unknown[] }).ideias as Array<Record<string, unknown>>) : [];
  const porIndice = new Map(frases.map((f) => [f.indice, f]));
  const saida: IdeiaCrua[] = [];
  const porFrase = new Map<number, number>();
  for (const x of lista) {
    const f = porIndice.get(Number(x.frase));
    if (!f) continue;
    if ((porFrase.get(f.indice) ?? 0) >= 2) continue;
    const alvo = normal(String(x.gatilho ?? "")).split(" ")[0] ?? "";
    if (!alvo) continue;
    let indice = -1;
    for (let k = f.de; k <= f.ate; k++) if (normal(palavras[k].texto) === alvo) { indice = k; break; }
    if (indice < 0) for (let k = f.de; k <= f.ate; k++) { const w = normal(palavras[k].texto); if (w.length >= 3 && (w.startsWith(alvo) || alvo.startsWith(w))) { indice = k; break; } }
    if (indice < 0) continue;
    const descricao = semTravessao(String(x.descricao ?? "").trim()).slice(0, 400);
    if (descricao.length < 12) continue;
    const midia: MidiaDaJornada = x.midia === "video" ? "video" : x.midia === "recorte" ? "recorte" : "imagem";
    const papel: PapelDoElemento = x.papel === "abertura" ? "abertura" : x.papel === "chamada" ? "chamada" : "elemento";
    const vizinhas = frases.filter((g) => Math.abs(g.indice - f.indice) <= 1).map((g) => g.texto).join(" ");
    saida.push({
      frase: f.indice,
      gatilho: { palavra: palavras[indice].texto.replace(/[.,!?;:]+$/, ""), indice, t: palavras[indice].inicio },
      descricao,
      textoNaImagem: textoPermitido(x.textoNaImagem as string | null, vizinhas, { papel, marca: contexto.marca }),
      midia,
      papel,
      porque: semTravessao(String(x.porque ?? "").trim()).slice(0, 200),
    });
    porFrase.set(f.indice, (porFrase.get(f.indice) ?? 0) + 1);
  }
  return saida;
}

/** Os blocos de ~3 min de frases (uma chamada do Sonnet por bloco, em paralelo). */
export function blocosDeFrases(frases: Frase[], alvoSeg = 180): Frase[][] {
  const saida: Frase[][] = [];
  let atual: Frase[] = [];
  for (const f of frases) {
    if (atual.length && f.fim - atual[0].inicio > alvoSeg) {
      saida.push(atual);
      atual = [];
    }
    atual.push(f);
  }
  if (atual.length) saida.push(atual);
  return saida;
}

export type Redator = (sistema: string, pedido: string) => Promise<string>;

/** Todas as ideias do vídeo: um pedido por bloco, em paralelo (até 4 ao mesmo tempo). */
export async function escreverIdeias(o: { frases: Frase[]; palavras: Palavra[]; contexto: ContextoDaJornada; leitura: LeituraDoVideo | null; redator: Redator }): Promise<{ ideias: IdeiaCrua[]; erros: string[] }> {
  const blocos = blocosDeFrases(o.frases);
  const ideias: IdeiaCrua[] = [];
  const erros: string[] = [];
  let proximo = 0;
  const trabalhar = async () => {
    while (proximo < blocos.length) {
      const b = blocos[proximo++];
      try {
        const texto = await o.redator(SISTEMA_DAS_IDEIAS, pedidoDasIdeias(b, o.contexto, o.leitura));
        ideias.push(...lerIdeias(texto, b, o.palavras, o.contexto));
      } catch (e) {
        erros.push(`ideias do bloco ${b[0]?.indice ?? "?"}: ${e instanceof Error ? e.message.slice(0, 140) : e}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, blocos.length) }, trabalhar));
  ideias.sort((a, b) => a.gatilho.t - b.gatilho.t);
  return { ideias, erros };
}
