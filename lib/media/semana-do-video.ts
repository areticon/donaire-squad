/**
 * Os dias a partir do vídeo: o que o cliente escolhe, dia a dia.
 *
 * Até 02/09 a campanha derivada da gravação era fixa: Lucas na quarta, Tiago
 * na quinta, Diana no sábado, sem ninguém perguntar. O Bruno reprovou: "o
 * usuário ainda assim deve escolher como quer a campanha, dia após dia da
 * semana". Este módulo é a linguagem comum entre o planejador da tela, o
 * projeto (onde a escolha fica guardada) e a esteira (que escreve as peças).
 *
 * ## O que mudou em 30/09 (pedido do Bruno)
 *
 * 1. Cada dia tem FORMATO e REDES ("segunda imagem no Instagram e no
 *    LinkedIn", "terça vídeo curto no Shorts e no TikTok"). As redes saem das
 *    contas conectadas e começam sugeridas pelo formato (`REDES_SUGERIDAS`).
 * 2. "Vídeo curto" virou formato de dia: é o dia em que um CORTE do vídeo sai,
 *    nas redes marcadas. O vídeo completo continua indo para o YouTube sozinho.
 * 3. O plano começa HOJE (fuso de São Paulo), e não na segunda da semana, e
 *    cobre `DIAS_DO_PLANO` dias a partir da data de início. Até aqui a
 *    esteira somava o `dayOfWeek` à segunda da semana: gravar na quarta
 *    punha a terça no passado.
 *
 * ## A chave do dia continua sendo o dia da semana (1 = segunda, 7 = domingo)
 *
 * De propósito: card, post, ângulo do Roberto e veredito da Vera já se
 * encontram por `dayOfWeek`, e com até sete dias corridos a partir de
 * qualquer data cada dia da semana aparece uma vez só. A DATA de cada dia sai
 * de `dataDoDia`, a partir do início congelado no run. É por isso que
 * `DIAS_DO_PLANO` não passa de 7: acima disso dois dias teriam a mesma chave, e
 * seria preciso trocar a chave para a data em todo o caminho.
 *
 * Sem importar nada de servidor, de propósito: o planejador do cliente
 * importa daqui (e daqui só se importam tabelas puras).
 */

import { FUSO_PADRAO } from "@/lib/fuso";
import { formatoDaPeca, REDES_COM_CARROSSEL } from "@/lib/media/formatos-das-redes";

/**
 * QUANTOS DIAS O PLANO COBRE a partir da data de início. O Bruno pediu "5
 * dias para frente"; ficou 7 (30/09) para caber a semana que já existia
 * inteira, de hoje até o mesmo dia da semana que vem, menos um. Para mudar,
 * troque aqui: de 1 a 7 (ver o porquê do teto no topo do arquivo). A tela, o
 * quadro e a esteira leem daqui.
 */
export const DIAS_DO_PLANO = 7;

export type FormatoDoDia =
  | "text"
  | "image"
  | "carousel"
  | "infographic"
  | "thread"
  | "poll"
  | "short"
  | "free";

/** Os formatos que o squad ESCREVE (o vídeo curto é corte, não texto). */
export type FormatoEscrito = Exclude<FormatoDoDia, "free" | "short">;

/** As redes como o resto do sistema as chama (Post.platform). */
export type RedeDoPlano = "linkedin" | "twitter" | "instagram" | "facebook" | "tiktok" | "youtube";

export type ChaveDoDia = "1" | "2" | "3" | "4" | "5" | "6" | "7";

export type DiaDoPlano = { formato: FormatoDoDia; redes: RedeDoPlano[] };

/**
 * O plano guardado no projeto (`Project.videoSemana`) e congelado no run
 * (`config.semana`). `inicio` é a data escolhida (AAAA-MM-DD, São Paulo);
 * nulo quer dizer "hoje". No run ele é sempre a data efetiva.
 */
export type SemanaDoVideo = {
  inicio: string | null;
  dias: Partial<Record<ChaveDoDia, DiaDoPlano | null>>;
};

export const DIAS_DA_SEMANA: Array<{ dia: 1 | 2 | 3 | 4 | 5 | 6 | 7; curto: string; nome: string }> = [
  { dia: 1, curto: "Seg", nome: "segunda" },
  { dia: 2, curto: "Ter", nome: "terça" },
  { dia: 3, curto: "Qua", nome: "quarta" },
  { dia: 4, curto: "Qui", nome: "quinta" },
  { dia: 5, curto: "Sex", nome: "sexta" },
  { dia: 6, curto: "Sáb", nome: "sábado" },
  { dia: 7, curto: "Dom", nome: "domingo" },
];

/**
 * Os formatos que o cliente enxerga, com o custo em créditos ALÉM do texto.
 * Os números são os mesmos da campanha de texto (imagem 8, carrossel 24 com
 * três slides, infográfico 5), para o cliente não ver dois preços para a
 * mesma coisa. O vídeo curto não custa nada a mais: o corte já sai da
 * gravação.
 */
export const FORMATOS: Array<{ id: FormatoDoDia; rotulo: string; creditos: number; dica: string }> = [
  { id: "text", rotulo: "Texto", creditos: 0, dica: "Post de texto na sua voz" },
  { id: "image", rotulo: "Imagem", creditos: 8, dica: "Uma frase do vídeo como peça visual" },
  { id: "carousel", rotulo: "Carrossel", creditos: 24, dica: "Três slides, uma ideia por slide" },
  { id: "infographic", rotulo: "Infográfico", creditos: 5, dica: "Os dados da pesquisa em uma peça" },
  { id: "thread", rotulo: "Thread", creditos: 0, dica: "Uma sequência no X" },
  { id: "poll", rotulo: "Enquete", creditos: 0, dica: "Uma pergunta para o público responder" },
  { id: "short", rotulo: "Vídeo curto", creditos: 0, dica: "Um corte do vídeo, na vertical" },
  { id: "free", rotulo: "Livre", creditos: 0, dica: "O squad decide o formato do dia" },
];

export const ROTULO_DO_FORMATO: Record<FormatoDoDia, string> = Object.fromEntries(
  FORMATOS.map((f) => [f.id, f.rotulo])
) as Record<FormatoDoDia, string>;

/** A ordem em que as redes aparecem na tela: as de texto primeiro, as de vídeo depois (a mesma do card do dia). */
export const ORDEM_DAS_REDES: RedeDoPlano[] = ["linkedin", "twitter", "instagram", "facebook", "tiktok", "youtube"];

export const NOME_DA_REDE_NO_PLANO: Record<RedeDoPlano, string> = {
  linkedin: "LinkedIn",
  twitter: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};

/**
 * ONDE CADA FORMATO PODE SAIR (30/09). A tela só oferece estas; oferecer o
 * resto seria vender uma publicação que a rede recusa:
 *   . texto: Instagram não publica texto solto, TikTok e YouTube são vídeo;
 *   . thread é do X; enquete sai no formato que o publicador do LinkedIn lê;
 *   . carrossel: as redes de `REDES_COM_CARROSSEL` (o X não tem);
 *   . vídeo curto: os seis destinos de corte (Shorts, Reels, TikTok, LinkedIn,
 *     X e Facebook), todos verticais (lib/media/destinos.ts).
 */
export const REDES_DO_FORMATO: Record<Exclude<FormatoDoDia, "free">, RedeDoPlano[]> = {
  text: ["linkedin", "twitter", "facebook"],
  image: ["instagram", "linkedin", "facebook", "twitter"],
  carousel: [...REDES_COM_CARROSSEL] as RedeDoPlano[],
  infographic: ["linkedin", "instagram", "facebook", "twitter"],
  thread: ["twitter"],
  poll: ["linkedin"],
  short: ["youtube", "tiktok", "instagram", "facebook", "linkedin", "twitter"],
};

/**
 * A SUGESTÃO DE REDES por formato, nas palavras do Bruno: vídeo curto vai
 * para Shorts, TikTok e Reels; texto para LinkedIn e X; imagem para Instagram
 * e LinkedIn. Só entram as conectadas (ver `redesSugeridas`).
 *
 * O LinkedIn entrou na sugestão do vídeo curto em 30/09 (pedido do Bruno:
 * "a plataforma também deve gerar vídeos para o LinkedIn"). A pesquisa do
 * mesmo dia mostrou que o LinkedIn tem um feed próprio de vídeo em pé no
 * celular e dá mais distribuição ao vertical 9:16, que é exatamente o corte
 * que o worker já entrega; o texto do LinkedIn de cada corte o redator já
 * escreve (`posts.linkedin`), então sugerir a rede não custa crédito a mais.
 * Plano já guardado não muda: a sugestão só vale para dia sem rede escolhida.
 */
export const REDES_SUGERIDAS: Record<Exclude<FormatoDoDia, "free">, RedeDoPlano[]> = {
  text: ["linkedin", "twitter"],
  image: ["instagram", "linkedin"],
  carousel: ["instagram", "linkedin"],
  infographic: ["linkedin", "instagram"],
  thread: ["twitter"],
  poll: ["linkedin"],
  short: ["youtube", "tiktok", "instagram", "linkedin"],
};

/** O "livre" pode cair em qualquer formato escrito, então aceita as redes de todos eles. */
const REDES_DO_LIVRE: RedeDoPlano[] = ["linkedin", "twitter", "instagram", "facebook"];

export function redesDoFormato(formato: FormatoDoDia): RedeDoPlano[] {
  return formato === "free" ? REDES_DO_LIVRE : REDES_DO_FORMATO[formato];
}

/**
 * As redes sugeridas para um formato, entre as conectadas. Sem nenhuma das
 * sugeridas conectada, a primeira conectada que aceita o formato; sem
 * nenhuma conectada, a sugestão pura (a peça nasce em rascunho, como sempre
 * foi para projeto sem conta). `conectadas` indefinido: não filtra.
 */
export function redesSugeridas(formato: FormatoDoDia, conectadas?: readonly string[]): RedeDoPlano[] {
  const sugeridas = formato === "free" ? ["linkedin" as RedeDoPlano] : REDES_SUGERIDAS[formato];
  if (!conectadas || conectadas.length === 0) return [...sugeridas];
  const ligadas = sugeridas.filter((r) => conectadas.includes(r));
  if (ligadas.length) return ligadas;
  const outra = redesDoFormato(formato).find((r) => conectadas.includes(r));
  return outra ? [outra] : [...sugeridas];
}

/**
 * A sugestão do squad para quem ainda não escolheu nada: vídeo curto em três
 * dias (os cortes são o que mais rende do vídeo), imagem, texto e carrossel
 * entre eles, e o domingo livre de post. Cobre texto, visual e vídeo.
 */
const FORMATOS_SUGERIDOS: Partial<Record<ChaveDoDia, FormatoDoDia | null>> = {
  "1": "image",
  "2": "short",
  "3": "text",
  "4": "short",
  "5": "carousel",
  "6": "short",
  "7": null,
};

const FORMATOS_VALIDOS = new Set<string>(FORMATOS.map((f) => f.id));
const REDES_VALIDAS = new Set<string>(ORDEM_DAS_REDES);

/** Um dia a partir de um formato, com as redes sugeridas. */
export function diaComFormato(formato: FormatoDoDia, conectadas?: readonly string[]): DiaDoPlano {
  return { formato, redes: redesSugeridas(formato, conectadas) };
}

/**
 * Lê o que veio do banco ou da tela e devolve um plano válido.
 *
 * Aceita os dois jeitos que já foram gravados: o antigo, `{ "2": "text" }`
 * (só formato, de terça a domingo, porque segunda era do vídeo), e o de
 * 30/09, `{ versao: 2, inicio, dias: { "1": { formato, redes } } }`. Dia sem
 * rede ganha a sugestão do formato (entre as conectadas, quando a lista vem);
 * rede que o formato não aceita sai.
 *
 * `tirarDesconectadas` é da TELA: lá a rede sem conta não se marca, então
 * não aparece marcada. O servidor passa `false` ao congelar o plano no run,
 * porque uma conta que pede reconexão hoje não pode apagar a escolha do
 * cliente: o post nasce em rascunho e a conta volta a tempo de publicar.
 */
export function normalizarSemana(bruto: unknown, conectadas?: readonly string[], tirarDesconectadas = true): SemanaDoVideo {
  if (!bruto || typeof bruto !== "object") {
    const dias: SemanaDoVideo["dias"] = {};
    for (const { dia } of DIAS_DA_SEMANA) {
      const chave = String(dia) as ChaveDoDia;
      const f = FORMATOS_SUGERIDOS[chave] ?? null;
      dias[chave] = f ? diaComFormato(f, conectadas) : null;
    }
    return { inicio: null, dias };
  }
  const fonte = bruto as Record<string, unknown>;
  const novo = fonte.versao === 2 || (typeof fonte.dias === "object" && fonte.dias !== null);
  const diasBrutos = (novo ? fonte.dias : fonte) as Record<string, unknown> | null;
  const dias: SemanaDoVideo["dias"] = {};
  for (const { dia } of DIAS_DA_SEMANA) {
    const chave = String(dia) as ChaveDoDia;
    const v = diasBrutos?.[chave];
    const formatoBruto = typeof v === "string" ? v : (v as { formato?: unknown } | null)?.formato;
    if (typeof formatoBruto !== "string" || !FORMATOS_VALIDOS.has(formatoBruto)) {
      dias[chave] = null;
      continue;
    }
    const formato = formatoBruto as FormatoDoDia;
    const aceitas = redesDoFormato(formato);
    const redesBrutas = (v as { redes?: unknown } | null)?.redes;
    let redes = Array.isArray(redesBrutas)
      ? [...new Set(redesBrutas.filter((r): r is RedeDoPlano => typeof r === "string" && REDES_VALIDAS.has(r)))]
          .filter((r) => aceitas.includes(r))
          .filter((r) => !tirarDesconectadas || !conectadas || conectadas.length === 0 || conectadas.includes(r))
      : [];
    if (!redes.length) redes = redesSugeridas(formato, conectadas);
    dias[chave] = { formato, redes: ordenarRedes(redes) };
  }
  const inicio = typeof fonte.inicio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fonte.inicio) ? fonte.inicio : null;
  return { inicio: novo ? inicio : null, dias };
}

/** O plano no formato que vai para o banco (projeto ou run). */
export function planoParaGravar(semana: SemanaDoVideo): Record<string, unknown> {
  return { versao: 2, inicio: semana.inicio, dias: semana.dias };
}

export function ordenarRedes<T extends string>(redes: T[]): T[] {
  return [...redes].sort((a, b) => ORDEM_DAS_REDES.indexOf(a as RedeDoPlano) - ORDEM_DAS_REDES.indexOf(b as RedeDoPlano));
}

/* ── As datas ──────────────────────────────────────────────────────────── */

/** Hoje em São Paulo, AAAA-MM-DD. A Vercel roda em UTC, e às 21h daqui o UTC já virou o dia. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: FUSO_PADRAO });
}

/** O dia da semana de uma data AAAA-MM-DD, 1 = segunda, 7 = domingo. */
export function diaDaSemanaDe(iso: string): number {
  return new Date(`${iso}T12:00:00.000Z`).getUTCDay() || 7;
}

export function somarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * A data em que o plano começa de verdade: a escolhida, se ainda não passou;
 * senão, hoje. Data guardada que ficou no passado (o projeto guarda a escolha
 * para as próximas gravações) não pode jogar a semana nova para trás.
 */
export function inicioEfetivo(semana: Pick<SemanaDoVideo, "inicio">, hoje: string = hojeEmSaoPaulo()): string {
  return semana.inicio && semana.inicio >= hoje ? semana.inicio : hoje;
}

/** Quantos dias o plano cobre, dentro do teto de 7 (ver o topo do arquivo). */
export function diasDoPlano(): number {
  return Math.max(1, Math.min(7, Math.floor(DIAS_DO_PLANO)));
}

/** As datas do plano, em ordem, a partir do início. */
export function datasDoPlano(inicio: string): Array<{ iso: string; dia: number; curto: string; nome: string }> {
  return Array.from({ length: diasDoPlano() }, (_, i) => {
    const iso = somarDias(inicio, i);
    const dia = diaDaSemanaDe(iso);
    const d = DIAS_DA_SEMANA[dia - 1];
    return { iso, dia, curto: d.curto, nome: d.nome };
  });
}

/**
 * A data de um dia do plano (AAAA-MM-DD): a primeira data a partir do início
 * que cai nesse dia da semana. Com início na quarta, a terça é a da semana
 * seguinte, e é ali que o card e o post caem.
 */
export function isoDoDia(inicio: string, dia: number): string {
  const desloca = (dia - diaDaSemanaDe(inicio) + 7) % 7;
  return somarDias(inicio, desloca);
}

/**
 * O instante de um dia do plano, na hora UTC pedida (12h UTC são 9h em São
 * Paulo, a hora de sempre das peças do vídeo).
 *
 * `inicio` vem do run (`config.semana.inicio`). Run de antes de 30/09 não tem
 * início: a data volta a ser a de sempre, segunda da semana mais o dia, para a
 * campanha que já está no quadro não mudar de lugar.
 */
export function dataDoDia(
  alvo: { inicio: string | null; weekStart?: Date | null },
  dia: number,
  horaUtc = 12
): Date {
  if (alvo.inicio) {
    const d = new Date(`${isoDoDia(alvo.inicio, dia)}T00:00:00.000Z`);
    d.setUTCHours(horaUtc, 0, 0, 0);
    return d;
  }
  const segunda = alvo.weekStart ?? new Date();
  const d = new Date(segunda.getTime() + (dia - 1) * 86400000);
  d.setUTCHours(horaUtc, 0, 0, 0);
  return d;
}

/** O plano congelado no run, com o início (nulo em run de antes de 30/09). */
export function planoDoRun(config: unknown, reserva?: unknown): SemanaDoVideo {
  return normalizarSemana((config as { semana?: unknown } | null)?.semana ?? reserva);
}

/** Um dia está dentro da janela do plano? Com 7 dias, todos estão. */
export function diaNoPlano(inicio: string | null, dia: number): boolean {
  if (!inicio) return true;
  return datasDoPlano(inicio).some((d) => d.dia === dia);
}

/* ── O que cada dia pede ───────────────────────────────────────────────── */

/**
 * O formato de verdade de um dia "livre". Alterna visual e texto para a
 * semana não ficar de um jeito só, e nunca cai em carrossel (é o mais caro,
 * e o cliente não pediu por ele).
 */
export function resolverLivre(dia: number): FormatoEscrito {
  const ordem: FormatoEscrito[] = ["text", "image", "thread", "text", "infographic", "text"];
  return ordem[(((dia - 2) % ordem.length) + ordem.length) % ordem.length];
}

/**
 * As redes que valem para o formato RESOLVIDO do dia: as marcadas que o
 * formato aceita, ou, se nenhuma serve (o livre que virou thread com o
 * LinkedIn marcado), a sugestão do formato entre as conectadas.
 */
export function redesDoDia(formato: Exclude<FormatoDoDia, "free">, marcadas: RedeDoPlano[], conectadas?: readonly string[]): RedeDoPlano[] {
  const servem = marcadas.filter((r) => REDES_DO_FORMATO[formato].includes(r));
  return ordenarRedes(servem.length ? servem : redesSugeridas(formato, conectadas));
}

/**
 * Créditos estimados além do vídeo, para a tela dizer antes do envio.
 *
 * Imagem e infográfico custam UMA geração por proporção (30/09): Instagram
 * (retrato 4:5) e LinkedIn (paisagem) no mesmo dia são duas artes, porque a
 * mesma arte recortada para as duas redes foi o defeito de 18/09
 * (formatos-das-redes.ts). O carrossel é 4:5 em todas, então é um só.
 */
export function creditosDaSemana(semana: SemanaDoVideo): number {
  let total = 0;
  for (const { dia } of DIAS_DA_SEMANA) {
    const d = semana.dias[String(dia) as ChaveDoDia];
    if (!d) continue;
    if (!diaNoPlano(semana.inicio, dia)) continue;
    if (d.formato === "short") continue;
    const formato = d.formato === "free" ? resolverLivre(dia) : d.formato;
    const unitario = FORMATOS.find((x) => x.id === formato)?.creditos ?? 0;
    if (formato === "image" || formato === "infographic") {
      const redes = redesDoDia(formato, d.redes);
      const proporcoes = new Set(redes.map((r) => formatoDaPeca(r, formato).proporcao));
      total += unitario * Math.max(1, proporcoes.size);
    } else {
      total += unitario;
    }
  }
  return total;
}

export type DiaEscrito = {
  dia: number;
  formato: FormatoEscrito;
  escolhido: FormatoDoDia;
  redes: RedeDoPlano[];
};

/**
 * Os dias que o squad ESCREVE, já com o "livre" resolvido e as redes que
 * valem para o formato. Em ordem de data quando o início é conhecido (é a
 * ordem em que a semana vai ao ar, e a que o redator lê), senão de segunda a
 * domingo. O vídeo curto fica de fora: ele é corte, e quem o põe no quadro é
 * a sincronização dos cortes (`diasDeVideoCurto`).
 */
export function diasDaSemana(semana: SemanaDoVideo): DiaEscrito[] {
  const dias: DiaEscrito[] = [];
  for (const { dia } of ordemDosDias(semana.inicio)) {
    const d = semana.dias[String(dia) as ChaveDoDia];
    if (!d || d.formato === "short") continue;
    const formato = d.formato === "free" ? resolverLivre(dia) : d.formato;
    dias.push({ dia, formato, escolhido: d.formato, redes: redesDoDia(formato, d.redes) });
  }
  return dias;
}

/** Os dias de vídeo curto, em ordem de data: o primeiro corte vai no primeiro deles. */
export function diasDeVideoCurto(semana: SemanaDoVideo): Array<{ dia: number; redes: RedeDoPlano[] }> {
  const dias: Array<{ dia: number; redes: RedeDoPlano[] }> = [];
  for (const { dia } of ordemDosDias(semana.inicio)) {
    const d = semana.dias[String(dia) as ChaveDoDia];
    if (d?.formato === "short") dias.push({ dia, redes: redesDoDia("short", d.redes) });
  }
  return dias;
}

function ordemDosDias(inicio: string | null): Array<{ dia: number }> {
  return inicio ? datasDoPlano(inicio) : DIAS_DA_SEMANA;
}

/**
 * O destino de corte de cada rede (lib/media/destinos.ts): no YouTube o
 * corte é Shorts, no Instagram é Reels, no X o destino se chama "x".
 */
export const DESTINO_DE_CORTE_DA_REDE: Record<RedeDoPlano, string> = {
  youtube: "youtube_shorts",
  instagram: "instagram_reels",
  tiktok: "tiktok",
  facebook: "facebook",
  linkedin: "linkedin",
  twitter: "x",
};

/** O nome da rede dito como o formato a chama: Shorts e Reels no vídeo curto. */
export function rotuloDaRedeNoFormato(rede: RedeDoPlano, formato: FormatoDoDia): string {
  if (formato === "short") {
    if (rede === "youtube") return "Shorts";
    if (rede === "instagram") return "Reels";
  }
  return NOME_DA_REDE_NO_PLANO[rede];
}
