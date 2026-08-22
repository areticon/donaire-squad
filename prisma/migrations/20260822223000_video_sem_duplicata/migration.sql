-- Um vídeo, um registro. O banco passa a garantir.
--
-- O mesmo arquivo virava dois registros porque duas escritas independentes o
-- criam: o aviso de conclusão do storage (onUploadCompleted) e a rota de
-- contingência que existe porque esse aviso não alcança o localhost. As duas
-- checavam antes de escrever, mas as duas checagens acontecem antes de
-- qualquer uma das escritas, então a checagem não decide nada. Foi medido: as
-- duas linhas do vídeo de 22/08 nasceram com 33 milissegundos de diferença.
--
-- Checagem na aplicação não resolve corrida. Restrição no banco resolve.

-- Primeiro limpa o que já entrou duplicado, mantendo o registro que andou.
-- O fantasma nunca é atualizado depois de criado, enquanto o verdadeiro avança
-- de status, ganha transcrição e recebe a cobrança, então "atualizado por
-- último" é exatamente o critério certo.
DELETE FROM "video_jobs" a
 USING "video_jobs" b
 WHERE a."projectId" = b."projectId"
   AND a."blobUrl"   = b."blobUrl"
   AND (a."updatedAt", a."id") < (b."updatedAt", b."id");

CREATE UNIQUE INDEX "video_jobs_projectId_blobUrl_key"
    ON "video_jobs" ("projectId", "blobUrl");
