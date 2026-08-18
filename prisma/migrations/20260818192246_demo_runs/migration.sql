-- CreateTable
CREATE TABLE "demo_runs" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "convertedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demo_runs_ipHash_createdAt_idx" ON "demo_runs"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "demo_runs_createdAt_idx" ON "demo_runs"("createdAt");
