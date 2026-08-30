-- Termos do negocio do cliente para a transcricao acertar nomes proprios e
-- siglas (pedido do Bruno em 30/08). Coluna nula: projeto sem termos segue
-- como hoje.
ALTER TABLE "projects" ADD COLUMN "videoTerms" TEXT;
