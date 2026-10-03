-- A defesa contra robô no cadastro e nos formulários públicos (01/10).
-- Só acrescenta: quatro colunas opcionais em users e uma tabela nova.

-- A marca de robô (o script de limpeza marca, não apaga) e de onde o cadastro veio.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roboEm" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roboMotivo" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cadastroIpHash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cadastroAgente" TEXT;

-- O contador do limite por IP e por e-mail, que precisa sobreviver entre instâncias.
CREATE TABLE IF NOT EXISTS "tentativas_publicas" (
    "id" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "emailHash" TEXT,
    "aceita" BOOLEAN NOT NULL,
    "motivo" TEXT,
    "agente" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tentativas_publicas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "tentativas_publicas_rota_ipHash_createdAt_idx" ON "tentativas_publicas"("rota", "ipHash", "createdAt");
CREATE INDEX IF NOT EXISTS "tentativas_publicas_rota_emailHash_createdAt_idx" ON "tentativas_publicas"("rota", "emailHash", "createdAt");
CREATE INDEX IF NOT EXISTS "tentativas_publicas_createdAt_idx" ON "tentativas_publicas"("createdAt");
