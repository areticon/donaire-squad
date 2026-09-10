-- O telefone que a demonstracao publica nunca pediu.
--
-- A demo captura e-mail desde 08/09 e nao captura telefone, entao nenhuma
-- regua de contato existe depois: nem a manual, que o Bruno vai operar no
-- WhatsApp com os dez primeiros, nem a automatica que vem depois. Guardado em
-- E.164 (5511987654321), que e o formato que a API do WhatsApp pede: converter
-- na leitura seria retrabalho em todo lugar que le.
ALTER TABLE "demo_runs" ADD COLUMN "telefone" TEXT;

-- Quando a pessoa autorizou o contato por WhatsApp.
--
-- A DATA, e nao um sim ou nao: consentimento sem registro de quando foi dado
-- nao se prova depois (LGPD, art. 8). Nulo quer dizer que a caixa ficou
-- desmarcada, que e como ela nasce na tela.
ALTER TABLE "demo_runs" ADD COLUMN "consentimentoEm" TIMESTAMP(3);
