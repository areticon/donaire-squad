-- A PORTA DO PAGAMENTO NOS CONTRATOS (04/10/2026). Aditiva e com IF NOT
-- EXISTS: o banco é compartilhado entre o dev local e a produção, e rodar duas
-- vezes não pode quebrar nada. Só acrescenta colunas novas (com padrão) e uma
-- tabela nova; nada do que existe é alterado.

-- 1. O contrato ganha o pagamento, a ativação, o link do Stripe e os acessos extras.
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "acessosExtras" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "pagoEm" TIMESTAMP(3);
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "ativadoEm" TIMESTAMP(3);
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "linkDePagamento" TEXT;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "stripeSessaoId" TEXT;

-- 2. Os pagamentos de cada contrato, com o comprovante.
CREATE TABLE IF NOT EXISTS "contratos_pagamentos" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "pagoEm" TIMESTAMP(3) NOT NULL,
    "forma" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "referencia" TEXT,
    "comprovanteUrl" TEXT,
    "comprovanteNome" TEXT,
    "observacao" TEXT,
    "autor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contratos_pagamentos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "contratos_pagamentos_referencia_key" ON "contratos_pagamentos"("referencia");
CREATE INDEX IF NOT EXISTS "contratos_pagamentos_contratoId_pagoEm_idx" ON "contratos_pagamentos"("contratoId", "pagoEm");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_pagamentos_contratoId_fkey') THEN
    ALTER TABLE "contratos_pagamentos" ADD CONSTRAINT "contratos_pagamentos_contratoId_fkey"
      FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
