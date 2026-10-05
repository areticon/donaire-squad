-- PREÇO DE TABELA, DESCONTO COM APROVAÇÃO E ADITIVOS NOS CONTRATOS (04/10/2026).
-- Aditiva e com IF NOT EXISTS: o banco é compartilhado entre o dev local e a
-- produção, e rodar duas vezes não pode quebrar nada. Só acrescenta colunas
-- novas (com padrão) e uma tabela nova; nada do que existe é alterado.

-- 1. O contrato ganha a tabela, o desconto (motivo, quem concedeu, quem aprovou), Fundador e a versão.
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "precoTabelaCentavos" INTEGER;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "descontoTipo" TEXT;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "descontoValor" INTEGER;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "descontoCentavos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "descontoMotivo" TEXT;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "descontoObservacao" TEXT;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "descontoConcedidoPor" TEXT;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "descontoConcedidoEm" TIMESTAMP(3);
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "descontoAprovadoPor" TEXT;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "descontoAprovadoEm" TIMESTAMP(3);
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "fundador" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "versao" INTEGER NOT NULL DEFAULT 1;

-- 2. O pagamento pode quitar um aditivo.
ALTER TABLE "contratos_pagamentos" ADD COLUMN IF NOT EXISTS "aditivoId" TEXT;

-- 3. Os aditivos.
CREATE TABLE IF NOT EXISTS "contratos_aditivos" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "anterior" JSONB NOT NULL,
    "plano" TEXT NOT NULL,
    "acessosExtras" INTEGER NOT NULL DEFAULT 0,
    "precoTabelaCentavos" INTEGER NOT NULL,
    "descontoTipo" TEXT,
    "descontoValor" INTEGER,
    "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
    "descontoMotivo" TEXT,
    "descontoObservacao" TEXT,
    "descontoConcedidoPor" TEXT,
    "descontoAprovadoPor" TEXT,
    "descontoAprovadoEm" TIMESTAMP(3),
    "fundador" BOOLEAN NOT NULL DEFAULT false,
    "valorAnualCentavos" INTEGER NOT NULL,
    "valeDesde" TIMESTAMP(3) NOT NULL,
    "diferencaCentavos" INTEGER NOT NULL DEFAULT 0,
    "diasRestantes" INTEGER NOT NULL DEFAULT 0,
    "tratamento" TEXT NOT NULL,
    "provedor" TEXT,
    "provedorDocumentoId" TEXT,
    "provedorSituacao" TEXT,
    "linkDeAssinatura" TEXT,
    "modeloVersao" TEXT,
    "textoHash" TEXT,
    "pdfAssinadoUrl" TEXT,
    "assinadoEm" TIMESTAMP(3),
    "pagoEm" TIMESTAMP(3),
    "aplicadoEm" TIMESTAMP(3),
    "linkDePagamento" TEXT,
    "stripeSessaoId" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "autor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contratos_aditivos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "contratos_aditivos_contratoId_ordem_key" ON "contratos_aditivos"("contratoId", "ordem");
CREATE INDEX IF NOT EXISTS "contratos_aditivos_provedorDocumentoId_idx" ON "contratos_aditivos"("provedorDocumentoId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_aditivos_contratoId_fkey') THEN
    ALTER TABLE "contratos_aditivos" ADD CONSTRAINT "contratos_aditivos_contratoId_fkey"
      FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
