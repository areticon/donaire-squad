import type { PerguntaDoJev, RespostaDoJev } from "@/lib/jev/cliente";
import { CRITERIO_DO_TIPO, NOME_DO_TIPO, type TipoDeElemento } from "@/lib/media/editor-por-comando/elementos";

/**
 * O PEDIDO DO CLIENTE NUMA CENA É LEI (06/10/2026, 02h20; pedido do Bruno:
 * "se o cliente pegar uma cena do corte ou do completo e escrever 'quero que
 * a bola de futebol apareça na tela, no meio do vídeo, com a letra verde',
 * por mais louco que seja, o cliente sabe por que está pedindo: tem que
 * aparecer a bola com o negócio verde naquele exato momento. Garanta isso.").
 *
 * Este módulo é PURO (sem banco, sem rede, sem IA): ele monta as perguntas
 * que o JEV responde sobre um pedido, traduz as respostas na interpretação
 * do pedido, tem a reserva por palavras para quando o JEV não está, e
 * descreve o pedido em português para a linha que o cliente aprova.
 *
 *   - O JEV decide (uma pergunta por item, nunca regex quando ele está): o
 *     TIPO do elemento entre os tipos possíveis do trecho, a FORMA (janela ou
 *     tela cheia), ONDE (canto, acima da cabeça, ao lado, centro), e se o
 *     pedido traz COR, TAMANHO, TEXTO LITERAL ou pede MAIS TEMPO.
 *   - O que o JEV diz vale como obrigação do momento (plano-pelo-jev.ts): o
 *     candidato ganha p = 1, as outras escolhas obedecem, o ritmo e o
 *     dinheiro não derrubam o pedido.
 *   - A interpretação vira `props.pedidoDoCliente` da peça (resolver.ts e o
 *     worker leem): a cor pedida sobrepõe a da marca SÓ nessa peça, o
 *     tamanho e a posição também. Nada aqui conhece o nome de um estilo.
 */

export type OndeDoPedido = "canto" | "acima-da-cabeca" | "ao-lado" | "centro";
export type TamanhoDoPedido = "pequeno" | "normal" | "grande";

export type PedidoDoCliente = {
  /** O pedido como o cliente escreveu. */
  pedido: string;
  /** O que deve aparecer, nas palavras do cliente (o pedido sem a parte de cor, tamanho e lugar quando dá para separar). */
  descricaoVisual: string;
  /** O tipo de elemento decidido pelo JEV ("nada" = o cliente pediu a cena limpa). */
  tipo: TipoDeElemento;
  forma: "janela" | "tela-cheia";
  /** Onde o elemento fica; null: o JEV não viu preferência, vale a escolha de sempre. */
  posicao: OndeDoPedido | null;
  /** A cor pedida, em hex, e o nome como o cliente disse ("verde"). */
  cor?: string;
  corNome?: string;
  tamanho?: TamanhoDoPedido;
  /** A frase literal que o cliente quer ver escrita, quando ele a deu entre aspas. */
  texto?: string;
  /** O cliente pediu que fique mais tempo na tela. */
  maisTempo?: boolean;
  /** Quem interpretou: o JEV, ou a reserva por palavras (sem JEV). */
  origem: "jev" | "reserva";
};

/** O que fica nas props da peça e na inserção (o worker e a tela leem; nunca o pedido inteiro de novo). */
export type PedidoNasProps = {
  pedido: string;
  descricaoVisual: string;
  cor?: string;
  corNome?: string;
  tamanho?: TamanhoDoPedido;
  posicao?: OndeDoPedido;
  texto?: string;
};

export function pedidoNasProps(p: PedidoDoCliente): PedidoNasProps {
  return {
    pedido: p.pedido.slice(0, 200),
    descricaoVisual: p.descricaoVisual.slice(0, 200),
    ...(p.cor ? { cor: p.cor, corNome: p.corNome } : {}),
    ...(p.tamanho && p.tamanho !== "normal" ? { tamanho: p.tamanho } : {}),
    ...(p.posicao ? { posicao: p.posicao } : {}),
    ...(p.texto ? { texto: p.texto.slice(0, 120) } : {}),
  };
}

/** Lê o pedido guardado nas props de uma peça (ou de uma inserção), com a forma conferida. */
export function pedidoDasProps(props: Record<string, unknown> | null | undefined): PedidoNasProps | null {
  const v = props?.pedidoDoCliente;
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.pedido !== "string" || !o.pedido.trim()) return null;
  const cor = typeof o.cor === "string" && /^#[0-9a-f]{6}$/i.test(o.cor) ? o.cor : undefined;
  return {
    pedido: o.pedido,
    descricaoVisual: typeof o.descricaoVisual === "string" ? o.descricaoVisual : o.pedido,
    ...(cor ? { cor, corNome: typeof o.corNome === "string" ? o.corNome : undefined } : {}),
    ...(o.tamanho === "grande" || o.tamanho === "pequeno" ? { tamanho: o.tamanho } : {}),
    ...(ONDES.includes(o.posicao as OndeDoPedido) ? { posicao: o.posicao as OndeDoPedido } : {}),
    ...(typeof o.texto === "string" && o.texto.trim() ? { texto: o.texto } : {}),
  };
}

// ─────────────────────────────── as cores ───────────────────────────────

/**
 * As cores que o cliente nomeia, em hex. É uma tabela de PALAVRAS da língua
 * (o JEV escolhe o nome; o código dá o número), não uma regra de estilo. Um
 * hex escrito no pedido ("#1a73e8") vale por cima de tudo.
 */
export const CORES_NOMEADAS: Record<string, string> = {
  verde: "#22c55e",
  vermelho: "#ef4444",
  azul: "#3b82f6",
  amarelo: "#facc15",
  laranja: "#f97316",
  rosa: "#ec4899",
  roxo: "#a855f7",
  dourado: "#d4af37",
  prata: "#c0c0c0",
  preto: "#111111",
  branco: "#ffffff",
  cinza: "#9ca3af",
  marrom: "#8b5a2b",
  turquesa: "#06b6d4",
  bege: "#e7d8b1",
};

const NOMES_DE_COR = Object.keys(CORES_NOMEADAS);

/** Variações que o cliente escreve para cada nome ("verdinho", "vermelha", "dourada", "azul-marinho"). */
const RAIZ_DA_COR: Array<[RegExp, string]> = [
  [/\bverd/i, "verde"],
  [/\bvermelh/i, "vermelho"],
  [/\bazul/i, "azul"],
  [/\bamarel/i, "amarelo"],
  [/\blaranj/i, "laranja"],
  [/\bros[ae]\b|\brosinha|\bpink\b/i, "rosa"],
  [/\brox|\blil[aá]s|\bviolet/i, "roxo"],
  [/\bdourad|\bouro\b|\bgold/i, "dourado"],
  [/\bprat[ae]|\bprateado/i, "prata"],
  [/\bpret[ao]\b/i, "preto"],
  [/\bbranc[ao]\b/i, "branco"],
  [/\bcinz/i, "cinza"],
  [/\bmarrom|\bmarrons\b/i, "marrom"],
  [/\bturques|\bciano|\bazul[- ]piscina/i, "turquesa"],
  [/\bbege\b|\bcreme\b/i, "bege"],
];

/** O hex escrito no pedido, ou a cor nomeada que o texto traz (a reserva e a confirmação do que o JEV escolheu). */
export function corNoTexto(pedido: string): { cor: string; nome: string } | null {
  const hex = pedido.match(/#([0-9a-f]{6})\b/i);
  if (hex) return { cor: `#${hex[1].toLowerCase()}`, nome: `#${hex[1].toLowerCase()}` };
  for (const [re, nome] of RAIZ_DA_COR) if (re.test(pedido)) return { cor: CORES_NOMEADAS[nome], nome };
  return null;
}

// ─────────────────────────────── a reserva por palavras (sem JEV) ───────────────────────────────

export const ONDES: OndeDoPedido[] = ["canto", "acima-da-cabeca", "ao-lado", "centro"];

/** "sem efeito", "deixa limpo", "só eu": o cliente pediu a cena sem nada. */
export function pedeNada(pedido: string): boolean {
  return /sem efeito|sem pe[cç]a|sem nada|deixa limpo|deixe limpo|s[oó] eu\b|nada aqui|sem elemento|tira o efeito|tirar o efeito/i.test(pedido);
}

/** O tipo pelas palavras (só quando o JEV não está). */
export function tipoPorPalavras(pedido: string): TipoDeElemento | null {
  const p = pedido.toLowerCase();
  if (pedeNada(p)) return "nada";
  // A combinada (06/10): vídeo de fundo com a camada exata por cima (satélite com pontos, mural com fio).
  if (/sat[eé]lite|vista a[eé]rea|mural|fio vermelho|pontos no mapa|mapa com (os )?pontos|quadro de investiga/.test(p)) return "combinada";
  if (/v[ií]deo|b-?roll|cena em movimento|filmagem|em movimento/.test(p)) return "video";
  if (/imagem|foto|ilustra|desenho|figura/.test(p)) return "imagem";
  if (/n[uú]mero|dado|gr[aá]fico|porcentagem|estat[ií]stica/.test(p)) return "dado";
  if (/lista|passos|etapas|t[oó]picos/.test(p)) return "lista";
  if (/cita[cç][aã]o|vers[ií]culo|manchete|frase de/.test(p)) return "citacao";
  if (/[ií]cone|s[ií]mbolo|emoji/.test(p)) return "icone";
  if (/atr[aá]s de mim|palavra gigante|atr[aá]s da pessoa/.test(p)) return "texto-atras";
  if (/impacto|tela cheia|tela inteira/.test(p)) return "impacto";
  if (/destaque|grifa|marca-texto|sublinha/.test(p)) return "legenda-destaque";
  if (/cart[aã]o|frase-chave|frase chave/.test(p)) return "frase-chave";
  // Um objeto concreto citado sem a palavra "imagem" ("a bola de futebol", "um mapa"): é algo para VER.
  if (/\b(apare[cç]a|aparecer|mostra|mostre|coloca|p[oõ]e|bota|quero ver|quero que)\b/.test(p)) return "imagem";
  return null;
}

export function ondePorPalavras(pedido: string): OndeDoPedido | null {
  const p = pedido.toLowerCase();
  if (/no meio|no centro|centraliz|bem no meio/.test(p)) return "centro";
  if (/acima da cabe[cç]a|em cima da cabe[cç]a|sobre a cabe[cç]a/.test(p)) return "acima-da-cabeca";
  if (/no canto|cantinho/.test(p)) return "canto";
  if (/do meu lado|ao lado|ao meu lado|na lateral/.test(p)) return "ao-lado";
  return null;
}

export function tamanhoPorPalavras(pedido: string): TamanhoDoPedido | null {
  const p = pedido.toLowerCase();
  if (/bem grande|grand[eã]o|gigante|enorme|\bgrande\b|ocupando a tela|bem vis[ií]vel/.test(p)) return "grande";
  if (/pequen|discret|miudinh|menorzinh/.test(p)) return "pequeno";
  return null;
}

/** A frase entre aspas no pedido (o texto literal que o cliente quer ver escrito). */
export function textoLiteralNoPedido(pedido: string): string | null {
  const m = pedido.match(/["“”«]([^"“”»]{2,120})["“”»]/) ?? pedido.match(/'([^']{2,120})'/);
  return m ? m[1].trim() : null;
}

export function maisTempoPorPalavras(pedido: string): boolean {
  return /mais tempo|fica mais|demora mais|segura mais|por mais tempo|mais demorad/i.test(pedido);
}

/**
 * O que deve aparecer, nas palavras do cliente: o pedido sem o "quero que",
 * sem a parte de cor, de tamanho e de lugar quando ela está num pedaço
 * separado por vírgula ou "com". Fica legível para o redator e para a tela;
 * em dúvida, o pedido inteiro.
 */
export function descricaoVisualDoPedido(pedido: string): string {
  let t = pedido.replace(/\s+/g, " ").trim();
  t = t.replace(/^(eu )?(quero|queria|gostaria|pode|poderia|coloca|coloque|p[oõ]e|ponha|bota|bote)( que| de| ver)?\s+/i, "");
  t = t.replace(/^(a |o |uma |um )?/i, (m) => m);
  const partes = t.split(/\s*(?:,|;| com (?=a |as |o |os |letra|texto|cor|fonte)| e (?=a letra|as letras|o texto|a cor))\s*/i).filter(Boolean);
  const semInstrucao = partes.filter((x) => !/\b(letra|letras|texto|cor|fonte|grande|pequen|no meio|no centro|no canto|ao lado|acima)\b/i.test(x) || !/\b(verd|vermelh|azul|amarel|laranj|ros|rox|dourad|prat|pret|branc|cinz|marrom|grande|pequen|meio|centro|canto|lado|acima)/i.test(x));
  const saida = (semInstrucao.length ? semInstrucao : partes).join(", ").trim();
  return (saida || t).slice(0, 200);
}

/** A interpretação sem o JEV (reserva): só palavras. */
export function interpretarPorPalavras(pedido: string): PedidoDoCliente {
  const tipo = tipoPorPalavras(pedido) ?? "imagem";
  const cor = corNoTexto(pedido);
  const tamanho = tamanhoPorPalavras(pedido);
  const texto = textoLiteralNoPedido(pedido);
  return {
    pedido,
    descricaoVisual: descricaoVisualDoPedido(pedido),
    tipo,
    forma: /tela cheia|tela inteira|ocupando a tela/i.test(pedido) ? "tela-cheia" : "janela",
    posicao: ondePorPalavras(pedido),
    ...(cor ? { cor: cor.cor, corNome: cor.nome } : {}),
    ...(tamanho ? { tamanho } : {}),
    ...(texto ? { texto } : {}),
    ...(maisTempoPorPalavras(pedido) ? { maisTempo: true } : {}),
    origem: "reserva",
  };
}

// ─────────────────────────────── as perguntas ao JEV ───────────────────────────────

/** As perguntas sobre UM pedido (prefixo `p<i>_`), com os tipos que o trecho permite. */
export function perguntasDoPedido(i: number, pedido: string, fala: string, tipos: TipoDeElemento[]): Record<string, PerguntaDoJev> {
  const ctx = `PEDIDO DO CLIENTE nesta cena, com as palavras dele: "${pedido.slice(0, 300)}". A fala da cena: "${fala.slice(0, 240)}".`;
  const lista = [...tipos.filter((t) => t !== "nada"), "nada" as const];
  return {
    [`p${i}_tipo`]: {
      type: "choice",
      instructions: `${ctx} Que elemento visual o cliente está pedindo? Escolha o tipo que mostra o que ele descreveu (um objeto citado sem a palavra "imagem", como "a bola de futebol", é uma IMAGEM ou um VÍDEO; "sem efeito" ou "só eu" é NADA).`,
      criteria: Object.fromEntries(lista.map((t) => [t, CRITERIO_DO_TIPO[t]])),
    },
    [`p${i}_forma`]: {
      type: "choice",
      instructions: `${ctx} Se o pedido vira uma imagem ou um vídeo, ele pede que ocupe a TELA CHEIA ou cabe numa JANELA com a pessoa ainda na tela?`,
      criteria: { janela: "janela: a pessoa segue aparecendo, o elemento entra ao lado, no meio ou no canto", "tela-cheia": "tela cheia: o pedido fala em tela cheia, tela inteira, ocupando tudo" },
    },
    [`p${i}_onde`]: {
      type: "choice",
      instructions: `${ctx} ONDE o cliente pediu que o elemento fique?`,
      criteria: { canto: "no canto da tela", "acima-da-cabeca": "acima da cabeça da pessoa", "ao-lado": "ao lado da pessoa", centro: "no meio, no centro da tela", "sem-preferencia": "o pedido não diz onde" },
    },
    [`p${i}_cor`]: {
      type: "choice",
      instructions: `${ctx} O pedido diz uma COR para o elemento ou para as letras? Qual?`,
      criteria: { ...Object.fromEntries(NOMES_DE_COR.map((n) => [n, `a cor ${n} (ou um tom dela)`])), nenhuma: "o pedido não fala em cor" },
    },
    [`p${i}_tamanho`]: {
      type: "choice",
      instructions: `${ctx} O pedido diz o TAMANHO do elemento?`,
      criteria: { grande: "grande, bem grande, gigante, ocupando a tela", pequeno: "pequeno, discreto, pequenininho", normal: "o pedido não fala em tamanho" },
    },
    [`p${i}_texto`]: { type: "noul", instructions: `${ctx} O pedido traz uma FRASE OU PALAVRA LITERAL que o cliente quer ver escrita na tela (entre aspas, ou "escreva X", "com o texto X")?` },
    [`p${i}_tempo`]: { type: "noul", instructions: `${ctx} O pedido diz que o elemento deve ficar MAIS TEMPO na tela do que o normal?` },
  };
}

/** As respostas do JEV viram a interpretação; o que ele não respondeu com confiança cai na reserva por palavras daquele item. */
export function interpretacaoDasRespostas(i: number, pedido: string, r: Record<string, RespostaDoJev>, tipos: TipoDeElemento[]): PedidoDoCliente {
  const reserva = interpretarPorPalavras(pedido);
  const escolha = <T extends string>(k: string, opcoes: readonly T[], minimo = 0.3): T | null => {
    const x = r[`p${i}_${k}`];
    if (!x || x.type !== "choice" || (x.confidence ?? 0) < minimo) return null;
    return (opcoes as readonly string[]).includes(x.choice) ? (x.choice as T) : null;
  };
  const sim = (k: string) => {
    const x = r[`p${i}_${k}`];
    return x && x.type === "noul" && typeof x.noul === "number" ? x.noul : null;
  };
  const lista = [...tipos.filter((t) => t !== "nada"), "nada" as const];
  const tipo = escolha("tipo", lista) ?? reserva.tipo;
  const forma = escolha("forma", ["janela", "tela-cheia"] as const) ?? reserva.forma;
  const onde = escolha("onde", [...ONDES, "sem-preferencia"] as const);
  const posicao: OndeDoPedido | null = onde === "sem-preferencia" ? null : (onde as OndeDoPedido | null) ?? reserva.posicao;
  const corNome = escolha("cor", [...NOMES_DE_COR, "nenhuma"] as const);
  // O hex escrito pelo cliente vale por cima do nome; o nome do JEV só vale se o texto do pedido fala em cor
  // (o JEV não inventa cor; sem palavra de cor no pedido, não há cor pedida).
  const noTexto = corNoTexto(pedido);
  const cor = noTexto?.nome.startsWith("#") ? noTexto : corNome && corNome !== "nenhuma" && noTexto ? { cor: CORES_NOMEADAS[corNome], nome: corNome } : corNome === "nenhuma" ? null : noTexto;
  const tamanho = escolha("tamanho", ["grande", "pequeno", "normal"] as const) ?? reserva.tamanho ?? null;
  const pedeTexto = (sim("texto") ?? 0) >= 0.6;
  const texto = textoLiteralNoPedido(pedido) ?? (pedeTexto ? reserva.texto ?? null : null);
  const maisTempo = (sim("tempo") ?? (reserva.maisTempo ? 1 : 0)) >= 0.6;
  return {
    pedido,
    descricaoVisual: descricaoVisualDoPedido(pedido),
    tipo,
    forma,
    posicao,
    ...(cor ? { cor: cor.cor, corNome: cor.nome } : {}),
    ...(tamanho && tamanho !== "normal" ? { tamanho } : {}),
    ...(texto ? { texto } : {}),
    ...(maisTempo ? { maisTempo: true } : {}),
    origem: "jev",
  };
}

// ─────────────────────────────── o pedido em português (a linha aprovada) ───────────────────────────────

const ONDE_EM_PORTUGUES: Record<OndeDoPedido, string> = { canto: "no canto", "acima-da-cabeca": "acima da sua cabeça", "ao-lado": "ao seu lado", centro: "no centro da tela" };

export function ondeEmPortugues(posicao: OndeDoPedido | null | undefined): string | null {
  return posicao ? ONDE_EM_PORTUGUES[posicao] : null;
}

export function corEmPortugues(p: Pick<PedidoNasProps, "cor" | "corNome"> | null | undefined): string | null {
  if (!p?.cor) return null;
  return p.corNome && !p.corNome.startsWith("#") ? p.corNome : p.cor;
}

/** O resumo da interpretação, para o redator e para a conferência ("imagem, no centro da tela, cor verde, grande"). */
export function resumoDaInterpretacao(p: PedidoDoCliente): string {
  const partes = [NOME_DO_TIPO[p.tipo] ?? p.tipo, p.tipo === "imagem" || p.tipo === "video" ? (p.forma === "tela-cheia" ? "em tela cheia" : "em janela") : "", ondeEmPortugues(p.posicao) ?? "", p.cor ? `cor pedida: ${corEmPortugues(p)}` : "", p.tamanho ? `tamanho ${p.tamanho}` : "", p.texto ? `texto literal: "${p.texto}"` : "", p.maisTempo ? "mais tempo na tela" : ""].filter(Boolean);
  return partes.join(", ");
}

/** As instruções literais para o redator (em português; ele escreve a cena em inglês palavra por palavra a partir delas). */
export function instrucoesParaORedator(p: PedidoDoCliente): string {
  const linhas = [
    `PEDIDO DO CLIENTE (LEI; atenda literalmente, não interprete para outra coisa): "${p.pedido}"`,
    `O que deve aparecer, nas palavras dele: "${p.descricaoVisual}". Interpretação decidida: ${resumoDaInterpretacao(p)}.`,
    p.tipo === "imagem" || p.tipo === "video"
      ? `A "cena" (em inglês) é o objeto pedido como assunto principal, no lugar pedido (por exemplo: "a soccer ball in the center of the frame")${p.cor ? `; a cor pedida entra na cena com todas as letras (por exemplo: "${p.corNome && !p.corNome.startsWith("#") ? corEmIngles(p.corNome) : p.cor} lettering")` : ""}. Também escreva "pedidoEmIngles": o pedido do cliente traduzido literalmente para o inglês.`
      : `O texto da peça sai do pedido${p.texto ? ` (o texto literal é "${p.texto}")` : ""}; nada do pedido fica de fora.`,
  ];
  return linhas.join("\n  ");
}

/** O nome da cor em inglês para o prompt da imagem (a tabela das cores nomeadas, só isso). */
export function corEmIngles(nome: string): string {
  const EN: Record<string, string> = { verde: "green", vermelho: "red", azul: "blue", amarelo: "yellow", laranja: "orange", rosa: "pink", roxo: "purple", dourado: "golden", prata: "silver", preto: "black", branco: "white", cinza: "gray", marrom: "brown", turquesa: "turquoise", bege: "beige" };
  return EN[nome] ?? nome;
}
