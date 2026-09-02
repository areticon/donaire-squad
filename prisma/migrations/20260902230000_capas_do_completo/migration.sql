-- O estilo de capa escolhido pelo cliente (projeto) e as opcoes de capa do
-- video completo (video). Capa do YouTube com 2 opcoes e estilo, 02/09/2026.
ALTER TABLE "projects" ADD COLUMN "capaEstilo" TEXT;
ALTER TABLE "video_jobs" ADD COLUMN "capas" JSONB;
