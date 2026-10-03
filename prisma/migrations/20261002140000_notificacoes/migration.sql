-- O SINO E OS E-MAILS DE AVISO (02/10/2026). Aditiva e com IF NOT EXISTS,
-- como as migrações da agenda e do vigia: o banco é compartilhado entre o dev
-- local e a produção, e rodar duas vezes não pode quebrar nada.
--
-- Cada linha de "notificacoes" é UM FATO (roteiro pronto, peças prontas, vídeo
-- pronto, etapa que falhou, créditos devolvidos). A chave única (dono, chave)
-- é a trava da idempotência: o mesmo fato observado duas vezes vira uma linha
-- só, e o e-mail sai só para quem ganhou o INSERT.
CREATE TABLE IF NOT EXISTS "notificacoes" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT,
  "tipo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "link" TEXT,
  "codigo" TEXT,
  "chave" TEXT NOT NULL,
  "lidaEm" TIMESTAMP(3),
  "emailEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notificacoes_userId_chave_key" ON "notificacoes"("userId", "chave");
CREATE INDEX IF NOT EXISTS "notificacoes_userId_createdAt_idx" ON "notificacoes"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- O interruptor de Configurações: desligado, saem só os e-mails de aprovação.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailsDeAviso" BOOLEAN NOT NULL DEFAULT true;
