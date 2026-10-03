import { askClaude, DEFAULT_MODEL } from "@/lib/claude";
import { extrairJson, novaIdeiaDaCena } from "@/lib/media/diretor-de-montagem";
import { bibliaDoEstilo, type BibliaDoEstilo } from "@/lib/media/biblias";
import { metasDoProjeto, metasNoPrompt, type MetasDoProjeto } from "@/lib/media/metas-do-estilo";
import { perfilDoProjeto, perfilNoPrompt, type PerfilDoProjeto } from "@/lib/media/perfil-do-projeto";
import { normalizarEscolha } from "@/lib/media/catalogo-de-estilos";
import { trocarCena, tempoDaCena, palavrasDaCena } from "@/lib/media/roteiro-em-texto";
import type { CenaDoPlano, Formato, PalavraNoCorte, PlanoDeMontagem } from "@/lib/media/plano-de-montagem";
import type { MedidasDoPlano, ProblemaDaRevisao, ResumoDaRevisao } from "@/lib/media/revisao-tipos";

/**
 * O LOOP DE VERIFICAÇÃO DO PLANO (01/10/2026): o diretor gera, o revisor
 * confere contra a bíblia do estilo, a transcrição e o perfil do projeto, e
 * o diretor corrige as cenas apontadas ANTES de o cliente ver o roteiro e
 * antes de qualquer imagem, cena ou render ser pago.
 *
 * Duas camadas, como manda a regra da casa:
 *   1. CÓDIGO (`medirPlano`, `problemasPorCodigo`): o que é número (gancho,
 *      maior janela parada, elementos por minuto, elementos por cena, punch
 *      por minuto). Sai de graça e é exato.
 *   2. REVISOR (Sonnet 5, esforço médio): o que é julgamento. Texto que
 *      contradiz a fala, âncora no lugar errado, imagem que não é o
 *      substantivo dito, guarda do setor violada, abertura fraca, monotonia,
 *      tela poluída ("cara de IA"), cena fora da linguagem escolhida.
 *
 * A correção é por CENA (o diretor recebe a cena e o que corrigir, como no
 * "outra ideia" da tela, em esforço baixo), até um teto por plano. Custo
 * medido na prova de 01/10 (scripts/tmp/estilos-replanejar-0110.mts).
 *
 * Desliga com REVISOR_DA_MONTAGEM=0.
 */

export function revisorLigado(): boolean {
  return process.env.REVISOR_DA_MONTAGEM !== "0";
}

export type { ProblemaDaRevisao, MedidasDoPlano, ResumoDaRevisao };

const TEXTOS = new Set(["marca-texto", "letras-revista", "carimbo", "tarja", "titulo", "numero", "barras"]);

function inicioDa(palavras: PalavraNoCorte[], i: number | undefined, padrao: number): number {
  return typeof i === "number" && palavras[i] ? palavras[i].inicio : padrao;
}

/** As medidas do plano, sem IA. */
export function medirPlano(plano: PlanoDeMontagem, palavras: PalavraNoCorte[], duracao: number): MedidasDoPlano {
  const minutos = Math.max(duracao / 60, 0.1);
  const eventos: number[] = [];
  let gancho = duracao;
  let punch = 0;
  let elementos = 0;
  let rosto = 0;
  let broll = 0;
  const textos: Array<[number, number]> = [];
  let comFundo = 0;
  let escuros = 0;
  plano.cenas.forEach((c, k) => {
    const { inicio, fim } = tempoDaCena(c, palavras, duracao);
    eventos.push(inicio);
    if (c.layout !== "narrador-cheio" && k > 0) gancho = Math.min(gancho, inicio);
    if (c.layout === "broll-cheio") broll += fim - inicio;
    else {
      comFundo++;
      if (c.fundo === "escuro") escuros++;
    }
    if (c.layout !== "broll-cheio" && c.layout !== "cartela") rosto += fim - inicio;
    if (c.movimento === "punch" || c.movimento === "zoom-in-lento" || c.movimento === "zoom-out") {
      const t = inicioDa(palavras, c.movimentoNa, inicio);
      eventos.push(t);
      if (c.movimento === "punch") {
        punch++;
        gancho = Math.min(gancho, t);
      }
    }
    for (const e of c.elementos) {
      const t = inicioDa(palavras, e.palavra, inicio);
      eventos.push(t);
      elementos++;
      gancho = Math.min(gancho, t);
      if (TEXTOS.has(e.tipo)) textos.push([t, Math.min(fim, t + 4)]);
    }
  });
  eventos.push(duracao);
  const ordenados = [...new Set(eventos.map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
  let maiorJanela = 0;
  let maiorJanelaEm = 0;
  for (let i = 1; i < ordenados.length; i++) {
    const g = ordenados[i] - ordenados[i - 1];
    if (g > maiorJanela) {
      maiorJanela = g;
      maiorJanelaEm = ordenados[i - 1];
    }
  }
  // União dos intervalos de texto.
  textos.sort((a, b) => a[0] - b[0]);
  let texto = 0;
  let ate = -1;
  for (const [a, b] of textos) {
    if (b <= ate) continue;
    texto += b - Math.max(a, ate);
    ate = b;
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    duracao: r2(duracao),
    cenas: plano.cenas.length,
    cenaMedia: r2(duracao / Math.max(1, plano.cenas.length)),
    gancho: r2(gancho),
    maiorJanela: r2(maiorJanela),
    maiorJanelaEm: r2(maiorJanelaEm),
    elementosPorMinuto: r2(elementos / minutos),
    punchPorMinuto: r2(punch / minutos),
    rosto: r2(rosto / Math.max(duracao, 0.1)),
    broll: r2(broll / Math.max(duracao, 0.1)),
    texto: r2(texto / Math.max(duracao, 0.1)),
    fundoEscuro: r2(comFundo ? escuros / comFundo : 0),
  };
}

/** A cena que contém o instante t. */
function cenaNoInstante(plano: PlanoDeMontagem, palavras: PalavraNoCorte[], duracao: number, t: number): number {
  const i = plano.cenas.findIndex((c) => {
    const x = tempoDaCena(c, palavras, duracao);
    return t >= x.inicio && t < x.fim;
  });
  return i < 0 ? 0 : i;
}

/** O que o código acha sozinho, contra as metas do projeto e os tetos da bíblia. */
export function problemasPorCodigo(
  plano: PlanoDeMontagem,
  palavras: PalavraNoCorte[],
  duracao: number,
  b: BibliaDoEstilo,
  metas: MetasDoProjeto,
  modo: "corte" | "completo"
): ProblemaDaRevisao[] {
  const m = medirPlano(plano, palavras, duracao);
  const x = metas.metas;
  const saida: ProblemaDaRevisao[] = [];
  if (modo === "corte" && m.gancho > x.ganchoAteSeg + 0.5) {
    saida.push({ cena: 0, gravidade: "alta", origem: "codigo", regra: "gancho", problema: `o primeiro gancho visual só aparece em ${m.gancho.toFixed(1)} s; a meta é até ${x.ganchoAteSeg.toFixed(1)} s`, correcao: `abrir com o gancho da linguagem nos primeiros ${x.ganchoAteSeg.toFixed(1)} s (${b.regras[0]})` });
  }
  if (modo === "corte" && m.maiorJanela > x.mudancaACadaSeg * 1.6 && m.maiorJanela > 3) {
    saida.push({ cena: cenaNoInstante(plano, palavras, duracao, m.maiorJanelaEm + 0.01), gravidade: "media", origem: "codigo", regra: "ritmo", problema: `${m.maiorJanela.toFixed(1)} s sem nada mudando na tela a partir de ${m.maiorJanelaEm.toFixed(1)} s; a meta é algo novo a cada ${x.mudancaACadaSeg.toFixed(1)} s`, correcao: "dividir a cena ou pôr um movimento ou elemento novo na palavra forte do meio" });
  }
  // Densidade e punch são metas do CORTE: o completo segue as cotas por minuto
  // de montagem-do-completo.ts (ritmo-da-edicao.ts), mais baixas de propósito.
  if (modo === "corte" && m.elementosPorMinuto < b.metas.elementosPorMinuto.min * 0.8) {
    saida.push({ cena: null, gravidade: "alta", origem: "codigo", regra: "densidade", problema: `${m.elementosPorMinuto.toFixed(0)} elementos por minuto; a linguagem pede pelo menos ${b.metas.elementosPorMinuto.min}`, correcao: "acrescentar elementos da linguagem nas palavras fortes das cenas vazias" });
  }
  if (modo === "corte" && m.elementosPorMinuto > b.metas.elementosPorMinuto.max * 1.4) {
    saida.push({ cena: null, gravidade: "media", origem: "codigo", regra: "poluicao", problema: `${m.elementosPorMinuto.toFixed(0)} elementos por minuto; a linguagem aguenta até ${b.metas.elementosPorMinuto.max}`, correcao: "tirar os elementos que repetem a fala sem acrescentar" });
  }
  plano.cenas.forEach((c, k) => {
    // CENA VAZIA (01/10): sem a pessoa, sem imagem e sem elemento, a tela é
    // só o fundo e a legenda (a prova do MrBeast teve três quadros assim).
    const semPessoa = c.layout === "cartela" || c.layout === "broll-cheio";
    if (semPessoa && !c.asset && !c.elementos.length) {
      saida.push({ cena: k, gravidade: "alta", origem: "codigo", regra: "cena vazia", problema: "cena sem a pessoa, sem imagem e sem elemento: a tela fica só com o fundo e a legenda", correcao: "pôr o elemento principal da linguagem (palavra gigante, número, ícone ou imagem) ou voltar para a pessoa" });
    }
    if (c.elementos.length > b.elementos.maxPorCena) {
      saida.push({ cena: k, gravidade: "media", origem: "codigo", regra: "elementos por cena", problema: `${c.elementos.length} elementos numa cena; a linguagem aceita até ${b.elementos.maxPorCena}`, correcao: `deixar no máximo ${b.elementos.maxPorCena} elementos, os mais fortes` });
    }
  });
  const [pMin, pMax] = b.movimento.punchPorMinuto;
  if (modo === "corte" && duracao >= 20 && (m.punchPorMinuto < pMin * 0.6 || m.punchPorMinuto > pMax * 1.5)) {
    saida.push({ cena: null, gravidade: "baixa", origem: "codigo", regra: "punch", problema: `${m.punchPorMinuto.toFixed(0)} punches por minuto; a linguagem pede de ${pMin} a ${pMax}`, correcao: "ajustar o movimento das cenas de narrador" });
  }
  return saida;
}

/**
 * Os nomes de elemento e fundo NA LINGUAGEM do kit (01/10). O plano guarda os
 * tipos internos ("letras-revista", "papel-marca"), que no impacto são a
 * palavra gigante e a cor da marca; na prova de 01/10 o revisor leu os nomes
 * internos e acusou "letras de revista e papel proibidos" num MrBeast que não
 * tinha nem um nem outro. O revisor lê o que o cliente vai ver.
 */
const NOME_DO_ELEMENTO: Record<BibliaDoEstilo["kit"], Record<string, string>> = {
  colagem: {},
  impacto: { "letras-revista": "palavra gigante", titulo: "palavra gigante", carimbo: "palavra gigante", "marca-texto": "destaque", tarja: "destaque", "icone-pop": "emoji", recorte: "objeto ilustrado", faixa: "faixa de valor", selo: "selo", comentario: "comentário respondido" },
  sobrio: { "marca-texto": "citação", "letras-revista": "título", carimbo: "título", titulo: "título", tarja: "tarja" },
};
const NOME_DO_FUNDO: Record<BibliaDoEstilo["kit"], Record<string, string>> = {
  colagem: {},
  impacto: { "papel-marca": "marca (cor da marca chapada)", papel: "escuro" },
  sobrio: { papel: "claro (cor clara lisa)", "papel-marca": "marca (cor da marca chapada)" },
};

/** O plano em texto legível para o revisor (tempo, layout, elementos, imagens). */
function planoEmTexto(plano: PlanoDeMontagem, palavras: PalavraNoCorte[], duracao: number, kit: BibliaDoEstilo["kit"] = "colagem"): string {
  const assets = new Map(plano.assets.map((a) => [a.id, a]));
  const elemento = (t: string) => NOME_DO_ELEMENTO[kit][t] ?? t;
  const fundo = (f: string) => NOME_DO_FUNDO[kit][f] ?? f;
  return plano.cenas
    .map((c, k) => {
      const t = tempoDaCena(c, palavras, duracao);
      const els = c.elementos
        .map((e) => {
          const em = palavras[e.palavra]?.texto ?? "?";
          const v = "texto" in e ? `"${(e as { texto?: string }).texto ?? ""}"` : e.tipo === "numero" ? String(e.valor) : e.tipo === "icone-pop" ? e.nome : e.tipo === "recorte" ? assets.get(e.asset)?.descricao?.slice(0, 80) ?? e.asset : "";
          return `${elemento(e.tipo)} ${v} (entra em "${em}", zona ${e.zona})`;
        })
        .join("; ");
      const midia = c.asset ? assets.get(c.asset) : undefined;
      return `CENA ${k} [${t.inicio.toFixed(1)} a ${t.fim.toFixed(1)} s] ${c.layout}, ${c.movimento}${typeof c.movimentoNa === "number" ? ` em "${palavras[c.movimentoNa]?.texto ?? "?"}"` : ""}, transição ${c.transicao}, fundo ${fundo(c.fundo)}${midia ? `, imagem (${midia.tipo}): ${midia.descricao.slice(0, 160)}` : ""}${els ? `\n  elementos: ${els}` : ""}\n  fala: ${palavrasDaCena(c, palavras)}`;
    })
    .join("\n");
}

const SISTEMA_DO_REVISOR = `Você é o REVISOR DE MONTAGEM da Demandou: um editor-chefe que confere o plano de edição de outro editor ANTES de qualquer imagem ser gerada. Você não reescreve o plano; você aponta, cena a cena, o que está errado e diz como corrigir em uma frase. Seja exigente com o que importa e não aponte gosto pessoal.

Confira, nesta ordem:
1. A LINGUAGEM: o plano segue a bíblia do estilo escolhido (layouts, fundos, elementos, ritmo, imagens)? Aponte cena que pareça outro estilo.
2. A FALA: texto na tela que diz o contrário da fala, que não foi dito, ou que entra antes da palavra; número que não foi dito; imagem que não é o substantivo concreto dito ou é genérica demais.
3. O CLIENTE: as GUARDAS DO SETOR (valem por cima do estilo); imagem que parece outro tipo de negócio; tom fora da marca.
4. A ABERTURA: os primeiros segundos prendem como a linguagem pede?
5. "CARA DE IA": tela poluída, elementos competindo, a mesma ideia repetida em vários elementos, imagem cafona ou de banco de imagem.
6. MONOTONIA: o mesmo layout ou movimento repetido sem motivo.
7. CENA VAZIA: nenhuma cena pode ficar só com o fundo e a legenda. Cena sem a pessoa (cartela, imagem em tela cheia) precisa de um elemento principal visível ocupando o quadro (palavra gigante, imagem, número, ícone); aponte com gravidade "alta" a que não tiver.

Gravidade: "alta" quando o cliente reprovaria o vídeo por isso (contradição, guarda violada, estilo errado, abertura sem gancho); "media" quando piora claramente; "baixa" para ajuste fino. No máximo 8 problemas, os mais importantes. Plano bom recebe nota alta e lista curta.

Português do Brasil, sem travessão. Responda SÓ com JSON válido, sem cerca de código:
{"nota":0-10,"problemas":[{"cena":3,"gravidade":"alta","regra":"guarda do setor","problema":"...","correcao":"..."}]}
Use "cena": null para problema do plano inteiro.`;

/** A revisão por IA do plano (sem corrigir). */
async function revisarPorIA(p: {
  projectId?: string;
  plano: PlanoDeMontagem;
  palavras: PalavraNoCorte[];
  duracao: number;
  formato: Formato;
  biblia: BibliaDoEstilo;
  metas: MetasDoProjeto;
  perfil: PerfilDoProjeto | null;
  medidas: MedidasDoPlano;
  doCodigo: ProblemaDaRevisao[];
  modo: "corte" | "completo";
}): Promise<{ nota: number; problemas: ProblemaDaRevisao[] }> {
  const b = p.biblia;
  const usuario = [
    `ESTILO ESCOLHIDO: ${b.nome}. ${b.essencia}`,
    `REGRAS DA LINGUAGEM:\n${b.regras.map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
    `PROIBIDO NESTA LINGUAGEM: ${b.elementos.proibidos.join("; ")}.`,
    `CHECKLIST DA BÍBLIA:\n${b.checklist.map((c) => `- ${c}`).join("\n")}`,
    `METAS DO PROJETO:\n${metasNoPrompt(p.metas)}`,
    perfilNoPrompt(p.perfil),
    `${p.modo === "corte" ? "CORTE vertical para Reels e Shorts" : "BLOCO do vídeo completo"}, ${p.formato}, ${p.duracao.toFixed(1)} s.`,
    `MEDIDAS DO PLANO (feitas pelo código): cena média ${p.medidas.cenaMedia} s; gancho em ${p.medidas.gancho} s; maior janela parada ${p.medidas.maiorJanela} s; ${p.medidas.elementosPorMinuto} elementos por minuto; ${p.medidas.punchPorMinuto} punches por minuto; rosto ${Math.round(p.medidas.rosto * 100)}%, imagem em tela cheia ${Math.round(p.medidas.broll * 100)}%, texto ${Math.round(p.medidas.texto * 100)}%; fundo escuro em ${Math.round(p.medidas.fundoEscuro * 100)}% das cenas com fundo.`,
    p.doCodigo.length ? `O CÓDIGO JÁ APONTOU (não repita):\n${p.doCodigo.map((x) => `- ${x.cena === null ? "plano" : `cena ${x.cena}`}: ${x.problema}`).join("\n")}` : "",
    `O PLANO (os nomes de elemento e de fundo já são os desta linguagem):\n${planoEmTexto(p.plano, p.palavras, p.duracao, b.kit)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const resposta = await askClaude(SISTEMA_DO_REVISOR, usuario, {
    model: DEFAULT_MODEL,
    effort: "medium",
    maxTokens: 12000,
    timeoutMs: 180_000,
    usage: { projectId: p.projectId, operation: "montagem-revisor" },
  });
  const j = extrairJson(resposta) as { nota?: unknown; problemas?: Array<Record<string, unknown>> };
  const gravidades = ["alta", "media", "baixa"] as const;
  const problemas: ProblemaDaRevisao[] = (j.problemas ?? [])
    .map((x) => ({
      cena: typeof x.cena === "number" && x.cena >= 0 && x.cena < p.plano.cenas.length ? Math.round(x.cena) : null,
      gravidade: (gravidades as readonly string[]).includes(String(x.gravidade)) ? (x.gravidade as ProblemaDaRevisao["gravidade"]) : "media",
      origem: "revisor" as const,
      regra: String(x.regra ?? "").slice(0, 60),
      problema: String(x.problema ?? "").replace(/[—–]/g, ",").slice(0, 300),
      correcao: String(x.correcao ?? "").replace(/[—–]/g, ",").slice(0, 300),
    }))
    .filter((x) => x.problema)
    .slice(0, 8);
  const nota = typeof j.nota === "number" ? Math.max(0, Math.min(10, j.nota)) : 6;
  return { nota, problemas };
}

const PESO: Record<ProblemaDaRevisao["gravidade"], number> = { alta: 3, media: 2, baixa: 1 };

/**
 * Revisa e corrige um plano. Nunca derruba o roteiro: qualquer falha devolve
 * o plano do diretor como veio, com a revisão marcando "sem-correcao".
 */
export async function revisarECorrigir(p: {
  projectId?: string;
  referencia: string;
  plano: PlanoDeMontagem;
  palavras: PalavraNoCorte[];
  duracao: number;
  formato: Formato;
  escolha: unknown;
  videoStyle?: string | null;
  colorPalette?: string | null;
  nicho?: string | null;
  modo: "corte" | "completo";
  perfil?: PerfilDoProjeto | null;
  /** Teto de cenas corrigidas (padrão: 4 no corte, 3 no bloco do completo). */
  maxCorrecoes?: number;
  /** Cena que não pode ser trocada (no completo: a que cai em tela compartilhada). */
  intocavel?: (inicio: number, fim: number) => boolean;
}): Promise<{ plano: PlanoDeMontagem; revisao: ResumoDaRevisao }> {
  const escolha = normalizarEscolha(p.escolha, p.videoStyle);
  const biblia = bibliaDoEstilo(escolha.estiloId);
  const perfil = p.perfil !== undefined ? p.perfil : await perfilDoProjeto(p.projectId);
  const metas = metasDoProjeto(biblia, perfil?.ritmoDoNicho);
  const medidas = medirPlano(p.plano, p.palavras, p.duracao);
  const feitoEm = new Date().toISOString();
  const base: Omit<ResumoDaRevisao, "nota" | "problemas" | "corrigidas" | "resultado"> = { medidas, estilo: biblia.id, feitoEm };
  const doCodigo = problemasPorCodigo(p.plano, p.palavras, p.duracao, biblia, metas, p.modo);
  let ia: { nota: number; problemas: ProblemaDaRevisao[] };
  try {
    ia = await revisarPorIA({ projectId: p.projectId, plano: p.plano, palavras: p.palavras, duracao: p.duracao, formato: p.formato, biblia, metas, perfil, medidas, doCodigo, modo: p.modo });
  } catch (e) {
    console.warn(`[revisor ${p.referencia}] revisão falhou: ${e instanceof Error ? e.message : e}`);
    return { plano: p.plano, revisao: { ...base, nota: -1, problemas: doCodigo, corrigidas: 0, resultado: "sem-correcao" } };
  }
  const todos = [...doCodigo, ...ia.problemas];
  const resumo = (x: ProblemaDaRevisao[]) => x.map(({ cena, gravidade, origem, problema }) => ({ cena, gravidade, origem, problema }));

  // As cenas a corrigir: alta e média, as mais graves primeiro. Problema do
  // plano inteiro (densidade) vira correção das cenas MAIS VAZIAS.
  const porCena = new Map<number, { peso: number; pedidos: string[] }>();
  const somar = (k: number, x: ProblemaDaRevisao) => {
    const atual = porCena.get(k) ?? { peso: 0, pedidos: [] };
    atual.peso += PESO[x.gravidade];
    atual.pedidos.push(`${x.problema}. Correção: ${x.correcao}`);
    porCena.set(k, atual);
  };
  for (const x of todos.filter((y) => y.gravidade !== "baixa")) {
    if (x.cena !== null) somar(x.cena, x);
    else if (x.regra === "densidade") {
      const vazias = p.plano.cenas
        .map((c, k) => ({ k, n: c.elementos.length, d: tempoDaCena(c, p.palavras, p.duracao) }))
        .filter((c) => c.d.fim - c.d.inicio >= 2.5 && p.plano.cenas[c.k].layout !== "broll-cheio")
        .sort((a, b) => a.n - b.n || b.d.fim - b.d.inicio - (a.d.fim - a.d.inicio))
        .slice(0, 2);
      for (const v of vazias) somar(v.k, x);
    }
  }
  const teto = p.maxCorrecoes ?? (p.modo === "corte" ? 4 : 3);
  const alvo = [...porCena.entries()]
    .filter(([k]) => {
      const t = tempoDaCena(p.plano.cenas[k], p.palavras, p.duracao);
      // O que o CLIENTE pediu ou reescreveu (02/10) o revisor não troca:
      // pedido do cliente nunca some em silêncio.
      const c = p.plano.cenas[k];
      if (c.pedido || c.ajuste === "editado" || c.ajuste === "nova-ideia") return false;
      return !p.intocavel?.(t.inicio, t.fim);
    })
    .sort((a, b) => b[1].peso - a[1].peso)
    .slice(0, teto);
  if (!alvo.length) {
    return { plano: p.plano, revisao: { ...base, nota: ia.nota, problemas: resumo(todos), corrigidas: 0, resultado: "aprovado" } };
  }

  const novas = await Promise.all(
    alvo.map(async ([k, x]) => {
      const c: CenaDoPlano = p.plano.cenas[k];
      const { inicio, fim } = tempoDaCena(c, p.palavras, p.duracao);
      const daCena = p.palavras.slice(c.de, c.ate + 1).map((w) => ({ texto: w.texto, inicio: +(w.inicio - inicio).toFixed(3), fim: +(w.fim - inicio).toFixed(3) }));
      try {
        const plano = await novaIdeiaDaCena({
          projectId: p.projectId,
          referencia: `${p.referencia}/correcao/${k}`,
          palavras: daCena,
          duracao: +(fim - inicio).toFixed(3),
          formato: p.formato,
          escolha: p.escolha,
          videoStyle: p.videoStyle,
          colorPalette: p.colorPalette,
          nicho: p.nicho,
          antes: p.palavras.slice(Math.max(0, c.de - 25), c.de).map((w) => w.texto).join(" "),
          depois: p.palavras.slice(c.ate + 1, c.ate + 26).map((w) => w.texto).join(" "),
          atual: `${c.layout}, ${c.movimento}, fundo ${c.fundo}, ${c.elementos.map((e) => e.tipo).join(", ") || "sem elementos"}; ${c.motivo}`,
          pedido: x.pedidos.join(" | "),
          origem: "revisor",
          perfil,
          // A cena de cinema que a cena já tinha pode continuar (o corte tem piso).
          cinema: c.asset && p.plano.assets.find((a) => a.id === c.asset)?.tipo === "cena-em-movimento" ? 1 : 0,
        });
        return { k, plano };
      } catch (e) {
        console.warn(`[revisor ${p.referencia}] correção da cena ${k} falhou: ${e instanceof Error ? e.message : e}`);
        return { k, plano: null };
      }
    })
  );

  // Troca de trás para frente: os índices das cenas antes da trocada não mudam.
  let plano = p.plano;
  let corrigidas = 0;
  for (const n of novas.filter((x) => x.plano?.cenas.length).sort((a, b) => b.k - a.k)) {
    const antes = plano.cenas.length;
    plano = trocarCena(plano, n.k, n.plano!, `r${n.k}`);
    // A marca "nova-ideia" é do cliente; a correção do revisor não aparece como pedido dele.
    const inseridas = plano.cenas.length - antes + 1;
    for (let i = n.k; i < n.k + inseridas; i++) if (plano.cenas[i]) delete plano.cenas[i].ajuste;
    corrigidas++;
  }
  const depois = medirPlano(plano, p.palavras, p.duracao);
  return {
    plano,
    revisao: { ...base, depois, nota: ia.nota, problemas: resumo(todos), corrigidas, resultado: corrigidas ? "corrigido" : "sem-correcao" },
  };
}
