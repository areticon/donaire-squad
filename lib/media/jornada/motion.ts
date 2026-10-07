import type { Redator } from "@/lib/media/jornada/ideias";
import type { DirecaoDaEdicao } from "@/lib/media/jornada/direcao";

/**
 * O MOTION ESCRITO NA HORA (08/10/2026, protótipo). Bruno, com os prompts de motion em código de um post: "porque
 * nosso editor de vídeos não gera efeitos assim?". Porque os efeitos eram um cardápio fixo de peças (vidro, número,
 * linha do tempo) e a IA só enchia o texto; todo vídeo saía com a mesma cara, "de código". O vídeo da landing, a
 * régua, foi feito com animação escrita à mão PARA AQUELE vídeo (docs/editor-jornada-0610.md, seção A).
 *
 * Aqui o Claude ESCREVE a animação de cada momento (é escrita: a regra "Claude só escreve, JEV decide" segue; o
 * JEV continua decidindo o que entra, onde e quando). O código é uma função `criar(raiz, ctx)` que monta o DOM na
 * caixa livre que a montagem mediu e anima pela Web Animations API (nativa, sem biblioteca e sem licença); o
 * Remotion (worker/remotion/src/jornada/MotionEscrito.tsx) põe cada animação no instante exato do quadro e encolhe
 * o conjunto se algum texto passar da caixa.
 *
 * Este módulo é puro: o pedido, a extração e a validação do código (nomes proibidos, sintaxe, tamanho, os textos
 * vindos só de ctx). A chamada ao Claude é injetada (Redator).
 */

export type EntradaDoMotion = {
  id: string;
  /** O que o momento mostra: um número dito, uma frase-tese, uma lista, um título sobre uma cena. */
  papel: "numero" | "titulo" | "lista" | "sobre-cena" | "tela-cheia";
  /** O que a pessoa diz neste momento (para a ideia do movimento, nunca para o texto da tela). */
  fala: string;
  /** Os textos EXATOS que podem aparecer. */
  textos: { titulo: string; destaque: string; numero: string | null; numeroPartes: { antes: string; valor: number; casas: number; depois: string } | null; itens: string[] };
  /** A caixa livre em pixels (fora do rosto e da legenda) e onde ela fica no quadro. */
  caixa: { largura: number; altura: number; onde: string };
  duracao: number;
  /** O que está atrás da caixa (a pessoa falando sobre parede clara, a cena de B-roll escura...). */
  fundo: string;
};

export type ContextoDoMotion = {
  marca: string;
  nicho: string | null;
  fonte: string;
  direcao: DirecaoDaEdicao | null;
  corDaMarca: string;
  /** Os outros momentos do mesmo vídeo, para cada peça ter ideia própria e o conjunto ser coerente. */
  vizinhos: string[];
};

export const SISTEMA_DO_MOTION = `Você é um motion designer de primeira linha (o nível de um lançamento da Apple, de um comercial de app, de um showreel premiado) e escreve animação em JavaScript puro, que roda num navegador e é gravada quadro a quadro por cima de um vídeo vertical de uma pessoa falando.

Você escreve UMA função:

function criar(raiz, ctx) { ... }

O CONTRATO (obrigatório):
- "raiz" é uma div vazia de ctx.largura x ctx.altura pixels, fundo transparente, posicionada por cima do vídeo num lugar que não cobre o rosto nem a legenda. Crie todos os elementos com document.createElement e appendChild dentro de raiz, com estilos inline (position absolute relativa à raiz). Nada fora da raiz. Não mexa no estilo da própria raiz (posição, tamanho, overflow): crie um filho e trabalhe nele.
- Palavras separadas em elementos (para animar uma por uma) mantêm o espaço entre elas: gap ou margin-right de uns 0,28em. A frase precisa ser lida como frase.
- Anime SÓ pela Web Animations API: elemento.animate(keyframes, { duration: ms, delay: ms, easing, fill: "both" }). O sistema pausa e posiciona cada animação no tempo de cada quadro. Não use setTimeout, setInterval, requestAnimationFrame, transição CSS nem @keyframes.
- O que a Web Animations não faz (contar um número, desenhar progressivo num canvas, trocar letras) vai em atualizar: devolva { atualizar(t) { ... } }, com t em segundos desde a entrada. atualizar é função pura de t: o mesmo t dá sempre a mesma imagem.
- Tempo: a peça vive ctx.duracao segundos. Entra em até 0,6 s (a primeira coisa visível em até 0,15 s), vive com movimento discreto e sai nos últimos 0,35 s (tudo some). Nada aleatório: se precisar, use ctx.aleatorio() (semente fixa).
- Texto: use SÓ os textos de ctx.textos, exatamente como estão. Não invente palavra, não troque, não abrevie, não mude número. O número conta de 0 até o valor final com desaceleração no fim, formatado em pt-BR: ctx.textos.numeroPartes tem { antes, valor, casas, depois }; mostre antes + (valor * progresso).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + depois.
- Caber: todo texto dentro da raiz em todo instante depois da entrada. Calcule o tamanho da letra pela largura e pela altura da raiz (o texto mais longo cabe na largura com folga); número com white-space: nowrap; nunca corte nem quebre palavra no meio.
- Legível sobre vídeo: todo texto com sombra escura (text-shadow ou filter: drop-shadow) e contraste forte contra o fundo descrito em ctx.fundo.
- Visual: as cores de ctx.cores.lista (degradê no texto com background-clip: text, brilho em ctx.cores.brilho), o peso ctx.cores.peso, a fonte ctx.fonte. A energia ctx.cores.energia ("contida", "media", "alta") dita a velocidade e a amplitude do movimento.
- Proibido: fetch, XMLHttpRequest, import, eval, Function, imagem ou fonte externa, document.body, window, localStorage, Math.random.

SEJA CRIATIVO DE VERDADE. Cada momento tem uma ideia de movimento própria, ligada ao que a pessoa diz (ctx.fala), e diferente dos outros momentos do vídeo (ctx.vizinhos): tipografia cinética (palavra por palavra, máscara que revela, letra com rastro e echo trail, desfoque que entra em foco, peso que cresce), linhas e traços que se desenham, contagem com desaceleração e um pulso no valor final, sublinhado que corre, partículas discretas, dígitos que rolam como placar, um selo que gira, uma barra que enche. Nada de caixa de vidro genérica, pílula, card padrão ou fundo chapado cobrindo a pessoa: o vídeo da pessoa aparece em volta. Premium, limpo, com intenção.

Responda só com o código, num bloco \`\`\`js, começando por function criar(raiz, ctx) {.`;

/** O pedido de UMA peça. */
export function pedidoDoMotion(e: EntradaDoMotion, c: ContextoDoMotion): string {
  const cores = c.direcao?.cores?.length ? c.direcao.cores : [c.corDaMarca, "#ffffff"];
  return [
    `MARCA: ${c.marca}${c.nicho ? ` (nicho: ${c.nicho})` : ""}`,
    `DIREÇÃO VISUAL DESTE VÍDEO: ${c.direcao ? `${c.direcao.nome}: ${c.direcao.porque}` : "a cor da marca"}`,
    `MOMENTO: ${e.papel === "numero" ? "um número que a pessoa disse" : e.papel === "lista" ? "uma lista que a pessoa enumera" : e.papel === "sobre-cena" ? "um título por cima de uma cena de vídeo" : e.papel === "tela-cheia" ? "TELA CHEIA: por estes segundos o vídeo corta da pessoa para a sua peça (a voz continua). Pinte um fundo próprio cobrindo a raiz inteira (o escuro da direção, com profundidade: brilho, grade, luz) e faça a peça de motion inteira, grande, como num comercial" : "uma frase-tese do momento"}`,
    `A PESSOA DIZ: "${e.fala}"`,
    `TEXTOS (ctx.textos, os únicos permitidos): ${JSON.stringify(e.textos)}`,
    `CAIXA: ${e.caixa.largura} x ${e.caixa.altura} px, ${e.caixa.onde}`,
    `ATRÁS DA CAIXA (ctx.fundo): ${e.fundo}`,
    `DURAÇÃO (ctx.duracao): ${e.duracao.toFixed(2)} s`,
    `CORES (ctx.cores): lista ${JSON.stringify(cores)}, brilho ${c.direcao?.brilho ?? cores[cores.length - 1]}, peso ${c.direcao?.peso ?? 800}, energia ${c.direcao?.energia ?? "media"}; fonte (ctx.fonte): ${c.fonte}`,
    `OUTROS MOMENTOS DO MESMO VÍDEO (ctx.vizinhos; faça diferente deles, com a mesma linguagem): ${c.vizinhos.join(" | ") || "nenhum"}`,
  ].join("\n");
}

/** Os dados que vão ao código como ctx (o worker acrescenta largura, altura, duração e aleatorio). */
export function dadosDoMotion(e: EntradaDoMotion, c: ContextoDoMotion): Record<string, unknown> {
  const cores = c.direcao?.cores?.length ? c.direcao.cores : [c.corDaMarca, "#ffffff"];
  return {
    textos: e.textos,
    fala: e.fala,
    fundo: e.fundo,
    fonte: c.fonte,
    marca: c.marca,
    vizinhos: c.vizinhos,
    cores: { lista: cores, brilho: c.direcao?.brilho ?? cores[cores.length - 1], peso: c.direcao?.peso ?? 800, energia: c.direcao?.energia ?? "media" },
  };
}

const PROIBIDO = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|eval|setTimeout|setInterval|requestAnimationFrame|localStorage|sessionStorage|indexedDB|navigator|location)\b|\bimport\s*\(|\bimport\s+[\w{*]|\bnew\s+Function\b|\bFunction\s*\(|\bwindow\s*\.|\bdocument\s*\.\s*(body|cookie|head|documentElement|write)\b|\bMath\s*\.\s*random\b|\burl\s*\(\s*['"]?https?:|@import|\bsrc\s*=|\.src\b/;

/** O código do bloco ```js da resposta (ou a resposta inteira, se ela já é só o código). */
export function extrairCodigo(resposta: string): string {
  const m = /```(?:js|javascript)?\s*\n([\s\S]*?)```/.exec(resposta);
  return (m ? m[1] : resposta).trim();
}

/** A validação do código (puro): null se serve, ou o motivo da recusa. */
export function conferirCodigo(codigo: string, e: Pick<EntradaDoMotion, "textos">): string | null {
  if (!/function\s+criar\s*\(\s*raiz\s*,\s*ctx\s*\)/.test(codigo)) return "falta a função criar(raiz, ctx)";
  if (codigo.length > 16000) return `código longo demais (${codigo.length} caracteres)`;
  // Sem os comentários: o código que só CITA um nome proibido num comentário ("sem requestAnimationFrame") não é recusado.
  const semComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const proibido = PROIBIDO.exec(semComentarios);
  if (proibido) return `usa o que é proibido: ${proibido[0]}`;
  if (!/\.animate\s*\(/.test(codigo) && !/atualizar/.test(codigo)) return "não anima (nem .animate, nem atualizar)";
  try {
    // Só compila (não roda): a sintaxe precisa fechar.
    // eslint-disable-next-line no-new-func
    new Function("raiz", "ctx", `"use strict";\n${codigo}\nreturn criar;`);
  } catch (err) {
    return `sintaxe: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`;
  }
  // Os números escritos à mão no código precisam ser do texto permitido (o número da tela vem de ctx.textos).
  const permitidos = `${e.textos.titulo} ${e.textos.destaque} ${e.textos.numero ?? ""} ${e.textos.itens.join(" ")}`;
  for (const lit of codigo.match(/(["'`])(?:(?!\1)[^\\\n]|\\.)*\1/g) ?? []) {
    const corpo = lit.slice(1, -1);
    // Texto visível escrito à mão (letras com espaço, fora de estilo CSS) que não está nos textos permitidos.
    if (/[A-Za-zÀ-ú]{3,}\s+[A-Za-zÀ-ú]{3,}/.test(corpo) && !/[:;{}#()]|px|rgba?|linear|radial|ease|cubic|solid|blur|translate|scale|rotate|inset|absolute|relative|flex|center|nowrap|hidden|visible|transparent|text|background|border|shadow|font|letter|line|white|space|drop/i.test(corpo)) {
      const palavras = corpo.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
      if (palavras.some((w) => !permitidos.toLowerCase().includes(w))) return `texto escrito à mão fora do permitido: "${corpo.slice(0, 60)}"`;
    }
  }
  return null;
}

/** Uma peça: escreve, confere e, recusada, pede de novo uma vez com o motivo. */
export async function escreverMotion(e: EntradaDoMotion, c: ContextoDoMotion, redator: Redator): Promise<{ codigo: string | null; motivo: string | null; tentativas: number }> {
  const pedido = pedidoDoMotion(e, c);
  let resposta = await redator(SISTEMA_DO_MOTION, pedido);
  let codigo = extrairCodigo(resposta);
  let motivo = conferirCodigo(codigo, e);
  if (!motivo) return { codigo, motivo: null, tentativas: 1 };
  resposta = await redator(SISTEMA_DO_MOTION, `${pedido}\n\nA versão anterior foi recusada: ${motivo}. Escreva de novo, respeitando o contrato.`);
  codigo = extrairCodigo(resposta);
  motivo = conferirCodigo(codigo, e);
  return { codigo: motivo ? null : codigo, motivo, tentativas: 2 };
}
