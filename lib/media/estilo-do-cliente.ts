import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";

/**
 * O ESTILO QUE O CLIENTE ESCREVE, e que a plataforma guarda.
 *
 * Pedido do Bruno em 21/09: os estilos pré-definidos são bons e são de outra
 * pessoa. Quem tem uma linha editorial própria precisa poder descrevê-la uma
 * vez e ver a campanha seguinte sair igual, sem redigitar nada.
 *
 * DUAS DECISÕES QUE VALEM REGISTRO:
 *
 * 1. **O estilo é do PROJETO, e não da campanha.** Escrito uma vez, vale para
 *    as próximas; é isso que faz dele linha editorial em vez de capricho de
 *    uma semana. Mora em `ProjectMemory` (tipo `estilo`, chave `visual`), do
 *    mesmo jeito que a regra de "nunca cite X" (parte 150): sem coluna nova,
 *    e no lugar onde a esteira já procura o que o cliente decidiu.
 * 2. **O que vai para o gerador é INGLÊS.** O Veo e o GPT Image entendem
 *    melhor, e a esteira inteira já fala com eles assim. Então guardamos as
 *    duas coisas: o que o cliente escreveu, para ele ler e editar, e o
 *    fragmento em inglês que o modelo recebe. Traduzir na hora de gerar seria
 *    uma chamada a mais por peça, e o texto do cliente não muda entre elas.
 */

export const CHAVE_DO_ESTILO = "visual";
export const TIPO_DO_ESTILO = "estilo";

export interface EstiloDoCliente {
  /** O texto do cliente, em português, como ele escreveu. */
  descricao: string;
  /** O fragmento em inglês que vai colado no prompt da imagem e do vídeo. */
  prompt: string;
  /** Quando foi escrito ou reescrito, para a tela dizer desde quando vale. */
  em: string;
}

/** O estilo próprio deste projeto, ou `null` quando ele não tem um. */
export async function lerEstiloDoCliente(projectId: string): Promise<EstiloDoCliente | null> {
  const m = await prisma.projectMemory.findUnique({
    where: { projectId_type_key: { projectId, type: TIPO_DO_ESTILO, key: CHAVE_DO_ESTILO } },
    select: { value: true },
  });
  const v = m?.value as Partial<EstiloDoCliente> | null;
  if (!v || typeof v.prompt !== "string" || !v.prompt.trim()) return null;
  return { descricao: v.descricao ?? "", prompt: v.prompt, em: v.em ?? "" };
}

/** Guarda o estilo. Reescrever substitui: um projeto tem uma linha editorial. */
export async function salvarEstiloDoCliente(projectId: string, estilo: { descricao: string; prompt: string }): Promise<EstiloDoCliente> {
  const valor: EstiloDoCliente = {
    descricao: estilo.descricao.trim(),
    prompt: estilo.prompt.trim(),
    em: new Date().toISOString(),
  };
  await prisma.projectMemory.upsert({
    where: { projectId_type_key: { projectId, type: TIPO_DO_ESTILO, key: CHAVE_DO_ESTILO } },
    create: { projectId, type: TIPO_DO_ESTILO, key: CHAVE_DO_ESTILO, value: valor as never },
    update: { value: valor as never },
  });
  return valor;
}

export async function apagarEstiloDoCliente(projectId: string): Promise<void> {
  await prisma.projectMemory
    .delete({ where: { projectId_type_key: { projectId, type: TIPO_DO_ESTILO, key: CHAVE_DO_ESTILO } } })
    .catch(() => {});
}

/**
 * A IA ESCREVE O ESTILO A PARTIR DO QUE O PROJETO JÁ SABE.
 *
 * O botão que o Bruno pediu, e a razão dele é a mesma da manchete da peça
 * (19/09): descrever direção de arte é um trabalho que a pessoa não escolheu
 * ter, e uma página em branco é onde ela desiste. O material já existe (nicho,
 * marca, documentos lidos, a última peça aprovada), e é dele que a descrição
 * sai.
 *
 * Devolve as DUAS pontas: o texto em português, que o cliente lê e corrige, e
 * o fragmento em inglês, que o gerador recebe. Sem a versão em português ele
 * estaria aprovando algo que não lê, que é o mesmo que não aprovar.
 */
export async function sugerirEstiloDoCliente(args: {
  projectId: string;
  /** O que o cliente escreveu até aqui, quando escreveu algo. */
  rascunho?: string;
}): Promise<{ descricao: string; prompt: string }> {
  const projeto = await prisma.project.findUniqueOrThrow({
    where: { id: args.projectId },
    select: {
      name: true,
      niche: true,
      colorPalette: true,
      contexts: { where: { status: "pronto" }, select: { title: true, compiled: true }, take: 4 },
    },
  });

  const documentos = projeto.contexts
    .map((c) => `## ${c.title}\n${c.compiled.slice(0, 1200)}`)
    .join("\n\n")
    .slice(0, 5000);

  const resposta = await askClaude(
    "Você é diretor de arte. Descreve direção visual em uma linguagem que o dono do negócio entende, e traduz isso em instrução técnica para modelo de imagem. Nunca use travessão: use vírgula, dois-pontos ou parênteses.",
    `Escreva a DIREÇÃO VISUAL da marca abaixo, para as artes e os vídeos das campanhas dela.

MARCA: ${projeto.name}
NICHO: ${projeto.niche ?? "negócios"}
${projeto.colorPalette ? `CORES DA MARCA: ${JSON.stringify(projeto.colorPalette)}` : ""}
${args.rascunho?.trim() ? `\nO QUE O CLIENTE JÁ ESCREVEU (respeite e melhore, não substitua):\n${args.rascunho.trim()}` : ""}
${documentos ? `\nMATERIAL DA MARCA:\n${documentos}` : ""}

Devolva SOMENTE um JSON, sem cerca de código:
{"descricao":"...","prompt":"..."}

- "descricao": 2 a 4 frases em PORTUGUÊS, para o dono do negócio ler e corrigir. Diga o que a peça É (o tipo de imagem, a luz, a paleta, o enquadramento, o que nunca aparece). Nada de jargão de prompt.
- "prompt": a mesma direção em INGLÊS, no formato que um modelo de imagem entende: estilo, iluminação, paleta, composição, textura, e o que evitar. Uma frase contínua, sem listas, até 400 caracteres. Sempre termine com "no text overlay, no watermark".
- Não invente elemento de marca que não esteja no material (mascote, tipografia própria, slogan).`,
    { usage: { projectId: args.projectId, operation: "sugerir_estilo" }, maxTokens: 4000, effort: "low" }
  );

  const limpo = resposta.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  const bruto = (() => {
    try {
      return JSON.parse(limpo) as { descricao?: string; prompt?: string };
    } catch {
      const a = limpo.indexOf("{");
      const b = limpo.lastIndexOf("}");
      if (a >= 0 && b > a) {
        try {
          return JSON.parse(limpo.slice(a, b + 1)) as { descricao?: string; prompt?: string };
        } catch {
          return {};
        }
      }
      return {};
    }
  })();

  const descricao = (bruto.descricao ?? "").trim();
  const prompt = (bruto.prompt ?? "").trim();
  if (!descricao || !prompt) throw new Error("A IA não devolveu a direção visual em formato válido. Tente de novo.");
  return { descricao, prompt };
}
