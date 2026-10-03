-- OS CHAMADOS DE SUPORTE E O GESTOR DE CONTRATOS (02/10/2026). Aditiva e com
-- IF NOT EXISTS pelo mesmo motivo das anteriores: o banco é compartilhado
-- entre o dev local e a produção, e rodar duas vezes não pode quebrar nada.
-- Só cria tabelas, índices e chaves novas; nada do que existe é alterado.

-- 1. Os chamados, com número sequencial legível (#0001).
CREATE TABLE IF NOT EXISTS "suporte_chamados" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "reclamacao" BOOLEAN NOT NULL DEFAULT false,
    "texto" TEXT NOT NULL,
    "codigo" TEXT,
    "printUrl" TEXT,
    "contexto" JSONB,
    "diagnostico" TEXT,
    "projectId" TEXT,
    "postId" TEXT,
    "videoId" TEXT,
    "respondidoEm" TIMESTAMP(3),
    "resolvidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "suporte_chamados_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "suporte_chamados_numero_key" ON "suporte_chamados"("numero");
CREATE INDEX IF NOT EXISTS "suporte_chamados_userId_createdAt_idx" ON "suporte_chamados"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "suporte_chamados_status_createdAt_idx" ON "suporte_chamados"("status", "createdAt");

-- 2. O histórico de cada chamado.
CREATE TABLE IF NOT EXISTS "suporte_chamados_eventos" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "lado" TEXT NOT NULL,
    "autorId" TEXT,
    "autorNome" TEXT,
    "texto" TEXT,
    "de" TEXT,
    "para" TEXT,
    "interno" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "suporte_chamados_eventos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "suporte_chamados_eventos_chamadoId_createdAt_idx" ON "suporte_chamados_eventos"("chamadoId", "createdAt");

-- 3. Os contratos anuais.
CREATE TABLE IF NOT EXISTS "contratos" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "plano" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "formaDePagamento" TEXT,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "assinadoEm" TIMESTAMP(3),
    "inicioVigencia" TIMESTAMP(3),
    "fimVigencia" TIMESTAMP(3),
    "renovacaoAutomatica" BOOLEAN NOT NULL DEFAULT true,
    "renovadoDeId" TEXT,
    "signatarioNome" TEXT,
    "signatarioEmail" TEXT,
    "signatarioDocumento" TEXT,
    "empresa" TEXT,
    "endereco" TEXT,
    "provedor" TEXT,
    "provedorDocumentoId" TEXT,
    "provedorSituacao" TEXT,
    "linkDeAssinatura" TEXT,
    "modeloVersao" TEXT,
    "textoHash" TEXT,
    "pdfAssinadoUrl" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "contratos_numero_key" ON "contratos"("numero");
CREATE INDEX IF NOT EXISTS "contratos_userId_idx" ON "contratos"("userId");
CREATE INDEX IF NOT EXISTS "contratos_status_fimVigencia_idx" ON "contratos"("status", "fimVigencia");

-- O endereço entrou depois da primeira aplicação no banco compartilhado (02/10).
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "endereco" TEXT;

-- 4. A trilha de auditoria dos contratos.
CREATE TABLE IF NOT EXISTS "contratos_eventos" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "autor" TEXT,
    "detalhe" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contratos_eventos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "contratos_eventos_contratoId_createdAt_idx" ON "contratos_eventos"("contratoId", "createdAt");

-- 5. Os avisos de vencimento (a trava é a chave única).
CREATE TABLE IF NOT EXISTS "contratos_alertas" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "fimVigencia" TIMESTAMP(3) NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'reservado',
    "detalhe" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contratos_alertas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "contratos_alertas_contratoId_tipo_fimVigencia_key" ON "contratos_alertas"("contratoId", "tipo", "fimVigencia");

-- 6. Chaves estrangeiras (Postgres não tem ADD CONSTRAINT IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suporte_chamados_userId_fkey') THEN
    ALTER TABLE "suporte_chamados" ADD CONSTRAINT "suporte_chamados_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suporte_chamados_eventos_chamadoId_fkey') THEN
    ALTER TABLE "suporte_chamados_eventos" ADD CONSTRAINT "suporte_chamados_eventos_chamadoId_fkey"
      FOREIGN KEY ("chamadoId") REFERENCES "suporte_chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_userId_fkey') THEN
    ALTER TABLE "contratos" ADD CONSTRAINT "contratos_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_eventos_contratoId_fkey') THEN
    ALTER TABLE "contratos_eventos" ADD CONSTRAINT "contratos_eventos_contratoId_fkey"
      FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_alertas_contratoId_fkey') THEN
    ALTER TABLE "contratos_alertas" ADD CONSTRAINT "contratos_alertas_contratoId_fkey"
      FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 7. Fora da Data API do Supabase, como todo o resto (ver 20260818121000).
REVOKE ALL ON "suporte_chamados", "suporte_chamados_eventos", "contratos", "contratos_eventos", "contratos_alertas" FROM anon, authenticated;
REVOKE ALL ON SEQUENCE "suporte_chamados_numero_seq", "contratos_numero_seq" FROM anon, authenticated;
