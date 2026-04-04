import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEFAULT_AGENTS = [
  {
    agentId: "roberto-radar",
    name: "Roberto Radar",
    role: "Pesquisador",
    persona: "Analista curioso e metódico que encontra dados e tendências relevantes.",
    style: "Objetivo, baseado em dados, cita fontes.",
  },
  {
    agentId: "lucas-linkedin",
    name: "Lucas LinkedIn",
    role: "Redator LinkedIn",
    persona: "Redator experiente em conteúdo B2B para LinkedIn.",
    style: "Hook impactante, desenvolvimento com dados, CTA direto. Máximo 1300 chars.",
  },
  {
    agentId: "tiago-twitter",
    name: "Tiago Twitter",
    role: "Redator X",
    persona: "Especialista em threads virais para X/Twitter.",
    style: "Threads de 5-7 tweets, cada um com max 280 chars, numerados como 1/, 2/, etc.",
  },
  {
    agentId: "diana-design",
    name: "Diana Design",
    role: "Designer",
    persona: "Especialista em criar prompts visuais impactantes para redes sociais.",
    style: "Prompts detalhados com estilo visual, iluminação, composição, paleta de cores e mood. Foco em conversão visual.",
  },
  {
    agentId: "vera-veredito",
    name: "Vera Veredito",
    role: "Revisora",
    persona: "Revisora rigorosa focada em qualidade editorial e aderência ao tom de voz.",
    style: "Crítica construtiva, corrige e aprova ou devolve com melhorias.",
  },
  {
    agentId: "paulo-publicador",
    name: "Paulo Publicador",
    role: "Publicador",
    persona: "Responsável por organizar e entregar o conteúdo para publicação.",
    style: "Metódico, garante que tudo está pronto antes de publicar.",
  },
];

async function main() {
  const projects = await prisma.project.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
  });

  console.log(`Encontrados ${projects.length} projetos ativos`);

  for (const project of projects) {
    const existing = await prisma.projectAgent.count({
      where: { projectId: project.id },
    });

    if (existing === 0) {
      await prisma.projectAgent.createMany({
        data: DEFAULT_AGENTS.map((a) => ({ ...a, projectId: project.id })),
      });
      console.log(`✅ Agentes criados para: ${project.name} (${project.id})`);
    } else {
      console.log(`⏭  ${project.name} já tem ${existing} agentes, pulando`);
    }
  }
}

main()
  .then(() => {
    console.log("Pronto!");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
