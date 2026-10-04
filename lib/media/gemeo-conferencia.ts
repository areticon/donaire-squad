import sharp from "sharp";
import { askClaudeComImagens } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import { dataUrlToBuffer, gerarImagem } from "@/lib/media/nano-banana";
import { cenarioPorId, type IdDoCenario } from "@/lib/media/gemeo";

/**
 * A CONFERÊNCIA POR VISÃO DOS CENÁRIOS DO GÊMEO (04/10/2026).
 *
 * O Bruno viu o primeiro vídeo do gêmeo com cenários e achou "fundo feio" e
 * "uma estampa na minha camisa" que ele não tem. Regra dele: a plataforma é
 * profissional e sempre gera vídeo profissional, cuidando do cenário. Toda
 * imagem gerada para o gêmeo passa por aqui ANTES de ser usada, e a
 * reprovada não entra (o pedaço cai no close do vídeo de treino):
 *
 *   conferirFundo           o cenário sem pessoa que vai atrás do gêmeo:
 *                           sóbrio, sem texto, sem gente, sem objeto estranho;
 *   conferirPessoaNoCenario a pessoa já no cenário (look, composição ou o
 *                           quadro do pedaço pronto), contra o quadro do
 *                           vídeo de treino: mesmo rosto, mesma roupa, roupa
 *                           lisa, fundo profissional.
 *
 * E `fazerFundo`, que gera, desfoca e confere o cenário sem pessoa.
 *
 * Do SERVIDOR.
 */

export type Parecer = { aprovado: boolean; motivos: string[] };

const SISTEMA = `Você é o diretor de arte de uma produtora de vídeo profissional. Você aprova ou reprova imagens que vão para vídeos de clientes que pagam por um resultado profissional. Seja exigente: na dúvida, reprove. Responda só com JSON.`;

function parecer(t: string): Parecer {
  const d = extrairJson(t) as { aprovado?: unknown; motivos?: unknown };
  const motivos = Array.isArray(d?.motivos) ? d.motivos.map((m) => String(m)).filter(Boolean).slice(0, 6) : [];
  return { aprovado: d?.aprovado === true, motivos };
}

async function jpeg(imagem: Buffer, lado = 1024): Promise<string> {
  return (await sharp(imagem).rotate().resize(lado, lado, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()).toString("base64");
}

/** O cenário sem pessoa, antes de ir para trás do gêmeo. */
export async function conferirFundo(imagem: Buffer, cenario: IdDoCenario, ctx: { projectId: string }): Promise<Parecer> {
  const c = cenarioPorId(cenario);
  const resposta = await askClaudeComImagens(
    SISTEMA,
    `Esta imagem é o FUNDO de um vídeo profissional: uma pessoa real vai ser recortada e posta na frente dela, no centro. O cenário pedido foi "${c.nome}".
Aprove só se TODAS forem verdade:
1. É um ambiente sóbrio e profissional, bem iluminado, coerente com "${c.nome}";
2. Não tem texto, letras, números, placas, logotipos, telas com conteúdo, cartazes nem quadros com figuras;
3. Não tem pessoas nem partes de pessoas;
4. Não tem objeto estranho, deformado ou que puxe o olho no centro, onde a pessoa vai ficar;
5. Está desfocado o bastante para a pessoa na frente se destacar.
Responda: {"aprovado": true|false, "motivos": ["frase curta por item que falhou"]}`,
    [{ base64: await jpeg(imagem), rotulo: "Fundo:" }],
    { effort: "low", maxTokens: 600, timeoutMs: 90_000, usage: { projectId: ctx.projectId, operation: "gemeo_conferencia" } }
  );
  return parecer(resposta);
}

/**
 * A pessoa no cenário contra o quadro do vídeo de treino. `cena` é a imagem
 * do look (HeyGen), a composição (OmniHuman) ou o quadro do pedaço pronto.
 *
 * `pessoa`: "gerada" quando a imagem inteira foi gerada (look, composição),
 * e o rosto e a roupa podem ter sido inventados; "gemeo" quando é o gêmeo
 * treinado recortado sobre o nosso fundo, e a pessoa vem do próprio vídeo de
 * treino. Na prova de 04/10, a mesma régua para os dois reprovou o gêmeo
 * real por "rosto mais largo" (é a lente do celular, mais perto) e por não
 * mostrar a barriga; a régua do gêmeo olha o que pode dar errado nele: o
 * recorte, o fundo, e roupa trocada ou estampa que não existe.
 */
export async function conferirPessoaNoCenario(
  treino: Buffer,
  cena: Buffer,
  cenario: IdDoCenario,
  ctx: { projectId: string },
  pessoa: "gerada" | "gemeo" = "gerada"
): Promise<Parecer> {
  const c = cenarioPorId(cenario);
  const quem =
    pessoa === "gemeo"
      ? `A segunda é um quadro do vídeo gerado: a mesma pessoa, animada a partir do próprio vídeo de treino, recortada do fundo original e posta no cenário "${c.nome}". Enquadramento, distância da câmera, distorção de lente de celular e expressão podem mudar: isso é normal e não reprova.`
      : `A segunda é a mesma pessoa gerada por IA no cenário "${c.nome}", para um vídeo profissional.`;
  const resposta = await askClaudeComImagens(
    SISTEMA,
    `A primeira imagem é um quadro do vídeo de treino: a pessoa real, com a roupa real. ${quem}
Aprove a segunda só se TODAS forem verdade:
1. É claramente a mesma pessoa (mesmo rosto, cabelo, barba e tom de pele), sem deformação evidente (olhos, boca ou dentes errados, rosto derretido, membros a mais);
2. A roupa é a mesma do treino (mesma peça, mesma cor, mesma gola), no que estiver visível;
3. A roupa é lisa: nenhuma estampa, desenho, logotipo, texto ou etiqueta que não exista no treino;
4. O fundo é profissional e sóbrio, coerente com "${c.nome}", sem texto, placas, telas com conteúdo, outras pessoas nem objetos estranhos;
5. A imagem parece uma gravação profissional: o cenário preenche o quadro inteiro (nenhuma faixa ou borda branca, preta ou de outra cor nas laterais, em cima ou embaixo), luz boa, nada cortado de forma esquisita, sem contorno de recorte visível em volta da pessoa.
Responda: {"aprovado": true|false, "motivos": ["frase curta por item que falhou"]}`,
    [
      { base64: await jpeg(treino), rotulo: "Treino (a pessoa real):" },
      { base64: await jpeg(cena), rotulo: `Gerada no cenário "${c.nome}":` },
    ],
    { effort: "low", maxTokens: 600, timeoutMs: 90_000, usage: { projectId: ctx.projectId, operation: "gemeo_conferencia" } }
  );
  return parecer(resposta);
}

/**
 * O FUNDO DE UM CENÁRIO: gera o cenário sem pessoa, desfoca de leve (o
 * desfoque do gerador varia, e um desfoque nosso garante a pessoa em
 * destaque e apaga qualquer letrinha que tenha escapado) e confere. Até duas
 * tentativas; devolve null se as duas forem reprovadas.
 */
export async function fazerFundo(
  cenario: IdDoCenario,
  ctx: { projectId: string }
): Promise<{ imagem: Buffer; parecer: Parecer; custoUsd: number } | { imagem: null; parecer: Parecer; custoUsd: number }> {
  const c = cenarioPorId(cenario);
  let ultimo: Parecer = { aprovado: false, motivos: ["não gerou"] };
  let custoUsd = 0;
  for (let vez = 0; vez < 2; vez++) {
    // Em pé, na proporção do vídeo do gêmeo (9:16, a do treino).
    const feita = await gerarImagem(c.fundo, "9:16", "standard", { projectId: ctx.projectId, operation: "gemeo_cenario" }, { tipo: "fundo" }).catch((e) => {
      console.warn(`[gemeo][${ctx.projectId}] fundo ${cenario}:`, e instanceof Error ? e.message : e);
      return null;
    });
    if (!feita) continue;
    custoUsd += feita.custoUsd;
    const imagem = await sharp(dataUrlToBuffer(feita.dataUrl)).resize(1080, 1920, { fit: "cover" }).blur(4).jpeg({ quality: 90 }).toBuffer();
    ultimo = await conferirFundo(imagem, cenario, ctx).catch((e) => ({ aprovado: false, motivos: [`a conferência não respondeu: ${e instanceof Error ? e.message : e}`] }));
    if (ultimo.aprovado) return { imagem, parecer: ultimo, custoUsd };
    console.warn(`[gemeo][${ctx.projectId}] fundo ${cenario} reprovado:`, ultimo.motivos.join("; "));
  }
  return { imagem: null, parecer: ultimo, custoUsd };
}
