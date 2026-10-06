// A prova do painel com números reais e o rosto da landing (06/10/2026,
// pedido do Bruno: "mudar as fotos dos agentes para as mesmas que usamos na
// landing page, e esses números precisam ser reais, vir do Apify"):
//   - cada post vale pela leitura mais recente de CADA campo, e campo que
//     nenhuma fonte trouxe fica nulo (nunca zero);
//   - o post_metrics antigo só entra sem leitura, com impressão, visualização
//     e clique zerados lidos como "não medido";
//   - a rede soma só onde o campo veio, e sem medição o total é nulo;
//   - o rosto de cada agente é o retrato da landing, e o arquivo existe;
//   - completar pelo perfil público nasce desligado.
// Nada aqui toca banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/painel-resultado-real-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CAMPOS_DA_REDE,
  consolidarNumerosDoPost,
  numeroCurto,
  REDE_DO_AGENTE,
  resultadoDaRede,
  tempoCurto,
} from "@/lib/painel/resultado-das-redes";
import { AGENTES, AGENTE_DEV, arteDoAgente } from "@/lib/squad/estado-do-squad";
import { completarPeloPerfilPublico, faltaNoPerfilPublico } from "@/lib/analytics/sincronizar";

const TRAVESSAO = /[—–]/;
const d = (s: string) => new Date(s);

test("cada campo vale pela leitura mais recente que o trouxe", () => {
  const n = consolidarNumerosDoPost([
    { fonte: "api:instagram", lidoEm: d("2026-10-02T10:00:00Z"), curtidas: 10, comentarios: 2, visualizacoes: null },
    { fonte: "apify:instagram", lidoEm: d("2026-10-01T10:00:00Z"), curtidas: 7, visualizacoes: 300 },
    { fonte: "api:instagram", lidoEm: d("2026-10-03T10:00:00Z"), curtidas: 12, comentarios: null },
  ]);
  assert.ok(n);
  assert.equal(n.curtidas, 12);
  assert.equal(n.comentarios, 2);
  assert.equal(n.visualizacoes, 300);
  assert.equal(n.salvamentos, null);
  assert.equal(n.impressoes, null);
  assert.equal(n.fonte, "api:instagram");
  assert.equal(n.tempoMedioSeg, null);
});

test("tempo médio só quando a fonte gravou, e leitura vazia não é medição", () => {
  const n = consolidarNumerosDoPost([{ fonte: "api:youtube", lidoEm: d("2026-10-02T10:00:00Z"), visualizacoes: 50, extras: { tempoMedioSeg: 41 } }]);
  assert.equal(n?.tempoMedioSeg, 41);
  assert.equal(consolidarNumerosDoPost([{ fonte: "api:x", lidoEm: d("2026-10-02T10:00:00Z") }]), null);
  assert.equal(consolidarNumerosDoPost([]), null);
});

test("post_metrics antigo: zero de impressão, visualização e clique é não medido", () => {
  const n = consolidarNumerosDoPost([], { impressions: 0, likes: 4, comments: 0, shares: 1, clicks: 0, videoViews: 0 });
  assert.ok(n);
  assert.equal(n.curtidas, 4);
  assert.equal(n.comentarios, 0);
  assert.equal(n.impressoes, null);
  assert.equal(n.visualizacoes, null);
  assert.equal(n.cliques, null);
  assert.equal(n.fonte, "anterior");
});

test("a rede soma só onde o campo veio; sem medição o total é nulo", () => {
  const r = resultadoDaRede("instagram", [
    { numeros: { fonte: "api:instagram", curtidas: 10, comentarios: 1, visualizacoes: null } },
    { numeros: { fonte: "apify:instagram", curtidas: 5, comentarios: 0, visualizacoes: 200, tempoMedioSeg: 10 } },
    { numeros: { fonte: "apify:instagram", visualizacoes: 100, tempoMedioSeg: 20 } },
    { numeros: null },
  ]);
  assert.equal(r.publicados, 4);
  assert.equal(r.medidos, 3);
  assert.equal(r.totais.curtidas, 15);
  assert.equal(r.totais.visualizacoes, 300);
  assert.equal(r.postsComCampo.visualizacoes, 2);
  assert.equal(r.totais.salvamentos, null);
  assert.equal(r.totais.tempoMedioSeg, 15);
  assert.equal(r.interacoes, 16);
  assert.deepEqual(r.vistos, { campo: "visualizacoes", valor: 300 });
  assert.deepEqual(r.fontes, { "api:instagram": 1, "apify:instagram": 2 });

  const vazia = resultadoDaRede("tiktok", [{ numeros: null }]);
  assert.equal(vazia.medidos, 0);
  assert.equal(vazia.interacoes, null);
  assert.equal(vazia.vistos, null);
  assert.equal(vazia.totais.curtidas, null);

  const linkedin = resultadoDaRede("linkedin", [{ numeros: { fonte: "api:linkedin", impressoes: 900, curtidas: 3 } }]);
  assert.deepEqual(linkedin.vistos, { campo: "impressoes", valor: 900 });
});

test("cada especialista tem rede e cada rede tem a lista do que mede", () => {
  for (const [agente, rede] of Object.entries(REDE_DO_AGENTE)) {
    assert.ok(AGENTES.some((a) => a.id === agente), agente);
    assert.ok(CAMPOS_DA_REDE[rede]?.length, rede);
  }
  assert.equal(numeroCurto(1234), "1.234");
  assert.equal(numeroCurto(12345), "12,3 mil");
  assert.equal(numeroCurto(2_500_000), "2,5 mi");
  assert.equal(tempoCurto(38), "38 s");
  assert.equal(tempoCurto(72), "1 min 12 s");
});

test("o rosto de cada agente é o retrato da landing, e o arquivo existe", () => {
  for (const a of AGENTES) {
    const arte = arteDoAgente(a.id);
    assert.ok(arte, a.id);
    assert.equal(arte.avatar, `/equipe/${a.id}.jpg`);
    assert.equal(arte.avatarPequeno, `/equipe/abertura/${a.id}.webp`);
    for (const f of [arte.avatar, arte.avatarPequeno, arte.mesa]) assert.ok(fs.existsSync(path.join("public", f)), f);
  }
  // Id antigo ainda acha o retrato do agente atual.
  assert.equal(arteDoAgente("tiago-twitter")?.avatar, "/equipe/xavier-x.jpg");
  // O Davi não tem retrato na landing: fica no caminho do boneco (ou na inicial).
  assert.equal(arteDoAgente(AGENTE_DEV.id)?.avatar, `/agentes/${AGENTE_DEV.id}-avatar.webp`);
});

test("completar pelo perfil público nasce desligado", () => {
  assert.equal(completarPeloPerfilPublico({}), false);
  assert.equal(completarPeloPerfilPublico({ METRICAS_APIFY_COMPLETAR: "0" }), false);
  assert.equal(completarPeloPerfilPublico({ METRICAS_APIFY_COMPLETAR: "1" }), true);
  assert.equal(faltaNoPerfilPublico("instagram", { curtidas: 3, comentarios: 1 }), true);
  assert.equal(faltaNoPerfilPublico("instagram", { curtidas: 3, visualizacoes: 40 }), false);
  assert.equal(faltaNoPerfilPublico("linkedin", { curtidas: 3 }), false);
});

test("nenhum travessão nos arquivos novos", () => {
  for (const f of ["lib/painel/resultado-das-redes.ts", "components/painel/cartao-do-agente.tsx", "lib/painel/numeros-do-painel.ts", "app/(app)/dashboard/page.tsx", "components/painel/graficos.tsx"]) {
    assert.ok(!TRAVESSAO.test(fs.readFileSync(f, "utf8")), f);
  }
});
