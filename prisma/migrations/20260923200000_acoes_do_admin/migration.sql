-- O registro das acoes do admin sobre contas de terceiros (CRM de 23/09).
CREATE TABLE IF NOT EXISTS "admin_acoes" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "alvoId" TEXT,
    "alvoEmail" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "detalhe" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_acoes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "admin_acoes_alvoId_createdAt_idx" ON "admin_acoes"("alvoId", "createdAt");
CREATE INDEX IF NOT EXISTS "admin_acoes_createdAt_idx" ON "admin_acoes"("createdAt");
