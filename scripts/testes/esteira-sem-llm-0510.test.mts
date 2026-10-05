// Testes da regra de 05/10/2026 ("o Claude só escreve texto; decisão vai ao
// JEV") na esteira de campanha: a Vera sem Claude, a conferência da arte por
// descrição mais código, a escolha do material, o fecho do corte e a
// classificação dos quadros. Tudo com o JEV trocado por respostas fixas: nada
// aqui toca banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/esteira-sem-llm-0510.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PerguntaDoJev, RespostaDoJev, perguntarAoJev } from "@/lib/jev/cliente";
import {
  avaliarNotas,
  itensDoParecer,
  parecerDaConferenciaPendente,
  parecerDaRevisao,
  pendentesDaConferencia,
  redeErradaPeloJev,
  reguasDaTarefa,
  veraConfereCorrecaoPeloJev,
  veraConfereNaCampanha,
  veraRevisaNaCampanha,
  veraRevisaPeloJev,
  type PecaParaVera,
} from "@/lib/squad/vera-pelo-jev";
import { itensDoParecer as itensDaCorrecao, leituraGeralDoParecer, motivoDoParecer, secaoPedeMudanca, secoesPorPeca } from "@/lib/squad/correcao-da-vera";
import { vereditoPedeCorrecao } from "@/lib/squad/estado-da-correcao";
import { decidirPelaDescricao, palavrasForaDoPermitido } from "@/lib/media/conferencia-da-arte";
import { decidirPeloJev, escolhaDeMaterial, type MaterialDaMarca } from "@/lib/materiais/escolha";
import { conferirFechoPeloJev, decisaoDoFecho, perguntasDoFecho, recuoPorDespedida, type FraseNumerada } from "@/lib/media/fecho-pelo-jev";
import { tipoDoQuadro } from "@/lib/media/telas-da-gravacao";

// O JEV de mentira: cada pergunta recebe a resposta marcada; o resto fica sem
// resposta (que para o código é "não sei").
type Perguntar = typeof perguntarAoJev;
function jevFixo(respostas: Record<string, number | { choice: string; probabilities?: Record<string, number>; confidence?: number }>, chamadas: Array<{ etapa: string; perguntas: Record<string, PerguntaDoJev> }> = []): Perguntar {
  return async (ctx, perguntas) => {
    chamadas.push({ etapa: ctx.etapa, perguntas });
    const saida: Record<string, RespostaDoJev> = {};
    for (const k of Object.keys(perguntas)) {
      const r = respostas[k];
      if (r === undefined) continue;
      if (typeof r === "number") saida[k] = { type: "noul", noul: r };
      else saida[k] = { type: "choice", choice: r.choice, probabilities: r.probabilities ?? {}, confidence: r.confidence ?? 0.9 };
    }
    return saida;
  };
}

process.env.TYPESAFE_API_KEY = "teste";
delete process.env.JEV_LIGADO;
delete process.env.VERA_PELO_JEV;
delete process.env.VERA_PRIMEIRA_PELO_JEV;
delete process.env.FECHO_PELO_JEV;

const pecas: PecaParaVera[] = [
  { id: "post1", rede: "instagram", tipo: "imagem com legenda", texto: "Produtividade não é fazer mais, é parar de repetir o mesmo erro. 62% dos pequenos negócios perdem cliente por retrabalho." },
  { id: "post2", rede: "twitter", tipo: "thread", texto: "1/ Marta estava trabalhando mais que Maria. 2/ E ainda assim perdeu o essencial." },
];

// ─── a Vera sem Claude: a primeira revisão ───

test("Vera: tudo com folga aprova sem ressalva e sem Claude", () => {
  const notas = { "pronto:post1": 0.9, "nicho:post1": 0.9, "regras:post1": 0.9, "dado:post1": 0.1, "rede:post1": 0.9, "pronto:post2": 0.9, "nicho:post2": 0.9, "regras:post2": 0.9, "rede:post2": 0.9 };
  const av = avaliarNotas(pecas, notas);
  assert.deepEqual(av.map((a) => a.reprovas.length), [0, 0]);
  const { veredito, parecer } = parecerDaRevisao({ avaliacoes: av, estilo: "video" });
  assert.equal(veredito, "APROVADO");
  assert.match(parecer, /VEREDITO: APROVADO$/);
  assert.equal(vereditoPedeCorrecao(veredito, parecer), false);
});

test("Vera: a dúvida vira ressalva (aprovado com ressalvas), não reescrita paga", () => {
  const notas = { "pronto:post1": 0.9, "nicho:post1": 0.55, "regras:post1": 0.9, "dado:post1": 0.4, "rede:post1": 0.9 };
  const av = avaliarNotas(pecas.slice(0, 1), notas);
  assert.deepEqual(av[0].reprovas, []);
  assert.equal(av[0].ressalvas.length, 2);
  const { veredito, parecer } = parecerDaRevisao({ avaliacoes: av, estilo: "video" });
  assert.equal(veredito, "APROVADO_COM_RESSALVAS");
  assert.equal(vereditoPedeCorrecao(veredito, parecer), false, "ressalva não manda a peça de volta");
  // A ressalva não é lida como pedido pela segunda revisão nem como item pela correção.
  assert.deepEqual(itensDoParecer(parecer), []);
  assert.deepEqual(itensDaCorrecao(parecer), []);
});

test("Vera: a falha com certeza reprova, e o parecer sai no formato que o laço da correção lê", () => {
  const notas = { "pronto:post1": 0.9, "nicho:post1": 0.9, "regras:post1": 0.9, "dado:post1": 0.85, "rede:post1": 0.9, "pronto:post2": 0.2, "nicho:post2": 0.9, "regras:post2": 0.9, "rede:post2": 0.5 };
  const av = avaliarNotas(pecas, notas);
  assert.equal(av[0].reprovas.length, 1);
  assert.equal(av[1].reprovas.length, 1);
  assert.equal(av[1].ressalvas.length, 1);
  const { veredito, parecer } = parecerDaRevisao({ avaliacoes: av, estilo: "video" });
  assert.equal(veredito, "REPROVADO");
  assert.equal(vereditoPedeCorrecao(veredito, parecer), true);
  // Seção por peça, com "precisa mudar" e item numerado: o dono de cada peça recebe a sua.
  const secoes = secoesPorPeca(parecer);
  assert.equal(secoes.size, 2);
  assert.equal(secaoPedeMudanca(secoes.get(1)), true);
  assert.equal(secaoPedeMudanca(secoes.get(2)), true);
  assert.match(secoes.get(1)!, /sem fonte/);
  assert.match(secoes.get(2)!, /não está pronto/);
  // O motivo em uma linha para o log e o cliente.
  assert.match(motivoDoParecer(parecer), /Post 1 \(Instagram\)/);
  assert.match(leituraGeralDoParecer(parecer), /2 peça\(s\) precisam de correção/);
  // A segunda revisão lê exatamente dois pedidos (as ressalvas e os cabeçalhos ficam de fora).
  const pedidos = itensDoParecer(parecer);
  assert.equal(pedidos.length, 2);
  assert.match(pedidos[0], /^1\. Post 1/);
  assert.match(pedidos[1], /^1\. Post 2/);
});

test("Vera: sem resposta do JEV é 'não sei', e não sei não reprova", () => {
  const av = avaliarNotas(pecas, {});
  const { veredito } = parecerDaRevisao({ avaliacoes: av, estilo: "video" });
  assert.equal(veredito, "APROVADO");
});

test("Vera: a pergunta do dado só vai para peça com número", async () => {
  const chamadas: Array<{ etapa: string; perguntas: Record<string, PerguntaDoJev> }> = [];
  const r = await veraRevisaPeloJev({ projectId: "p1", projeto: { nome: "Bem Natura", nicho: "cosméticos naturais" }, pecas }, jevFixo({}, chamadas));
  assert.ok(r);
  assert.equal(chamadas.length, 1);
  const chaves = Object.keys(chamadas[0].perguntas);
  assert.ok(chaves.includes("dado:post1"), "a legenda tem 62%: pergunta");
  assert.ok(!chaves.includes("dado:post2"), "a thread não tem dígito: não pergunta");
  assert.equal(r.veredito, "APROVADO");
});

test("Vera desligada (VERA_PRIMEIRA_PELO_JEV=0) devolve null para o Claude revisar", async () => {
  process.env.VERA_PRIMEIRA_PELO_JEV = "0";
  try {
    assert.equal(await veraRevisaPeloJev({ projectId: "p1", projeto: {}, pecas }, jevFixo({})), null);
  } finally {
    delete process.env.VERA_PRIMEIRA_PELO_JEV;
  }
});

// ─── a Vera sem Claude: a segunda revisão ───

test("segunda revisão: pedido não atendido volta como reprovação com a lista, sem Claude", async () => {
  const anterior = parecerDaRevisao({
    avaliacoes: avaliarNotas(pecas, { "dado:post1": 0.9, "pronto:post2": 0.1 }),
    estilo: "video",
  }).parecer;
  const d = await veraConfereCorrecaoPeloJev({ projectId: "p1", parecerAnterior: anterior, pecas }, jevFixo({ "ok:p1": 0.95, "ok:p2": 0.3, bloqueio: 0.05 }));
  assert.equal(d.decisao, "duvida");
  const pendentes = pendentesDaConferencia(d);
  assert.equal(pendentes.length, 1);
  assert.match(pendentes[0], /Post 2/);
  const parecer = parecerDaConferenciaPendente({ itens: d.itens, pendentes, estilo: "video" });
  assert.match(parecer, /2 pedido\(s\).*1 atendido/);
  assert.match(parecer, /VEREDITO: REPROVADO$/);
  assert.equal(vereditoPedeCorrecao("REPROVADO", parecer), true);
});

test("segunda revisão: tudo atendido e nada bloqueando aprova", async () => {
  const anterior = parecerDaRevisao({ avaliacoes: avaliarNotas(pecas, { "dado:post1": 0.9 }), estilo: "video" }).parecer;
  const d = await veraConfereCorrecaoPeloJev({ projectId: "p1", parecerAnterior: anterior, pecas }, jevFixo({ "ok:p1": 0.9, bloqueio: 0.1 }));
  assert.equal(d.decisao, "aprova");
  assert.deepEqual(pendentesDaConferencia(d), []);
});

test("segunda revisão: parecer antigo sem itens legíveis decide só pelo bloqueio", async () => {
  const d = await veraConfereCorrecaoPeloJev({ projectId: "p1", parecerAnterior: "A Vera achou o dia fraco e pediu mais garra.", pecas }, jevFixo({ bloqueio: 0.05 }));
  assert.equal(d.itens.length, 0);
  assert.equal(d.decisao, "aprova");
});

// ─── a Vera da campanha de texto: réguas medidas e rede errada ───

const tarefaDaCampanha = `Faça uma revisão de qualidade COMPLETA e CRÍTICA do conteúdo para Terça.

CONTEÚDO PARA REVISAR:
LinkedIn: texto

7. LIMITES DA REDE, medidos por código antes desta revisão (não são opinião):
   • Post do LinkedIn tem 3400 chars (limite: 3000)
   Se houver qualquer violação acima, o veredito é REPROVADO_TEXTO.
8. LASTRO DOS NÚMEROS, medido por código contra a PESQUISA BRUTA (não contra o brief):
   • todos os números do texto aparecem na pesquisa
   Se houver qualquer frase acima, o veredito é REPROVADO_TEXTO.
9. REDE CERTA NA ADAPTAÇÃO, medido por código (a decisão é sua):
   • Instagram: "seu post no LinkedIn está competindo com 16 mil criadores" (cita LinkedIn)
   • Facebook: "a pesquisa ouviu 16 mil criadores do LinkedIn" (cita LinkedIn)
   Julgue cada frase acima por SENTIDO, não por palavra.

O QUE REPROVA E O QUE É RESSALVA (regra de 21/09, e ela custa dinheiro):
REPROVADO só quando há algo que NÃO PODE ir ao ar.`;

test("réguas da tarefa: os marcadores de 7 e 8 reprovam sozinhos; os de 9 vão ao JEV por sentido", () => {
  const r = reguasDaTarefa(tarefaDaCampanha);
  assert.deepEqual(r.medidas, ["Post do LinkedIn tem 3400 chars (limite: 3000)"]);
  assert.equal(r.redeErrada.length, 2);
});

test("rede errada: só a frase que o JEV confirma vira régua", async () => {
  const r = await redeErradaPeloJev({ projectId: "p1", frases: reguasDaTarefa(tarefaDaCampanha).redeErrada }, jevFixo({ f1: 0.9, f2: 0.1 }));
  assert.equal(r.length, 1);
  assert.match(r[0], /seu post no LinkedIn/);
});

test("campanha: régua medida reprova o texto mesmo com o JEV aprovando as peças", async () => {
  const r = await veraRevisaNaCampanha(
    {
      projectId: "p1",
      projeto: { nome: "Areticon", nicho: "energia" },
      pecas: [{ id: "linkedin", rede: "linkedin", tipo: "post", texto: "Post longo demais sem número." }],
      tarefa: tarefaDaCampanha,
      midia: "GERADA com sucesso em 2 formato(s) de rede, conferência de margem aprovada",
    },
    jevFixo({ "pronto:linkedin": 0.9, "nicho:linkedin": 0.9, "regras:linkedin": 0.9, "rede:linkedin": 0.9, f1: 0.9, f2: 0.1 })
  );
  assert.ok(r);
  assert.equal(r.veredito, "REPROVADO_TEXTO");
  assert.match(r.parecer, /Réguas medidas por código/);
  assert.match(r.parecer, /3400 chars/);
  assert.match(r.parecer, /seu post no LinkedIn/);
  assert.doesNotMatch(r.parecer, /a pesquisa ouviu 16 mil/);
  // A reescrita do LinkedIn na esteira só dispara se o parecer liga "linkedin" a um problema.
  assert.match(r.parecer, /linkedin[\s\S]{0,400}(violação|invent|problem|reprovad|errad|incorret)/i);
});

test("campanha: mídia que falhou reprova a mídia; texto limpo e JEV com folga não reprova o texto", async () => {
  const tarefaLimpa = tarefaDaCampanha.replace("   • Post do LinkedIn tem 3400 chars (limite: 3000)", "   • nenhuma violação medida").replace(/   • Instagram:.*\n   • Facebook:.*\n/, "   • nenhuma adaptação cita outra rede\n");
  const r = await veraRevisaNaCampanha(
    { projectId: "p1", projeto: {}, pecas: [{ id: "linkedin", rede: "linkedin", tipo: "post", texto: "Post." }], tarefa: tarefaLimpa, midia: "FALHOU — apenas prompt salvo, sem imagem/vídeo real" },
    jevFixo({ "pronto:linkedin": 0.9, "nicho:linkedin": 0.9, "regras:linkedin": 0.9, "rede:linkedin": 0.9 })
  );
  assert.ok(r);
  assert.equal(r.veredito, "REPROVADO_MIDIA");
});

test("campanha, segunda revisão: tudo atendido com réguas limpas aprova; régua suja reprova com a lista", async () => {
  const tarefaLimpa = tarefaDaCampanha.replace("   • Post do LinkedIn tem 3400 chars (limite: 3000)", "   • nenhuma violação medida").replace(/   • Instagram:.*\n   • Facebook:.*\n/, "   • nenhuma adaptação cita outra rede\n");
  const anterior = "O QUE PRECISA MUDAR\n1. LinkedIn: a frase \"62% dos clientes\" não tem fonte; remova.\nVEREDITO: REPROVADO_TEXTO";
  const pecasDaCampanha = [{ id: "linkedin", rede: "linkedin", tipo: "post", texto: "Post sem número." }];
  const ok = await veraConfereNaCampanha({ projectId: "p1", parecerAnterior: anterior, tarefa: tarefaLimpa, midia: "NAO SOLICITADA (post de texto)", pecas: pecasDaCampanha }, jevFixo({ "ok:p1": 0.9, bloqueio: 0.1 }));
  assert.ok(ok.parecer);
  assert.match(ok.parecer, /VEREDITO: APROVADO$/);
  const suja = await veraConfereNaCampanha({ projectId: "p1", parecerAnterior: anterior, tarefa: tarefaDaCampanha, midia: "NAO SOLICITADA (post de texto)", pecas: pecasDaCampanha }, jevFixo({ "ok:p1": 0.9, bloqueio: 0.1, f1: 0.9, f2: 0.1 }));
  assert.ok(suja.parecer);
  assert.match(suja.parecer, /VEREDITO: REPROVADO_TEXTO$/);
  assert.match(suja.parecer, /3400 chars/);
  assert.equal(suja.porque.length, 2);
});

// ─── a conferência da arte: o código decide a contagem sobre a descrição ───

test("arte: a frase composta em código, transcrita com acento ou letra trocada, não é texto extra", () => {
  const fora = palavrasForaDoPermitido(["VOCE DEFENDE QUE CADA AVANCO PRECISA SER FINCADO", "?"], ["Você defende que cada avanço precisa ser fincado."]);
  assert.deepEqual(fora, []);
  assert.deepEqual(palavrasForaDoPermitido(["cada avanso precisa"], ["cada avanço precisa"]), []);
});

test("arte: palavra inventada pelo gerador reprova por contagem, mesmo com a grafia consertada pelo Haiku", () => {
  const d = decidirPelaDescricao(
    { textos: [{ texto: "Cada avanço precisa ser fincado.", onde: "centro", borda: "longe" }, { texto: "Linicar as informações", onde: "base", borda: "longe" }], pessoas: "nenhuma", cortado: "nada" },
    { textoEsperado: ["Cada avanço precisa ser fincado."] }
  );
  assert.ok(d.reprovou);
  assert.match(d.reprovou!, /texto além do permitido: "linicar as informacoes"/);
});

test("arte: gente onde não pode e elemento cortado reprovam; arte limpa aprova", () => {
  assert.match(decidirPelaDescricao({ textos: [], pessoas: "uma mulher sentada numa cadeira", cortado: "nada" }, { textoEsperado: [] }).reprovou ?? "", /tem pessoa/);
  assert.equal(decidirPelaDescricao({ textos: [], pessoas: "uma mulher sentada", cortado: "nada" }, { textoEsperado: [], permitirPessoas: true }).reprovou, null);
  assert.match(decidirPelaDescricao({ textos: [], pessoas: "nenhuma", cortado: "o selo redondo no canto" }, {}).reprovou ?? "", /cortado pela borda/);
  assert.equal(decidirPelaDescricao({ textos: [{ texto: "Cada avanço precisa ser fincado.", borda: "perto" }], pessoas: "nenhuma", cortado: "nada" }, { textoEsperado: ["Cada avanço precisa ser fincado."] }).reprovou, null, "a frase composta em código pode encostar: a margem dela é medida");
  assert.match(decidirPelaDescricao({ textos: [{ texto: "PASSO 1", borda: "cortado" }], pessoas: "nenhuma", cortado: "nada" }, { textoEsperado: ["Outra frase"] }).reprovou ?? "", /cortado ou encostado/);
});

// ─── a escolha do material pelo JEV ───

const foto = (id: string, usos: number, daCampanha = false, descricao = "foto"): MaterialDaMarca => ({ id, url: `https://x/${id}`, etiquetas: ["equipe"], descricao, palavrasEn: [], luz: null, orientacao: null, temRosto: false, usos, ultimoUsoEm: 0, daCampanha });

test("material: a escolha vale com confiança; entre empatadas ganha a menos usada; 'nenhuma' e dúvida devolvem null", () => {
  const lista = [foto("a", 5), foto("b", 1), foto("c", 9)];
  const r = (choice: string, probabilities: Record<string, number>, confidence = 0.9): RespostaDoJev => ({ type: "choice", choice, probabilities, confidence });
  assert.equal(escolhaDeMaterial(r("1", { "1": 0.5, "2": 0.45, "3": 0.05 }), lista)?.id, "b", "a 2 está a 0,05 da 1 e foi menos usada");
  assert.equal(escolhaDeMaterial(r("3", { "1": 0.1, "2": 0.1, "3": 0.8 }), lista)?.id, "c");
  assert.equal(escolhaDeMaterial(r("nenhuma", { nenhuma: 0.9 }), lista), null);
  assert.equal(escolhaDeMaterial(r("1", { "1": 0.6 }, 0.3), lista), null);
  assert.equal(escolhaDeMaterial(undefined, lista), null);
});

test("material: as marcadas na campanha são perguntadas primeiro; se nenhuma serve, o resto da biblioteca", async () => {
  const chamadas: Array<{ etapa: string; perguntas: Record<string, PerguntaDoJev> }> = [];
  const materiais = [foto("m1", 0, true, "o dono na loja"), foto("l1", 0, false, "o produto na mesa"), foto("l2", 2, false, "a fachada")];
  // Primeira chamada (marcadas): nenhuma serve; segunda (resto): a 1 ("l1").
  let vez = 0;
  const perguntar: Perguntar = async (ctx, perguntas) => {
    chamadas.push({ etapa: ctx.etapa, perguntas });
    vez++;
    const choice = vez === 1 ? "nenhuma" : "1";
    return { foto: { type: "choice", choice, probabilities: { [choice]: 0.9 }, confidence: 0.9 } };
  };
  const m = await decidirPeloJev({ materiais, frase: "O que ninguém vê", projectId: "p1" }, perguntar);
  assert.equal(m?.id, "l1");
  assert.equal(chamadas.length, 2);
  const c1 = chamadas[0].perguntas.foto as { criteria: Record<string, string> };
  assert.deepEqual(Object.keys(c1.criteria), ["1", "nenhuma"]);
  const c2 = chamadas[1].perguntas.foto as { criteria: Record<string, string> };
  assert.deepEqual(Object.keys(c2.criteria), ["1", "2", "nenhuma"]);
});

// ─── o fecho do corte pelo JEV ───

const finais: FraseNumerada[] = [
  { n: 1, texto: "Então o que eu fiz foi parar.", fim: 40 },
  { n: 2, texto: "E foi aí que a conta fechou.", fim: 48 },
  { n: 3, texto: "Porque o próximo passo é", fim: 52 },
];
const depois: FraseNumerada[] = [
  { n: 1, texto: "organizar a casa antes de crescer.", fim: 56 },
  { n: 2, texto: "Agora vamos falar de outra coisa.", fim: 62 },
];

test("fecho: concluído deixa o corte como está; na dúvida também", () => {
  assert.equal(decisaoDoFecho({ concluido: { type: "noul", noul: 0.9 } }, finais, depois).concluido, true);
  assert.equal(decisaoDoFecho({ concluido: { type: "noul", noul: 0.5 } }, finais, depois).concluido, true);
  assert.equal(decisaoDoFecho({}, finais, depois).concluido, true);
});

test("fecho: não concluído estende até a frase em que conclui, ou recua ao ponto fechado, ou sai sem onde fechar", () => {
  const ch = (choice: string, confidence = 0.9): RespostaDoJev => ({ type: "choice", choice, probabilities: { [choice]: 0.9 }, confidence });
  const nao = { type: "noul" as const, noul: 0.1 };
  assert.deepEqual(decisaoDoFecho({ concluido: nao, fecho: ch("1") }, finais, depois), { concluido: false, fraseDoFecho: 1, recuarAte: null, motivo: "conclui depois" });
  assert.deepEqual(decisaoDoFecho({ concluido: nao, fecho: ch("nenhuma"), recuo: ch("2") }, finais, depois), { concluido: false, fraseDoFecho: null, recuarAte: 2, motivo: "recua ao ponto fechado" });
  assert.equal(decisaoDoFecho({ concluido: nao, fecho: ch("1", 0.2), recuo: ch("2", 0.2) }, finais, depois).recuarAte, null, "escolha sem confiança não mexe no corte");
  // A última frase final nunca é opção de recuo.
  const p = perguntasDoFecho(finais, depois);
  assert.deepEqual(Object.keys((p.recuo as { criteria: Record<string, string> }).criteria), ["1", "2", "nenhuma"]);
  assert.deepEqual(Object.keys((p.fecho as { criteria: Record<string, string> }).criteria), ["1", "2", "nenhuma"]);
});

test("fecho: despedida do vídeo é regra de código e recua antes dela, sem perguntar ao JEV", async () => {
  const comDespedida: FraseNumerada[] = [...finais.slice(0, 2), { n: 3, texto: "Deus abençoe, até mais, se inscreve no canal.", fim: 60 }];
  assert.equal(recuoPorDespedida(comDespedida), 2);
  assert.equal(recuoPorDespedida(finais), null);
  let perguntou = false;
  const d = await conferirFechoPeloJev({ finais: comDespedida, frases: [] }, async () => {
    perguntou = true;
    return {};
  });
  assert.equal(perguntou, false);
  assert.deepEqual(d, { concluido: false, fraseDoFecho: null, recuarAte: 2, motivo: "termina na despedida do vídeo" });
});

test("fecho desligado (FECHO_PELO_JEV=0) devolve null para o Claude", async () => {
  process.env.FECHO_PELO_JEV = "0";
  try {
    assert.equal(await conferirFechoPeloJev({ finais, frases: depois }, async () => ({})), null);
  } finally {
    delete process.env.FECHO_PELO_JEV;
  }
});

// ─── os quadros da gravação: o modelo descreve, o código classifica ───

test("telas: câmera, tela e misto saem do que a visão descreveu", () => {
  assert.equal(tipoDoQuadro({ telaDeComputador: false, pessoaEmJanela: null }), "camera");
  assert.equal(tipoDoQuadro({ telaDeComputador: true, pessoaEmJanela: null }), "tela");
  assert.equal(tipoDoQuadro({ telaDeComputador: true, pessoaEmJanela: [0.75, 0.7, 0.25, 0.3] }), "misto");
  assert.equal(tipoDoQuadro({ telaDeComputador: true, pessoaEmJanela: "no canto" }), "tela", "caixa inválida não vira misto");
  assert.equal(tipoDoQuadro({}), "camera");
  assert.equal(tipoDoQuadro({ tipo: "misto" }), "misto", "formato antigo ainda vale");
});
