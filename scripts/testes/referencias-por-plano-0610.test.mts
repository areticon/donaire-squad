// Referências por plano (06/10/2026, decisão do Bruno): 3 no Starter, 6 no Pro,
// 10 no Enterprise. Antes era 3 fixo por projeto e 15 fixo por conta, e um
// projeto antigo aparecia como "5 de 3". Nada aqui toca banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/referencias-por-plano-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PLANOS_PUBLICOS, REFERENCIAS_POR_PROJETO, linhaDasReferencias, referenciasDoPlano } from "@/lib/planos";
import { tetoBarraALista } from "@/lib/referencias/tipos-do-perfil-proprio";

test("Starter (id pro) estuda 3 por projeto e 6 na conta (3 x 2 marcas)", () => {
  const l = referenciasDoPlano({ plan: "pro" });
  assert.equal(l.porProjeto, 3);
  assert.equal(l.porConta, 6);
  assert.equal(l.semTetoNaConta, false);
  assert.equal(l.plano, "Starter");
});

test("Pro (id business) estuda 6 por projeto e 30 na conta (6 x 5 marcas)", () => {
  const l = referenciasDoPlano({ plan: "business" });
  assert.equal(l.porProjeto, 6);
  assert.equal(l.porConta, 30);
  assert.equal(l.plano, "Pro");
});

test("Enterprise (id studio) estuda 10 por projeto e 100 na conta (10 x 10 marcas)", () => {
  const l = referenciasDoPlano({ plan: "studio" });
  assert.equal(l.porProjeto, 10);
  assert.equal(l.porConta, 100);
  assert.equal(l.plano, "Enterprise");
});

test("acesso extra soma uma marca, e a conta ganha mais um projeto cheio", () => {
  assert.equal(referenciasDoPlano({ plan: "business", acessosExtras: 2 }).porConta, 6 * 7);
});

test("em teste grátis vale o Starter, qualquer que seja o plano escolhido", () => {
  for (const plan of ["pro", "business", "studio"]) {
    const l = referenciasDoPlano({ plan, emTeste: true, acessosExtras: 3 });
    assert.equal(l.porProjeto, 3, plan);
    assert.equal(l.porConta, 6, plan);
    assert.equal(l.plano, "Starter", plan);
  }
});

test("sem plano ou plano desconhecido cai no Starter, sem quebrar", () => {
  for (const plan of [null, undefined, "free", "inventado"]) {
    assert.equal(referenciasDoPlano({ plan }).porProjeto, 3, String(plan));
  }
});

test("admin mostra o do Enterprise e não tem teto na conta", () => {
  const l = referenciasDoPlano({ plan: null, admin: true });
  assert.equal(l.porProjeto, 10);
  assert.equal(l.porConta, 100);
  assert.equal(l.semTetoNaConta, true);
});

test("membro da equipe usa o plano do dono: o servidor resolve a conta antes", () => {
  const fonte = readFileSync("lib/limites-do-plano.ts", "utf8");
  const corpo = fonte.slice(fonte.indexOf("export async function limiteDeReferencias"));
  assert.match(corpo, /const userId = await contaDoPlano\(userIdDeQuemPede\)/);
  assert.match(corpo, /where: \{ id: userId \}/);
});

test("projeto acima do limite: remover, trocar e esvaziar passam; aumentar acima do teto não", () => {
  // 5 referências de antes da regra, plano Starter (3).
  assert.equal(tetoBarraALista(4, 5, 3), false, "remover uma");
  assert.equal(tetoBarraALista(5, 5, 3), false, "trocar uma por outra");
  assert.equal(tetoBarraALista(0, 5, 3), false, "ficar sem nenhuma");
  assert.equal(tetoBarraALista(6, 5, 3), true, "aumentar");
  // Dentro do limite tudo passa, e passar dele barra.
  assert.equal(tetoBarraALista(3, 2, 3), false);
  assert.equal(tetoBarraALista(4, 3, 3), true);
});

test("o número mora num lugar só e a vitrine dos planos lê de lá", () => {
  assert.deepEqual(REFERENCIAS_POR_PROJETO, { pro: 3, business: 6, studio: 10 });
  for (const p of PLANOS_PUBLICOS) {
    assert.equal(p.referenciasPorProjeto, REFERENCIAS_POR_PROJETO[p.id]);
    assert.ok(p.features.includes(linhaDasReferencias(p.referenciasPorProjeto)), `${p.nome} sem a linha das referências`);
  }
});

test("nenhuma tela nem rota usa mais o número fixo", () => {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (/\.(ts|tsx)$/.test(nome)) {
        const texto = readFileSync(caminho, "utf8");
        if (/MAX_REFERENCIAS_POR_(PROJETO|CONTA)\b/.test(texto.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ""))) achados.push(caminho);
      }
    }
  };
  for (const d of ["app", "components", "lib"]) andar(d);
  assert.deepEqual(achados, []);
});

test("o estudo lê só as mais recentes até o limite do plano", () => {
  const estudo = readFileSync("lib/referencias/estudo.ts", "utf8");
  assert.match(estudo, /idsQueOEstudoLe\(projectId\)/);
  assert.match(estudo, /id: \{ in: noLimite \}/);
  const limite = readFileSync("lib/referencias/limite.ts", "utf8");
  assert.match(limite, /orderBy: \[\{ createdAt: "desc" \}/);
  assert.match(limite, /take: n/);
});

test("nenhum travessão nos textos novos", () => {
  for (const f of [
    "lib/planos.ts",
    "lib/referencias/limite.ts",
    "components/kanban/step-referencias-do-cliente.tsx",
    "components/editorial/referencias.tsx",
    "app/api/projects/[id]/referencias/[refId]/route.ts",
  ]) {
    assert.ok(!readFileSync(f, "utf8").includes("—"), f);
  }
});
