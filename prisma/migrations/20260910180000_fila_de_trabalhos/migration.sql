-- A fila de trabalhos: campanha e video saem do ciclo da requisicao.
--
-- Ate aqui o teto de tempo da plataforma decidia quantos dias de campanha
-- cabiam (cinco em 800 s, medido em 09/09), e dois clientes gerando ao mesmo
-- tempo nao tinham fila nenhuma. A unidade e o DIA, a mesma unidade de falha
-- adotada em 09/09.
CREATE TABLE "trabalhos" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trabalhos_pkey" PRIMARY KEY ("id")
);

-- A varredura pergunta sempre o mesmo: o que esta pendente, e o que esta
-- rodando ha tempo demais.
CREATE INDEX "trabalhos_status_ordem_createdAt_idx" ON "trabalhos"("status", "ordem", "createdAt");
CREATE INDEX "trabalhos_grupo_status_idx" ON "trabalhos"("grupo", "status");

-- A pesquisa do Roberto sai da variavel em memoria e passa a morar na
-- execucao. Com os dias separados em trabalhos, ou a pesquisa fica guardada ou
-- cada dia pesquisaria de novo, e a regua de lastro mediria cada dia contra
-- uma pesquisa diferente da do dia anterior.
ALTER TABLE "pipeline_runs" ADD COLUMN "pesquisa" JSONB;
