-- AS MEDIDAS DOS VÍDEOS DE REFERÊNCIA (01/10/2026). Aditiva e com IF NOT
-- EXISTS: o banco é compartilhado entre o dev local e a produção, e rodar duas
-- vezes não pode quebrar nada.
--
-- referencias_posts.medidas: os NÚMEROS medidos no vídeo de referência
-- (cortes por segundo, duração de cena, tempo até o gancho, texto na tela,
-- rosto, imagem de apoio, batidas por minuto) e etiquetas abstratas de
-- imagem. O vídeo de terceiro é baixado, medido e apagado na hora no worker;
-- aqui só ficam os números, e a linha inteira some em 90 dias (apagarEm).
ALTER TABLE "referencias_posts" ADD COLUMN IF NOT EXISTS "medidas" JSONB;