// A revisão do estilo dos posts (08/10/2026): os buracos achados depois da
// primeira entrega. O membro da equipe não pode ficar trancado num passo que
// só o dono cumpre; a aprovação que cai por mudança na marca se refaz com um
// clique; e a foto de cada lâmina fica registrada também no carrossel sem
// foto do cliente e no "refazer" do chat do card. Nada aqui toca banco, IA,
// rede ou imagem paga.
// Rodar: npx tsx --test scripts/testes/estilo-dos-posts-revisao-0810.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { artesEsperamODono, precisaEscolherEstilo, resumoDoEstilo } from "@/lib/estilo-dos-posts/tipos";
import { fotosDasLaminasRefeitas, registrarFotoDaPeca } from "@/lib/media/foto-da-peca";
import { designQueVale } from "@/lib/modelos-de-arte/identidade";

const fonte = (caminho: string) => readFileSync(new URL(`../../${caminho}`, import.meta.url), "utf8");

test("o membro da equipe não fica trancado no passo do estilo: gera, e a arte espera o dono", () => {
  // Dono (ou estado sem a informação): o passo aparece antes de gerar.
  assert.equal(precisaEscolherEstilo({ temArte: true, aprovada: false, podeMudar: true }), true);
  assert.equal(precisaEscolherEstilo({ temArte: true, aprovada: false }), true, "sem saber quem é, vale a regra do dono");
  // Membro: não para no passo que ele não pode cumprir.
  assert.equal(precisaEscolherEstilo({ temArte: true, aprovada: false, podeMudar: false }), false);
  // E a tela avisa que a arte espera o dono, só quando é esse o caso.
  assert.equal(artesEsperamODono({ temArte: true, aprovada: false, podeMudar: false }), true);
  assert.equal(artesEsperamODono({ temArte: true, aprovada: true, podeMudar: false }), false, "aprovado, nada espera");
  assert.equal(artesEsperamODono({ temArte: false, aprovada: false, podeMudar: false }), false, "só texto, nada espera");
  assert.equal(artesEsperamODono({ temArte: true, aprovada: false, podeMudar: true }), false, "o dono resolve no passo");
  assert.equal(artesEsperamODono({ temArte: true, aprovada: null, podeMudar: false }), false, "estado chegando não avisa");
});

test("a janela da campanha e a jornada do vídeo passam quem pode mudar para a regra", () => {
  const modal = fonte("components/posts/campaign-setup-modal.tsx");
  assert.ok(modal.includes("podeMudar: podeMudarEstilo"), "a janela lê quem pode mudar");
  assert.ok(modal.includes("{esperaODono && ("), "a janela avisa o membro");
  const jornada = fonte("components/posts/jornada-da-campanha.tsx");
  assert.ok(jornada.includes("precisaEscolherEstilo({ temArte: comArte, aprovada: estiloDosPosts, podeMudar: podeMudarEstilo })"));
  assert.ok(jornada.includes("{esperaODono && !semGravacao && ("), "a jornada avisa o membro no envio");
});

test("a jornada relê o estilo a cada abertura antes de mostrar o envio", () => {
  const jornada = fonte("components/posts/jornada-da-campanha.tsx");
  assert.ok(/if \(aberto\) \{\s*setPasso\(passoInicial\);\s*setEstiloLido\(false\);/.test(jornada), "reabrir zera a leitura");
});

test("aprovação que caiu com o design gravado: a linha diz a verdade", () => {
  const design = { id: "d1", nome: "Aquarela", descricao: "Aquarela leve", previaUrl: null };
  const caiu = resumoDoEstilo({ aprovada: false, design, modelos: [] });
  assert.ok(caiu.includes('"Aquarela"') && caiu.includes("aprovado de novo"), caiu);
  assert.ok(!caiu.includes("ainda não foi escolhido"), "o design foi escolhido; o que falta é aprovar de novo");
  assert.equal(resumoDoEstilo({ aprovada: false, design: null, modelos: [] }), "O estilo dos posts ainda não foi escolhido.");
  // O passo oferece o clique que aprova o mesmo design, e a rota aceita o design ligado ao projeto.
  const passo = fonte("components/estilo-dos-posts/estilo-dos-posts.tsx");
  assert.ok(passo.includes("estado.podeMudar && !estado.aprovada && estado.design"));
  const rota = fonte("app/api/projects/[id]/estilo-dos-posts/route.ts");
  assert.ok(rota.includes("?? (await designAprovadoDoProjeto(id, designId))"));
});

test("o design aprovado manda só se veio depois da última escolha do book (a Vera troca o book direto)", () => {
  const registro = { design: "d1", aprovadaEm: "2026-10-08T10:00:00Z" };
  assert.equal(designQueVale(registro, "2026-10-07T09:00:00Z"), "d1", "book escolhido antes: vale o design");
  assert.equal(designQueVale(registro, null), "d1", "sem book: vale o design");
  assert.equal(designQueVale(registro, "2026-10-08T11:00:00Z"), null, "book trocado depois (pela Vera): vale o book");
  assert.equal(designQueVale({ design: null, aprovadaEm: registro.aprovadaEm }, null), null);
  assert.equal(designQueVale(registro, "data torta"), "d1", "data ilegível não derruba o que o cliente aprovou");
  // A leitura do estado usa a régua só com a identidade aprovada (sem ela, o design aparece para o "Aprovar de novo").
  const leitura = fonte("lib/modelos-de-arte/identidade-aprovada.ts");
  assert.ok(leitura.includes("design: aprovada ? designQueVale(registro, escolha?.em) : (registro?.design ?? null)"));
});

test("o passo avisa quem abriu quando o estilo já chegou aprovado (sem passo sem saída)", () => {
  const modal = fonte("components/posts/campaign-setup-modal.tsx");
  const jornada = fonte("components/posts/jornada-da-campanha.tsx");
  assert.ok(/aoLer=\{\(e\) => \{[\s\S]*?if \(e\.aprovada\) \{\s*setIdentidadeAprovada\(true\);\s*setPedindoEstilo\(false\);/.test(modal));
  assert.ok(/aoLer=\{\(e\) => \{[\s\S]*?if \(e\.aprovada\) setEstiloDosPosts\(true\);/.test(jornada));
});

test("refazer só algumas lâminas: as refeitas pelo registro novo, as outras como estavam", () => {
  registrarFotoDaPeca("Lâmina refeita com a foto", { fonte: "material", materialId: "cmmat9" });
  registrarFotoDaPeca("Lâmina refeita sem foto", { fonte: "gerada" });
  const frases = ["Capa que ficou", "Lâmina refeita com a foto", "Lâmina refeita sem foto", "Lâmina que falhou"];
  const antes = [{ fonte: "gerada" }, { fonte: "gerada" }, { fonte: "material", materialId: "cmvelho" }, { fonte: "material", materialId: "cmmat2" }];
  assert.deepEqual(fotosDasLaminasRefeitas(frases, [1, 2], antes), [
    { fonte: "gerada" },
    { fonte: "material", materialId: "cmmat9" },
    { fonte: "gerada" },
    { fonte: "material", materialId: "cmmat2" },
  ]);
  // Nada gravado antes e nada registrado: o post fica como estava.
  assert.equal(fotosDasLaminasRefeitas(["sem registro 1", "sem registro 2"], [0], undefined), null);
  // Gravado torto no banco não vira fonte inventada.
  assert.deepEqual(fotosDasLaminasRefeitas(["a", "Lâmina refeita sem foto"], [1], [{ fonte: "quadro-do-video" }, null]), [{ fonte: "nenhuma" }, { fonte: "gerada" }]);
  assert.deepEqual(fotosDasLaminasRefeitas(["x"], [], [{ fonte: "material" }]), [{ fonte: "nenhuma" }], "material sem id não prova nada");
});

test("o carrossel sem foto do cliente registra a cena gerada de cada lâmina", () => {
  const carrossel = fonte("lib/media/carrossel.ts");
  assert.ok(carrossel.includes('registrarFotoDaPeca(opcoes.roteiro[i].frase, { fonte: arte ? "gerada" : "nenhuma" })'));
  // E o refazer pelo chat do card e pela correção da Vera também gravam a fonte.
  const pedido = fonte("lib/media/pedido-do-card.ts");
  assert.ok(pedido.includes("...metadataDaFoto([manchete])"));
  assert.ok(pedido.includes("fotosDasLaminasRefeitas(frases, refeitas,"));
  assert.ok(fonte("lib/media/correcao-do-dia-do-video.ts").includes("Object.assign(postMeta, metadataDaFoto([frase]))"));
});

test("o chat pede uma frase no primeiro envio e aceita ajuste curto depois", () => {
  const passo = fonte("components/estilo-dos-posts/estilo-dos-posts.tsx");
  assert.ok(passo.includes("const MINIMO_DO_PEDIDO = 12;"), "o mesmo mínimo da rota");
  assert.ok(passo.includes("const minimo = jaTemPedido ? MINIMO_DO_AJUSTE : MINIMO_DO_PEDIDO;"));
  // A rota recusa pedido com menos de 12 letras: o mínimo da tela não pode ser menor.
  const rota = fonte("app/api/projects/[id]/estilo-dos-posts/route.ts");
  assert.ok(rota.includes("if (pedido.length < 12)"));
  // A mensagem que falhou sai da conversa (senão o reenvio entrava duas vezes no pedido).
  assert.ok(passo.includes('lastIndexOf("cliente")'));
});

test("nenhum texto da revisão usa travessão", () => {
  for (const arquivo of [
    "lib/estilo-dos-posts/tipos.ts",
    "lib/media/foto-da-peca.ts",
    "components/estilo-dos-posts/estilo-dos-posts.tsx",
    "components/posts/jornada-da-campanha.tsx",
    "app/api/projects/[id]/estilo-dos-posts/route.ts",
    "scripts/testes/estilo-dos-posts-revisao-0810.test.mts",
  ]) {
    assert.ok(!fonte(arquivo).includes(String.fromCharCode(0x2014)), arquivo);
  }
});
