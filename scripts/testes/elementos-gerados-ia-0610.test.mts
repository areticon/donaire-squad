// A prova dos ELEMENTOS GERADOS POR IA e de CADA EDIÇÃO É ALGO NOVO (06/10/2026, noite).
//   - nenhuma peça vetorial desenhada em código no catálogo nem no worker;
//   - a escolha do elemento segue com o JEV (os tipos continuam decidíveis, o critério diz "gerado por IA");
//   - o prompt leva o texto exato entre aspas, o logo oficial de cada marca citada, as cores em hex, fundo liso e "no misspellings";
//   - sem o prompt do redator não há molde: o elemento não é gerado; prompt repetido entre momentos não é gerado de novo;
//   - a conferência simulada (fora da jornada, ligável): erro refaz uma vez, persistiu troca; sem o olho, entra direto;
//   - a caixa respeita a margem segura (nada nos 10% de cima, nada a menos de 4% da borda);
//   - nome único por geração e nenhum reaproveitamento de mídia gerada.
// Nada aqui toca banco, IA paga ou rede.
// Rodar: npx tsx --test scripts/testes/elementos-gerados-ia-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { CRITERIO_DO_TIPO, TIPOS_DECIDIVEIS, TIPOS_DE_ELEMENTO, TIPOS_GERADOS, custoPrevisto } from "@/lib/media/editor-por-comando/elementos";
import * as elementos from "@/lib/media/editor-por-comando/elementos";
import { FICHAS } from "@/lib/media/editor-sob-medida/pecas";
import { caixaDaVetorial, TAMANHO_DAS_VETORIAIS } from "@/lib/media/editor-por-comando/caixa-das-vetoriais";
import {
  TIPOS_GERADOS_POR_IA,
  custoDoElemento,
  gerarElemento,
  marcasCitadas,
  montarPromptDoElemento,
  prepararElementosGerados,
  textosExatos,
  type DependenciasDoElemento,
} from "@/lib/media/editor-por-comando/elemento-gerado";
import { GRAVACAO_UNICA, chaveDaGeracao, nomeUnico } from "@/lib/media/geracao-unica";
import { guardaDoRecorteNoBlob } from "@/lib/media/editor-sob-medida/recortes-vox";
import type { perguntarAoJev } from "@/lib/jev/cliente";

const TRAVESSAO = new RegExp("[\\u2014]");
const cores = { acento: "#FF5A1F", escuro: "#121212", claro: "#F4F1EA" };

test("nenhuma peça vetorial em código: o catálogo e o worker só posicionam a imagem gerada", () => {
  assert.equal((elementos as Record<string, unknown>).TIPOS_VETORIAIS, undefined, "TIPOS_VETORIAIS saiu do catálogo");
  assert.deepEqual([...TIPOS_GERADOS].sort(), [...TIPOS_GERADOS_POR_IA].sort());
  assert.ok(!existsSync("worker/remotion/src/sob-medida/pecas/vetoriais.tsx"), "o desenho em código saiu do worker");
  assert.ok(!existsSync("worker/remotion/src/sob-medida/icones-de-linha.ts"), "os 76 ícones lucide saíram do worker");
  const camadas = readFileSync("worker/remotion/src/sob-medida/Camadas.tsx", "utf8");
  assert.ok(!/pecas\/vetoriais/.test(camadas));
  for (const t of TIPOS_GERADOS_POR_IA) assert.match(camadas, new RegExp(`"${t}": ElementoGerado`), `${t} só posiciona a imagem`);
  const gerado = readFileSync("worker/remotion/src/sob-medida/pecas/gerado.tsx", "utf8");
  assert.ok(!/<svg|<path|ICONES/.test(gerado), "o componente não desenha nada");
  for (const t of TIPOS_GERADOS_POR_IA) {
    assert.match(FICHAS[t].quando, /gerado por IA/, `${t}: a ficha do redator diz gerado por IA`);
    assert.match(FICHAS[t].props, /prompt \(EM INGLÊS/, `${t}: o redator escreve o prompt`);
    assert.ok(!/icone \(o nome do catálogo/.test(FICHAS[t].props), `${t}: sem catálogo de ícone em código`);
    assert.ok(!TRAVESSAO.test(FICHAS[t].quando + FICHAS[t].props + CRITERIO_DO_TIPO[t]));
  }
});

test("a escolha do elemento continua com o JEV: os tipos gerados são decidíveis e custam a imagem e o recorte", () => {
  for (const t of TIPOS_GERADOS) {
    assert.ok(TIPOS_DE_ELEMENTO.includes(t) && TIPOS_DECIDIVEIS.includes(t as never), `${t} decidível`);
    assert.match(CRITERIO_DO_TIPO[t], /gerad[oa]s? por IA/);
    assert.equal(custoPrevisto(t, t as never, 4, false), custoDoElemento());
  }
  assert.equal(custoDoElemento(), 0.063, "US$ 0,06 da imagem e 0,003 do recorte");
  assert.equal(custoDoElemento(undefined, true), 0.065, "com a conferência ligada, mais o olho");
});

test("o prompt: texto exato entre aspas, logo oficial das marcas, cores em hex, fundo liso, sem erro de grafia", () => {
  const props = {
    itens: [{ titulo: "YouTube" }, { titulo: "Instagram" }, { titulo: "TikTok" }],
    marcas: ["YouTube", "Instagram", "TikTok"],
    prompt: "A horizontal row of three glossy rounded cards, each with one official social network logo large on top and its name below in bold white.",
  };
  assert.deepEqual(textosExatos("cartoes-em-linha", props), ["YouTube", "Instagram", "TikTok"]);
  assert.deepEqual(marcasCitadas(props).sort(), ["Instagram", "TikTok", "YouTube"]);
  const p = montarPromptDoElemento({ peca: "cartoes-em-linha", props, cores });
  for (const t of ['"YouTube"', '"Instagram"', '"TikTok"']) assert.ok(p.includes(t), `texto exato ${t}`);
  for (const l of ["official YouTube logo", "official Instagram logo", "official TikTok logo"]) assert.ok(p.includes(l), l);
  for (const h of Object.values(cores)) assert.ok(p.includes(h), `cor ${h}`);
  assert.match(p, /plain flat solid #[0-9A-F]{6} background/i);
  assert.match(p, /no misspellings/);
  assert.match(p, /high resolution/i);
  assert.ok(p.startsWith(props.prompt), "a composição é a do redator");
  // Acento e destaque: o texto vai como a fala diz, sem os asteriscos de destaque.
  const t = montarPromptDoElemento({ peca: "titulo-em-caixa", props: { texto: "Hábitos que **ninguém** te ensina", prompt: "One wide rounded title box in bold clean sans serif typography." }, cores });
  assert.ok(t.includes('"Hábitos que ninguém te ensina"'));
  // A comparação leva os rótulos e cada par.
  assert.deepEqual(textosExatos("comparacao-lado-a-lado", { pares: [{ nao: "Desculpa", sim: "Obrigado" }] }), ["Não diga", "Diga", "Desculpa", "Obrigado"]);
  // A marca dita na fala também entra, mesmo fora da lista do redator.
  assert.deepEqual(marcasCitadas({ frase: "Poste todo dia" }, "eu posto no youtube e no linkedin"), ["YouTube", "LinkedIn"]);
  assert.ok(!TRAVESSAO.test(p));
});

const png = Buffer.from("png");
function deps(o: { leituras?: string[]; logos?: string[][]; juiz?: typeof perguntarAoJev | null; semOlho?: boolean } = {}) {
  const chamadas = { gerar: [] as string[], recortar: 0, olhar: 0, gravar: [] as string[] };
  let k = 0;
  const d: DependenciasDoElemento = {
    gerar: async (prompt) => {
      chamadas.gerar.push(prompt);
      return { png, custoUsd: 0.06, modelo: "higgsfield-gpt-image-2.5-medium" };
    },
    recortar: async (b) => {
      chamadas.recortar++;
      return { png: b, custoUsd: 0.003 };
    },
    olhar: o.semOlho
      ? null
      : async () => {
          chamadas.olhar++;
          const i = k++;
          return { json: { textoLido: o.leituras?.[i] ?? "", logosVistos: o.logos?.[i] ?? [], colagem: false, cortadoNaBorda: false, fundoLiso: true, defeitos: "" }, custoUsd: 0.002 };
        },
    juiz: o.juiz ?? null,
    gravar: async (_b, momento) => {
      const u = nomeUnico("editor-elementos", { video: "cmux4417u000004l56g3x5urx", momento, ext: "webp" });
      chamadas.gravar.push(u);
      return u;
    },
    medir: async () => 2,
  };
  return { d, chamadas };
}

const momento = { id: "m1", peca: "cartoes-em-linha", props: { itens: [{ titulo: "YouTube" }, { titulo: "Instagram" }], marcas: ["YouTube", "Instagram"], prompt: "Two rounded cards side by side, each with the official logo large on top and the name below." } };

test("conferência simulada: grafia errada refaz uma vez com a correção; certo na segunda, entra", async () => {
  const { d, chamadas } = deps({ leituras: ["YuoTube | Instagran", "YouTube | Instagram"], logos: [["YouTube"], ["YouTube", "Instagram"]] });
  const r = await gerarElemento(momento, { cores, formato: "9:16", deps: d });
  assert.equal(r.decisao, "aprovar");
  assert.equal(r.rodadas, 2);
  assert.equal(chamadas.gerar.length, 2);
  assert.match(chamadas.gerar[1], /FIX FROM THE PREVIOUS ATTEMPT/);
  assert.match(chamadas.gerar[1], /official logos of Instagram/);
  assert.ok(r.url && r.proporcao === 2);
  assert.equal(r.custoUsd, +(2 * (0.06 + 0.003 + 0.002)).toFixed(4));
});

test("conferência simulada: o erro persiste, o elemento sai (o JEV troca); o JEV decide quando está ligado", async () => {
  const a = deps({ leituras: ["YuoTube", "YuoTube"], logos: [[], []] });
  const r = await gerarElemento(momento, { cores, formato: "9:16", deps: a.d });
  assert.equal(r.decisao, "trocar");
  assert.equal(r.url, null);
  assert.equal(a.chamadas.gravar.length, 0, "nada gravado");
  // O JEV aprova a primeira mesmo com o fato duvidoso: vale a decisão dele.
  const perguntas: string[] = [];
  const juiz = (async (_c, qs) => {
    perguntas.push(...Object.keys(qs));
    return { e: { type: "choice", choice: "aprovar", probabilities: { aprovar: 0.9 }, confidence: 0.9 } };
  }) as typeof perguntarAoJev;
  const b = deps({ leituras: ["YouTube Instagram"], logos: [["YouTube"]], juiz });
  const r2 = await gerarElemento(momento, { cores, formato: "9:16", deps: b.d });
  assert.equal(r2.decisao, "aprovar");
  assert.match(r2.porQue, /JEV/);
  assert.deepEqual(perguntas, ["e"]);
});

test("a jornada oficial: sem o olho, o elemento entra direto (a revisão é do usuário); sem prompt do redator, não há molde", async () => {
  const a = deps({ semOlho: true });
  const r = await gerarElemento(momento, { cores, formato: "16:9", deps: a.d });
  assert.equal(r.decisao, "aprovar");
  assert.equal(a.chamadas.olhar, 0);
  assert.equal(r.custoUsd, 0.063);
  const b = deps({ semOlho: true });
  const sem = await gerarElemento({ ...momento, props: { itens: [{ titulo: "YouTube" }] } }, { cores, formato: "9:16", deps: b.d });
  assert.equal(sem.url, null);
  assert.equal(b.chamadas.gerar.length, 0, "sem o prompt do redator nada é pedido");
});

test("o plano: cada elemento é próprio do momento; o que não saiu deixa o plano; teto rígido", async () => {
  const { d, chamadas } = deps({ semOlho: true });
  const plano = {
    momentos: [
      { ...momento, id: "a", props: { ...momento.props } },
      { ...momento, id: "b", props: { ...momento.props } }, // prompt igual ao de "a"
      { id: "c", peca: "titulo-em-caixa", props: { texto: "Três erros" } }, // sem prompt
      { id: "d", peca: "frase-chave", props: { texto: "fica como está" } },
    ],
  };
  const r = await prepararElementosGerados(plano, { cores, formato: "9:16", deps: d });
  assert.deepEqual(r.plano.momentos!.map((m) => m.id).sort(), ["a", "d"]);
  assert.deepEqual(r.removidos.sort(), ["b", "c"]);
  assert.equal(chamadas.gerar.length, 1);
  assert.ok(String((r.plano.momentos!.find((m) => m.id === "a")!.props as Record<string, unknown>).imagem).startsWith("editor-elementos/cmux4417u000004l56g3x5urx-a-"));
  const t = deps({ semOlho: true });
  const muitos = { momentos: Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, peca: "icone-com-frase", props: { frase: `Regra ${i}`, prompt: `A rounded card with a large detailed icon number ${i} and the phrase below.` } })) };
  const r2 = await prepararElementosGerados(muitos, { cores, formato: "9:16", deps: t.d, tetoUsd: 1 });
  assert.ok(r2.custoUsd <= 1, `teto respeitado (${r2.custoUsd})`);
  assert.equal(t.chamadas.gerar.length, Math.floor(1 / 0.063));
});

test("a margem segura: nada nos 10% de cima, nada a menos de 4% da borda, nunca no rosto", () => {
  const rosto = { x: 0.32, y: 0.22, w: 0.44, h: 0.36 };
  for (const t of Object.keys(TAMANHO_DAS_VETORIAIS)) {
    for (const vertical of [true, false]) {
      const c = caixaDaVetorial(t, { vertical, rosto: vertical ? rosto : { x: 0.2, y: 0.15, w: 0.25, h: 0.45 } });
      if (!c) continue;
      assert.ok(c.y >= 0.1, `${t} fora dos 10% de cima (${c.y})`);
      assert.ok(c.x >= 0.04 && c.x + c.w <= 0.96 + 1e-9 && c.y + c.h <= 0.96 + 1e-9, `${t} longe da borda`);
    }
  }
});

test("cada edição é algo novo: nome único por geração e nenhum reaproveitamento de mídia gerada", async () => {
  const nomes = new Set(Array.from({ length: 200 }, () => nomeUnico("insercao", { video: "v1", momento: "m1", ext: "png" })));
  assert.equal(nomes.size, 200, "o mesmo momento do mesmo vídeo nunca repete o nome");
  assert.notEqual(chaveDaGeracao("fundo-abc"), chaveDaGeracao("fundo-abc"));
  assert.deepEqual(GRAVACAO_UNICA, { addRandomSuffix: true });
  assert.equal(await guardaDoRecorteNoBlob().ler("rec-qualquer"), null, "a foto do Vox de outra edição nunca volta");
  const fonte = (f: string) => readFileSync(f, "utf8");
  const ins = fonte("lib/media/editor-sob-medida/index.ts");
  assert.ok(!/insercao-\$\{createHash/.test(ins) && /GRAVACAO_UNICA/.test(ins), "a inserção não usa mais o hash do prompt");
  const broll = fonte("lib/media/editor-sob-medida/broll.ts");
  assert.match(broll, /gerado \? null : await guarda\.ler\(chave\)/, "B-roll gerado nunca sai do cache");
  assert.match(broll, /chaveDaGeracao\(`broll-pro-/);
  assert.match(fonte("lib/media/editor-por-comando/combinada.ts"), /chaveDaGeracao\(`fundo-/);
  const assets = fonte("lib/media/assets-da-montagem.ts");
  assert.ok(!/origem: "reaproveitado", custoEstimadoUsd: 0 };\n        }\n        try/.test(assets));
  assert.ok(!/const existe = await jaGuardado\(caminho\);\n        if \(existe\) \{\n          if \(a\.tipo === "elemento"\)/.test(assets), "o asset gerado não volta pelo hash");
  assert.match(fonte("lib/media/higgsfield.ts"), /contentType: "video\/mp4",\n\s+\/\/ CADA EDIÇÃO É ALGO NOVO[^\n]*\n\s+addRandomSuffix: true,/);
  assert.match(fonte("lib/media/editor-por-comando/elemento-gerado-servidor.ts"), /GRAVACAO_UNICA/);
});
