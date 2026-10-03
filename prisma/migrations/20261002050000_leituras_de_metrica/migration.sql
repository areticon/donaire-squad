-- AS LEITURAS DOS NÚMEROS DOS POSTS (01/10/2026). Aditiva e com IF NOT EXISTS,
-- como as migrações da agenda e do vigia: o banco é compartilhado entre o dev
-- local e a produção, e rodar duas vezes não pode quebrar nada.
--
-- leituras_de_metrica: cada leitura dos números de um post publicado, com a
-- fonte (Blotato, API oficial da rede ou perfil público pela Apify). O
-- post_metrics guardava um número só por post e apagava a curva.
-- coletas_de_metrica: cada execução paga (Apify), para o teto de gasto do mês
-- e para não ler o mesmo perfil duas vezes no mesmo dia.

CREATE TABLE IF NOT EXISTS "leituras_de_metrica" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "motivo" TEXT,
    "lidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impressoes" INTEGER,
    "alcance" INTEGER,
    "visualizacoes" INTEGER,
    "curtidas" INTEGER,
    "comentarios" INTEGER,
    "compartilhamentos" INTEGER,
    "salvamentos" INTEGER,
    "cliques" INTEGER,
    "extras" JSONB,
    "custoUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leituras_de_metrica_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "coletas_de_metrica" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "perfil" TEXT,
    "status" TEXT NOT NULL,
    "erro" TEXT,
    "itens" INTEGER NOT NULL DEFAULT 0,
    "casados" INTEGER NOT NULL DEFAULT 0,
    "custoUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coletas_de_metrica_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "leituras_de_metrica_projectId_lidoEm_idx" ON "leituras_de_metrica"("projectId", "lidoEm");
CREATE INDEX IF NOT EXISTS "leituras_de_metrica_postId_lidoEm_idx" ON "leituras_de_metrica"("postId", "lidoEm");
CREATE UNIQUE INDEX IF NOT EXISTS "leituras_de_metrica_postId_fonte_lidoEm_key" ON "leituras_de_metrica"("postId", "fonte", "lidoEm");
CREATE INDEX IF NOT EXISTS "coletas_de_metrica_criadoEm_idx" ON "coletas_de_metrica"("criadoEm");
CREATE INDEX IF NOT EXISTS "coletas_de_metrica_projectId_fonte_criadoEm_idx" ON "coletas_de_metrica"("projectId", "fonte", "criadoEm");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leituras_de_metrica_postId_fkey') THEN
    ALTER TABLE "leituras_de_metrica" ADD CONSTRAINT "leituras_de_metrica_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
