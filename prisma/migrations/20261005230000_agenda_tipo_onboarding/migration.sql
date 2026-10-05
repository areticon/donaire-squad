-- O AGENDAMENTO DO ONBOARDING DO CLIENTE NOVO (05/10/2026).
-- Aditiva e com IF NOT EXISTS: o banco é compartilhado entre o dev local e a
-- produção, e rodar duas vezes não pode quebrar nada. A reunião de onboarding
-- usa a mesma tabela da demonstração (mesma engine, janelas e régua), com o
-- tipo e o contrato de origem. Toda linha de antes vale "demonstracao".

-- "demonstracao" | "onboarding"
ALTER TABLE "agenda_reunioes" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'demonstracao';
-- O contrato que originou o onboarding (sem chave estrangeira, de propósito).
ALTER TABLE "agenda_reunioes" ADD COLUMN IF NOT EXISTS "contratoId" TEXT;
CREATE INDEX IF NOT EXISTS "agenda_reunioes_contratoId_idx" ON "agenda_reunioes"("contratoId");
