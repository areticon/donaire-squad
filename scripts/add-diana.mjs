import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const diana = {
  agentId: "diana-design",
  name: "Diana Design",
  role: "Designer",
  persona: "Especialista em criar prompts visuais impactantes para redes sociais.",
  style: "Prompts detalhados com estilo visual, iluminação, composição, paleta de cores e mood. Foco em conversão visual.",
};

const projects = await prisma.project.findMany({ where: { status: "active" }, select: { id: true, name: true } });
for (const p of projects) {
  const exists = await prisma.projectAgent.findFirst({ where: { projectId: p.id, agentId: "diana-design" } });
  if (!exists) {
    await prisma.projectAgent.create({ data: { ...diana, projectId: p.id } });
    console.log(`✅ Diana adicionada: ${p.name}`);
  } else {
    console.log(`⏭  Diana já existe: ${p.name}`);
  }
}
await prisma.$disconnect();
