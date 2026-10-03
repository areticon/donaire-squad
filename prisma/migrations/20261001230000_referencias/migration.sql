-- O TRILHO DE REFERÊNCIAS (01/10/2026). Aditiva e com IF NOT EXISTS pelo
-- mesmo motivo de 20261001200000_acesso_de_equipe: o banco é compartilhado
-- entre o dev local e a produção, e rodar duas vezes não pode quebrar nada.
-- Só cria tabelas, índices e chaves novas; nada do que existe é alterado.

-- 1. Os perfis de referência do nicho (sugeridos pelo Roberto, confirmados pelo dono).
CREATE TABLE IF NOT EXISTS "referencias_perfis" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "rede" TEXT NOT NULL,
    "perfil" TEXT NOT NULL,
    "nome" TEXT,
    "url" TEXT,
    "motivo" TEXT,
    "seguidores" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'sugerido',
    "origem" TEXT NOT NULL DEFAULT 'roberto',
    "ultimaColeta" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "referencias_perfis_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "referencias_perfis_projectId_rede_perfil_key" ON "referencias_perfis"("projectId", "rede", "perfil");
CREATE INDEX IF NOT EXISTS "referencias_perfis_projectId_status_idx" ON "referencias_perfis"("projectId", "status");

-- 2. Os posts coletados (dado bruto de terceiro, apagado em 90 dias; nunca comentário nem quem comentou).
CREATE TABLE IF NOT EXISTS "referencias_posts" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "rede" TEXT NOT NULL,
    "externoId" TEXT NOT NULL,
    "url" TEXT,
    "formato" TEXT NOT NULL,
    "legenda" TEXT,
    "duracaoSeg" INTEGER,
    "publicadoEm" TIMESTAMP(3),
    "curtidas" INTEGER,
    "comentarios" INTEGER,
    "visualizacoes" DOUBLE PRECISION,
    "compartilhamentos" INTEGER,
    "seguidoresDoAutor" INTEGER,
    "etiquetas" JSONB,
    "ganho" DOUBLE PRECISION,
    "coletadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "apagarEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "referencias_posts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "referencias_posts_perfilId_externoId_key" ON "referencias_posts"("perfilId", "externoId");
CREATE INDEX IF NOT EXISTS "referencias_posts_projectId_rede_idx" ON "referencias_posts"("projectId", "rede");
CREATE INDEX IF NOT EXISTS "referencias_posts_apagarEm_idx" ON "referencias_posts"("apagarEm");

-- 3. Cada coleta com o custo, por projeto (no molde do ai_usage).
CREATE TABLE IF NOT EXISTS "referencias_coletas" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "perfilId" TEXT,
    "rede" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "itens" INTEGER NOT NULL DEFAULT 0,
    "custoUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referencias_coletas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "referencias_coletas_projectId_createdAt_idx" ON "referencias_coletas"("projectId", "createdAt");

-- 4. Chaves estrangeiras (Postgres não tem ADD CONSTRAINT IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referencias_perfis_projectId_fkey') THEN
    ALTER TABLE "referencias_perfis" ADD CONSTRAINT "referencias_perfis_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referencias_posts_perfilId_fkey') THEN
    ALTER TABLE "referencias_posts" ADD CONSTRAINT "referencias_posts_perfilId_fkey"
      FOREIGN KEY ("perfilId") REFERENCES "referencias_perfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referencias_coletas_projectId_fkey') THEN
    ALTER TABLE "referencias_coletas" ADD CONSTRAINT "referencias_coletas_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
