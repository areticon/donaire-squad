// Testes de lógica do cargo do representante legal (06/10/2026): a composição
// "Nome, Cargo", a leitura do formulário, o seletor e o texto do contrato e
// do aditivo. Sem banco: só os módulos puros e o modelo em Markdown.
// Rodar: npx tsx --test scripts/testes/contratos-cargo-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";

const { CARGOS_DO_REPRESENTANTE, CARGO_OUTRO, CARGO_PADRAO, cargoLimpo, cargoNoSeletor, representanteComCargo } = await import("@/lib/contratos/cargo");
const { cargoDoCorpo } = await import("@/lib/contratos/formulario");
const { montarTexto, montarAditivo } = await import("@/lib/contratos/modelo");

test("composição: nome e cargo viram 'Nome, Cargo'; sem cargo fica só o nome; sem nome é null", () => {
  assert.equal(representanteComCargo("Maria Silva", "Sócio-administrador"), "Maria Silva, Sócio-administrador");
  assert.equal(representanteComCargo("Maria Silva", null), "Maria Silva");
  assert.equal(representanteComCargo("  Maria Silva ", "  "), "Maria Silva");
  assert.equal(representanteComCargo(null, "Diretor"), null);
  assert.equal(representanteComCargo("", "Diretor"), null);
});

test("lista: o padrão é Sócio-administrador e está na lista", () => {
  assert.equal(CARGO_PADRAO, "Sócio-administrador");
  assert.ok((CARGOS_DO_REPRESENTANTE as readonly string[]).includes(CARGO_PADRAO));
  assert.deepEqual([...CARGOS_DO_REPRESENTANTE], ["Sócio-administrador", "Administrador", "Diretor", "Procurador", "Titular (MEI)", "Pessoa física"]);
});

test("formulário: cargo da lista vai como está; 'outro' usa o texto livre; vazio vira null", () => {
  assert.equal(cargoDoCorpo({ representanteCargo: "Procurador" }), "Procurador");
  assert.equal(cargoDoCorpo({ representanteCargo: CARGO_OUTRO, representanteCargoOutro: "  Gerente   jurídico " }), "Gerente jurídico");
  assert.equal(cargoDoCorpo({ representanteCargo: CARGO_OUTRO, representanteCargoOutro: "" }), null);
  assert.equal(cargoDoCorpo({ representanteCargo: "" }), null);
  assert.equal(cargoDoCorpo({}), null);
  assert.equal(cargoLimpo("x".repeat(200))?.length, 80);
});

test("seletor: gravado da lista fica no seletor; texto livre abre 'Outro'; null cai no padrão", () => {
  assert.deepEqual(cargoNoSeletor("Diretor"), { escolha: "Diretor", outro: "" });
  assert.deepEqual(cargoNoSeletor("Gerente jurídico"), { escolha: CARGO_OUTRO, outro: "Gerente jurídico" });
  assert.deepEqual(cargoNoSeletor(null), { escolha: CARGO_PADRAO, outro: "" });
});

const base = {
  numero: 7,
  empresa: "Empresa Exemplo Ltda",
  documento: "12.345.678/0001-90",
  endereco: "Rua A, 1, Centro, São Paulo/SP, CEP 01000-000",
  representante: "Maria Silva",
  email: "maria@exemplo.com",
  plano: "Pro",
  valorCentavos: 3_596_400,
  inicioVigencia: null,
  acessosExtras: 0,
};

test("contrato: o quadro das partes traz 'Nome, Cargo'; sem cargo o texto (e o hash) é o mesmo de antes", () => {
  const com = montarTexto({ ...base, cargo: "Sócio-administrador" });
  assert.match(com.texto, /Representante legal[^|\n]*\|\s*Maria Silva, Sócio-administrador\s*\|/);
  const sem = montarTexto({ ...base, cargo: null });
  const antes = montarTexto(base);
  assert.equal(sem.texto, antes.texto);
  assert.equal(sem.hash, antes.hash);
  assert.match(sem.texto, /Representante legal[^|\n]*\|\s*Maria Silva\s*\|/);
  assert.notEqual(com.hash, antes.hash);
});

test("aditivo: a frase 'representado por' leva o cargo", () => {
  const cond = { plano: "Pro", acessosExtras: 0, tabelaCentavos: 3_596_400, descontoCentavos: 0, descontoMotivo: null, valorAnualCentavos: 3_596_400, fundador: false };
  const a = montarAditivo({
    ordem: 1,
    numeroDoContrato: 7,
    assinadoEm: null,
    fimVigencia: null,
    empresa: base.empresa,
    documento: base.documento,
    representante: "Maria Silva",
    cargo: "Procurador",
    email: base.email,
    antes: cond,
    depois: { ...cond, plano: "Business", valorAnualCentavos: 4_000_000, tabelaCentavos: 4_000_000 },
    valeDesde: new Date("2026-10-06T12:00:00-03:00"),
    diferencaCentavos: 0,
    diasRestantes: 100,
    diasDaVigencia: 365,
  });
  assert.match(a.texto, /representado por Maria Silva, Procurador \(maria@exemplo\.com\)/);
});
