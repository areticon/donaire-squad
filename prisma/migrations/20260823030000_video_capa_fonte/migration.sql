-- O quadro escolhido como melhor rosto da gravação inteira.
--
-- Mora no vídeo e não no trecho, de propósito: os melhores momentos de FALA não
-- coincidem com os melhores momentos de IMAGEM. Numa gravação com slides, todos
-- os trechos escolhidos caem em tela compartilhada, e a capa saía com texto
-- branco em cima de um slide. A varredura cobre o vídeo todo, inclusive a
-- abertura, que a seleção de trechos descarta e é onde muita gente aparece
-- falando em tela cheia.
ALTER TABLE "video_jobs" ADD COLUMN "capaFonteUrl" TEXT;
