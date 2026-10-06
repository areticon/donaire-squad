import { lerArrobaDoYouTube, type LinkDoCliente } from "@/lib/projeto/links-do-cliente";
import { NOME_DA_REDE } from "@/lib/pipeline/redes";
import {
  datasDoPlano,
  DIAS_DA_SEMANA,
  ROTULO_DO_FORMATO,
  rotuloDaRedeNoFormato,
  type ChaveDoDia,
  type FormatoDoDia,
  type RedeDoPlano,
  type SemanaDoVideo,
} from "@/lib/media/semana-do-video";

/**
 * O ELO DA CAMPANHA DE VÍDEO (05/10, noite, regras do Bruno).
 *
 * Uma semana a partir de um vídeo é UMA campanha, e as peças se chamam umas
 * às outras:
 *
 *   1. a descrição do vídeo completo no YouTube (e a de todo post de vídeo)
 *      termina com as redes do cliente e os links cadastrados por ele, um por
 *      linha, sem inventar link (`blocoDeLinksDaDescricao`);
 *   2. todo corte convida para o vídeo completo: com o link quando o completo
 *      já está no ar, e "no meu canal do YouTube" antes disso. Quando o
 *      completo publica, os cortes ainda não publicados recebem o link
 *      (`conviteAoCompleto`, `legendaComLinkDoCompleto`; quem grava é
 *      lib/media/cortes-com-link-do-completo.ts);
 *   3. as outras peças da semana chamam a peça anterior e o completo. QUEM
 *      chamar é regra de código (a peça do dia anterior no plano, mais o
 *      completo), e o texto da chamada é escrito pelo redator na MESMA chamada
 *      que escreve a peça (`eloDaCampanha` entra no pedido dele): nenhuma
 *      rodada de revisão por LLM e nenhuma decisão de LLM sobre quem chamar.
 *
 * Tudo aqui é puro: a sincronização dos cortes, o completo no quadro, os
 * redatores da semana, as adaptações e a publicação leem destas funções, e a
 * prova roda em memória (scripts/tmp/prova-elo-da-campanha-0510.mts).
 *
 * Nenhum texto gerado aqui leva travessão.
 */

export type ContaDoCliente = { platform: string; username?: string | null; displayName?: string | null };

export type PerfilDoCliente = {
  rede: string;
  rotulo: string;
  /** O @ limpo, quando a conta tem um ("prdonaire"); nulo quando só há o nome. */
  handle: string | null;
  /** O nome de exibição da conta, aparado. */
  nome: string | null;
  /** O endereço público do perfil, só nas redes em que ele sai do @ sem adivinhar. */
  url: string | null;
};

/**
 * As redes em que a URL na legenda é clicável e não derruba o alcance. As
 * outras (LinkedIn, Instagram, TikTok) seguem a regra de 03/10 em
 * lib/projeto/links-do-cliente.ts: nenhuma URL no texto.
 */
const REDES_COM_URL = new Set(["youtube", "facebook", "twitter"]);

export function redeAceitaUrl(rede: string): boolean {
  return REDES_COM_URL.has(rede);
}

/** O @ só vale se parece um @ de verdade; "Bruno Donaire " (o YouTube grava o nome) não vira link. */
function handleValido(bruto: string | null | undefined): string | null {
  const h = (bruto ?? "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9._-]{1,60}$/.test(h) ? h : null;
}

/**
 * O endereço do perfil a partir do @, SÓ nas redes em que o endereço é o @ e
 * nada mais (Instagram, TikTok, X, e o YouTube quando a conta tem @handle).
 * LinkedIn e Facebook não entram: o endereço deles não sai do nome, e
 * adivinhar seria inventar link.
 */
function urlDoPerfil(rede: string, handle: string | null, usernameBruto: string | null | undefined): string | null {
  if (!handle) return null;
  if (rede === "instagram") return `https://www.instagram.com/${handle}`;
  if (rede === "tiktok") return `https://www.tiktok.com/@${handle}`;
  if (rede === "twitter") return `https://x.com/${handle}`;
  if (rede === "youtube" && (usernameBruto ?? "").trim().startsWith("@")) return `https://www.youtube.com/@${handle}`;
  return null;
}

/**
 * Um perfil por rede conectada, na ordem em que as contas vieram.
 *
 * O `config` do projeto é opcional e serve ao YouTube (06/10): a conexão grava
 * o NOME do canal como username, e sem @ o canal não tem endereço. Quando o
 * cliente escreveu o @ do canal (`config.arrobaDoYouTube`, ver
 * lib/projeto/links-do-cliente.ts), a conta do YouTube sem @ usa esse, e o
 * nome do canal continua como nome.
 */
export function perfisDoCliente(contas: ContaDoCliente[], config?: unknown): PerfilDoCliente[] {
  const arrobaDoYouTube = config === undefined ? null : lerArrobaDoYouTube(config);
  const vistos = new Set<string>();
  const perfis: PerfilDoCliente[] = [];
  for (const c of contas) {
    const rede = c.platform;
    if (!rede || vistos.has(rede)) continue;
    const semArroba = rede === "youtube" && arrobaDoYouTube && !(c.username ?? "").trim().startsWith("@");
    const username = semArroba ? `@${arrobaDoYouTube}` : c.username;
    // O nome do canal que a conexão gravou no username não se perde.
    const nome = (c.displayName ?? "").trim() || (semArroba ? (c.username ?? "").trim() || null : null);
    const handle = handleValido(username);
    if (!handle && !nome) continue;
    vistos.add(rede);
    perfis.push({ rede, rotulo: NOME_DA_REDE[rede] ?? rede, handle, nome, url: urlDoPerfil(rede, handle, username) });
  }
  return perfis;
}

/** O nome do canal do YouTube do cliente, para chamar o completo pelo nome quando não há link. */
export function nomeDoCanal(contas: ContaDoCliente[], config?: unknown): string | null {
  const yt = perfisDoCliente(contas, config).find((p) => p.rede === "youtube");
  return yt?.nome ?? (yt?.handle ? `@${yt.handle}` : null);
}

/** Como o perfil aparece numa linha da descrição: URL onde a rede aceita, @ onde não. */
function linhaDoPerfil(p: PerfilDoCliente, comUrl: boolean): string {
  const valor = comUrl && p.url ? p.url : p.handle ? `@${p.handle}` : p.nome;
  return `${p.rotulo}: ${valor}`;
}

/**
 * O BLOCO DO FIM DA DESCRIÇÃO: as redes do cliente e os links cadastrados,
 * um por linha, no que a rede do post aceita.
 *
 *   - YouTube: todos os links (o principal primeiro) e os perfis com endereço;
 *   - Facebook: um link só (o principal) e os perfis pelo @;
 *   - LinkedIn, Instagram e TikTok: só os perfis pelo @ (nenhuma URL);
 *   - X: nada (280 caracteres não comportam bloco).
 *
 * A própria rede do post fica de fora da lista de perfis: ninguém lista o
 * Instagram na legenda do Instagram. Vazio quando não há o que listar.
 */
export function blocoDeLinksDaDescricao(args: { rede: string; links: LinkDoCliente[]; contas: ContaDoCliente[]; config?: unknown }): string {
  const { rede, links, contas } = args;
  if (rede === "twitter") return "";
  const comUrl = redeAceitaUrl(rede);
  const perfis = perfisDoCliente(contas, args.config).filter((p) => p.rede !== rede);
  const linhasDeLink = comUrl
    ? (rede === "youtube" ? links : links.slice(0, 1)).map((l) => `${l.cta ?? l.rotulo}: ${l.url}`)
    : [];
  const linhas = [...linhasDeLink, ...perfis.map((p) => linhaDoPerfil(p, rede === "youtube"))];
  if (!linhas.length) return "";
  return [linhasDeLink.length ? "Links:" : "Minhas redes:", ...linhas].join("\n");
}

export type ConviteArgs = {
  /** A rede do post do corte. */
  rede: string;
  /** O título do vídeo completo (a primeira linha do post do YouTube). */
  titulo: string | null;
  /** O link do completo no YouTube, só depois de publicado. */
  url: string | null;
  /** O nome do canal do cliente, para chamar pelo nome quando não há link. */
  canal?: string | null;
};

/**
 * O CONVITE AO COMPLETO que fecha a descrição de todo corte. Uma frase fixa,
 * montada em código de propósito: é ela que a publicação do completo acha e
 * troca pela versão com link (`legendaComLinkDoCompleto`).
 */
export function conviteAoCompleto(args: ConviteArgs): string {
  const { rede, url } = args;
  const titulo = args.titulo?.trim().replace(/\s+/g, " ") || null;
  const canal = args.canal?.trim() || null;
  if (rede === "twitter") {
    // O X tem 280 caracteres para o texto do corte e o convite juntos.
    return url ? `Completo no YouTube: ${url}` : "Completo no meu canal do YouTube.";
  }
  const abertura = titulo ? `Esse trecho é do vídeo completo "${titulo}".` : "Esse trecho é de um vídeo completo.";
  if (url && redeAceitaUrl(rede)) return `${abertura} Assista inteiro no YouTube: ${url}`;
  if (url && rede === "linkedin") return `${abertura} O link do vídeo completo está no primeiro comentário.`;
  if (rede === "youtube") return `${abertura} Assista inteiro aqui no canal.`;
  return canal ? `${abertura} Assista inteiro no YouTube, no canal ${canal}.` : `${abertura} Assista inteiro no meu canal do YouTube.`;
}

/** A linha do convite, em qualquer das formas acima, para achar e trocar. */
const LINHA_DO_CONVITE = /^(?:Esse trecho é d[eo] (?:um )?vídeo completo.*|Completo no (?:YouTube: \S+|meu canal do YouTube\.))$/m;

export function temConvite(texto: string): boolean {
  return LINHA_DO_CONVITE.test(texto);
}

const TETO_DO_X = 280;
/** O X conta qualquer URL como 23 caracteres. */
function tamanhoNoX(texto: string): number {
  return texto.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
}

/**
 * A DESCRIÇÃO DE UM CORTE: a legenda do redator, o convite ao completo e o
 * bloco de links da rede. No X, o convite só entra se couber nos 280.
 */
export function descricaoDoCorte(args: ConviteArgs & { legenda: string; links: LinkDoCliente[]; contas: ContaDoCliente[]; config?: unknown }): string {
  const legenda = args.legenda.trim();
  const convite = conviteAoCompleto(args);
  if (args.rede === "twitter") {
    const junto = `${legenda}\n\n${convite}`;
    return tamanhoNoX(junto) <= TETO_DO_X ? junto : legenda;
  }
  const bloco = blocoDeLinksDaDescricao({ rede: args.rede, links: args.links, contas: args.contas, config: args.config });
  return [legenda, convite, bloco].filter(Boolean).join("\n\n");
}

/**
 * A LEGENDA DE UM CORTE DEPOIS QUE O COMPLETO PUBLICOU: a linha do convite
 * sem link vira a linha com link; corte que nasceu sem convite (campanha de
 * antes desta regra) ganha o convite no fim. Devolve nulo quando não há o que
 * mudar (já tem o link, ou a rede não aceita URL e o texto já chama pelo
 * nome, ou não cabe nos 280 do X).
 */
export function legendaComLinkDoCompleto(texto: string, args: ConviteArgs & { url: string }): string | null {
  if (texto.includes(args.url)) return null;
  const novo = conviteAoCompleto(args);
  const atual = texto.match(LINHA_DO_CONVITE)?.[0];
  if (atual === novo) return null;
  const trocado = atual ? texto.replace(atual, novo) : `${texto.trim()}\n\n${novo}`;
  if (args.rede === "twitter" && tamanhoNoX(trocado) > TETO_DO_X) return null;
  return trocado;
}

/**
 * A regra de link da rede, dita ao redator (e a quem adapta). Entra no
 * pedido para a chamada sair certa na primeira escrita.
 */
export function regraDeLinkDaRede(rede: string, url: string | null): string {
  const nome = NOME_DA_REDE[rede] ?? rede;
  if (redeAceitaUrl(rede)) {
    if (!url) return `No ${nome} a URL poderia ir no texto, mas o vídeo completo ainda não tem link publicado: chame pelo nome do canal, sem URL.`;
    return rede === "twitter"
      ? `No X a URL vai só no último tweet, exatamente assim: ${url}`
      : `No ${nome} a URL pode ir no texto, exatamente assim: ${url}`;
  }
  if (rede === "linkedin") return "No LinkedIn nenhuma URL no texto (derruba o alcance): chame o vídeo completo pelo nome do canal do YouTube.";
  return `No ${nome} nenhuma URL na legenda e nada de "link na bio": chame o vídeo completo pelo nome do canal do YouTube.`;
}

/** A regra de link quando um texto é ADAPTADO para outra rede. */
export function regraDeLinkNaAdaptacao(rede: string): string {
  const nome = NOME_DA_REDE[rede] ?? rede;
  const base = "Se o post original chama para o vídeo completo ou para outra peça da campanha, mantenha a chamada.";
  if (redeAceitaUrl(rede)) return `${base} Uma URL do original pode ficar, exatamente como está${rede === "twitter" ? ", e só no último tweet" : ""}.`;
  return `${base} Mas no ${nome} nenhuma URL vai no texto: troque qualquer URL do original pelo nome do canal ou da rede (nada de "link na bio").`;
}

export type PecaDoPlano = {
  dia: number;
  formato: FormatoDoDia;
  redes: RedeDoPlano[];
  /** O título do corte, nos dias de vídeo curto. */
  tituloDoCorte: string | null;
};

/**
 * As peças do plano NA ORDEM EM QUE VÃO AO AR, com o corte de cada dia de
 * vídeo curto resolvido pela mesma regra da sincronização (o primeiro corte
 * marcado vai no primeiro dia de vídeo curto, o segundo no segundo, em
 * rodízio). `cortes` são os títulos dos cortes marcados, na ordem deles.
 */
export function pecasDoPlano(semana: SemanaDoVideo, cortes: string[]): PecaDoPlano[] {
  const ordem = semana.inicio ? datasDoPlano(semana.inicio) : DIAS_DA_SEMANA;
  const pecas: PecaDoPlano[] = [];
  let k = 0;
  for (const { dia } of ordem) {
    const d = semana.dias[String(dia) as ChaveDoDia];
    if (!d) continue;
    let tituloDoCorte: string | null = null;
    if (d.formato === "short") {
      tituloDoCorte = cortes.length ? (cortes[k % cortes.length] ?? null) : null;
      k++;
    }
    pecas.push({ dia, formato: d.formato, redes: d.redes, tituloDoCorte });
  }
  return pecas;
}

const nomeDoDia = (dia: number) => DIAS_DA_SEMANA[dia - 1]?.nome ?? "outro dia";

/** A peça com o artigo certo ("a imagem", "o carrossel"); o rótulo vem da tabela dos formatos. */
const ARTIGO_DO_FORMATO: Partial<Record<FormatoDoDia, string>> = { image: "a", carousel: "o", infographic: "o", thread: "a", poll: "a" };
function nomeDaPeca(formato: FormatoDoDia): string {
  if (formato === "text" || formato === "free") return "o post";
  const rotulo = (ROTULO_DO_FORMATO[formato] ?? "post").toLowerCase();
  return `${ARTIGO_DO_FORMATO[formato] ?? "o"} ${rotulo}`;
}

/** Como uma peça é dita a outro redator ("o corte 'X' de terça (X, Reels, TikTok, Shorts)"). */
export function descreverPeca(peca: PecaDoPlano, angulo?: string | null): string {
  const redes = peca.redes.map((r) => rotuloDaRedeNoFormato(r, peca.formato));
  const onde = redes.length ? ` (${redes.join(", ")})` : "";
  if (peca.formato === "short") {
    return peca.tituloDoCorte ? `o corte "${peca.tituloDoCorte}" de ${nomeDoDia(peca.dia)}${onde}` : `o corte de ${nomeDoDia(peca.dia)}${onde}`;
  }
  const sobre = angulo?.trim() ? `, sobre ${angulo.trim().replace(/[.]+$/, "")}` : "";
  return `${nomeDaPeca(peca.formato)} de ${nomeDoDia(peca.dia)}${onde}${sobre}`;
}

/** A peça do dia anterior no plano (a que vai ao ar logo antes desta), ou nula na primeira. */
export function pecaAnterior(pecas: PecaDoPlano[], dia: number): PecaDoPlano | null {
  const i = pecas.findIndex((p) => p.dia === dia);
  return i > 0 ? pecas[i - 1] : null;
}

/**
 * O ELO que entra no pedido do redator do dia. A escolha de quem chamar já
 * está feita (o completo sempre; a peça anterior quando existe); o redator só
 * escreve a chamada, no fecho, na voz de quem fala.
 */
export function eloDaCampanha(args: {
  dia: number;
  rede: string;
  pecas: PecaDoPlano[];
  completo: { titulo: string | null; url: string | null; canal: string | null };
  angulos?: Array<{ dia: number; texto: string }>;
}): string {
  const { dia, rede, pecas, completo } = args;
  const anterior = pecaAnterior(pecas, dia);
  const anguloDe = (d: number) => args.angulos?.find((a) => a.dia === d)?.texto ?? null;
  const titulo = completo.titulo?.trim() ? `"${completo.titulo.trim()}"` : "da semana";
  const ondeEstaOCompleto = completo.url
    ? `já publicado no YouTube: ${completo.url}`
    : `no canal ${completo.canal ? `${completo.canal} ` : ""}do YouTube, ainda sem link publicado`;
  const linhaAnterior = anterior
    ? `- Peça anterior desta campanha: ${descreverPeca(anterior, anguloDe(anterior.dia))}.`
    : "- Esta é a primeira peça da semana: chame só o vídeo completo.";
  return `

ELO DA CAMPANHA (as peças desta semana se chamam umas às outras; quem chamar já está decidido aqui, você só escreve a chamada):
- Vídeo completo ${titulo}, ${ondeEstaOCompleto}.
${linhaAnterior}
- No fecho, em uma ou duas frases na voz de quem fala, convide quem lê para o vídeo completo${anterior ? " e para a peça anterior" : ""}. ${regraDeLinkDaRede(rede, completo.url)}
- Não invente link, título, rede ou peça que não esteja listado aqui.`;
}
