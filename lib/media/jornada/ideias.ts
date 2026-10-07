import { primeiroJson } from "@/lib/media/jornada/json";
import type { LeituraDoVideo, TrechoLido } from "@/lib/media/leitura-do-video";
import { contextoEmTexto, type ContextoDaJornada } from "@/lib/media/jornada/contexto";
import type { Frase, Palavra } from "@/lib/media/jornada/linha-do-tempo";
import { semTravessao, type MidiaDaJornada, type PapelDoElemento } from "@/lib/media/jornada/estado";
import { numeroFoiDito } from "@/lib/media/jornada/numeros";

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

Para cada frase numerada, escreva de 0 a 2 ideias. Frase de ligação ou hesitação fica sem ideia.

RITMO E RETENÇÃO (regra do dono): no vídeo curto, TODA frase com conteúdo merece ideia; o espectador precisa ver algo novo a cada 2 a 4 segundos, sempre COM a pessoa na tela, falando, e o efeito aparecendo junto com ela (ao lado, acima da cabeça, sobre o peito). Quanto mais longo o vídeo, mais espaçados os efeitos. A PRIMEIRA ou a segunda frase (os primeiros 6 segundos) sempre ganha uma ideia de impacto com papel "abertura": o gancho visual que segura o espectador. No vídeo curto não proponha "video" (B-roll tira a pessoa da tela). No vídeo longo, os elementos ficam mais espaçados e intercalados com B-roll em vídeo: proponha "video" nos momentos que contam uma história, descrevem uma cena ou pedem movimento (uma em cada três ideias, mais ou menos).

O QUE A PESSOA FALA APARECE (regra do dono): falou de moto, aparece uma moto; de carro, um carro; de casa, uma casa; de chave, de contrato, de cofre, de relógio, aparece o objeto. Esses elementos são GERADOS POR IA ("recorte": o objeto isolado que entra ao lado da pessoa, sobre o ombro, acima da cabeça ou sobre o peito; "imagem": uma composição numa janela ao lado dela), com acabamento de foto ou ilustração 3D de qualidade, nunca desenho de código. A maioria das ideias é "recorte" ou "imagem".
O "grafico" (desenhado em código) é só para quando o próprio TEXTO é o conteúdo: um número que a pessoa disse (o valor exato), uma lista que ela enumera item a item, uma pergunta ou frase de impacto curta. No máximo uma ideia em cada três é "grafico", e nunca no lugar de um objeto que foi dito.

A EMPRESA E O NICHO SÃO OS DO CONTEXTO. Marcas, logos, faixas e textos que a leitura vê no FUNDO da gravação são só cenário: nunca são a marca do cliente nem o assunto, e nunca entram nas ideias.

Cada ideia:
- "frase": o número da frase.
- "gatilho": UMA palavra da própria frase, escrita como está, que chama o elemento (o elemento aparece quando ela é dita).
- "descricao": em português, uma frase concreta e visual do que aparece (o objeto, a cena, a composição, a cor, o movimento), tirada do que a fala diz naquele momento e do que a leitura do vídeo mostra. Use o contexto da empresa, da marca e do nicho para escolher o imaginário que mais faz sentido para aquele público. Ideias seguidas nunca repetem o mesmo assunto do mesmo jeito: varie o ângulo (o objeto, o detalhe, o gesto, a consequência). Nada genérico ("ícone de sucesso"), nada abstrato (barras, formas, cartão vazio), nada que o vídeo já mostra. Prefira o que se VÊ: um objeto, um logo, uma tela, uma cena, uma ilustração ligada ao que é dito; uma ideia que é só texto (palavra gigante, faixa com número) só quando o próprio texto é a prova daquele momento, e no máximo uma assim a cada três ideias.
- "textoNaImagem": null, ou o texto EXATO que a arte deve trazer, até 5 palavras: só palavras ditas no momento, um número dito ou o nome de uma marca ou rede citada. Na chamada, a própria chamada curta.
- "midia": "recorte" (um objeto, ícone 3D ou logo gerado por IA, isolado, que entra sobre a gravação junto da pessoa), "imagem" (uma composição gerada que entra numa janela ao lado da pessoa), "grafico" (só número dito, lista enumerada ou frase curta de impacto, desenhado em código) ou "video" (B-roll em movimento, só no vídeo longo).
- "papel": "elemento"; ou "abertura" (só nas primeiras frases: um elemento de abertura que apresenta o tema do vídeo, de preferência o objeto ou a cena do assunto gerado por IA); ou "chamada" (seguir, salvar, comentar): só no vídeo longo, e sempre como imagem gerada, nunca desenhada em código.
- "porque": uma linha com a ligação com a fala.

Logos de redes sociais e de empresas citadas: descreva o logo como elemento (ele será gerado por IA). Nunca uma pessoa real reconhecível, nunca a pessoa que fala nem uma versão dela (gêmeo, clone, duplicata) com outro rosto, nunca texto além do textoNaImagem: se a ideia precisa de um número ou palavra na arte, escreva-o em textoNaImagem. Português do Brasil, sem travessão (use vírgula ou dois pontos).

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
  // Número na arte só com o VALOR EXATO dito (08/10): antes bastava a fala ter algum número.
  const numerosDoTexto = [...t.matchAll(/\d[\d.,]*/g)].map((m) => m[0]);
  if (numerosDoTexto.some((n) => !numeroFoiDito(n, fala))) return null;
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
    const midia: MidiaDaJornada = x.midia === "video" ? "video" : x.midia === "recorte" ? "recorte" : x.midia === "grafico" ? "grafico" : "imagem";
    const papel: PapelDoElemento = x.papel === "abertura" ? "abertura" : x.papel === "chamada" ? "chamada" : "elemento";
    // A chamada nunca é desenhada em código (08/10: o "curtir e se inscrever" de código era a peça mais amadora).
    const midiaFinal: MidiaDaJornada = papel === "chamada" && midia === "grafico" ? "imagem" : midia;
    const vizinhas = frases.filter((g) => Math.abs(g.indice - f.indice) <= 1).map((g) => g.texto).join(" ");
    const texto = textoPermitido(x.textoNaImagem as string | null, vizinhas, { papel, marca: contexto.marca });
    // A ideia que mostra um texto (frase, citação, manchete, título) sem dizer qual vira cartão vazio: cai.
    // (O gráfico é texto desenhado em código, escrito depois pelo redator do texto: não passa por este filtro.)
    if (midia !== "grafico" && !texto && /(frase|cita[cç][aã]o|manchete|t[ií]tulo|palavra|texto|escrit[ao]|legenda|letreiro|nome)/i.test(String(x.descricao ?? ""))) continue;
    // A ideia feita EM VOLTA de um texto que não pode entrar (não foi dito, longo demais) cai inteira: sem o texto ela não significa nada.
    if (midia !== "grafico" && String(x.textoNaImagem ?? "").trim() && !texto) continue;
    saida.push({
      frase: f.indice,
      gatilho: { palavra: palavras[indice].texto.replace(/[.,!?;:]+$/, ""), indice, t: palavras[indice].inicio },
      descricao,
      textoNaImagem: texto,
      midia: midiaFinal,
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
        let lidas = lerIdeias(await o.redator(SISTEMA_DAS_IDEIAS, pedidoDasIdeias(b, o.contexto, o.leitura)), b, o.palavras, o.contexto);
        // Resposta sem JSON válido: o mesmo pedido de novo, uma vez.
        if (!lidas.length) lidas = lerIdeias(await o.redator(SISTEMA_DAS_IDEIAS, `${pedidoDasIdeias(b, o.contexto, o.leitura)}

Responda com JSON válido (aspas internas escapadas).`), b, o.palavras, o.contexto);
        ideias.push(...lidas);
      } catch (e) {
        erros.push(`ideias do bloco ${b[0]?.indice ?? "?"}: ${e instanceof Error ? e.message.slice(0, 140) : e}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, blocos.length) }, trabalhar));
  ideias.sort((a, b) => a.gatilho.t - b.gatilho.t);
  return { ideias, erros };
}
