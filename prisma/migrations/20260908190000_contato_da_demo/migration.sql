-- O contato deixado na demo publica (08/09/2026). A demo entregava valor a um
-- desconhecido e o deixava ir embora sem deixar nada.
ALTER TABLE "demo_runs" ADD COLUMN "email" TEXT;
ALTER TABLE "demo_runs" ADD COLUMN "nome" TEXT;
CREATE INDEX "demo_runs_email_idx" ON "demo_runs"("email");
