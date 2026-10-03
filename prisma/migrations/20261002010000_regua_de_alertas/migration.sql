-- A RÉGUA DE ALERTAS DA DEMONSTRAÇÃO (01/10/2026). Aditiva e com IF NOT EXISTS,
-- pelo mesmo motivo das migrações da agenda: o banco é compartilhado entre o
-- dev local e a produção, e rodar duas vezes não pode quebrar nada. Só
-- acrescenta colunas opcionais e tabelas novas; nada do que existe muda.

-- 1. O WhatsApp da pessoa do time (formato internacional, só dígitos: 5511987654321).
ALTER TABLE "agenda_pessoas" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;

-- 2. Os sinais de que a reunião está acontecendo: a pessoa do time marcou que
--    começou, ou o lead abriu a sala pelo nosso link. Qualquer um deles segura
--    a mensagem de "estamos esperando você" dos 10 minutos.
ALTER TABLE "agenda_reunioes" ADD COLUMN IF NOT EXISTS "comecouEm" TIMESTAMP(3);
ALTER TABLE "agenda_reunioes" ADD COLUMN IF NOT EXISTS "leadEntrouEm" TIMESTAMP(3);

-- 3. O registro de cada alerta por reunião. A chave única (reunião, tipo,
--    sequência) É a trava contra envio duplo: quem insere primeiro envia, e a
--    remarcação sobe a sequência, o que libera a régua inteira de novo.
CREATE TABLE IF NOT EXISTS "agenda_alertas" (
    "id" TEXT NOT NULL,
    "reuniaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'reservado',
    "detalhe" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agenda_alertas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "agenda_alertas_reuniaoId_tipo_sequencia_key" ON "agenda_alertas"("reuniaoId", "tipo", "sequencia");
CREATE INDEX IF NOT EXISTS "agenda_alertas_createdAt_idx" ON "agenda_alertas"("createdAt");

-- 4. Quem pediu para não receber mais WhatsApp (respondeu PARAR).
CREATE TABLE IF NOT EXISTS "whatsapp_bloqueios" (
    "numero" TEXT NOT NULL,
    "palavra" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_bloqueios_pkey" PRIMARY KEY ("numero")
);

-- 5. Chave estrangeira (Postgres não tem ADD CONSTRAINT IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_alertas_reuniaoId_fkey') THEN
    ALTER TABLE "agenda_alertas" ADD CONSTRAINT "agenda_alertas_reuniaoId_fkey"
      FOREIGN KEY ("reuniaoId") REFERENCES "agenda_reunioes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
