/**
 * Infographic generation using Gemini Flash image generation ("Nano Banana").
 *
 * Gemini Nano Banana Pro (gemini-3-pro-image-preview) is specifically designed
 * for complex layouts with accurate text rendering — this is the same engine
 * used by NotebookLM to generate infographics with perfect typography.
 *
 * Approach (desde 30/09/2026):
 * 1. Gemini (text) extracts structured content from the post (PT-BR, with data)
 * 2. O infografico e MONTADO EM CODIGO a partir desse conteudo
 *    (lib/media/infografico-em-codigo.tsx). O modelo de imagem nao escreve mais.
 *
 * Output: 9:16 portrait PNG — optimal LinkedIn format
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ProporcaoPedida } from "./formatos-das-redes";
import { coresDaMarca } from "@/lib/media/capa-composta";
import { exigirIdentidadeAprovada, type MarcaDaArte } from "@/lib/media/arte-com-frase";
import { montarInfograficoEmCodigo } from "@/lib/media/infografico-em-codigo";
import { semNumerosRepetidos } from "@/lib/media/infografico-sem-repeticao";
import { infograficoRepeteDado } from "@/lib/squad/coerencia-da-arte";

/**
 * A direção de arte desta peça, decidida FORA daqui (lib/media/direcao-de-arte):
 * qual estilo e quais cores. Até 14/09 este arquivo escolhia sozinho, com cinco
 * paletas fixas mapeadas pelo NICHO do projeto e uma única frase de estilo, e
 * por isso todo infográfico de um mesmo cliente saía igual, fosse qual fosse o
 * tema. O nicho diz o assunto; a marca diz a cor; o estilo alterna.
 */
export interface DirecaoDeArte {
  /** Fragmento em inglês descrevendo composição, tipografia e acabamento. */
  estilo: string;
  /** Fragmento em inglês com as cores da marca do projeto. */
  paleta: string;
  /** Família da linguagem e cores da marca: é o que o infográfico em código usa (30/09). */
  marca?: MarcaDaArte;
}

/**
 * O que o infográfico precisa saber além do texto do post.
 *
 * Até 18/09 ele recebia só o post e o nicho, e era o único agente da esteira
 * cego para o funil e para os documentos do projeto. O Bruno cobrou os dois
 * de uma vez: "tudo o que preenchemos no projeto, na campanha, o RAG do
 * cliente completo com histórico, deve alimentar todos os agentes".
 */
export interface RegrasDoInfografico {
  /** O estágio da campanha. Decide se a peça pode falar de produto. */
  funil?: "tofu" | "mofu" | "bofu";
  /** Os documentos do projeto, para acertar nomes e termos da marca. */
  marca?: string;
  /** O projeto, para o JEV conferir o conjunto (06/10) e o uso cair na conta certa. */
  projectId?: string | null;
}

export interface ConteudoDoInfografico {
  title: string;
  subtitle: string;
  sections: Array<{
    heading: string;
    body: string;
    stat?: string;
  }>;
  highlight?: { value: string; label: string };
  keyNumbers?: Array<{ value: string; label: string }>;
}

/** Step 1: Extract structured content from post in Portuguese */
async function extractContent(
  postContent: string,
  niche: string,
  apiKey: string,
  regras?: RegrasDoInfografico,
  /** A segunda tentativa, depois do veto do JEV: o que não repetir. */
  evitar?: string
): Promise<ConteudoDoInfografico> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // A REGRA DA OFERTA, escrita em 18/09.
  //
  // O Bruno leu um infográfico gerado daqui com o rodapé "7 Dias para teste
  // grátis (Demandou)". Esse prazo não está no post, não está no projeto e não
  // existe: o modelo montou um infográfico de VENDA porque o post citava a
  // plataforma, e "extraia os dados do post" não proíbe inventar uma oferta.
  //
  // Prometer condição comercial que ninguém autorizou é o pior defeito que uma
  // peça pode ter, porque ela vai ao ar no nome do cliente.
  const semOferta = `6. PROIBIDO inventar oferta comercial: teste grátis, prazo, preço, desconto, bônus, garantia ou qualquer chamada para ação que não esteja ESCRITA no post acima. Se o post não traz oferta, o infográfico não traz.
7. O infográfico EXPLICA o conteúdo do post. Ele não é anúncio: não transforme o post numa peça de venda do produto citado nele.`;

  const porFunil =
    regras?.funil === "tofu"
      ? "\n8. Este é conteúdo de TOPO DE FUNIL: nenhuma menção de produto em destaque, nenhum rodapé de conversão, nenhum logotipo de oferta. O leitor está aprendendo, não comprando."
      : regras?.funil === "mofu"
        ? "\n8. Conteúdo de MEIO DE FUNIL: o produto pode aparecer como exemplo, nunca como oferta."
        : "";

  const prompt = `Extraia os dados do post abaixo para montar um infográfico profissional para LinkedIn.
${regras?.marca ? `\nContexto da marca (para acertar nomes e termos, NÃO para virar propaganda):\n${regras.marca.slice(0, 1200)}\n` : ""}
⚠️ REGRAS ABSOLUTAS:
1. TODO texto deve estar em PORTUGUÊS BRASILEIRO.
2. NUNCA use lorem ipsum, placeholders ou inventar dados.
3. Use apenas informações reais do post.
4. Se faltar dado para algum campo, resuma a ideia principal do post.
5. O título NÃO pode começar com rótulos de categoria como "IA:", "AI:", "Tech:", "Digital:", "Inovação:" ou similares. Escreva direto a manchete.
${semOferta}${porFunil}
9. NUNCA abrevie palavra ("exper.", "qtd.", "info."): o texto vai inteiro para a peça. Se não couber no limite, reescreva mais curto com palavras inteiras.
10. CADA DADO APARECE UMA VEZ SÓ no infográfico inteiro: o número do "highlight" NÃO volta no "stat" de uma seção nem em "keyNumbers", e duas seções não repetem o mesmo número nem a mesma ideia. Sem outro dado com fonte para uma seção, deixe o "stat" dela vazio.${evitar ? `
11. A versão anterior REPETIU dado no conjunto (${evitar}). Escreva de novo sem nenhuma repetição.` : ""}

Retorne APENAS JSON válido sem markdown:
{
  "title": "manchete impactante em português (máx 60 chars — NÃO inicie com 'IA:', 'AI:' ou qualquer prefixo de categoria)",
  "subtitle": "frase complementar em português (máx 100 chars)",
  "sections": [
    {"heading": "título da seção em português (máx 40 chars)", "body": "descrição em português (máx 90 chars)", "stat": "número destaque opcional como '50 GW' ou 'R$ 7,6bi'"}
  ],
  "highlight": {"value": "número ou dado mais impactante (máx 15 chars)", "label": "o que significa em português (máx 35 chars)"},
  "keyNumbers": [{"value": "número", "label": "descrição em português (máx 30 chars)"}]
}

CONTEÚDO DO POST:
${postContent.slice(0, 3000)}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini não retornou JSON estruturado");

  const data = JSON.parse(jsonMatch[0]) as ConteudoDoInfografico;

  data.sections = (data.sections ?? []).slice(0, 4);
  data.keyNumbers = (data.keyNumbers ?? []).slice(0, 3);

  return data;
}

/**
 * Desenha o infografico numa PROPORCAO pedida, EM CODIGO desde 30/09/2026.
 *
 * Ate 30/09 o modelo de imagem (Nano Banana Pro) desenhava o infografico
 * inteiro, texto incluido. O titulo e os numeros costumavam sair certos, mas
 * o modelo acrescentava por conta propria: na sexta do teste de 30/09 um
 * balao de fala com "Usar chocoers maxsto fbite" e personagens ilustrados.
 * A regra da casa passou a ser a da capa: texto em arte e sempre codigo. Os
 * dados ja saem estruturados da extracao, e lib/media/infografico-em-codigo
 * monta a peca com as fontes do repositorio, as cores da marca e o layout da
 * familia da linguagem do projeto. Ver o comentario de la para a escolha
 * entre montar em codigo e conferir por visao.
 *
 * A assinatura continua a mesma (apiKey e direcao.estilo nao desenham mais)
 * para as chamadas da esteira, do chat e da semana do video nao mudarem de
 * forma; `direcao.marca` e o que manda agora.
 */
export async function desenharInfografico(
  content: ConteudoDoInfografico,
  _apiKey: string,
  proporcao: ProporcaoPedida,
  direcao: DirecaoDeArte
): Promise<string | null> {
  // A TRAVA DA IDENTIDADE vale para o infográfico também (06/10): marca de
  // projeto sem identidade aprovada não desenha, e o chamador que sabe esperar
  // marca a peça como "aguardando a sua identidade visual".
  if (direcao.marca) exigirIdentidadeAprovada(direcao.marca);
  const marca = direcao.marca ?? { familia: "impacto" as const, cores: coresDaMarca(null) };
  // A guarda pura do número repetido vale em todo caminho (conteúdo antigo,
  // refazer, chat): o mesmo número nunca sai em dois lugares da peça.
  const { conteudo, removidos } = semNumerosRepetidos(content);
  if (removidos.length) console.warn(`[Infographic] número repetido tirado da peça: ${removidos.join("; ")}`);
  const jpeg = await montarInfograficoEmCodigo(conteudo, marca, proporcao);
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

/** A extracao do conteudo, exposta para quem precisa desenhar MAIS DE UMA
 *  proporcao do mesmo infografico. Extrair custa uma chamada de texto; desenhar
 *  custa uma de imagem. Um dia que publica em Instagram e LinkedIn precisa de
 *  duas artes e de uma extracao so. */
export async function extrairConteudoDoInfografico(
  postContent: string,
  niche: string,
  apiKey: string,
  regras?: RegrasDoInfografico
): Promise<ConteudoDoInfografico> {
  const primeira = await extractContent(postContent, niche, apiKey, regras);
  // O JEV confere o CONJUNTO (06/10): o mesmo dado no destaque e num cartão,
  // ou dois cartões dizendo a mesma coisa, é vetado e a extração roda de novo
  // uma vez sabendo o que não repetir. O JEV decide; o Gemini só escreve.
  const conjunto = (c: ConteudoDoInfografico) => ({
    destaque: c.highlight?.value ? `${c.highlight.value} ${c.highlight.label ?? ""}`.trim() : undefined,
    cartoes: (c.sections ?? []).map((s) => [s.heading, s.stat, s.body].filter(Boolean).join(" | ")),
    rodape: (c.keyNumbers ?? []).map((n) => `${n.value} ${n.label ?? ""}`.trim()),
  });
  const veto = await infograficoRepeteDado({ projectId: regras?.projectId, conjunto: conjunto(primeira) });
  let escolhida = primeira;
  if (veto.repete) {
    console.warn(`[Infographic] o JEV vetou o conjunto por dado repetido (${veto.nota?.toFixed(2)}); extraio de novo uma vez.`);
    const repetidos = semNumerosRepetidos(primeira).removidos;
    escolhida = await extractContent(postContent, niche, apiKey, regras, repetidos.length ? repetidos.join("; ") : "um dado ou ideia aparece em dois lugares").catch((e) => {
      console.warn("[Infographic] a segunda extração falhou, fica a primeira com a guarda pura:", e instanceof Error ? e.message : e);
      return primeira;
    });
  }
  const { conteudo, removidos } = semNumerosRepetidos(escolhida);
  if (removidos.length) console.warn(`[Infographic] número repetido tirado do conjunto: ${removidos.join("; ")}`);
  return conteudo;
}

/**
 * Gera um infografico completo (extrai e desenha) numa proporcao.
 *
 * A assinatura mudou em 19/09: era `platform` e virou `proporcao`. O motivo e
 * o mesmo que trouxe a tabela de formatos: com `platform`, a decisao de formato
 * tinha dois donos (esta funcao e a esteira) e os dois discordavam. Com
 * proporcao, quem decide e a tabela, e aqui so se desenha o que foi pedido.
 */
export async function generateInfographic(
  postContent: string,
  niche: string,
  apiKey: string,
  proporcao: ProporcaoPedida = "4:5",
  direcao: DirecaoDeArte = {
    estilo: "Clean, modern infographic with clear sections.",
    paleta: "Use a coherent, professional color palette that fits the topic.",
  },
  regras?: RegrasDoInfografico
): Promise<string> {
  const content = await extrairConteudoDoInfografico(postContent, niche, apiKey, regras);
  console.log(`[Infographic] Conteudo extraido - secoes: ${content.sections.length}, proporcao: ${proporcao}`);

  // Montado em codigo (ver desenharInfografico): nao ha modelo de imagem para
  // falhar, entao a queda antiga para o Imagen 3 saiu junto.
  const imageUrl = await desenharInfografico(content, apiKey, proporcao, direcao);
  if (!imageUrl) throw new Error("Nao foi possivel montar o infografico.");
  return imageUrl;
}
