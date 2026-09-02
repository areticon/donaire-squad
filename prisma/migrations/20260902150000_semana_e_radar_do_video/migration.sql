-- A semana escolhida pelo cliente (formato por dia) e a pesquisa do Roberto
-- feita da transcricao. Campanha a partir do video, 02/09/2026.
ALTER TABLE "projects" ADD COLUMN "videoSemana" JSONB;
ALTER TABLE "video_jobs" ADD COLUMN "radar" JSONB;
