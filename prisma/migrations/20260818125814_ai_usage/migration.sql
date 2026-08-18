-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "runId" TEXT,
    "agentId" TEXT,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationInputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadInputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_projectId_createdAt_idx" ON "ai_usage"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_runId_idx" ON "ai_usage"("runId");
