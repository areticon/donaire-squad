-- Audio extraido pelo worker para transcrever gravacoes acima de 1,9 GB.
ALTER TABLE "video_jobs" ADD COLUMN "audioUrl" TEXT;
