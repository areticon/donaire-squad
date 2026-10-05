import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { lerMidia, midiaProduzida } from "@/lib/media/storage";
import { comporCapa, type Expressao } from "@/lib/media/capa-e-titulo";
import { acentuarFrases } from "@/lib/media/acentuacao";
import {
  CLIMAS_DE_CAPA_ROTULO,
  estiloDeCapaValido,
  type CapasDoCompleto,
  type ClimaDaCapa,
  type EstiloDeCapa,
  type OpcaoDeCapa,
} from "@/lib/media/estilos-de-capa";
import { dataUrlToBuffer } from "@/lib/media/nano-banana";
import { setYouTubeThumbnail } from "@/lib/oauth/youtube";
import { normalizarCapaParaYouTube } from "@/lib/media/capa-youtube";
import { resolveSocialAccountAccessToken } from "@/lib/publish/oauth-post";
import type { Radar } from "@/lib/media/radar-do-video";
import { projetoVisivel } from "@/lib/equipe/conta";

/**
 * A capa (thumbnail) do vídeo COMPLETO no YouTube.
 *
 * Nasceu em 02/09, do primeiro vídeo que o Bruno publicou de verdade: "o
 * vídeo subiu para o YouTube sem capa". Lendo os dados: nada compunha uma
 * capa 16:9 para o completo (só os cortes tinham capa, em 9:16) e nada
 * chamava thumbnails/set no YouTube. O quadro-fonte (`capaFonteUrl`) existia,
 * servia de pôster no Gestor e parava aí.
 *
 * Regras dele para o conserto: "precisa dar pelo menos 2 opções para o
 * usuário, e o usuário precisa ter a opção de escolher o estilo da capa".
 * Então:
 *
 * - O estilo é do PROJETO (`Project.capaEstilo`), como o estilo de edição:
 *   canal com capa diferente a cada vídeo não constrói identidade. Escolher
 *   um estilo no card do vídeo grava no projeto e refaz as opções.
 * - Cada geração produz DUAS opções no estilo escolhido, com frases
 *   diferentes, e o cliente marca uma. A marcada vai para o YouTube na
 *   publicação; se o vídeo já foi publicado, vai na hora.
 * - Tudo fica em `VideoJob.capas`: { estilo, opcoes, escolhida, geradaEm }.
 *
 * A imagem que sobe é normalizada para JPEG 1280x720: o YouTube recusa capa
 * acima de 2 MB, e o modelo de imagem devolve PNG de tamanho variável.
 */

export { climaDeCapaValido, estiloDeCapaValido } from "@/lib/media/estilos-de-capa";
export type { CapasDoCompleto, ClimaDaCapa, OpcaoDeCapa } from "@/lib/media/estilos-de-capa";

const SISTEMA_DAS_FRASES = `Você escreve a frase que vai ESCRITA na capa (thumbnail) de um vídeo completo de YouTube.

Recebe o título do vídeo, o que a pessoa defende nele e o nicho. Devolva DUAS opções bem diferentes entre si, para o dono do vídeo escolher: uma mais afirmativa, outra mais provocativa ou em pergunta.

Cada opção tem:
- "frase": no máximo 6 PALAVRAS, para ler de relance num celular pequeno. Frase de impacto, não resumo. Prefira contraste ("Consultoria não escala") a descrição ("Sobre modelos de negócio"). Não repita o título ao pé da letra.
- "expressao": a emoção do rosto na capa, um destes valores exatos: "confiante" (afirma o que sabe, sorrindo), "alegre" (boa notícia, convite, conteúdo leve), "curioso" (levanta pergunta), "surpreso" (algo contraintuitivo), "provocativo" (opinião que desafia o senso comum), "serio" (nomeia erro, perda ou verdade dura), "preocupado" (alerta de risco). Varie: as duas opções NÃO podem ter a mesma expressão, e "serio" e "preocupado" só entram quando o conteúdo é de fato pesado. Capa com sorriso rende mais em canal pessoal; na dúvida, "confiante" ou "alegre".

Regras:
- Português do Brasil com acentuação completa, mesmo em caixa alta: "Sua IA ainda é estagiária", nunca "Sua IA ainda e estagiaria". Nunca use travessão.
- Nunca invente fato, número ou nome que não esteja no material.
- Nada de emoji, nada de aspas dentro da frase.

Responda SOMENTE com JSON válido, sem cercas de código, sem quebra de linha dentro de string:
{"opcoes":[{"frase":"...","expressao":"confiante"},{"frase":"...","expressao":"curioso"}]}`;

const EXPRESSOES: Expressao[] = [
  "confiante",
  "serio",
  "curioso",
  "surpreso",
  "preocupado",
  "alegre",
  "misterioso",
  "dramatico",
  "divertido",
  "provocativo",
];

/**
 * Quando o cliente escolhe o clima, a expressão do rosto é a do clima, e o
 * agente só escreve as frases. "automatico" deixa o agente escolher pelo
 * conteúdo, como sempre foi.
 */
const EXPRESSAO_DO_CLIMA: Record<Exclude<ClimaDaCapa, "automatico">, Expressao> = {
  alegre: "alegre",
  confiante: "confiante",
  serio: "serio",
  curioso: "curioso",
  surpreso: "surpreso",
  misterioso: "misterioso",
  dramatico: "dramatico",
  divertido: "divertido",
  provocativo: "provocativo",
};

type Frase = { frase: string; expressao: Expressao };

async function escreverFrasesDaCapa(
  material: { titulo: string; resumo: string; teses: string[]; nicho?: string | null },
  projectId: string,
  clima: ClimaDaCapa
): Promise<Frase[]> {
  const fixa = clima === "automatico" ? null : EXPRESSAO_DO_CLIMA[clima];
  const resposta = await askClaude(
    SISTEMA_DAS_FRASES,
    `${material.nicho ? `Nicho: ${material.nicho}\n\n` : ""}${
      fixa
        ? `Clima escolhido pelo dono do vídeo: ${CLIMAS_DE_CAPA_ROTULO[clima].rotulo} (${CLIMAS_DE_CAPA_ROTULO[clima].descricao}). As duas frases precisam combinar com esse clima. Ignore o campo "expressao": preencha com "${fixa}" nas duas.\n\n`
        : ""
    }Título do vídeo: ${material.titulo}
${material.resumo ? `\nO que a pessoa defende: ${material.resumo}\n` : ""}
Teses ditas no vídeo:
${material.teses.map((t) => `- ${t}`).join("\n") || "(sem teses registradas)"}`,
    { maxTokens: 4000, usage: { operation: "video_capa_texto", projectId } }
  );
  const limpo = resposta.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  const dados = JSON.parse(limpo) as { opcoes?: Array<{ frase?: string; expressao?: string }> };
  const frases = (dados.opcoes ?? [])
    .filter((o) => typeof o.frase === "string" && o.frase.trim())
    .map((o) => ({
      frase: o.frase!.trim().replace(/["“”]/g, "").slice(0, 60),
      expressao:
        fixa ?? (EXPRESSOES.includes(o.expressao as Expressao) ? (o.expressao as Expressao) : "confiante"),
    }))
    .slice(0, 2);
  // Duas opções é a promessa ao cliente. Se o modelo devolveu uma só, a
  // segunda sai do título, que é o texto mais seguro que existe sobre o vídeo.
  while (frases.length < 2) {
    frases.push({
      frase: material.titulo.split(/\s+/).slice(0, 6).join(" "),
      expressao: fixa ?? (frases.length === 0 ? "confiante" : "curioso"),
    });
  }
  // A frase sem acento ("SUA IA AINDA E ESTAGIARIA", 30/09): o modelo às vezes
  // larga o acento em frase curta de miniatura. Ver lib/media/acentuacao.ts.
  const acentuadas = await acentuarFrases(frases.map((f) => f.frase), { projectId });
  return frases.map((f, i) => ({ ...f, frase: acentuadas[i] ?? f.frase }));
}

/** A cor principal da paleta do projeto ("#F97316,#1e1f22" vira "#F97316"). */
function corPrincipal(paleta: string | null | undefined): string | null {
  const primeira = paleta?.split(",")[0]?.trim();
  return primeira && /^#[0-9a-f]{3,8}$/i.test(primeira) ? primeira : null;
}

/**
 * Gera (ou regenera) as duas opções de capa do completo, no estilo do
 * projeto ou no estilo passado. Guarda em `VideoJob.capas`, aponta o pôster
 * do card do Vitor para a primeira e deixa a escolhida no post do YouTube.
 *
 * Idempotente por chamada: quem chama duas vezes ganha opções novas (é o
 * "gerar outras 2" da tela). O piloto da esteira só dispara quando `capas`
 * está vazio, então não há geração repetida sem o cliente pedir.
 */
export async function gerarCapasDoCompleto(
  videoJobId: string,
  opcoes: { estilo?: EstiloDeCapa; clima?: ClimaDaCapa; userId?: string } = {}
): Promise<CapasDoCompleto> {
  const video = await prisma.videoJob.findFirst({
    where: { id: videoJobId, ...(opcoes.userId ? { project: projetoVisivel(opcoes.userId) } : {}) },
    select: {
      id: true,
      projectId: true,
      capaFonteUrl: true,
      completoUrl: true,
      capas: true,
      radar: true,
      originalName: true,
      project: { select: { niche: true, colorPalette: true, capaEstilo: true, name: true } },
    },
  });
  if (!video) throw new Error("Vídeo não encontrado.");
  if (!video.capaFonteUrl) throw new Error("O vídeo ainda não tem o quadro-fonte da capa.");

  const estilo: EstiloDeCapa = opcoes.estilo ?? (estiloDeCapaValido(video.project.capaEstilo) ? video.project.capaEstilo : "impacto");
  if (opcoes.estilo && opcoes.estilo !== video.project.capaEstilo) {
    // O estilo é do projeto: escolher aqui vale para os próximos vídeos.
    await prisma.project.update({ where: { id: video.projectId }, data: { capaEstilo: opcoes.estilo } });
  }

  // O clima é do vídeo, não do projeto: depende do que foi dito. Sem pedido,
  // repete o das capas anteriores deste vídeo ("Gerar outras 2" mantém).
  const clima: ClimaDaCapa =
    opcoes.clima ?? ((video.capas as CapasDoCompleto | null)?.clima ?? "automatico");

  const post = await prisma.post.findFirst({
    where: {
      projectId: video.projectId,
      platform: "youtube",
      AND: [
        { metadata: { path: ["videoJobId"], equals: video.id } },
        { metadata: { path: ["gravacaoCompleta"], equals: true } },
      ],
    },
    select: { id: true, content: true, metadata: true },
  });
  const radar = video.radar as Radar | null;
  const titulo =
    post?.content.split("\n")[0]?.trim() ||
    radar?.tema ||
    (video.originalName ?? "Vídeo").replace(/\.[^.]+$/, "");

  const [frases, quadro] = await Promise.all([
    escreverFrasesDaCapa(
      {
        titulo,
        resumo: radar?.resumo ?? "",
        teses: (radar?.teses ?? []).map((t) => t.frase).slice(0, 6),
        nicho: video.project.niche,
      },
      video.projectId,
      clima
    ),
    lerMidia(video.capaFonteUrl),
  ]);
  if (!quadro) throw new Error("Não consegui ler o quadro-fonte da capa.");
  const quadroBase64 = quadro.toString("base64");

  // As duas composições em paralelo: cada uma leva de 30 s a 1 min no Pro.
  const artes = await Promise.all(
    frases.map((f) =>
      comporCapa(quadroBase64, f.frase, {
        expressao: f.expressao,
        nicho: video.project.niche,
        formato: "16:9",
        estilo,
        clima: clima === "automatico" ? undefined : clima,
        corDaMarca: corPrincipal(video.project.colorPalette),
        usageCtx: { projectId: video.projectId },
        // O worker recorta a pessoa do quadro-fonte; o rosto não passa por modelo nenhum.
        quadroUrl: video.capaFonteUrl,
        chaveDoRecorte: `cortes/${video.id}/recorte-fonte.png`,
      })
    )
  );

  const prontas: OpcaoDeCapa[] = [];
  for (let i = 0; i < frases.length; i++) {
    const arte = artes[i];
    if (!arte) continue;
    const jpeg = await normalizarCapaParaYouTube(dataUrlToBuffer(arte));
    const { url } = await put(`cortes/${video.id}/capa-completo-${i}.jpg`, jpeg, {
      ...midiaProduzida(),
      contentType: "image/jpeg",
      addRandomSuffix: true,
    });
    prontas.push({ url, frase: frases[i].frase, expressao: frases[i].expressao });
  }
  if (prontas.length === 0) {
    throw new Error("Nenhuma capa saiu desta vez. Tente de novo em instantes.");
  }

  // A foto da biblioteca que o cliente já tinha posto entre as opções fica
  // (05/10): "Gerar outras 2" e a geração automática trocam as composições,
  // não a escolha dele. Se a escolhida era uma foto da biblioteca, ela segue
  // escolhida e as geradas entram só como opções.
  const anteriores = video.capas as CapasDoCompleto | null;
  const daBiblioteca = (anteriores?.opcoes ?? []).filter((o) => o.materialId);
  const fotoEscolhida = anteriores?.opcoes[anteriores.escolhida]?.materialId;
  const opcoesNovas = [...prontas, ...daBiblioteca];
  const escolhida = fotoEscolhida ? Math.max(0, opcoesNovas.findIndex((o) => o.materialId === fotoEscolhida)) : 0;
  const capas: CapasDoCompleto = {
    estilo,
    clima,
    opcoes: opcoesNovas,
    escolhida,
    geradaEm: new Date().toISOString(),
  };
  await prisma.videoJob.update({ where: { id: video.id }, data: { capas: capas as never } });
  // A escolha da foto já está no card, no post e no YouTube: não reaponta.
  if (!fotoEscolhida) await apontarCapaEscolhida(video.id, video.projectId, post, capas.opcoes[0].url);
  return capas;
}

/**
 * O cliente marcou uma das opções. Grava a escolha, atualiza o pôster do card
 * e o post do YouTube e, se o vídeo JÁ está no ar, troca a capa lá na hora.
 *
 * Devolve `aviso` quando o YouTube recusou a troca (canal sem verificação por
 * telefone): a escolha fica gravada mesmo assim, e a tela mostra o motivo.
 */
export async function escolherCapaDoCompleto(
  videoJobId: string,
  userId: string,
  indice: number
): Promise<{ capas: CapasDoCompleto; aviso?: string }> {
  const video = await prisma.videoJob.findFirst({
    where: { id: videoJobId, project: projetoVisivel(userId) },
    select: { id: true, projectId: true, capas: true },
  });
  if (!video) throw new Error("Vídeo não encontrado.");
  const capas = video.capas as CapasDoCompleto | null;
  const opcao = capas?.opcoes[indice];
  if (!capas || !opcao) throw new Error("Essa opção de capa não existe.");

  const novas: CapasDoCompleto = { ...capas, escolhida: indice };
  await prisma.videoJob.update({ where: { id: video.id }, data: { capas: novas as never } });

  const post = await prisma.post.findFirst({
    where: {
      projectId: video.projectId,
      platform: "youtube",
      AND: [
        { metadata: { path: ["videoJobId"], equals: video.id } },
        { metadata: { path: ["gravacaoCompleta"], equals: true } },
      ],
    },
    select: { id: true, content: true, metadata: true, status: true, externalId: true },
  });
  await apontarCapaEscolhida(video.id, video.projectId, post, opcao.url);

  let aviso: string | undefined;
  if (post?.status === "published" && post.externalId) {
    try {
      await enviarCapaAoYouTube(video.projectId, post.externalId, opcao.url);
    } catch (e) {
      aviso = e instanceof Error ? e.message : "O YouTube não aceitou a capa agora.";
    }
  }
  return { capas: novas, aviso };
}

/**
 * A CAPA A PARTIR DA BIBLIOTECA DE MATERIAIS (05/10/2026): o cliente escolhe
 * uma foto que ele mesmo subiu, além das duas compostas pelo squad.
 *
 * A foto é a real, sem modelo de imagem nenhum (custo zero): recortada para
 * 16:9 pelo ponto de maior interesse (rosto, produto), em JPEG 1280x720, que
 * é o que o YouTube aceita. Vai para o store público como as outras capas,
 * porque capa é mídia produzida e é pública no YouTube de qualquer forma.
 *
 * Entra como mais uma opção em `capas.opcoes` (com `materialId`) e já sai
 * escolhida, pelo mesmo caminho da escolha comum: card, post e, se o vídeo
 * já está no ar, o YouTube. A mesma foto escolhida de novo não duplica.
 */
export async function usarMaterialComoCapa(
  videoJobId: string,
  userId: string,
  materialId: string
): Promise<{ capas: CapasDoCompleto; aviso?: string }> {
  const video = await prisma.videoJob.findFirst({
    where: { id: videoJobId, project: projetoVisivel(userId) },
    select: { id: true, projectId: true, capas: true, project: { select: { capaEstilo: true } } },
  });
  if (!video) throw new Error("Vídeo não encontrado.");
  const material = await prisma.materialDoCliente.findFirst({
    where: { id: materialId, projectId: video.projectId },
    select: { id: true, tipo: true, url: true, descricao: true },
  });
  if (!material) throw new Error("Essa foto não está na biblioteca deste projeto.");
  if (material.tipo !== "foto") throw new Error("A capa precisa ser uma foto.");

  const atuais = video.capas as CapasDoCompleto | null;
  const ja = atuais?.opcoes.findIndex((o) => o.materialId === material.id) ?? -1;
  if (atuais && ja >= 0) return escolherCapaDoCompleto(video.id, userId, ja);

  const original = await lerMidia(material.url);
  if (!original) throw new Error("Não consegui ler a foto da biblioteca.");
  const { default: sharp } = await import("sharp");
  const jpeg = await sharp(original)
    .rotate()
    .resize(1280, 720, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  const { url } = await put(`cortes/${video.id}/capa-material-${material.id}.jpg`, jpeg, {
    ...midiaProduzida(),
    contentType: "image/jpeg",
    addRandomSuffix: true,
  });

  const nova: OpcaoDeCapa = { url, frase: "Foto da sua biblioteca", expressao: "confiante", materialId: material.id };
  const capas: CapasDoCompleto = atuais
    ? { ...atuais, opcoes: [...atuais.opcoes, nova] }
    : {
        estilo: estiloDeCapaValido(video.project.capaEstilo) ? video.project.capaEstilo : "impacto",
        opcoes: [nova],
        escolhida: 0,
        geradaEm: new Date().toISOString(),
      };
  await prisma.videoJob.update({ where: { id: video.id }, data: { capas: capas as never } });
  await prisma.materialDoCliente
    .update({ where: { id: material.id }, data: { usos: { increment: 1 }, ultimoUsoEm: new Date() } })
    .catch(() => {});
  return escolherCapaDoCompleto(video.id, userId, capas.opcoes.length - 1);
}

/**
 * Deixa a capa escolhida onde a tela e a publicação leem: `metadata.capaUrl`
 * no post do YouTube (a publicação sobe essa) e `metadata.thumb` no card do
 * Vitor (o pôster do player no Gestor).
 */
async function apontarCapaEscolhida(
  videoJobId: string,
  projectId: string,
  post: { id: string; metadata: unknown } | null,
  url: string
): Promise<void> {
  if (post) {
    const meta = (post.metadata as Record<string, unknown> | null) ?? {};
    await prisma.post.update({ where: { id: post.id }, data: { metadata: { ...meta, capaUrl: url } as never } });
  }
  const card = await prisma.campaignCard.findFirst({
    where: {
      projectId,
      cardType: "video_clip",
      AND: [
        { metadata: { path: ["videoJobId"], equals: videoJobId } },
        { metadata: { path: ["completo"], equals: true } },
      ],
    },
    select: { id: true, metadata: true },
  });
  if (card) {
    const meta = (card.metadata as Record<string, unknown> | null) ?? {};
    await prisma.campaignCard.update({
      where: { id: card.id },
      data: { metadata: { ...meta, thumb: url, capaUrl: url } as never },
    });
  }
}

/**
 * Sobe a capa para um vídeo do YouTube usando a conta conectada ao projeto.
 * Lança com mensagem legível; quem chama decide se é aviso ou erro.
 */
export async function enviarCapaAoYouTube(
  projectId: string,
  youtubeVideoId: string,
  capaUrl: string
): Promise<void> {
  const conta = await prisma.socialAccount.findFirst({
    where: { projectId, platform: "youtube" },
  });
  if (!conta) throw new Error("O projeto não tem canal do YouTube conectado.");
  const bytes = await lerMidia(capaUrl);
  if (!bytes) throw new Error("Não consegui ler a capa escolhida.");
  const { accessToken } = await resolveSocialAccountAccessToken(conta);
  await setYouTubeThumbnail(accessToken, youtubeVideoId, {
    bytes: await normalizarCapaParaYouTube(bytes),
    mimeType: "image/jpeg",
  });
}
