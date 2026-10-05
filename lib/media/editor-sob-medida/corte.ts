import type { Retangulo } from "@/lib/media/plano-de-montagem";
import type { EdicaoResolvida, PlanoResolvido } from "@/lib/media/editor-sob-medida/tipos";
import { ESTILOS_DA_LOUSA, ESTILOS_DO_VOX, ehApoio } from "@/lib/media/editor-sob-medida/pecas";

/**
 * O EDITOR SOB MEDIDA NO CORTE (03/10/2026): o vídeo curto vertical passa
 * pelo mesmo editor do completo (lib/media/montagem-nos-cortes.ts liga), com
 * o que muda num corte de 30 a 90 s:
 *
 *   - a base é o trecho limpo da GRAVAÇÃO (o worker emenda pela edição gravada,
 *     sem legenda nem efeito) recortado em 9:16 em volta da pessoa
 *     (`quadroDoCorte`); o rosto que a câmera segue é medido nesse quadro;
 *   - o gancho mora nos primeiros 2 s e a densidade é alta (peça em 70% do
 *     tempo ou mais): `INSTRUCOES_DO_CORTE`;
 *   - o editor e o revisor olham de mais perto (`instantesDoCorte`, passo de
 *     6 s na revisão) e cada chamada cabe na passada do cron.
 *
 * Módulo puro.
 */

/**
 * Os defeitos que TIRAM a peça do final (03/10, terceira volta): ilegível,
 * cobrindo, incoerente, imagem ruim. A nota baixa do juiz ("qualidade") e o
 * "feio" vão ao conserto enquanto há rodada; tirar a peça no fim deixava a
 * cabeça falando sozinha e a nota caía mais (prova Vox: 5,8 para 5,1).
 */
export const DEFEITOS_GRAVES = new Set(["ilegivel", "cobre", "incoerente", "imagem"]);

/** Fração mínima do corte com peça na tela (o pedido do dono: corte é curto). */
export const DENSIDADE_DO_CORTE = 0.7;

/** Os instantes que o editor vê no corte: um a cada 3 s, no máximo 30. */
export function instantesDoCorte(duracao: number): number[] {
  const passo = Math.max(3, duracao / 30);
  const saida: number[] = [];
  for (let t = 0.6; t < duracao - 0.3; t += passo) saida.push(+t.toFixed(2));
  return saida;
}

/**
 * O QUADRO 9:16 do corte dentro da gravação, em fração dela: altura inteira
 * (gravação deitada) com a largura de 9:16 centrada na pessoa e presa às
 * bordas; na gravação em pé mais alta que 9:16 (celular de 19,5:9), a largura
 * inteira e a sobra tirada 35% de cima, como o corte simples
 * (worker/src/ffmpeg.mjs, montarFiltroVertical).
 */
export function quadroDoCorte(fonte: { largura: number; altura: number }, pessoa: Retangulo | null | undefined): Retangulo {
  const W = Math.max(1, fonte.largura);
  const H = Math.max(1, fonte.altura);
  const alvo = 9 / 16;
  if (W / H > alvo) {
    const w = (H * alvo) / W;
    const centro = pessoa ? pessoa.x + pessoa.w / 2 : 0.5;
    const x = Math.min(1 - w, Math.max(0, centro - w / 2));
    return { x: +x.toFixed(4), y: 0, w: +w.toFixed(4), h: 1 };
  }
  const h = Math.min(1, (W / alvo) / H);
  return { x: 0, y: +((1 - h) * 0.35).toFixed(4), w: 1, h: +h.toFixed(4) };
}

/** Uma caixa em fração da gravação levada para fração do quadro do corte. */
export function noQuadroDoCorte(r: Retangulo, q: Retangulo): Retangulo {
  const x = (r.x - q.x) / q.w;
  const y = (r.y - q.y) / q.h;
  const w = r.w / q.w;
  const h = r.h / q.h;
  const x0 = Math.min(1, Math.max(0, x));
  const y0 = Math.min(1, Math.max(0, y));
  return { x: +x0.toFixed(4), y: +y0.toFixed(4), w: +Math.min(1 - x0, Math.max(0.02, w - (x0 - x))).toFixed(4), h: +Math.min(1 - y0, Math.max(0.02, h - (y0 - y))).toFixed(4) };
}

/**
 * AS PEÇAS DO VOX NO CORTE (04/10, quadro de treino vox-01 do dono). Valem
 * sobre as regras gerais do corte: aqui não há "titulo", "sublinhado",
 * "palavra-chave" nem "icone" (o catálogo do Vox não tem); o gancho, a
 * densidade e as telas são feitos com as peças de papel.
 */
export const INSTRUCOES_DO_VOX = [
  `# AS PEÇAS DESTE ESTILO (o VOX de verdade; valem sobre as regras gerais do corte: aqui não existem "titulo", "sublinhado", "palavra-chave", "icone", "pergaminho", "citacao", "frase-impacto" nem "titulo-atras")`,
  `- O GANCHO do segundo 0 é uma "colagem" (o assunto em fotos de arquivo, o título no marca-texto) ou uma "censura" se o trecho é polêmico; na falta, "marca-texto" com a promessa.`,
  `- FATO HISTÓRICO, ORIGEM, PERSONAGEM, ÉPOCA: "colagem" com 2 ou 3 recortes de foto de arquivo (cada um cai na palavra dele) e, se há lugar dito, o mapa com o círculo vermelho. É a peça que dá a PROFUNDIDADE; 1 a 2 no corte.`,
  `- LUGAR dito: "mapa-antigo" (o círculo vermelho se desenha na palavra do lugar).`,
  `- DATAS, ÉPOCAS, a ordem dos fatos: "cronologia" (a tira de papel com os anos; um evento por marco).`,
  `- NOTÍCIA, DECLARAÇÃO, RECLAMAÇÃO, o que alguém disse, CITAÇÃO ou VERSÍCULO: "jornal" (a manchete com as palavras ditas e o marca-texto no destaque; no versículo, "data" leva a referência).`,
  `- POLÊMICA, TABU, o que ninguém fala, crítica, REVELAÇÃO: "censura" (estátua ou figura anônima com a tarja amarela batendo nos olhos). Onde couber, 1 por corte. Tarja só em estátua ou figura anônima fictícia, NUNCA em pessoa real.`,
  `- NÚMERO, frase-chave, definição: "marca-texto" sobre a pessoa; veredito dito com força: "carimbo".`,
  `- As fotos de arquivo são GERADAS pelo código a partir da sua "descricao" (em inglês, concreta, P&B de época): nunca pessoa real ou famosa, nunca nome próprio de gente na descrição; figura é sempre um anônimo de época; estátua é genérica.`,
  `- Alterne: tela de papel (colagem, jornal, mapa-antigo, cronologia, censura), rosto com "marca-texto" ou "carimbo", B-roll. Nunca duas telas de papel seguidas: o rosto volta pelo menos 2 s entre elas. Pelo menos 3 peças de papel diferentes no corte.`,
  `- IMAGEM REAL no Vox é de ARQUIVO: o briefing da INSERÇÃO sempre pede "black and white archival photograph, early 1900s, film grain"; B-roll de banco no máximo 1 no corte, só de objeto ou ação que a fala cita, nunca cena colorida genérica (o juiz reprova a foto colorida de banco no meio da colagem sépia).`,
].join("\n");

/**
 * AS PEÇAS DA LOUSA NO CORTE (04/10, os 14 quadros reais do Dan Martell): no
 * estilo lousa (tecnológico) e no consorcio (o mesmo desenho com acabamento
 * de luxo), cada momento da fala tem a peça dele, e elas valem sobre as
 * genéricas.
 */
export const INSTRUCOES_DA_LOUSA = [
  `# AS PEÇAS DESTE ESTILO (valem sobre as genéricas: título, cartões e sublinhado ficam para o que estas não cobrem)`,
  `- IMPACTO: "palavra-gigante" na palavra mais forte dita com ênfase (1 ou 2 no corte; pode ser o gancho do segundo 0).`,
  `- PERGUNTA, BUSCA, PESQUISA ou IA citada: "busca" (a barra digitando; o evento é a IA "pensando").`,
  `- PEDIDO ditado para uma IA ou assistente, ou um prompt: "chat" (a caixa embaixo, digitando).`,
  `- ENUMERAÇÃO (passos, camadas, pilares): "pilha-passos", um evento por item na palavra dele.`,
  `- MARCA, PRODUTO, FERRAMENTA ou nome de método citado: "marca-brilho" (o ícone oficial da marca entra sozinho: escreva em "marca" o nome como foi dito). Duas a quatro ferramentas: "ferramentas".`,
  `- PROCESSO ou SISTEMA explicado: "notebook" (o formulário preenchendo, os valores do que foi dito).`,
  `- IDEIA, MENTE, decisão interior: "ilustracao-traco" (cerebro ou lampada) com a frase digitando.`,
  `- MATERIAL, e-book, guia, planilha ou oferta: "material".`,
  `- CHAMADA PARA SEGUIR no fim: "seguir", só com o @ do PRÓPRIO cliente (dito na fala ou nos links dele); nunca o perfil de outra pessoa. Foto de pessoa real que não seja o cliente, nunca.`,
  `- A legenda com a palavra sublinhada e a grade de cor do B-roll são automáticas: não escreva.`,
].join("\n");

/**
 * O que o editor recebe a mais no corte. Vale sobre as regras gerais de
 * densidade do prompt (as do vídeo longo).
 */
export function instrucoesDoCorte(p: { duracao: number; titulo?: string | null; videos?: number; estiloId?: string | null }): string {
  const s = Math.round(p.duracao);
  return [
    `# ESTE É UM CORTE CURTO VERTICAL (${s} s, 9:16, Reels, Shorts e TikTok). As regras abaixo valem sobre as de densidade do vídeo longo.`,
    p.titulo ? `Título do corte: "${p.titulo}".` : "",
    `- GANCHO NOS PRIMEIROS 2 SEGUNDOS: a primeira peça entra em F0, na primeira palavra, e é a mais forte do corte: um "titulo" (ou "frase-impacto" curta, ou "pergunta-resposta") com a promessa ou a tensão do trecho, nas palavras do falante. Quem rola o feed decide ali se fica.`,
    `- DENSIDADE ALTA: peça na tela em pelo menos ${Math.round(DENSIDADE_DO_CORTE * 100)}% do tempo (mire em 80%), uma peça nova a cada 3 a 6 s, nenhum trecho de mais de 4 s sem peça. Num corte de ${s} s isso é de ${Math.max(6, Math.round(s / 6))} a ${Math.max(8, Math.round(s / 3.5))} momentos. Emende: o "ate" de uma peça cai perto do "de" da próxima.`,
    `- Use a duração toda de cada peça: título e ícone ficam até o fim da frase que os pede (até 6 s), painel e lista até o último item dito.`,
    `- Tela cheia no máximo 30% do tempo, nenhuma acima de 6 s, e NUNCA duas seguidas: entre duas peças de tela cheia o rosto volta por pelo menos 2 s (uma peça sobre a pessoa ou ao lado). O rosto é o que segura o corte.`,
    `- No 9:16 a cabeça ocupa o terço de cima: o título sobre a pessoa vai no peito (o código posiciona), então título de no máximo 6 palavras e 2 linhas.`,
    `- ÁREA SEGURA do 9:16: nada encostado nas bordas; a faixa da direita e o rodapé são da interface da rede (curtir, comentar, a legenda do post). O código posiciona as peças; você mantém os textos CURTOS (título até 6 palavras).`,
    `- PROFUNDIDADE: 1 "titulo-atras" no corte (a palavra-tese gigante atrás da pessoa recortada), de preferência na virada ou na frase mais forte.`,
    `- TELAS QUE IMPRESSIONAM: pelo menos 2 peças de tela cheia com palco (câmera em movimento) no corte, escolhidas entre as de DADOS e ESTRUTURA quando a fala permite: "passos-foco" (N passos, um aceso), "numero" (contador), "grafico-linha", "linha-do-tempo", "escada", "cartoes", "comparacao"; senão "frase-impacto" ou "citacao". O corte que é só título sobre a pessoa é a edição que o dono reprovou.`,
    `- "titulo" no máximo 2 vezes no corte (no 9:16 ele sai como letra grande sem tarja); entre eles, use "sublinhado", "palavra-chave", "icone" e "pergunta-resposta".`,
    `- INSERÇÃO CINEMATOGRÁFICA (vídeo gerado na Higgsfield): ${p.videos ?? 4} no corte (${Math.max(2, (p.videos ?? 4) - 1)} a ${p.videos ?? 4}), de 2,5 a 3,5 s cada, onde a fala PEDE imagem: a metáfora, o lugar, a época, a cena bíblica ou histórica (de costas, em plano aberto). O briefing SEMPRE com movimento de câmera forte (dolly in, crane up, orbit); nunca no gancho dos primeiros 2 s (ali é o rosto e o título), e o rosto volta por pelo menos 2 s entre duas imagens.`,
    `- B-ROLL REAL ("broll", vídeo de banco): cobre o resto da imagem real, 1 a cada 10 a 15 s (num corte de ${s} s, ${Math.max(1, Math.round(s / 15))} a ${Math.max(2, Math.round(s / 10))}), de 1,5 a 3 s cada, na palavra que cita um objeto, um lugar ou uma ação do mundo real; consulta em inglês de 2 a 4 palavras concretas. Nunca nos primeiros 2 s.`,
    `- RITMO DE CORTE: a imagem muda a cada 2 a 4 s (peça nova, B-roll, tela, ou a câmera que fecha e abre; o código troca o enquadramento entre elas). Marque em "enfases" ${Math.max(4, Math.round(s / 6))} a ${Math.max(6, Math.round(s / 4))} palavras-chave para o ZOOM DE SOCO.`,
    `- Sem "fecho" com marca no fim, a menos que a pessoa faça uma chamada para ação no próprio trecho.`,
    ESTILOS_DA_LOUSA.includes(p.estiloId ?? "") ? INSTRUCOES_DA_LOUSA : "",
    ESTILOS_DO_VOX.includes(p.estiloId ?? "") ? INSTRUCOES_DO_VOX : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * O ADENSAMENTO do corte, depois da resolução: a peça "sobre a pessoa" que
 * acaba antes da hora estica até perto da próxima (respeitando o teto da
 * peça), sem mexer em tela cheia nem em cartão. Só fecha buracos curtos que
 * o modelo deixou entre duas peças; não inventa peça nova.
 */
export function adensarCorte(ed: EdicaoResolvida, maximo: Record<string, number>): { edicao: EdicaoResolvida; esticadas: number } {
  const comPlano = (de: number, ate: number) => (ed.planos ?? []).some((p) => p.de < ate && p.ate > de);
  const reais = ed.camadas.filter((c) => !ehApoio(c)).sort((a, b) => a.de - b.de);
  let esticadas = 0;
  const camadas = ed.camadas.map((c) => ({ ...c }));
  for (let i = 0; i < reais.length; i++) {
    const c = camadas.find((x) => x.id === reais[i].id)!;
    if (comPlano(c.de, c.ate)) continue;
    const prox = reais[i + 1];
    const limite = Math.min(prox ? prox.de - 0.15 : ed.duracao, c.de + (maximo[c.peca] ?? c.ate - c.de));
    if (limite - c.ate > 0.3 && !comPlano(c.ate, limite)) {
      c.ate = +limite.toFixed(3);
      esticadas++;
    }
  }
  return { edicao: { ...ed, camadas }, esticadas };
}

/**
 * O ROSTO NO CORTE (prova de 03/10, corte 0 de cmurtv2zg): no 9:16 a cabeça
 * mora no terço de cima, e o título de três linhas no topo cobriu os olhos
 * quando a pessoa se inclinou. No corte:
 *   - o TÍTULO e a PERGUNTA E RESPOSTA sobre a pessoa descem para o peito
 *     (posição "baixo", acima da interface da rede);
 *   - duas peças de TELA CHEIA nunca encostam: a segunda começa 1,5 s depois
 *     da primeira (o rosto volta entre elas) ou cai, se ficar curta demais.
 *     Na prova, pergaminho, frase e cartões somaram 12 s sem rosto.
 */
export function arejarCorte(ed: EdicaoResolvida, minimo: Record<string, number>): { edicao: EdicaoResolvida; mudancas: string[] } {
  const mudancas: string[] = [];
  let camadas = ed.camadas.map((c) => ({ ...c, props: { ...c.props } }));
  let planos = [...(ed.planos ?? [])].sort((a, b) => a.de - b.de);
  // Só a TELA CHEIA segura o título no lugar dele; sobre inserção ou B-roll ele desce
  // igual (prova de 03/10, terceira volta: o título do gancho cruzava a inserção, ficou
  // no meio e cobriu o rosto).
  const sobPlano = (c: { de: number; ate: number }) => planos.some((p) => p.tipo !== "insercao" && p.de < c.ate && p.ate > c.de);
  for (const c of camadas) {
    if ((c.peca === "titulo" || c.peca === "pergunta-resposta") && !sobPlano(c) && c.props.posicao !== "baixo") {
      c.props.posicao = "baixo";
      mudancas.push(`${c.id}: ${c.peca} desceu para o peito`);
    }
  }
  const fora = new Set<string>();
  let fimDaTela = -Infinity;
  planos = planos.flatMap((p): PlanoResolvido[] => {
    if (p.tipo !== "grafico") return [p];
    const c = camadas.find((x) => Math.abs(x.de - p.de) < 0.01 && !fora.has(x.id) && !ehApoio(x));
    if (p.de - fimDaTela < 1.2 && c) {
      const novoDe = +(fimDaTela + 1.5).toFixed(3);
      if (p.ate - novoDe >= Math.max(1.8, minimo[c.peca] ?? 2)) {
        c.de = novoDe;
        c.eventos = c.eventos.map((e) => Math.max(e, novoDe + 0.25));
        mudancas.push(`${c.id}: tela cheia começou 1,5 s depois da anterior`);
        fimDaTela = p.ate;
        return [{ ...p, de: novoDe }];
      }
      fora.add(c.id);
      mudancas.push(`${c.id}: tela cheia colada na anterior, saiu`);
      return [];
    }
    fimDaTela = p.ate;
    return [p];
  });
  camadas = camadas.filter((c) => !fora.has(c.id));
  return { edicao: { ...ed, camadas, planos }, mudancas };
}

/** As peças que valem como gancho no segundo 0. */
const PECAS_DE_GANCHO = new Set(["titulo", "frase-impacto", "pergunta-resposta", "titulo-atras", "citacao", "numero", "palavra-gigante", "busca", "colagem", "jornal", "censura", "mapa-antigo", "marca-texto", "cronologia"]);
/** As peças do Vox: a edição que tem alguma é do Vox, e o gancho automático sai no marca-texto. */
const PECAS_DO_VOX = new Set(["colagem", "jornal", "mapa-antigo", "censura", "marca-texto", "carimbo", "cronologia"]);

/**
 * O GANCHO NO SEGUNDO 0, SEMPRE (03/10, à noite): o corte 0 de cmurtv2zg foi
 * ao ar sem o título de abertura, porque o juiz achou o título do gancho
 * ilegível na última rodada e a peça saiu sem substituto. Sem peça de gancho
 * começando até 0,6 s, entra um TÍTULO com o título do corte (até 6 palavras,
 * a palavra mais longa em destaque), de 0 a ~3 s, no peito; a peça que
 * cruzava esse trecho começa depois dele ou sai.
 */
export function garantirGancho(
  ed: EdicaoResolvida,
  titulo: string | null | undefined,
  ficha: { entrada: number; saida: number; evento: number },
  estiloId?: string | null
): { edicao: EdicaoResolvida; mudou: string | null } {
  if (ed.camadas.some((c) => c.de <= 0.6 && PECAS_DE_GANCHO.has(c.peca))) return { edicao: ed, mudou: null };
  const palavras = String(titulo ?? "").replace(/\*+/g, "").replace(/[.!?]+$/, "").split(/\s+/).filter(Boolean).slice(0, 6);
  if (palavras.length < 2) return { edicao: ed, mudou: null };
  const maior = palavras.reduce((m, p, i) => (p.length > palavras[m].length ? i : m), 0);
  const texto = palavras.map((p, i) => (i === maior ? `**${p}**` : p)).join(" ");
  const primeiraTela = (ed.planos ?? []).filter((p) => p.tipo !== "cartao").map((p) => p.de).sort((a, b) => a - b)[0] ?? Infinity;
  const fim = +Math.min(3, ed.duracao - 0.3, primeiraTela - 0.15).toFixed(3);
  if (fim < 1.8) return { edicao: ed, mudou: null };
  const novoDe = +(fim + 0.15).toFixed(3);
  // O que cruza o trecho do gancho começa depois dele ou sai; a moldura e o plano do cartão seguem a peça dela.
  const destino = new Map<string, number | null>();
  for (const c of ed.camadas) {
    if (ehApoio(c) || c.de >= novoDe || c.ate <= 0) continue;
    destino.set(c.id, c.ate - novoDe >= 1.2 ? novoDe : null);
  }
  const camadas = ed.camadas.flatMap((c) => {
    // A legenda da lousa embaixo do título do gancho sai (os dois moram no peito do 9:16).
    if (c.peca === "legenda-destaque" && c.de < novoDe) return [];
    const id = c.peca === "moldura-do-cartao" ? c.id.replace(/-moldura$/, "") : c.id;
    if (!destino.has(id)) return [c];
    const de = destino.get(id);
    if (de === null || de === undefined) return [];
    return [{ ...c, de, eventos: c.eventos.map((x) => Math.max(x, de + 0.25)) }];
  });
  const planos = (ed.planos ?? []).flatMap((p): PlanoResolvido[] => {
    if (p.tipo !== "cartao") return [p];
    const dono = ed.camadas.find((c) => c.peca !== "moldura-do-cartao" && Math.abs(c.de - p.de) < 0.01 && Math.abs(c.ate - p.ate) < 0.01);
    if (!dono || !destino.has(dono.id)) return [p];
    const de = destino.get(dono.id);
    return de === null || de === undefined ? [] : [{ ...p, de }];
  });
  // O ESTILO ESCOLHIDO MANDA (05/10): no Vox o gancho é o marca-texto mesmo quando a
  // edição não tem nenhuma peça de papel (antes era só por adivinhação pelas peças, e
  // um Vox sem peça de papel ganhava o título genérico de outro estilo no segundo 0).
  const vox = ESTILOS_DO_VOX.includes(String(estiloId ?? "")) || ed.camadas.some((c) => PECAS_DO_VOX.has(c.peca));
  const gancho: EdicaoResolvida["camadas"][number] = vox
    ? { id: "gancho-0", peca: "marca-texto", de: 0, ate: fim, entrada: 0.5, saida: 0.25, evento: 0.6, eventos: [], props: { texto: texto.replace(/\*\*/g, ""), posicao: "topo" }, passes: ["frente"] }
    : { id: "gancho-0", peca: "titulo", de: 0, ate: fim, entrada: ficha.entrada, saida: ficha.saida, evento: ficha.evento, eventos: [], props: { titulo: texto, posicao: "baixo" }, passes: ["vidro", "frente"] };
  return { edicao: { ...ed, camadas: [gancho, ...camadas], planos }, mudou: `gancho-0: título do corte no segundo 0 ("${palavras.join(" ")}")` };
}

/** Fração do corte com peça (sem a moldura do cartão). */
export function densidadeDoCorte(ed: EdicaoResolvida): number {
  const D = Math.max(1, ed.duracao);
  const soma = ed.camadas.filter((c) => !ehApoio(c)).reduce((s, c) => s + (c.ate - c.de), 0);
  return +(soma / D).toFixed(3);
}

/**
 * O RITMO MEDIDO (03/10, terceira volta): o maior trecho sem nenhuma troca
 * visual (peça que entra ou sai, plano que muda, câmera que corta) e quantas
 * trocas por minuto. O pedido do dono: troca a cada 2 a 4 s no corte, nunca
 * mais de 4 s de rosto parado.
 */
export function ritmoDoCorte(ed: EdicaoResolvida): { maiorParado: number; trocasPorMinuto: number } {
  const D = Math.max(1, ed.duracao);
  const ts = new Set<number>([0, D]);
  for (const c of ed.camadas) if (!ehApoio(c)) [c.de, c.ate].forEach((x) => ts.add(+x.toFixed(2)));
  for (const p of ed.planos ?? []) [p.de, p.ate].forEach((x) => ts.add(+x.toFixed(2)));
  for (const c of ed.camera ?? []) ts.add(+c.de.toFixed(2));
  const lista = [...ts].filter((x) => x >= 0 && x <= D).sort((a, b) => a - b);
  let maior = 0;
  for (let i = 1; i < lista.length; i++) maior = Math.max(maior, lista[i] - lista[i - 1]);
  return { maiorParado: +maior.toFixed(2), trocasPorMinuto: +((lista.length - 2) / (D / 60)).toFixed(1) };
}
