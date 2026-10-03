-- O AGENDAMENTO DA DEMONSTRAÇÃO (01/10/2026). Aditiva e com IF NOT EXISTS pelo
-- mesmo motivo de 20261001200000_acesso_de_equipe: o banco é compartilhado
-- entre o dev local e a produção, e rodar duas vezes não pode quebrar nada.
-- Só cria tabelas, índices e chaves novas; nada do que existe é alterado.

-- 1. Quem do time atende, com a fonte de disponibilidade de cada um.
CREATE TABLE IF NOT EXISTS "agenda_pessoas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "emailUsuario" TEXT,
    "userId" TEXT,
    "emailAgenda" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "fonte" TEXT NOT NULL DEFAULT 'manual',
    "janelas" JSONB NOT NULL,
    "antecedenciaMin" INTEGER NOT NULL DEFAULT 180,
    "intervaloMin" INTEGER NOT NULL DEFAULT 15,
    "linkSala" TEXT,
    "icalCifrado" TEXT,
    "observacao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agenda_pessoas_pkey" PRIMARY KEY ("id")
);

-- 2. As contas Google conectadas (uma pessoa pode ter várias).
CREATE TABLE IF NOT EXISTS "agenda_contas_google" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "emailGoogle" TEXT NOT NULL,
    "refreshTokenCifrado" TEXT NOT NULL,
    "escopos" TEXT,
    "agendas" JSONB NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "ultimoErro" TEXT,
    "ultimoErroEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agenda_contas_google_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "agenda_contas_google_pessoaId_emailGoogle_key" ON "agenda_contas_google"("pessoaId", "emailGoogle");

-- 3. As reuniões marcadas.
CREATE TABLE IF NOT EXISTS "agenda_reunioes" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'marcada',
    "escolha" TEXT NOT NULL DEFAULT 'qualquer',
    "fonte" TEXT NOT NULL DEFAULT 'manual',
    "uid" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL DEFAULT 0,
    "eventoGoogleId" TEXT,
    "contaGoogleId" TEXT,
    "linkReuniao" TEXT,
    "lembrete24hEm" TIMESTAMP(3),
    "lembrete1hEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "canceladaPor" TEXT,
    "teste" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agenda_reunioes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "agenda_reunioes_uid_key" ON "agenda_reunioes"("uid");
CREATE INDEX IF NOT EXISTS "agenda_reunioes_pessoaId_inicio_idx" ON "agenda_reunioes"("pessoaId", "inicio");
CREATE INDEX IF NOT EXISTS "agenda_reunioes_status_inicio_idx" ON "agenda_reunioes"("status", "inicio");
CREATE INDEX IF NOT EXISTS "agenda_reunioes_leadId_idx" ON "agenda_reunioes"("leadId");
-- A TRAVA QUE O PRISMA NÃO EXPRESSA (índice parcial): a mesma pessoa não tem
-- duas reuniões MARCADAS começando no mesmo instante. Cancelada não conta, para
-- o horário voltar a ficar livre.
CREATE UNIQUE INDEX IF NOT EXISTS "agenda_reunioes_uma_por_horario" ON "agenda_reunioes"("pessoaId", "inicio") WHERE "status" = 'marcada';

-- 4. Chaves estrangeiras (Postgres não tem ADD CONSTRAINT IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_contas_google_pessoaId_fkey') THEN
    ALTER TABLE "agenda_contas_google" ADD CONSTRAINT "agenda_contas_google_pessoaId_fkey"
      FOREIGN KEY ("pessoaId") REFERENCES "agenda_pessoas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_reunioes_leadId_fkey') THEN
    ALTER TABLE "agenda_reunioes" ADD CONSTRAINT "agenda_reunioes_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_reunioes_pessoaId_fkey') THEN
    ALTER TABLE "agenda_reunioes" ADD CONSTRAINT "agenda_reunioes_pessoaId_fkey"
      FOREIGN KEY ("pessoaId") REFERENCES "agenda_pessoas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
