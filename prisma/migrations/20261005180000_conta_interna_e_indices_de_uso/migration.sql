-- CONTA INTERNA E ÍNDICES DO USO DE IA (05/10/2026), para o painel de admin
-- separar o gasto de IA do time de desenvolvimento do gasto dos clientes.
--
-- Aditiva e com IF NOT EXISTS: o banco é compartilhado entre o dev local e a
-- produção, e rodar duas vezes não pode quebrar nada. Nada é apagado nem
-- renomeado; só uma coluna com padrão e dois índices.

-- A classificação do gasto: true = conta do time (testes, provas, demonstrações
-- internas). Não é papel de acesso (isso é `role`); é só para o painel saber
-- que o custo daquela conta não precisa caber em margem nenhuma.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "contaInterna" BOOLEAN NOT NULL DEFAULT false;

-- A marcação de uma vez: os e-mails da casa e o Gmail do Bruno. O padrão vale
-- para quem já existe; conta nova nasce false e é marcada à mão quando for o
-- caso. Admin também entra: acesso sem cobrança é sempre interno.
UPDATE "users"
   SET "contaInterna" = true
 WHERE "contaInterna" = false
   AND (
        lower(email) LIKE '%@demandou.com'
     OR lower(email) = 'bruno.donaire88@gmail.com'
     OR role = 'admin'
   );

-- As somas por janela do painel (7 dias, 30 dias, mês corrente) leem as duas
-- tabelas só pela data. Hoje ai_usage só tem índice por projeto e por execução,
-- e o extrato só por usuário e por autor.
CREATE INDEX IF NOT EXISTS "ai_usage_createdAt_idx" ON "ai_usage"("createdAt");
CREATE INDEX IF NOT EXISTS "credit_transactions_createdAt_idx" ON "credit_transactions"("createdAt");
