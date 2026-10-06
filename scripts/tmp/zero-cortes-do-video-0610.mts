// ZERO CORTES APROVADO É ZERO CORTES: A LIMPEZA DO VÍDEO cmux0hoxk (06/10/2026).
//
// O Bruno aprovou "só o vídeo completo" neste vídeo às 18:39:38Z, mas a
// aprovação chegou ao servidor com um corte (a cobrança diz "1 corte e o
// vídeo completo"), e a esteira cortou, revisou e pôs dois cards de corte no
// quadro (YouTube Shorts e Instagram Reels, trecho 0). O conserto de código
// grava a decisão explícita (roteiro.soCompleto e roteiro.cortesAprovados) e
// faz todo passo respeitar. Este script põe ESTE vídeo no estado que ele
// deveria ter:
//
//   - os 2 cards de corte vão para "archived" e o rascunho de cada um sai
//     (só se ainda for rascunho; post publicado ou agendado não é tocado);
//   - `clips` fica vazio; o trecho vai para roteiro.descartados (a mídia
//     continua referenciada, nada vira órfão no storage);
//   - roteiro.soCompleto = true e roteiro.cortesAprovados = [].
//
// O card do completo (YouTube) e o resto da semana ficam como estão. O status
// do vídeo não muda. NENHUMA CHAMADA PAGA. Idempotente: rodar de novo não faz
// nada além de dizer que já está limpo.
//
// SEM --gravar, NÃO ESCREVE NADA: mostra o que mudaria.
//
// Uso (da raiz do repositório):
//   npx tsx scripts/tmp/zero-cortes-do-video-0610.mts            # ensaio
//   npx tsx scripts/tmp/zero-cortes-do-video-0610.mts --gravar   # grava
//   ... --video <id>   outro vídeo (padrão: cmux0hoxk000004l5ioro216w)
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
const videoId = args.indexOf("--video") >= 0 ? args[args.indexOf("--video") + 1] : "cmux0hoxk000004l5ioro216w";

const { prisma } = await import("@/lib/db/prisma");

const v = await prisma.videoJob.findUnique({ where: { id: videoId }, select: { id: true, status: true, clips: true, completoMontagem: true } });
if (!v) {
  console.log(`Vídeo ${videoId} não encontrado.`);
  process.exit(1);
}
const montagem = (v.completoMontagem ?? {}) as Record<string, unknown>;
const roteiro = (montagem.roteiro ?? null) as Record<string, unknown> | null;
if (!roteiro?.aprovadoEm) {
  console.log("O roteiro deste vídeo não está aprovado; nada a fazer.");
  process.exit(1);
}
const trechos = (Array.isArray(v.clips) ? v.clips : []) as Array<Record<string, unknown>>;

const cards = await prisma.campaignCard.findMany({
  where: { agentId: "vitor-video", cardType: "video_clip", metadata: { path: ["videoJobId"], equals: videoId } },
  select: { id: true, status: true, postId: true, metadata: true },
});
// Só os cards de CORTE (com trechoIndice); o do completo fica.
const deCorte = cards.filter((c) => {
  const m = c.metadata as { trechoIndice?: unknown; completo?: unknown } | null;
  return typeof m?.trechoIndice === "number" && !m?.completo;
});
const aArquivar = deCorte.filter((c) => c.status !== "archived");
const posts = await prisma.post.findMany({
  where: { id: { in: aArquivar.map((c) => c.postId).filter((x): x is string => Boolean(x)) } },
  select: { id: true, status: true, platform: true },
});
const rascunhos = posts.filter((p) => p.status === "draft");

console.log(`Vídeo ${videoId} (status ${v.status})`);
console.log(`  trechos em clips: ${trechos.length}${trechos.length ? ` (${trechos.map((t) => JSON.stringify(t.titulo)).join(", ")})` : ""}`);
console.log(`  roteiro.soCompleto: ${String(roteiro.soCompleto ?? "(ausente)")}  cortesAprovados: ${JSON.stringify(roteiro.cortesAprovados ?? "(ausente)")}`);
console.log(`  cards de corte: ${deCorte.length}, a arquivar: ${aArquivar.length} ${aArquivar.map((c) => `${c.id}[${(c.metadata as { destino?: string }).destino}]`).join(" ")}`);
console.log(`  rascunhos que saem: ${rascunhos.length} ${rascunhos.map((p) => `${p.id}[${p.platform}]`).join(" ")}`);
const naoRascunho = posts.filter((p) => p.status !== "draft");
if (naoRascunho.length) console.log(`  ATENÇÃO, posts que NÃO são rascunho e ficam: ${naoRascunho.map((p) => `${p.id}[${p.status}]`).join(" ")}`);

const jaLimpo = !trechos.length && roteiro.soCompleto === true && Array.isArray(roteiro.cortesAprovados) && (roteiro.cortesAprovados as unknown[]).length === 0 && !aArquivar.length;
if (jaLimpo) {
  console.log("Já está limpo. Nada a fazer.");
  await prisma.$disconnect();
  process.exit(0);
}
if (!gravar) {
  console.log("\nENSAIO: nada foi gravado. Rode com --gravar para aplicar.");
  await prisma.$disconnect();
  process.exit(0);
}

for (const c of aArquivar) {
  await prisma.campaignCard.update({ where: { id: c.id }, data: { status: "archived" } });
}
if (rascunhos.length) await prisma.post.deleteMany({ where: { id: { in: rascunhos.map((p) => p.id) }, status: "draft" } });

const descartados = [...((Array.isArray(roteiro.descartados) ? roteiro.descartados : []) as unknown[]), ...trechos];
await prisma.videoJob.update({
  where: { id: videoId },
  data: {
    clips: [] as never,
    completoMontagem: { ...montagem, roteiro: { ...roteiro, soCompleto: true, cortesAprovados: [], descartados } } as never,
  },
});
console.log(`\nGRAVADO: ${aArquivar.length} card(s) arquivado(s), ${rascunhos.length} rascunho(s) removido(s), clips vazio, roteiro.soCompleto = true.`);
await prisma.$disconnect();
