// A prova da fonte única das redes do cliente (06/10/2026, pedido do Bruno:
// "se preencher a parte de cima, os links das redes já devem ficar salvos"):
//   - o que o cliente escreve em cada rede é arrumado do mesmo jeito na tela,
//     na rota e nas descrições (`normalizarEnderecoDaRede`);
//   - a prioridade é uma só: o escrito em `config.redesDoCliente`, depois o @
//     do YouTube do campo antigo (`config.arrobaDoYouTube`), depois o que a
//     conexão da rede trouxe;
//   - rede escrita sem conexão entra nas descrições; LinkedIn e Facebook (só
//     link) ficam fora de onde link não vai;
//   - o PATCH do projeto não apaga as redes (a chave é protegida).
// Nada aqui toca banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/redes-fonte-unica-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAVES_DOS_LINKS_NO_CONFIG,
  ERRO_DO_ENDERECO,
  enderecoDaRede,
  lerRedesEscritas,
  normalizarEnderecoDaRede,
  valorNoCampo,
} from "@/lib/projeto/links-do-cliente";
import { blocoDeLinksDaDescricao, nomeDoCanal, perfisDoCliente } from "@/lib/media/elo-da-campanha";

const TRAVESSAO = /[—–]/;

test("cada rede é arrumada do mesmo jeito, venha como vier", () => {
  assert.equal(normalizarEnderecoDaRede("instagram", "@PrDonaire"), "prdonaire");
  assert.equal(normalizarEnderecoDaRede("instagram", "https://www.instagram.com/prdonaire/?hl=pt"), "prdonaire");
  assert.equal(normalizarEnderecoDaRede("instagram", "instagram.com/prdonaire"), "prdonaire");
  assert.equal(normalizarEnderecoDaRede("tiktok", "tiktok.com/@bruno.donaire"), "bruno.donaire");
  assert.equal(normalizarEnderecoDaRede("youtube", "@brunodonaire"), "@brunodonaire");
  assert.equal(normalizarEnderecoDaRede("youtube", "brunodonaire"), "@brunodonaire");
  assert.equal(normalizarEnderecoDaRede("youtube", "https://www.youtube.com/@brunodonaire/videos"), "@brunodonaire");
  assert.equal(normalizarEnderecoDaRede("youtube", "youtube.com/channel/UCabcdefghijklmnopqrstuv"), "channel/UCabcdefghijklmnopqrstuv");
  assert.equal(normalizarEnderecoDaRede("linkedin", "linkedin.com/in/brunodonaire/"), "https://www.linkedin.com/in/brunodonaire");
  assert.equal(normalizarEnderecoDaRede("linkedin", "https://www.linkedin.com/company/demandou/about"), "https://www.linkedin.com/company/demandou");
  assert.equal(normalizarEnderecoDaRede("facebook", "facebook.com/demandou"), "https://www.facebook.com/demandou");
  assert.equal(normalizarEnderecoDaRede("facebook", "demandou"), "https://www.facebook.com/demandou");
  assert.equal(normalizarEnderecoDaRede("facebook", "https://www.facebook.com/profile.php?id=1000123"), "https://www.facebook.com/profile.php?id=1000123");
});

test("o que não parece da rede é recusado (nunca vira link inventado)", () => {
  assert.equal(normalizarEnderecoDaRede("instagram", "Bruno Donaire"), null);
  assert.equal(normalizarEnderecoDaRede("youtube", "Bruno Donaire"), null);
  assert.equal(normalizarEnderecoDaRede("youtube", "youtube.com/watch?v=abc"), null);
  assert.equal(normalizarEnderecoDaRede("linkedin", "brunodonaire"), null);
  assert.equal(normalizarEnderecoDaRede("facebook", "https://meusite.com.br"), null);
  assert.equal(normalizarEnderecoDaRede("tiktok", ""), null);
});

test("prioridade 1 e 2: o escrito vale antes do @ do campo antigo, e o antigo não se perde", () => {
  assert.deepEqual(lerRedesEscritas({ arrobaDoYouTube: "canalantigo" }), { youtube: "@canalantigo" });
  assert.deepEqual(lerRedesEscritas({ arrobaDoYouTube: "canalantigo", redesDoCliente: { youtube: "@canalnovo" } }), { youtube: "@canalnovo" });
  // Valor podre gravado à mão não passa.
  assert.deepEqual(lerRedesEscritas({ redesDoCliente: { instagram: "nome com espaço", tiktok: "@ok_tiktok" } }), { tiktok: "ok_tiktok" });
  assert.deepEqual(lerRedesEscritas(null), {});
});

test("prioridade 3: sem nada escrito, vale o que a conexão trouxe", () => {
  const contas = [{ platform: "instagram", username: "@daconexao", displayName: "Bruno" }];
  const [ig] = perfisDoCliente(contas, {});
  assert.equal(ig.handle, "daconexao");
  assert.equal(ig.url, "https://www.instagram.com/daconexao");
});

test("o escrito vence a conexão, e o nome do canal conectado continua como nome", () => {
  const contas = [
    { platform: "instagram", username: "@daconexao", displayName: null },
    { platform: "youtube", username: "Bruno Donaire", displayName: null },
  ];
  const config = { redesDoCliente: { instagram: "@escrito", youtube: "@brunodonaire" } };
  const perfis = perfisDoCliente(contas, config);
  const ig = perfis.find((p) => p.rede === "instagram")!;
  const yt = perfis.find((p) => p.rede === "youtube")!;
  assert.equal(ig.handle, "escrito");
  assert.equal(yt.handle, "brunodonaire");
  assert.equal(yt.url, "https://www.youtube.com/@brunodonaire");
  assert.equal(yt.nome, "Bruno Donaire");
  assert.equal(nomeDoCanal(contas, config), "Bruno Donaire");
});

test("o @ do campo antigo também vence a conexão sem @ (o comportamento de antes continua)", () => {
  const contas = [{ platform: "youtube", username: "Bruno Donaire", displayName: null }];
  const [yt] = perfisDoCliente(contas, { arrobaDoYouTube: "brunodonaire" });
  assert.equal(yt.url, "https://www.youtube.com/@brunodonaire");
});

test("rede escrita sem conexão entra na descrição, no que a rede do post aceita", () => {
  const config = {
    redesDoCliente: {
      instagram: "prdonaire",
      youtube: "@brunodonaire",
      linkedin: "https://www.linkedin.com/in/brunodonaire",
      facebook: "https://www.facebook.com/demandou",
    },
  };
  const noYouTube = blocoDeLinksDaDescricao({ rede: "youtube", links: [], contas: [], config });
  assert.equal(
    noYouTube,
    [
      "Minhas redes:",
      "Instagram: https://www.instagram.com/prdonaire",
      "LinkedIn: https://www.linkedin.com/in/brunodonaire",
      "Facebook: https://www.facebook.com/demandou",
    ].join("\n")
  );
  // No Instagram, link não clica: só o @, e LinkedIn e Facebook (só link) ficam de fora.
  const noInstagram = blocoDeLinksDaDescricao({ rede: "instagram", links: [], contas: [], config });
  assert.equal(noInstagram, ["Minhas redes:", "YouTube: @brunodonaire"].join("\n"));
  assert.doesNotMatch(noInstagram, /null|undefined/);
});

test("canal antigo do YouTube (sem @) vira link do canal, sem @ inventado", () => {
  assert.deepEqual(enderecoDaRede("youtube", "channel/UCabcdefghijklmnopqrstuv"), {
    handle: null,
    url: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv",
  });
  assert.equal(valorNoCampo("youtube", "channel/UCabcdefghijklmnopqrstuv"), "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv");
  // O que volta para o campo é aceito de novo do mesmo jeito.
  for (const [rede, v] of [["instagram", "prdonaire"], ["youtube", "@x_canal"], ["linkedin", "https://www.linkedin.com/in/x"]] as const) {
    assert.equal(normalizarEnderecoDaRede(rede, valorNoCampo(rede, v)), v);
  }
});

test("o PATCH do projeto protege as redes, e os textos da tela não têm travessão", () => {
  assert.ok((CHAVES_DOS_LINKS_NO_CONFIG as readonly string[]).includes("redesDoCliente"));
  for (const t of Object.values(ERRO_DO_ENDERECO)) assert.doesNotMatch(t, TRAVESSAO);
});
