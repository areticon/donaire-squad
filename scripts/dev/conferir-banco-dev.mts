/**
 * Conferência só de leitura do banco de DEV (06/10/2026): prova que o
 * envoltório aponta para o banco certo e mostra o tamanho dele. Nenhuma escrita.
 *
 *   node scripts/dev/com-env-dev.mjs npx tsx scripts/dev/conferir-banco-dev.mts
 */
import { prisma } from "@/lib/db/prisma";
import { ambienteAtual, identidadeDoBanco, ehBancoDeProducao } from "@/lib/ambiente/trava-do-banco.mjs";

const id = identidadeDoBanco(process.env.DATABASE_URL);
console.log(`[conferir] ambiente ${ambienteAtual()}, banco ${id?.ref ?? id?.host ?? "?"}, produção? ${ehBancoDeProducao(process.env.DATABASE_URL) ? "SIM" : "não"}`);
const [usuarios, projetos, videos, migracoes] = await Promise.all([
  prisma.user.count(),
  prisma.project.count(),
  prisma.videoJob.count(),
  prisma.$queryRawUnsafe<{ n: bigint }[]>("select count(*)::bigint as n from _prisma_migrations where finished_at is not null"),
]);
console.log(`[conferir] usuários ${usuarios}, projetos ${projetos}, vídeos ${videos}, migrações aplicadas ${migracoes[0]?.n ?? 0}`);
await prisma.$disconnect();
