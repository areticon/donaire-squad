-- A marca do cliente dentro do projeto: logo e manual.
--
-- Pedido do Bruno em 13/09/2026, gravando a jornada para o App Review: a etapa
-- Design do setup so tinha paleta em hex e quatro presets, e nao havia onde
-- subir logo nem manual de marca. O logo entra na capa do video completo e
-- nas pecas visuais; o manual em PDF e lido pela IA e vira um ProjectContext
-- do tipo "brand", que e o que toda campanha ja le.
--
-- Colunas anulaveis de proposito: projeto sem logo continua funcionando como
-- hoje, e nada obriga o cliente a ter manual para comecar.
ALTER TABLE "projects" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "projects" ADD COLUMN "brandManualUrl" TEXT;
ALTER TABLE "projects" ADD COLUMN "brandManualName" TEXT;
