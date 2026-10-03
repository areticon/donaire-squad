-- OS SINAIS EXTRAS DE CADA POST DE REFERÊNCIA (02/10/2026). Aditiva e com IF
-- NOT EXISTS: o banco é compartilhado entre o dev local e a produção, e rodar
-- duas vezes não pode quebrar nada.
--
-- referencias_posts.extras: o que a coleta já devolvia e era jogado fora, e
-- que as análises e as tendências da semana precisam: o áudio do vídeo (nome,
-- autor, se é original), as hashtags, os salvamentos (o TikTok mostra) e o
-- endereço da capa (expira em dias; só para a leitura do estilo da arte logo
-- depois da coleta). Nada de pessoa: a linha some em 90 dias com o post.
ALTER TABLE "referencias_posts" ADD COLUMN IF NOT EXISTS "extras" JSONB;
