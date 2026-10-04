// Recoloca na fila o sob medida de um vídeo, com a edição JÁ guardada (sem IA no corte;
// no completo, a prévia volta ao revisor). Rodar SÓ depois de publicar worker e app.
// uso (na raiz do repo): npx tsx scripts/recolocar-sob-medida.mts cmurtv2zg000004jsxq3y28rt [--aplicar]
import { readFileSync } from "node:fs";
const REPO = process.cwd().split("\\").join("/");
for (const l of readFileSync(`${REPO}/.env.local`, "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { prisma } = await import(`file:///${REPO}/lib/db/prisma.ts`);
const id = process.argv[2];
const aplicar = process.argv.includes("--aplicar");
if (!id) throw new Error("falta o id do vídeo");
const v = await prisma.videoJob.findUnique({ where: { id }, select: { clips: true, completoMontagem: true } });
if (!v) throw new Error("vídeo não achado");
const agora = new Date().toISOString();
const limpo = { desde: agora, trabalhando: false, tentativas: 0, esperarAte: null, motivo: null, falhaTecnica: false, candidato: null };
const clips = ((v.clips as any[]) ?? []).map((t, i) => {
  const m = t?.montagem;
  if (!m?.sobMedida?.edicao) return t;
  // O corte já passou pela revisão da prévia: volta direto ao FINAL.
  const fase = m.sobMedida.fase === "previa" || m.sobMedida.fase === "revisar" ? m.sobMedida.fase : "final";
  console.log(`corte ${i}: ${m.estado} -> montando (${fase}, reenviar)`);
  return { ...t, montagem: { ...m, ...limpo, estado: "montando", sobMedida: { ...m.sobMedida, desistiu: null, fase, reenviar: true } } };
});
const c = v.completoMontagem as any;
let completo = c;
if (c?.sobMedida?.edicao) {
  // O completo caiu na PRÉVIA da rodada 1: ela é refeita e segue para o revisor e o final.
  const fase = c.sobMedida.fase === "final" ? "final" : "previa";
  console.log(`completo: ${c.estado} -> montando (${fase}, reenviar)`);
  completo = { ...c, ...limpo, estado: "montando", sobMedida: { ...c.sobMedida, desistiu: null, fase, reenviar: true } };
}
if (aplicar) {
  await prisma.videoJob.update({ where: { id }, data: { clips, completoMontagem: completo } });
  console.log("aplicado: o cron reenvia ao worker na próxima passada");
} else console.log("(simulação; rode com --aplicar)");
await prisma.$disconnect();
