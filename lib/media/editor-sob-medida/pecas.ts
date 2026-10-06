/**
 * O CATÁLOGO DE PEÇAS do editor sob medida (03/10/2026): o que cada peça é,
 * quando usar, as props e o tempo de animação. É o que vai ao prompt do
 * editor e o que o resolvedor usa para validar. O desenho mora no worker
 * (worker/remotion/src/sob-medida/pecas), pelo mesmo nome.
 *
 * `plano` diz o que acontece com a gravação enquanto a peça está na tela:
 *   - "sobre": a pessoa continua cheia; a peça é pequena e fica no canto;
 *   - "lado": a pessoa vai para um cartão do outro lado (como o gêmeo no pitch);
 *   - "tela": a peça ocupa a tela, sobre o fundo da marca, e a voz continua
 *     (as barreiras, as redes e os 88% do pitch). Teto curto: o rosto volta.
 *
 * Módulo puro.
 */

export type PlanoDaPeca = "sobre" | "lado" | "tela";

export type FichaDaPeca = {
  nome: string;
  plano: PlanoDaPeca;
  /** Duração (s) da entrada e da saída; a animação só acontece nelas e nos eventos. */
  entrada: number;
  saida: number;
  evento: number;
  /** Faixa de duração na tela (s). */
  duracao: [number, number];
  /** A lista cujos itens acendem um a um (um evento por item). */
  eventosDe?: string;
  /** Um evento só (a resposta, o lado "depois"). */
  umEvento?: boolean;
  maxItens?: number;
  quando: string;
  props: string;
  /** As passadas do Remotion em que a peça é desenhada (padrão pelo plano: tela só "frente"; sobre e lado com o "vidro"). */
  passes?: Array<"frente" | "atras" | "vidro">;
  /** A peça se mexe o tempo todo (digitação): todo quadro vai ao Chrome. */
  continua?: boolean;
  /** Só nos estilos que têm o acabamento dela (as peças da lousa: lousa e consorcio). */
  estilos?: string[];
  /** Fora destes estilos (04/10: no Vox, o cartão genérico dá lugar às peças de papel). */
  foraDe?: string[];
};

/** Os estilos com as peças da lousa (04/10): o tecnológico do Dan Martell e o luxo da autoridade high ticket. */
export const ESTILOS_DA_LOUSA = ["lousa", "consorcio"];

/**
 * O estilo com as peças de papel do Vox (04/10, quadro de treino vox-01 do
 * dono): colagem, jornal, mapa-antigo, censura, marca-texto, carimbo.
 */
export const ESTILOS_DO_VOX = ["vox"];
/** As peças genéricas que no Vox saem do catálogo: o cartão chapado e o ícone que o juiz reprovou ("parece slide"). */
const FORA_DO_VOX = ESTILOS_DO_VOX;

/**
 * As camadas de APOIO, que o resolvedor põe sozinho e que não contam como
 * peça (densidade, ritmo, gancho, revisão): a moldura do cartão, a legenda
 * com a palavra sublinhada e a grade de cor do B-roll.
 */
export const CAMADAS_DE_APOIO = new Set(["moldura-do-cartao", "legenda-destaque", "grade-azul", "fundo-colagem"]);
export const ehApoio = (c: { peca: string }) => CAMADAS_DE_APOIO.has(c.peca);

/**
 * AS PASSADAS E O MOVIMENTO CONTÍNUO (03/10, segunda volta): a peça de tela
 * tem palco com câmera virtual (se mexe o tempo todo e cobre a gravação); a
 * peça sobre a pessoa ou ao lado tem caixa de VIDRO, que desfoca a gravação
 * atrás (a passada "vidro"); o título gigante vai ATRÁS da pessoa recortada.
 */
export function passesDaPeca(f: FichaDaPeca): Array<"frente" | "atras" | "vidro"> {
  if (f.passes) return f.passes;
  return f.plano === "tela" ? ["frente"] : ["vidro", "frente"];
}
export const pecaContinua = (f: FichaDaPeca) => f.plano === "tela" || f.nome === "titulo-atras" || Boolean(f.continua);

export const PECAS: FichaDaPeca[] = [
  {
    nome: "titulo", foraDe: FORA_DO_VOX, plano: "sobre", entrada: 1.5, saida: 0.3, evento: 0.6, duracao: [2, 6],
    quando: "A ideia central de um trecho, a promessa, a tese dita em outras palavras. A peça mais usada.",
    props: 'rotulo? (2 a 4 palavras, caixa alta no selo), titulo (até 8 palavras; **destaque** em 1 a 3 palavras), apoio? (até 12 palavras), posicao? ("topo-esquerda" | "topo" | "centro")',
  },
  {
    nome: "capitulo", foraDe: FORA_DO_VOX, plano: "sobre", entrada: 1.4, saida: 0.3, evento: 0.6, duracao: [2.5, 7],
    quando: "Começo de uma parte nova do vídeo (passo 1, passo 2; o próximo tópico). Numera a estrutura.",
    props: 'numero ("1", "2"...), titulo (até 6 palavras, **destaque**)',
  },
  {
    nome: "rotulo-inferior", foraDe: FORA_DO_VOX, plano: "sobre", entrada: 1.3, saida: 0.3, evento: 0.6, duracao: [2.5, 5],
    quando: "Quem fala (no começo), ou o nome de um lugar, pessoa citada ou ferramenta mostrada.",
    props: "nome (até 4 palavras, **destaque**), descricao? (até 8 palavras)",
  },
  {
    nome: "palavra-chave", foraDe: FORA_DO_VOX, plano: "sobre", passes: ["frente"], entrada: 0.8, saida: 0.25, evento: 0.6, duracao: [1, 2.5],
    quando: "Uma palavra forte dita com ênfase (ritmo entre peças maiores). Com moderação.",
    props: 'texto (1 ou 2 palavras), lado? ("esquerda" | "direita")',
  },
  {
    nome: "sublinhado", foraDe: FORA_DO_VOX, plano: "sobre", passes: ["frente"], entrada: 1.0, saida: 0.25, evento: 0.6, duracao: [1.2, 3],
    quando: "Uma palavra ou expressão curta escrita sobre o peito da pessoa, com a faixa da marca correndo por baixo.",
    props: 'texto (1 a 3 palavras), lado? ("esquerda" | "centro" | "direita")',
  },
  {
    nome: "pergunta-resposta", foraDe: FORA_DO_VOX, plano: "sobre", entrada: 1.1, saida: 0.3, evento: 0.8, duracao: [2.5, 6], umEvento: true,
    quando: "Uma objeção ou pergunta que a fala responde. O evento é quando a resposta é dita.",
    props: "pergunta (até 6 palavras), resposta (até 7 palavras)",
  },
  {
    nome: "seta", plano: "sobre", passes: ["frente"], entrada: 0.8, saida: 0.3, evento: 0.6, duracao: [1.5, 4],
    quando: "A pessoa mostra ou aponta algo NA GRAVAÇÃO (um objeto, um lugar): a seta liga o rótulo ao que se vê. Use os quadros para saber onde.",
    props: "de {x,y} (onde fica o rótulo, fração do quadro 0 a 1), para {x,y} (o que é mostrado), rotulo? (até 4 palavras)",
  },
  {
    nome: "circulo", plano: "sobre", passes: ["frente"], entrada: 0.7, saida: 0.3, evento: 0.6, duracao: [1.5, 4],
    quando: "Destacar um ponto da imagem que a fala nomeia (um objeto na mesa, um detalhe).",
    props: "x, y (centro, fração do quadro), raio (0,05 a 0,3), rotulo? (até 4 palavras)",
  },
  {
    nome: "icone", foraDe: FORA_DO_VOX, plano: "sobre", entrada: 1.3, saida: 0.3, evento: 0.6, duracao: [2, 5],
    quando: "Um objeto concreto da fala vira ícone grande com rótulo (tempo, dinheiro, igreja, família, alvo).",
    props: 'nome (um destes: dinheiro, cifrao, carteira, cofre, relogio, ampulheta, pessoas, pessoa, foguete, alvo, sobe, cai, grafico, cruz, livro, biblia, coracao, raio, cadeado, casa, mundo, check, x, lampada, megafone, calendario, escudo, coroa, chave, aperto, estrela, igreja, mensagem, telefone, carrinho, ferramenta, mapa, bussola, montanha, semente, fogo, trofeu, maleta, loja, predio, computador, video, camera, microfone, olho, cerebro, balanca, presente, pao, peixe, barco, oracao, luz, agua, caminho, alerta, pergunta, ideia, tempo, documento, contrato, email, compartilhar), rotulo (até 6 palavras, **destaque**), apoio? (até 8 palavras), posicao? ("direita" | "topo-esquerda" | "topo")',
  },
  {
    nome: "painel-lateral", foraDe: FORA_DO_VOX, plano: "lado", entrada: 1.3, saida: 0.3, evento: 0.7, duracao: [3, 10], eventosDe: "itens", maxItens: 5,
    quando: "Uma sublista curta ou definição enquanto a pessoa explica: o painel de um lado, a pessoa em cartão do outro. Cada item acende quando é dito.",
    props: 'lado ("esquerda" | "direita"), rotulo? (selo), titulo (até 6 palavras, **destaque**), itens? [{texto (até 6 palavras)}], apoio?',
  },
  {
    nome: "checklist", foraDe: FORA_DO_VOX, plano: "lado", entrada: 1.3, saida: 0.3, evento: 0.7, duracao: [3, 10], eventosDe: "itens", maxItens: 6,
    quando: "Uma lista de coisas a fazer ou critérios, marcados um a um quando ditos.",
    props: 'titulo? (até 6 palavras), itens [{texto (até 6 palavras)}], lado? ("esquerda" | "direita")',
  },
  {
    nome: "progresso", foraDe: FORA_DO_VOX, plano: "lado", entrada: 1.8, saida: 0.3, evento: 0.6, duracao: [2.5, 6],
    quando: "Uma porcentagem DITA (70% das pessoas...). O anel enche até o número.",
    props: 'valor (0 a 100, o número dito), sufixo? ("%"), rotulo (até 8 palavras), lado? ("esquerda" | "direita")',
  },
  {
    nome: "frase-impacto", foraDe: FORA_DO_VOX, plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [1.8, 4],
    quando: "A frase mais forte do trecho, a tese, a virada. Tela inteira, 1 ou 2 vezes por vídeo curto, 3 a 6 no longo.",
    props: "texto (até 7 palavras, **destaque** em 1 ou 2), apoio? (até 10 palavras)",
  },
  {
    nome: "citacao", foraDe: FORA_DO_VOX, plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [3, 7],
    quando: "Alguém é citado (um autor, um mentor, um versículo dito como citação).",
    props: "texto (a frase dita, até 22 palavras, **destaque**), autor? (nome ou referência)",
  },
  {
    nome: "pergaminho", foraDe: FORA_DO_VOX, plano: "tela", entrada: 1.1, saida: 0.3, evento: 0.6, duracao: [3.5, 8],
    quando: "Versículo bíblico lido ou citado, palavra antiga, princípio histórico. A identidade de fé, com reverência.",
    props: 'texto (o versículo como foi dito, até 30 palavras), referencia? ("Provérbios 16:3")',
  },
  {
    nome: "cartoes", foraDe: FORA_DO_VOX, plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [3, 9], eventosDe: "itens", maxItens: 4,
    quando: "A fala lista 2 a 4 coisas do mesmo tipo (opções, erros, barreiras, tipos de cliente). Cada cartão entra quando é dito.",
    props: 'titulo? (até 7 palavras, **destaque**), rotulo?, marca ("x" para erro/barreira, "check" para acerto, "numero", "nenhuma"), itens [{titulo (até 3 palavras), texto? (até 7 palavras), icone? (nome do catálogo de ícones)}]',
  },
  {
    nome: "linha-do-tempo", foraDe: FORA_DO_VOX, plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.7, duracao: [3, 10], eventosDe: "passos", maxItens: 6,
    quando: "Uma sequência no tempo ou N passos em ordem (três passos, as fases, antes/durante/depois, uma história com datas).",
    props: "titulo? (até 7 palavras, **destaque**), passos [{rotulo (até 3 palavras), texto? (até 6 palavras), icone?}]",
  },
  {
    nome: "escada", foraDe: FORA_DO_VOX, plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.7, duracao: [3, 9], eventosDe: "degraus", maxItens: 6,
    quando: "Níveis, evolução, crescimento por etapas, subir de patamar (do zero ao primeiro cliente, de funcionário a dono).",
    props: "titulo? (até 7 palavras, **destaque**), degraus [{rotulo (até 3 palavras)}] (do mais baixo ao mais alto)",
  },
  {
    nome: "comparacao", foraDe: FORA_DO_VOX, plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [3, 8], umEvento: true,
    quando: "Antes e depois, errado e certo, um jeito contra outro. O evento é quando o lado bom é dito.",
    props: "titulo?, esquerda {titulo (até 3 palavras), itens [até 3 textos curtos]}, direita {titulo, itens}",
  },
  {
    nome: "fluxo", foraDe: FORA_DO_VOX, plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.7, duracao: [3, 8], eventosDe: "nos", maxItens: 5,
    quando: "Causa e efeito, um processo (isso leva àquilo, que leva a...).",
    props: "titulo?, nos [{rotulo (até 3 palavras), icone?}]",
  },
  {
    nome: "numero", plano: "tela", entrada: 1.3, saida: 0.3, evento: 0.6, duracao: [2.5, 6],
    quando: "Um número DITO que é o centro do argumento (88%, 3 mil clientes, 12 anos). Conta até o valor.",
    props: 'valor (número), prefixo? ("R$ "), sufixo? ("%", " mil", " anos"), rotulo? (selo), antes? (frase curta antes do número), apoio? (frase depois, **destaque**), fonte? (só se dita), decimais?',
  },
  {
    nome: "barras", plano: "lado", entrada: 2.0, saida: 0.3, evento: 0.6, duracao: [3, 8],
    quando: "Números ditos que se comparam (antes e depois, este ano e o passado). Nunca invente valor: só os ditos.",
    props: 'titulo?, unidade? (" mil", "%"), barras [{rotulo (até 2 palavras), valor (número dito), destaque? (true na barra que importa)}], fonte?, lado? ("esquerda" | "direita")',
  },
  {
    nome: "cifrao", foraDe: FORA_DO_VOX, plano: "tela", entrada: 1.2, saida: 0.3, evento: 0.6, duracao: [2.5, 5],
    quando: "Dinheiro, preço, faturamento, lucro dito num vídeo de negócio ou tecnologia: o símbolo futurista com o valor.",
    props: 'simbolo? ("R$", "$", "%"), valor? (o valor como dito, "R$ 920 milhões"), rotulo? (até 6 palavras), lado? ("centro")',
  },
  {
    nome: "mapa", foraDe: FORA_DO_VOX, plano: "tela", entrada: 0.8, saida: 0.3, evento: 0.7, duracao: [3, 9], eventosDe: "pontos", maxItens: 6,
    quando: "Lugares ditos (cidades, países, de onde para onde), viagem, expansão.",
    props: "titulo?, pontos [{rotulo (nome do lugar), x, y (posição aproximada 0 a 1 num mapa estilizado; oeste à esquerda, norte em cima)}], rota? (true liga os pontos em ordem)",
  },
  {
    nome: "desenho", foraDe: FORA_DO_VOX, plano: "lado", passes: ["frente"], entrada: 0.9, saida: 0.3, evento: 0.6, duracao: [2.5, 6],
    quando: "Algo que nenhuma peça mostra e que um desenho simples mostra (uma cruz, uma balança, uma mesa, uma semente brotando, um gráfico próprio). Você desenha o SVG.",
    props: 'svg (só o miolo, viewBox 0 0 200 200, formas simples: path, rect, circle, ellipse, line, polyline, polygon, g, text; cores ACENTO, CLARO, ESCURO e BRANCO; traço de 4 a 8; sem script, sem imagem, sem link), rotulo? (até 5 palavras, **destaque**), posicao? ("esquerda" | "direita" | "centro")',
  },
  {
    nome: "titulo-atras", foraDe: FORA_DO_VOX, plano: "sobre", passes: ["atras", "vidro", "frente"], entrada: 1.2, saida: 0.3, evento: 0.6, duracao: [2, 5],
    quando: "PROFUNDIDADE: a palavra-tese gigante ATRÁS da pessoa (a pessoa é recortada da gravação e fica na frente do título). Para a ideia central dita com ênfase, quando a pessoa está no meio do quadro e a câmera não mostra objeto. É a peça mais cinematográfica: 1 a cada 1 a 2 min no vídeo longo, 1 no corte (de preferência no gancho ou na virada).",
    props: 'texto (1 ou 2 palavras FORTES do falante, até 12 letras, sem destaque), rotulo? (selo de 1 a 3 palavras), apoio? (até 7 palavras, a frase que completa; **destaque** em 1 ou 2)',
  },
  {
    nome: "passos-foco", foraDe: FORA_DO_VOX, plano: "tela", entrada: 0.8, saida: 0.3, evento: 0.7, duracao: [3.5, 9], eventosDe: "itens", maxItens: 8,
    quando: "A fala percorre N passos, fases ou princípios numerados (os 7 passos, as 5 fases): os blocos numerados em luz, o passo dito acende com o nome e os outros ficam desfocados (o estilo Dan Martell). Prefira a cartoes quando são 4 ou mais.",
    props: "titulo? (até 7 palavras, **destaque**), rotulo?, itens [{rotulo (até 3 palavras), texto? (até 5 palavras)}]",
  },
  {
    nome: "grafico-linha", plano: "tela", entrada: 0.8, saida: 0.3, evento: 0.7, duracao: [3, 8], eventosDe: "pontos", maxItens: 8,
    quando: "Uma EVOLUÇÃO no tempo com números DITOS (o faturamento foi de 12 para 41 mil, a igreja passou de 30 para 300 pessoas): a linha se desenha passando pelos valores, com eixos e marcações. Nunca invente valor; com 2 valores ditos já vale.",
    props: 'titulo? (até 7 palavras, **destaque**), rotulo?, unidade? (" mil", "%", " pessoas"), pontos [{rotulo (quando: "2019", "Jan", "Antes"), valor (número dito)}]',
  },
  {
    nome: "imagem-janela", plano: "sobre", passes: ["frente"], entrada: 0.7, saida: 0.3, evento: 0.6, duracao: [2.5, 5.5],
    quando: "(editor por comando em dois eixos, 05/10) A IMAGEM gerada na Higgsfield numa JANELA ao lado da pessoa, com a moldura da linguagem do vídeo (papel, vidro, neon, luxo, traço). O código liga a imagem (midia); o redator escreve a cena e a legenda.",
    props: 'midia (o id da imagem, posto pelo código), legenda? (até 5 palavras do falante), lado? ("direita" | "esquerda" | "topo")',
  },
  // ─── As peças da lousa (04/10): dos 14 quadros reais do Dan Martell; no consórcio, o acabamento de luxo. ───
  {
    nome: "palavra-gigante", plano: "sobre", estilos: ESTILOS_DA_LOUSA, entrada: 0.9, saida: 0.3, evento: 0.6, duracao: [1.2, 3],
    quando: "O IMPACTO: a palavra mais forte da frase, dita com ênfase (\"estraga TUDO\", \"NUNCA\", \"DOBROU\"). A gravação escurece e desfoca e a palavra ocupa a tela, com a menor apoiada nela. Uma a cada 30 a 60 s; é a peça do soco.",
    props: "palavra (1 palavra do falante, até 9 letras), apoio? (1 ou 2 palavras que vêm antes dela na fala, pequenas)",
  },
  {
    nome: "busca", plano: "tela", estilos: ESTILOS_DA_LOUSA, entrada: 0.6, saida: 0.3, evento: 0.8, duracao: [2.5, 6], umEvento: true,
    quando: "A fala faz uma PERGUNTA ou cita uma busca, uma pesquisa, uma ferramenta de IA (\"o que você pesquisaria\", \"pergunta pro Claude\"): a barra de busca de vidro com a pergunta sendo digitada; o evento (opcional) vira a pílula \"Pensando...\".",
    props: 'texto (a pergunta como foi dita, até 9 palavras), pensando? (false para não pensar, ou o texto da pílula), marca? (a ferramenta citada: "Google", "Claude", "Perplexity"; o ícone oficial entra)',
  },
  {
    nome: "chat", plano: "sobre", estilos: ESTILOS_DA_LOUSA, continua: true, entrada: 0.8, saida: 0.3, evento: 0.6, duracao: [3, 7],
    quando: "A fala dita um PEDIDO para uma IA ou um assistente (\"eu falo pra ele: organiza meus recibos\"), ou mostra como se escreve um prompt: a caixa de chat embaixo, sobre a pessoa, com o texto digitando.",
    props: 'texto (o pedido como foi dito, até 30 palavras), marca? (a IA citada: "Claude", "Gemini"; o nome e o ícone dela entram), rotulo? (a pílula, padrão "Pedir aprovação")',
  },
  {
    nome: "pilha-passos", plano: "tela", estilos: ESTILOS_DA_LOUSA, entrada: 0.6, saida: 0.3, evento: 0.7, duracao: [3.5, 9], eventosDe: "itens", maxItens: 5,
    quando: "A fala ENUMERA passos, camadas, pilares (os 4 passos, a pilha, o método): título com brilho e os losangos numerados em pilha 3D; cada passo acende na palavra dele e ganha a linha com o nome ao lado. Neste estilo, prefira a passos-foco e a cartoes.",
    props: "titulo (até 7 palavras), itens [{rotulo (até 6 palavras)}] (2 a 5)",
  },
  {
    nome: "marca-brilho", plano: "sobre", passes: ["frente"], estilos: ESTILOS_DA_LOUSA, entrada: 1.0, saida: 0.3, evento: 0.6, duracao: [2, 4.5],
    quando: "A fala cita uma MARCA, um produto, uma ferramenta ou o nome de um método: o ícone com brilho e o nome grande ao lado da pessoa. Marca de terceiros citada usa o ícone oficial; a do próprio cliente, a logo (usarLogo).",
    props: 'nome (como foi dito, até 3 palavras), marca? (o nome da marca citada, para o ícone oficial), icone? (ícone genérico do catálogo quando não é marca), usarLogo? (true só para a marca do PRÓPRIO cliente), lado? ("direita" | "esquerda", o lado vazio do quadro)',
  },
  {
    nome: "notebook", plano: "tela", estilos: ESTILOS_DA_LOUSA, entrada: 0.6, saida: 0.3, evento: 0.8, duracao: [3, 8], eventosDe: "campos", maxItens: 4,
    quando: "A fala explica um PROCESSO ou um SISTEMA (o formulário, o pedido, o cadastro, o fluxo da empresa): o notebook em 3D com a tela de um formulário; a cada evento o cursor vai ao campo e o valor é digitado.",
    props: "titulo (o nome do formulário ou do processo, até 5 palavras), subtitulo? (até 9 palavras), campos [{rotulo (até 3 palavras), valor (até 4 palavras, do que foi dito)}] (2 a 4)",
  },
  {
    nome: "ilustracao-traco", plano: "tela", estilos: ESTILOS_DA_LOUSA, entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [2.5, 5],
    quando: "A fala é sobre uma IDEIA, a MENTE, o pensamento, a decisão interior (\"o trabalho de verdade está em você\"): o desenho de traço apagado ao fundo e a frase sendo digitada por cima.",
    props: 'texto (a frase dita, até 8 palavras), desenho ("cerebro" para mente e pensamento, "lampada" para ideia, ou um ícone do catálogo)',
  },
  {
    nome: "material", plano: "tela", estilos: ESTILOS_DA_LOUSA, entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [2.5, 6],
    quando: "A fala oferece um MATERIAL, um e-book, um guia, uma planilha, um curso ou a oferta (\"eu montei um guia\", \"baixe o material\"): a capa com o título gigante e as folhas abrindo em leque atrás.",
    props: "titulo (o nome do material como foi dito, 2 a 4 palavras), icone? (do catálogo: documento, livro, grafico, cadeado, chave), marca?",
  },
  {
    nome: "seguir", plano: "tela", estilos: ESTILOS_DA_LOUSA, entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [3, 6],
    quando: "A CHAMADA PARA SEGUIR no fechamento (\"me segue\", \"manda DM com a palavra\"): o celular com o perfil do PRÓPRIO cliente e a pílula da chamada. Só com o @ do cliente (dito na fala ou nos links dele); nunca o perfil de outra pessoa.",
    props: 'arroba (o @ do cliente), nome? (o nome do cliente), chamada (a chamada como foi dita, até 14 palavras), rede? ("Instagram", "TikTok", "YouTube"), bio? (até 12 palavras, só o que é verdade do cliente)',
  },
  {
    nome: "ferramentas", plano: "tela", estilos: ESTILOS_DA_LOUSA, entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [2.5, 7], eventosDe: "itens", maxItens: 4,
    quando: "A fala cita 2 a 4 FERRAMENTAS ou apps (\"eu uso Notion, Drive e Obsidian\"): cada uma numa placa com moldura cromada (dourada no luxo), entrando quando é dita, com o ícone oficial da marca.",
    props: "itens [{marca (o nome da ferramenta como foi dito), icone? (genérico, quando não é marca), rotulo? (até 2 palavras), usarLogo? (só a do próprio cliente)}]",
  },
  // As camadas de apoio da lousa: o resolvedor põe, o editor não escreve.
  {
    nome: "legenda-destaque", plano: "sobre", passes: ["frente"], estilos: ESTILOS_DA_LOUSA, entrada: 0.14, saida: 0.12, evento: 0.35, duracao: [0.4, 6], umEvento: true,
    quando: "(automática) a legenda da lousa: a frase em negrito embaixo com UMA palavra sublinhada.",
    props: "texto (com **a palavra-chave**)",
  },
  {
    nome: "grade-azul", plano: "sobre", passes: ["frente"], estilos: ESTILOS_DA_LOUSA, entrada: 0.2, saida: 0.2, evento: 0.5, duracao: [0.5, 8],
    quando: "(automática) a grade de cor escura do estilo por cima do B-roll.",
    props: "nenhuma",
  },
  // ─── As peças do Vox (04/10): do quadro de treino vox-01 do dono; fotos de arquivo geradas e recortadas (recortes-vox.ts). ───
  {
    nome: "colagem", plano: "tela", estilos: ESTILOS_DO_VOX, entrada: 0.6, saida: 0.3, evento: 0.5, duracao: [3.5, 8], eventosDe: "recortes", maxItens: 3,
    quando: "A PEÇA-MÃE do Vox: FATO HISTÓRICO, ORIGEM, PERSONAGEM, LUGAR, ÉPOCA, o contexto de uma história. A colagem em camadas com profundidade (parallax): papel envelhecido, manuscrito ao fundo, mapa antigo recortado com o círculo vermelho (se há lugar dito), 1 a 3 FOTOS DE ARQUIVO em P&B recortadas com borda de papel e sombra (cada uma cai na palavra dela), o título serifado preto no marca-texto amarelo, o fio vermelho ligando dois recortes e o carimbo. 1 a 2 por corte, 1 a cada 40 a 60 s no longo.",
    props: 'titulo (2 a 5 palavras do falante, entra no marca-texto amarelo), recortes [{assunto ("figura" pessoa anônima de época, "estatua", "predio", "objeto", "documento", "lugar"), descricao (EM INGLÊS, o que a foto de arquivo mostra, concreta: "an ancient stone house with a wooden door", "a 1900s clay water jar"; NUNCA nome de pessoa real), censura? (true só em estatua ou figura e só quando a fala é polêmica: a tarja amarela nos olhos)}] (1 a 3; prefira os que recortam bem, figura, estatua, predio e objeto; "lugar" entra só como cópia fotográfica pequena, no máximo 1), mapa? {lugar (o lugar DITO), x, y (0 a 1 no mapa)}, carimbo? (1 ou 2 palavras do falante: "Proibido", "Escolhido"), ligar? (true: o fio vermelho entre os dois primeiros recortes, quando a fala liga duas coisas)',
  },
  {
    nome: "jornal", plano: "tela", estilos: ESTILOS_DO_VOX, entrada: 0.6, saida: 0.3, evento: 0.5, duracao: [3, 7], umEvento: true,
    quando: "NOTÍCIA, ACONTECIMENTO, DECLARAÇÃO, RECLAMAÇÃO, CITAÇÃO ou VERSÍCULO que vira manchete (no versículo, a manchete é o trecho dito e \"data\" é a referência, \"Lucas 10:42\") (\"ele disse que...\", \"saiu que...\", a frase dita como se fosse capa): o recorte de JORNAL RASGADO com a manchete serifada, colunas ilegíveis e a foto de arquivo saltando do papel para a frente. O evento é o marca-texto amarelo correndo no destaque da manchete.",
    props: 'manchete (até 9 palavras, as do falante, **destaque** em 2 ou 3), apoio? (até 8 palavras, o subtítulo), data? (só lugar ou data DITOS), foto? {assunto, descricao (inglês)}',
  },
  {
    nome: "mapa-antigo", plano: "tela", estilos: ESTILOS_DO_VOX, entrada: 0.6, saida: 0.3, evento: 0.7, duracao: [3, 7], umEvento: true,
    quando: "LUGAR dito (cidade, região, país, de onde veio, onde aconteceu): o mapa antigo rasgado ocupa a tela, a câmera chega no ponto e o CÍRCULO VERMELHO se desenha no evento, com o nome numa tira de papel; a foto do lugar pode cair ao lado.",
    props: 'lugar (o nome dito), x, y (0 a 1, onde fica no mapa; aproximado), titulo? (2 a 4 palavras, marca-texto), foto? {assunto: "lugar" ou "predio", descricao (inglês)}',
  },
  {
    nome: "cronologia", plano: "tela", estilos: ESTILOS_DO_VOX, entrada: 0.6, saida: 0.3, evento: 0.7, duracao: [3.5, 8], eventosDe: "marcos", maxItens: 5,
    quando: "DATAS, ÉPOCAS, a ordem dos acontecimentos, \"antes e depois\" no tempo, uma história com anos: a LINHA DO TEMPO em tira de papel com régua de tinta; a câmera anda até cada marco na palavra dele, o ano ganha o marcador amarelo e a foto de arquivo do marco cai pendurada.",
    props: 'titulo? (2 a 5 palavras, marca-texto), marcos [{ano (o ano ou a época DITA: "1923", "século I", "Antes"), rotulo (2 a 4 palavras), foto? {assunto, descricao (inglês)}}] (2 a 5)',
  },
  {
    nome: "censura", plano: "tela", estilos: ESTILOS_DO_VOX, entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [2.5, 6], umEvento: true,
    quando: "POLÊMICA, TABU, o que \"ninguém fala\", o proibido, a verdade incômoda, a crítica, a REVELAÇÃO: a estátua (ou figura anônima de época) grande e a TARJA AMARELA de censura que BATE sobre os olhos no evento, com tremor e carimbo. Sempre que a fala tem polêmica, 1 por corte. Nunca em pessoa real.",
    props: 'figura {assunto ("estatua" ou "figura"), descricao (inglês: "a generic marble bust of an ancient philosopher"; NUNCA pessoa real ou estátua de pessoa real)}, titulo? (2 a 5 palavras do falante, marca-texto), palavra? (o carimbo: 1 ou 2 palavras, "Censurado", "Tabu", "Proibido")',
  },
  {
    nome: "marca-texto", plano: "sobre", passes: ["frente"], estilos: ESTILOS_DO_VOX, entrada: 0.5, saida: 0.25, evento: 0.6, duracao: [1.5, 4],
    quando: "A FRASE-CHAVE, o NÚMERO dito ou a definição sobre a pessoa: o texto serifado preto na faixa AMARELA de marca-texto que corre (o título da referência). O ritmo entre as telas de papel; nunca a frase inteira.",
    props: 'texto (2 a 5 palavras do falante, curtas; o número como foi dito), posicao? ("topo" acima da cabeça | "centro" no peito)',
  },
  {
    nome: "carimbo", plano: "sobre", passes: ["frente"], estilos: ESTILOS_DO_VOX, entrada: 0.4, saida: 0.25, evento: 0.6, duracao: [1.2, 3],
    quando: "A palavra de VEREDITO dita com força (\"proibido\", \"errado\", \"aprovado\", \"mentira\"): o carimbo vermelho que BATE no quadro, sobre a pessoa.",
    props: 'texto (1 ou 2 palavras do falante), lado? ("direita" | "esquerda", o lado vazio)',
  },
  // O CENÁRIO TROCADO (05/10, noite): o resolvedor põe SÓ quando o comando pediu com todas as letras para trocar o fundo
  // (linguagem.cenario === "trocado"); o editor não escreve. Desenhado na linguagem do vídeo: a imagem gerada do cenário
  // pedido (props.url) ou, sem ela, a colagem de papel (papel) ou o fundo da marca.
  {
    nome: "fundo-colagem", plano: "sobre", passes: ["atras"], entrada: 0.05, saida: 0.05, evento: 0.5, duracao: [0.6, 600],
    quando: "(automática) o cenário atrás da pessoa recortada, só quando o comando pediu para trocar o fundo.",
    props: "nenhuma",
  },
  // A CHAMADA DE CURTIR E INSCREVER (05/10, noite): o JEV escolhe os momentos (2 a 3 num vídeo longo, perto de um momento
  // forte, nunca nos primeiros 15 s), só nos vídeos com destino YouTube. Desenhada em código, na linguagem do vídeo.
  {
    nome: "inscrever", plano: "sobre", passes: ["frente"], entrada: 0.7, saida: 0.35, evento: 0.6, duracao: [3, 5], umEvento: true,
    quando: "(automática) a animação de curtir e se inscrever sobre a gravação, perto de um momento forte; o evento é o clique.",
    props: 'chamada? (até 4 palavras), lado? ("direita" | "esquerda")',
  },
  // ─── AS PEÇAS DE CONTEXTO (06/10): o editor decide pelo contexto do vídeo inteiro (leitura-no-plano.ts). O JEV escolhe o tipo
  // por momento só quando a leitura do trecho permite (duas pessoas, tela ou quadro, pessoa nomeada); o resolvedor põe a caixa
  // (props.caixa, fração do quadro) na área livre do trecho, nunca sobre rosto, tela ou quadro. Desenhadas na linguagem do vídeo
  // (worker/remotion/src/sob-medida/pecas/contexto.tsx), nunca condicionadas a um estilo.
  {
    nome: "nome-de-quem-fala", plano: "sobre", entrada: 0.8, saida: 0.3, evento: 0.6, duracao: [2.5, 5],
    quando: "(contexto) o nome e o papel de quem está falando, numa tarja no terço inferior perto da pessoa (conversa, podcast, entrevista, apresentação).",
    props: "nome (o nome de quem fala, como a leitura do vídeo ou a fala diz; nunca inventado), papel? (até 5 palavras: o cargo, o ofício ou o que a pessoa é no vídeo)",
  },
  {
    nome: "realce-de-quem-fala", plano: "sobre", passes: ["frente"], entrada: 0.5, saida: 0.3, evento: 0.5, duracao: [2, 6],
    quando: "(contexto) com duas ou mais pessoas em cena, a moldura acesa em volta de quem fala; ninguém escurece. O código põe a caixa de quem fala.",
    props: "rotulo? (até 3 palavras, opcional: o nome ou o papel de quem fala)",
  },
  {
    nome: "zoom-no-ponto", plano: "sobre", passes: ["frente"], entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [2.5, 6],
    quando: "(contexto) a câmera aproxima a região da tela compartilhada ou do quadro que a fala explica, com a moldura na região. O código mede a região e o zoom.",
    props: "rotulo? (até 4 palavras do falante sobre o que se vê)",
  },
  {
    nome: "destaque-na-tela", plano: "sobre", passes: ["frente"], entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [2, 5],
    quando: "(contexto) a moldura ou o realce em volta da região da tela ou do quadro que a fala nomeia, sem aproximar a câmera. O código mede a região.",
    props: "rotulo? (até 4 palavras do falante)",
  },
  {
    nome: "cartao-de-passo", plano: "sobre", entrada: 0.9, saida: 0.3, evento: 0.6, duracao: [2.5, 6],
    quando: "(contexto) um cartão pequeno na área livre: o passo numerado, o ingrediente com a quantidade dita, ou o lugar (demonstração, receita, tutorial, vlog).",
    props: 'numero? ("1", "2": só se a fala numera), titulo (até 4 palavras: o passo, o ingrediente, o lugar), texto? (até 8 palavras: a quantidade, o detalhe dito), icone? (nome do catálogo de ícones)',
  },
  {
    nome: "frase-chave", plano: "sobre", entrada: 0.9, saida: 0.3, evento: 0.6, duracao: [3, 7],
    quando: "(contexto) a frase inteira que resume o ponto, num cartão na área livre, enquanto a pessoa segue falando (palestra, aula, sermão).",
    props: "texto (a frase dita, até 14 palavras, **destaque** em 1 a 3), autor? (só se a fala atribui a alguém)",
  },
  {
    nome: "slide", plano: "tela", entrada: 0.7, saida: 0.3, evento: 0.6, duracao: [3.5, 9], eventosDe: "itens", maxItens: 4,
    quando: "(contexto) um slide ao lado da pessoa, na folha da área livre: o título do ponto e 2 a 4 itens que a fala percorre (o item dito acende). Palestra e aula.",
    props: "rotulo? (selo, 1 a 3 palavras), titulo (até 6 palavras, **destaque**), itens [{texto (até 6 palavras)}] (2 a 4, só o que a fala diz, na ordem dita)",
  },
  // A PEÇA COMBINADA (06/10): o vídeo de IA ao fundo (inserção em vídeo, ligada por `fundo`) e esta camada exata por cima,
  // desenhada em código na linguagem do vídeo (worker/remotion/src/sob-medida/pecas/combinadas.tsx). O código liga o fundo,
  // o tipo do fundo e a ligação (decididos pelo JEV); o redator escreve as etiquetas, o título, o número e a cena do fundo.
  // Sem o vídeo pronto, a peça cai na folha sobre a gravação com o fundo próprio dela (lib/media/editor-por-comando/resolver.ts).
  {
    nome: "camada-exata", plano: "tela", entrada: 0.9, saida: 0.35, evento: 0.7, duracao: [3.5, 5], eventosDe: "itens", maxItens: 5,
    quando: "(editor por comando, 06/10) a camada exata sobre o vídeo de fundo gerado: os pontos ou alfinetes com as etiquetas dos itens ditos (lugares, pessoas, partes), a linha da rota ou o fio ligando, o número dito. Cada item acende quando é dito.",
    props: 'itens [{rotulo (até 3 palavras: o lugar, a pessoa ou a parte que a fala cita)}] (2 a 5, na ordem dita), titulo? (até 5 palavras do falante), numero? {valor (só o número DITO), prefixo?, sufixo?, rotulo? (até 3 palavras)}',
  },
  {
    nome: "fecho", plano: "tela", entrada: 1.2, saida: 0.4, evento: 0.6, duracao: [3, 6],
    quando: "As últimas palavras do vídeo (a chamada final): a marca do cliente, a frase final e a chamada para ação dita.",
    props: "marca (o nome do projeto, se não houver logo), titulo (a frase final, até 8 palavras, **destaque**), rotulo?, chamada? (o que foi pedido: inscrever-se, comentar, o site dito)",
  },
];

export const FICHAS: Record<string, FichaDaPeca> = Object.fromEntries(PECAS.map((p) => [p.nome, p]));

/** A ficha vale no estilo (sem `estilos`, vale em todos). */
export const pecaNoEstilo = (f: FichaDaPeca, estiloId: string | null | undefined) =>
  (!f.estilos || f.estilos.includes(String(estiloId ?? ""))) && !(f.foraDe ?? []).includes(String(estiloId ?? ""));

/**
 * O catálogo como texto para o prompt: só as peças do estilo, sem as camadas
 * de apoio (o resolvedor as põe). Sem o estilo, as peças da lousa vão
 * marcadas como dela.
 */
export function catalogoNoPrompt(estiloId?: string | null): string {
  const comEstilo = estiloId !== undefined;
  const grupo = (pl: PlanoDaPeca, titulo: string) =>
    `${titulo}\n` +
    // A camada exata da combinada (06/10) é só do editor por comando: o código liga o vídeo de fundo dela.
    PECAS.filter((p) => p.plano === pl && !CAMADAS_DE_APOIO.has(p.nome) && p.nome !== "camada-exata" && (!comEstilo || pecaNoEstilo(p, estiloId)))
      .map((p) => `- ${p.nome}${!comEstilo && p.estilos ? ` [só nos estilos ${p.estilos.join(" e ")}]` : ""} (${p.duracao[0]} a ${p.duracao[1]} s${p.eventosDe ? `; um evento por item de "${p.eventosDe}"` : p.umEvento ? "; um evento" : ""}): ${p.quando}\n    props: ${p.props}`)
      .join("\n");
  return [
    grupo("sobre", "PEÇAS SOBRE A PESSOA (ela continua cheia na tela):"),
    grupo("lado", "PEÇAS AO LADO (a pessoa vai para um cartão do outro lado):"),
    grupo("tela", "PEÇAS DE TELA CHEIA (a peça ocupa a tela sobre o fundo da marca; a voz continua; no máximo 8 s; depois o rosto volta):"),
  ].join("\n\n");
}
