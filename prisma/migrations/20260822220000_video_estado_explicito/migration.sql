-- Separa estado de espera de estado de trabalho no fluxo de vídeo.
--
-- Antes, "selecting" e "writing" eram ambíguos: valiam tanto para "pronto para
-- esta etapa" quanto para "esta etapa está rodando". Função morta pela
-- plataforma no teto de tempo não consegue gravar erro, então o status ficava
-- igual ao de quem nunca começou, e a falha era invisível.
--
-- Os valores antigos guardados no banco significam SEMPRE o estado de espera,
-- porque nenhuma rota gravava o estado de trabalho antes de começar.

UPDATE "video_jobs" SET "status" = 'transcribed' WHERE "status" = 'selecting';
UPDATE "video_jobs" SET "status" = 'selected'    WHERE "status" = 'writing';

ALTER TABLE "video_jobs" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "video_jobs" ADD COLUMN "attempts"  INTEGER NOT NULL DEFAULT 0;

-- A varredura de expirados busca por estado de trabalho mais data de início.
CREATE INDEX "video_jobs_status_startedAt_idx" ON "video_jobs" ("status", "startedAt");
