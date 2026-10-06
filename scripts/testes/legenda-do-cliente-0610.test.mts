// A prova pura do diagnóstico do vídeo cmux4417u (06/10/2026, noite), sem chamada paga:
//   1. o estilo de legenda escolhido pelo cliente (papel, caixa, marca-texto, palavra, limpa) chega ao worker com o
//      desenho dele, e o ASS do editor por comando sai com o MESMO visual do caminho antigo;
//   3. a colisão considera todas as peças com texto pela caixa real (as vetoriais e as versões na frente).
// Rodar: npx tsx --test scripts/testes/legenda-do-cliente-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { legendaDesenhada, legendaQueVale, paginasNoEstilo } from "@/lib/media/editor-por-comando/estilo-manda";
import { ESTILOS_DE_LEGENDA, type EstiloDeLegenda } from "@/lib/media/legenda-escolhida";
import { faixaDaPagina, faixaDaPeca, posicionarLegenda } from "@/lib/media/editor-sob-medida/faixa-da-legenda";
import { caixaDaVetorial } from "@/lib/media/editor-por-comando/caixa-das-vetoriais";
import type { EdicaoResolvida, CamadaResolvida } from "@/lib/media/editor-sob-medida/tipos";
import { legendaSobMedida } from "../../worker/src/edicao-sob-medida.mjs";

const palavras = "a gente fecha consórcio de alto padrão com método e muita calma no processo".split(" ").map((texto, i) => ({ texto, inicio: i * 0.4, fim: i * 0.4 + 0.35 }));
const rosto = { x: 0.3, y: 0.2, w: 0.4, h: 0.25 };
const tema = { acento: "#C9A227", escuro: "#101828", claro: "#FFFFFF", fonteTitulo: "Anton", pesoTitulo: 400, fonteTexto: "Geist", fonteMono: "Geist Mono", visual: "limpo", caixaAlta: false, escuroLegenda: "#06111F" } as unknown as EdicaoResolvida["tema"];

function edicaoComLegenda(estilo: EstiloDeLegenda, camadas: CamadaResolvida[] = []): EdicaoResolvida {
  const l = legendaQueVale(estilo, null, "")!;
  return { largura: 1080, altura: 1920, fps: 30, duracao: 8, camadas, planos: [], camera: [], tema, insercoes: {}, legenda: { paginas: paginasNoEstilo(palavras, l, true), estilo: legendaDesenhada(l, rosto, true) } } as unknown as EdicaoResolvida;
}

// ─────────────── 1. a legenda escolhida ───────────────

test("1. cada estilo de legenda da tela chega ao worker com o desenho dele", () => {
  for (const { id } of ESTILOS_DE_LEGENDA) {
    const ed = edicaoComLegenda(id);
    assert.equal(ed.legenda!.estilo!.desenho, id, `${id}: o desenho chega ao worker`);
    assert.ok(ed.legenda!.paginas.every((p) => p.palavras?.length), `${id}: cada página leva o tempo das palavras`);
  }
  // Sem estilo fixado (a Automática), nada de desenho: a legenda do estilo do vídeo segue como estava.
  assert.equal(legendaQueVale(null, null, "legenda grande no meio")?.desenho, undefined);
});

test("1. o ASS do editor tem o visual do caminho antigo em cada estilo", () => {
  const ass = (id: EstiloDeLegenda) => legendaSobMedida(edicaoComLegenda(id), 1080, 1920, 0, 8) as string;
  const estilo = (a: string) => a.split("\n").find((l) => l.startsWith("Style: Leg,"))!.split(",");
  // papel: tira clara (#FBFAF5 em BGR = F5FAFB) atrás de texto escuro, BorderStyle 3.
  const papel = estilo(ass("papel"));
  assert.equal(papel[15], "3", "papel em caixa (BorderStyle 3)");
  assert.match(papel[5], /F5FAFB$/, "a tira de papel clara");
  assert.match(papel[3], /1A1716$/, "texto escuro no papel");
  // caixa: faixa escura da marca (escuroLegenda #06111F) quase opaca.
  const caixa = estilo(ass("caixa"));
  assert.equal(caixa[15], "3");
  assert.match(caixa[5], /^&H10/);
  assert.match(caixa[5], /1F1106$/);
  // marca-texto: grifo na cor da marca por palavra já dita.
  assert.match(ass("marca-texto"), /\\3c&H27A2C9&/);
  // palavra: Anton grande, contorno, em caixa alta.
  const pal = ass("palavra");
  assert.match(pal, /Style: Leg,Anton,112/);
  assert.match(pal, /CONSÓRCIO/);
  // limpa: branca com contorno (BorderStyle 1), a falada no acento.
  const limpa = estilo(ass("limpa"));
  assert.equal(limpa[15], "1");
  assert.match(ass("limpa"), /\\c&H0027A2C9&/);
  // A palavra dita acende no acento (karaokê por palavra), em todo estilo menos o marca-texto.
  for (const id of ["papel", "caixa", "palavra", "limpa"] as const) assert.match(ass(id), /\{\\c&H0027A2C9&\}/, `${id}: a falada no acento`);
});

test("1. a página escondida sob a peça e a faixa de cima valem no desenho do cliente", () => {
  const ed = edicaoComLegenda("papel");
  ed.legenda!.paginas[0].faixa = "oculta";
  ed.legenda!.paginas[1].faixa = "topo";
  const a = legendaSobMedida(ed, 1080, 1920, 0, 8) as string;
  const textoDa0 = ed.legenda!.paginas[0].palavras![0].texto;
  assert.ok(!a.split("\n").some((l) => l.startsWith("Dialogue") && l.includes(`}${textoDa0}`) && l.startsWith("Dialogue: 0,0:00:00.00")), "a oculta não sai");
  assert.match(a, /,LegTopo,,/);
});

const camada = (id: string, peca: string, de: number, ate: number, props: Record<string, unknown> = {}): CamadaResolvida => ({ id, peca, de, ate, entrada: 0.5, saida: 0.3, eventos: [], evento: 0.5, props });

// ─────────────── 3. a colisão pela caixa real ───────────────

test("3. toda peça com texto colide pela caixa real (vetoriais e versões na frente)", () => {
  const caixas: Record<string, { x: number; y: number; w: number; h: number }> = {
    "titulo-em-caixa": caixaDaVetorial("titulo-em-caixa", { vertical: true, rosto })!,
    "cartoes-em-linha": caixaDaVetorial("cartoes-em-linha", { vertical: true, rosto: { x: 0.3, y: 0.3, w: 0.4, h: 0.25 } })!,
    "icone-com-frase": caixaDaVetorial("icone-com-frase", { vertical: true, rosto })!,
    "comparacao-lado-a-lado": caixaDaVetorial("comparacao-lado-a-lado", { vertical: true, rosto })!,
    "interface-de-edicao": caixaDaVetorial("interface-de-edicao", { vertical: true, rosto })!,
  };
  for (const [peca, caixa] of Object.entries(caixas)) {
    assert.ok(caixa, `${peca}: tem caixa`);
    const f = faixaDaPeca({ peca, props: { caixa } });
    assert.ok(Array.isArray(f), `${peca}: faixa medida`);
    assert.ok((f as number[])[0] <= caixa.y && (f as number[])[1] >= caixa.y + caixa.h, `${peca}: a faixa cobre a caixa inteira, com folga`);
  }
  // A versão na frente (caixa no topo vira frase-chave com caixa; cartão embaixo vira cartão de passo com caixa).
  assert.deepEqual(faixaDaPeca({ peca: "frase-chave", props: { caixa: { x: 0.07, y: 0.045, w: 0.86, h: 0.15 } } }), [0.025, 0.215]);
  // Sem caixa (plano antigo), a vetorial de conteúdo conta abaixo do rosto, até a faixa da legenda.
  assert.deepEqual(faixaDaPeca({ peca: "cartoes-em-linha", props: {} }), [0.45, 0.82]);
  // A cartoes-em-linha que termina encostada na legenda (0,69 a 0,71) agora a empurra (folga de 0,02).
  const encostada = faixaDaPagina({ inicio: 0, fim: 1 }, [{ peca: "cartoes-em-linha", props: { caixa: { x: 0.05, y: 0.5, w: 0.9, h: 0.2 } }, de: 0, ate: 2 }], [], [0.71, 0.83]);
  assert.equal(encostada, "topo");
  // O titulo-em-caixa no alto + legenda no topo: com a de baixo livre, fica embaixo.
  const ed = edicaoComLegenda("papel", [camada("t", "titulo-em-caixa", 0, 3, { caixa: caixas["titulo-em-caixa"] })]);
  const pos = posicionarLegenda(ed);
  assert.equal(pos.movidas, 0);
});
