-- A demonstracao no lugar do teste gratis (27/09/2026): campos de venda consultiva.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "nome" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "telefone" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "empresa" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cargo" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "faturamento" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "demoPedidaEm" TIMESTAMP(3);
