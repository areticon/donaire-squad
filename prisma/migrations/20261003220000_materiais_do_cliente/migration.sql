-- A BIBLIOTECA DE MATERIAIS DO CLIENTE (03/10/2026). Aditiva e com IF NOT
-- EXISTS, como as migrações anteriores: o banco é compartilhado entre o dev
-- local e a produção, e rodar duas vezes não pode quebrar nada.
CREATE TABLE IF NOT EXISTS "materiais_do_cliente" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "miniaturaUrl" TEXT,
  "folhaUrl" TEXT,
  "recorteUrl" TEXT,
  "nome" TEXT,
  "mimeType" TEXT,
  "sizeBytes" BIGINT,
  "largura" INTEGER,
  "altura" INTEGER,
  "duracaoSec" DOUBLE PRECISION,
  "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "etiquetasEditadas" BOOLEAN NOT NULL DEFAULT false,
  "descricao" TEXT,
  "palavrasEn" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "qualidade" TEXT,
  "luz" TEXT,
  "orientacao" TEXT,
  "temRosto" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'analisando',
  "usos" INTEGER NOT NULL DEFAULT 0,
  "ultimoUsoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "materiais_do_cliente_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "materiais_do_cliente_projectId_createdAt_idx" ON "materiais_do_cliente"("projectId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "materiais_do_cliente" ADD CONSTRAINT "materiais_do_cliente_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
