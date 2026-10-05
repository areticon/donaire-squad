import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { askClaude } from "@/lib/claude";
import { generateImage } from "@/lib/media/nano-banana";
import { direcaoDaPeca } from "@/lib/media/direcao-de-arte";
import { produzirArtePorRede } from "@/lib/media/arte-por-rede";
import { desenharComFraseEmCodigo, marcaDaArte, promptDaArteSemTexto, type MarcaDaArte } from "@/lib/media/arte-com-frase";
import { mancheteDaPeca } from "@/lib/media/peca-de-feed";
import { desenharInfografico, extrairConteudoDoInfografico } from "@/lib/media/infographic";
import { arteDoDia } from "@/lib/media/pecas-da-semana";
import { formatoDaPeca } from "@/lib/media/formatos-das-redes";
import { pecaPublicavel } from "@/lib/pipeline/guarda-de-texto";
import { textoDaRede } from "@/lib/media/write-posts";
import { REGRA_DE_PESSOAS_E_NUMEROS } from "@/lib/media/regras-de-redacao";
import { encerrarRevisao } from "@/lib/pipeline/revisao-do-card";
import { levarParaOutraRede } from "@/lib/pipeline/levar-para-outra-rede";
import { NOME_DA_REDE } from "@/lib/pipeline/redes";
import { deCampos } from "@/lib/posts/horario-da-peca";
import {
  lerPedidoDoCard,
  pedidoEmCurso,
  type EtapaDoPedido,
  type PedidoDoCard,
} from "@/lib/media/pedido-do-card-estado";
import {
  MODELO_DE_PAPEL,
  NOME_DO_TRATAMENTO,
  pedidoDePaletaEstrita,
  pedidoDePapel,
  pedidoDePretoEBranco,
  tratamentoValido,
  type TratamentoDaFoto,
} from "@/lib/modelos-de-arte/tratamento";
import { modeloPorId } from "@/lib/modelos-de-arte/catalogo";

/**
 * O PEDIDO COMPOSTO DO CHAT DO CARD, feito como tarefa no servidor (05/10).
 *
 * O caso do dono, no card do Paulo de 09/10 (carrossel do Instagram): "tira o
 * 'minha preta' e refaz a arte com a cor escarlate #E3000F". Três defeitos
 * juntos na rota antiga:
 *
 *   1. ela escolhia UM caminho pelo pedido inteiro: achou "arte" e "cor",
 *      mandou tudo para a Diana, e o texto não foi tocado;
 *   2. o carrossel de 3 lâminas foi refeito como UMA imagem (um tríptico), e
 *      essa imagem substituiu as três lâminas no post; e o resultado foi
 *      gravado no card do PAULO (o `where` usava o id de origem), com o prompt
 *      em inglês como conteúdo;
 *   3. tudo dentro da requisição: minutos de spinner, e fechar o modal perdia
 *      o chat.
 *
 * Aqui o pedido vira uma lista de AÇÕES (texto, arte, data, rede), cada uma
 * vira etapa gravada no card, todas são feitas, e a resposta conta o que
 * aconteceu em cada uma, em português de gente, no card em que o pedido foi
 * feito. Quem chama é a rota do chat, por `after()`: a resposta volta na hora
 * e a tela acompanha pelo GET da mesma rota.
 */

type Mensagem = { role: "user" | "assistant"; content: string; timestamp: string };

export type AcaoDoPedido =
  | { tipo: "texto"; instrucao: string; feito?: string }
  | {
      tipo: "arte";
      instrucao: string;
      cor: string | null;
      lamina: number | null;
      marcaToda: boolean;
      /**
       * PALETA ESTRITA (05/10): "somente preto e vermelho", "só as cores da
       * marca". A foto da cena é tratada em código (duotone, ou preto e
       * branco) para cada pixel ser uma cor da paleta; pedir isso ao modelo de
       * imagem não garantia nada (lib/modelos-de-arte/tratamento.ts).
       */
      paletaEstrita?: boolean;
      /** O cliente pediu preto e branco de fato. */
      pretoEBranco?: boolean;
      /** "papel rasgado", "colagem", "recorte": a peça sai no modelo de colagem do book. */
      papel?: boolean;
    }
  | { tipo: "data"; data: string; hora: string | null }
  | { tipo: "rede"; incluir: string[]; tirar: string[] };

const agora = () => new Date().toISOString();

// ── Estado gravado ───────────────────────────────────────────────────────────

/**
 * Grava SÓ a chave do pedido, atômico no banco (jsonb_set): a marca de
 * revisão e o resto do metadata, escritos por outros caminhos ao mesmo tempo,
 * ficam intactos. É um UPDATE de uma linha, não um SET de sessão.
 */
async function gravarPedido(cardId: string, p: PedidoDoCard): Promise<void> {
  const json = JSON.stringify({ ...p, atualizadoEm: agora() });
  await prisma.$executeRaw`UPDATE campaign_cards SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{pedidoDoChat}', ${json}::jsonb, true) WHERE id = ${cardId}`;
}

async function acrescentarNoChat(cardId: string, msgs: Mensagem[]): Promise<Mensagem[]> {
  const c = await prisma.campaignCard.findUnique({ where: { id: cardId }, select: { chatHistory: true } });
  const historico = [...(Array.isArray(c?.chatHistory) ? (c!.chatHistory as Mensagem[]) : []), ...msgs];
  await prisma.campaignCard.update({ where: { id: cardId }, data: { chatHistory: historico as never } });
  return historico;
}

/**
 * Abre o pedido: a mensagem entra no chat NA HORA (fechar o modal não perde
 * nada) e a tarefa fica gravada. Se já existe um pedido em curso, nada é
 * duplicado: devolve o que está em andamento.
 */
export async function abrirPedido(args: {
  cardId: string;
  mensagem: string;
  agenteNome: string;
}): Promise<{ jaFazendo: true; pedido: PedidoDoCard } | { jaFazendo: false; pedido: PedidoDoCard; chatHistory: Mensagem[] }> {
  const card = await prisma.campaignCard.findUnique({ where: { id: args.cardId }, select: { metadata: true } });
  const emCurso = pedidoEmCurso(card?.metadata);
  if (emCurso) return { jaFazendo: true, pedido: emCurso };
  const pedido: PedidoDoCard = {
    id: `p${Date.now().toString(36)}`,
    mensagem: args.mensagem.slice(0, 500),
    estado: "fazendo",
    etapas: [{ chave: "entender", rotulo: "entendendo o pedido", estado: "fazendo" }],
    desde: agora(),
    atualizadoEm: agora(),
    agenteNome: args.agenteNome,
  };
  await gravarPedido(args.cardId, pedido);
  const chatHistory = await acrescentarNoChat(args.cardId, [{ role: "user", content: args.mensagem, timestamp: agora() }]);
  return { jaFazendo: false, pedido, chatHistory };
}

/** O que a tela consulta: o chat e o andamento. */
export async function estadoDoPedido(cardId: string) {
  const c = await prisma.campaignCard.findUnique({
    where: { id: cardId },
    select: { chatHistory: true, metadata: true, content: true, mediaUrl: true },
  });
  if (!c) return null;
  return {
    chatHistory: Array.isArray(c.chatHistory) ? (c.chatHistory as Mensagem[]) : [],
    pedido: lerPedidoDoCard(c.metadata),
    // O metadata inteiro: a marca de revisão sai da tela quando o pedido acaba.
    metadata: c.metadata,
    content: c.content,
    mediaUrl: c.mediaUrl,
  };
}

// ── Entender ─────────────────────────────────────────────────────────────────

const HEX = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i;
const PEDIDO_DE_ARTE = /\b(imagem|imagens|fotos?|artes?|gr[aá]fic\w*|infogr[aá]fic\w*|capas?|ilustra\w*|visual|design|cor|cores|layout|l[aâ]minas?|slides?)\b/i; // palavra inteira: "corrige" não é "cor"

/** Sem o modelo (falhou ou demorou), a leitura por palavra: melhor que nada. */
function entenderNaUnha(mensagem: string): AcaoDoPedido[] {
  const acoes: AcaoDoPedido[] = [];
  const temArte = PEDIDO_DE_ARTE.test(mensagem);
  const temTexto = /\b(tira|tire|remov|texto|legenda|frase|escrev|reescrev|troca a palavra|corrig)/i.test(mensagem) || !temArte;
  if (temTexto) acoes.push({ tipo: "texto", instrucao: mensagem });
  if (temArte) acoes.push(comAsPistasDoTexto({ tipo: "arte", instrucao: mensagem, cor: mensagem.match(HEX)?.[0]?.toUpperCase() ?? null, lamina: null, marcaToda: false }, mensagem));
  return acoes;
}

/**
 * As pistas lidas por palavra valem por cima do que o modelo respondeu: se o
 * cliente escreveu "somente preto e vermelho", é paleta estrita mesmo que o
 * JSON tenha vindo sem o campo.
 */
function comAsPistasDoTexto(a: Extract<AcaoDoPedido, { tipo: "arte" }>, mensagem: string): Extract<AcaoDoPedido, { tipo: "arte" }> {
  const texto = `${a.instrucao}\n${mensagem}`;
  return {
    ...a,
    paletaEstrita: Boolean(a.paletaEstrita) || pedidoDePaletaEstrita(texto),
    pretoEBranco: Boolean(a.pretoEBranco) || pedidoDePretoEBranco(texto),
    papel: Boolean(a.papel) || pedidoDePapel(texto),
  };
}

export async function entenderPedido(args: {
  mensagem: string;
  formato: string;
  laminas: number;
  redes: string[];
  quando: string | null;
  usage: { projectId: string; runId?: string | null };
}): Promise<AcaoDoPedido[]> {
  const sistema = `Você separa o pedido de um cliente, feito no chat de uma peça de rede social, em AÇÕES. Responda APENAS um JSON, sem nada fora dele:
{"acoes": [ ... ]}

Tipos de ação (use quantas o pedido tiver, na ordem em que aparecem):
- {"tipo":"texto","instrucao":"...","feito":"..."}: mudar o TEXTO/legenda do post (tirar palavra, mudar tom, encurtar, corrigir). A instrução repete só a parte do pedido sobre o texto. "feito" é o que vai ser feito contado ao cliente na primeira pessoa, no passado, curto e sem termo técnico, terminando antes de dizer onde (ex.: "tirei o 'minha preta' da legenda", "deixei o texto mais curto").
- {"tipo":"arte","instrucao":"...","cor":"#RRGGBB ou null","lamina":número ou null,"marcaToda":true|false,"paletaEstrita":true|false,"pretoEBranco":true|false,"papel":true|false}: refazer a IMAGEM, o carrossel ou o infográfico. "cor" é a cor pedida em hex (converta nome de cor conhecido: escarlate #E3000F só se o cliente não deu o hex; se deu, use o dele). "lamina" só se o cliente nomeou UMA lâmina/slide (1, 2, 3...). "marcaToda" true só se ele pediu essa cor para a marca inteira ("sempre", "em tudo", "na marca"). "paletaEstrita" true quando ele exige que a arte use SÓ certas cores ("somente preto e vermelho", "só as cores da marca", "use só a paleta", "nada fora da paleta"); "mude para vermelho" não é estrito. "pretoEBranco" true só se pediu preto e branco literalmente. "papel" true se citou papel, papel rasgado, colagem, recorte ou fita adesiva.
- {"tipo":"data","data":"AAAA-MM-DD","hora":"HH:MM ou null"}: mudar o dia/horário de publicação. Resolva "sexta", "amanhã" etc. a partir de hoje.
- {"tipo":"rede","incluir":["instagram"|"linkedin"|"facebook"|"twitter"|"threads"|"tiktok"|"youtube"],"tirar":[...]}: publicar também em outra rede, ou tirar de uma rede.

Pedido composto vira várias ações: "tira X e refaz a arte em vermelho" são DUAS (texto e arte). Não invente ação que não foi pedida.`;
  const usuario = `Hoje: ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" })}.
A peça: ${args.formato}${args.laminas > 1 ? ` de ${args.laminas} lâminas` : ""}, nas redes ${args.redes.join(", ") || "do dia"}${args.quando ? `, marcada para ${args.quando}` : ""}.

Pedido do cliente: ${args.mensagem}`;
  try {
    const bruto = await askClaude(sistema, usuario, { maxTokens: 4000, timeoutMs: 60_000, usage: { operation: "chat_do_card_entender", projectId: args.usage.projectId, runId: args.usage.runId ?? undefined } });
    const json = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as { acoes?: AcaoDoPedido[] };
    const acoes = (json.acoes ?? []).filter((a) => a && ["texto", "arte", "data", "rede"].includes(a.tipo));
    if (acoes.length) {
      // O hex escrito pelo cliente vale mais que o que o modelo converteu.
      const hexDoCliente = args.mensagem.match(HEX)?.[0]?.toUpperCase();
      return acoes.map((a) => (a.tipo === "arte" ? comAsPistasDoTexto(hexDoCliente ? { ...a, cor: hexDoCliente } : a, args.mensagem) : a));
    }
  } catch (e) {
    console.warn("[pedido-do-card] entender falhou, lendo por palavra:", e instanceof Error ? e.message : e);
  }
  return entenderNaUnha(args.mensagem);
}

// ── Executar ─────────────────────────────────────────────────────────────────

type Contexto = {
  cardId: string;
  userId: string;
  mensagem: string;
  /** Lâmina selecionada na tela (0-based), quando o pedido veio de um carrossel. */
  slideIndex: number | null;
};

const DADOS = { project: true } as const;

/** A cor pedida vira a cor de destaque da peça (sem mexer na marca gravada). */
export function marcaComCor(marca: MarcaDaArte, cor: string | null): MarcaDaArte {
  if (!cor) return marca;
  // Com os papéis aprovados (05/10), a cor pedida entra no papel de destaque.
  const cores = { ...marca.cores, acento: cor, ...(marca.cores.papeis ? { papeis: { ...marca.cores.papeis, destaque: cor } } : {}) };
  return {
    ...marca,
    cores,
    ...(marca.identidade ? { identidade: { ...marca.identidade, cores: { ...marca.identidade.cores, acento: cor } } } : {}),
  };
}

/** O que fica gravado no metadata do post e do card da Diana para as próximas regerações. */
export type ArteGravada = { tratamento: TratamentoDaFoto | null; modeloDaArte: string | null };

/** O tratamento e o modelo já gravados num metadata (post ou card), validados. */
export function arteGravadaEm(meta: unknown): ArteGravada {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  return {
    tratamento: tratamentoValido(m.tratamento) ? m.tratamento : null,
    modeloDaArte: typeof m.modeloDaArte === "string" && modeloPorId(m.modeloDaArte) ? m.modeloDaArte : null,
  };
}

/**
 * A MARCA DESTA PEÇA, pelo pedido (05/10): a cor pedida vira o destaque; a
 * paleta estrita vira tratamento da foto (duotone escuro + destaque, ou preto
 * e branco); papel/colagem fixa o modelo de colagem do book. O que o pedido
 * não disse vem do que já estava gravado no post (a regeração seguinte
 * respeita a anterior), e por último da identidade do projeto.
 */
export function marcaDoPedido(
  marca: MarcaDaArte,
  acao: Extract<AcaoDoPedido, { tipo: "arte" }>,
  gravado: ArteGravada
): { marca: MarcaDaArte; decidido: ArteGravada; mudou: { tratamento: boolean; modelo: boolean } } {
  const comCor = marcaComCor(marca, acao.cor);
  // Paleta estrita e preto e branco dão "pb": a foto sem cor e a cor da marca
  // só nos acentos. Nunca duotone por pedido (a foto tingida foi reprovada em
  // 05/10); tingir é escolha explícita da identidade.
  const tratamento: TratamentoDaFoto | null = acao.pretoEBranco || acao.paletaEstrita ? "pb" : (gravado.tratamento ?? comCor.tratamento ?? null);
  const modeloDaArte = acao.papel ? MODELO_DE_PAPEL : gravado.modeloDaArte;
  return {
    marca: { ...comCor, tratamento, ...(modeloDaArte ? { modeloFixo: modeloDaArte } : {}) },
    decidido: { tratamento, modeloDaArte },
    mudou: { tratamento: tratamento !== gravado.tratamento, modelo: modeloDaArte !== gravado.modeloDaArte },
  };
}

/** Grava `tratamento` e `modeloDaArte` no metadata do post e do card, sem tocar no resto (jsonb_set, não SET). */
async function gravarArteNoMetadata(alvos: { postIds: string[]; cardIds: string[] }, decidido: ArteGravada): Promise<void> {
  const json = JSON.stringify({ tratamento: decidido.tratamento, modeloDaArte: decidido.modeloDaArte });
  for (const id of alvos.postIds) {
    await prisma.$executeRaw`UPDATE posts SET metadata = COALESCE(metadata, '{}'::jsonb) || ${json}::jsonb WHERE id = ${id}`;
  }
  for (const id of alvos.cardIds) {
    await prisma.$executeRaw`UPDATE campaign_cards SET metadata = COALESCE(metadata, '{}'::jsonb) || ${json}::jsonb WHERE id = ${id}`;
  }
}

/** A direção da cena quando a foto vai virar dois tons: contraste e forma, não cor. */
function direcaoParaOTratamento(t: TratamentoDaFoto | null): string {
  if (!t) return "";
  return t === "duotone"
    ? "The photo will be tinted in code in two brand tones: compose for strong tonal contrast, simple shapes and a clear silhouette; colour in the scene does not matter."
    : "The photo will be converted in code to black and white (the brand colour goes only on accents added later): compose for strong tonal contrast and simple shapes; colour in the scene does not matter.";
}

/** O que de fato mudou na arte, contado ao cliente. */
function contarOQueMudou(acao: Extract<AcaoDoPedido, { tipo: "arte" }>, decidido: ArteGravada, mudou: { tratamento: boolean; modelo: boolean }): string {
  const partes: string[] = [];
  if (acao.cor) partes.push(`com a cor ${acao.cor}`);
  if (decidido.tratamento && (mudou.tratamento || acao.paletaEstrita || acao.pretoEBranco)) partes.push(`com as fotos ${NOME_DO_TRATAMENTO[decidido.tratamento]}`);
  if (decidido.modeloDaArte && (mudou.modelo || acao.papel)) partes.push(`no modelo ${modeloPorId(decidido.modeloDaArte)?.nome.toLowerCase() ?? "de papel"}`);
  if (!partes.length) return "";
  return partes.length === 1 ? ` ${partes[0]}` : ` ${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
}

export function frasesDoCarrossel(meta: Record<string, unknown> | null | undefined, conteudo: string | null): string[] {
  const slides = meta?.slides;
  if (Array.isArray(slides) && slides.every((s) => typeof s === "string")) return slides as string[];
  // "Carrossel de 3 lâminas:\n1. frase\n2. frase"
  return (conteudo ?? "")
    .split("\n")
    .map((l) => l.match(/^\s*\d+\.\s+(.+)$/)?.[1]?.trim())
    .filter((x): x is string => Boolean(x));
}

/**
 * Roda o pedido inteiro. Nunca lança: cada etapa grava o seu desfecho e a
 * resposta do chat conta o que deu e o que não deu.
 */
export async function executarPedido(ctx: Contexto): Promise<void> {
  const card = await prisma.campaignCard.findUnique({ where: { id: ctx.cardId }, include: DADOS });
  const pedido = lerPedidoDoCard(card?.metadata);
  if (!card || !pedido) return;
  const salvar = () => gravarPedido(card.id, pedido).catch((e) => console.warn("[pedido-do-card] gravar:", e));
  const etapa = (chave: string) => pedido.etapas.find((e) => e.chave === chave)!;
  const marcar = async (chave: string, estado: EtapaDoPedido["estado"], detalhe?: string) => {
    const e = etapa(chave);
    if (!e) return;
    e.estado = estado;
    if (detalhe !== undefined) e.detalhe = detalhe;
    await salvar();
  };
  const frases: string[] = [];
  const revisao = new Set<string>([card.id]);

  try {
    const runId = card.runId;
    const dia = card.dayOfWeek;
    const posts = await prisma.post.findMany({
      where: card.postId && card.cardType !== "publish" && card.cardType !== "media"
        ? { id: card.postId }
        : { runId, dayOfWeek: dia, status: { notIn: ["published", "publishing", "cancelled"] } },
      select: { id: true, platform: true, content: true, imageUrl: true, mediaType: true, metadata: true, scheduledAt: true, status: true, runId: true, dayOfWeek: true, socialAccountId: true },
    });
    const daDiana = card.cardType === "media"
      ? card
      : await prisma.campaignCard.findFirst({
          where: { runId, dayOfWeek: dia, cardType: "media", NOT: { status: "archived" } },
          include: DADOS,
          orderBy: { createdAt: "desc" },
        });
    if (daDiana) revisao.add(daDiana.id);
    const formatoDaPecaDoDia = daDiana?.mediaType ?? posts[0]?.mediaType ?? "text";
    const laminasAtuais = (daDiana?.mediaUrl ?? posts[0]?.imageUrl ?? "").split("|").filter((u) => u.trim().length > 10);
    const ehCarrossel = formatoDaPecaDoDia === "carousel" || laminasAtuais.length > 1;
    const quando = posts.find((p) => p.scheduledAt)?.scheduledAt ?? null;

    const acoes = await entenderPedido({
      mensagem: ctx.mensagem,
      formato: ehCarrossel ? "carrossel" : formatoDaPecaDoDia === "infographic" ? "infográfico" : formatoDaPecaDoDia === "image" ? "imagem" : "post de texto",
      laminas: laminasAtuais.length,
      redes: [...new Set(posts.map((p) => p.platform))],
      quando: quando ? quando.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null,
      usage: { projectId: card.projectId, runId },
    });

    // As etapas que a tela mostra, antes de começar, para o cliente ver o plano.
    etapa("entender").estado = "feito";
    etapa("entender").detalhe = `${acoes.length} ${acoes.length === 1 ? "coisa" : "coisas"} para fazer`;
    for (const a of acoes) {
      if (a.tipo === "texto") pedido.etapas.push({ chave: "texto", rotulo: "reescrevendo o texto", estado: "esperando" });
      if (a.tipo === "arte") {
        if (ehCarrossel) {
          const alvo = alvoDasLaminas(a, ctx, card.cardType, laminasAtuais.length);
          for (const i of alvo) pedido.etapas.push({ chave: `lamina-${i}`, rotulo: `refazendo a lâmina ${i + 1} de ${laminasAtuais.length}`, estado: "esperando" });
        } else {
          pedido.etapas.push({ chave: "arte", rotulo: formatoDaPecaDoDia === "infographic" ? "refazendo o infográfico" : "refazendo a arte", estado: "esperando" });
        }
      }
      if (a.tipo === "data") pedido.etapas.push({ chave: "data", rotulo: "mudando a data", estado: "esperando" });
      if (a.tipo === "rede") pedido.etapas.push({ chave: "rede", rotulo: "mudando as redes", estado: "esperando" });
    }
    await salvar();

    // TEXTO primeiro: leva segundos, e o cliente já vê a legenda nova enquanto a arte sai.
    const texto = acoes.find((a): a is Extract<AcaoDoPedido, { tipo: "texto" }> => a.tipo === "texto");
    if (texto) {
      await marcar("texto", "fazendo");
      try {
        const n = await reescreverTexto(card, posts, texto.instrucao);
        const feito = texto.feito?.trim().replace(/[.!]+$/, "");
        frases.push(
          n > 0
            ? `${feito ? feito.charAt(0).toUpperCase() + feito.slice(1) : "Ajustei o texto como você pediu"} ${redesPorExtenso(posts.map((p) => p.platform))}.`
            : "O texto já estava assim, então não precisei mudar nada nele."
        );
        await marcar("texto", "feito", n > 0 ? undefined : "já estava assim");
      } catch (e) {
        frases.push("Não consegui reescrever o texto agora. Pode pedir de novo, que eu tento mais uma vez.");
        await marcar("texto", "falhou", "não saiu");
        console.warn("[pedido-do-card] texto:", e);
      }
    }

    const arte = acoes.find((a): a is Extract<AcaoDoPedido, { tipo: "arte" }> => a.tipo === "arte");
    if (arte) {
      if (!daDiana) {
        frases.push("Este dia não tem imagem, então não havia arte para refazer.");
      } else {
        try {
          const r = ehCarrossel
            ? await refazerCarrossel({ card, daDiana, posts, acao: arte, ctx, laminasAtuais, marcar })
            : await refazerArteUnica({ daDiana, posts, acao: arte, marcar, formato: formatoDaPecaDoDia });
          frases.push(r);
        } catch (e) {
          frases.push("A arte não saiu desta vez e ficou a que estava. Pode pedir de novo daqui a pouco.");
          console.warn("[pedido-do-card] arte:", e);
        }
        const acentoDaMarca = arte.cor ? (await marcaDaArte(card.projectId).catch(() => null))?.cores.acento : null;
        if (arte.cor && acentoDaMarca?.toUpperCase() !== arte.cor.toUpperCase()) {
          frases.push(
            arte.marcaToda
              ? `Mudei a cor só desta peça. Para ${arte.cor} valer na marca toda, peça à Vera para trocar a cor da marca, que ela atualiza as próximas peças.`
              : `Se quiser essa cor em todas as peças, é só pedir à Vera para trocar a cor da marca.`
          );
        }
      }
    }

    const data = acoes.find((a): a is Extract<AcaoDoPedido, { tipo: "data" }> => a.tipo === "data");
    if (data) {
      await marcar("data", "fazendo");
      const r = await mudarData(posts, data);
      frases.push(r.frase);
      await marcar("data", r.ok ? "feito" : "falhou", r.ok ? undefined : "não mudou");
    }

    const rede = acoes.find((a): a is Extract<AcaoDoPedido, { tipo: "rede" }> => a.tipo === "rede");
    if (rede) {
      await marcar("rede", "fazendo");
      const r = await mudarRedes(posts, rede, ctx.userId, card.projectId);
      frases.push(r.frase);
      await marcar("rede", r.ok ? "feito" : "falhou");
    }

    if (!acoes.length) frases.push("Não entendi o que mudar. Me diga em uma frase o que quer no texto ou na arte.");
    const falhou = pedido.etapas.some((e) => e.estado === "falhou");
    const tudoFalhou = pedido.etapas.filter((e) => e.chave !== "entender").every((e) => e.estado === "falhou");
    pedido.estado = tudoFalhou && pedido.etapas.length > 1 ? "falhou" : "feito";
    // Nunca um "Pronto" genérico (05/10): cada frase conta o que de fato
    // mudou, e quando nada mudou, diz isso. Só a parte feita ganha aviso.
    const abertura = falhou && !tudoFalhou ? "Fiz parte. " : "";
    await acrescentarNoChat(card.id, [{ role: "assistant", content: `${abertura}${frases.join(" ")}`.trim(), timestamp: agora() }]);
    // A marca de revisão sai ANTES do "feito": a tela para de consultar quando
    // lê "feito", e o que ela ler nessa hora é o que fica no cabeçalho.
    await encerrarRevisao([...revisao]);
    await salvar();
  } catch (e) {
    console.error("[pedido-do-card] falhou:", e);
    pedido.estado = "falhou";
    for (const et of pedido.etapas) if (et.estado === "fazendo" || et.estado === "esperando") et.estado = "falhou";
    await encerrarRevisao([...revisao]).catch(() => {});
    await salvar();
    await acrescentarNoChat(card.id, [
      {
        role: "assistant",
        content: `${frases.length ? frases.join(" ") + " " : ""}Tive um problema no meio e parei. O que já estava pronto ficou salvo; pode mandar o pedido de novo para eu terminar.`,
        timestamp: agora(),
      },
    ]).catch(() => {});
  } finally {
    await encerrarRevisao([...revisao]);
  }
}

function alvoDasLaminas(a: Extract<AcaoDoPedido, { tipo: "arte" }>, ctx: Contexto, cardType: string, total: number): number[] {
  if (a.lamina && a.lamina >= 1 && a.lamina <= total) return [a.lamina - 1];
  // A lâmina selecionada na tela só vale no card da Diana, onde o seletor existe.
  if (cardType === "media" && ctx.slideIndex !== null && ctx.slideIndex >= 0 && ctx.slideIndex < total && !/\b(todas|tudo|carrossel|arte)\b/i.test(a.instrucao)) {
    return [ctx.slideIndex];
  }
  return Array.from({ length: total }, (_, i) => i);
}

function redesPorExtenso(redes: string[]): string {
  const nomes = [...new Set(redes)].map((r) => NOME_DA_REDE[r] ?? r);
  return nomes.length <= 1 ? (nomes[0] ? `no ${nomes[0]}` : "no post") : `em ${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}


// ── Texto ────────────────────────────────────────────────────────────────────

async function reescreverTexto(
  card: { projectId: string; runId: string; project: { name: string; voice: string | null } },
  posts: Array<{ id: string; platform: string; content: string }>,
  instrucao: string
): Promise<number> {
  let alterados = 0;
  const porTexto = new Map<string, string>();
  for (const p of posts) {
    if (!p.content?.trim()) continue;
    const chave = `${p.platform}\n${p.content}`;
    let novo = porTexto.get(chave);
    if (!novo) {
      const bruto = await askClaude(
        `Você edita um post de ${NOME_DA_REDE[p.platform] ?? p.platform} do projeto "${card.project.name}". Tom: ${card.project.voice ?? "o do texto atual"}.
Aplique SÓ a instrução do cliente; o resto do texto fica como está (mesmas ideias, mesmo tamanho, mesma ordem). Devolva APENAS o texto final, sem comentário, sem prefixo, sem markdown.
${REGRA_DE_PESSOAS_E_NUMEROS}
- Nunca invente dado, estatística ou referência.`,
        `Texto atual:\n\n${p.content}\n\nInstrução do cliente: ${instrucao}`,
        { maxTokens: 6000, usage: { operation: "chat_do_card_texto", projectId: card.projectId, runId: card.runId } }
      );
      const peca = pecaPublicavel(bruto);
      novo = "recusado" in peca ? p.content : textoDaRede(peca.texto, p.platform);
      porTexto.set(chave, novo);
    }
    if (novo && novo !== p.content) {
      await prisma.post.update({ where: { id: p.id }, data: { content: novo } });
      // O card do redator mostra o mesmo texto (a regra do PATCH do post).
      await prisma.campaignCard.updateMany({
        where: { postId: p.id, cardType: { notIn: ["media", "publish", "preview", "research"] } },
        data: { content: novo },
      });
      p.content = novo;
      alterados++;
    }
  }
  return alterados;
}

// ── Arte ─────────────────────────────────────────────────────────────────────

type CardComProjeto = Prisma.CampaignCardGetPayload<{ include: { project: true } }>;
type PostDoDia = { id: string; platform: string; content: string; imageUrl: string | null; mediaType: string | null; metadata: unknown };

async function refazerCarrossel(o: {
  card: CardComProjeto;
  daDiana: CardComProjeto;
  posts: PostDoDia[];
  acao: Extract<AcaoDoPedido, { tipo: "arte" }>;
  ctx: Contexto;
  laminasAtuais: string[];
  marcar: (chave: string, estado: EtapaDoPedido["estado"], detalhe?: string) => Promise<void>;
}): Promise<string> {
  const { daDiana, acao } = o;
  const meta = (daDiana.metadata as Record<string, unknown> | null) ?? (o.posts[0]?.metadata as Record<string, unknown> | null);
  const frases = frasesDoCarrossel(meta, daDiana.content);
  const total = o.laminasAtuais.length;
  if (frases.length < total) throw new Error("as frases das lâminas não estão gravadas");
  const alvo = alvoDasLaminas(acao, o.ctx, o.card.cardType, total);
  const runId = daDiana.runId;
  const dia = daDiana.dayOfWeek;
  const direcao = await direcaoDaPeca({ projectId: daDiana.projectId, runId, dayOfWeek: dia, infografico: false, preferido: null }).catch(() => ({ styleHint: "" }));
  // O que já estava gravado (tratamento e modelo) vale até o pedido mudar.
  const gravado = arteGravadaEm(daDiana.metadata);
  const { marca, decidido, mudou } = marcaDoPedido(await marcaDaArte(daDiana.projectId, { runId }), acao, gravado);
  const estilo = [
    direcao.styleHint,
    `CLIENT REQUEST FOR THIS CAROUSEL: ${acao.instrucao}`,
    acao.cor ? `Use ${acao.cor} as the dominant accent color of every slide.` : "",
    direcaoParaOTratamento(decidido.tratamento),
  ].filter(Boolean).join("\n");
  const plataforma = o.posts[0]?.platform ?? "instagram";
  const novas = [...o.laminasAtuais];
  let feitas = 0;
  await Promise.all(
    alvo.map(async (i) => {
      await o.marcar(`lamina-${i}`, "fazendo");
      try {
        novas[i] = await arteDoDia(
          { projectId: daDiana.projectId, project: { niche: daDiana.project.niche } },
          frases[i],
          estilo,
          formatoDaPeca(plataforma, "carousel"),
          { projectId: daDiana.projectId, runId },
          frases[0],
          marca
        );
        feitas++;
        await o.marcar(`lamina-${i}`, "feito");
      } catch (e) {
        console.warn(`[pedido-do-card] lâmina ${i + 1}:`, e);
        await o.marcar(`lamina-${i}`, "falhou", "ficou a anterior");
      }
    })
  );
  if (!feitas) throw new Error("nenhuma lâmina saiu");
  const mediaUrl = novas.join("|");
  // Nada mudou de verdade (as mesmas lâminas, byte a byte)? Então é isso que
  // o cliente ouve, e não "refiz".
  if (mediaUrl === o.laminasAtuais.join("|")) return "Tentei refazer as lâminas, mas o resultado saiu igual ao que já estava, então nada mudou no carrossel.";
  // O carrossel é 4:5 em todas as redes: as mesmas lâminas servem a todas.
  await prisma.campaignCard.update({ where: { id: daDiana.id }, data: { mediaUrl } });
  const postsComArte = o.posts.filter((p) => p.mediaType === "carousel" || p.imageUrl);
  for (const p of postsComArte) {
    await prisma.post.update({ where: { id: p.id }, data: { imageUrl: mediaUrl, mediaType: "carousel" } });
  }
  // O tratamento e o modelo ficam gravados: a próxima regeração respeita.
  await gravarArteNoMetadata({ postIds: postsComArte.map((p) => p.id), cardIds: [daDiana.id] }, decidido).catch((e) => console.warn("[pedido-do-card] metadata da arte:", e));
  const oQueMudou = contarOQueMudou(acao, decidido, mudou);
  const falhas = alvo.length - feitas;
  const quais = alvo.length === total ? (total === 1 ? "a lâmina" : `as ${total} lâminas`) : alvo.length === 1 ? `a lâmina ${alvo[0] + 1}` : `${alvo.length} lâminas`;
  return `Refiz ${quais} do carrossel${oQueMudou}, e ${alvo.length === 1 && total > 1 ? "ela já está" : "elas já estão"} aqui no card${falhas ? `; ${falhas === 1 ? "uma não saiu e ficou como estava" : `${falhas} não saíram e ficaram como estavam`}` : ""}.`;
}

async function refazerArteUnica(o: {
  daDiana: CardComProjeto;
  posts: PostDoDia[];
  acao: Extract<AcaoDoPedido, { tipo: "arte" }>;
  marcar: (chave: string, estado: EtapaDoPedido["estado"], detalhe?: string) => Promise<void>;
  formato: string;
}): Promise<string> {
  await o.marcar("arte", "fazendo");
  const { daDiana, acao } = o;
  const base = o.posts[0];
  const textoDoPost = base?.content ?? "";
  const gravado = arteGravadaEm(daDiana.metadata);
  const { marca, decidido, mudou } = marcaDoPedido(await marcaDaArte(daDiana.projectId, { runId: daDiana.runId }), acao, gravado);
  const ehInfografico = o.formato === "infographic";
  const pedidoVisual = `${acao.instrucao}${acao.cor ? `. Use ${acao.cor} as the dominant accent color.` : ""}${decidido.tratamento ? ` ${direcaoParaOTratamento(decidido.tratamento)}` : ""}`;
  try {
    const conteudo =
      ehInfografico && process.env.GEMINI_API_KEY
        ? await extrairConteudoDoInfografico(`${textoDoPost}\n\n[INSTRUÇÃO DE ESTILO DO CLIENTE, mantenha o conteúdo: ${pedidoVisual}]`, daDiana.project.niche ?? "negocios", process.env.GEMINI_API_KEY)
        : null;
    const frase = (daDiana.metadata as { frase?: string } | null)?.frase;
    const peca = conteudo
      ? null
      : await mancheteDaPeca({ textoDoPost, estiloVisual: pedidoVisual, nicho: daDiana.project.niche, projectId: daDiana.projectId, runId: daDiana.runId });
    const manchete = frase ?? peca?.manchete ?? "";
    const arte = await produzirArtePorRede({
      redes: [...new Set(o.posts.map((p) => p.platform))],
      contentType: ehInfografico ? "infographic" : "image",
      promptBase: conteudo ? "" : promptDaArteSemTexto({ visual: `${peca?.visual ?? ""}\n${pedidoVisual}`, marca }),
      textoEsperado: conteudo ? undefined : [manchete],
      textoDoPost,
      projectId: daDiana.projectId,
      runId: daDiana.runId,
      desenhar: conteudo
        ? async (_p, proporcao) => {
            const url = await desenharInfografico(conteudo, process.env.GEMINI_API_KEY ?? "", proporcao, { estilo: pedidoVisual, paleta: "", marca });
            if (!url) throw new Error("o infográfico não foi montado");
            return url;
          }
        : desenharComFraseEmCodigo(manchete, marca, (prompt, proporcao) => generateImage(prompt, proporcao, "hd")),
    });
    if (!arte.principal) throw new Error("a arte não saiu");
    if (arte.principal === daDiana.mediaUrl) {
      await o.marcar("arte", "feito", "saiu igual");
      return `Tentei refazer ${ehInfografico ? "o infográfico" : "a arte"}, mas saiu igual ao que já estava, então nada mudou.`;
    }
    await prisma.campaignCard.update({ where: { id: daDiana.id }, data: { mediaUrl: arte.principal } });
    for (const p of o.posts) {
      const nova = arte.porRede[p.platform] ?? arte.principal;
      if (p.imageUrl !== nova) await prisma.post.update({ where: { id: p.id }, data: { imageUrl: nova } });
    }
    if (!ehInfografico) {
      await gravarArteNoMetadata({ postIds: o.posts.map((p) => p.id), cardIds: [daDiana.id] }, decidido).catch((e) => console.warn("[pedido-do-card] metadata da arte:", e));
    }
    await o.marcar("arte", "feito");
    const oQueMudou = ehInfografico ? (acao.cor ? ` com a cor ${acao.cor}` : "") : contarOQueMudou(acao, decidido, mudou);
    return `Refiz ${ehInfografico ? "o infográfico" : "a arte"}${oQueMudou}, e ${ehInfografico ? "ele já está" : "ela já está"} aqui no card.`;
  } catch (e) {
    await o.marcar("arte", "falhou", "ficou a anterior");
    throw e;
  }
}

// ── Data e rede ──────────────────────────────────────────────────────────────

async function mudarData(
  posts: Array<{ id: string; status: string; scheduledAt: Date | null }>,
  a: Extract<AcaoDoPedido, { tipo: "data" }>
): Promise<{ ok: boolean; frase: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.data)) return { ok: false, frase: "Não entendi para qual dia mudar. Me diga a data, por exemplo 10/10 às 9h." };
  const horaAtual = posts.find((p) => p.scheduledAt)?.scheduledAt;
  const hora = a.hora && /^\d{2}:\d{2}$/.test(a.hora)
    ? a.hora
    : horaAtual
      ? horaAtual.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
      : "09:00";
  const quando = deCampos(a.data, hora);
  if (quando.getTime() < Date.now()) return { ok: false, frase: "A data que entendi já passou, então não mudei. Me diga um dia e horário que ainda vão chegar." };
  let n = 0;
  for (const p of posts) {
    await prisma.post.update({ where: { id: p.id }, data: { scheduledAt: quando, ...(p.status === "scheduled" ? {} : { status: "draft" }) } });
    n++;
  }
  const rotulo = quando.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return n ? { ok: true, frase: `Mudei a publicação para ${rotulo}.` } : { ok: false, frase: "Não havia post deste dia para mudar de data." };
}

async function mudarRedes(
  posts: Array<{ id: string; platform: string; status: string }>,
  a: Extract<AcaoDoPedido, { tipo: "rede" }>,
  userId: string,
  projectId: string
): Promise<{ ok: boolean; frase: string }> {
  const frases: string[] = [];
  let ok = true;
  const origem = posts[0];
  for (const rede of a.incluir ?? []) {
    if (posts.some((p) => p.platform === rede)) continue;
    const conta = await prisma.socialAccount.findFirst({ where: { projectId, platform: rede }, select: { id: true } });
    const nome = NOME_DA_REDE[rede] ?? rede;
    if (!conta || !origem) {
      frases.push(`Não levei para o ${nome}: a conta não está conectada. Conecte em Redes e me peça de novo.`);
      ok = false;
      continue;
    }
    const r = await levarParaOutraRede({ postId: origem.id, contaDestinoId: conta.id, userId });
    if (r.ok) frases.push(`Levei a peça para o ${nome}, em rascunho, com o texto adaptado.`);
    else {
      ok = false;
      frases.push(r.erro === "sem_saldo" ? `Não levei para o ${nome}: faltam créditos.` : r.erro === "ja_existe" ? `A peça já existe no ${nome}.` : `Não consegui levar para o ${nome}.`);
    }
  }
  const tirar = (a.tirar ?? []).filter((r) => posts.some((p) => p.platform === r));
  if (tirar.length) {
    const sobra = posts.filter((p) => !tirar.includes(p.platform));
    if (!sobra.length) {
      frases.push("Não tirei: seria a única rede do dia. Se quiser cancelar o dia, use o botão de tirar da fila.");
      ok = false;
    } else {
      await prisma.post.updateMany({ where: { id: { in: posts.filter((p) => tirar.includes(p.platform)).map((p) => p.id) } }, data: { status: "cancelled" } });
      frases.push(`Tirei do ${tirar.map((r) => NOME_DA_REDE[r] ?? r).join(" e do ")}; a peça fica arquivada, dá para trazer de volta.`);
    }
  }
  return { ok, frase: frases.join(" ") || "As redes já estavam assim." };
}
