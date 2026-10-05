-- CONDIÇÃO DE PAGAMENTO: ENTRADA NO PIX + PARCELAS NO CARTÃO EM CRÉDITO RECORRENTE (05/10/2026).
-- Aditiva e com IF NOT EXISTS: o banco é compartilhado entre o dev local e a
-- produção, e rodar duas vezes não pode quebrar nada. Só acrescenta colunas
-- novas, todas opcionais; contrato antigo (null) continua à vista.

ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "condicaoDePagamento" TEXT;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "entradaCentavos" INTEGER;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "parcelas" INTEGER;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "parcelaCentavos" INTEGER;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "primeiraParcelaEm" TIMESTAMP(3);
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "assinaturaParcelasId" TEXT;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "parcelaEmAtraso" TEXT;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "parcelaEmAtrasoDesde" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "contratos_assinaturaParcelasId_key" ON "contratos"("assinaturaParcelasId");
