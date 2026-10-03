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
};

export const PECAS: FichaDaPeca[] = [
  {
    nome: "titulo", plano: "sobre", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [2, 6],
    quando: "A ideia central de um trecho, a promessa, a tese dita em outras palavras. A peça mais usada.",
    props: 'rotulo? (2 a 4 palavras, caixa alta no selo), titulo (até 8 palavras; **destaque** em 1 a 3 palavras), apoio? (até 12 palavras), posicao? ("topo-esquerda" | "topo" | "centro")',
  },
  {
    nome: "capitulo", plano: "sobre", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [2.5, 7],
    quando: "Começo de uma parte nova do vídeo (passo 1, passo 2; o próximo tópico). Numera a estrutura.",
    props: 'numero ("1", "2"...), titulo (até 6 palavras, **destaque**)',
  },
  {
    nome: "rotulo-inferior", plano: "sobre", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [2.5, 5],
    quando: "Quem fala (no começo), ou o nome de um lugar, pessoa citada ou ferramenta mostrada.",
    props: "nome (até 4 palavras, **destaque**), descricao? (até 8 palavras)",
  },
  {
    nome: "palavra-chave", plano: "sobre", entrada: 0.45, saida: 0.25, evento: 0.6, duracao: [1, 2.5],
    quando: "Uma palavra forte dita com ênfase (ritmo entre peças maiores). Com moderação.",
    props: 'texto (1 ou 2 palavras), lado? ("esquerda" | "direita")',
  },
  {
    nome: "sublinhado", plano: "sobre", entrada: 0.4, saida: 0.25, evento: 0.6, duracao: [1.2, 3],
    quando: "Uma palavra ou expressão curta escrita sobre o peito da pessoa, com a faixa da marca correndo por baixo.",
    props: 'texto (1 a 3 palavras), lado? ("esquerda" | "centro" | "direita")',
  },
  {
    nome: "pergunta-resposta", plano: "sobre", entrada: 0.6, saida: 0.3, evento: 0.5, duracao: [2.5, 6], umEvento: true,
    quando: "Uma objeção ou pergunta que a fala responde. O evento é quando a resposta é dita.",
    props: "pergunta (até 6 palavras), resposta (até 7 palavras)",
  },
  {
    nome: "seta", plano: "sobre", entrada: 0.7, saida: 0.3, evento: 0.6, duracao: [1.5, 4],
    quando: "A pessoa mostra ou aponta algo NA GRAVAÇÃO (um objeto, um lugar): a seta liga o rótulo ao que se vê. Use os quadros para saber onde.",
    props: "de {x,y} (onde fica o rótulo, fração do quadro 0 a 1), para {x,y} (o que é mostrado), rotulo? (até 4 palavras)",
  },
  {
    nome: "circulo", plano: "sobre", entrada: 0.65, saida: 0.3, evento: 0.6, duracao: [1.5, 4],
    quando: "Destacar um ponto da imagem que a fala nomeia (um objeto na mesa, um detalhe).",
    props: "x, y (centro, fração do quadro), raio (0,05 a 0,3), rotulo? (até 4 palavras)",
  },
  {
    nome: "icone", plano: "sobre", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [2, 5],
    quando: "Um objeto concreto da fala vira ícone grande com rótulo (tempo, dinheiro, igreja, família, alvo).",
    props: 'nome (um destes: dinheiro, cifrao, carteira, cofre, relogio, ampulheta, pessoas, pessoa, foguete, alvo, sobe, cai, grafico, cruz, livro, biblia, coracao, raio, cadeado, casa, mundo, check, x, lampada, megafone, calendario, escudo, coroa, chave, aperto, estrela, igreja, mensagem, telefone, carrinho, ferramenta, mapa, bussola, montanha, semente, fogo, trofeu, maleta, loja, predio, computador, video, camera, microfone, olho, cerebro, balanca, presente, pao, peixe, barco, oracao, luz, agua, caminho, alerta, pergunta, ideia, tempo, documento, contrato, email, rede), rotulo (até 6 palavras, **destaque**), apoio? (até 8 palavras), posicao? ("direita" | "topo-esquerda" | "topo")',
  },
  {
    nome: "painel-lateral", plano: "lado", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [3, 10], eventosDe: "itens", maxItens: 5,
    quando: "Uma sublista curta ou definição enquanto a pessoa explica: o painel de um lado, a pessoa em cartão do outro. Cada item acende quando é dito.",
    props: 'lado ("esquerda" | "direita"), rotulo? (selo), titulo (até 6 palavras, **destaque**), itens? [{texto (até 6 palavras)}], apoio?',
  },
  {
    nome: "checklist", plano: "lado", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [3, 10], eventosDe: "itens", maxItens: 6,
    quando: "Uma lista de coisas a fazer ou critérios, marcados um a um quando ditos.",
    props: 'titulo? (até 6 palavras), itens [{texto (até 6 palavras)}], lado? ("esquerda" | "direita")',
  },
  {
    nome: "progresso", plano: "lado", entrada: 1.1, saida: 0.3, evento: 0.6, duracao: [2.5, 6],
    quando: "Uma porcentagem DITA (70% das pessoas...). O anel enche até o número.",
    props: 'valor (0 a 100, o número dito), sufixo? ("%"), rotulo (até 8 palavras), lado? ("esquerda" | "direita")',
  },
  {
    nome: "frase-impacto", plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [1.8, 4],
    quando: "A frase mais forte do trecho, a tese, a virada. Tela inteira, 1 ou 2 vezes por vídeo curto, 3 a 6 no longo.",
    props: "texto (até 7 palavras, **destaque** em 1 ou 2), apoio? (até 10 palavras)",
  },
  {
    nome: "citacao", plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [3, 7],
    quando: "Alguém é citado (um autor, um mentor, um versículo dito como citação).",
    props: "texto (a frase dita, até 22 palavras, **destaque**), autor? (nome ou referência)",
  },
  {
    nome: "pergaminho", plano: "tela", entrada: 1.1, saida: 0.3, evento: 0.6, duracao: [3.5, 8],
    quando: "Versículo bíblico lido ou citado, palavra antiga, princípio histórico. A identidade de fé, com reverência.",
    props: 'texto (o versículo como foi dito, até 30 palavras), referencia? ("Provérbios 16:3")',
  },
  {
    nome: "cartoes", plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [3, 9], eventosDe: "itens", maxItens: 4,
    quando: "A fala lista 2 a 4 coisas do mesmo tipo (opções, erros, barreiras, tipos de cliente). Cada cartão entra quando é dito.",
    props: 'titulo? (até 7 palavras, **destaque**), rotulo?, marca ("x" para erro/barreira, "check" para acerto, "numero", "nenhuma"), itens [{titulo (até 3 palavras), texto? (até 7 palavras), icone? (nome do catálogo de ícones)}]',
  },
  {
    nome: "linha-do-tempo", plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.7, duracao: [3, 10], eventosDe: "passos", maxItens: 6,
    quando: "Uma sequência no tempo ou N passos em ordem (três passos, as fases, antes/durante/depois, uma história com datas).",
    props: "titulo? (até 7 palavras, **destaque**), passos [{rotulo (até 3 palavras), texto? (até 6 palavras), icone?}]",
  },
  {
    nome: "escada", plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.7, duracao: [3, 9], eventosDe: "degraus", maxItens: 6,
    quando: "Níveis, evolução, crescimento por etapas, subir de patamar (do zero ao primeiro cliente, de funcionário a dono).",
    props: "titulo? (até 7 palavras, **destaque**), degraus [{rotulo (até 3 palavras)}] (do mais baixo ao mais alto)",
  },
  {
    nome: "comparacao", plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.6, duracao: [3, 8], umEvento: true,
    quando: "Antes e depois, errado e certo, um jeito contra outro. O evento é quando o lado bom é dito.",
    props: "titulo?, esquerda {titulo (até 3 palavras), itens [até 3 textos curtos]}, direita {titulo, itens}",
  },
  {
    nome: "fluxo", plano: "tela", entrada: 0.6, saida: 0.3, evento: 0.7, duracao: [3, 8], eventosDe: "nos", maxItens: 5,
    quando: "Causa e efeito, um processo (isso leva àquilo, que leva a...).",
    props: "titulo?, nos [{rotulo (até 3 palavras), icone?}]",
  },
  {
    nome: "numero", plano: "tela", entrada: 1.3, saida: 0.3, evento: 0.6, duracao: [2.5, 6],
    quando: "Um número DITO que é o centro do argumento (88%, 3 mil clientes, 12 anos). Conta até o valor.",
    props: 'valor (número), prefixo? ("R$ "), sufixo? ("%", " mil", " anos"), rotulo? (selo), antes? (frase curta antes do número), apoio? (frase depois, **destaque**), fonte? (só se dita), decimais?',
  },
  {
    nome: "barras", plano: "lado", entrada: 1.2, saida: 0.3, evento: 0.6, duracao: [3, 8],
    quando: "Números ditos que se comparam (antes e depois, este ano e o passado). Nunca invente valor: só os ditos.",
    props: 'titulo?, unidade? (" mil", "%"), barras [{rotulo (até 2 palavras), valor (número dito), destaque? (true na barra que importa)}], fonte?, lado? ("esquerda" | "direita")',
  },
  {
    nome: "cifrao", plano: "tela", entrada: 1.2, saida: 0.3, evento: 0.6, duracao: [2.5, 5],
    quando: "Dinheiro, preço, faturamento, lucro dito num vídeo de negócio ou tecnologia: o símbolo futurista com o valor.",
    props: 'simbolo? ("R$", "$", "%"), valor? (o valor como dito, "R$ 920 milhões"), rotulo? (até 6 palavras), lado? ("centro")',
  },
  {
    nome: "mapa", plano: "tela", entrada: 0.8, saida: 0.3, evento: 0.7, duracao: [3, 9], eventosDe: "pontos", maxItens: 6,
    quando: "Lugares ditos (cidades, países, de onde para onde), viagem, expansão.",
    props: "titulo?, pontos [{rotulo (nome do lugar), x, y (posição aproximada 0 a 1 num mapa estilizado; oeste à esquerda, norte em cima)}], rota? (true liga os pontos em ordem)",
  },
  {
    nome: "desenho", plano: "lado", entrada: 0.8, saida: 0.3, evento: 0.6, duracao: [2.5, 6],
    quando: "Algo que nenhuma peça mostra e que um desenho simples mostra (uma cruz, uma balança, uma mesa, uma semente brotando, um gráfico próprio). Você desenha o SVG.",
    props: 'svg (só o miolo, viewBox 0 0 200 200, formas simples: path, rect, circle, ellipse, line, polyline, polygon, g, text; cores ACENTO, CLARO, ESCURO e BRANCO; traço de 4 a 8; sem script, sem imagem, sem link), rotulo? (até 5 palavras, **destaque**), posicao? ("esquerda" | "direita" | "centro")',
  },
  {
    nome: "fecho", plano: "tela", entrada: 1.2, saida: 0.4, evento: 0.6, duracao: [3, 6],
    quando: "As últimas palavras do vídeo (a chamada final): a marca do cliente, a frase final e a chamada para ação dita.",
    props: "marca (o nome do projeto, se não houver logo), titulo (a frase final, até 8 palavras, **destaque**), rotulo?, chamada? (o que foi pedido: inscrever-se, comentar, o site dito)",
  },
];

export const FICHAS: Record<string, FichaDaPeca> = Object.fromEntries(PECAS.map((p) => [p.nome, p]));

/** O catálogo como texto para o prompt. */
export function catalogoNoPrompt(): string {
  const grupo = (pl: PlanoDaPeca, titulo: string) =>
    `${titulo}\n` +
    PECAS.filter((p) => p.plano === pl)
      .map((p) => `- ${p.nome} (${p.duracao[0]} a ${p.duracao[1]} s${p.eventosDe ? `; um evento por item de "${p.eventosDe}"` : p.umEvento ? "; um evento" : ""}): ${p.quando}\n    props: ${p.props}`)
      .join("\n");
  return [
    grupo("sobre", "PEÇAS SOBRE A PESSOA (ela continua cheia na tela):"),
    grupo("lado", "PEÇAS AO LADO (a pessoa vai para um cartão do outro lado):"),
    grupo("tela", "PEÇAS DE TELA CHEIA (a peça ocupa a tela sobre o fundo da marca; a voz continua; no máximo 8 s; depois o rosto volta):"),
  ].join("\n\n");
}
