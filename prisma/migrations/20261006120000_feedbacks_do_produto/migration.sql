-- O FEEDBACK DO CLIENTE QUE MELHORA O PRODUTO (06/10/2026).
-- Aditiva e com IF NOT EXISTS: o banco é compartilhado entre o dev local e a
-- produção, e rodar duas vezes não pode quebrar nada. Duas tabelas novas: os
-- feedbacks (um por pedido do chat do card ou chamado de suporte, com a
-- classificação do JEV) e os grupos de feedbacks parecidos, onde ficam a
-- aprovação do admin e o briefing de desenvolvimento do Davi Dev.
-- Escrita em 06/10 e NÃO aplicada por este commit: entra pelo build do deploy.

CREATE TABLE IF NOT EXISTS "feedbacks_grupos" (
  "id" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "classificacao" TEXT NOT NULL,
  "situacao" TEXT NOT NULL DEFAULT 'aberto',
  "briefing" TEXT,
  "aprovadoPorId" TEXT,
  "aprovadoEm" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feedbacks_grupos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "feedbacks_grupos_situacao_atualizadoEm_idx" ON "feedbacks_grupos"("situacao", "atualizadoEm");

CREATE TABLE IF NOT EXISTS "feedbacks_do_produto" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "userId" TEXT NOT NULL,
  "cardId" TEXT,
  "postId" TEXT,
  "videoJobId" TEXT,
  "chamadoId" TEXT,
  "origem" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "contexto" JSONB,
  "classificacao" TEXT,
  "confianca" DOUBLE PRECISION,
  "grupoId" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "classificadoEm" TIMESTAMP(3),
  CONSTRAINT "feedbacks_do_produto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "feedbacks_do_produto_criadoEm_idx" ON "feedbacks_do_produto"("criadoEm");
CREATE INDEX IF NOT EXISTS "feedbacks_do_produto_grupoId_criadoEm_idx" ON "feedbacks_do_produto"("grupoId", "criadoEm");
CREATE INDEX IF NOT EXISTS "feedbacks_do_produto_classificacao_criadoEm_idx" ON "feedbacks_do_produto"("classificacao", "criadoEm");
CREATE INDEX IF NOT EXISTS "feedbacks_do_produto_userId_criadoEm_idx" ON "feedbacks_do_produto"("userId", "criadoEm");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedbacks_do_produto_grupoId_fkey') THEN
    ALTER TABLE "feedbacks_do_produto"
      ADD CONSTRAINT "feedbacks_do_produto_grupoId_fkey"
      FOREIGN KEY ("grupoId") REFERENCES "feedbacks_grupos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
