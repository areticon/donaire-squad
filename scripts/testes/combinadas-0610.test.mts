// A prova pura das PEÇAS COMBINADAS (06/10/2026), sem IA paga:
//   - o número da camada só fica quando a fala diz um número;
//   - o prompt do fundo não leva o que é da camada (letra, seta, carimbo, fio) nem movimento de câmera;
//   - o resolvedor liga o vídeo de fundo como plano de inserção junto com a camada exata, e sem o vídeo a
//     camada cai na folha sobre a gravação com o fundo próprio;
//   - a estimativa não cobra imagem pelo fundo da combinada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { numeroDito, promptDoFundoCombinado, semOQueEDaCamada, segundosDoFundo } from "@/lib/media/editor-por-comando/combinada";
import { resolverPorComando } from "@/lib/media/editor-por-comando/resolver";
import { estimarCusto, custoPrevisto } from "@/lib/media/editor-por-comando/elementos";
import { temaDoEstilo } from "@/lib/media/editor-sob-medida/resolver";
import type { PlanoDoDiretor } from "@/lib/media/editor-por-comando/diretor";

test("número: só o dito fica", () => {
  assert.deepEqual(numeroDito({ valor: 2, rotulo: "startups" }, "eu trabalho em duas startups"), { valor: 2, rotulo: "startups" });
  assert.equal(numeroDito({ valor: 30 }, "uma igreja pequenininha"), null);
  assert.deepEqual(numeroDito({ valor: 70, sufixo: "%" }, "70% das pessoas"), { valor: 70, sufixo: "%" });
  assert.equal(numeroDito({ valor: 12 }, "cresceu 70% no ano"), null);
});

test("fundo: sem o que é da camada e sem câmera", () => {
  const bloco = "Editorial paper-cutout collage, crumpled cream paper with fibre grain, torn letterpress newspaper fragments, serif black titles, dashed arrows, warm grain.";
  const p = promptDoFundoCombinado("A slow aerial view of towns, camera drifting slowly outward left and right, clouds passing.", "vista-aerea", { blocoDeEstilo: bloco });
  assert.doesNotMatch(p.split("Background plate")[0], /letterpress|titles|arrows|camera drifting/i);
  assert.match(p, /crumpled cream paper/);
  assert.match(p, /LOCKED-OFF STATIC CAMERA/);
  assert.equal(semOQueEDaCamada("a cork wall, connected by a single red thread, warm light"), "a cork wall, warm light");
  assert.equal(segundosDoFundo(3.5), 4);
  assert.equal(segundosDoFundo(5), 5);
});

const palavras = "eu estou aplicando nas empresas nos negócios na casa e na igreja que eu pastoreio".split(" ").map((texto, i) => ({ texto, inicio: i * 0.5, fim: i * 0.5 + 0.45 }));
const plano = (): PlanoDoDiretor => ({
  leitura: "",
  tema: { linguagem: "papel" },
  momentos: [{ id: "j1", peca: "camada-exata", de: "F0", ate: "F0/fim", props: { itens: [{ rotulo: "empresas" }, { rotulo: "negócios" }, { rotulo: "casa" }], fundo: "j1-fundo", ligacao: "fio", marcador: "alfinete" } }],
  insercoes: [{ id: "j1-fundo", de: "F0", ate: "F0/fim", briefing: "a cork wall with blank cards, warm light", midia: "video", combinada: true, segundos: 5 }],
  enfases: [],
});
const ctx = (insercoes: Record<string, { url: string; tipo: "imagem" | "video" }>) => ({ palavras, duracao: 8, largura: 1920, altura: 1080, tema: temaDoEstilo("vox", { acento: "#b3001b", escuro: "#111111", claro: "#f5f5f5" }), rosto: { x: 0.4, y: 0.12, w: 0.2, h: 0.36 }, comLegenda: false, logoUrl: null, insercoes, leitura: null });

test("resolvedor: com o vídeo, o fundo vira plano de inserção junto da camada", () => {
  const r = resolverPorComando(plano(), ctx({ "j1-fundo": { url: "https://x/fundo.mp4", tipo: "video" } }));
  const c = r.edicao.camadas.find((x) => x.peca === "camada-exata")!;
  assert.equal(c.props.comFundo, true);
  assert.equal(c.props.sobreAGravacao, undefined);
  const p = r.edicao.planos.filter((x) => x.tipo === "insercao");
  assert.equal(p.length, 1);
  assert.equal(p[0].midia, "j1-fundo");
  assert.equal(p[0].de, c.de);
  assert.equal(p[0].ate, c.ate);
});

test("resolvedor: sem o vídeo, a camada cai na folha sobre a gravação e nada vira plano", () => {
  const r = resolverPorComando(plano(), ctx({}));
  const c = r.edicao.camadas.find((x) => x.peca === "camada-exata")!;
  assert.equal(c.props.comFundo, false);
  assert.equal(c.props.sobreAGravacao, true);
  assert.equal(r.edicao.planos.filter((x) => x.tipo === "insercao").length, 0);
  assert.ok(r.avisos.some((a) => /não ficou pronto/.test(a)));
});

test("custo: a combinada paga só o vídeo de fundo", () => {
  assert.equal(custoPrevisto("combinada", "combinada", 5, false), 0.56);
  const e = estimarCusto(plano(), 60, 1.2);
  assert.equal(e.imagens, 0);
  assert.equal(e.videos, 1);
  assert.equal(e.usd, 0.56);
});
