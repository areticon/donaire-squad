-- A linha editorial: ideias e roteiros de video por cena.
CREATE TABLE "roteiros" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ideia',
    "titulo" TEXT NOT NULL,
    "gancho" TEXT,
    "fonte" JSONB,
    "tese" TEXT,
    "cenas" JSONB,
    "duracao" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "roteiros_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "roteiros_projectId_status_createdAt_idx" ON "roteiros"("projectId", "status", "createdAt");
ALTER TABLE "roteiros" ADD CONSTRAINT "roteiros_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
