// A paleta salva como fonte única da identidade e o book sem repetição (06/10/2026).
// O caso real: o projeto Demandou salvou "#F97316,#1e1f22,#dbdee1" em
// Configurações, igual ao padrão da plataforma, e a identidade mostrava as
// cores do setor (âmbar, azul-marinho, cinza-azulado). Tudo puro: nada aqui
// toca banco, IA, rede ou imagem paga.
// Rodar: npx tsx --test scripts/testes/paleta-e-book-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { identidadeDe, PALETA_PADRAO_DA_PLATAFORMA } from "@/lib/media/identidade-visual";
import { identidadeAprovada, opcoesDoPapel, paletaParaOsPapeis, papeisNaPaleta, papeisPadrao } from "@/lib/modelos-de-arte/identidade";
import { MODELOS_DE_ARTE, USOS_DOS_MODELOS, agruparPorUso, usoDoModelo } from "@/lib/modelos-de-arte/catalogo";
import { foraDoBook } from "@/lib/biblioteca-de-design/tipos";

const SALVA = "#F97316,#1e1f22,#dbdee1";
const SETOR_ENERGIA = { acento: "#F2B33D", escuro: "#0D2A3F", claro: "#EEF3F6" };

test("fonte única: a paleta salva manda nos papéis, mesmo igual ao padrão da plataforma", () => {
  assert.equal(SALVA.toLowerCase(), PALETA_PADRAO_DA_PLATAFORMA.toLowerCase());
  assert.deepEqual(paletaParaOsPapeis(SALVA, SETOR_ENERGIA), ["#f97316", "#1e1f22", "#dbdee1"]);
});

test("fonte única: sem paleta salva, entram as cores efetivas (manual, logo ou setor)", () => {
  assert.deepEqual(paletaParaOsPapeis(null, SETOR_ENERGIA), ["#f2b33d", "#0d2a3f", "#eef3f6"]);
  assert.deepEqual(paletaParaOsPapeis("", SETOR_ENERGIA), ["#f2b33d", "#0d2a3f", "#eef3f6"]);
});

test("fonte única: a identidade efetiva (arte e book) também vem da paleta salva", async () => {
  const i = await identidadeDe({ name: "Demandou", niche: "energia solar e usinas", colorPalette: SALVA, textosDaMarca: ["Cor principal #ef6122, apoio #d97706"] });
  assert.equal(i.origemDasCores, "configuracao");
  assert.equal(i.cores.acento.toLowerCase(), "#f97316");
  const sem = await identidadeDe({ name: "X", niche: "energia solar e usinas", colorPalette: null });
  assert.equal(sem.origemDasCores, "setor");
});

test("papéis gravados fora da paleta caem no padrão dela, e a aprovação cai", () => {
  const paleta = ["#f97316", "#1e1f22", "#dbdee1"];
  const gravados = { fundo: "#211a17", titulo: "#f6f1ee", destaque: "#ef6122" };
  const r = papeisNaPaleta(gravados, paleta);
  assert.equal(r.mudou, true);
  assert.deepEqual(r.papeis, papeisPadrao(paleta));
  const registro = { letra: "moderna" as const, papeis: gravados, aprovadaEm: "2026-10-06T20:08:15.520Z" };
  assert.equal(identidadeAprovada(registro, ["tipografia-gigante"], paleta), false);
});

test("trocar a paleta sem tirar as cores aprovadas não pede aprovação de novo", () => {
  const papeis = { fundo: "#1e1f22", titulo: "#ffffff", destaque: "#f97316" };
  const r = papeisNaPaleta(papeis, ["#f97316", "#1e1f22", "#dbdee1", "#22c55e"]);
  assert.equal(r.mudou, false);
  assert.deepEqual(r.papeis, papeis);
  assert.equal(identidadeAprovada({ letra: "moderna", papeis, aprovadaEm: "2026-10-06T00:00:00Z" }, ["tipografia-gigante"], ["#F97316", "#1e1f22"]), true);
});

test("gravação da escolha: a cor clicada que está na paleta fica exatamente como clicada", () => {
  const paleta = ["#f97316", "#1e1f22", "#dbdee1"];
  const clicado = { fundo: "#dbdee1", titulo: "#1e1f22", destaque: "#f97316" };
  assert.deepEqual(papeisNaPaleta(clicado, paleta), { papeis: clicado, mudou: false });
  // Só o papel com cor fantasma (tela velha) troca; os outros ficam.
  const r = papeisNaPaleta({ ...clicado, destaque: "#ef6122" }, paleta);
  assert.equal(r.papeis.fundo, "#dbdee1");
  assert.equal(r.papeis.titulo, "#1e1f22");
  assert.ok(paleta.includes(r.papeis.destaque));
});

test("as bolinhas oferecem só a paleta salva (o título também branco e quase preto)", () => {
  const paleta = paletaParaOsPapeis(SALVA, SETOR_ENERGIA);
  assert.deepEqual(opcoesDoPapel("fundo", paleta), ["#f97316", "#1e1f22", "#dbdee1"]);
  assert.deepEqual(opcoesDoPapel("destaque", paleta), ["#f97316", "#1e1f22", "#dbdee1"]);
  assert.deepEqual(opcoesDoPapel("titulo", paleta), ["#f97316", "#1e1f22", "#dbdee1", "#ffffff", "#141414"]);
});

test("book: nenhum modelo repetido, cada um em exatamente um uso", () => {
  const ids = MODELOS_DE_ARTE.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "id repetido no catálogo");
  const grupos = agruparPorUso(MODELOS_DE_ARTE);
  const naTela = grupos.flatMap((g) => g.modelos.map((m) => m.id));
  assert.equal(naTela.length, ids.length);
  assert.equal(new Set(naTela).size, naTela.length);
  // Todo modelo do catálogo cai num uso com nome (nenhum em "Outros").
  for (const m of MODELOS_DE_ARTE) assert.notEqual(usoDoModelo(m).id, "outros", `${m.id} (${m.categoria}) sem uso`);
  // Cada categoria pertence a um uso só.
  const cats = USOS_DOS_MODELOS.flatMap((u) => u.categorias);
  assert.equal(new Set(cats).size, cats.length);
  // A mesma lista com um id duplicado ainda sai uma vez.
  const dobrada = agruparPorUso([...MODELOS_DE_ARTE, MODELOS_DE_ARTE[0]]).flatMap((g) => g.modelos);
  assert.equal(dobrada.length, ids.length);
});

test("book e biblioteca na mesma aba: os modelos de imagem do book não aparecem de novo", () => {
  const idsDoBook = MODELOS_DE_ARTE.map((m) => m.id);
  const designs = [
    { id: "a", tipo: "imagem" as const, catalogoId: idsDoBook[0] },
    { id: "b", tipo: "imagem" as const, catalogoId: null },
    { id: "c", tipo: "video" as const, catalogoId: "consorcio" },
    { id: "d", tipo: "imagem" as const, catalogoId: "modelo-que-nao-existe" },
  ];
  assert.deepEqual(foraDoBook(designs, idsDoBook).map((d) => d.id), ["b", "c", "d"]);
  assert.equal(foraDoBook(designs, null).length, 4);
});
