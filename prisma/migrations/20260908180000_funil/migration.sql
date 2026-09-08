-- O funil, do primeiro clique ate a assinatura (08/09/2026).
-- Ate aqui o projeto nao tinha analytics nenhum, e o teste de trafego pago
-- dependia de duas medidas que ninguem conseguia medir.
CREATE TABLE "funnel_events" (
  "id" TEXT NOT NULL,
  "evento" TEXT NOT NULL,
  "origem" TEXT,
  "campanha" TEXT,
  "midia" TEXT,
  "termo" TEXT,
  "caminho" TEXT,
  "ipHash" TEXT,
  "userId" TEXT,
  "valorCents" INTEGER,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "funnel_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "funnel_events_evento_createdAt_idx" ON "funnel_events"("evento", "createdAt");
CREATE INDEX "funnel_events_origem_createdAt_idx" ON "funnel_events"("origem", "createdAt");
CREATE INDEX "funnel_events_ipHash_createdAt_idx" ON "funnel_events"("ipHash", "createdAt");

ALTER TABLE "users" ADD COLUMN "origem" TEXT;
ALTER TABLE "users" ADD COLUMN "campanha" TEXT;
