import { ICONES_POP, REGRAS, ZONAS, type Familia } from "@/lib/media/plano-de-montagem";
import type { NomeDoElemento } from "@/lib/media/biblias/tipos";

/**
 * O FORMATO DE CADA ELEMENTO NO PROMPT DO DIRETOR (01/10).
 *
 * O contrato com o validador (plano-de-montagem.ts) tem tipos internos
 * ("letras-revista", "marca-texto", "icone-pop"), e cada família os chama por
 * outro nome no prompt ("palavra", "destaque", "emoji"), convertidos por
 * APELIDO_DO_ELEMENTO. Aqui fica o JSON que o diretor escreve para cada nome,
 * as famílias que o validador aceita com ele, e a frase de uso padrão. A
 * bíblia escolhe quais entram e diz QUANDO usar cada um.
 */

const Z = ZONAS.join(", ");

export const ELEMENTOS_DO_PROMPT: Record<NomeDoElemento, { familias: Familia[]; json: string; oQue: string }> = {
  recorte: {
    familias: ["colagem"],
    json: `{"tipo":"recorte","asset":"<id de asset tipo elemento>","zona":...,"palavra":i,"entrada":"cair"|"deslizar"|"pop","tamanho":"p"|"m"|"g"}`,
    oQue: "o objeto do SUBSTANTIVO dito, recortado, entrando na palavra que o motivou",
  },
  "recorte-pop": {
    familias: ["impacto"],
    json: `{"tipo":"recorte","asset":"<id de asset tipo elemento>","zona":...,"palavra":i,"entrada":"pop","tamanho":"p"|"m"|"g"}`,
    oQue: "o objeto do SUBSTANTIVO dito, em ilustração chapada e vibrante, estourando na palavra",
  },
  icone: {
    familias: ["colagem", "impacto", "sobrio"],
    json: `{"tipo":"icone","marca":"<id da lista MARCAS CITADAS>","zona":...,"palavra":i}`,
    oQue: "o LOGO OFICIAL da marca citada, desenhado em código, só na palavra em que ela é dita",
  },
  "marca-texto": {
    familias: ["colagem"],
    json: `{"tipo":"marca-texto","texto":"...","zona":...,"palavra":i}`,
    oQue: `frase-chave FALADA (até ${REGRAS.palavrasPorTexto} palavras, exatamente como foi dita) em papel com marca-texto na cor da marca`,
  },
  "letras-revista": {
    familias: ["colagem"],
    json: `{"tipo":"letras-revista","texto":"...","zona":...,"palavra":i}`,
    oQue: `título de 1 a ${REGRAS.palavrasPorTitulo} palavras (até ${REGRAS.letrasPorTitulo} letras) com letras recortadas de revista`,
  },
  carimbo: {
    familias: ["colagem"],
    json: `{"tipo":"carimbo","texto":"...","zona":...,"palavra":i}`,
    oQue: `carimbo de 1 a ${REGRAS.palavrasPorTitulo} palavras (ex.: "PROVADO", "20 DIAS")`,
  },
  tarja: {
    familias: ["colagem"],
    json: `{"tipo":"tarja","texto":"...","zona":...,"palavra":i}`,
    oQue: `tarja de terminal que digita a fala (até ${REGRAS.palavrasPorTexto} palavras FALADAS)`,
  },
  "tarja-telejornal": {
    familias: ["sobrio"],
    json: `{"tipo":"tarja","texto":"...","rotulo":"...","zona":"base-esquerda","palavra":i}`,
    oQue: `tarja limpa (lower third) com a frase-chave FALADA (até ${REGRAS.palavrasPorTexto} palavras) e um chapéu curto em "rotulo" (1 a ${REGRAS.palavrasPorTitulo} palavras: o assunto, "PASSO 1", ou nome e cargo se foram ditos)`,
  },
  numero: {
    familias: ["colagem", "impacto"],
    json: `{"tipo":"numero","valor":N,"prefixo":"","sufixo":"","rotulo":"...","zona":...,"palavra":i}`,
    oQue: "número grande que conta até N. Só número DITO na fala",
  },
  "numero-com-fonte": {
    familias: ["sobrio"],
    json: `{"tipo":"numero","valor":N,"prefixo":"","sufixo":"","rotulo":"...","fonte":"...","zona":...,"palavra":i}`,
    oQue: `número grande que conta até N, com rótulo e a fonte ("fonte" só se a fala disse de onde vem). Só número DITO`,
  },
  barras: {
    familias: ["colagem", "impacto", "sobrio"],
    json: `{"tipo":"barras","titulo":"...","itens":[{"rotulo":"...","valor":N,"texto":"..."}],"zona":...,"palavra":i}`,
    oQue: `gráfico de barras em código. "valor" pode ser convertido para a mesma unidade, mas "texto" mostra o número como foi dito`,
  },
  "seta-circulo": {
    familias: ["colagem", "impacto"],
    json: `{"tipo":"seta"|"circulo","zona":...,"palavra":i}`,
    oQue: "traço desenhado apontando ou circulando o que importa",
  },
  palavra: {
    familias: ["impacto"],
    json: `{"tipo":"palavra","texto":"...","zona":"centro","palavra":i}`,
    oQue: `1 a ${REGRAS.palavrasPorTitulo} palavras FALADAS (até ${REGRAS.letrasPorTitulo} letras) em caixa alta ENORME, estourando na palavra dita`,
  },
  destaque: {
    familias: ["impacto"],
    json: `{"tipo":"destaque","texto":"...","zona":...,"palavra":i}`,
    oQue: `frase-chave FALADA (até ${REGRAS.palavrasPorTexto} palavras, exatamente como foi dita) em caixa alta; cada palavra acende na cor da marca quando é dita`,
  },
  emoji: {
    familias: ["impacto"],
    json: `{"tipo":"emoji","nome":"<${ICONES_POP.join("|")}>","zona":...,"palavra":i}`,
    oQue: "ícone pop desenhado em código, que estoura na palavra: check no acerto, x no erro, dinheiro em preço ou lucro, relogio em tempo, seta-cima em crescimento, seta-baixo em queda, alerta em risco, fogo em tendência, raio em rapidez, alvo em meta, estrela em qualidade, coracao em cliente ou paixão",
  },
  titulo: {
    familias: ["sobrio"],
    json: `{"tipo":"titulo","texto":"...","zona":...,"palavra":i}`,
    oQue: `título de 1 a ${REGRAS.palavrasPorTitulo} palavras, na troca de assunto ou na ideia-chave`,
  },
  // OS DO CONSÓRCIO (02/10), desenhados pelo impacto no kit "consorcio".
  faixa: {
    familias: ["impacto"],
    json: `{"tipo":"faixa","texto":"...","zona":...,"palavra":i}`,
    oQue: `o VALOR ou a palavra da prova (1 a ${REGRAS.palavrasPorTitulo} palavras, até ${REGRAS.letrasPorTitulo} letras, ex.: "R$ 120 MIL", "CONTEMPLADO") numa faixa de papel rasgado na cor da marca, letra condensada branca. Só número e palavra DITOS ("R$" e "MIL" podem completar o número dito)`,
  },
  selo: {
    familias: ["impacto"],
    json: `{"tipo":"selo","texto":"...","zona":"topo"|"base","palavra":i}`,
    oQue: "selo branco arredondado com o círculo de check na cor da marca e o NOME da marca ou do vendedor (até 4 palavras): o nome do cliente como está em QUEM É O CLIENTE, ou o apelido que a pessoa diz de si",
  },
  rotulo: {
    familias: ["impacto"],
    json: `{"tipo":"rotulo","texto":"...","zona":...,"palavra":i}`,
    oQue: `rótulo branco arredondado com letra preta, sem check, com a frase DITA (até ${REGRAS.palavrasPorTexto} palavras, exatamente como foi dita; ex.: "Não façam isso em casa!")`,
  },
  comentario: {
    familias: ["impacto"],
    json: `{"tipo":"comentario","texto":"...","autor":"","zona":"topo","palavra":i}`,
    oQue: "o cartão do COMENTÁRIO RESPONDIDO (branco, como o adesivo da rede): a pergunta do seguidor exatamente como a pessoa a LEU em voz alta (até 10 palavras); \"autor\" só com o nome que foi dito, senão vazio",
  },
  citacao: {
    familias: ["sobrio"],
    json: `{"tipo":"citacao","texto":"...","zona":...,"palavra":i}`,
    oQue: `a frase dita (até ${REGRAS.palavrasPorTexto} palavras), em destaque tipográfico, que se acende com a voz`,
  },
};

/** As zonas, para o texto do prompt. */
export const ZONAS_NO_PROMPT = Z;
