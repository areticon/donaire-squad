-- A gravação inteira recodificada pelo worker, pronta para o canal do cliente.
--
-- Fica em coluna própria, e não dentro de `clips`, porque não pertence a
-- trecho nenhum: é a gravação toda. Guardar em `clips` obrigaria a inventar um
-- trecho falso para carregá-la.
ALTER TABLE "video_jobs" ADD COLUMN "completoUrl"   TEXT;
ALTER TABLE "video_jobs" ADD COLUMN "completoBytes" BIGINT;
