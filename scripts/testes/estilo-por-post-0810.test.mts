// O modelo escolhido por post e o estilo criado por texto ou por áudio (08/10/2026, à tarde).
// As regras do Bruno, literais: "vamos promover, incentivar o usuário criar o
// seu estilo, a partir de um texto ou um áudio, e isso vai alimentar a
// biblioteca para todos os demais (nunca usar fotos reais, dados reais nos
// modelos) essa parte só cria o modelo, depois no quadro a IA coloca o
// conteúdo dentro do modelo selecionado ou criado"; e "o modelo precisa ser
// escolhido por post (quarta é um carrossel, precisa escolher o modelo),
// quinta é uma foto (escolher modelo) etc... sexta é um vídeo curto (short,
// reel e tiktok) escolher o estilo".
// Nada aqui toca banco, IA, rede ou imagem paga: a Deepgram é uma resposta de
// mentira, a biblioteca é um depósito em memória e o JEV e o redator são fakes.
// Rodar: npx tsx --test scripts/testes/estilo-por-post-0810.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { textoDaFala, transcreverFalaCurta } from "@/lib/media/fala-curta";
import {
  designServeAoPost,
  escolhaDoDesign,
  modelosDaPeca,
  modelosParaGravar,
  oQueOPostPede,
  padraoDaImagemDoEstado,
  pecaAprovada,
  pedidoDaConversa,
  postsSemModelo,
  preencherModelos,
  type ModelosDosPosts,
  type PostVisual,
} from "@/lib/estilo-dos-posts/tipos";
import { dadoDoClienteNoTexto, entradaParaAGaleria, MARCA_DA_RESERVA } from "@/lib/biblioteca-de-design/tipos";
import { registrarPedidoDeDesign, type DepositoDaBiblioteca, type LinhaDoDesign, type ServicosDoRegistro } from "@/lib/biblioteca-de-design/registro";
import { trechosDoPedido } from "@/lib/biblioteca-de-design/privacidade";
import {
  diaComFormato,
  diaDoCorte,
  diasDaSemana,
  diasDeVideoCurto,
  modelosDaSemana,
  normalizarSemana,
  planoParaGravar,
  postsVisuaisDaSemana,
  semanaComModelos,
} from "@/lib/media/semana-do-video";
import { escolhaNoEstiloDoDia } from "@/lib/media/estilo-do-comando";
import { formatoPeloTamanho, modeloDaPeca, modeloPorId } from "@/lib/modelos-de-arte/catalogo";
import { modeloDoDesign, registrarModeloDoCliente } from "@/lib/modelos-de-arte/modelo-do-cliente";
import { preencherPromptDoModelo } from "@/lib/modelos-de-arte/prompt-do-modelo";
import { preencherCena, promptDoModelo } from "@/lib/modelos-de-arte/prompts-com-foto";

const fonte = (caminho: string) => readFileSync(new URL(`../../${caminho}`, import.meta.url), "utf8");
const CORES = { acento: "#f97316", escuro: "#1e1f22", claro: "#dbdee1" } as never;

// ─────────────── 1. o áudio vira o texto do pedido ───────────────

/** Uma Deepgram de mentira: devolve o que mandarem e guarda o que recebeu. */
function deepgramDeMentira(resposta: { status?: number; corpo: unknown }) {
  const chamadas: Array<{ url: string; init: RequestInit }> = [];
  const fazerFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(resposta.corpo), { status: resposta.status ?? 200 });
  }) as typeof fetch;
  return { fazerFetch, chamadas };
}

const RESPOSTA_DA_FALA = { results: { channels: [{ alternatives: [{ transcript: "  Quero fundo escuro,   letra grande e branca e a cor da marca só no destaque " }] }] } };

test("o áudio vira o texto do pedido, pelo mesmo caminho do texto escrito", async () => {
  const { fazerFetch, chamadas } = deepgramDeMentira({ corpo: RESPOSTA_DA_FALA });
  const audio = Buffer.alloc(5000, 7);
  const r = await transcreverFalaCurta(audio, "audio/webm;codecs=opus", { alternativa: "Escreva como você quer", onde: "teste", chave: "chave-de-mentira", fazerFetch });
  assert.deepEqual(r, { ok: true, texto: "Quero fundo escuro, letra grande e branca e a cor da marca só no destaque" });
  assert.equal(chamadas.length, 1);
  assert.ok(chamadas[0].url.startsWith("https://api.deepgram.com/v1/listen?"), chamadas[0].url);
  assert.ok(chamadas[0].url.includes("language=pt-BR") && chamadas[0].url.includes("mip_opt_out=true"), "português, fora do treino do fornecedor");
  assert.equal(new Headers(chamadas[0].init.headers).get("Content-Type"), "audio/webm;codecs=opus", "o tipo que o navegador gravou");
  // O texto falado é a primeira mensagem do pedido, como o escrito; o ajuste vem depois, igual.
  if (!r.ok) return;
  assert.equal(pedidoDaConversa([r.texto]), r.texto);
  const comAjuste = pedidoDaConversa([r.texto, "mais colorido"]);
  assert.ok(comAjuste.startsWith("Quero fundo escuro") && comAjuste.includes("1) mais colorido"), comAjuste);
});

test("a fala que não serve volta com o motivo, e a pessoa pode escrever", async () => {
  const audio = Buffer.alloc(5000, 7);
  const semChave = await transcreverFalaCurta(audio, "audio/webm", { alternativa: "Escreva como você quer", onde: "teste", chave: null });
  assert.deepEqual(semChave, { ok: false, status: 503, erro: "A transcrição de voz não está disponível agora. Escreva como você quer." });
  const ok = deepgramDeMentira({ corpo: RESPOSTA_DA_FALA });
  const curta = await transcreverFalaCurta(Buffer.alloc(200), "audio/webm", { alternativa: "Escreva como você quer", onde: "teste", chave: "x", fazerFetch: ok.fazerFetch });
  assert.equal(curta.ok ? 0 : curta.status, 400);
  const longa = await transcreverFalaCurta(Buffer.alloc(4 * 1024 * 1024 + 1), "audio/webm", { alternativa: "Escreva como você quer", onde: "teste", chave: "x", fazerFetch: ok.fazerFetch });
  assert.equal(longa.ok ? 0 : longa.status, 413);
  assert.equal(ok.chamadas.length, 0, "nem curta nem longa demais chegam ao fornecedor");
  const falhou = await transcreverFalaCurta(audio, "audio/webm", { alternativa: "Escreva como você quer", onde: "teste", chave: "x", fazerFetch: deepgramDeMentira({ status: 500, corpo: { erro: 1 } }).fazerFetch });
  assert.ok(!falhou.ok && falhou.status === 502 && falhou.erro.includes("escreva como você quer"), JSON.stringify(falhou));
  const muda = await transcreverFalaCurta(audio, "audio/webm", { alternativa: "Escreva como você quer", onde: "teste", chave: "x", fazerFetch: deepgramDeMentira({ corpo: { results: { channels: [{ alternatives: [{ transcript: "   " }] }] } } }).fazerFetch });
  assert.equal(muda.ok ? 0 : muda.status, 422);
  assert.equal(textoDaFala(null), "");
});

test("a tela grava, a rota transcreve com o transcritor que já existia, e o texto segue como mensagem do cliente", () => {
  const rota = fonte("app/api/projects/[id]/estilo-dos-posts/voz/route.ts");
  assert.ok(rota.includes("transcreverFalaCurta(") && rota.includes("podeUsarProjeto("), "quem usa o projeto fala; a fala vira texto");
  assert.ok(!rota.includes("registrarPedidoDeDesign"), "a rota da voz só transcreve: o registro é o do texto escrito");
  // O comando falado do vídeo usa o mesmo transcritor (uma chamada à Deepgram só no código).
  assert.ok(fonte("app/api/projects/[id]/comando-do-video/voz/route.ts").includes("transcreverFalaCurta("));
  const tela = fonte("components/estilo-dos-posts/criar-estilo.tsx");
  assert.ok(tela.includes("new MediaRecorder(stream)") && tela.includes("/estilo-dos-posts/voz"));
  assert.ok(tela.includes("await enviar(d.texto, true);"), "a fala entra no mesmo envio do texto");
  // Sem dependência nova.
  const pacote = JSON.parse(fonte("package.json")) as { dependencies?: Record<string, string> };
  assert.ok(!Object.keys(pacote.dependencies ?? {}).some((d) => d.includes("deepgram")), "nada de SDK novo");
});

// ─────────────── 2. o modelo é só o modelo ───────────────

const PEDIDO = "Fundo escuro com recortes de papel, cor da marca só no destaque. Logo da Clínica Sorriso no canto, meu WhatsApp (11) 99999-0000 embaixo; foto do Dr. Paulo sorrindo";
const DADOS = { nomes: ["Clínica Sorriso", "Paulo Andrade", "paulo.andrade"] };
const DO_CLIENTE = /sorriso|whatsapp|99999|paulo|logo/i;

/** A biblioteca num depósito em memória: o fluxo inteiro sem banco. */
function bibliotecaEmMemoria() {
  const linhas: LinhaDoDesign[] = [];
  const elos: Array<{ projectId: string; designId: string; comoEntrou: string }> = [];
  const deposito: DepositoDaBiblioteca = {
    async repetido(projectId, tipo, pedido) {
      return linhas.find((l) => l.criadoPorProjectId === projectId && l.tipo === tipo && l.pedidoOriginal === pedido)?.id ?? null;
    },
    async candidatos(_projectId, tipo) {
      return linhas.filter((l) => l.tipo === tipo && l.publico).map((l) => ({ id: l.id, nome: l.nome, descricao: l.descricao, linguagem: l.linguagem }));
    },
    async criar(linha) {
      const l: LinhaDoDesign = { ...linha, id: `cmdesign${linhas.length + 1}`, usos: 0, catalogoId: null, createdAt: new Date("2026-10-08T15:00:00Z") };
      linhas.push(l);
      return l;
    },
    async ligar(o) {
      elos.push({ projectId: o.projectId, designId: o.designId, comoEntrou: o.comoEntrou });
    },
    async ler() {
      return null;
    },
    async dadosDoCliente() {
      return DADOS;
    },
  };
  return { deposito, linhas, elos };
}

/** O JEV de mentira: visual é o trecho sem marca, contato ou pessoa. */
const separarPeloJev: ServicosDoRegistro["separar"] = async ({ pedido }) => {
  const trechos = trechosDoPedido(pedido);
  const visual = trechos.filter((t) => !DO_CLIENTE.test(t));
  return { visual, doCliente: trechos.length - visual.length, peloJev: true };
};

/** O redator de mentira: escreve a ficha com o texto que recebeu (é assim que se vê o que chegou nele). */
const redator: ServicosDoRegistro["escrever"] = async (e) => ({
  ficha: {
    nome: "Papel recortado no escuro",
    descricao: "Fundo escuro com recortes de papel e a cor da marca só no destaque.",
    linguagem: `Dark background with torn paper cutouts, editorial collage, a calm lower third for the headline printed in code, no text in the image, brand colors only as small accents. Brief: ${e.pedido}`,
  },
  origem: "redator",
});

function servicos(extra: Partial<ServicosDoRegistro> = {}) {
  const b = bibliotecaEmMemoria();
  const s: ServicosDoRegistro = {
    deposito: b.deposito,
    comparar: async () => ({ veredito: "novo" }),
    separar: separarPeloJev,
    escrever: redator,
    conferir: async () => true,
    ...extra,
  };
  return { s, ...b };
}

const PEDIDO_DO_PROJETO = { projectId: "cmprojeto", userId: "cmusuario", tipo: "imagem" as const, pedido: PEDIDO, nicho: "odontologia", publico: "pais de crianças" };

test("o modelo que entra na biblioteca de todos leva só o visual: nem foto, nem nome, nem contato", async () => {
  const { s, linhas, elos } = servicos();
  const r = await registrarPedidoDeDesign(PEDIDO_DO_PROJETO, s);
  assert.ok(r, "o modelo foi criado");
  assert.equal(linhas.length, 1);
  const linha = linhas[0];
  assert.equal(linha.publico, true, "o padrão é compartilhar");
  assert.equal(r?.soNoProjeto, null);
  for (const campo of [linha.nome, linha.descricao, linha.linguagem, linha.pedidoOriginal]) {
    assert.ok(!DO_CLIENTE.test(campo), `vazou dado do cliente: ${campo}`);
  }
  assert.ok(linha.pedidoOriginal.startsWith("Fundo escuro com recortes de papel"), "o pedido gravado é o visual");
  assert.equal(linha.previaUrl, null, "nenhuma imagem nasce com o modelo");
  assert.ok(!/odontologia|crian/i.test(linha.linguagem), "o nicho e o público do projeto não vão para a ficha pública");
  assert.equal(linha.criadoPorProjectId, "cmprojeto", "quem pediu fica guardado, nunca na tela");
  assert.deepEqual(elos, [{ projectId: "cmprojeto", designId: linha.id, comoEntrou: "pedido" }], "o modelo fica ligado ao projeto");
});

test("a rede de segurança em código tira da galeria o que o JEV ou o redator deixaram passar", async () => {
  // O JEV de mentira marca TUDO como visual: o telefone chegaria à galeria sem a rede.
  const tudoVisual: ServicosDoRegistro["separar"] = async ({ pedido }) => ({ visual: trechosDoPedido(pedido), doCliente: 0, peloJev: true });
  const a = servicos({ separar: tudoVisual });
  const ra = await registrarPedidoDeDesign(PEDIDO_DO_PROJETO, a.s);
  assert.equal(a.linhas[0].publico, false);
  assert.equal(ra?.soNoProjeto, "ficha-com-dado-do-cliente");

  // O redator escreve o nome do projeto na ficha: só no projeto.
  const comNome: ServicosDoRegistro["escrever"] = async (e) => ({ ...(await redator(e)), ficha: { ...(await redator(e)).ficha, nome: "Estilo Clínica Sorriso" } });
  const b = servicos({ escrever: comNome });
  await registrarPedidoDeDesign(PEDIDO_DO_PROJETO, b.s);
  assert.equal(b.linhas[0].publico, false);

  // A conferência do JEV na ficha diz que ela cita o cliente: só no projeto.
  const c = servicos({ conferir: async () => false });
  const rc = await registrarPedidoDeDesign(PEDIDO_DO_PROJETO, c.s);
  assert.equal(c.linhas[0].publico, false);
  assert.equal(rc?.soNoProjeto, "ficha-com-dado-do-cliente");

  // Sem o JEV, nada é público.
  const d = servicos({ separar: async ({ pedido }) => ({ visual: [], doCliente: trechosDoPedido(pedido).length, peloJev: false }) });
  const rd = await registrarPedidoDeDesign(PEDIDO_DO_PROJETO, d.s);
  assert.equal(d.linhas[0].publico, false);
  assert.equal(rd?.soNoProjeto, "sem-conferencia");

  // "Só no meu projeto" não passa pela separação e guarda o pedido inteiro, só para ele.
  let separou = false;
  const e = servicos({ separar: async (x) => ((separou = true), separarPeloJev(x)) });
  const re = await registrarPedidoDeDesign({ ...PEDIDO_DO_PROJETO, soNoMeuProjeto: true }, e.s);
  assert.equal(separou, false);
  assert.equal(e.linhas[0].publico, false);
  assert.equal(re?.soNoProjeto, "pedido-do-cliente");
  // Em toda linha privada a prévia também nasce vazia.
  for (const x of [a, b, c, d, e]) assert.equal(x.linhas[0].previaUrl, null);
});

test("a regra pura da entrada: contato, link, arquivo de imagem e nome nunca são públicos", () => {
  for (const [texto, motivo] of [
    ["fale comigo em contato@clinica.com.br", "e-mail"],
    ["siga @clinicasorriso", "perfil de rede"],
    ["veja www.minhaloja.com", "site ou link"],
    ["use a foto retrato-paulo.jpg", "arquivo de imagem"],
    ["ligue (11) 98888-7777", "telefone"],
  ] as const) {
    assert.equal(dadoDoClienteNoTexto(texto), motivo, texto);
  }
  assert.equal(dadoDoClienteNoTexto("Colagem com recortes da Clinica Sorriso", DADOS), "nome do cliente", "sem acento também");
  assert.equal(dadoDoClienteNoTexto("Retrato do Paulo na frente do título", DADOS), "nome do cliente");
  assert.equal(dadoDoClienteNoTexto("Dark clinical look with frosted glass, brand colors only as small accents", DADOS), null, "palavra genérica do nome do negócio não é dado");
  assert.equal(dadoDoClienteNoTexto("Fundo escuro, letra grande, 4:5"), null);

  const ficha = { nome: "Vidro claro", descricao: "Painéis de vidro claros.", linguagem: "Bright frosted glass panels, calm lower third for the headline, brand colors only as small accents." };
  const publica = entradaParaAGaleria({ pedido: "Vidro claro. Meu WhatsApp 11 99999-0000", separacao: { visual: ["Vidro claro"], peloJev: true }, ficha, fichaPor: "redator", fichaLimpa: true });
  assert.equal(publica.publico, true);
  assert.equal(publica.pedidoGravado, "Vidro claro", "a linha pública guarda só o visual");
  assert.equal(publica.previaUrl, null);
  const reserva = entradaParaAGaleria({ pedido: "Vidro claro", separacao: { visual: ["Vidro claro"], peloJev: true }, ficha: { ...ficha, linguagem: `${MARCA_DA_RESERVA}: vidro` }, fichaPor: "reserva", fichaLimpa: true });
  assert.equal(reserva.publico, false, "a ficha de reserva copia o pedido cru: nunca pública");
});

test("a tela incentiva criar e compartilhar, com a biblioteca como alternativa", () => {
  const criar = fonte("components/estilo-dos-posts/criar-estilo.tsx");
  assert.ok(criar.includes("O seu estilo vira um modelo na biblioteca de todos."));
  assert.ok(criar.includes("nunca as suas fotos, o seu nome, a sua marca ou os seus dados"));
  assert.ok(criar.includes("const [soNoMeuProjeto, setSoNoMeuProjeto] = useState(false);"), "compartilhar é o padrão");
  for (const arquivo of ["components/estilo-dos-posts/estilo-dos-posts.tsx", "components/estilo-dos-posts/modelos-dos-posts.tsx"]) {
    const tela = fonte(arquivo);
    const criarAqui = tela.indexOf('"Crie o seu estilo, falando ou escrevendo"');
    const biblioteca = tela.indexOf('"Ou escolha da biblioteca"');
    assert.ok(criarAqui > 0 && criarAqui < biblioteca, `${arquivo}: criar vem primeiro`);
    assert.ok(/useState<[^>]*>\("criar"\)/.test(tela), `${arquivo}: abre em criar`);
  }
});

// ─────────────── 3. a escolha por post, obrigatória antes de gerar ───────────────

const SEMANA: PostVisual[] = [
  { chave: "3", rotulo: "Quarta", formato: "carousel" },
  { chave: "4", rotulo: "Quinta", formato: "image" },
  { chave: "5", rotulo: "Sexta", formato: "short" },
  { chave: "6", rotulo: "Sábado", formato: "infographic" },
];

test("cada tipo de post pede a sua escolha: modelo, estilo de edição ou só a marca", () => {
  assert.equal(oQueOPostPede("carousel"), "modelo");
  assert.equal(oQueOPostPede("image"), "modelo");
  assert.equal(oQueOPostPede("short"), "edicao");
  assert.equal(oQueOPostPede("infographic"), "marca");
  assert.equal(oQueOPostPede("video"), "marca");
  assert.equal(oQueOPostPede("text"), null);
  assert.equal(oQueOPostPede("thread"), null);
});

test("sem a escolha de cada dia visual, a campanha não gera", () => {
  assert.deepEqual(postsSemModelo(SEMANA, {}).map((p) => p.chave), ["3", "4", "5", "6"]);
  const quase: ModelosDosPosts = {
    "3": { catalogoId: "foto-inteira-degrade", nome: "Foto inteira" },
    "4": { designId: "cmdesign1", nome: "Papel recortado" },
    "5": { designId: "cmdesign1", nome: "Um modelo de imagem num vídeo curto" },
    "6": { marca: true },
  };
  assert.deepEqual(postsSemModelo(SEMANA, quase).map((p) => p.chave), ["5"], "o vídeo curto pede estilo de edição, não modelo de imagem");
  const tudo = { ...quase, "5": { estiloId: "hormozi", nome: "Corte com legenda dinâmica" } };
  assert.deepEqual(postsSemModelo(SEMANA, tudo), []);
  // O que vai para a esteira: só os dias visuais, e só a escolha que serve ao dia.
  const gravar = modelosParaGravar(SEMANA.slice(0, 2), { ...tudo, "9": { designId: "x" } });
  assert.deepEqual(Object.keys(gravar), ["3", "4"]);
});

test("a escolha vem preenchida com o último usado em cada tipo, e a pessoa troca", () => {
  const ultimos = { carousel: { designId: "cmcarrossel", nome: "Carrossel de sempre" }, image: { catalogoId: "foto-inteira-degrade", nome: "Foto inteira" }, short: { estiloId: "vox", nome: "Explicativo editorial" } };
  const preenchido = preencherModelos(SEMANA, {}, { ultimos, padraoDaImagem: { designId: "cmestilo", nome: "Estilo do projeto" }, padraoDaEdicao: { estiloId: "hormozi", nome: "Hormozi" } });
  assert.equal(preenchido["3"].designId, "cmcarrossel", "o carrossel vem com o último carrossel");
  assert.equal(preenchido["4"].catalogoId, "foto-inteira-degrade", "a foto vem com a última foto");
  assert.equal(preenchido["5"].estiloId, "vox", "o vídeo curto vem com o último estilo de edição");
  assert.equal(preenchido["6"].marca, true, "o infográfico sai na marca");
  assert.deepEqual(postsSemModelo(SEMANA, preenchido), []);
  // Sem último, o estilo do projeto; sem nada, a pessoa escolhe.
  const semUltimo = preencherModelos(SEMANA, {}, { padraoDaImagem: { designId: "cmestilo", nome: "Estilo do projeto" } });
  assert.equal(semUltimo["3"].designId, "cmestilo");
  assert.equal(semUltimo["5"], undefined, "sem estilo de edição conhecido, falta escolher");
  assert.deepEqual(postsSemModelo(SEMANA, preencherModelos(SEMANA, {}, {})).map((p) => p.chave), ["3", "4", "5"]);
  // O que a pessoa já escolheu não é trocado pelo preenchimento.
  const meu = preencherModelos(SEMANA, { "3": { designId: "cmmeu", nome: "Meu" } }, { ultimos });
  assert.equal(meu["3"].designId, "cmmeu");
  // O padrão da imagem sai do estilo aprovado do projeto (o design criado, senão o book).
  assert.deepEqual(padraoDaImagemDoEstado({ aprovada: true, design: { id: "cmd", nome: "Aquarela", descricao: "", previaUrl: null }, modelos: [] }), { designId: "cmd", nome: "Aquarela" });
  assert.deepEqual(padraoDaImagemDoEstado({ aprovada: true, design: null, modelos: [{ id: "foto-inteira-degrade", nome: "Foto inteira" }] }), { catalogoId: "foto-inteira-degrade", nome: "Foto inteira" });
  assert.equal(padraoDaImagemDoEstado({ aprovada: false, design: null, modelos: [] }), null);
});

test("só os modelos que servem ao tipo do post aparecem na biblioteca daquele dia", () => {
  const formatos = (id: string) => modeloPorId(id)?.formatos;
  assert.equal(designServeAoPost({ tipo: "video", catalogoId: null }, "image"), false, "estilo de vídeo não é modelo de post");
  assert.equal(designServeAoPost({ tipo: "imagem", catalogoId: null }, "carousel", formatos), true, "o modelo criado serve aos dois");
  const soStory = ["story"];
  assert.equal(designServeAoPost({ tipo: "imagem", catalogoId: "x" }, "carousel", () => soStory), false);
  assert.equal(designServeAoPost({ tipo: "imagem", catalogoId: "x" }, "image", () => ["post"]), true);
  assert.deepEqual(escolhaDoDesign({ id: "cmseed", nome: "Foto inteira", catalogoId: "foto-inteira-degrade" }), { designId: "cmseed", catalogoId: "foto-inteira-degrade", nome: "Foto inteira" });
});

test("na semana do vídeo a escolha mora no dia, sem coluna nova, e trocar o formato tira a escolha", () => {
  const plano = { versao: 2, inicio: "2026-10-12", dias: {
    "3": { formato: "carousel", redes: ["instagram"], modelo: { designId: "cmcarrossel", nome: "Carrossel" } },
    "4": { formato: "image", redes: ["instagram"], modelo: { estiloId: "vox" } },
    "5": { formato: "short", redes: ["youtube"], modelo: { estiloId: "hormozi", nome: "Hormozi" } },
  } };
  const semana = normalizarSemana(plano, undefined, false);
  assert.deepEqual(semana.dias["3"]?.modelo, { designId: "cmcarrossel", nome: "Carrossel" });
  assert.equal(semana.dias["4"]?.modelo, undefined, "estilo de edição num dia de foto não vale");
  assert.equal(semana.dias["5"]?.modelo?.estiloId, "hormozi");
  // Vai e volta do banco do mesmo jeito.
  assert.deepEqual(normalizarSemana(planoParaGravar(semana), undefined, false).dias["3"]?.modelo, semana.dias["3"]?.modelo);
  // Trocar o formato do dia (o planejador usa diaComFormato) tira a escolha; trocar as redes, não.
  assert.equal(diaComFormato("short").modelo, undefined);
  assert.equal({ ...semana.dias["3"]!, redes: ["linkedin" as const] }.modelo?.designId, "cmcarrossel");
  // Os posts visuais em ordem de data, com o dia e o tipo.
  const posts = postsVisuaisDaSemana(semana, "2026-10-12");
  assert.deepEqual(posts.map((p) => [p.chave, p.formato]), [["3", "carousel"], ["4", "image"], ["5", "short"]]);
  assert.ok(posts[0].rotulo.startsWith("Quarta"), posts[0].rotulo);
  assert.deepEqual(postsSemModelo(posts, modelosDaSemana(semana)).map((p) => p.chave), ["4"]);
  // A escolha nova grava no dia; a que não serve ao formato não entra.
  const nova = semanaComModelos(semana, { "4": { designId: "cmfoto", nome: "Foto" }, "5": { designId: "errado" } });
  assert.equal(nova.dias["4"]?.modelo?.designId, "cmfoto");
  assert.equal(nova.dias["5"]?.modelo, undefined, "modelo de imagem no vídeo curto não entra");
  // A esteira recebe a escolha de cada dia escrito e o estilo de cada dia de vídeo curto.
  assert.equal(diasDaSemana(semana).find((d) => d.dia === 3)?.modelo?.designId, "cmcarrossel");
  assert.deepEqual(diasDeVideoCurto(semana), [{ dia: 5, redes: ["youtube"], estiloId: "hormozi" }]);
});

test("a janela da campanha e a jornada do vídeo só geram com todo dia visual escolhido", () => {
  const modal = fonte("components/posts/campaign-setup-modal.tsx");
  assert.ok(modal.includes("disabled={conferindoSobreposicao || faltamModelos.length > 0}"), "o Gerar do passo dos modelos espera todos");
  assert.ok(modal.includes("modelosParaGravar(postsVisuais, modelosDosPosts)"), "a escolha vai no config da campanha");
  assert.ok(modal.includes('origens[k]?.modo !== "meu"'), "dia com material próprio não pede modelo");
  const jornada = fonte("components/posts/jornada-da-campanha.tsx");
  assert.ok(jornada.includes("disabled={passo === PASSO_DOS_POSTS && faltamModelos.length > 0}"));
  assert.ok(jornada.includes("semanaComModelos(semanaAtual, m)") && jornada.includes("salvarSemana(nova)"), "a escolha grava no videoSemana do projeto");
  // O membro grava a semana pelo PATCH do projeto (campo da jornada de envio).
  assert.ok(fonte("lib/equipe/permissoes.ts").includes('CAMPOS_DO_ENVIO = ["videoSemana"'));
});

// ─────────────── 4. a arte usa o modelo do post ───────────────

test("o modelo do post manda na arte daquele post, e escolher é aprovar o post", () => {
  assert.deepEqual(modelosDaPeca({ doPost: "foto-inteira-degrade", doProjeto: "design-cmprojeto", book: ["a", "b"] }), ["foto-inteira-degrade"], "o do post é o único");
  assert.deepEqual(modelosDaPeca({ doPost: null, doProjeto: "design-cmprojeto", book: ["a"] }), ["design-cmprojeto"]);
  assert.deepEqual(modelosDaPeca({ book: ["a", "b"] }), ["a", "b"]);
  assert.equal(modelosDaPeca({}), undefined);
  assert.equal(pecaAprovada({ identidadeAprovada: false, escolhidoParaOPost: true }), true, "o post com modelo escolhido sai");
  assert.equal(pecaAprovada({ identidadeAprovada: false, escolhidoParaOPost: false }), false, "sem escolha e sem aprovação, espera sem gastar");
  // O book escolhe a peça entre os modelos da marca: com um só, é ele, no carrossel e na foto.
  const doPost = modelosDaPeca({ doPost: "foto-inteira-degrade", book: ["voce-na-frente-do-titulo"] })!;
  assert.equal(modeloDaPeca(doPost, formatoPeloTamanho(1080, 1350, true), "Planeje antes de comprar")?.id, "foto-inteira-degrade");
  assert.equal(modeloDaPeca(doPost, formatoPeloTamanho(1080, 1350), "Planeje antes de comprar")?.id, "foto-inteira-degrade");
});

test("o modelo criado pelo cliente vira o molde, e a IA coloca o conteúdo do dia dentro dele", () => {
  const criado = modeloDoDesign({ id: "cmcriado", nome: "Papel recortado no escuro", descricao: "Recortes de papel no escuro.", linguagem: "Dark background with torn paper cutouts, editorial collage, brand colors only as small accents." })!;
  registrarModeloDoCliente(criado);
  assert.equal(modeloPorId("design-cmcriado")?.nome, "Papel recortado no escuro");
  const modelo = modeloDaPeca(modelosDaPeca({ doPost: criado.id })!, "carrossel", "O carro certo cabe no seu bolso")!;
  assert.equal(modelo.id, "design-cmcriado");
  const prompt = preencherCena(
    preencherPromptDoModelo({ ...modelo, prompt: promptDoModelo(modelo)! }, { cores: CORES, titulo: "O carro certo cabe no seu bolso", formato: "carrossel" }),
    "a car key resting on a paper calculator"
  );
  assert.ok(prompt.includes("torn paper cutouts"), "o modelo (a linguagem) manda");
  assert.ok(prompt.includes("a car key resting on a paper calculator"), "a cena do dia entra dentro dele");
  assert.ok(prompt.includes('"O carro certo cabe no seu bolso"'), "a manchete do dia é composta por cima, em código");
  assert.ok(!/\{\w+\}/.test(prompt), prompt);
});

test("a esteira entrega o modelo de cada post à arte, e o refazer parte dele", () => {
  const esteira = fonte("lib/pipeline/executar.ts");
  assert.ok(esteira.includes("modeloParaOFormato(config.modelosDosPosts?.[String(dayOfWeek)], resolvedType)"));
  assert.ok(esteira.includes("marcaDaArte(project.id, { runId, modeloDoPost: modeloDoDia })"));
  assert.ok(/chave: chaveDoCarrossel,[\s\S]{0,300}marca: marcaDaPeca,/.test(esteira), "o carrossel recebe a marca do dia (antes lia a do projeto de novo)");
  const semana = fonte("lib/media/pecas-da-semana.ts");
  assert.ok(semana.includes("marcaDaArte(video.projectId, { runId: run.id, modeloDoPost: modelo ?? null })"));
  const arte = fonte("lib/media/arte-com-frase.tsx");
  assert.ok(arte.includes("modelosDaPeca({ doPost: doPost?.modeloId, doProjeto: doCliente, book: escolha?.ids })"));
  assert.ok(arte.includes("pecaAprovada({ identidadeAprovada: identidade?.aprovada, escolhidoParaOPost: Boolean(doPost) })"));
  const chat = fonte("lib/media/pedido-do-card.ts");
  assert.equal((chat.match(/modeloDoPost: modeloDosPosts\(/g) ?? []).length, 3, "trava, carrossel refeito e arte refeita");
});

test("o vídeo curto é montado no estilo de edição escolhido para o dia dele", () => {
  // O dia do corte: a mesma conta do quadro (os aprovados, em ordem, nos dias de vídeo curto).
  const trechos = [
    { publicar: true, midia: { vertical: { url: "a" } } },
    { publicar: false, midia: { vertical: { url: "b" } } },
    { publicar: true, midia: { vertical: { url: "c" } } },
    { publicar: true, midia: null },
    { publicar: true, midia: { vertical: { url: "e" } } },
  ];
  const dias = [{ dia: 3, estiloId: "vox" }, { dia: 5, estiloId: "hormozi" }];
  assert.equal(diaDoCorte(trechos, 0, dias)?.dia, 3);
  assert.equal(diaDoCorte(trechos, 1, dias), null, "corte desmarcado não tem dia");
  assert.equal(diaDoCorte(trechos, 2, dias)?.dia, 5);
  assert.equal(diaDoCorte(trechos, 3, dias), null, "sem vertical, sem dia");
  assert.equal(diaDoCorte(trechos, 4, dias)?.dia, 3, "mais cortes que dias: dá a volta");
  assert.equal(diaDoCorte(trechos, 0, []), null);
  // A escolha do projeto reescrita no estilo do dia; o mesmo estilo não muda nada.
  const projeto = { estiloId: "vox", camera: [], efeitos: ["colagem"], look: "papel", texto: "do meu jeito", legenda: { modo: "auto" } };
  const noDia = escolhaNoEstiloDoDia(projeto, "serio", "hormozi")!;
  assert.equal(noDia.escolha.estiloId, "hormozi");
  assert.equal(noDia.videoStyle, "acelerado");
  assert.deepEqual(noDia.escolha.efeitos, [], "a colagem do Vox não vai para o Hormozi");
  assert.equal(noDia.escolha.look, null);
  assert.equal(noDia.escolha.texto, undefined, "o texto era do estilo do projeto");
  assert.equal(escolhaNoEstiloDoDia(projeto, "serio", "vox"), null, "o mesmo do projeto: vale tudo como estava, inclusive o comando");
  assert.equal(escolhaNoEstiloDoDia(projeto, "serio", "nao-existe"), null);
  assert.equal(escolhaNoEstiloDoDia(projeto, "serio", null), null);
  // A montagem usa o estilo do dia em cada corte, e o comando daquele estilo.
  const montagem = fonte("lib/media/montagem-nos-cortes.ts");
  assert.ok(montagem.includes("const video = videoNoEstiloDoDia(videoDoProjeto, diaDoCorte(trechos, i, diasCurtos)?.estiloId);"));
  assert.ok(montagem.includes("const comando = video.estiloDoDia ? comandoPadrao(ctx.escolha) :"));
  assert.ok(fonte("lib/media/sincronizar-quadro.ts").includes("diaDoCorte(trechos, indice, diasDeCorte)"), "o quadro e a montagem contam igual");
});

test("nenhum texto novo usa travessão", () => {
  for (const arquivo of [
    "lib/media/fala-curta.ts",
    "lib/estilo-dos-posts/tipos.ts",
    "lib/estilo-dos-posts/servidor.ts",
    "lib/biblioteca-de-design/registro.ts",
    "lib/media/semana-do-video.ts",
    "lib/media/estilo-do-comando.ts",
    "components/estilo-dos-posts/criar-estilo.tsx",
    "components/estilo-dos-posts/modelos-dos-posts.tsx",
    "components/estilo-dos-posts/estilo-dos-posts.tsx",
    "components/posts/jornada-da-campanha.tsx",
    "app/api/projects/[id]/estilo-dos-posts/route.ts",
    "app/api/projects/[id]/estilo-dos-posts/voz/route.ts",
    "scripts/testes/estilo-por-post-0810.test.mts",
  ]) {
    assert.ok(!fonte(arquivo).includes(String.fromCharCode(0x2014)), arquivo);
  }
  // Em tipos.ts da biblioteca o sinal só existe na regra que o troca por vírgula (semTravessao); o texto novo não tem.
  const regra = fonte("lib/biblioteca-de-design/tipos.ts").split("O MODELO É SÓ O MODELO")[1].split("A busca na galeria")[0];
  assert.ok(!regra.includes(String.fromCharCode(0x2014)));
});
