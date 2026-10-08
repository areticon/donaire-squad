-- O DESCARTE DOS AVISOS (07/10/2026). Pedido do Bruno: toda notificação
-- precisa ter a opção de descartar. Aditiva e com IF NOT EXISTS, como as
-- outras: rodar duas vezes não pode quebrar nada. Escrita e NÃO aplicada por
-- este commit: entra pelo build (scripts/build.mjs), primeiro no Preview de
-- dev (demandou-dev) e depois na produção. Desde a trava de 06/10, o dev
-- local nunca abre o banco de produção.
--
-- Cada linha é UM descarte de UMA pessoa para UMA ocorrência de um fato. A
-- chave segue a convenção de notificacoes.chave, então a montagem e a
-- campanha descartadas na faixa saem também do sino, e vice-versa. A linha do
-- sino nunca é apagada: ela é a trava que impede o e-mail repetido.

CREATE TABLE IF NOT EXISTS "avisos_descartados" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "chave" TEXT NOT NULL,
  "descartadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "avisos_descartados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "avisos_descartados_userId_chave_key" ON "avisos_descartados"("userId", "chave");
CREATE INDEX IF NOT EXISTS "avisos_descartados_userId_descartadoEm_idx" ON "avisos_descartados"("userId", "descartadoEm");

DO $$ BEGIN
  ALTER TABLE "avisos_descartados" ADD CONSTRAINT "avisos_descartados_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
