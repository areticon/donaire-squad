import { PLANOS_PUBLICOS, type PlanoPublico } from "@/lib/planos";

/**
 * A CALCULADORA DA LANDING (01/10): quanto custa publicar no volume que a
 * pessoa escolhe, feito por gente, contra o plano da Demandou que cobre esse
 * volume.
 *
 * Módulo puro, sem banco e sem SDK, de propósito: ele roda no navegador (a
 * calculadora é componente de cliente) e na rota que grava o lead, que refaz a
 * conta no servidor para o time de vendas ver o número que a pessoa viu, e não
 * um número que o navegador mandou. As duas pontas usando a mesma função é o
 * que impede a tela e o e-mail de divergirem.
 *
 * OS NÚMEROS DE MERCADO TÊM FONTE, e a fonte aparece na tela (FONTES abaixo).
 * Onde nenhuma fonte cobre o caso (capacidade de cada função, excedente da
 * agência), o número é premissa nossa e está escrito assim, porque a pessoa
 * que vai assinar contrato anual vai perguntar de onde veio cada real.
 *
 * Tudo é CONSERVADOR de propósito: salário de nível pleno (não sênior), sem
 * ferramentas, sem equipamento, sem gestor, sem rotatividade. Número inflado
 * vira desconfiança na primeira pergunta do comprador.
 */

// ───────────────────────────── entradas ─────────────────────────────

export const REDES = [
  { id: "linkedin", nome: "LinkedIn" },
  { id: "instagram", nome: "Instagram" },
  { id: "facebook", nome: "Facebook" },
  { id: "x", nome: "X" },
  { id: "youtube", nome: "YouTube" },
  { id: "tiktok", nome: "TikTok" },
] as const;
export type RedeId = (typeof REDES)[number]["id"];

export type Entradas = {
  /** Posts escritos por semana: LinkedIn, X, legenda longa, artigo. */
  textosSemana: number;
  /** Artes por semana: imagem, carrossel, infográfico. */
  artesSemana: number;
  /** Vídeos curtos editados por semana: Reels, Shorts, TikTok. */
  cortesSemana: number;
  /** Vídeos longos editados por mês: YouTube, aula, podcast. */
  longosMes: number;
  redes: RedeId[];
};

/** Os limites dos controles. A rota usa os mesmos para podar o que chega. */
export const LIMITES = { textosSemana: 21, artesSemana: 21, cortesSemana: 21, longosMes: 12 };

export const PREDEFINICOES: Array<{ id: string; nome: string; entradas: Entradas }> = [
  {
    id: "tres_por_semana",
    nome: "3 vezes por semana",
    entradas: { textosSemana: 2, artesSemana: 2, cortesSemana: 3, longosMes: 2, redes: ["linkedin", "instagram", "youtube"] },
  },
  {
    // O padrão da tela: a pergunta do Bruno é "quanto gastaria se postasse
    // todo dia", então é por ela que a calculadora abre.
    id: "todo_dia",
    nome: "Todo dia",
    entradas: { textosSemana: 7, artesSemana: 7, cortesSemana: 7, longosMes: 4, redes: ["linkedin", "instagram", "facebook", "youtube"] },
  },
  {
    id: "todo_dia_forte",
    nome: "Todo dia, em todas as redes",
    entradas: { textosSemana: 7, artesSemana: 7, cortesSemana: 14, longosMes: 4, redes: ["linkedin", "instagram", "facebook", "x", "youtube", "tiktok"] },
  },
];

export const ENTRADAS_PADRAO: Entradas = PREDEFINICOES[1].entradas;

/** Semanas por mês: 52 semanas em 12 meses, e não 4, que subestimaria 8%. */
const SEMANAS_POR_MES = 52 / 12;

export function porMes(porSemana: number): number {
  return Math.round(porSemana * SEMANAS_POR_MES);
}

/** Poda o que veio de fora (navegador, corpo da rota) para dentro dos limites. */
export function entradasValidas(e: Partial<Entradas> | null | undefined): Entradas {
  const n = (v: unknown, max: number) => {
    const x = Math.round(Number(v));
    return Number.isFinite(x) ? Math.min(max, Math.max(0, x)) : 0;
  };
  const ids = new Set(REDES.map((r) => r.id as string));
  const redes = Array.isArray(e?.redes) ? (e!.redes.filter((r) => ids.has(r)) as RedeId[]) : [];
  return {
    textosSemana: n(e?.textosSemana, LIMITES.textosSemana),
    artesSemana: n(e?.artesSemana, LIMITES.artesSemana),
    cortesSemana: n(e?.cortesSemana, LIMITES.cortesSemana),
    longosMes: n(e?.longosMes, LIMITES.longosMes),
    redes: [...new Set(redes)],
  };
}

// ───────────────────────────── mercado ─────────────────────────────

/**
 * Salário mensal de nível PLENO, carteira assinada. Valor do meio da faixa do
 * Glassdoor 2026, conferido contra o CAGED (salario.com.br, ago/25 a jul/26),
 * que mistura todos os níveis e fica abaixo, como esperado.
 */
export const SALARIOS = {
  socialMedia: 4000,
  designer: 3800,
  editor: 4500,
  redator: 5000,
};

/**
 * Encargos e benefícios sobre o salário, no Lucro Presumido ou Real: cerca de
 * 67% a 70% de encargos e provisões (INSS patronal, FGTS, férias com um terço,
 * 13º, multa do FGTS) mais 10% a 13% de vale-refeição e transporte. As fontes
 * vão de 67% (Contajá 2026) a 103% (José Pastore, FGV IBRE 2025); 80% fica no
 * meio de baixo.
 */
export const ENCARGOS = 0.8;

/**
 * Quanto UMA pessoa em tempo integral entrega por mês. PREMISSA NOSSA, sem
 * fonte de pesquisa (não existe estudo brasileiro com amostra sobre isso), e
 * generosa com o time humano: um dia útil rende 2 textos com pesquisa, 3 artes
 * ou 3 cortes, e um vídeo longo de 20 a 30 minutos leva perto de 2,5 dias.
 */
export const CAPACIDADE = {
  textosPorRedator: 44,
  artesPorDesigner: 66,
  cortesPorEditor: 66,
  longosPorEditor: 8,
  /** Adaptar a legenda à rede, agendar e responder: cerca de 18 por dia útil. */
  publicacoesPorSocialMedia: 400,
};

/**
 * Agência de social media, mensalidade por faixa (Koko 2026 e Integrare 2026).
 * O que entra em cada faixa é o que as duas fontes descrevem, para até 3 redes.
 */
export const AGENCIA = {
  basico: { preco: 3000, posts: 16, cortes: 0, longos: 0 },
  intermediario: { preco: 6000, posts: 24, cortes: 6, longos: 0 },
  completo: { preco: 12000, posts: 24, cortes: 12, longos: 4 },
  /**
   * O que passa da faixa. PREMISSA NOSSA: nenhuma fonte publica excedente. É o
   * preço do freelancer por peça com a margem de gestão de uma agência.
   */
  excedente: { post: 150, corte: 250, longo: 900 },
  /** Cada rede além de três. PREMISSA NOSSA, pela mesma razão. */
  redeExtra: 0.15,
};

/** Freelancer por peça (fontes em FONTES). */
export const FREELA = {
  texto: 200, // post ou artigo de LinkedIn, Boldfy 2026
  arte: 100, // post com arte e legenda, mLabs e tabelas de mercado 2025
  corte: 150, // Reels ou Shorts editado com legenda, CrazyStack 2026
  longo: 600, // YouTube de 10 a 30 min, CrazyStack e FreelaSemCrise 2026
  /** Alguém para planejar, agendar e responder: social media intermediário. */
  gestaoMensal: 2500, // Jamile Fernandes 2026, R$ 1.500 a R$ 3.500
};

export const FONTES: Array<{ item: string; fonte: string; url: string }> = [
  { item: "Salário de social media pleno", fonte: "Glassdoor, 2026", url: "https://www.glassdoor.com.br/Sal%C3%A1rios/analista-de-social-media-pleno-sal%C3%A1rio-SRCH_KO0,30.htm" },
  { item: "Salário de designer gráfico pleno", fonte: "Glassdoor, 2026; CAGED via salario.com.br", url: "https://www.glassdoor.com.br/Sal%C3%A1rios/designer-gr%C3%A1fico-pleno-sal%C3%A1rio-SRCH_KO0,22.htm" },
  { item: "Salário de editor de vídeo pleno", fonte: "Glassdoor, 2026", url: "https://www.glassdoor.com.br/Sal%C3%A1rios/editor-de-video-pleno-sal%C3%A1rio-SRCH_KO0,21.htm" },
  { item: "Salário de redator pleno", fonte: "Glassdoor, 2026", url: "https://www.glassdoor.com.br/Sal%C3%A1rios/redator-publicitario-pleno-sal%C3%A1rio-SRCH_KO0,26.htm" },
  { item: "Encargos e provisões da carteira assinada", fonte: "Contajá, 2026", url: "https://contaja.com.br/blog/quanto-custa-um-funcionario-para-empresa/" },
  { item: "Mensalidade de agência de social media", fonte: "Koko, 2026", url: "https://koko.ag/blog/agencia-social-media/" },
  { item: "Faixas de gestão de redes", fonte: "Integrare, 2026", url: "https://aintegrare.com.br/quanto-custa-gestao-redes-sociais" },
  { item: "Edição de Reels e de vídeo para YouTube", fonte: "CrazyStack, 2026", url: "https://www.crazystack.com.br/blog/quanto-cobrar-edicao-video-precos" },
  { item: "Post de LinkedIn por encomenda", fonte: "Boldfy, 2026", url: "https://www.boldfy.com.br/blog/quanto-custa-ghostwriter-linkedin-brasil-2026" },
  { item: "Social media freelancer", fonte: "Jamile Fernandes, 2026", url: "https://jamilefernandes.com.br/blog/quanto-cobrar-social-media" },
];

// ───────────────────────────── a conta ─────────────────────────────

export type Volume = {
  textos: number;
  artes: number;
  cortes: number;
  longos: number;
  /** Peças únicas no mês, a medida dos planos da Demandou. */
  pecas: number;
  /** Cada peça em cada rede onde ela sai: é o trabalho de quem publica. */
  publicacoes: number;
};

export function volumeDoMes(e: Entradas): Volume {
  const textos = porMes(e.textosSemana);
  const artes = porMes(e.artesSemana);
  const cortes = porMes(e.cortesSemana);
  const longos = e.longosMes;
  const redes = Math.max(1, e.redes.length);
  // Vídeo longo sai só no YouTube (ou equivalente), por isso não multiplica.
  const publicacoes = (textos + artes + cortes) * redes + longos;
  return { textos, artes, cortes, longos, pecas: textos + artes + cortes + longos, publicacoes };
}

export type LinhaDeCusto = { rotulo: string; valor: number };
export type Cenario = { id: "time" | "agencia" | "freela"; nome: string; mensal: number; linhas: LinhaDeCusto[]; nota: string };

function cenarioTime(v: Volume): Cenario {
  const custo = (salario: number) => Math.round(salario * (1 + ENCARGOS));
  const funcoes = [
    { nome: "redator", plural: "redatores", carga: v.textos / CAPACIDADE.textosPorRedator, salario: SALARIOS.redator },
    { nome: "designer", plural: "designers", carga: v.artes / CAPACIDADE.artesPorDesigner, salario: SALARIOS.designer },
    { nome: "editor de vídeo", plural: "editores de vídeo", carga: v.cortes / CAPACIDADE.cortesPorEditor + v.longos / CAPACIDADE.longosPorEditor, salario: SALARIOS.editor },
    { nome: "social media", plural: "social medias", carga: v.publicacoes / CAPACIDADE.publicacoesPorSocialMedia, salario: SALARIOS.socialMedia },
  ];
  // Gente não se contrata em fração: carga de 0,3 de editor ainda é um editor.
  const linhas = funcoes
    .filter((f) => f.carga > 0)
    .map((f) => {
      const pessoas = Math.ceil(f.carga - 1e-9);
      return { rotulo: `${pessoas} ${pessoas > 1 ? f.plural : f.nome}`, valor: pessoas * custo(f.salario) };
    });
  return {
    id: "time",
    nome: "Time próprio",
    mensal: linhas.reduce((s, l) => s + l.valor, 0),
    linhas,
    nota: "Carteira assinada, nível pleno, com 80% de encargos e benefícios. Sem ferramentas, equipamento nem gestor.",
  };
}

function cenarioAgencia(v: Volume, redes: number): Cenario {
  const posts = v.textos + v.artes;
  const faixa = v.longos > 0 ? AGENCIA.completo : v.cortes > 0 ? AGENCIA.intermediario : AGENCIA.basico;
  const nomeFaixa = faixa === AGENCIA.completo ? "completo" : faixa === AGENCIA.intermediario ? "intermediário" : "básico";
  const linhas: LinhaDeCusto[] = [{ rotulo: `Pacote ${nomeFaixa}`, valor: faixa.preco }];
  const exPosts = Math.max(0, posts - faixa.posts);
  const exCortes = Math.max(0, v.cortes - faixa.cortes);
  const exLongos = Math.max(0, v.longos - faixa.longos);
  if (exPosts) linhas.push({ rotulo: `${exPosts} posts além do pacote`, valor: exPosts * AGENCIA.excedente.post });
  if (exCortes) linhas.push({ rotulo: `${exCortes} vídeos curtos além do pacote`, valor: exCortes * AGENCIA.excedente.corte });
  if (exLongos) linhas.push({ rotulo: `${exLongos} vídeos longos além do pacote`, valor: exLongos * AGENCIA.excedente.longo });
  const base = linhas.reduce((s, l) => s + l.valor, 0);
  const extras = Math.max(0, redes - 3);
  if (extras) linhas.push({ rotulo: `${extras} ${extras > 1 ? "redes" : "rede"} além de 3`, valor: Math.round(base * AGENCIA.redeExtra * extras) });
  return {
    id: "agencia",
    nome: "Agência",
    mensal: linhas.reduce((s, l) => s + l.valor, 0),
    linhas,
    nota: "Pacotes de mercado para até 3 redes. O que passa do pacote e cada rede a mais são estimativa nossa.",
  };
}

function cenarioFreela(v: Volume): Cenario {
  const linhas: LinhaDeCusto[] = [];
  if (v.textos) linhas.push({ rotulo: `${v.textos} textos a R$ ${FREELA.texto}`, valor: v.textos * FREELA.texto });
  if (v.artes) linhas.push({ rotulo: `${v.artes} artes a R$ ${FREELA.arte}`, valor: v.artes * FREELA.arte });
  if (v.cortes) linhas.push({ rotulo: `${v.cortes} vídeos curtos a R$ ${FREELA.corte}`, valor: v.cortes * FREELA.corte });
  if (v.longos) linhas.push({ rotulo: `${v.longos} vídeos longos a R$ ${FREELA.longo}`, valor: v.longos * FREELA.longo });
  if (v.pecas) linhas.push({ rotulo: "Social media para agendar e responder", valor: FREELA.gestaoMensal });
  return {
    id: "freela",
    nome: "Freelancer por peça",
    mensal: linhas.reduce((s, l) => s + l.valor, 0),
    linhas,
    nota: "Preço médio por peça no mercado brasileiro. Você coordena todo mundo, e esse tempo não entra na conta.",
  };
}

/** Quantas peças cada plano promete, lido da própria frase do plano ("cerca de 44 peças"). */
export function pecasDoPlano(p: PlanoPublico): number {
  for (const f of p.features) {
    const m = f.match(/cerca de ([\d.]+) peças/i);
    if (m) return Number(m[1].replace(".", ""));
  }
  return 0;
}

/**
 * Cada gravação rende cerca de 5 cortes e um vídeo completo (é a conta do
 * Starter: 4 gravações, 20 cortes, 4 completos). Daí sai quantas gravações o
 * volume pede.
 */
const CORTES_POR_GRAVACAO = 5;

export type PlanoIndicado = { plano: PlanoPublico; sobMedida: boolean };

export function planoQueCobre(v: Volume): PlanoIndicado {
  const gravacoes = Math.max(v.longos, Math.ceil(v.cortes / CORTES_POR_GRAVACAO));
  for (const p of PLANOS_PUBLICOS) {
    if (v.pecas <= pecasDoPlano(p) && gravacoes <= p.gravacoesPorMes) return { plano: p, sobMedida: false };
  }
  // Acima do Enterprise a conversa é sob medida; a tela mostra o Enterprise
  // como "a partir de", que é o piso honesto.
  return { plano: PLANOS_PUBLICOS[PLANOS_PUBLICOS.length - 1], sobMedida: true };
}

export type Resultado = {
  entradas: Entradas;
  volume: Volume;
  cenarios: Cenario[];
  demandou: { planoId: string; nome: string; mensal: number; sobMedida: boolean };
  economia: Array<{ id: Cenario["id"]; reais: number; porcento: number }>;
};

/**
 * A CONTA DO STARTER para a seção "A conta do mês" (01/10, noite). O Bruno viu
 * a calculadora dizer uma coisa e a seção do fim da página outra: lá ficava a
 * conta antiga de 02/09 (R$ 3.050 a R$ 6.070 e "gestão completa por R$ 5.000"),
 * aqui a agência saía por R$ 12.000. Agora as duas usam esta mesma função.
 *
 * O volume é o que o Starter promete: 4 gravações viram 4 completos, 20 cortes
 * e 20 peças escritas (10 textos e 10 artes), cerca de 44 peças. Três redes, e
 * não seis, para ficar do lado conservador.
 */
export const VOLUME_DO_STARTER: Volume = (() => {
  const textos = 10, artes = 10, cortes = 20, longos = 4, redes = 3;
  return { textos, artes, cortes, longos, pecas: textos + artes + cortes + longos, publicacoes: (textos + artes + cortes) * redes + longos };
})();

export function contaDoStarter(): { cenarios: Cenario[]; plano: PlanoPublico } {
  const v = VOLUME_DO_STARTER;
  return { cenarios: [cenarioTime(v), cenarioAgencia(v, 3), cenarioFreela(v)], plano: PLANOS_PUBLICOS[0] };
}

export function calcular(bruto: Partial<Entradas>): Resultado {
  const entradas = entradasValidas(bruto);
  const volume = volumeDoMes(entradas);
  const cenarios = [cenarioTime(volume), cenarioAgencia(volume, entradas.redes.length), cenarioFreela(volume)];
  const { plano, sobMedida } = planoQueCobre(volume);
  const economia = cenarios.map((c) => ({
    id: c.id,
    reais: Math.max(0, c.mensal - plano.mensal),
    porcento: c.mensal > 0 ? Math.max(0, Math.round(((c.mensal - plano.mensal) / c.mensal) * 100)) : 0,
  }));
  return { entradas, volume, cenarios, demandou: { planoId: plano.id, nome: plano.nome, mensal: plano.mensal, sobMedida }, economia };
}

export function emReais(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}
