-- Quando a esteira terminou de verdade.
-- A faixa verde contava de createdAt ate agora, e agora nunca para: em 08/09 o
-- mesmo video dizia 32 minutos e depois 35, para um trabalho de 11 minutos.
ALTER TABLE "video_jobs" ADD COLUMN "finishedAt" TIMESTAMP(3);
