// Painel de admin, quem é equipe e quem é cliente (06/10/2026). O gráfico de
// uso de IA mostrava a fatia de cliente (azul) zerada porque uma lista de
// e-mails escrita no código jogava a conta de teste do Bruno (desconto de
// 100%, papel de usuário) na equipe. Nada aqui toca banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/painel-equipe-cliente-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contaEhDaEquipe, emailDoDominioDaEquipe } from "@/lib/admin/tipos-do-uso-de-ia";
import { variacao } from "@/lib/admin/tipos-do-painel";

test("conta de teste com desconto, sem admin e sem marca, é cliente", () => {
  assert.equal(contaEhDaEquipe({ email: "alguem.de.teste@gmail.com", role: "user", contaInterna: false }), false);
});

test("a marca contaInterna no banco faz a conta ser equipe", () => {
  assert.equal(contaEhDaEquipe({ email: "alguem.de.teste@gmail.com", role: "user", contaInterna: true }), true);
});

test("papel de admin é equipe, mesmo sem marca", () => {
  assert.equal(contaEhDaEquipe({ email: "dono@gmail.com", role: "admin", contaInterna: false }), true);
});

test("e-mail da casa é equipe, mesmo sem marca e sem admin", () => {
  assert.equal(contaEhDaEquipe({ email: "Fulano@Demandou.com", role: "user", contaInterna: false }), true);
  assert.equal(emailDoDominioDaEquipe("fulano@demandou.com.br"), false);
  assert.equal(emailDoDominioDaEquipe("fulano@outrodemandou.com"), false);
});

test("nenhum e-mail de pessoa escrito na regra de equipe do painel", () => {
  for (const arquivo of ["lib/admin/tipos-do-uso-de-ia.ts", "lib/admin/uso-de-ia.ts", "lib/admin/painel.ts", "lib/admin/receita-real.ts", "lib/admin/comparacao-do-painel.ts"]) {
    const codigo = readFileSync(arquivo, "utf8");
    assert.doesNotMatch(codigo, /["'][a-z0-9._+-]+@(?:gmail|hotmail|outlook|yahoo)\.com["']/i, arquivo);
  }
});

test("variação contra o período anterior, no jeito do Stripe", () => {
  assert.equal(variacao(150, 100), 0.5);
  assert.equal(variacao(50, 100), -0.5);
  assert.equal(variacao(10, 0), null);
  // margem negativa que piora é variação negativa (ruim)
  assert.ok((variacao(-200, -100) ?? 0) < 0);
});
