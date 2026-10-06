import { askClaude } from "@/lib/claude";
import { NOME_DA_CLASSIFICACAO, ehClassificacao, semEmail, type ContextoDoFeedback } from "@/lib/feedback/regras";

/**
 * O BRIEFING DE DESENVOLVIMENTO DO DAVI DEV (06/10/2026).
 *
 * Só nasce DEPOIS da aprovação do admin ("Aprovar melhoria" no painel): é o
 * único lugar deste módulo em que o Claude escreve, e ele escreve TEXTO, não
 * decide nada (a classe e o grupo já vieram do JEV). O briefing diz o que o
 * cliente vê, o que deveria ver, onde no código provavelmente está (pelos
 * módulos que a ficha do contexto traz) e como provar. Quem executa é o
 * HANDOFF e o Claude Code que coordena: NENHUM agente edita código em
 * produção sozinho a partir daqui.
 */

export type GrupoParaOBriefing = {
  titulo: string;
  classificacao: string;
  exemplos: Array<{ texto: string; origem: string; contexto: ContextoDoFeedback | null }>;
  contagem: { clientes: number; ocorrencias: number };
};

/** O prompt, puro, para a prova ler sem chamar o modelo. */
export function promptDoBriefing(g: GrupoParaOBriefing): { sistema: string; usuario: string } {
  const modulos = [...new Set(g.exemplos.flatMap((e) => e.contexto?.modulos ?? []))];
  const sistema = `Você é o Davi Dev, o desenvolvedor da plataforma Demandou (posts, artes e vídeos editados por um squad de agentes). Você escreve BRIEFINGS DE DESENVOLVIMENTO para o time que programa, a partir do que os clientes reclamaram. Você não programa aqui: você descreve o problema com precisão para quem vai programar.

Escreva em português do Brasil, direto, sem floreio, sem travessão (use vírgula, dois-pontos ou parênteses). Nunca cite nome ou e-mail de cliente. Nunca cite fornecedor de IA. Formato, com estes títulos exatos em linhas próprias:

O que o cliente vê
O que deveria ver
Onde no código provavelmente está
Como provar

Em "Onde no código provavelmente está", parta dos módulos listados no contexto e diga qual deles é o suspeito principal e por quê; se não der para saber, diga o que olhar primeiro. Em "Como provar", descreva um teste puro ou uma conferência mensurável (tempos, quadros, texto gravado), nunca "peça ao cliente para conferir". Até 1.800 caracteres.`;
  const exemplos = g.exemplos
    .slice(0, 6)
    .map((e, i) => {
      const c = e.contexto ?? {};
      const linhas = [
        `Exemplo ${i + 1} (${e.origem === "chamado" ? "chamado" : "chat da peça"}): "${semEmail(e.texto).slice(0, 400)}"`,
        c.tipoDePeca ? `  Peça: ${c.tipoDePeca}${c.estilo ? `, estilo ${c.estilo}` : ""}${c.rede ? `, rede ${c.rede}` : ""}` : "",
        c.respostaDaPlataforma ? `  A plataforma respondeu: "${semEmail(c.respostaDaPlataforma).slice(0, 300)}"` : "",
        c.resultado ? `  Resultado: ${c.resultado}` : "",
        c.aprovadoAntes
          ? `  Aprovado antes: ${Object.entries(c.aprovadoAntes)
              .filter(([, v]) => typeof v === "string" && v.trim())
              .map(([k, v]) => `${k}=${String(v).slice(0, 160)}`)
              .join("; ")}`
          : "",
      ].filter(Boolean);
      return linhas.join("\n");
    })
    .join("\n\n");
  const usuario = `Problema agrupado: ${g.titulo}
Classificação (pelo JEV): ${ehClassificacao(g.classificacao) ? NOME_DA_CLASSIFICACAO[g.classificacao] : g.classificacao}
Quantos pediram: ${g.contagem.clientes} cliente(s), ${g.contagem.ocorrencias} ocorrência(s)
Módulos por onde a peça passou (ficha do contexto): ${modulos.length ? modulos.join(", ") : "não registrados"}

${exemplos || "Sem exemplos registrados."}`;
  return { sistema, usuario };
}

/** O Claude escreve o briefing (uma chamada, sem rodada de correção). Lança se o modelo falhar: quem chama decide. */
export async function escreverBriefing(g: GrupoParaOBriefing): Promise<string> {
  const { sistema, usuario } = promptDoBriefing(g);
  const texto = await askClaude(sistema, usuario, { maxTokens: 4000, timeoutMs: 90_000, usage: { operation: "dev_briefing" } });
  return texto.trim().slice(0, 6000);
}
