// E7 da jornada (07/10): o texto em camada da receita da landing, liberado pelo Bruno.
//   - o texto do Claude é conferido em código: título curto, destaque dentro do título, sem travessão, item só com palavra da fala;
//   - cada item entra na palavra falada (menos 0,1 s), nunca a menos de 0,6 s do anterior;
//   - sobre a gravação o texto nunca cruza o rosto nem a faixa da legenda; na tela cheia fica no alto;
//   - a montagem só põe o texto quando o JEV não disse "sem", e a camada leva a passada do vidro.
// Rodar: npx tsx --test scripts/testes/jornada-e7-texto.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { conferirTexto } from "@/lib/media/jornada/textos";
import { ancoraDoTexto, temposDosItens } from "@/lib/media/jornada/montagem";

const cruza = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test("o texto do Claude é conferido em código", () => {
  const fala = "você tem que fazer vídeo, editar, postar e ainda pensar no concorrente";
  const t = conferirTexto({ titulo: "Tudo cai — nas suas costas.", destaque: "suas costas", itens: [{ texto: "Fazer vídeo", palavra: "vídeo" }, { texto: "Inventado", palavra: "foguete" }] }, fala)!;
  assert.ok(!t.titulo.includes("—"));
  assert.equal(t.destaque, "suas costas");
  assert.deepEqual(t.itens.map((i) => i.texto), ["Fazer vídeo"]);
  assert.equal(conferirTexto({ titulo: "um título comprido demais que passa de nove palavras e não serve" }, fala), null);
  assert.equal(conferirTexto({ titulo: "Curto", destaque: "fora" }, fala)!.destaque, "");
});

test("cada item entra na palavra falada", () => {
  const palavras = [
    { texto: "vídeo,", inicio: 1.0, fim: 1.3 },
    { texto: "editar,", inicio: 1.4, fim: 1.8 },
    { texto: "postar", inicio: 3.0, fim: 3.4 },
  ];
  const r = temposDosItens([{ texto: "A", palavra: "editar" }, { texto: "B", palavra: "postar" }, { texto: "C", palavra: "nada" }], palavras, 0, 10);
  assert.deepEqual(r, [{ texto: "A", t: 1.3 }, { texto: "B", t: 2.9 }]);
});

test("o texto sobre a gravação não cruza o rosto nem a legenda", () => {
  const rosto = { x: 0.3, y: 0.5, w: 0.4, h: 0.17 };
  const caixa = { x: 0.08, y: 0.12, w: 0.8, h: 0.16 };
  const a = ancoraDoTexto({ formato: "9:16", W: 1080, H: 1920, caixa, protegidas: [rosto], legenda: [0.68, 0.83], nItens: 2 })!;
  // A altura do texto com os itens que couberam (a mesma conta da montagem).
  const u = 1.3;
  const h = (50 * u * 1.06 * 2 + 44 * u + a.itens * (34 * u * 1.15 + 44 * u)) / 1920;
  assert.ok(!cruza({ x: a.x, y: a.y, w: a.w, h }, rosto), JSON.stringify(a));
  assert.ok(a.y >= 0.1 - 1e-9);
  // Nunca por cima da própria mídia.
  assert.ok(!cruza({ x: a.x, y: a.y, w: a.w, h }, caixa));
  // Rosto logo abaixo da mídia, sem lugar ao lado dela: o texto fica fora.
  assert.equal(ancoraDoTexto({ formato: "9:16", W: 1080, H: 1920, caixa, protegidas: [{ x: 0.3, y: 0.32, w: 0.4, h: 0.3 }], legenda: [0.68, 0.83], nItens: 0 }), null);
  const cheia = ancoraDoTexto({ formato: "9:16", W: 1080, H: 1920, caixa: null, protegidas: [], legenda: [0.68, 0.83], nItens: 3 })!;
  assert.ok(cheia.y < 0.15 && cheia.itens === 3);
  // Sem lugar nenhum fora do rosto: o texto fica fora.
  assert.equal(ancoraDoTexto({ formato: "9:16", W: 1080, H: 1920, caixa, protegidas: [{ x: 0, y: 0, w: 1, h: 1 }], legenda: null, nItens: 1 }), null);
});

test("gráfico (07/10): ícones iguais ao worker, lugar fora do rosto e da legenda, número só se dito", async () => {
  const { readFileSync } = await import("node:fs");
  const { NOMES_DOS_ICONES } = await import("@/lib/media/jornada/icones");
  const { lugarDoGrafico } = await import("@/lib/media/jornada/montagem");
  const w = readFileSync("worker/remotion/src/sob-medida/icones.ts", "utf8");
  assert.deepEqual([...NOMES_DOS_ICONES], Object.keys(JSON.parse(w.slice(w.indexOf("= {") + 2, w.lastIndexOf("};") + 1))));
  const rosto = { x: 0.25, y: 0.12, w: 0.5, h: 0.3 };
  const l = lugarDoGrafico({ formato: "9:16", W: 1080, H: 1920, protegidas: [rosto], legenda: [0.68, 0.83], nItens: 2, grande: true })!;
  assert.ok(l && l.y >= rosto.y + rosto.h, `o gráfico precisa ficar abaixo do rosto: ${JSON.stringify(l)}`);
  assert.ok(l.y + 0.05 < 0.68);
  const fala = "a gente trabalha 24 horas por dia";
  assert.equal(conferirTexto({ titulo: "Sem pausa", numero: "24h", tipo: "cronometro", icone: "relogio" }, fala)!.numero, "24h");
  assert.equal(conferirTexto({ titulo: "Sem pausa", numero: "88%" }, fala)!.numero, undefined, "número não dito sai");
  assert.equal(conferirTexto({ titulo: "Sem pausa", icone: "inventado" }, fala)!.icone, undefined);
});
