-- A edição do vídeo completo (lib/media/montagem-do-completo.ts): estado da
-- esteira, plano, assets e o completo original guardado. IF NOT EXISTS pelo
-- mesmo motivo de 20260930120000_rodada_do_video (banco compartilhado).
ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "completoMontagem" JSONB;
