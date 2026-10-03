import { prisma } from "@/lib/db/prisma";
import { identidadeDoProjeto } from "@/lib/media/identidade-visual";
import { regrasAprovadas } from "@/lib/referencias/regras";
import type { PadraoDeRitmoDoNicho } from "@/lib/media/metas-do-estilo";
import { GUARDA_DE_PROMESSA_FINANCEIRA } from "@/lib/media/promessas-proibidas";

/**
 * O PROJETO NO PROMPT DA EDIÇÃO (01/10/2026).
 *
 * Até aqui o diretor de montagem recebia só o nicho. Um médico, um advogado e
 * uma igreja que escolhessem MrBeast recebiam a mesma edição, com o mesmo
 * emoji de dinheiro e o mesmo fogo. Agora o diretor e o revisor recebem quem é
 * o cliente (setor, público, tom) e as GUARDAS do setor, que valem por cima do
 * estilo: o estilo diz o ritmo, o setor diz o que nunca aparece.
 *
 * O setor, o público e o tom vêm da identidade visual do projeto
 * (lib/media/identidade-visual.ts, do agente das artes), para o vídeo e a
 * arte lerem o cliente do mesmo jeito. As cores da edição continuam as da
 * configuração enquanto o desenho do worker não trocar junto (Fase 2b).
 */

export type PerfilDoProjeto = {
  nome: string;
  setor: { id: string; nome: string };
  publico?: string;
  tom?: string;
  /** As regras do setor que valem por cima do estilo. */
  guardas: string[];
  /** Em inglês, para as descrições de imagem: o mundo do cliente e o que evitar. */
  mundo: string;
  evitarNaImagem: string;
  /** Traços abstratos de imagem que rendem no nicho (nunca imagem de terceiro). */
  olharDoNicho: string[];
  /** O ritmo medido no nicho, quando há (cartão ProjectMemory "padrao" / "ritmo:nicho"). */
  ritmoDoNicho: PadraoDeRitmoDoNicho | null;
  /** As regras do projeto que o cliente aprovou para a edição (02/10, lib/referencias/regras.ts). */
  regras?: string[];
};

/** As guardas de cada setor na EDIÇÃO (as de imagem já vêm da identidade visual). */
const GUARDAS: Record<string, string[]> = {
  saude: [
    "Saúde: sem promessa de cura ou de resultado, sem antes e depois de paciente, sem sensacionalismo (regras de publicidade do Conselho Federal de Medicina).",
    "Ícone de alerta, x vermelho e fogo nunca sobre doença, sintoma ou paciente; o tom é de cuidado, não de urgência.",
  ],
  juridico: [
    "Advocacia: sem promessa de resultado, sem sensacionalismo, sem captação agressiva (Código de Ética da Ordem dos Advogados do Brasil e Provimento 205/2021).",
    "Nada de emoji de dinheiro ou fogo; credibilidade acima de energia, mesmo num estilo de alta retenção.",
  ],
  fe: [
    // Só a leitura e a oração (01/10): na prova, "fala sobre Deus" pegava o
    // vídeo inteiro de um canal de fé e anulava o estilo que o pastor escolheu.
    "Fé: na LEITURA de versículo e na ORAÇÃO, o tom é reverente: sem emoji (dinheiro, fogo, x), sem punch nem flash naquele trecho, e o grafismo é a frase dita, limpa. No resto do vídeo (ensino, história, aplicação), a linguagem escolhida vale inteira.",
    // O pedido explícito do cliente vale (02/10): "Jesus falando com a multidão".
    "Sem pedido do cliente, imagem gerada não mostra Jesus nem personagem bíblico, cruz brilhante, mãos levantadas de banco de imagem ou nada kitsch; a história bíblica aparece por lugar e objeto (barco, rede, mar, pão, caminho). Quando o CLIENTE PEDE a figura bíblica, ela aparece com reverência: roupa da época, plano aberto ou de costas, sem caricatura e sem brilho kitsch.",
    "Dinheiro e prosperidade, quando ditos, sem pilha de notas nem clima de ostentação.",
  ],
  financas: [
    "Finanças: sem promessa de retorno, sem pilha de dinheiro, sem gráfico com número que não foi dito; dado com a fonte quando a fonte foi dita.",
    // Crédito, seguro e investimento (02/10): a mesma trava do consórcio, que
    // o código também aplica (lib/media/promessas-proibidas.ts).
    GUARDA_DE_PROMESSA_FINANCEIRA,
  ],
  // CONSÓRCIO (02/10, Gaberlini Consórcios): regulado pelo Banco Central (Lei
  // 11.795/2008). O código tira da tela o texto que promete (promessas-proibidas.ts);
  // aqui o diretor e o revisor recebem a regra para nem propor.
  consorcio: [
    "Consórcio (regulado pelo Banco Central, Lei 11.795/2008): nunca prometer contemplação garantida, data ou prazo de contemplação, rendimento, retorno ou valorização; contemplação é por sorteio ou lance, e o texto na tela nunca diz o contrário.",
    GUARDA_DE_PROMESSA_FINANCEIRA,
    "Prova social e confiança acima de energia: número só o dito (valor da carta, do lance, do crédito), sem pilha de dinheiro, dinheiro voando, carro de luxo genérico, mansão ou ostentação, nem na imagem gerada nem em emoji (nada de emoji de dinheiro ou fogo sobre valor).",
    "O cliente contemplado, o aperto de mão e a equipe são PESSOAS REAIS: só aparecem se estão na gravação; a imagem gerada mostra o bem (a chave da casa, a chave do carro, o contrato), nunca gente.",
  ],
  energia: [
    "Setor elétrico: público técnico; número sempre com a unidade dita (MW, %, horas) e a fonte quando dita; nada de efeito de ficção científica.",
  ],
  educacao: ["Educação: clareza primeiro; uma ideia por tela nos momentos de explicação."],
  alimentacao: ["Alimentação: a comida e o lugar reais em primeiro plano; nada de promessa de saúde."],
  beleza: ["Beleza e estética: sem antes e depois de pessoa real, sem promessa de resultado no corpo."],
  imoveis: ["Imóveis: sem promessa de valorização; número de preço ou metragem só o dito."],
};

const GUARDA_GERAL = "Nada que pareça outro tipo de negócio; o vídeo é a marca do cliente, não a da Demandou.";
/**
 * A GUARDA DE IMAGEM DE TODO PROJETO (02/10): no completo de uma pregação, a
 * "multidão na praia" saiu com gente de biquíni em primeiro plano. Toda
 * descrição de imagem evita gente; se houver, roupa discreta e nada sensual.
 * A imagem gerada é conferida com visão contra esta guarda e as do setor
 * (lib/media/conferencia-da-imagem.ts) antes de entrar no vídeo.
 */
export const GUARDA_DE_IMAGEM =
  "Imagem: lugares e objetos, sem gente em primeiro plano; quem aparecer está de roupa discreta do dia a dia (nunca roupa de banho, biquíni, roupa íntima, peito à mostra ou roupa justa e reveladora), nada sensual ou sugestivo, nada que conflite com os valores do setor.";

/** O cartão do ritmo do nicho (lib/referencias/padrao-visual.ts). */
async function ritmoDoNicho(projectId: string): Promise<{ ritmo: PadraoDeRitmoDoNicho | null }> {
  const m = await prisma.projectMemory
    .findUnique({ where: { projectId_type_key: { projectId, type: "padrao", key: "ritmo:nicho" } }, select: { value: true } })
    .catch(() => null);
  const v = m?.value as { medidas?: PadraoDeRitmoDoNicho } | null | undefined;
  const ritmo = v?.medidas && typeof v.medidas === "object" && typeof v.medidas.videos === "number" ? v.medidas : null;
  return { ritmo };
}

export async function perfilDoProjeto(projectId: string | null | undefined): Promise<PerfilDoProjeto | null> {
  if (!projectId) return null;
  try {
    const [id, p, nicho, regras] = await Promise.all([
      identidadeDoProjeto(projectId),
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      ritmoDoNicho(projectId),
      regrasAprovadas(projectId, ["edicao"]),
    ]);
    return {
      nome: p?.name ?? "o projeto",
      setor: { id: id.setor.id, nome: id.setor.nome },
      publico: id.publico?.slice(0, 400),
      tom: id.tom?.slice(0, 300),
      guardas: [...(GUARDAS[id.setor.id] ?? []), GUARDA_GERAL, GUARDA_DE_IMAGEM],
      mundo: id.setor.mundo,
      evitarNaImagem: id.setor.evitar,
      // O cartão "visual:imagem" da medida já chega pela identidade (padroesVisuais).
      olharDoNicho: (id.padroesVisuais ?? []).slice(0, 6),
      ritmoDoNicho: nicho.ritmo,
      regras: regras.map((r) => r.texto),
    };
  } catch (e) {
    console.warn(`[perfil-do-projeto] ${projectId}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** O perfil em linhas para o prompt do diretor e do revisor. */
export function perfilNoPrompt(p: PerfilDoProjeto | null): string {
  if (!p) return "";
  return [
    `QUEM É O CLIENTE: ${p.nome}, setor ${p.setor.nome}.`,
    p.publico ? `Público: ${p.publico}` : "",
    p.tom ? `Tom da marca: ${p.tom}` : "",
    `GUARDAS DO SETOR (valem por cima das regras do estilo):\n${p.guardas.map((g) => `- ${g}`).join("\n")}`,
    `Nas descrições de imagem: o mundo do cliente é "${p.mundo}"; evite ${p.evitarNaImagem}.`,
    p.olharDoNicho.length
      ? `OLHAR QUE RENDE NO NICHO (só características abstratas; use nas descrições de imagem quando couber, nunca como cópia de alguém): ${p.olharDoNicho.join("; ")}.`
      : "",
    p.regras?.length
      ? `REGRAS DO PROJETO PARA A EDIÇÃO (aprovadas pelo cliente; valem sempre, abaixo das guardas do setor):\n${p.regras.map((r) => `- ${r}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
