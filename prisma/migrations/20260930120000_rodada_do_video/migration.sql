-- Quando a rodada atual do video comecou (faixa do Gestor conta dali, e nao do envio).
-- IF NOT EXISTS porque a coluna foi aplicada a mao no banco compartilhado em 30/09,
-- antes do deploy, para o dev local enxergar; o migrate deploy de producao passa reto.
ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "rodadaEm" TIMESTAMP(3);
