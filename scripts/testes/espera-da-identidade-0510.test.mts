// A espera da identidade visual em todo caminho que cria peça com arte
// (05/10/2026, noite). O caso real: carrossel de segunda para o X por "Nova
// campanha" (post único) saiu sem a Diana, sem a marca de espera e sem o
// card, e o quadro disse "esperando você aprovar" sobre um post sem arte.
// Tudo com mocks: nada aqui toca banco, IA, rede ou imagem paga.
// Rodar: npx tsx --test scripts/testes/espera-da-identidade-0510.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TEXTO_DO_CARD_AGUARDANDO,
  ROTULO_DO_BOTAO_ESCOLHER,
  avisoDaTroca,
  chaveDoGrupo,
  conteudoDoCardAguardando,
  contarArtesEsperando,
  diaPedeArte,
  esperaDaIdentidade,
  esperaDaPeca,
  fraseDaAprovacao,
  marcarEspera,
  marcarFalha,
  marcarGerando,
  pecaBaseDoDia,
  semEspera,
  tipoGeraArte,
  TETO_DA_GERACAO_MS,
} from "@/lib/modelos-de-arte/espera-da-identidade";
import { IdentidadeNaoAprovada, MENSAGEM_AGUARDANDO, ehIdentidadeNaoAprovada } from "@/lib/modelos-de-arte/identidade";
import { agruparPorDia, type ArteAguardando } from "@/lib/media/artes-aguardando-identidade";
import { custoDeRefazerPeca } from "@/lib/credits/estimativa";

type Peca = { platform: string; content: string; dayOfWeek: number };

// ── 1. A esteira (campanha de 1 post, "pôr algo aqui", semana inteira) ───────

test("esteira: a campanha só de X tem peça base para a Diana (o caso de 05/10)", () => {
  const twPost: Peca = { platform: "twitter", content: "1/ Ser cristão no trabalho não é ser educado...", dayOfWeek: 1 };
  // Antes: Diana só com LinkedIn. Agora: o X (ou qualquer peça do dia) serve.
  assert.equal(pecaBaseDoDia(undefined, twPost, [twPost]), twPost);
  const liPost: Peca = { platform: "linkedin", content: "Texto longo", dayOfWeek: 1 };
  assert.equal(pecaBaseDoDia(liPost, twPost, [liPost, twPost]), liPost, "com LinkedIn, ele continua sendo a base");
  const igPost: Peca = { platform: "instagram", content: "Legenda", dayOfWeek: 1 };
  assert.equal(pecaBaseDoDia(undefined, undefined, [igPost]), igPost, "sem LinkedIn nem X, qualquer peça do dia");
  assert.equal(pecaBaseDoDia(undefined, undefined, []), undefined);
});

test("esteira: o dia pede a Diana pelo tipo, e não pela rede", () => {
  assert.equal(diaPedeArte("carousel", false), true);
  assert.equal(diaPedeArte("image", false), true);
  assert.equal(diaPedeArte("infographic", false), true);
  assert.equal(diaPedeArte("video", false), true);
  assert.equal(diaPedeArte("text", false), false);
  assert.equal(diaPedeArte("thread", false), false);
  assert.equal(diaPedeArte("poll", false), false);
  assert.equal(diaPedeArte("carousel", true), false, "material próprio do cliente ocupa o lugar da Diana");
});

test("esteira: sem identidade aprovada, o post e o card da Diana saem marcados do mesmo jeito", () => {
  // O metadata que a esteira grava no post de campanha ({ formato }) ganha a marca.
  const meta = marcarEspera({ formato: "feed" });
  assert.deepEqual(meta, { formato: "feed", aguardandoIdentidade: true });
  assert.deepEqual(esperaDaIdentidade({ imageUrl: null, metadata: meta }), { estado: "aguardando" });
  // O card da Diana: a tela do quadro (campaign-kanban) reconhece pelo começo do texto.
  const card = conteudoDoCardAguardando("carousel");
  assert.ok(card.startsWith(MENSAGEM_AGUARDANDO));
  assert.ok(card.startsWith(TEXTO_DO_CARD_AGUARDANDO));
  assert.equal(card.split("\n\nPrompt: ")[1], "carousel", "o prompt fica depois do aviso, como a esteira sempre gravou");
  assert.equal(ROTULO_DO_BOTAO_ESCOLHER, "Escolher e aprovar");
});

// ── 2. A semana do vídeo ─────────────────────────────────────────────────────

test("semana do vídeo: o post derivado do vídeo marcado fica aguardando, imagem e carrossel", () => {
  const imagem = { imageUrl: null, metadata: { origem: "video", frase: "Uma frase", aguardandoIdentidade: true } };
  const carrossel = { imageUrl: null, metadata: { origem: "video", carrossel: true, slides: ["a", "b"], aguardandoIdentidade: true } };
  assert.equal(esperaDaIdentidade(imagem)?.estado, "aguardando");
  assert.equal(esperaDaIdentidade(carrossel)?.estado, "aguardando");
  // Quando a arte sai, a marca some e a espera acaba.
  assert.equal(esperaDaIdentidade({ imageUrl: "https://x/arte.png", metadata: semEspera(imagem.metadata) }), null);
});

// ── 3. O chat do card ────────────────────────────────────────────────────────

test("chat do card: a trava é reconhecida e os posts do dia ficam aguardando sem a arte antiga", () => {
  const erro = new IdentidadeNaoAprovada();
  assert.equal(ehIdentidadeNaoAprovada(erro), true);
  assert.ok(erro.message.startsWith(MENSAGEM_AGUARDANDO));
  // A mensagem que o chat devolve começa pelo mesmo aviso do card.
  const resposta = `${MENSAGEM_AGUARDANDO}: escolha o modelo de arte, a letra e as cores em Configurações (aba Modelos) e aprove.`;
  assert.ok(resposta.startsWith(MENSAGEM_AGUARDANDO));
  // O post que tinha a arte velha (feita antes da identidade) é marcado e perde a arte.
  const post = { imageUrl: "https://x/velha.png", mediaType: "carousel", metadata: { formato: "feed", arte: { modelo: "x" } } };
  assert.equal(tipoGeraArte(post.mediaType), true);
  const depois = { imageUrl: null, metadata: marcarEspera(post.metadata) };
  assert.equal(esperaDaIdentidade(depois)?.estado, "aguardando");
  assert.equal((depois.metadata as { arte?: unknown }).arte !== undefined, true, "o resto do metadata fica");
  assert.equal(tipoGeraArte("text"), false, "post de texto nunca espera");
});

// ── 4. Refazer peça ──────────────────────────────────────────────────────────

test("refazer peça: sem identidade aprovada cobra só o texto, marca o post e tira a falha antiga", () => {
  const soTexto = custoDeRefazerPeca({ mediaType: "text" });
  const comCarrossel = custoDeRefazerPeca({ mediaType: "carousel", laminas: 5 });
  assert.ok(soTexto < comCarrossel, "a arte é cobrada quando sair, depois da aprovação");
  const meta = marcarEspera({ formato: "feed", arteFalhou: { motivo: "antiga", em: "2026-10-05T00:00:00Z" }, gerandoArte: { desde: "2026-10-05T00:00:00Z" } });
  assert.equal("arteFalhou" in meta, false);
  assert.equal("gerandoArte" in meta, false);
  assert.equal(meta.aguardandoIdentidade, true);
});

// ── 5. "Aprovar e gerar" pega tudo o que foi marcado, inclusive carrossel e avulso ──

test("aprovar e gerar: um grupo por dia e campanha, e o avulso é um grupo só dele", () => {
  const artes: ArteAguardando[] = [
    { postId: "x", runId: "run1", dayOfWeek: 1, platform: "twitter", mediaType: "carousel" },
    { postId: "ig", runId: "run1", dayOfWeek: 1, platform: "instagram", mediaType: "carousel" },
    { postId: "li", runId: "run1", dayOfWeek: 2, platform: "linkedin", mediaType: "image" },
    { postId: "a1", runId: null, dayOfWeek: null, platform: "instagram", mediaType: "image" },
    { postId: "a2", runId: null, dayOfWeek: null, platform: "instagram", mediaType: "image" },
  ];
  const grupos = agruparPorDia(artes);
  assert.equal(grupos.length, 4, "segunda (X e Instagram juntos), terça, e dois avulsos separados");
  assert.deepEqual(grupos[0].map((a) => a.postId), ["x", "ig"]);
  assert.equal(contarArtesEsperando(artes), 4);
  assert.notEqual(chaveDoGrupo(artes[3]), chaveDoGrupo(artes[4]), "avulsos nunca caem no mesmo balaio");
});

test("aprovar e gerar: a resposta vem antes da arte, e o quadro acompanha gerando, pronto ou falhou", async () => {
  // O banco de mentira: um post marcado pela esteira.
  const banco = new Map<string, { imageUrl: string | null; metadata: Record<string, unknown> }>();
  banco.set("x", { imageUrl: null, metadata: marcarEspera({ formato: "feed" }) });
  const depoisDaResposta: Array<() => Promise<void>> = [];
  const after = (fn: () => Promise<void>) => depoisDaResposta.push(fn);

  // O clique: marca "gerando" e responde na hora.
  const agora = new Date("2026-10-05T23:30:00Z");
  for (const p of banco.values()) p.metadata = marcarGerando(p.metadata, agora);
  const resposta = { iniciadas: 1, frase: fraseDaAprovacao(1) };
  assert.equal(resposta.frase, "Identidade aprovada. 1 arte está sendo gerada e cai no quadro em alguns minutos.");
  assert.equal(esperaDaIdentidade(banco.get("x")!, agora)?.estado, "gerando", "o quadro mostra o squad fazendo");
  assert.equal(depoisDaResposta.length, 0, "nada desenhado ainda");

  // A geração roda depois da resposta: primeiro falha (motivo gravado), depois sai.
  after(async () => {
    const p = banco.get("x")!;
    p.metadata = marcarFalha(p.metadata, "o modelo de imagem recusou a cena", agora);
  });
  for (const fn of depoisDaResposta.splice(0)) await fn();
  const falha = esperaDaIdentidade(banco.get("x")!, agora);
  assert.equal(falha?.estado, "falhou");
  assert.equal(falha?.motivo, "o modelo de imagem recusou a cena");
  assert.equal((banco.get("x")!.metadata as { aguardandoIdentidade?: boolean }).aguardandoIdentidade, true, "a espera continua: 'Tentar de novo' pega de novo");

  // "Tentar de novo": gerando de novo, e desta vez a arte sai.
  banco.get("x")!.metadata = marcarGerando(banco.get("x")!.metadata, agora);
  assert.equal(esperaDaIdentidade(banco.get("x")!, agora)?.estado, "gerando");
  after(async () => {
    const p = banco.get("x")!;
    p.imageUrl = "https://x/l1.png|https://x/l2.png";
    p.metadata = semEspera(p.metadata);
  });
  for (const fn of depoisDaResposta.splice(0)) await fn();
  assert.equal(esperaDaIdentidade(banco.get("x")!, agora), null, "pronta: volta a ser 'esperando você aprovar'");
  assert.deepEqual(banco.get("x")!.metadata, { formato: "feed" });
});

test("aprovar e gerar: 'gerando' que passou do teto vira falha com 'Tentar de novo', nunca 'fazendo' eterno", () => {
  const desde = new Date("2026-10-05T20:00:00Z");
  const meta = marcarGerando({ formato: "feed" }, desde);
  assert.equal(esperaDaIdentidade({ imageUrl: null, metadata: meta }, new Date(desde.getTime() + 60_000))?.estado, "gerando");
  const tarde = esperaDaIdentidade({ imageUrl: null, metadata: meta }, new Date(desde.getTime() + TETO_DA_GERACAO_MS + 1));
  assert.equal(tarde?.estado, "falhou");
  assert.ok(tarde?.motivo);
});

// ── 6. O quadro ──────────────────────────────────────────────────────────────

test("quadro: a peça com várias redes lê uma espera só, e falhou ganha de gerando que ganha de aguardando", () => {
  const agora = new Date();
  const aguardando = { imageUrl: null, metadata: marcarEspera({}) };
  const gerando = { imageUrl: null, metadata: marcarGerando({}, agora) };
  const falhou = { imageUrl: null, metadata: marcarFalha({}, "sem saldo", agora) };
  assert.equal(esperaDaPeca([aguardando, gerando], agora)?.estado, "gerando");
  assert.equal(esperaDaPeca([aguardando, gerando, falhou], agora)?.estado, "falhou");
  assert.equal(esperaDaPeca([aguardando], agora)?.estado, "aguardando");
  assert.equal(esperaDaPeca([{ imageUrl: "https://x/a.png", metadata: {} }], agora), null);
  // O post do caso real, como a API da semana o devolve (sem imageUrl selecionado antes de hoje):
  assert.equal(esperaDaPeca([{ metadata: { formato: "feed", aguardandoIdentidade: true } }])?.estado, "aguardando");
  // O mapeamento do content-manager: aguardando nunca vira "esperando você aprovar".
  const estadoDaPeca = (posts: Array<{ imageUrl?: string | null; metadata?: unknown }>) => {
    const e = esperaDaPeca(posts);
    return e?.estado === "gerando" ? "fazendo" : e?.estado === "falhou" ? "falhou" : e?.estado === "aguardando" ? "aguardando" : "esperando";
  };
  assert.equal(estadoDaPeca([aguardando]), "aguardando");
  assert.equal(estadoDaPeca([gerando]), "fazendo");
  assert.equal(estadoDaPeca([falhou]), "falhou");
  assert.equal(estadoDaPeca([{ imageUrl: "https://x/a.png", metadata: {} }]), "esperando");
});

// ── 7. A galeria ─────────────────────────────────────────────────────────────

test("galeria: trocar modelo, letra, cores ou fotos avisa na hora, com as artes esperando", () => {
  assert.equal(avisoDaTroca("modelo", 1, true), "Você trocou os modelos: a identidade precisa ser aprovada de novo. 1 arte está esperando a aprovação para sair.");
  assert.equal(avisoDaTroca("letra", 3, true), "Você trocou a letra: a identidade precisa ser aprovada de novo. 3 artes estão esperando a aprovação para sair.");
  assert.equal(avisoDaTroca("cores", 0, true), "Você trocou as cores: a identidade precisa ser aprovada de novo. Nada é gerado até você aprovar.");
  assert.equal(avisoDaTroca("fotos", 2, false), "Você trocou as fotos. 2 artes estão esperando a aprovação para sair.");
  assert.equal(fraseDaAprovacao(0), "Identidade aprovada. As próximas artes já saem assim.");
  assert.equal(fraseDaAprovacao(2), "Identidade aprovada. 2 artes estão sendo geradas e caem no quadro em alguns minutos.");
});
