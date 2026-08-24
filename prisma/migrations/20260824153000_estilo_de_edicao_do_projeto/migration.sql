-- O estilo de edicao de video do projeto.
--
-- Fica no PROJETO e nao no envio de cada video, por decisao do Bruno em 24/08:
-- canal com estilo diferente a cada video nao constroi reconhecimento. Nulo
-- cai no "acelerado", que e o padrao em lib/media/estilos.ts, entao nenhum
-- projeto existente precisa ser tocado.
ALTER TABLE "projects" ADD COLUMN "videoStyle" TEXT;
