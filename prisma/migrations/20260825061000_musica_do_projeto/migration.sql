-- A trilha dos cortes, que o CLIENTE traz (decisao juridica de 23/08: a
-- Demandou nunca entra na cadeia de distribuicao da musica). Colunas nulas:
-- projeto sem trilha continua saindo sem trilha, como hoje.
ALTER TABLE "projects" ADD COLUMN "videoMusicUrl" TEXT;
ALTER TABLE "projects" ADD COLUMN "videoMusicName" TEXT;
