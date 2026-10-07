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
import { postsSemModelo, resumoDoEstilo } from "@/lib/estilo-dos-posts/tipos";
import { fotosDasLaminasRefeitas, registrarFotoDaPeca } from "@/lib/media/foto-da-peca";
import { designQueVale } from "@/lib/modelos-de-arte/identidade";

const fonte = (caminho: string) => readFileSync(new URL(`../../${caminho}`, import.meta.url), "utf8");

// 08/10, à tarde: a trava do estilo do projeto (só o dono cumpria) virou a
// escolha do modelo de cada post, que o membro também faz. A regra de não
// trancar o membro continua, agora sem nem perguntar quem ele é.
test("o membro da equipe não fica trancado: a escolha do post não depende de quem escolhe", () => {
  const posts = [{ chave: "4", rotulo: "Quinta", formato: "image" as const }];
  assert.equal(postsSemModelo(posts, { "4": { designId: "cmdesign1", nome: "Aquarela" } }).length, 0, "escolhido por qualquer um, segue");
  // A rota deixa o membro CRIAR um modelo para o post; o estilo do projeto continua do dono.
  const rota = fonte("app/api/projects/[id]/estilo-dos-posts/route.ts");
  assert.ok(/if \(!paraOPost\) \{\s*const recusa = await soODono\(/.test(rota), "só o estilo do projeto é do dono");
  assert.ok(rota.includes("if (paraOPost) {"), "para o post, cria sem aprovar o estilo do projeto");
  // O último usado de cada tipo (PATCH) não pede o dono.
  const patch = rota.slice(rota.indexOf("export async function PATCH"));
  assert.ok(!patch.includes("soODono"), "guardar o último modelo usado não é configuração do dono");
});

test("a janela da campanha e a jornada do vídeo não leem mais quem pode mudar para trancar", () => {
  const modal = fonte("components/posts/campaign-setup-modal.tsx");
  assert.ok(!modal.includes("podeMudarEstilo") && !modal.includes("esperaODono"), "a janela não tem mais o caminho só do dono");
  const jornada = fonte("components/posts/jornada-da-campanha.tsx");
  assert.ok(!jornada.includes("podeMudarEstilo") && !jornada.includes("esperaODono"));
  assert.ok(jornada.includes("postsSemModelo(postsDaSemana, modelosDaSemana(semanaAtual))"), "a jornada confere os dias da semana");
});

test("o envio não pisca: a conferência dos modelos sai da semana na tela, sem esperar a rede", () => {
  const jornada = fonte("components/posts/jornada-da-campanha.tsx");
  assert.ok(!jornada.includes("estiloLido"), "nada de leitura do servidor antes do cartão de envio");
  assert.ok(jornada.includes("const postsDaSemana = postsVisuaisDaSemana(semanaAtual);"));
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

test("sem passo sem saída: a lista dos modelos que não carrega não tranca a geração", () => {
  const modal = fonte("components/posts/campaign-setup-modal.tsx");
  const jornada = fonte("components/posts/jornada-da-campanha.tsx");
  assert.ok(modal.includes("aoCarregar={(ok) => setModelosFalharam(!ok)}") && modal.includes("const faltamModelos = modelosFalharam ? [] :"));
  assert.ok(jornada.includes("aoCarregar={(ok) => setModelosFalharam(!ok)}") && jornada.includes("const faltamModelos = modelosFalharam ? [] :"));
  // A lista avisa que dá para seguir e oferece tentar de novo.
  const lista = fonte("components/estilo-dos-posts/modelos-dos-posts.tsx");
  assert.ok(lista.includes("Você ainda pode seguir") && lista.includes("Tentar de novo"));
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
  // 08/10, à tarde: o chat saiu para o componente de criar (falando ou escrevendo).
  const passo = fonte("components/estilo-dos-posts/criar-estilo.tsx");
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
    "components/estilo-dos-posts/criar-estilo.tsx",
    "components/posts/jornada-da-campanha.tsx",
    "app/api/projects/[id]/estilo-dos-posts/route.ts",
    "scripts/testes/estilo-dos-posts-revisao-0810.test.mts",
  ]) {
    assert.ok(!fonte(arquivo).includes(String.fromCharCode(0x2014)), arquivo);
  }
});
