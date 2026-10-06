/**
 * CONTEÚDO PRONTO DO CLIENTE (06/10/2026): a arte ou o vídeo que ele já tem,
 * posto num dia do quadro sem passar por redator, Diana, Vera nem esteira.
 *
 * Pedido do Bruno: "tem cliente que vai fazer um evento e monta no Canva a
 * foto dos palestrantes, ou já tem uma imagem pronta que quer postar de
 * tempos em tempos. Tem que ter a opção de subir um arquivo pronto, imagem
 * ou vídeo. Não será editado, nada. A IA pode ajudar a fazer a descrição."
 *
 * Este módulo é PURO (sem banco, sem Prisma): a janela no navegador e a rota
 * no servidor leem as mesmas regras, e é assim que o aviso que a pessoa vê
 * antes de salvar é o mesmo que o servidor aplica.
 *
 * ## As regras por rede
 *
 * Nada aqui é reencodado: o arquivo sobe como veio. Então o que a rede não
 * aceita precisa ser dito ANTES, na janela, e não na hora de publicar. Duas
 * forças de regra:
 *
 *   • BLOQUEIO: a rede recusa de verdade (tipo, tamanho, duração acima do
 *     teto, imagem onde só vai vídeo). A rede sai da escolha, com o motivo.
 *   • AVISO: a rede aceita mas o resultado perde (proporção fora do lugar,
 *     PNG onde a rede prefere JPG). A pessoa decide.
 *
 * Os tetos de duração são os mesmos de `lib/media/destinos.ts`, que é onde
 * o corte de vídeo já confere se cabe (Shorts 180 s, Reels 90 s, X 140 s,
 * LinkedIn e TikTok 600 s, Facebook 90 s). Os formatos (feed, reel, story)
 * são os de `lib/publish/formato-de-destino.ts`.
 */
import { DESTINOS_DE_CORTE } from "@/lib/media/destinos";
import { formatosDaRede, rotuloDoFormatoNaRede, type FormatoDeDestino } from "@/lib/publish/formato-de-destino";

export type TipoDoArquivo = "imagem" | "video";

/** O que a janela mede no próprio navegador antes de subir um byte. */
export type ArquivoMedido = {
  nome: string;
  mime: string;
  bytes: number;
  largura: number;
  altura: number;
  /** Só vídeo. */
  segundos?: number;
};

/** O que a peça É, pelo conjunto de arquivos: uma imagem, várias (carrossel) ou um vídeo. */
export type TipoDaPeca = "image" | "carousel" | "video";

export const TIPOS_DE_IMAGEM = ["image/jpeg", "image/png", "image/webp"] as const;
export const TIPOS_DE_VIDEO = ["video/mp4", "video/quicktime"] as const;
export const MAX_LAMINAS = 10;
/** O teto do envio público (app/api/campanha/material): 500 MB. */
export const MAX_BYTES_DO_ARQUIVO = 500 * 1024 * 1024;

export function tipoDoArquivo(mime: string): TipoDoArquivo | null {
  if ((TIPOS_DE_IMAGEM as readonly string[]).includes(mime)) return "imagem";
  if ((TIPOS_DE_VIDEO as readonly string[]).includes(mime)) return "video";
  return null;
}

/**
 * A peça a partir dos arquivos: todos imagem (1 = imagem, 2+ = carrossel) ou
 * um vídeo só. Misturar, ou dois vídeos, não é peça: a função diz por quê.
 */
export function tipoDaPeca(arquivos: ArquivoMedido[]): { tipo: TipoDaPeca } | { erro: string } {
  if (arquivos.length === 0) return { erro: "Escolha pelo menos um arquivo." };
  const tipos = arquivos.map((a) => tipoDoArquivo(a.mime));
  if (tipos.some((t) => t === null)) return { erro: "Só JPG, PNG, WebP, MP4 ou MOV." };
  const videos = tipos.filter((t) => t === "video").length;
  if (videos > 1) return { erro: "Um vídeo por vez: cada vídeo é uma peça." };
  if (videos === 1 && arquivos.length > 1) return { erro: "Vídeo não mistura com imagem na mesma peça." };
  if (videos === 1) return { tipo: "video" };
  if (arquivos.length > MAX_LAMINAS) return { erro: `Carrossel vai até ${MAX_LAMINAS} lâminas.` };
  return { tipo: arquivos.length > 1 ? "carousel" : "image" };
}

const MB = 1024 * 1024;

/** Tamanho máximo de IMAGEM por rede, em bytes, pelo que a API de cada uma aceita. */
const MAX_IMAGEM_POR_REDE: Record<string, number> = {
  instagram: 8 * MB,
  facebook: 10 * MB,
  linkedin: 8 * MB,
  twitter: 5 * MB,
};

/** Tamanho máximo de VÍDEO por rede, em bytes. Sem linha: vale o teto do envio. */
const MAX_VIDEO_POR_REDE: Record<string, number> = {
  twitter: 512 * MB,
  instagram: 1024 * MB,
  facebook: 1024 * MB,
};

/** O teto de duração da rede, o mesmo que o corte de vídeo já confere. */
export function tetoDeSegundos(platform: string, formato: FormatoDeDestino): number | null {
  const rede = platform.toLowerCase();
  // O YouTube como vídeo do canal não tem teto aqui; como Shorts, 180 s.
  if (rede === "youtube") return formato === "reel" ? 180 : null;
  const d = DESTINOS_DE_CORTE.find((x) => x.plataforma === rede);
  return d?.limiteSegundos ?? null;
}

export type Veredito = {
  platform: string;
  formato: FormatoDeDestino;
  /** A rede recusa: sai da escolha. */
  bloqueios: string[];
  /** A rede aceita, mas vale saber. */
  avisos: string[];
};

const proporcao = (a: ArquivoMedido) => (a.largura > 0 && a.altura > 0 ? a.largura / a.altura : null);
const ehVertical = (a: ArquivoMedido) => {
  const p = proporcao(a);
  return p !== null && p < 0.8;
};
const s = (n: number) => `${Math.round(n)} s`;
const mb = (n: number) => `${(n / MB).toFixed(n >= 10 * MB ? 0 : 1)} MB`;

/**
 * O que esta rede, neste lugar (feed, reel, story), diz sobre estes arquivos.
 *
 * A regra de ouro é não prometer o que a publicação não faz: o publicador
 * (lib/publish/oauth-post.ts e via-blotato.ts) recebe o arquivo como está.
 */
export function conferirParaRede(platform: string, formato: FormatoDeDestino, arquivos: ArquivoMedido[], tipo: TipoDaPeca): Veredito {
  const rede = platform.toLowerCase();
  const bloqueios: string[] = [];
  const avisos: string[] = [];
  const lugar = rotuloDoFormatoNaRede(rede, formato);

  if (!formatosDaRede(rede).includes(formato)) {
    bloqueios.push(`Esta rede não tem ${lugar}.`);
    return { platform, formato, bloqueios, avisos };
  }

  if (tipo === "video") {
    const v = arquivos[0];
    if (rede === "twitter" && v.mime === "video/quicktime") avisos.push("O X prefere MP4; MOV pode ser recusado na publicação.");
    const teto = tetoDeSegundos(rede, formato);
    if (teto !== null && typeof v.segundos === "number" && v.segundos > teto) {
      bloqueios.push(`${lugar} aceita vídeo de até ${s(teto)}; o seu tem ${s(v.segundos)}.`);
    }
    if (formato === "reel" && typeof v.segundos === "number" && v.segundos < 3) bloqueios.push(`${lugar} pede pelo menos 3 s de vídeo.`);
    const maxBytes = MAX_VIDEO_POR_REDE[rede] ?? MAX_BYTES_DO_ARQUIVO;
    if (v.bytes > maxBytes) bloqueios.push(`${lugar} aceita vídeo de até ${mb(maxBytes)}; o seu tem ${mb(v.bytes)}.`);
    // Proporção: o lugar vertical quer 9:16; o feed aceita o que vier, mas
    // vídeo deitado num reel sai com tarja, e o aviso diz isso antes.
    const vertical = formato === "reel" || formato === "story" || rede === "tiktok";
    if (vertical && !ehVertical(v)) avisos.push(`${lugar} é vertical (9:16): o seu vídeo é ${proporcao(v) && proporcao(v)! > 1.2 ? "deitado" : "quadrado"} e sai com tarja.`);
    if (rede === "youtube" && formato === "feed" && ehVertical(v) && (v.segundos ?? 0) <= 180) {
      avisos.push("Vídeo em pé de até 3 minutos vira Shorts no YouTube sozinho, mesmo marcado como vídeo do canal.");
    }
    return { platform, formato, bloqueios, avisos };
  }

  // Imagem ou carrossel.
  if (rede === "youtube") bloqueios.push("O YouTube só recebe vídeo.");
  if (rede === "tiktok") bloqueios.push("O TikTok só recebe vídeo por aqui.");
  if (bloqueios.length) return { platform, formato, bloqueios, avisos };

  if (formato === "reel") bloqueios.push(`${lugar} é só de vídeo; para a imagem, marque o feed ou o story.`);
  if (formato === "story" && tipo === "carousel") avisos.push("Story recebe uma mídia só: sai a primeira lâmina.");
  if (tipo === "carousel" && rede === "twitter" && arquivos.length > 4) avisos.push(`O X aceita até 4 imagens: saem as 4 primeiras de ${arquivos.length}.`);
  if (tipo === "carousel" && rede === "linkedin") avisos.push("No LinkedIn o carrossel sai como documento de páginas (PDF), uma lâmina por página.");

  const maxBytes = MAX_IMAGEM_POR_REDE[rede] ?? MAX_BYTES_DO_ARQUIVO;
  for (const a of arquivos) {
    if (a.bytes > maxBytes) bloqueios.push(`${lugar} aceita imagem de até ${mb(maxBytes)}; "${a.nome}" tem ${mb(a.bytes)}.`);
  }
  if (rede === "instagram") {
    for (const a of arquivos) {
      if (a.mime !== "image/jpeg") avisos.push(`O Instagram publica JPG; "${a.nome}" é ${a.mime === "image/png" ? "PNG" : "WebP"} e pode ser recusado. Se der, exporte em JPG.`);
      const p = proporcao(a);
      if (formato === "feed" && p !== null && (p < 0.8 - 0.01 || p > 1.91 + 0.01)) {
        bloqueios.push(`O feed do Instagram aceita de 4:5 a 1.91:1; "${a.nome}" está fora (${a.largura}×${a.altura}).`);
      }
    }
    if (tipo === "carousel") {
      const props = arquivos.map(proporcao).filter((p): p is number => p !== null);
      if (props.length > 1 && Math.max(...props) / Math.min(...props) > 1.02) avisos.push("Lâminas com proporções diferentes: o Instagram corta todas na proporção da primeira.");
    }
  }
  if (formato === "story") {
    for (const a of arquivos.slice(0, 1)) if (!ehVertical(a)) avisos.push(`${lugar} é vertical (9:16): a imagem sai com tarja.`);
  }
  return { platform, formato, bloqueios, avisos };
}

/**
 * O resumo para a janela: cada rede conectada com os lugares dela e o
 * veredito de cada lugar. Rede sem nenhum lugar aceitável fica inteira
 * bloqueada (a janela mostra o motivo e não deixa marcar).
 */
export function conferirParaRedes(redes: string[], arquivos: ArquivoMedido[], tipo: TipoDaPeca): Record<string, Veredito[]> {
  const saida: Record<string, Veredito[]> = {};
  for (const rede of [...new Set(redes.map((r) => r.toLowerCase()))]) {
    saida[rede] = formatosDaRede(rede).map((f) => conferirParaRede(rede, f, arquivos, tipo));
  }
  return saida;
}

/** A hora de sempre das peças: 09:00 em Brasília, a mesma que a campanha propõe. */
export const HORA_PADRAO = "09:00";

/* ── A recorrência ───────────────────────────────────────────────────────── */

/**
 * "ESTE CONTEÚDO É SÓ PARA ESTE DIA OU SE REPETE?" (06/10, pedido do Bruno).
 *
 * A imagem que o cliente "quer postar de tempos em tempos" entra uma vez e
 * repete toda semana (mesmo dia da semana) ou todo mês (mesmo dia do mês),
 * até uma data ou sem fim. A escolha de implementação foi criar UM post por
 * ocorrência já no ato, até a data fim ou até o teto de 12 meses: é o que o
 * quadro, a aprovação, o cron de publicação e o cancelamento já sabem fazer
 * com um post, sem ensinar o cron a gerar o próximo. "Sem fim" quer dizer
 * 12 meses; o cliente põe de novo quando chegar lá, e a janela diz isso.
 *
 * Cada ocorrência é uma peça inteira (posts por rede e cards do dia), todas
 * no mesmo run, que é o registro-pai da série. Cancelar a série arquiva o
 * run e cancela o que ainda não saiu; o que já foi ao ar fica.
 */
export type TipoDeRecorrencia = "nenhuma" | "semanal" | "mensal";

export type Recorrencia = {
  tipo: TipoDeRecorrencia;
  /** "AAAA-MM-DD" em Brasília, inclusivo. Nulo é "sem fim" (o teto de 12 meses). */
  ate?: string | null;
};

/** O teto de ocorrências de uma série: 12 meses de semanas, ou 12 meses. */
export const TETO_DE_OCORRENCIAS: Record<Exclude<TipoDeRecorrencia, "nenhuma">, number> = { semanal: 53, mensal: 12 };

const ultimoDiaDoMes = (ano: number, mes1a12: number) => new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();

/**
 * As ocorrências de uma série, em campos de Brasília ("AAAA-MM-DD" e "HH:mm"),
 * a partir da primeira. Pura: quem chama converte cada uma em instante com
 * `deCampos` (lib/posts/horario-da-peca.ts), que conhece o fuso.
 *
 * Semanal: de 7 em 7 dias. Mensal: o mesmo dia do mês; quando o mês não tem
 * esse dia (31 em abril), cai no último dia dele, que é o que o cliente
 * espera de "todo dia 31".
 */
export function ocorrenciasDaSerie(primeira: { data: string; hora: string }, recorrencia: Recorrencia | null | undefined): Array<{ data: string; hora: string }> {
  if (!recorrencia || recorrencia.tipo === "nenhuma") return [primeira];
  const [ano, mes, dia] = primeira.data.split("-").map(Number);
  if (!ano || !mes || !dia) return [primeira];
  const teto = TETO_DE_OCORRENCIAS[recorrencia.tipo];
  const ate = recorrencia.ate && /^\d{4}-\d{2}-\d{2}$/.test(recorrencia.ate) ? recorrencia.ate : null;
  const saida: Array<{ data: string; hora: string }> = [];
  for (let i = 0; i < teto; i++) {
    let data: string;
    if (recorrencia.tipo === "semanal") {
      const d = new Date(Date.UTC(ano, mes - 1, dia + 7 * i));
      data = d.toISOString().slice(0, 10);
    } else {
      const totalDeMeses = mes - 1 + i;
      const a = ano + Math.floor(totalDeMeses / 12);
      const m = (totalDeMeses % 12) + 1;
      const d = Math.min(dia, ultimoDiaDoMes(a, m));
      data = `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    if (ate && data > ate) break;
    saida.push({ data, hora: primeira.hora });
  }
  return saida.length ? saida : [primeira];
}

/** A frase da série para a tela: "toda semana, até 20/12" ou "todo mês, por 12 meses". */
export function fraseDaRecorrencia(r: Recorrencia | null | undefined): string | null {
  if (!r || r.tipo === "nenhuma") return null;
  const base = r.tipo === "semanal" ? "toda semana, neste dia" : "todo mês, neste dia do mês";
  if (r.ate && /^\d{4}-\d{2}-\d{2}$/.test(r.ate)) {
    const [a, m, d] = r.ate.split("-");
    return `${base}, até ${d}/${m}/${a}`;
  }
  return `${base}, por 12 meses`;
}

/** O corpo que a janela manda à rota. Validado de novo no servidor. */
export type PedidoDeConteudoPronto = {
  tipo: TipoDaPeca;
  arquivos: Array<ArquivoMedido & { url: string }>;
  /** O quadro de abertura do vídeo, subido junto, para a capa no quadro. */
  posterUrl?: string | null;
  /** Um destino por linha: conta e lugar. */
  destinos: Array<{ socialAccountId: string; formato: FormatoDeDestino }>;
  /** A primeira saída, em campos de Brasília. */
  data: string;
  hora: string;
  legenda: string;
  /** O que o cliente escreveu sobre o conteúdo, guardado para o histórico. */
  descricao?: string;
  recorrencia?: Recorrencia | null;
};

/**
 * O nome de arquivo seguro para a pasta pública do projeto: sem acento, sem
 * espaço, no máximo 60 caracteres, sem a extensão (quem chama põe a certa).
 */
export function nomeSeguro(nome: string): string {
  return nome.normalize("NFD").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(-60) || "arquivo";
}

/** A extensão pela qual o publicador reconhece vídeo (`/\.(mp4|webm|mov)/` em oauth-post.ts). */
export function extensaoDoMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "video/quicktime":
      return "mov";
    default:
      return "mp4";
  }
}
