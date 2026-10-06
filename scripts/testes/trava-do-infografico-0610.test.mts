// O estilo é perguntado antes (06/10/2026). O caso real: a campanha do
// Demandou de 06/10 (projeto sem modelo de arte escolhido e sem identidade
// aprovada) saiu com a imagem e o carrossel "aguardando a sua identidade
// visual", e o infográfico desenhado na família "colagem" herdada do estilo
// de VÍDEO Vox: a semana do vídeo só lia a trava para imagem e carrossel.
// E a regra do saldo: arte do feed sem saldo para, não troca de modelo calada.
// Nada aqui toca banco, IA paga ou rede: a composição é local e o fetch é falso.
// Rodar: npx tsx --test scripts/testes/trava-do-infografico-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { desenharInfografico, type ConteudoDoInfografico } from "@/lib/media/infographic";
import { ehIdentidadeNaoAprovada } from "@/lib/modelos-de-arte/identidade";
import { diaPedeArte, tipoGeraArte } from "@/lib/modelos-de-arte/espera-da-identidade";
import { ehSemSaldoDaOpenAI } from "@/lib/media/gpt-image";

const CONTEUDO: ConteudoDoInfografico = {
  title: "Marketing de conteúdo: IA assume para você focar no negócio",
  subtitle: "Automação com IA cuida da gravação à distribuição.",
  highlight: { value: "9,3 horas", label: "Tempo médio de trabalho diário" },
  sections: [
    { heading: "O tempo é seu maior ativo", stat: "9,3 horas por dia", body: "Perder o dia com marketing afasta você das vendas." },
    { heading: "Agentes de IA 24/7", body: "Um time de IA multiplica seu conteúdo." },
  ],
  keyNumbers: [{ value: "59%", label: "MPEs já usam IA" }],
};
const CORES = { acento: "#F26522", escuro: "#1e1f22", claro: "#f5f0ec" };

test("o infográfico é peça com arte: passa pela mesma trava da imagem e do carrossel", () => {
  assert.equal(tipoGeraArte("infographic"), true);
  assert.equal(tipoGeraArte("image"), true);
  assert.equal(tipoGeraArte("carousel"), true);
  assert.equal(tipoGeraArte("text"), false);
  assert.equal(diaPedeArte("infographic", false), true);
});

test("projeto sem identidade aprovada: o infográfico NÃO é desenhado (nenhum estilo escolhido sozinho)", async () => {
  await assert.rejects(
    desenharInfografico(CONTEUDO, "", "4:5", { estilo: "", paleta: "", marca: { familia: "colagem", cores: CORES, projectId: "cmu7hmu0j000004jrh2yc5udb", identidadeAprovada: false } }),
    (e: unknown) => ehIdentidadeNaoAprovada(e)
  );
});

test("com a identidade aprovada, o infográfico sai (composição local, sem custo)", async () => {
  const w = console.warn;
  console.warn = () => {};
  try {
    const url = await desenharInfografico(CONTEUDO, "", "4:5", { estilo: "", paleta: "", marca: { familia: "colagem", cores: CORES, projectId: "cmu7hmu0j000004jrh2yc5udb", identidadeAprovada: true } });
    assert.ok(url?.startsWith("data:image/jpeg;base64,"));
    assert.ok((url?.length ?? 0) > 10_000);
  } finally {
    console.warn = w;
  }
});

test("a semana do vídeo lê a trava para o infográfico e o deixa esperando antes de qualquer extração", () => {
  // Guarda de regressão no próprio código: o ramo do infográfico sem identidade
  // existe e vem antes do ramo que extrai e desenha.
  const fonte = readFileSync(join(process.cwd(), "lib", "media", "pecas-da-semana.ts"), "utf8");
  assert.match(fonte, /const marcaDoDia = tipoGeraArte\(formato\)/, "a marca do dia é lida para toda peça com arte");
  const espera = fonte.indexOf('formato === "infographic" && aguardandoIdentidade');
  const desenha = fonte.indexOf("extrairConteudoDoInfografico(fonte");
  assert.ok(espera > 0, "o ramo de espera do infográfico existe");
  assert.ok(desenha > espera, "a espera vem antes da extração paga");
  assert.match(fonte.slice(espera, desenha), /aguardandoIdentidade: true/);
});

test("arte do feed sem saldo na conta de imagem PARA: não cai calada em outro modelo", async () => {
  const chamadas: string[] = [];
  const fetchOriginal = globalThis.fetch;
  const chaveOriginal = process.env.OPENAI_API_KEY;
  const arteOriginal = process.env.IMAGEM_ARTE;
  process.env.OPENAI_API_KEY = "sk-teste";
  delete process.env.IMAGEM_ARTE; // o padrão da arte é a OpenAI
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url instanceof Request ? url.url : url);
    chamadas.push(u);
    if (u.includes("api.openai.com")) return new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }), { status: 429 });
    return new Response("{}", { status: 500 });
  }) as typeof fetch;
  const erro = console.error;
  const aviso = console.warn;
  console.error = () => {};
  console.warn = () => {};
  try {
    const { gerarImagem } = await import("@/lib/media/nano-banana");
    await assert.rejects(gerarImagem("a quiet desk", "4:5", "hd", { operation: "arte_teste" }), (e: unknown) => ehSemSaldoDaOpenAI(e));
    assert.ok(chamadas.some((c) => c.includes("api.openai.com")), "tentou a OpenAI");
    assert.ok(!chamadas.some((c) => /googleapis|generativelanguage|pollinations|higgsfield/i.test(c)), `não trocou de modelo: ${chamadas.join(", ")}`);
    // A segunda arte, dentro da janela sem saldo, também para (sem nem chamar).
    const antes = chamadas.length;
    await assert.rejects(gerarImagem("another desk", "4:5", "hd", { operation: "arte_teste" }), (e: unknown) => ehSemSaldoDaOpenAI(e));
    assert.equal(chamadas.length, antes);
  } finally {
    globalThis.fetch = fetchOriginal;
    console.error = erro;
    console.warn = aviso;
    if (chaveOriginal === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = chaveOriginal;
    if (arteOriginal !== undefined) process.env.IMAGEM_ARTE = arteOriginal;
  }
});
