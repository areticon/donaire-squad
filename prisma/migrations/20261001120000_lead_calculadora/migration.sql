-- A calculadora da landing (01/10/2026): qualificação do lead e o que ele simulou.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "tamanhoTime" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "setor" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "calculadora" JSONB;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "calculadoraEm" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consentimentoEm" TIMESTAMP(3);
