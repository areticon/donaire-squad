// A prova da tarefa D (06/10/2026): as cinco peças vetoriais do editor por comando.
//   - cada tipo novo tem critério para o JEV, nome para o cliente, duração, variante, componente e ficha do redator;
//   - o worker desenha cada peça pelo mesmo nome (Camadas.tsx) e o catálogo de ícones do app espelha o do worker;
//   - a caixa nunca cobre o rosto: abaixo do queixo no 9:16, o título acima da cabeça, do lado livre no 16:9;
//   - o ícone: o redator sugere, o JEV escolhe entre os candidatos do catálogo; nome inventado nunca chega ao worker.
// Nada aqui toca banco, IA paga ou rede.
// Rodar: npx tsx --test scripts/testes/pecas-vetoriais-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CRITERIO_DO_TIPO, DURACAO_DO_TIPO, NOME_DO_TIPO, TIPOS_DECIDIVEIS, TIPOS_VETORIAIS, varianteDo } from "@/lib/media/editor-por-comando/elementos";
import { FAMILIAS, componenteDa } from "@/lib/media/editor-por-comando/linguagem";
import { FICHAS } from "@/lib/media/editor-sob-medida/pecas";
import { caixaDaVetorial, TAMANHO_DAS_VETORIAIS } from "@/lib/media/editor-por-comando/caixa-das-vetoriais";
import { ICONES_DE_LINHA } from "@/lib/media/editor-por-comando/icones-de-linha";
import { candidatosDoIcone, escolherIconesPeloJev } from "@/lib/media/editor-por-comando/icone-pelo-jev";
import type { perguntarAoJev } from "@/lib/jev/cliente";

const TRAVESSAO = /[—–]/;

test("cada tipo vetorial está inteiro no catálogo, em toda família", () => {
  assert.equal(TIPOS_VETORIAIS.length, 5);
  for (const t of TIPOS_VETORIAIS) {
    assert.ok(TIPOS_DECIDIVEIS.includes(t as never), `${t} decidível`);
    assert.ok(CRITERIO_DO_TIPO[t] && !TRAVESSAO.test(CRITERIO_DO_TIPO[t]), `${t} critério`);
    assert.ok(NOME_DO_TIPO[t]);
    assert.ok(DURACAO_DO_TIPO[t as keyof typeof DURACAO_DO_TIPO]);
    const v = varianteDo(t, "qualquer fala");
    assert.equal(v, t);
    for (const f of FAMILIAS) {
      const peca = componenteDa(f.id, v!);
      assert.equal(peca, t, `${f.id} desenha ${t} com a peça própria`);
      const ficha = FICHAS[peca!];
      assert.ok(ficha, `ficha de ${peca}`);
      assert.ok(!TRAVESSAO.test(ficha.quando + ficha.props), `${peca} sem travessão`);
    }
    assert.ok(TAMANHO_DAS_VETORIAIS[t], `${t} tem caixa`);
  }
});

test("o worker desenha cada peça pelo mesmo nome e o catálogo de ícones é o mesmo", () => {
  const camadas = readFileSync("worker/remotion/src/sob-medida/Camadas.tsx", "utf8");
  for (const t of TIPOS_VETORIAIS) assert.ok(camadas.includes(`"${t}":`), `Camadas.tsx registra ${t}`);
  const doWorker = new Set<string>();
  for (const arq of ["icones.ts", "icones-de-linha.ts"]) {
    const src = readFileSync(`worker/remotion/src/sob-medida/${arq}`, "utf8");
    const obj = src.match(/: Record<string, NoDoIcone\[\]> = (\{.*\});/)![1];
    for (const k of Object.keys(JSON.parse(obj))) doWorker.add(k);
  }
  assert.deepEqual([...doWorker].sort(), Object.keys(ICONES_DE_LINHA).sort());
  for (const n of ["despertador", "tv-desligada", "tesoura", "claquete", "robo", "celular"]) assert.ok(ICONES_DE_LINHA[n], n);
});

const cruza = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("a caixa nunca cobre o rosto: abaixo no 9:16, o título acima, do lado livre no 16:9", () => {
  const rosto = { x: 0.32, y: 0.3, w: 0.44, h: 0.38 };
  for (const t of TIPOS_VETORIAIS) {
    const c = caixaDaVetorial(t, { vertical: true, rosto });
    assert.ok(c, `${t} cabe no 9:16`);
    assert.ok(!cruza(c!, rosto), `${t} não cobre o rosto`);
    assert.ok(c!.y + c!.h <= 1 && c!.x >= 0 && c!.x + c!.w <= 1, `${t} dentro do quadro`);
    if (t === "titulo-em-caixa") assert.ok(c!.y + c!.h <= rosto.y, "o título fica acima da cabeça");
    else assert.ok(c!.y >= rosto.y + rosto.h, `${t} fica abaixo do rosto`);
    assert.ok(Math.abs(c!.x + c!.w / 2 - 0.5) < 0.01, `${t} centrada no 9:16`);
    const h = caixaDaVetorial(t, { vertical: false, rosto: { x: 0.2, y: 0.15, w: 0.25, h: 0.45 } });
    assert.ok(h && !cruza(h, { x: 0.2, y: 0.15, w: 0.25, h: 0.45 }), `${t} no 16:9 sem cobrir o rosto`);
  }
  // Rosto enorme ocupando o quadro: não há lugar, a peça sai (null), nunca por cima.
  assert.equal(caixaDaVetorial("icone-com-frase", { vertical: true, rosto: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 } }), null);
});

test("o ícone: candidatos do catálogo, o JEV escolhe, nome inventado não passa", async () => {
  assert.deepEqual(candidatosDoIcone("nao-existe", ["despertador"], "").slice(0, 1), ["despertador"]);
  assert.ok(candidatosDoIcone(null, null, "ponha um alarme para dormir cedo").includes("cama") || candidatosDoIcone(null, null, "dormir").includes("cama"));
  const textos: Record<string, Record<string, unknown>> = {
    j1: { frase: "Ponha um alarme para dormir", icone: "despertador", iconesAlternativos: ["cama", "lua", "inventado"] },
    j2: { itens: [{ titulo: "Gravar", icone: "claquete" }, { titulo: "Editar", icone: "inventado" }] },
    j3: { frase: "Sem ícone que preste", icone: "xyz" },
  };
  const perguntas: string[] = [];
  const jev = (async (_ctx, qs) => {
    perguntas.push(...Object.keys(qs));
    for (const q of Object.values(qs)) if (q.type === "choice") assert.ok(Object.keys(q.criteria).every((n) => ICONES_DE_LINHA[n]), "só nomes do catálogo vão ao JEV");
    return { icone_j1: { type: "choice", choice: "cama", probabilities: { cama: 0.8 }, confidence: 0.8 } };
  }) as typeof perguntarAoJev;
  await escolherIconesPeloJev(
    [
      { id: "j1", peca: "icone-com-frase", fala: "ponha um alarme para dormir" },
      { id: "j2", peca: "cartoes-em-linha", fala: "gravar e editar" },
      { id: "j3", peca: "icone-com-frase", fala: "zzz qqq" },
    ],
    textos,
    jev,
    { nicho: "produtividade" }
  );
  assert.ok(perguntas.includes("icone_j1"));
  assert.equal(textos.j1.icone, "cama", "o JEV escolheu");
  assert.equal(textos.j1.iconesAlternativos, undefined);
  const itens = textos.j2.itens as Array<Record<string, unknown>>;
  assert.equal(itens[0].icone, "claquete");
  assert.ok(itens[1].icone === undefined || ICONES_DE_LINHA[String(itens[1].icone)], "nome inventado não chega ao worker");
  assert.ok(textos.j3.icone === undefined || ICONES_DE_LINHA[String(textos.j3.icone)]);
});
