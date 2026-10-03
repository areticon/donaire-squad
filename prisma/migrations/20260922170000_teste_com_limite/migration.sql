-- Ate quando o periodo de teste vai. Null = conta fora do teste.
-- Escrito pelo webhook do Stripe no status `trialing`, apagado no `active`.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
