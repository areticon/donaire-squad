import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import type { Ferramenta } from "@/lib/claude/ferramentas";
import { pecaPublicavel } from "@/lib/pipeline/guarda-de-texto";
import { NOME_DA_REDE } from "@/lib/pipeline/redes";
import { listarRegras, parecencaDaRegra } from "@/lib/referencias/regras";
import { carregarNotas } from "@/lib/cerebro/carregar";
import { buscarNotas, cortar, dataCurta as dataDaNota } from "@/lib/cerebro/montagem";
import { ROTULO_DA_ESFERA } from "@/lib/cerebro/tipos";
import { ALVOS_DA_REGRA, ROTULO_DO_ALVO, type AlvoDaRegra, type RegraDoProjeto } from "@/lib/referencias/tipos-das-analises";
import {
  DIAS_DA_SEMANA,
  FORMATOS,
  NOME_DA_REDE_NO_PLANO,
  ROTULO_DO_FORMATO,
  diaComFormato,
  normalizarSemana,
  ordenarRedes,
  planoParaGravar,
  redesDoFormato,
  type ChaveDoDia,
  type FormatoDoDia,
  type RedeDoPlano,
  type SemanaDoVideo,
} from "@/lib/media/semana-do-video";
import { CATALOGO_DE_ESTILOS, EFEITOS, LOOKS, MOVIMENTOS_DE_CAMERA, estiloDoCatalogo, normalizarEscolha } from "@/lib/media/catalogo-de-estilos";
import { MODELOS_DE_ARTE, modeloPorId } from "@/lib/modelos-de-arte/catalogo";
import { CHAVE_DA_ESCOLHA, TIPO_DA_ESCOLHA } from "@/lib/modelos-de-arte/escolha";
import { lerLinks, TIPOS_DE_LINK } from "@/lib/projeto/links-do-cliente";
import { custoDeRefazerPeca, estimarCampanha } from "@/lib/credits/estimativa";
import { decidirCortesia, cortesiasDeHoje, reprovadaPelaRevisora } from "@/lib/credits/cortesia";
import { instanteLocalSeguro } from "@/lib/fuso";
import { diaEHora } from "@/lib/posts/horario-da-peca";
import { artesPendentes, agruparArtes, custoDasArtes, resumoDasArtes } from "@/lib/vera/regerar-arte";
import type { AcaoDoPedido, Escrita, Mudanca } from "@/lib/vera/pedidos";
import { normalizarPaleta } from "@/lib/marca/cores-da-marca";

/**
 * AS FERRAMENTAS DA VERA GERENTE (04/10/2026).
 *
 * Pedido do Bruno: "eu posso pedir o que eu quiser e ela aplica, ela é a
 * gerente. Por exemplo: os textos estão usando como eu chamo minha esposa
 * (minha preta) para falar com o público geral; quero pedir para remover".
 *
 * Duas famílias, e a fronteira entre elas é o produto:
 *
 *   LER: o projeto, as regras, a agenda, as peças, os catálogos. Livre.
 *
 *   PREPARAR: nenhuma ferramenta daqui grava NADA. Cada uma lê o valor de
 *   hoje, monta o valor novo e põe os dois no PLANO do pedido (ver
 *   lib/vera/pedidos.ts). Quem grava é a rota, depois da conversa: na hora,
 *   se a mudança é pequena, ou no toque em "Aplicar", se é ampla. Com isso a
 *   Vera nunca diz "fiz" sobre o que não foi gravado, que é o defeito que o
 *   squad inteiro foi construído para não ter (parte 135).
 *
 * PRESO AO PROJETO E À CONTA em código, não no prompt: toda busca filtra por
 * `projectId`, e o que é configuração da marca (regras, setup, cores, links,
 * modelos de arte) só o DONO muda, a mesma régua de lib/equipe/permissoes.ts.
 * Publicar não existe aqui.
 */

export type PlanoDaVera = { mudancas: Mudanca[]; acoes: AcaoDoPedido[] };

export type ContextoDaGerente = {
  projectId: string;
  userId: string;
  ehDono: boolean;
  /** "Só quem administra a conta (Fulano) pode..." */
  fraseSoODono: (oQue: string) => string;
  plano: PlanoDaVera;
};

const PENDENTE = ["draft", "scheduled", "failed"];
/** Como a pessoa chama cada estado: a Vera dizia "agendada" para rascunho. */
const ESTADO: Record<string, string> = { draft: "rascunho", scheduled: "agendada", failed: "falhou ao publicar" };
const CARDS_DE_TEXTO = ["post_linkedin", "post_twitter", "video_clip", "video_completo"];
const MAX_PECAS_POR_PEDIDO = 20;

const semTravessao = (t: string) => t.replace(/\s*[—–]\s*/g, ", ").replace(/[ \t]+/g, " ").trim();

/** Sem acento e em minúscula, para achar "minha preta" escrito de qualquer jeito. */
export function sem(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function contem(texto: string, termo: string): boolean {
  return sem(texto).includes(sem(termo));
}

/**
 * O pedaço do texto em volta da mudança, para a tela mostrar antes e depois
 * sem o post inteiro: a frase mudada com um pouco de contexto, cortada em
 * palavra inteira e sem as linhas em branco do post.
 */
export function trechoDaMudanca(antes: string, depois: string, folga = 70): { antes: string; depois: string } {
  let i = 0;
  while (i < antes.length && i < depois.length && antes[i] === depois[i]) i++;
  let a = antes.length;
  let d = depois.length;
  while (a > i && d > i && antes[a - 1] === depois[d - 1]) {
    a--;
    d--;
  }
  const corte = (t: string, fim: number) => {
    let ini = Math.max(0, i - folga);
    let ate = Math.min(t.length, fim + folga);
    if (ini > 0) ini = t.indexOf(" ", ini) + 1 || ini;
    if (ate < t.length) ate = Math.max(fim, t.lastIndexOf(" ", ate));
    const miolo = t.slice(ini, ate).replace(/\n\s*\n+/g, "\n").trim();
    return `${ini > 0 ? "… " : ""}${miolo}${ate < t.length ? " …" : ""}`;
  };
  return { antes: corte(antes, a), depois: corte(depois, d) };
}

function resumoDoPlano(plano: PlanoDaVera): { amplo: boolean; custo: number; frase: string } {
  const pecas = plano.mudancas.filter((m) => m.escritas.some((e) => e.onde === "post" || e.onde === "card")).length;
  const marca = plano.mudancas.some((m) =>
    m.escritas.some(
      (e) =>
        (e.onde === "projeto" && ["niche", "targetAudience", "voice", "colorPalette", "videoEstiloEscolha"].includes(e.campo)) ||
        e.onde === "config" ||
        (e.onde === "memoria" && e.tipo === TIPO_DA_ESCOLHA) ||
        (e.onde === "memoria" && e.depois === null)
    )
  );
  const custo = plano.acoes.reduce((s, a) => s + a.custo, 0);
  const amplo = pecas > 1 || marca || plano.acoes.length > 0;
  const frase = amplo
    ? `Anotado no plano. O pedido até aqui é AMPLO (${plano.mudancas.length + plano.acoes.length} itens${custo ? `, ${custo} créditos` : ""}): NADA dele está gravado, nem a regra; tudo só passa a valer quando a pessoa tocar em Aplicar.`
    : "Anotado no plano. O pedido até aqui é PEQUENO: ele é gravado assim que você terminar de responder, e a pessoa pode desfazer com um toque.";
  return { amplo, custo, frase };
}

export function classificarPlano(plano: PlanoDaVera) {
  return resumoDoPlano(plano);
}

/**
 * Reescreve um texto aplicando SÓ a instrução. Devolve nulo quando não deu
 * (bastidor no lugar da peça, ou o termo continua lá depois de duas tentativas).
 */
async function reescrever(args: {
  projectId: string;
  projeto: { name: string; voice: string | null };
  rede: string;
  texto: string;
  instrucao: string;
  termo?: string;
}): Promise<string | null> {
  const sistema = `Você é a Vera, gerente do squad de conteúdo do projeto "${args.projeto.name}". O cliente pediu uma correção numa peça que ainda não foi publicada.
Edite o texto aplicando SÓ a instrução. Todo o resto fica igual: tamanho, estrutura, quebras de linha, hashtags, links, menções, fatos e números. Não melhore, não resuma, não acrescente nada.
Se a correção deixar uma frase manca (um vocativo que sumiu do começo, por exemplo), ajuste só o mínimo para a frase continuar natural.
Tom de voz da marca: ${(args.projeto.voice ?? "profissional").slice(0, 800)}
Nunca use travessão: use vírgula, dois-pontos, ponto e vírgula ou parênteses.
Devolva APENAS o texto final da peça, sem comentário, sem aspas e sem markdown.`;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const reforco =
      tentativa > 0 && args.termo
        ? `\n\nATENÇÃO: a versão anterior ainda tinha "${args.termo}". Nenhuma ocorrência pode ficar, em nenhuma grafia.`
        : "";
    const bruto = await askClaude(sistema, `REDE: ${args.rede}\n\nINSTRUÇÃO: ${args.instrucao}${reforco}\n\nTEXTO ATUAL:\n${args.texto}`, {
      maxTokens: 6000,
      effort: "low",
      timeoutMs: 90_000,
      usage: { projectId: args.projectId, agentId: "vera-veredito", operation: "vera_gerente_reescrever" },
    });
    const peca = pecaPublicavel(bruto);
    if ("recusado" in peca) continue;
    const texto = semTravessao(peca.texto).replace(/ \n/g, "\n");
    if (args.termo && contem(texto, args.termo)) continue;
    if (texto.length < Math.min(40, args.texto.length * 0.3)) continue;
    return texto;
  }
  return null;
}

/** Luminância relativa e razão de contraste (WCAG). */
function luminancia(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return Math.round(((x + 0.05) / (y + 0.05)) * 10) / 10;
}
/** "4,9:1", com vírgula, que é como a pessoa lê. */
const razao = (n: number) => `${n.toLocaleString("pt-BR")}:1`;
function hexValido(c: string): string | null {
  const t = c.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(t)) return t;
  if (/^#[0-9A-F]{3}$/.test(t)) return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
  if (/^[0-9A-F]{6}$/.test(t)) return `#${t}`;
  return null;
}

const dataCurta = (d: Date | null | undefined) => (d ? diaEHora(new Date(d)) : "sem data");

export function ferramentasDaGerente(ctx: ContextoDaGerente): Ferramenta[] {
  const { projectId, plano } = ctx;
  const base = `/projects/${projectId}`;
  const LINK = {
    regras: `${base}/training#regras-do-projeto`,
    marca: `${base}/settings?aba=marca`,
    video: `${base}/settings?aba=video`,
    links: `${base}/settings?aba=links`,
    modelos: `${base}/settings?aba=modelos`,
    setup: `${base}/setup`,
    quadro: `${base}/live`,
  };

  const projeto = () =>
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        name: true,
        niche: true,
        targetAudience: true,
        voice: true,
        colorPalette: true,
        config: true,
        videoSemana: true,
        videoEstiloEscolha: true,
        videoStyle: true,
        timezone: true,
        socialAccounts: { select: { platform: true } },
      },
    });

  /** Recusa de quem não é dono, para tudo que é configuração da marca. */
  const soDono = (oQue: string) => (ctx.ehDono ? null : ctx.fraseSoODono(oQue));

  const anotar = (m: Mudanca) => {
    plano.mudancas.push(m);
    return resumoDoPlano(plano).frase;
  };

  async function regraPorId(id: string): Promise<RegraDoProjeto | null> {
    const todas = await listarRegras(projectId);
    return todas.find((r) => r.id === id) ?? null;
  }

  const listaDeRegras = (regras: RegraDoProjeto[]) =>
    regras.length
      ? regras.map((r) => `[${r.id}] (${r.status}) ${r.texto} | vale para: ${r.alvos.map((a) => ROTULO_DO_ALVO[a]).join(", ")}`).join("\n")
      : "(nenhuma regra ainda)";

  const textoDaSemana = (s: SemanaDoVideo) =>
    DIAS_DA_SEMANA.map(({ dia, nome }) => {
      const d = s.dias[String(dia) as ChaveDoDia];
      return `${nome} (${dia}): ${d ? `${ROTULO_DO_FORMATO[d.formato]} em ${d.redes.map((r) => NOME_DA_REDE_NO_PLANO[r]).join(", ")}` : "sem post"}`;
    }).join("\n");

  /** Peças pendentes (posts que não foram ao ar), com filtro. */
  async function pecasPendentes(filtro: { texto?: string; dia?: number; rede?: string; ids?: string[] }) {
    const posts = await prisma.post.findMany({
      where: {
        projectId,
        status: { in: PENDENTE },
        OR: [{ runId: null }, { run: { archived: false } }],
        ...(filtro.ids?.length ? { id: { in: filtro.ids } } : {}),
        ...(filtro.dia ? { dayOfWeek: filtro.dia } : {}),
        ...(filtro.rede ? { platform: filtro.rede } : {}),
        ...(filtro.texto ? { content: { contains: filtro.texto, mode: "insensitive" as const } } : {}),
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: 60,
      select: { id: true, platform: true, content: true, status: true, mediaType: true, dayOfWeek: true, scheduledAt: true, runId: true, imageUrl: true },
    });
    return posts;
  }

  return [
    // ── LER ─────────────────────────────────────────────────────────────────
    {
      nome: "ver_projeto",
      descricao:
        "Mostra o setup do projeto como está hoje: nicho, público, tom de voz, cores, linha editorial, links, a semana padrão (formato e redes de cada dia), o estilo de edição e os modelos de arte escolhidos. Use antes de propor qualquer mudança de setup.",
      entrada: { type: "object", properties: {}, required: [] },
      rodar: async () => {
        const p = await projeto();
        const cfg = (p.config as Record<string, unknown> | null) ?? {};
        const conectadas = p.socialAccounts.map((s) => s.platform);
        const semana = normalizarSemana(p.videoSemana, conectadas, false);
        const escolha = normalizarEscolha(p.videoEstiloEscolha, p.videoStyle);
        const modelos = await prisma.projectMemory.findUnique({
          where: { projectId_type_key: { projectId, type: TIPO_DA_ESCOLHA, key: CHAVE_DA_ESCOLHA } },
          select: { value: true },
        });
        const ids = ((modelos?.value as { ids?: string[] } | null)?.ids ?? []).filter((id) => modeloPorId(id));
        const links = lerLinks(cfg);
        return [
          `PROJETO: ${p.name}`,
          `NICHO: ${p.niche ?? "(vazio)"}`,
          `PÚBLICO: ${p.targetAudience ?? "(vazio)"}`,
          `TOM DE VOZ:\n${p.voice ?? "(vazio)"}`,
          `CORES (primária primeiro): ${p.colorPalette ?? "(padrão da plataforma)"}`,
          `LINHA EDITORIAL:\n${typeof cfg.linhaEditorial === "string" && cfg.linhaEditorial.trim() ? cfg.linhaEditorial : "(vazia)"}`,
          `LINKS: ${links.length ? links.map((l) => `${l.rotulo} (${l.tipo}, prioridade ${l.prioridade}): ${l.url}`).join("; ") : "(nenhum)"}`,
          `REDES CONECTADAS: ${conectadas.map((r) => NOME_DA_REDE[r] ?? r).join(", ") || "(nenhuma)"}`,
          `SEMANA PADRÃO (dia da semana, formato e redes):\n${textoDaSemana(semana)}`,
          `ESTILO DE EDIÇÃO DOS VÍDEOS: ${estiloDoCatalogo(escolha.estiloId)?.nome ?? escolha.estiloId}${escolha.camera.length ? `; câmera: ${escolha.camera.join(", ")}` : ""}${escolha.efeitos.length ? `; efeitos: ${escolha.efeitos.join(", ")}` : ""}${escolha.look ? `; look: ${escolha.look}` : ""}`,
          `MODELOS DE ARTE ESCOLHIDOS: ${ids.length ? ids.map((id) => `${modeloPorId(id)!.nome} (${id})`).join(", ") : "(nenhum, o squad escolhe)"}`,
          ctx.ehDono ? "" : "QUEM FALA É MEMBRO DA EQUIPE, não o dono: setup, regras, cores, links e modelos de arte ele não muda.",
        ]
          .filter(Boolean)
          .join("\n\n");
      },
    },

    {
      nome: "ver_regras",
      descricao: "Lista as regras do projeto (as que alimentam os redatores, a arte e a edição), com id, estado e para quem valem.",
      entrada: { type: "object", properties: {}, required: [] },
      rodar: async () => listaDeRegras(await listarRegras(projectId)),
    },

    {
      // O SEGUNDO CÉREBRO (06/10): o que o cliente já pediu, aprovou, recusou e
      // decidiu. Só leitura; a Vera consulta antes de preparar um pedido que
      // pode bater com algo que ele já disse (lib/cerebro).
      nome: "ver_memoria",
      descricao:
        "Procura no segundo cérebro do projeto: o que o cliente já pediu nos chats, aprovou, recusou (com o motivo), decidiu com você, as regras, o tom e os materiais. Use antes de mudar algo que ele pode já ter pedido ou recusado, e quando ele perguntar \"o que eu já pedi sobre X\". Devolve as notas mais recentes que casam com a busca.",
      entrada: {
        type: "object",
        properties: { busca: { type: "string", description: "Palavras a procurar (ex.: \"emoji\", \"cor\", \"LinkedIn\"). Vazio traz as mais recentes." } },
        required: [],
      },
      rodar: async (a) => {
        const busca = typeof a.busca === "string" ? a.busca : "";
        const achadas = buscarNotas(await carregarNotas(projectId), busca)
          .sort((x, y) => (y.quando ?? "").localeCompare(x.quando ?? ""))
          .slice(0, 15);
        if (!achadas.length) return busca ? `Nada na memória do projeto sobre "${busca}".` : "A memória do projeto ainda está vazia.";
        return achadas
          .map((n) => `- ${n.esfera ? ROTULO_DA_ESFERA[n.esfera] : "Nota"}${n.quando ? `, ${dataDaNota(n.quando)}` : ""}${n.duradoura ? " (vale para as próximas peças)" : ""}: ${n.titulo}. ${cortar(n.texto.replace(/\s+/g, " "), 220)}`)
          .join("\n");
      },
    },

    {
      nome: "buscar_pecas",
      descricao:
        "Procura as peças PENDENTES do quadro (rascunho, agendada ou que falhou; nunca as publicadas). Filtra por um trecho de texto (sem diferenciar maiúscula), por dia da semana (1 = segunda ... 7 = domingo) e por rede (linkedin, twitter, instagram, facebook, tiktok, youtube). Devolve id, rede, dia, estado, formato e o trecho.",
      entrada: {
        type: "object",
        properties: {
          texto: { type: "string", description: "Trecho a procurar no texto da peça, ex.: uma palavra que o cliente não quer mais." },
          dia: { type: "number", description: "Dia da semana, 1 a 7." },
          rede: { type: "string" },
        },
        required: [],
      },
      rodar: async (a) => {
        const texto = typeof a.texto === "string" && a.texto.trim() ? a.texto.trim() : undefined;
        const posts = await pecasPendentes({ texto, dia: Number(a.dia) || undefined, rede: typeof a.rede === "string" ? a.rede : undefined });
        if (!posts.length) return texto ? `Nenhuma peça pendente tem "${texto}".` : "Nenhuma peça pendente com esse filtro.";
        return posts
          .map((p) => {
            const t = p.content.replace(/\s+/g, " ");
            const i = texto ? sem(t).indexOf(sem(texto)) : 0;
            const trecho = t.slice(Math.max(0, i - 60), i + 140);
            return `[${p.id}] ${NOME_DA_REDE[p.platform] ?? p.platform}, ${DIAS_DA_SEMANA.find((d) => d.dia === p.dayOfWeek)?.nome ?? "sem dia"} (${dataCurta(p.scheduledAt)}), ${ESTADO[p.status] ?? p.status}, ${p.mediaType ?? "texto"}: ${trecho}`;
          })
          .join("\n");
      },
    },

    {
      nome: "ver_peca",
      descricao: "Abre UMA peça pelo id, com o texto inteiro.",
      entrada: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      rodar: async (a) => {
        const p = await prisma.post.findFirst({
          where: { id: String(a.id ?? ""), projectId },
          select: { id: true, platform: true, content: true, status: true, mediaType: true, scheduledAt: true },
        });
        if (!p) return "Essa peça não existe neste projeto.";
        return `[${p.id}] ${NOME_DA_REDE[p.platform] ?? p.platform}, ${p.status}, ${p.mediaType ?? "texto"}, ${dataCurta(p.scheduledAt)}\n\n${p.content}`;
      },
    },

    {
      nome: "ver_catalogos",
      descricao: "Lista as opções que existem para o estilo de edição dos vídeos (linguagens, câmera, efeitos, looks) e os modelos de arte, com os ids. Use antes de mudar estilo ou modelos.",
      entrada: { type: "object", properties: {}, required: [] },
      rodar: async () =>
        [
          "LINGUAGENS DE EDIÇÃO:",
          ...CATALOGO_DE_ESTILOS.map((e) => `- ${e.id}: ${e.nome}. ${e.resumo}`),
          "CÂMERA: " + MOVIMENTOS_DE_CAMERA.map((m) => m.id).join(", "),
          "EFEITOS: " + EFEITOS.map((m) => m.id).join(", "),
          "LOOKS: " + LOOKS.map((m) => m.id).join(", "),
          "",
          "MODELOS DE ARTE (id: nome):",
          ...MODELOS_DE_ARTE.map((m) => `- ${m.id}: ${m.nome}`),
        ].join("\n"),
    },

    {
      nome: "contar_artes_pendentes",
      descricao:
        "Conta as artes (imagem, infográfico e carrossel) das peças pendentes que seriam refeitas depois de uma mudança de marca, e o custo em créditos. Use SEMPRE depois de propor troca de cor, para oferecer refazer as artes.",
      entrada: { type: "object", properties: {}, required: [] },
      rodar: async () => {
        const artes = await artesPendentes(projectId);
        if (!artes.length) return "Não há arte pendente para refazer.";
        const grupos = agruparArtes(artes);
        return `${artes.length} peças com arte pendente, em ${grupos.length} ${grupos.length === 1 ? "arte" : "artes"} (uma por dia e formato, com o recorte de cada rede): ${resumoDasArtes(grupos)}. Refazer custa ${custoDasArtes(grupos)} créditos. Carrossel continua carrossel, com o mesmo número de lâminas. OFEREÇA NA RESPOSTA, com esses números (quantas artes, quantos carrosséis, o custo): as artes pendentes continuam com a cor antiga até serem refeitas; pergunte se a pessoa quer refazer.`;
      },
    },

    {
      nome: "custo_de_criar",
      descricao:
        "Diz quanto custa, em créditos, uma CAMPANHA NOVA (semana de posts) e onde começar. Você não começa campanha nem vídeo por aqui: informe o custo e mande o link de Criar, onde a pessoa confirma.",
      entrada: { type: "object", properties: {}, required: [] },
      rodar: async () => {
        const p = await projeto();
        const conectadas = p.socialAccounts.map((s) => s.platform);
        const semana = normalizarSemana(p.videoSemana, conectadas, false);
        const dias = Object.values(semana.dias)
          .filter((d): d is NonNullable<typeof d> => Boolean(d))
          .map((d) => ({ tipo: d.formato === "short" ? "text" : d.formato, redes: d.redes }));
        const custo = estimarCampanha({ dias, redesConectadas: Math.max(1, conectadas.length) });
        return `Uma campanha com a semana padrão de hoje custa cerca de ${custo} créditos. O vídeo por IA tem preço próprio, mostrado na janela antes de gerar. Onde começar: ${base}/criar (a tela mostra a conta antes de confirmar).`;
      },
    },

    // ── PREPARAR: REGRAS ────────────────────────────────────────────────────
    {
      nome: "regra_nova",
      descricao:
        "Prepara uma regra nova do projeto, que passa a valer para os agentes (já nasce aprovada, porque quem pediu é o cliente). Texto no imperativo, curto e conferível, sem travessão. Ex.: \"Nunca usar gírias; falar com o público em geral\".",
      entrada: {
        type: "object",
        properties: {
          texto: { type: "string" },
          alvos: { type: "array", items: { type: "string", enum: ALVOS_DA_REGRA }, description: "roteiro, redacao, arte, edicao. Texto e legenda é redacao." },
        },
        required: ["texto"],
      },
      rodar: async (a) => {
        const negado = soDono("mexer nas regras do projeto");
        if (negado) return negado;
        const texto = semTravessao(String(a.texto ?? "")).slice(0, 220);
        if (texto.length < 8) return "A regra precisa de pelo menos uma frase curta.";
        const existentes = await listarRegras(projectId);
        const parecida = existentes.find((r) => parecencaDaRegra(r.texto, texto) >= 0.55);
        if (parecida && parecida.status === "aprovada") return `Já existe uma regra valendo que diz quase isso: [${parecida.id}] ${parecida.texto}. Se quiser outra redação, use regra_mudar com acao "editar".`;
        if (parecida) return `Existe uma regra parecida no estado ${parecida.status}: [${parecida.id}] ${parecida.texto}. Use regra_mudar (religar ou editar) em vez de criar outra.`;
        const alvos = (Array.isArray(a.alvos) ? a.alvos : []).filter((x): x is AlvoDaRegra => (ALVOS_DA_REGRA as string[]).includes(String(x)));
        const agora = new Date().toISOString();
        const regra: RegraDoProjeto = {
          id: randomUUID(),
          texto,
          textoOriginal: null,
          porque: "Pedido na conversa com a Vera.",
          alvos: alvos.length ? [...new Set(alvos)] : ["roteiro", "redacao"],
          status: "aprovada",
          origem: "cliente",
          achado: null,
          propostaEm: agora,
          decididaEm: agora,
        };
        return anotar({
          titulo: "Regra nova do projeto",
          depois: `${texto} (vale para: ${regra.alvos.map((x) => ROTULO_DO_ALVO[x]).join(", ")})`,
          link: LINK.regras,
          escritas: [{ onde: "memoria", tipo: "regra", chave: regra.id, antes: null, depois: regra }],
        });
      },
    },

    {
      nome: "regra_mudar",
      descricao: "Prepara a mudança de UMA regra existente: editar o texto (e aprovar junto), aprovar, recusar, desligar ou religar.",
      entrada: {
        type: "object",
        properties: {
          id: { type: "string" },
          acao: { type: "string", enum: ["editar", "aprovar", "recusar", "desligar", "religar"] },
          texto: { type: "string", description: "O texto novo, só com acao editar." },
        },
        required: ["id", "acao"],
      },
      rodar: async (a) => {
        const negado = soDono("mexer nas regras do projeto");
        if (negado) return negado;
        const r = await regraPorId(String(a.id ?? ""));
        if (!r) return "Essa regra não existe neste projeto.";
        const acao = String(a.acao);
        const nova: RegraDoProjeto = { ...r, decididaEm: new Date().toISOString() };
        if (acao === "editar") {
          const texto = semTravessao(String(a.texto ?? "")).slice(0, 220);
          if (texto.length < 8) return "Diga o texto novo da regra.";
          nova.texto = texto;
          nova.textoOriginal = r.textoOriginal ?? r.texto;
          nova.status = "aprovada";
        } else if (acao === "aprovar" || acao === "religar") nova.status = "aprovada";
        else if (acao === "recusar") nova.status = "recusada";
        else if (acao === "desligar") nova.status = "desligada";
        else return "Ação desconhecida.";
        const rotulo: Record<string, string> = { aprovada: "valendo", recusada: "recusada", desligada: "desligada", proposta: "proposta" };
        return anotar({
          titulo: acao === "editar" ? "Regra editada" : `Regra ${rotulo[nova.status]}`,
          antes: `${r.texto} (${rotulo[r.status]})`,
          depois: `${nova.texto} (${rotulo[nova.status]})`,
          link: LINK.regras,
          escritas: [{ onde: "memoria", tipo: "regra", chave: r.id, antes: r, depois: nova }],
        });
      },
    },

    {
      nome: "regra_apagar",
      descricao: "Prepara apagar uma regra de vez. Prefira desligar (regra_mudar), que guarda a regra; apague só quando a pessoa pedir para apagar.",
      entrada: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      rodar: async (a) => {
        const negado = soDono("mexer nas regras do projeto");
        if (negado) return negado;
        const r = await regraPorId(String(a.id ?? ""));
        if (!r) return "Essa regra não existe neste projeto.";
        return anotar({
          titulo: "Regra apagada",
          antes: r.texto,
          depois: "(apagada)",
          link: LINK.regras,
          escritas: [{ onde: "memoria", tipo: "regra", chave: r.id, antes: r, depois: null }],
        });
      },
    },

    // ── PREPARAR: SETUP ─────────────────────────────────────────────────────
    {
      nome: "mudar_setup",
      descricao:
        "Prepara a troca de um campo de texto do setup: nicho, publico, tom_de_voz ou linha_editorial. Mande o texto NOVO INTEIRO do campo (leia o atual com ver_projeto e reescreva mantendo o que continua valendo). Sem travessão.",
      entrada: {
        type: "object",
        properties: {
          campo: { type: "string", enum: ["nicho", "publico", "tom_de_voz", "linha_editorial"] },
          valor: { type: "string" },
        },
        required: ["campo", "valor"],
      },
      rodar: async (a) => {
        const negado = soDono("mudar o setup do projeto");
        if (negado) return negado;
        const valor = semTravessao(String(a.valor ?? "")).replace(/ ?\n ?/g, "\n").slice(0, 4000);
        if (valor.length < 3) return "O valor novo está vazio.";
        const p = await projeto();
        const cfg = (p.config as Record<string, unknown> | null) ?? {};
        const campo = String(a.campo);
        const mapa: Record<string, { titulo: string; escrita: Escrita; antes: string | null }> = {
          nicho: { titulo: "Nicho", antes: p.niche, escrita: { onde: "projeto", campo: "niche", antes: p.niche, depois: valor } },
          publico: { titulo: "Público", antes: p.targetAudience, escrita: { onde: "projeto", campo: "targetAudience", antes: p.targetAudience, depois: valor } },
          tom_de_voz: { titulo: "Tom de voz", antes: p.voice, escrita: { onde: "projeto", campo: "voice", antes: p.voice, depois: valor } },
          linha_editorial: {
            titulo: "Linha editorial",
            antes: typeof cfg.linhaEditorial === "string" ? cfg.linhaEditorial : null,
            escrita: { onde: "config", chave: "linhaEditorial", antes: cfg.linhaEditorial ?? null, depois: valor },
          },
        };
        const m = mapa[campo];
        if (!m) return "Campo desconhecido.";
        if ((m.antes ?? "").trim() === valor) return "O valor novo é igual ao de hoje; nada a mudar.";
        return anotar({
          titulo: m.titulo,
          antes: m.antes ?? "(vazio)",
          depois: valor,
          link: campo === "linha_editorial" ? LINK.setup : LINK.marca,
          escritas: [m.escrita],
        });
      },
    },

    {
      nome: "mudar_cores",
      descricao:
        "Prepara a troca das cores da marca. Mande a paleta inteira em hexadecimal, a cor PRINCIPAL primeiro (ex.: [\"#E3000F\", \"#1E1F22\", \"#F5F5F5\"]); mantenha as outras como estão, salvo pedido. Devolve o contraste da principal contra o branco e o escuro. Depois, use contar_artes_pendentes e ofereça refazer as artes.",
      entrada: { type: "object", properties: { cores: { type: "array", items: { type: "string" } } }, required: ["cores"] },
      rodar: async (a) => {
        const negado = soDono("mudar as cores da marca");
        if (negado) return negado;
        const cores = (Array.isArray(a.cores) ? a.cores : []).map((c) => hexValido(String(c))).filter((c): c is string => Boolean(c)).slice(0, 5);
        if (!cores.length) return "Mande as cores em hexadecimal, como #E3000F.";
        const p = await projeto();
        const antes = p.colorPalette;
        const antesLista = (antes ?? "").split(",").map((c) => hexValido(c)).filter((c): c is string => Boolean(c));
        // Grava normalizada (08/10), como a rota do projeto: "#rrggbb"
        // minúsculo e sem repetida. O "depois" do pedido é o que fica no
        // banco, e é com ele que o desfazer confere se nada mudou no meio.
        const depois = normalizarPaleta(cores).cores.join(",");
        const escuro = cores.find((c, i) => i > 0 && luminancia(c) < 0.2) ?? "#1E1F22";
        const cBranco = contraste(cores[0], "#FFFFFF");
        const cEscuro = contraste(cores[0], escuro);
        const aviso =
          cBranco < 3 && cEscuro < 3
            ? `Contraste baixo: a principal dá ${razao(cBranco)} com branco e ${razao(cEscuro)} com o escuro; texto em cima dela fica difícil de ler (o mínimo é 3:1).`
            : cBranco >= 4.5
              ? `Contraste bom: texto branco sobre a principal dá ${razao(cBranco)}.`
              : `Contraste ok para título: ${razao(cBranco)} com branco e ${razao(cEscuro)} com o escuro.`;
        anotar({
          titulo: "Cores da marca",
          antes: antes ?? "(padrão da plataforma)",
          depois,
          cores: { antes: antesLista, depois: cores },
          aviso,
          link: LINK.marca,
          escritas: [{ onde: "projeto", campo: "colorPalette", antes, depois }],
        });
        return `${aviso} ${resumoDoPlano(plano).frase}`;
      },
    },

    {
      nome: "mudar_links",
      descricao: "Prepara a troca da lista de links do cliente. Mande a lista INTEIRA como deve ficar (leia a de hoje com ver_projeto).",
      entrada: {
        type: "object",
        properties: {
          links: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rotulo: { type: "string" },
                url: { type: "string" },
                tipo: { type: "string", enum: TIPOS_DE_LINK.map((t) => t.id) },
                prioridade: { type: "number", description: "1 principal, 2 secundário, 3 de vez em quando" },
                cta: { type: "string" },
              },
              required: ["url"],
            },
          },
        },
        required: ["links"],
      },
      rodar: async (a) => {
        const negado = soDono("mudar os links do projeto");
        if (negado) return negado;
        const p = await projeto();
        const cfg = (p.config as Record<string, unknown> | null) ?? {};
        const novos = lerLinks({ linksDoCliente: Array.isArray(a.links) ? a.links : [] });
        const antes = lerLinks(cfg);
        const fmt = (l: typeof novos) => (l.length ? l.map((x) => `${x.rotulo}: ${x.url}`).join("\n") : "(nenhum)");
        return anotar({
          titulo: "Links do cliente",
          antes: fmt(antes),
          depois: fmt(novos),
          link: LINK.links,
          escritas: [{ onde: "config", chave: "linksDoCliente", antes: cfg.linksDoCliente ?? null, depois: novos }],
        });
      },
    },

    {
      nome: "mudar_agenda",
      descricao:
        "Prepara a mudança de UM dia da semana padrão: o formato (ou sem_post) e as redes. Ex.: tirar o LinkedIn de sexta = dia 5, tirar_redes [\"linkedin\"]. Isto vale para as próximas campanhas; as peças já no quadro mudam com desmarcar_rede_da_peca.",
      entrada: {
        type: "object",
        properties: {
          dia: { type: "number", description: "1 = segunda ... 7 = domingo" },
          formato: { type: "string", enum: [...FORMATOS.map((f) => f.id), "sem_post"] },
          tirar_redes: { type: "array", items: { type: "string" } },
          por_redes: { type: "array", items: { type: "string" } },
        },
        required: ["dia"],
      },
      rodar: async (a) => {
        const dia = Number(a.dia);
        if (!(dia >= 1 && dia <= 7)) return "O dia vai de 1 (segunda) a 7 (domingo).";
        const chave = String(dia) as ChaveDoDia;
        const nomeDoDia = DIAS_DA_SEMANA[dia - 1].nome;
        const p = await projeto();
        const conectadas = p.socialAccounts.map((s) => s.platform);
        const semana = normalizarSemana(p.videoSemana, conectadas, false);
        const atual = semana.dias[chave] ?? null;
        let novo = atual ? { ...atual, redes: [...atual.redes] } : null;
        if (a.formato === "sem_post") novo = null;
        else if (typeof a.formato === "string") {
          const f = a.formato as FormatoDoDia;
          novo = atual && atual.formato === f ? novo : diaComFormato(f, conectadas);
        }
        if (novo) {
          const tirar = (Array.isArray(a.tirar_redes) ? a.tirar_redes : []).map(String);
          const por = (Array.isArray(a.por_redes) ? a.por_redes : []).map(String).filter((r) => redesDoFormato(novo!.formato).includes(r as RedeDoPlano)) as RedeDoPlano[];
          novo.redes = ordenarRedes([...new Set([...novo.redes.filter((r) => !tirar.includes(r)), ...por])]);
          if (!novo.redes.length) return `Com essa troca a ${nomeDoDia} fica sem rede nenhuma. Se a ideia é não postar na ${nomeDoDia}, chame de novo com formato "sem_post".`;
        } else if (!atual) return `A ${nomeDoDia} já está sem post.`;
        const fmt = (d: typeof atual) => (d ? `${ROTULO_DO_FORMATO[d.formato]} em ${d.redes.map((r) => NOME_DA_REDE_NO_PLANO[r]).join(", ")}` : "sem post");
        if (fmt(atual) === fmt(novo)) return `A ${nomeDoDia} já está assim (${fmt(atual)}).`;
        const nova: SemanaDoVideo = { ...semana, dias: { ...semana.dias, [chave]: novo } };
        return anotar({
          titulo: `Semana padrão, ${nomeDoDia}`,
          antes: fmt(atual),
          depois: fmt(novo),
          link: LINK.video,
          escritas: [{ onde: "projeto", campo: "videoSemana", antes: p.videoSemana ?? null, depois: planoParaGravar(nova) }],
        });
      },
    },

    {
      nome: "mudar_estilo_de_edicao",
      descricao: "Prepara a troca do estilo de edição dos vídeos (linguagem do catálogo e, se pedido, câmera, efeitos e look). Leia os ids com ver_catalogos.",
      entrada: {
        type: "object",
        properties: {
          estiloId: { type: "string" },
          camera: { type: "array", items: { type: "string" } },
          efeitos: { type: "array", items: { type: "string" } },
          look: { type: "string" },
        },
        required: ["estiloId"],
      },
      rodar: async (a) => {
        const estilo = estiloDoCatalogo(String(a.estiloId ?? ""));
        if (!estilo) return "Esse estilo não existe no catálogo. Veja os ids com ver_catalogos.";
        const p = await projeto();
        const atual = normalizarEscolha(p.videoEstiloEscolha, p.videoStyle);
        const nova = normalizarEscolha({
          ...atual,
          estiloId: estilo.id,
          camera: Array.isArray(a.camera) ? a.camera : atual.estiloId === estilo.id ? atual.camera : [],
          efeitos: Array.isArray(a.efeitos) ? a.efeitos : atual.estiloId === estilo.id ? atual.efeitos : [],
          look: typeof a.look === "string" ? a.look : atual.estiloId === estilo.id ? atual.look : null,
          texto: undefined,
          interpretacao: undefined,
        });
        const fmt = (e: typeof atual) =>
          `${estiloDoCatalogo(e.estiloId)?.nome ?? e.estiloId}${e.camera.length ? `; câmera: ${e.camera.join(", ")}` : ""}${e.efeitos.length ? `; efeitos: ${e.efeitos.join(", ")}` : ""}${e.look ? `; look: ${e.look}` : ""}`;
        if (fmt(atual) === fmt(nova)) return "O estilo já está assim.";
        return anotar({
          titulo: "Estilo de edição dos vídeos",
          antes: fmt(atual),
          depois: fmt(nova),
          link: LINK.video,
          escritas: [
            { onde: "projeto", campo: "videoEstiloEscolha", antes: p.videoEstiloEscolha ?? null, depois: nova },
            { onde: "projeto", campo: "videoStyle", antes: p.videoStyle ?? null, depois: estilo.base },
          ],
        });
      },
    },

    {
      nome: "mudar_modelos_de_arte",
      descricao: "Prepara a troca dos modelos de arte escolhidos (a lista inteira de ids, até 12). Lista vazia devolve a escolha ao squad.",
      entrada: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] },
      rodar: async (a) => {
        const negado = soDono("mudar os modelos de arte da marca");
        if (negado) return negado;
        const ids = [...new Set((Array.isArray(a.ids) ? a.ids : []).map(String))].filter((id) => modeloPorId(id)).slice(0, 12);
        const atual = await prisma.projectMemory.findUnique({
          where: { projectId_type_key: { projectId, type: TIPO_DA_ESCOLHA, key: CHAVE_DA_ESCOLHA } },
          select: { value: true },
        });
        const antesIds = ((atual?.value as { ids?: string[] } | null)?.ids ?? []).filter((id) => modeloPorId(id));
        const fmt = (l: string[]) => (l.length ? l.map((id) => modeloPorId(id)!.nome).join(", ") : "(o squad escolhe)");
        return anotar({
          titulo: "Modelos de arte",
          antes: fmt(antesIds),
          depois: fmt(ids),
          link: LINK.modelos,
          escritas: [
            {
              onde: "memoria",
              tipo: TIPO_DA_ESCOLHA,
              chave: CHAVE_DA_ESCOLHA,
              antes: atual?.value ?? null,
              depois: ids.length ? { ids, em: new Date().toISOString() } : null,
            },
          ],
        });
      },
    },

    // ── PREPARAR: PEÇAS DO QUADRO ───────────────────────────────────────────
    {
      nome: "reescrever_pecas",
      descricao:
        "Prepara a correção do TEXTO de peças pendentes, aplicando só a instrução e mantendo o resto. Use `com_o_texto` para pegar TODAS as pendentes que têm um trecho (ex.: uma gíria ou uma palavra que o cliente quer tirar), ou `ids` para peças escolhidas. O texto novo de cada uma já sai pronto para a pessoa conferir. Até 20 peças por pedido.",
      entrada: {
        type: "object",
        properties: {
          instrucao: { type: "string", description: "O que corrigir, em uma frase. Ex.: tirar as gírias e falar com o público em geral." },
          com_o_texto: { type: "string" },
          ids: { type: "array", items: { type: "string" } },
        },
        required: ["instrucao"],
      },
      rodar: async (a) => {
        const instrucao = String(a.instrucao ?? "").trim();
        if (!instrucao) return "Diga o que corrigir.";
        const termo = typeof a.com_o_texto === "string" && a.com_o_texto.trim() ? a.com_o_texto.trim() : undefined;
        const ids = Array.isArray(a.ids) ? a.ids.map(String) : undefined;
        if (!termo && !ids?.length) return "Diga quais peças (ids) ou o trecho que as peças têm.";
        const posts = await pecasPendentes({ texto: termo, ids });
        const jaNoPlano = new Set(plano.mudancas.flatMap((m) => m.escritas.filter((e) => e.onde === "post").map((e) => (e as { id: string }).id)));
        const alvo = posts.filter((p) => !jaNoPlano.has(p.id)).slice(0, MAX_PECAS_POR_PEDIDO);

        // Cards de texto sem post (rascunho que ainda não virou post) também
        // aparecem no quadro: entram quando têm o trecho.
        const soltos = termo
          ? await prisma.campaignCard.findMany({
              where: {
                projectId,
                postId: null,
                cardType: { in: CARDS_DE_TEXTO },
                status: { notIn: ["published", "archived"] },
                run: { archived: false },
                content: { contains: termo, mode: "insensitive" },
              },
              take: 10,
              select: { id: true, cardType: true, content: true, dayOfWeek: true },
            })
          : [];
        if (!alvo.length && !soltos.length) return termo ? `Nenhuma peça pendente tem "${termo}".` : "Nenhuma dessas peças está pendente.";

        const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true, voice: true } });
        const falhas: string[] = [];
        let prontas = 0;

        // Quatro de cada vez: a pessoa está olhando a tela esperando.
        const fila: Array<() => Promise<void>> = [
          ...alvo.map((post) => async () => {
            const rede = NOME_DA_REDE[post.platform] ?? post.platform;
            const novo = await reescrever({ projectId, projeto: p, rede, texto: post.content, instrucao, termo });
            const quando = `${DIAS_DA_SEMANA.find((d) => d.dia === post.dayOfWeek)?.nome ?? "sem dia"}, ${dataCurta(post.scheduledAt)}`;
            if (!novo || novo === post.content) {
              falhas.push(`${rede} de ${quando}`);
              return;
            }
            const cards = await prisma.campaignCard.findMany({
              where: {
                projectId,
                OR: [
                  { postId: post.id },
                  ...(post.runId && post.dayOfWeek ? [{ runId: post.runId, dayOfWeek: post.dayOfWeek, cardType: { in: CARDS_DE_TEXTO }, content: post.content }] : []),
                ],
              },
              select: { id: true, content: true },
            });
            const t = trechoDaMudanca(post.content, novo);
            plano.mudancas.push({
              titulo: `Texto de ${rede}, ${quando}`,
              antes: t.antes,
              depois: t.depois,
              link: LINK.quadro,
              escritas: [
                { onde: "post", id: post.id, campo: "content", antes: post.content, depois: novo },
                ...cards.filter((c) => c.content === post.content).map((c) => ({ onde: "card" as const, id: c.id, campo: "content" as const, antes: c.content, depois: novo })),
              ],
            });
            prontas++;
          }),
          ...soltos.map((c) => async () => {
            const rede = c.cardType === "post_twitter" ? "X" : c.cardType === "post_linkedin" ? "LinkedIn" : "vídeo";
            const novo = await reescrever({ projectId, projeto: p, rede, texto: c.content ?? "", instrucao, termo });
            if (!novo || novo === c.content) {
              falhas.push(`rascunho de ${rede}`);
              return;
            }
            const t = trechoDaMudanca(c.content ?? "", novo);
            plano.mudancas.push({
              titulo: `Rascunho de ${rede}, ${DIAS_DA_SEMANA.find((d) => d.dia === c.dayOfWeek)?.nome ?? ""}`,
              antes: t.antes,
              depois: t.depois,
              link: LINK.quadro,
              escritas: [{ onde: "card", id: c.id, campo: "content", antes: c.content, depois: novo }],
            });
            prontas++;
          }),
        ];
        const trabalhar = async () => {
          for (let f = fila.shift(); f; f = fila.shift()) {
            try {
              await f();
            } catch (e) {
              falhas.push(`uma peça (${e instanceof Error ? e.message : "erro"})`);
            }
          }
        };
        await Promise.all([trabalhar(), trabalhar(), trabalhar(), trabalhar()]);

        return [
          `${prontas} ${prontas === 1 ? "peça corrigida" : "peças corrigidas"} no plano${posts.length > alvo.length ? ` (havia mais ${posts.length - alvo.length}; peça de novo depois deste)` : ""}.`,
          falhas.length ? `Não consegui corrigir: ${falhas.join("; ")}. Diga isso à pessoa.` : "",
          resumoDoPlano(plano).frase,
        ]
          .filter(Boolean)
          .join(" ");
      },
    },

    {
      nome: "mudar_data_da_peca",
      descricao: "Prepara a troca da data e hora de UMA peça pendente (horário de Brasília). Data AAAA-MM-DD, hora HH:MM.",
      entrada: { type: "object", properties: { id: { type: "string" }, data: { type: "string" }, hora: { type: "string" } }, required: ["id", "data", "hora"] },
      rodar: async (a) => {
        const data = String(a.data ?? "");
        const hora = String(a.hora ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{1,2}:\d{2}$/.test(hora)) return "Data em AAAA-MM-DD e hora em HH:MM.";
        const [post] = await pecasPendentes({ ids: [String(a.id ?? "")] });
        if (!post) return "Essa peça não está pendente neste projeto (ou já foi publicada).";
        const p = await projeto();
        const quando = instanteLocalSeguro(data, hora, p.timezone);
        if (quando.getTime() < Date.now() + 5 * 60_000) return "Esse horário já passou (ou é daqui a menos de 5 minutos). Escolha outro.";
        const cards = await prisma.campaignCard.findMany({ where: { projectId, postId: post.id }, select: { id: true, scheduledDate: true } });
        return anotar({
          titulo: `Data da peça de ${NOME_DA_REDE[post.platform] ?? post.platform}`,
          antes: dataCurta(post.scheduledAt),
          depois: dataCurta(quando),
          link: LINK.quadro,
          escritas: [
            { onde: "post", id: post.id, campo: "scheduledAt", antes: post.scheduledAt?.toISOString() ?? null, depois: quando.toISOString() },
            ...cards.map((c) => ({ onde: "card" as const, id: c.id, campo: "scheduledDate" as const, antes: c.scheduledDate?.toISOString() ?? null, depois: quando.toISOString() })),
          ],
        });
      },
    },

    {
      nome: "desmarcar_rede_da_peca",
      descricao: "Prepara tirar UMA peça pendente do quadro (ela é arquivada e não vai ao ar nessa rede). Ex.: o LinkedIn de sexta que já está no quadro.",
      entrada: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      rodar: async (a) => {
        const [post] = await pecasPendentes({ ids: [String(a.id ?? "")] });
        if (!post) return "Essa peça não está pendente neste projeto (ou já foi publicada).";
        return anotar({
          titulo: `Peça de ${NOME_DA_REDE[post.platform] ?? post.platform} de ${DIAS_DA_SEMANA.find((d) => d.dia === post.dayOfWeek)?.nome ?? "sem dia"}`,
          antes: `no quadro (${post.status === "scheduled" ? "agendada" : "rascunho"})`,
          depois: "arquivada, não vai ao ar",
          link: LINK.quadro,
          escritas: [{ onde: "post", id: post.id, campo: "status", antes: post.status, depois: "cancelled" }],
        });
      },
    },

    {
      nome: "reprovar_e_refazer",
      descricao:
        "Prepara reprovar UMA peça pendente e escrevê-la de novo do zero (texto e, se tiver, arte), com a instrução da pessoa. TEM CUSTO em créditos (às vezes é cortesia); o valor volta para você dizer à pessoa antes de ela confirmar.",
      entrada: { type: "object", properties: { id: { type: "string" }, instrucao: { type: "string" } }, required: ["id"] },
      rodar: async (a) => {
        const [post] = await pecasPendentes({ ids: [String(a.id ?? "")] });
        if (!post) return "Essa peça não está pendente neste projeto (ou já foi publicada).";
        const laminas = (post.imageUrl ?? "").split("|").filter((u) => u.trim().length > 10).length;
        const tabela = custoDeRefazerPeca({ mediaType: post.mediaType, laminas });
        const cortesia = decidirCortesia(
          { status: "rejected", reprovadaPelaRevisora: await reprovadaPelaRevisora({ runId: post.runId, dayOfWeek: post.dayOfWeek }) },
          await cortesiasDeHoje(projectId)
        );
        const custo = cortesia ? 0 : tabela;
        const rede = NOME_DA_REDE[post.platform] ?? post.platform;
        plano.acoes.push({
          tipo: "refazer_peca",
          postId: post.id,
          instrucao: typeof a.instrucao === "string" ? a.instrucao.trim().slice(0, 600) : undefined,
          custo,
          item: {
            titulo: `Refazer a peça de ${rede} de ${DIAS_DA_SEMANA.find((d) => d.dia === post.dayOfWeek)?.nome ?? "sem dia"}`,
            antes: trechoDaMudanca(post.content, "").antes.slice(0, 200),
            depois: `escrita de novo${typeof a.instrucao === "string" && a.instrucao.trim() ? `: ${a.instrucao.trim()}` : ""}`,
            link: LINK.quadro,
            aviso: cortesia ? `Sem cobrança (${cortesia.motivo}).` : `Custa ${tabela} créditos. Desfazer volta o texto, mas não os créditos.`,
          },
        });
        return `${cortesia ? `Sai sem cobrança (${cortesia.motivo}).` : `Custa ${tabela} créditos.`} ${resumoDoPlano(plano).frase}`;
      },
    },

    {
      nome: "regerar_artes_pendentes",
      descricao:
        "Prepara refazer TODAS as artes (imagem, infográfico e carrossel, lâmina por lâmina) das peças pendentes com a marca de hoje, por exemplo depois de trocar a cor. TEM CUSTO; diga a quantidade e o custo antes. Se a cor também está mudando neste pedido, ela é gravada primeiro.",
      entrada: { type: "object", properties: {}, required: [] },
      rodar: async () => {
        const artes = await artesPendentes(projectId);
        if (!artes.length) return "Não há arte pendente para refazer.";
        const grupos = agruparArtes(artes);
        const custo = custoDasArtes(grupos);
        plano.acoes.push({
          tipo: "regerar_artes",
          postIds: artes.map((x) => x.postId),
          custo,
          item: {
            titulo: `Refazer ${grupos.length} ${grupos.length === 1 ? "arte pendente" : "artes pendentes"} com a marca nova`,
            depois: `${resumoDasArtes(grupos)}, em ${artes.length} ${artes.length === 1 ? "peça" : "peças"} (rascunho ou agendada), cada rede no seu recorte; carrossel continua carrossel, com as mesmas lâminas; as publicadas não mudam`,
            link: LINK.quadro,
            aviso: `Custa ${custo} créditos. Desfazer volta as artes antigas, mas não os créditos.`,
          },
        });
        const corNoPlano = plano.mudancas.some((m) => m.escritas.some((e) => e.onde === "projeto" && e.campo === "colorPalette"));
        const { colorPalette } = await projeto();
        return `${grupos.length} artes (${resumoDasArtes(grupos)}), ${custo} créditos. ${corNoPlano ? "A cor nova deste mesmo pedido é gravada antes, e as artes saem com ela." : `A marca de hoje JÁ ESTÁ GRAVADA (cores ${colorPalette ?? "padrão"}); este pedido só refaz as artes com ela, não mexe na cor.`} ${resumoDoPlano(plano).frase}`;
      },
    },
  ];
}
