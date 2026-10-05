// A Vera do vídeo e a correção do squad só olham as peças do run do card
// (05/10/2026). O filtro é a função pura; aqui ele é aplicado a uma lista que
// reproduz o banco da noite de 05/10, sem tocar banco nem IA.
// Rodar: npx tsx --test scripts/testes/vera-so-do-run-0510.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS_FORA_DA_REVISAO, filtroDosPostsDoDia } from "@/lib/media/vera-do-video";

type PostFalso = { id: string; projectId: string; runId: string | null; status: string; scheduledAt: Date | null };

/** Aplica o `where` do Prisma, do jeito que o filtro o escreve, a uma lista em memória. */
function aplicar(posts: PostFalso[], where: ReturnType<typeof filtroDosPostsDoDia>): string[] {
  return posts
    .filter(
      (p) =>
        p.projectId === where.projectId &&
        p.runId === where.runId &&
        p.scheduledAt !== null &&
        p.scheduledAt >= where.scheduledAt.gte &&
        p.scheduledAt < where.scheduledAt.lt &&
        !(where.status.notIn as string[]).includes(p.status)
    )
    .map((p) => p.id);
}

// A segunda-feira 05/10 do projeto Fé & Gestão, como a Vera numerou às 20:41.
const PROJETO = "cmuuvwllb000004l1iqjm1yi2";
const RUN_DO_VIDEO = "cmuvv1pvu000204l356jnrwia";
const segunda = (hora: string) => new Date(`2026-10-05T${hora}:00.000Z`);
const SEGUNDA_05 = [
  { id: "cmuvk9z42", projectId: PROJETO, runId: "cmuviao1c", status: "cancelled", scheduledAt: segunda("09:00") }, // vídeo cancelado às 15:16
  { id: "cmuviccaw", projectId: PROJETO, runId: "cmuviao1c", status: "cancelled", scheduledAt: segunda("12:00") },
  { id: "cmuvlnh5f", projectId: PROJETO, runId: "cmuvllw4v", status: "cancelled", scheduledAt: segunda("12:00") }, // vídeo cancelado às 16:06
  { id: "cmuvlnka4", projectId: PROJETO, runId: "cmuvllw4v", status: "cancelled", scheduledAt: segunda("12:00") },
  { id: "cmuvv3ash", projectId: PROJETO, runId: RUN_DO_VIDEO, status: "draft", scheduledAt: segunda("12:00") }, // o vídeo novo
  { id: "cmuvv3dps", projectId: PROJETO, runId: RUN_DO_VIDEO, status: "draft", scheduledAt: segunda("12:00") },
  { id: "cmuvvfwf9", projectId: PROJETO, runId: "cmuvve6u2", status: "draft", scheduledAt: segunda("23:28") }, // o post único
];

test("na segunda 05/10 a Vera do vídeo só vê as duas peças do run do vídeo", () => {
  const where = filtroDosPostsDoDia({ projectId: PROJETO, runId: RUN_DO_VIDEO, scheduledDate: segunda("13:00") });
  assert.deepEqual(aplicar(SEGUNDA_05, where), ["cmuvv3ash", "cmuvv3dps"]);
});

test("na quarta 07/10 a thread publicada de outro run fica fora, mesmo caindo na mesma data", () => {
  const quarta = (hora: string) => new Date(`2026-10-07T${hora}:00.000Z`);
  const posts: PostFalso[] = [
    { id: "cmuuxujdk", projectId: PROJETO, runId: "cmuuxtmzp", status: "published", scheduledAt: quarta("12:00") }, // reescrita por engano às 20:39
    { id: "cmuvice90", projectId: PROJETO, runId: "cmuviao1c", status: "cancelled", scheduledAt: quarta("12:00") },
    { id: "cmuvv32cg", projectId: PROJETO, runId: RUN_DO_VIDEO, status: "draft", scheduledAt: quarta("12:00") },
  ];
  const where = filtroDosPostsDoDia({ projectId: PROJETO, runId: RUN_DO_VIDEO, scheduledDate: quarta("13:00") });
  assert.deepEqual(aplicar(posts, where), ["cmuvv32cg"]);
  // E mesmo que a peça publicada fosse do run, ela não volta à mesa.
  const doRun = posts.map((p) => ({ ...p, runId: RUN_DO_VIDEO }));
  assert.deepEqual(aplicar(doRun, where), ["cmuvv32cg"]);
});

test("o dia é o dia UTC inteiro do card, e o run é exato", () => {
  const where = filtroDosPostsDoDia({ projectId: PROJETO, runId: RUN_DO_VIDEO, scheduledDate: segunda("13:00") });
  assert.equal(where.scheduledAt.gte.toISOString(), "2026-10-05T00:00:00.000Z");
  assert.equal(where.scheduledAt.lt.toISOString(), "2026-10-06T00:00:00.000Z");
  assert.equal(where.runId, RUN_DO_VIDEO);
  // O post único na mesma segunda, com runId parecido, não entra.
  assert.deepEqual(aplicar(SEGUNDA_05.filter((p) => p.id === "cmuvvfwf9"), where), []);
});

test("o que já saiu, o que o cliente arquivou ou reprovou e o que falhou ficam fora da revisão", () => {
  assert.deepEqual([...STATUS_FORA_DA_REVISAO], ["failed", "published", "publishing", "cancelled", "rejected"]);
  const where = filtroDosPostsDoDia({ projectId: PROJETO, runId: RUN_DO_VIDEO, scheduledDate: segunda("13:00") });
  const vivos = ["draft", "scheduled", "pending"].map((status, i) => ({ id: `v${i}`, projectId: PROJETO, runId: RUN_DO_VIDEO, status, scheduledAt: segunda("12:00") }));
  const mortos = STATUS_FORA_DA_REVISAO.map((status, i) => ({ id: `m${i}`, projectId: PROJETO, runId: RUN_DO_VIDEO, status, scheduledAt: segunda("12:00") }));
  assert.deepEqual(aplicar([...vivos, ...mortos], where), ["v0", "v1", "v2"]);
});
