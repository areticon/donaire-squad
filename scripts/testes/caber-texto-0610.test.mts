// Texto nunca sobrepõe nem corta (06/10/2026). O caso real: o infográfico do
// Demandou de 06/10 com "9,3 horas por dia" por cima do parágrafo, "Até 70%
// de economia" em cima de "Tecnologias como Launchpad...", parágrafos
// cortados no pé dos cartões, "R$ 1.500 a R$ 30.000" quebrado e desalinhado
// e "9,3 horas" repetido no destaque, no cartão e no rodapé.
// Puro: nada aqui toca banco, IA, rede ou imagem paga.
// Rodar: npx tsx --test scripts/testes/caber-texto-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { caberBlocos, caberNumero, linhasCabem, partirFaixa, quebrarLinhas, RETICENCIA } from "@/lib/media/caber-texto";
import { planejarInfografico, problemasDoPlano, type FamiliaDoInfografico } from "@/lib/media/plano-do-infografico";
import { chaveDoNumero, semNumerosRepetidos, temNumeroRepetido } from "@/lib/media/infografico-sem-repeticao";
import { encaixar } from "@/lib/modelos-de-arte/encaixe";
import type { ConteudoDoInfografico } from "@/lib/media/infographic";

const silencio = <T,>(f: () => T): T => {
  const w = console.warn;
  console.warn = () => {};
  try {
    return f();
  } finally {
    console.warn = w;
  }
};

// Os textos REAIS da arte do LinkedIn de 06/10 (lidos da imagem entregue).
const REAL: ConteudoDoInfografico = {
  title: "Marketing de conteúdo: IA assume para você focar no negócio",
  subtitle: "Chega de perder tempo com marketing! Automação com IA cuida da gravação à distribuição, devolvendo horas para seu negócio.",
  highlight: { value: "9,3 horas", label: "Tempo médio de trabalho diário" },
  sections: [
    { heading: "Empreendedor: O tempo é seu maior ativo", stat: "9,3 horas por dia", body: "Perder o dia com marketing (gravar, editar, analisar) afasta você das vendas e do crescimento do seu próprio negócio." },
    { heading: "Liberte-se com Agentes de IA 24/7", body: "Um time de IA multiplica seu conteúdo, edita vídeos e distribui para todas as redes, sem pausas ou férias." },
    { heading: "Seu Gêmeo de IA: Marketing Sem Limites", body: "Um clone de IA gera suas campanhas semanais. Crie vídeos, fotos e carrosséis mesmo sem tempo para gravar." },
    { heading: "Mercado e Economia: O Poder da Automação", stat: "Até 70% de economia", body: "Tecnologias como Launchpad validam a criação de produtos com IA. Reduza custos com agências e social media." },
  ],
  keyNumbers: [
    { value: "59%", label: "MPEs já usam IA para marketing" },
    { value: "R$ 1.500 a R$ 30.000", label: "Custo mensal agência de marketing" },
    { value: "45%", label: "Empreendedores sem tempo para negócio" },
  ],
};

const LONGO: ConteudoDoInfografico = {
  title: "O que muda quando a sua empresa para de improvisar a presença digital e passa a planejar a semana inteira",
  subtitle: "Um texto de apoio comprido de propósito, que precisa reduzir e, no último caso, sair, sem nunca invadir o bloco de baixo.",
  highlight: { value: "R$ 1.500 a R$ 30.000", label: "o custo mensal de uma agência de marketing digital de porte médio, sem contar a verba de mídia paga" },
  sections: [
    { heading: "Um título de cartão bem comprido que ocupa várias linhas", stat: "R$ 12.400 por trimestre", body: "O empreendedor grava, edita, publica, responde comentário, mede resultado, estuda concorrente, e no fim do dia percebe que vendeu menos do que queria porque o marketing tomou a agenda inteira." },
    { heading: "Curto", stat: "Até 70% de economia em dezoito meses", body: "Outro parágrafo comprido para forçar o piso do corpo e, se for preciso, a reticência no fim, com aviso no log." },
    { heading: "Terceiro cartão", body: "Texto médio, sem número, para ver o cartão sem o bloco do número." },
    { heading: "Quarto cartão com título", stat: "3x", body: "Mais um parágrafo que vai até o fim do cartão, com palavras como profissionalização, responsabilidade e comunicação." },
  ],
  keyNumbers: [
    { value: "R$ 2.000 a R$ 45.000", label: "Custo mensal de agência de marketing completa" },
    { value: "45%", label: "Empreendedores que dizem não ter tempo para cuidar do negócio" },
    { value: "59%", label: "MPEs já usam IA" },
  ],
};

const TAMANHOS = { "4:5": [1080, 1350], "16:9": [1600, 900], "1:1": [1080, 1080], "9:16": [1080, 1920] } as const;
const FAMILIAS: FamiliaDoInfografico[] = ["colagem", "impacto", "sobrio", "claro"];

test("a arte real de 06/10 cabe inteira em toda proporção e família, sem corte nem sobreposição", () => {
  const { conteudo } = semNumerosRepetidos(REAL);
  for (const [nome, [W, H]] of Object.entries(TAMANHOS)) {
    for (const familia of FAMILIAS) {
      const p = silencio(() => planejarInfografico(conteudo, familia, W, H));
      assert.deepEqual(problemasDoPlano(p), [], `${nome} ${familia}`);
      // No 1:1 o subtítulo pode sair para os parágrafos ficarem inteiros; corte, nunca.
      assert.deepEqual(p.cortes, [], `${nome} ${familia}: nada cortado`);
      for (const c of p.cartoes.itens) assert.ok(!c.texto.linhas.some((l) => l.endsWith(RETICENCIA)), `${nome} ${familia}: parágrafo inteiro`);
    }
  }
});

test("o número do cartão e o parágrafo ficam em fluxo: a altura usada é a soma, nunca sobreposta", () => {
  const p = silencio(() => planejarInfografico(semNumerosRepetidos(REAL).conteudo, "colagem", 1600, 900));
  const quarto = p.cartoes.itens[3];
  assert.ok(quarto.numero, "o cartão 4 tem número");
  const interna = p.cartoes.altura - 2 * p.cartoes.padV - p.cartoes.bordaTopo;
  const usada = quarto.titulo.altura + quarto.titulo.depois + quarto.numero!.altura + quarto.numero!.depois + quarto.texto.altura;
  assert.ok(usada <= interna + 1, `usa ${usada} de ${interna}`);
  // A última palavra do parágrafo real está lá ("media."): nada foi cortado.
  assert.ok(quarto.texto.linhas.join(" ").endsWith("social media."));
});

test("a faixa R$ 1.500 a R$ 30.000 cabe numa linha, ou quebra no conector com as duas linhas medidas", () => {
  const larga = caberNumero("R$ 1.500 a R$ 30.000", "Anton", 500, 44, 26);
  assert.deepEqual(larga.linhas, ["R$ 1.500 a R$ 30.000"]);
  const estreita = caberNumero("R$ 1.500 a R$ 30.000", "Anton", 180, 44, 26);
  assert.deepEqual(estreita.linhas, ["R$ 1.500 a", "R$ 30.000"]);
  assert.ok(linhasCabem(estreita.linhas, "Anton", estreita.corpo, 180));
  assert.deepEqual(partirFaixa("R$ 1.500 até R$ 30.000"), ["R$ 1.500 até", "R$ 30.000"]);
  assert.equal(partirFaixa("59%"), null);
  // No rodapé real (16:9) a faixa sai numa linha só, e todos os valores no mesmo corpo.
  const p = silencio(() => planejarInfografico(semNumerosRepetidos(REAL).conteudo, "colagem", 1600, 900));
  const faixa = p.rodape!.itens.find((i) => i.valor.linhas.join(" ").includes("30.000"))!;
  assert.equal(faixa.valor.linhas.length, 1);
  assert.equal(new Set(p.rodape!.itens.map((i) => i.valor.corpo)).size, 1, "valores alinhados no mesmo corpo");
});

test("texto longo: reduz até o piso, depois tira o subtítulo, e só então corta o parágrafo com reticência e aviso", () => {
  for (const [nome, [W, H]] of Object.entries(TAMANHOS)) {
    for (const familia of FAMILIAS) {
      const avisos: string[] = [];
      const w = console.warn;
      console.warn = (...a: unknown[]) => void avisos.push(a.join(" "));
      let p;
      try {
        p = planejarInfografico(semNumerosRepetidos(LONGO).conteudo, familia, W, H);
      } finally {
        console.warn = w;
      }
      assert.deepEqual(problemasDoPlano(p), [], `${nome} ${familia}: nada passa da caixa`);
      for (const c of p.cartoes.itens) {
        // O número nunca é cortado.
        assert.ok(!(c.numero?.linhas ?? []).some((l) => l.endsWith(RETICENCIA)), `${nome} ${familia}: número inteiro`);
      }
      if (p.cortes.length) assert.ok(avisos.some((a) => a.includes("reticência")), `${nome} ${familia}: corte vai ao log`);
    }
  }
});

test("caberBlocos reduz junto, respeita o piso e corta só o que é cortável", () => {
  const blocos = [
    { nome: "número", texto: "Até 70% de economia", fonte: "Anton" as const, corpo: 40, piso: 24, entrelinha: 1.05, maxLinhas: 2, depois: 6 },
    { nome: "parágrafo", texto: "palavra ".repeat(80).trim(), fonte: "Liberation Sans" as const, corpo: 22, piso: 14, entrelinha: 1.3, cortavel: true },
  ];
  const r = silencio(() => caberBlocos(blocos, 300, 200, "teste"));
  assert.ok(r.cortado);
  assert.ok(r.altura <= 200.5, `altura ${r.altura}`);
  assert.equal(r.blocos[0].linhas.join(" "), "Até 70% de economia", "o número fica inteiro");
  assert.ok(r.blocos[1].linhas[r.blocos[1].linhas.length - 1].endsWith(RETICENCIA));
  assert.ok(r.blocos[1].corpo >= 14 && r.blocos[0].corpo >= 24, "nada abaixo do piso");
  // Texto curto: cabe no corpo máximo, sem corte.
  const curto = caberBlocos([{ ...blocos[1], texto: "Pouco texto." }], 300, 200);
  assert.equal(curto.escala, 1);
  assert.equal(curto.cortado, false);
});

test("quebrarLinhas mede cada linha e parte palavra maior que a linha", () => {
  const ls = quebrarLinhas("Responsabilidadeprofissionalcomunicação curta", "Liberation Sans", 30, 200);
  assert.ok(linhasCabem(ls, "Liberation Sans", 30, 200));
  assert.ok(ls.length >= 3);
});

test("o encaixe dos modelos do book não passa da caixa no corpo mínimo: corta com reticência e avisa", () => {
  const w = console.warn;
  const avisos: string[] = [];
  console.warn = (...a: unknown[]) => void avisos.push(a.join(" "));
  try {
    const e = encaixar({ texto: "uma frase muito comprida ".repeat(20), fonte: "Inter-400" as never, largura: 300, altura: 60, entrelinha: 1.2, corpoMaximo: 40, corpoMinimo: 20, maxLinhas: 2 });
    assert.ok(e.linhas.length <= 2);
    assert.ok(e.linhas[e.linhas.length - 1].endsWith(RETICENCIA));
    assert.equal(e.cortado, true);
    assert.ok(avisos.some((a) => a.includes("reticência")));
  } finally {
    console.warn = w;
  }
});

test("o mesmo número não aparece no destaque e num cartão (nem no rodapé), com grafias diferentes", () => {
  assert.equal(chaveDoNumero("9,3 horas/dia"), chaveDoNumero("9,3 horas por dia"));
  assert.equal(chaveDoNumero("9,3h"), "9.3");
  assert.equal(chaveDoNumero("R$ 1.500 a R$ 30.000"), "1500");
  assert.notEqual(chaveDoNumero("70%"), chaveDoNumero("70 horas"));
  assert.equal(temNumeroRepetido(REAL), true);
  const { conteudo, removidos } = semNumerosRepetidos(REAL);
  assert.deepEqual(removidos, ["cartão 1: 9,3 horas por dia"]);
  assert.equal(conteudo.sections[0].stat, undefined, "o cartão perde só o número");
  assert.ok(conteudo.sections[0].body.length > 0, "o texto do cartão fica");
  assert.equal(conteudo.sections[3].stat, "Até 70% de economia");
  const insta: ConteudoDoInfografico = {
    ...REAL,
    highlight: { value: "9,3 horas/dia", label: "Empreendedores dedicam ao marketing" },
    keyNumbers: [{ value: "9,3 horas", label: "Tempo dedicado ao marketing" }, { value: "45%", label: "Empreendedores sem tempo" }],
  };
  const r = semNumerosRepetidos(insta);
  assert.deepEqual(r.removidos, ["cartão 1: 9,3 horas por dia", "rodapé 1: 9,3 horas"]);
  assert.equal(temNumeroRepetido(r.conteudo), false);
});
