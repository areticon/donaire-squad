-- A BIBLIOTECA DE DESIGN FEITA PELOS USUÁRIOS (06/10/2026).
-- Aditiva e com IF NOT EXISTS: o banco é compartilhado entre o dev local e a
-- produção, e rodar duas vezes não pode quebrar nada. Duas tabelas novas:
-- os designs (vídeo e imagem, semente do catálogo e pedidos dos clientes) e o
-- elo de cada projeto com os designs que escolheu ou pediu. A semente entra
-- por script (scripts/tmp/semear-biblioteca-0610.mts --gravar), não aqui.

CREATE TABLE IF NOT EXISTS "designs_da_biblioteca" (
  "id" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "pedidoOriginal" TEXT NOT NULL,
  "linguagem" TEXT NOT NULL,
  "previaUrl" TEXT,
  "previaCustoUsd" DECIMAL(12,8),
  "usos" INTEGER NOT NULL DEFAULT 0,
  "criadoPorProjectId" TEXT,
  "criadoPorUserId" TEXT,
  "publico" BOOLEAN NOT NULL DEFAULT true,
  "origem" TEXT NOT NULL DEFAULT 'cliente',
  "agrupadoEmId" TEXT,
  "catalogoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "designs_da_biblioteca_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "designs_da_biblioteca_tipo_catalogoId_key" ON "designs_da_biblioteca"("tipo", "catalogoId");
CREATE INDEX IF NOT EXISTS "designs_da_biblioteca_tipo_publico_usos_idx" ON "designs_da_biblioteca"("tipo", "publico", "usos");
CREATE INDEX IF NOT EXISTS "designs_da_biblioteca_criadoPorProjectId_idx" ON "designs_da_biblioteca"("criadoPorProjectId");
CREATE INDEX IF NOT EXISTS "designs_da_biblioteca_agrupadoEmId_idx" ON "designs_da_biblioteca"("agrupadoEmId");

CREATE TABLE IF NOT EXISTS "designs_do_projeto" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "designId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "comoEntrou" TEXT NOT NULL DEFAULT 'escolhido',
  "usos" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "designs_do_projeto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "designs_do_projeto_projectId_designId_key" ON "designs_do_projeto"("projectId", "designId");
CREATE INDEX IF NOT EXISTS "designs_do_projeto_projectId_tipo_updatedAt_idx" ON "designs_do_projeto"("projectId", "tipo", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'designs_do_projeto_designId_fkey') THEN
    ALTER TABLE "designs_do_projeto"
      ADD CONSTRAINT "designs_do_projeto_designId_fkey"
      FOREIGN KEY ("designId") REFERENCES "designs_da_biblioteca"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
