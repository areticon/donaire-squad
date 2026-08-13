-- =============================================================
-- Migração Clerk → better-auth (branch feat/own-auth)
-- =============================================================
-- ⚠️ EXECUTAR SOMENTE JUNTO COM O DEPLOY DO BRANCH feat/own-auth.
-- O app em produção (build antigo) consulta users."clerkId" — aplicar
-- este SQL antes do deploy derruba o app no ar.
--
-- Fluxo recomendado (Neon):
--   1. Criar um branch do banco no Neon (ex: "own-auth-dev") e testar
--      este script + o app local apontando para o branch.
--   2. No deploy: rodar este SQL no banco principal e publicar o build
--      novo na sequência (janela de segundos).
--   3. Depois: npx prisma db push para conferir alinhamento (deve dizer
--      "already in sync").
-- =============================================================

BEGIN;

-- 1. Renomeia a PK do usuário (preserva dados; FKs seguem o rename)
ALTER TABLE "users" RENAME COLUMN "clerkId" TO "id";

-- 2. Renomeia imageUrl → image (padrão better-auth)
ALTER TABLE "users" RENAME COLUMN "imageUrl" TO "image";

-- 3. Campo exigido pelo better-auth
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- 4. Tabelas do better-auth
CREATE TABLE IF NOT EXISTS "sessions" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token"     TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON "sessions"("userId");

CREATE TABLE IF NOT EXISTS "accounts" (
  "id"                    TEXT PRIMARY KEY,
  "userId"                TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "accountId"             TEXT NOT NULL,
  "providerId"            TEXT NOT NULL,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "idToken"               TEXT,
  "accessTokenExpiresAt"  TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "scope"                 TEXT,
  "password"              TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "accounts_userId_idx" ON "accounts"("userId");

CREATE TABLE IF NOT EXISTS "verifications" (
  "id"         TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "verifications_identifier_idx" ON "verifications"("identifier");

COMMIT;

-- =============================================================
-- PÓS-MIGRAÇÃO — conta do Bruno (usuário existente do Clerk):
-- O user antigo (id "user_...") não tem senha. Após criar a conta nova
-- pelo /sign-up com o MESMO email vai dar conflito de email único.
-- Opção A (recomendada): antes de se cadastrar, renomear o email antigo:
--   UPDATE "users" SET "email" = 'legado+' || "email" WHERE "id" LIKE 'user_%';
-- Depois de se cadastrar, transferir os projetos e apagar o legado:
--   UPDATE "projects" SET "userId" = '<novo_id>' WHERE "userId" LIKE 'user_%';
--   UPDATE "users" u SET "plan" = l."plan", "stripeCustomerId" = l."stripeCustomerId"
--     FROM (SELECT "plan", "stripeCustomerId" FROM "users" WHERE "id" LIKE 'user_%') l
--     WHERE u."id" = '<novo_id>';
--   DELETE FROM "users" WHERE "id" LIKE 'user_%';
-- =============================================================
