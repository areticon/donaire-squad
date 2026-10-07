// O estilo dos posts como passo único, e só foto enviada pelo cliente (08/10/2026).
// As decisões do Bruno: "isso precisa ser um quadro de chat para o usuário
// escrever como ele quer o estilo dos posts, ou ele pode escolher estilos da
// biblioteca"; "só use foto em post se for foto enviada pelo usuário"; e "o
// usuário gera a campanha toda e só no final descobre que está faltando
// aprovar o estilo". Nada aqui toca banco, IA, rede ou imagem paga.
// Rodar: npx tsx --test scripts/testes/estilo-dos-posts-0810.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { designDepoisDaMudanca, identidadeAprovada } from "@/lib/modelos-de-arte/identidade";
import { pedidoDaConversa, precisaEscolherEstilo, resumoDoEstilo } from "@/lib/estilo-dos-posts/tipos";
import { OBJETO_SEM_PESSOA, SEM_PESSOA, fotoDoPrompt, preencherPromptDoModelo } from "@/lib/modelos-de-arte/prompt-do-modelo";
import { FIGURANTE_ANONIMO, OBJETO_ANONIMO } from "@/lib/modelos-de-arte/prompts-vox";
import { modeloPorId } from "@/lib/modelos-de-arte/catalogo";
import { fotoDoClienteEntra, fundoInteiroDoModelo, promptDoModelo } from "@/lib/modelos-de-arte/prompts-com-foto";
import { fotoDaPeca, metadataDaFoto, registrarFotoDaPeca } from "@/lib/media/foto-da-peca";
import { referenciaDaPessoa } from "@/lib/media/referencia-da-pessoa";

const fonte = (caminho: string) => readFileSync(new URL(`../../${caminho}`, import.meta.url), "utf8");
const PALETA = ["#f97316", "#1e1f22", "#dbdee1"];
const PAPEIS = { fundo: "#1e1f22", titulo: "#ffffff", destaque: "#f97316" };
const CORES = { acento: "#f97316", escuro: "#1e1f22", claro: "#dbdee1" } as never;

// ── (b) O design escrito vale como aprovado ─────────────────────────────────

test("o design escrito na biblioteca destrava a arte sem modelo do book", () => {
  const comDesign = { letra: "moderna" as const, papeis: PAPEIS, aprovadaEm: "2026-10-08T10:00:00Z", design: "cmdesign1" };
  assert.equal(identidadeAprovada(comDesign, [], PALETA), true, "design aprovado, nenhum modelo do book");
  assert.equal(identidadeAprovada(comDesign, null, PALETA), true);
  assert.equal(identidadeAprovada({ ...comDesign, design: null }, [], PALETA), false, "sem design e sem book, segue aguardando");
  assert.equal(identidadeAprovada({ ...comDesign, aprovadaEm: null }, [], PALETA), false, "sem o carimbo, nada sai");
  // A paleta trocada continua derrubando, com ou sem design.
  assert.equal(identidadeAprovada({ ...comDesign, papeis: { ...PAPEIS, destaque: "#ef6122" } }, [], PALETA), false);
});

test("o design fica até o cliente mexer no book ou pedir outro", () => {
  assert.equal(designDepoisDaMudanca("d1", {}), "d1", "mexer na letra não tira o design");
  assert.equal(designDepoisDaMudanca("d1", { modelosMudaram: true }), null, "trocou os modelos do book: volta ao book");
  assert.equal(designDepoisDaMudanca("d1", { design: "d2" }), "d2");
  assert.equal(designDepoisDaMudanca("d1", { design: null }), null);
  assert.equal(designDepoisDaMudanca(null, { design: "d3", modelosMudaram: true }), "d3", "pedido explícito manda");
});

// ── (a) O chat e a trava antes de gerar ─────────────────────────────────────

test("as mensagens do chat viram um pedido, e o último ajuste manda", () => {
  assert.equal(pedidoDaConversa(["  Fundo escuro,   letra grande  "]), "Fundo escuro, letra grande");
  const p = pedidoDaConversa(["Colagem de papel, estilo revista.", "mais escuro", "sem pessoa"]);
  assert.ok(p.startsWith("Colagem de papel, estilo revista."), p);
  assert.ok(p.includes("1) mais escuro; 2) sem pessoa"), p);
  assert.ok(p.includes("o último manda"), p);
  assert.equal(pedidoDaConversa(["", "   "]), "");
});

test("o pedido do chat cabe no teto: saem os ajustes mais antigos, nunca o primeiro nem o último", () => {
  const ajustes = Array.from({ length: 30 }, (_, i) => `ajuste número ${i} com algum texto para ocupar espaço`);
  const p = pedidoDaConversa(["O estilo base que eu quero", ...ajustes], 400);
  assert.ok(p.length <= 400, String(p.length));
  assert.ok(p.startsWith("O estilo base que eu quero"));
  assert.ok(p.includes("ajuste número 29"), "o último ajuste fica");
  assert.ok(!p.includes("ajuste número 0 "), "o mais antigo sai");
  const longo = pedidoDaConversa(["x".repeat(1000), "sem pessoa"], 200);
  assert.ok(longo.length <= 200 && longo.includes("sem pessoa"), longo);
});

test("a campanha só para no passo do estilo quando há arte e o estilo sabidamente não está aprovado", () => {
  assert.equal(precisaEscolherEstilo({ temArte: true, aprovada: false }), true);
  assert.equal(precisaEscolherEstilo({ temArte: true, aprovada: true }), false);
  assert.equal(precisaEscolherEstilo({ temArte: false, aprovada: false }), false, "só texto não precisa de estilo de arte");
  assert.equal(precisaEscolherEstilo({ temArte: true, aprovada: null }), false, "estado ainda chegando não trava");
});

test("a linha do estilo diz como os posts saem", () => {
  assert.equal(resumoDoEstilo(null), "O estilo dos posts ainda não foi escolhido.");
  assert.equal(resumoDoEstilo({ aprovada: true, design: { id: "d", nome: "Aquarela", descricao: "", previaUrl: null }, modelos: [] }), 'Seus posts saem no estilo "Aquarela".');
  assert.equal(resumoDoEstilo({ aprovada: true, design: null, modelos: [{ id: "a", nome: "A" }, { id: "b", nome: "B" }, { id: "c", nome: "C" }] }), 'Seus posts saem nos modelos "A", "B" e "C".');
  assert.equal(resumoDoEstilo({ aprovada: false, design: null, modelos: [{ id: "a", nome: "A" }] }), "O estilo dos posts ainda não foi escolhido.");
});

// ── (c) Só foto enviada pelo cliente ────────────────────────────────────────

test("sem foto do cliente, o lugar da foto vira objeto e o prompt proíbe gente (nunca o figurante)", () => {
  const vox = modeloPorId("papel-com-titulo-e-faixa-rasgada")!;
  assert.equal(fotoDoClienteEntra(vox), true, "modelo com o lugar de você");
  assert.equal(fundoInteiroDoModelo(vox), true, "colagem: a composição continua, sem pessoa");
  const sem = preencherPromptDoModelo({ ...vox, prompt: promptDoModelo(vox)! }, { cores: CORES, titulo: "O lance certo encurta a espera", formato: "post" });
  assert.ok(sem.includes(OBJETO_SEM_PESSOA), "objeto no lugar da pessoa");
  assert.ok(sem.endsWith(SEM_PESSOA), "a linha que proíbe gente fecha o prompt");
  assert.ok(!sem.includes(FIGURANTE_ANONIMO), "nada de pessoa inventada");
  assert.ok(!/\{\w+\}/.test(sem), sem);

  const com = preencherPromptDoModelo({ ...vox, prompt: promptDoModelo(vox)! }, { cores: CORES, titulo: "O lance certo", foto: "a man in a blue shirt, smiling", formato: "post" });
  assert.ok(com.includes("the person or subject from the reference photo (a man in a blue shirt, smiling)"));
  assert.ok(!com.includes(SEM_PESSOA), "com a foto do cliente, a pessoa é ele");

  // O modelo cujo lugar é documento segue com o objeto dele.
  assert.deepEqual(fotoDoPrompt("frase-com-carimbo-e-foto", null), { foto: OBJETO_ANONIMO, semPessoa: true });
  assert.equal(fotoDoPrompt("qualquer", "  ").semPessoa, true);
});

test("modelo de cena, sem lugar de foto, não ganha linha extra", () => {
  const cena = modeloPorId("foto-inteira-degrade")!;
  const p = preencherPromptDoModelo({ ...cena, prompt: promptDoModelo(cena)! }, { cores: CORES, titulo: "Planeje a troca do carro", formato: "post" });
  assert.ok(!p.includes(SEM_PESSOA));
  assert.ok(p.includes("No people."), "o próprio prompt já diz sem gente");
});

test("a referência da pessoa nunca cai no quadro do vídeo", async () => {
  // Mesmo recebendo o id de um vídeo (chamador antigo), sem foto da pessoa na biblioteca não há referência.
  const ref = await referenciaDaPessoa({ materiais: [], frase: "qualquer", projectId: "p1", videoJobId: "cmvideo" } as never);
  assert.equal(ref, null);
  const codigo = fonte("lib/media/referencia-da-pessoa.ts");
  assert.ok(!/quadroDeReferenciaDoVideo|melhor-quadro"|\/melhor-quadro`/.test(codigo.replace(/\/\*[\s\S]*?\*\//g, "")), "o caminho do quadro saiu do código");
  // A peça da semana do vídeo não leva mais o vídeo na marca.
  const semana = fonte("lib/media/pecas-da-semana.ts");
  assert.ok(!/marcaDoDia\.videoJobId\s*=/.test(semana));
  assert.ok(!/videoJobId: base\.videoJobId/.test(semana));
  assert.ok(!/videoJobId\?:/.test(fonte("lib/media/arte-com-frase.tsx").split("export type MarcaDaArte")[1].split("};")[0]), "a marca da arte não tem mais o campo do vídeo");
});

test("cada arte registra qual foto entrou: biblioteca, gerada ou nenhuma", () => {
  registrarFotoDaPeca("Frase da imagem", { fonte: "material", materialId: "cmmat1" });
  assert.deepEqual(fotoDaPeca(" Frase da imagem "), { fonte: "material", materialId: "cmmat1" });
  assert.deepEqual(metadataDaFoto(["Frase da imagem"]), { fotoDaPeca: { fonte: "material", materialId: "cmmat1" } });
  registrarFotoDaPeca("Lâmina 1", { fonte: "gerada" });
  assert.deepEqual(metadataDaFoto(["Lâmina 1", "Lâmina sem registro"]), { fotosDasLaminas: [{ fonte: "gerada" }, { fonte: "nenhuma" }] });
  assert.deepEqual(metadataDaFoto(["nada registrado"]), {}, "sem registro, o post fica como antes");
  // "material" sem o id não prova nada: vira "nenhuma".
  registrarFotoDaPeca("Sem id", { fonte: "material" });
  assert.deepEqual(fotoDaPeca("Sem id"), { fonte: "nenhuma" });
  // A refeita sobrescreve a anterior da mesma manchete.
  registrarFotoDaPeca("Frase da imagem", { fonte: "gerada" });
  assert.deepEqual(fotoDaPeca("Frase da imagem"), { fonte: "gerada" });
});

// ── (a) e (d) As telas: o passo aparece antes de gerar e no assistente ─────

test("a janela da campanha abre o passo do estilo no lugar de gerar quando ele falta", () => {
  const modal = fonte("components/posts/campaign-setup-modal.tsx");
  assert.ok(modal.includes("precisaEscolherEstilo({ temArte: campanhaTemArte, aprovada: identidadeAprovada, podeMudar: podeMudarEstilo })"));
  assert.ok(/onClick=\{faltaOEstilo \? \(\) => setPedindoEstilo\(true\) : handleConfirm\}/.test(modal), "o botão abre o passo");
  assert.ok(/setPedindoEstilo\(false\);\s*handleConfirm\(\);/.test(modal), "aprovado, a campanha gera sozinha");
  assert.ok(!modal.includes("<AvisoDaIdentidade"), "o aviso de 10 px saiu do rodapé");
});

test("a jornada do vídeo tem o passo dos posts antes do envio, e o pulo não passa por cima", () => {
  const jornada = fonte("components/posts/jornada-da-campanha.tsx");
  const posts = jornada.indexOf('chave: "posts"');
  const envio = jornada.indexOf('chave: "envio"');
  assert.ok(posts > 0 && posts < envio, "posts vem antes do envio");
  assert.ok(jornada.includes("faltaOEstilo && passo === PASSOS_DO_VIDEO.length - 1) setPasso(PASSO_DOS_POSTS)"));
  assert.ok(jornada.includes("setPasso(faltaOEstilo && !semGravacao ? PASSO_DOS_POSTS : total - 1)"));
});

test("o assistente do projeto pede fotos e estilo logo depois da Marca", () => {
  const board = fonte("components/kanban/kanban-board.tsx");
  const marca = board.indexOf('chave: "marca"');
  const materiais = board.indexOf('chave: "materiais"');
  const voz = board.indexOf('chave: "voz"');
  assert.ok(marca > 0 && marca < materiais && materiais < voz);
  assert.ok(board.includes('{chave === "materiais" && <StepMateriais projectId={project.id} />}'));
  const passo = fonte("components/kanban/step-materiais.tsx");
  assert.ok(passo.includes("<BibliotecaDeMateriais") && passo.includes("<EstiloDosPosts"), "reaproveita os componentes que já existem");
});

test("nenhum texto novo usa travessão", () => {
  for (const arquivo of [
    "lib/estilo-dos-posts/tipos.ts",
    "lib/estilo-dos-posts/servidor.ts",
    "lib/media/foto-da-peca.ts",
    "components/estilo-dos-posts/estilo-dos-posts.tsx",
    "components/kanban/step-materiais.tsx",
    "app/api/projects/[id]/estilo-dos-posts/route.ts",
  ]) {
    assert.ok(!fonte(arquivo).includes(String.fromCharCode(0x2014)), arquivo);
  }
});
