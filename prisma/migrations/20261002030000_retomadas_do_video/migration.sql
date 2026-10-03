-- O VIGIA DAS ETAPAS (01/10/2026). Aditiva e com IF NOT EXISTS, como as
-- migrações da agenda: o banco é compartilhado entre o dev local e a produção,
-- e rodar duas vezes não pode quebrar nada.
--
-- Quantas vezes o servidor retomou sozinho cada etapa de trabalho deste vídeo
-- ({ "cutting": { "n": 1, "em": "...", "motivo": "prazo" }, ... }). Existe
-- porque, em 01/10, um deploy do worker matou um corte no meio e o vídeo ficou
-- mais de uma hora parado: a retomada automática precisa de um teto (2), e o
-- teto precisa de memória que sobreviva entre passadas do cron.
ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "retomadas" JSONB;
