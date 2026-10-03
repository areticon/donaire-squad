-- ACESSO DE EQUIPE (01/10/2026). Aditiva e com IF NOT EXISTS pelo mesmo motivo
-- de 20260930120000_rodada_do_video: o banco é compartilhado entre o dev local
-- e a produção, e rodar duas vezes não pode quebrar nada.
--
-- 1. A conta que paga ganha os acessos extras vendidos à parte.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "acessosExtras" INTEGER NOT NULL DEFAULT 0;

-- 2. O extrato ganha QUEM FEZ (o membro), separado de quem PAGA ("userId").
ALTER TABLE "credit_transactions" ADD COLUMN IF NOT EXISTS "autorId" TEXT;
CREATE INDEX IF NOT EXISTS "credit_transactions_autorId_createdAt_idx" ON "credit_transactions"("autorId", "createdAt");

-- 3. Os membros (e convites) de cada equipe.
CREATE TABLE IF NOT EXISTS "membros_da_equipe" (
    "id" TEXT NOT NULL,
    "donoId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "nome" TEXT,
    "status" TEXT NOT NULL DEFAULT 'convidado',
    "tokenHash" TEXT,
    "conviteExpiraEm" TIMESTAMP(3),
    "todosOsProjetos" BOOLEAN NOT NULL DEFAULT false,
    "tetoGravacoes" INTEGER,
    "tetoCreditos" INTEGER,
    "aceitoEm" TIMESTAMP(3),
    "removidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "membros_da_equipe_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "membros_da_equipe_tokenHash_key" ON "membros_da_equipe"("tokenHash");
CREATE INDEX IF NOT EXISTS "membros_da_equipe_donoId_status_idx" ON "membros_da_equipe"("donoId", "status");
CREATE INDEX IF NOT EXISTS "membros_da_equipe_userId_status_idx" ON "membros_da_equipe"("userId", "status");
CREATE INDEX IF NOT EXISTS "membros_da_equipe_email_idx" ON "membros_da_equipe"("email");
-- Travas que o Prisma não expressa (índice parcial): uma pessoa é membro ATIVO
-- de uma equipe só (senão a conta que paga seria ambígua), e um e-mail tem no
-- máximo um convite vivo por equipe.
CREATE UNIQUE INDEX IF NOT EXISTS "membros_da_equipe_um_ativo_por_usuario" ON "membros_da_equipe"("userId") WHERE "status" = 'ativo';
CREATE UNIQUE INDEX IF NOT EXISTS "membros_da_equipe_um_vivo_por_email" ON "membros_da_equipe"("donoId", lower("email")) WHERE "status" <> 'removido';

-- 4. Quais projetos do dono cada membro pode usar.
CREATE TABLE IF NOT EXISTS "acessos_ao_projeto" (
    "membroId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acessos_ao_projeto_pkey" PRIMARY KEY ("membroId", "projectId")
);
CREATE INDEX IF NOT EXISTS "acessos_ao_projeto_projectId_idx" ON "acessos_ao_projeto"("projectId");

-- 5. Chaves estrangeiras (Postgres não tem ADD CONSTRAINT IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'membros_da_equipe_donoId_fkey') THEN
    ALTER TABLE "membros_da_equipe" ADD CONSTRAINT "membros_da_equipe_donoId_fkey"
      FOREIGN KEY ("donoId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'membros_da_equipe_userId_fkey') THEN
    ALTER TABLE "membros_da_equipe" ADD CONSTRAINT "membros_da_equipe_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acessos_ao_projeto_membroId_fkey') THEN
    ALTER TABLE "acessos_ao_projeto" ADD CONSTRAINT "acessos_ao_projeto_membroId_fkey"
      FOREIGN KEY ("membroId") REFERENCES "membros_da_equipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acessos_ao_projeto_projectId_fkey') THEN
    ALTER TABLE "acessos_ao_projeto" ADD CONSTRAINT "acessos_ao_projeto_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
