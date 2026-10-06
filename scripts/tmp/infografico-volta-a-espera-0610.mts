// O INFOGRÁFICO DA CAMPANHA DE 06/10 VOLTA A ESPERAR A IDENTIDADE (06/10/2026).
//
// A campanha do Demandou de 06/10 (run cmuwysin0004804l5moopo3w6) saiu com a
// imagem e o carrossel "aguardando a sua identidade visual" e o infográfico
// desenhado num estilo que ninguém escolheu (a família "colagem", herdada do
// estilo de VÍDEO Vox), porque a semana do vídeo não lia a trava para o
// infográfico. O conserto de código impede o próximo; este script põe o
// infográfico desta campanha no mesmo estado das outras peças do dia:
// imageUrl nulo e `aguardandoIdentidade`, nos posts e no card da Diana. Quando
// o Bruno aprovar a identidade em Configurações > Modelos de arte, o "Aprovar
// e gerar" (lib/media/artes-aguardando-identidade.ts) desenha o infográfico
// no estilo aprovado, já com a regra de caber e sem número repetido.
//
// NENHUMA FOTO É GERADA (infográfico é composto em código). Quem gera depois é
// o "Aprovar e gerar": uma extração de texto (Gemini, centavos) e a composição
// local, cobrada do cliente só depois de a arte existir, como as outras.
//
// SEM ARGUMENTO, NÃO ESCREVE NADA: mostra o que mudaria. Com a identidade já
// aprovada, recompõe de graça os posts que guardaram o conteúdo extraído
// (metadata.infografico, desde o conserto de 06/10); os de antes pedem
// extração nova, e o caminho é "Refazer" no card.
//
// Uso (da raiz do repositório, depois do merge):
//   npx tsx scripts/tmp/infografico-volta-a-espera-0610.mts                     # ensaio
//   npx tsx scripts/tmp/infografico-volta-a-espera-0610.mts --gravar            # grava
//   ... --run <id>     outra campanha (padrão: a de 06/10 do Demandou)
import { readFileSync, existsSync } from "node:fs";

for (const arq of ["C:/Users/devan/opensquad-app/.env.local", ".env.local"]) {
  if (!existsSync(arq)) continue;
  for (const l of readFileSync(arq, "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  break;
}

const args = process.argv.slice(2);
const gravar = args.includes("--gravar");
const runId = args.indexOf("--run") >= 0 ? args[args.indexOf("--run") + 1] : "cmuwysin0004804l5moopo3w6";

const { prisma } = await import("@/lib/db/prisma");
const { estadoDaIdentidade } = await import("@/lib/modelos-de-arte/identidade-aprovada");
const { marcarEspera, conteudoDoCardAguardando, TEXTO_DO_CARD_AGUARDANDO } = await import("@/lib/modelos-de-arte/espera-da-identidade");

const run = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { id: true, projectId: true, archived: true, project: { select: { name: true, colorPalette: true } } } });
if (!run) {
  console.error(`Campanha ${runId} não encontrada.`);
  process.exit(1);
}
const identidade = await estadoDaIdentidade(run.projectId, run.project.colorPalette);
console.log(`Campanha ${run.id} do projeto "${run.project.name}"; identidade aprovada: ${identidade.aprovada ? "sim" : "não"}${run.archived ? " (ARQUIVADA: o Aprovar e gerar não pega campanha arquivada)" : ""}`);
if (identidade.aprovada) {
  // IDENTIDADE APROVADA: recompõe de graça quando o post guardou o conteúdo
  // extraído (metadata.infografico, gravado desde o conserto de 06/10). Sem
  // ele (campanhas anteriores), recompor pede extração nova: o caminho é o
  // "Refazer" no card, cobrado do cliente como toda peça refeita.
  const { marcaDaArte } = await import("@/lib/media/arte-com-frase");
  const { desenharInfografico } = await import("@/lib/media/infographic");
  const { formatoDaPeca } = await import("@/lib/media/formatos-das-redes");
  const { ajustarParaFormato } = await import("@/lib/media/margem-de-seguranca");
  const posts = await prisma.post.findMany({ where: { runId, mediaType: "infographic" }, select: { id: true, platform: true, metadata: true } });
  const marca = await marcaDaArte(run.projectId, { runId });
  let feitos = 0;
  for (const p of posts) {
    const conteudo = (p.metadata as { infografico?: unknown } | null)?.infografico as import("@/lib/media/infographic").ConteudoDoInfografico | undefined;
    if (!conteudo?.sections) {
      console.log(`  post ${p.id} (${p.platform}): sem o conteúdo guardado; recompor pede extração nova. Use "Refazer" no card.`);
      continue;
    }
    const formato = formatoDaPeca(p.platform, "infographic");
    const bruta = await desenharInfografico(conteudo, "", formato.proporcao, { estilo: "", paleta: "", marca });
    const url = (await ajustarParaFormato(bruta!, formato)).dataUri;
    console.log(`  post ${p.id} (${p.platform}): recomposto (${Math.round(url.length / 1024)} KB)${gravar ? "" : ", ensaio"}`);
    if (gravar) {
      await prisma.post.update({ where: { id: p.id }, data: { imageUrl: url } });
      await prisma.campaignCard.updateMany({ where: { runId, postId: p.id, cardType: "media", mediaType: "infographic" }, data: { mediaUrl: url } });
    }
    feitos++;
  }
  console.log(feitos ? `\n${feitos} infográfico(s) ${gravar ? "gravado(s)" : "recomposto(s) em ensaio; rode com --gravar"}.` : "\nNada recomposto.");
  await prisma.$disconnect();
  process.exit(0);
}

const posts = await prisma.post.findMany({
  where: { runId, mediaType: "infographic", status: { in: ["draft", "scheduled", "failed"] } },
  select: { id: true, platform: true, imageUrl: true, metadata: true, dayOfWeek: true },
});
const cards = await prisma.campaignCard.findMany({
  where: { runId, cardType: "media", mediaType: "infographic" },
  select: { id: true, postId: true, mediaUrl: true, metadata: true },
});
console.log(`${posts.length} post(s) de infográfico pendentes e ${cards.length} card(s) da Diana.`);
for (const p of posts) console.log(`  post ${p.id} (${p.platform}): arte ${p.imageUrl ? "presente, sai" : "já vazia"}`);
for (const c of cards) console.log(`  card ${c.id}: arte ${c.mediaUrl ? "presente, sai" : "já vazia"}`);

if (!gravar) {
  console.log("\nEnsaio: nada foi gravado. Rode com --gravar para pôr o infográfico em espera.");
  await prisma.$disconnect();
  process.exit(0);
}

for (const p of posts) {
  await prisma.post.update({ where: { id: p.id }, data: { imageUrl: null, metadata: marcarEspera(p.metadata) as never } });
}
for (const c of cards) {
  await prisma.campaignCard.update({
    where: { id: c.id },
    data: { mediaUrl: null, content: conteudoDoCardAguardando("infographic"), metadata: { ...((c.metadata as Record<string, unknown> | null) ?? {}), aguardandoIdentidade: true } as never },
  });
}
console.log(`\nGravado: ${posts.length} post(s) e ${cards.length} card(s) em "${TEXTO_DO_CARD_AGUARDANDO.slice(0, 40)}...". A arte sai no "Aprovar e gerar".`);
await prisma.$disconnect();
