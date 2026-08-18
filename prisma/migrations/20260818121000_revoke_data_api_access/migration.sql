-- Revoga o acesso da Data API (PostgREST) as tabelas da aplicacao.
--
-- Motivo: esta aplicacao fala com o banco via Prisma, usando o usuario postgres.
-- Ela nunca usa a Data API do Supabase. Por padrao o Supabase concede acesso
-- total aos papeis anon e authenticated em tudo que nasce no schema public, e a
-- chave anon e publica (vai para o navegador). Hoje o RLS ligado sem policy
-- segura o acesso, mas isso e uma unica camada: basta alguem criar uma policy
-- permissiva ou desligar o RLS de uma tabela para ela virar aberta ao mundo.
--
-- Cortando o grant, mesmo que o RLS seja desligado por engano no futuro, a
-- Data API continua sem alcance nenhum.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

-- Tabelas criadas daqui em diante tambem nascem sem acesso pela Data API.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;
