"use client";

import { useState } from "react";
import Link from "next/link";
import { Film, Loader2, Plug, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { RedeIcone } from "@/components/social/rede-icone";
import { FotoDaConta, type ContaParaSelo } from "@/components/social/selo-da-conta";
import {
  formatosDaRede,
  formatoDoPost,
  rotuloDoFormatoNaRede,
  avisoDoFormato,
  type FormatoDeDestino,
} from "@/lib/publish/formato-de-destino";
import { ESPECIALISTA_DA_REDE, FICHAS_DOS_AGENTES } from "@/lib/squad/definicoes-dos-agentes";
import { CREDIT_COSTS } from "@/lib/credits/tabela";
import { DESTINO_DE_CORTE_DA_REDE, REDES_DO_FORMATO, type RedeDoPlano } from "@/lib/media/semana-do-video";

/**
 * AS SEIS REDES DO DIA, conectadas ou não (item 13, 29/09).
 *
 * ## Por que existe
 *
 * O card do Paulo listava só os POSTS do dia. Rede sem post simplesmente não
 * aparecia, e o cliente não tinha como saber se o TikTok ficou de fora por
 * escolha, por falta de conexão ou por esquecimento da esteira. Rede que não
 * aparece é decisão tomada sem o cliente ver.
 *
 * Agora as seis aparecem sempre, cada uma com:
 *   . as contas conectadas (perfil e página, com a foto, porque o ícone da
 *     rede sozinho não separa a logo da empresa do rosto do dono);
 *   . os lugares que a rede tem, para marcar (Instagram e Facebook: feed,
 *     reels e stories; YouTube: vídeo ou Shorts; o resto: um lugar só);
 *   . "Conectar", quando não há conta. Rede sem conta NÃO se marca: marcar o
 *     que não pode sair é prometer uma publicação que vai falhar;
 *   . e, quando a rede está marcada mas ainda não tem texto, o pedido ao
 *     especialista dela com o custo ANTES do clique.
 *
 * Mora fora do content-manager porque ele já passa de cinco mil linhas, e
 * porque é componente cliente: só importa módulo sem banco (a tabela de
 * crédito e as fichas dos agentes são dados puros).
 */

/** A ordem do pedido do Bruno: as redes de texto primeiro, as de vídeo depois. */
const REDES = ["linkedin", "twitter", "instagram", "facebook", "tiktok", "youtube"] as const;
const NOME: Record<string, string> = {
  linkedin: "LinkedIn", twitter: "X", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube",
};
/** Estados em que o post já não conta como "a rede tem peça". */
const FORA = new Set(["cancelled", "rejected"]);

export type PostDoDestino = {
  id: string;
  platform: string;
  status: string;
  content: string;
  mediaType: string | null;
  socialAccountId: string | null;
  metadata: Record<string, unknown> | null;
};

type Conta = ContaParaSelo & { id: string };

/** Um corte do vídeo que cai neste dia, lido dos posts dele. */
type CorteDoDia = { videoJobId: string; trechoIndice: number };

/**
 * OS CORTES DO DIA (30/09), a partir dos posts de vídeo que a sincronização
 * dos cortes criou (`metadata.origem === "video"`, com vídeo e trecho).
 * Existe para o card deixar levar um corte a uma rede que o plano não marcou,
 * o caso do LinkedIn que motivou isto.
 */
function cortesDoDia(posts: PostDoDestino[]): CorteDoDia[] {
  const vistos = new Map<string, CorteDoDia>();
  for (const p of posts) {
    const m = p.metadata as { origem?: unknown; videoJobId?: unknown; trechoIndice?: unknown } | null;
    if (p.mediaType !== "video" || m?.origem !== "video") continue;
    if (typeof m.videoJobId !== "string" || typeof m.trechoIndice !== "number") continue;
    vistos.set(`${m.videoJobId}:${m.trechoIndice}`, { videoJobId: m.videoJobId, trechoIndice: m.trechoIndice });
  }
  return [...vistos.values()].sort((a, b) => a.trechoIndice - b.trechoIndice);
}

function ehDoCorte(p: PostDoDestino, c: CorteDoDia): boolean {
  const m = p.metadata as { videoJobId?: unknown; trechoIndice?: unknown } | null;
  return m?.videoJobId === c.videoJobId && m?.trechoIndice === c.trechoIndice;
}

/** "Pedir ao Igor", "Pedir à Fernanda": o primeiro nome da ficha, com o artigo certo. */
function especialista(rede: string): { nome: string; artigo: string } {
  const ficha = FICHAS_DOS_AGENTES.find((f) => f.agentId === ESPECIALISTA_DA_REDE[rede]);
  const nome = (ficha?.name ?? "especialista").split(" ")[0];
  return { nome, artigo: /a$/i.test(nome) ? "à" : "ao" };
}

export function DestinosDoDia({
  projectId,
  posts,
  contas,
  escolhidos,
  aoEscolher,
  ocupado,
  aoMudar,
}: {
  projectId: string;
  posts: PostDoDestino[];
  contas: Conta[];
  /** A marcação da lista do dia: marcar a rede aqui marca os posts dela lá. */
  escolhidos: Set<string>;
  aoEscolher: (proximo: Set<string>) => void;
  ocupado: boolean;
  /** Recarrega os posts do dia depois de criar ou mudar um. */
  aoMudar: () => Promise<void> | void;
}) {
  // Rede sem texto marcada para publicar: só existe na tela até o pedido ao
  // especialista virar post. Não grava nada, porque não há o que gravar.
  const [semTextoMarcadas, setSemTextoMarcadas] = useState<Set<string>>(new Set());
  const [lugaresPedidos, setLugaresPedidos] = useState<Record<string, FormatoDeDestino[]>>({});
  const [contaPedida, setContaPedida] = useState<Record<string, string>>({});
  const [trabalhando, setTrabalhando] = useState<string | null>(null);

  // O texto de partida da adaptação: o post do LinkedIn quando existe, porque
  // é o texto-mãe do dia (é dele que os especialistas adaptam na esteira).
  const vivos = posts.filter((p) => !FORA.has(p.status) && p.content.trim().length > 0);
  const fonte = vivos.find((p) => p.platform === "linkedin") ?? vivos[0];
  const custo = CREDIT_COSTS.post_text;
  const cortes = cortesDoDia(posts.filter((p) => !FORA.has(p.status)));
  // A fonte da adaptação paga é um CORTE: levar o corte (grátis, logo abaixo)
  // faz o mesmo sem IA e com o texto que o redator já escreveu para a rede.
  const fonteEhCorte = Boolean(fonte && cortes.some((c) => ehDoCorte(fonte, c)));

  /**
   * LEVA UM CORTE PARA UMA REDE QUE O PLANO NÃO MARCOU (30/09).
   *
   * Pedido do Bruno: vídeo também no LinkedIn. O dia de vídeo curto sai nas
   * redes escolhidas no passo 4; aqui o cliente acrescenta a rede a um corte
   * pronto, pela conta que escolher (perfil ou página). Sem IA e sem custo: o
   * vídeo é o mesmo corte vertical, que é o formato que o feed de vídeo do
   * LinkedIn favorece, e o texto é o que o redator já escreveu para a rede.
   * Passa pela rota dos destinos do corte, e não pela do "levar", para o
   * corte ganhar card no quadro e a sincronização não apagar a escolha.
   */
  async function levarCorte(rede: string, corte: CorteDoDia, conta: Conta | undefined) {
    const destino = DESTINO_DE_CORTE_DA_REDE[rede as RedeDoPlano];
    if (!destino) return;
    setTrabalhando(rede);
    try {
      const res = await fetch(`/api/videos/${corte.videoJobId}/destinos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trecho: corte.trechoIndice, maisDestino: destino, contaId: conta?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Não consegui levar o corte.");
        return;
      }
      const prox = new Set(semTextoMarcadas);
      prox.delete(rede);
      setSemTextoMarcadas(prox);
      // O post do corte já entra marcado: o cliente pediu para sair nessa rede.
      if (data.postId) aoEscolher(new Set([...escolhidos, data.postId]));
      await aoMudar();
      toast.success(`O corte também sai no ${NOME[rede]}${conta?.displayName ? `, por ${conta.displayName}` : ""}, em rascunho.`);
    } catch {
      toast.error("Não consegui levar o corte.");
    } finally {
      setTrabalhando(null);
    }
  }

  /** Tira uma conta do dia: arquiva os posts dela (reversível), nunca a última. */
  async function tirarConta(rede: string, conta: Conta, daRede: PostDoDestino[]) {
    // A mesma conta que a tela mostra acesa: post sem conta ativa sai pelo
    // perfil, então é o perfil que ele representa.
    const daRedeContas = contas.filter((c) => c.platform === rede);
    const contaDe = (p: PostDoDestino) =>
      (daRedeContas.find((c) => c.id === p.socialAccountId) ?? daRedeContas.find((c) => c.accountType === "personal") ?? daRedeContas[0])?.id;
    const contasDaRede = new Set(daRede.map(contaDe));
    const daConta = daRede.filter((p) => contaDe(p) === conta.id);
    if (!daConta.length) return;
    if (contasDaRede.size <= 1) {
      toast.error("A rede precisa de pelo menos uma conta. Para tirar a rede do dia, desmarque a rede.");
      return;
    }
    if (daConta.some((p) => p.status === "published" || p.status === "publishing")) {
      toast.error("Por esta conta já foi publicado.");
      return;
    }
    setTrabalhando(rede);
    try {
      for (const p of daConta) {
        await fetch(`/api/posts/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        });
      }
      const prox = new Set(escolhidos);
      for (const p of daConta) prox.delete(p.id);
      aoEscolher(prox);
      await aoMudar();
      toast.success(`${NOME[rede]}: não sai mais por ${conta.displayName ?? "esta conta"}.`);
    } catch {
      toast.error("Não consegui tirar a conta.");
    } finally {
      setTrabalhando(null);
    }
  }

  /** Mais uma conta da mesma rede para a peça que já existe: cópia sem IA. */
  async function adicionarConta(rede: string, conta: Conta, base: PostDoDestino | undefined) {
    if (!base) return;
    setTrabalhando(rede);
    try {
      const res = await fetch(`/api/posts/${base.id}/formato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formato: formatoDoPost(base.metadata, rede), accountId: conta.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Não consegui acrescentar a conta.");
        return;
      }
      if (data.post?.id) aoEscolher(new Set([...escolhidos, data.post.id]));
      await aoMudar();
      toast.success(`${NOME[rede]}: também sai por ${conta.displayName ?? "esta conta"}, em rascunho.`);
    } catch {
      toast.error("Não consegui acrescentar a conta.");
    } finally {
      setTrabalhando(null);
    }
  }

  async function pedirAdaptacao(rede: string, conta: Conta, lugares: FormatoDeDestino[]) {
    if (!fonte) return;
    setTrabalhando(rede);
    try {
      // A MESMA ROTA DO "levar para outra rede": adapta pelo mesmo caminho da
      // campanha, cobra `post_text` e nasce como rascunho. Nada de rota nova
      // para a mesma operação, senão o preço de uma diverge do da outra.
      const res = await fetch(`/api/posts/${fonte.id}/levar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: conta.id, formato: lugares[0] }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Não consegui pedir a adaptação.");
        return;
      }
      // Os outros lugares marcados viram posts irmãos, sem IA e sem custo.
      for (const lugar of lugares.slice(1)) {
        await fetch(`/api/posts/${data.post.id}/formato`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formato: lugar }),
        });
      }
      const prox = new Set(semTextoMarcadas);
      prox.delete(rede);
      setSemTextoMarcadas(prox);
      // O post adaptado já entra marcado: o cliente pediu para sair nessa rede.
      if (data.post?.id) aoEscolher(new Set([...escolhidos, data.post.id]));
      await aoMudar();
      toast.success(`${especialista(rede).nome} adaptou o texto para ${NOME[rede]}, em rascunho. Confira antes de publicar.`);
    } catch {
      toast.error("Não consegui pedir a adaptação.");
    } finally {
      setTrabalhando(null);
    }
  }

  /** Liga ou desliga um lugar numa rede que já tem peça: um post por lugar. */
  async function alternarLugar(rede: string, lugar: FormatoDeDestino, daRede: PostDoDestino[]) {
    const doLugar = daRede.filter((p) => formatoDoPost(p.metadata, rede) === lugar);
    setTrabalhando(rede);
    try {
      if (doLugar.length === 0) {
        const base = daRede.find((p) => p.status !== "published") ?? daRede[0];
        const res = await fetch(`/api/posts/${base.id}/formato`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formato: lugar }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Não consegui marcar o lugar.");
          return;
        }
        toast.success(`${rotuloDoFormatoNaRede(rede, lugar)} marcado no ${NOME[rede]}, em rascunho.`);
      } else {
        // Desmarcar é arquivar o post daquele lugar, que é reversível pela
        // lista do dia. O último lugar não sai: a rede ficaria marcada sem
        // lugar nenhum, e quem quer tirar a rede desmarca a rede.
        const lugares = new Set(daRede.map((p) => formatoDoPost(p.metadata, rede)));
        if (lugares.size <= 1) {
          toast.error("A rede precisa de pelo menos um lugar. Para tirar a rede do dia, desmarque a rede.");
          return;
        }
        if (doLugar.some((p) => p.status === "published" || p.status === "publishing")) {
          toast.error("Este lugar já foi publicado.");
          return;
        }
        for (const p of doLugar) {
          await fetch(`/api/posts/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "cancelled" }),
          });
        }
        toast.success(`${rotuloDoFormatoNaRede(rede, lugar)} desmarcado no ${NOME[rede]}.`);
      }
      await aoMudar();
    } catch {
      toast.error("Não consegui mudar o lugar.");
    } finally {
      setTrabalhando(null);
    }
  }

  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
      <div className="px-4 py-2.5" style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          As seis redes deste dia
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          Marque a rede e o lugar. Cada lugar marcado vira uma publicação.
        </p>
      </div>
      <div className="flex flex-col">
        {REDES.map((rede) => {
          const daRedeContas = contas.filter((c) => c.platform === rede);
          const conectada = daRedeContas.length > 0;
          const daRede = posts.filter((p) => p.platform === rede && !FORA.has(p.status));
          const temPeca = daRede.length > 0;
          const marcaveis = daRede.filter((p) => p.status !== "published" && p.status !== "publishing");
          const marcada = temPeca
            ? marcaveis.some((p) => escolhidos.has(p.id))
            : semTextoMarcadas.has(rede);
          const aceitos = formatosDaRede(rede);
          const lugaresAtuais: FormatoDeDestino[] = temPeca
            ? [...new Set(daRede.map((p) => formatoDoPost(p.metadata, rede)))]
            : lugaresPedidos[rede] ?? ["feed"];
          // LinkedIn com carrossel sai como DOCUMENTO: é o que o cliente vê
          // na rede, então é o que a tela diz.
          const ehDocumento = rede === "linkedin" && daRede.some((p) => p.mediaType === "carousel");
          // LinkedIn com corte sai como VÍDEO (30/09): "Post" escondia que o
          // que vai é o corte em pé, e não um texto.
          const ehVideoNoLinkedIn = rede === "linkedin" && !ehDocumento && daRede.some((p) => p.mediaType === "video");
          // Os cortes do dia que ainda não saem nesta rede, quando a rede
          // recebe vídeo curto (as redes do "Vídeo curto" no passo 4).
          const recebeCorte = REDES_DO_FORMATO.short.includes(rede as RedeDoPlano);
          const cortesSemARede = recebeCorte ? cortes.filter((c) => !daRede.some((p) => ehDoCorte(p, c))) : [];
          const contaAlvo =
            daRedeContas.find((c) => c.id === contaPedida[rede]) ??
            daRedeContas.find((c) => c.accountType === "personal") ??
            daRedeContas[0];
          const esp = especialista(rede);
          const ocupadoAqui = ocupado || trabalhando !== null;
          // A conta por onde cada post sai, com o mesmo fundo do `accountFor`
          // do card: conta gravada que não publica mais (desligada) cai no
          // perfil, que é por onde o post de fato sairia.
          const contasComPeca = new Set(
            daRede
              .map((p) => (daRedeContas.find((c) => c.id === p.socialAccountId) ?? daRedeContas.find((c) => c.accountType === "personal") ?? daRedeContas[0])?.id)
              .filter(Boolean) as string[]
          );
          // Rede desmarcada e sem peça não mostra nada aceso: o destaque diria
          // que algo vai sair, e não vai.
          const acesa = temPeca || marcada;

          return (
            <div
              key={rede}
              data-rede={rede}
              className={cn("px-4 py-3 space-y-2", !conectada && "opacity-80")}
              style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  aria-label={`Publicar no ${NOME[rede]}`}
                  className="w-4 h-4 accent-orange-500 shrink-0"
                  checked={conectada && marcada}
                  // Rede sem conta não se marca: ver o porquê no topo.
                  disabled={!conectada || ocupadoAqui || (temPeca && marcaveis.length === 0)}
                  onChange={(e) => {
                    if (temPeca) {
                      const prox = new Set(escolhidos);
                      for (const p of marcaveis) {
                        if (e.target.checked) prox.add(p.id); else prox.delete(p.id);
                      }
                      aoEscolher(prox);
                    } else {
                      const prox = new Set(semTextoMarcadas);
                      if (e.target.checked) prox.add(rede); else prox.delete(rede);
                      setSemTextoMarcadas(prox);
                    }
                  }}
                />
                <RedeIcone plataforma={rede} className="w-4 h-4 shrink-0" monocromatico={!conectada} />
                <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{NOME[rede]}</span>
                <span className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                  {!conectada
                    ? "não conectada"
                    : temPeca
                      ? `${daRede.length} ${daRede.length > 1 ? "publicações" : "publicação"} no dia`
                      : "sem texto neste dia"}
                </span>
                {!conectada && (
                  <Link
                    href={`/projects/${projectId}/settings`}
                    className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-orange-400 hover:underline shrink-0"
                  >
                    <Plug className="w-3 h-3" />
                    Conectar
                  </Link>
                )}
              </div>

              {conectada && (
                <div className="flex flex-wrap items-center gap-1.5 pl-6">
                  {/* AS CONTAS DA REDE, perfil e página. Sem peça ainda, a
                      escolhida é por onde a adaptação vai sair; com peça, a
                      troca de conta continua na linha do post, lá embaixo. */}
                  {daRedeContas.map((c) => {
                    const escolhida = acesa && (temPeca ? contasComPeca.has(c.id) : contaAlvo?.id === c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        // Com peça, a conta que ainda não tem post vira um destino a
                        // mais (o mesmo texto, sem custo); a que já tem fica acesa.
                        // Cada conta é um liga e desliga (30/09, pedido do Bruno: "marcar
                        // um, o outro ou os dois"): com peça, a conta acesa sai do dia
                        // e a apagada entra com o mesmo texto, sem custo.
                        disabled={ocupadoAqui || (!temPeca && daRedeContas.length === 1)}
                        onClick={() => {
                          if (!temPeca) return setContaPedida({ ...contaPedida, [rede]: c.id });
                          if (contasComPeca.has(c.id)) void tirarConta(rede, c, daRede);
                          else void adicionarConta(rede, c, daRede[0]);
                        }}
                        className={cn(
                          "flex items-center gap-1.5 h-7 pl-0.5 pr-2 rounded-full border text-[10px] transition-all",
                          escolhida ? "border-orange-500/60 bg-orange-500/8" : "border-[var(--border)]",
                        )}
                        style={{ color: "var(--text-primary)" }}
                        title={temPeca ? (contasComPeca.has(c.id) ? "Sai por esta conta. Clique para tirar." : "Clique para sair também por esta conta") : "Por onde a adaptação sai"}
                      >
                        <FotoDaConta conta={c} tamanho={22} />
                        <span className="truncate max-w-[120px]">{c.displayName ?? NOME[rede]}</span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {c.accountType === "organization" ? "página" : "perfil"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5 pl-6">
                {aceitos.map((lugar) => {
                  const ligado = acesa && lugaresAtuais.includes(lugar);
                  const rotulo =
                    ehDocumento && lugar === "feed"
                      ? "Documento (carrossel)"
                      : ehVideoNoLinkedIn && lugar === "feed"
                        ? "Vídeo (vertical)"
                        : rotuloDoFormatoNaRede(rede, lugar);
                  // Um lugar só não é escolha: vira etiqueta, não botão.
                  const unico = aceitos.length === 1;
                  return (
                    <button
                      key={lugar}
                      type="button"
                      aria-pressed={ligado}
                      disabled={!conectada || unico || ocupadoAqui}
                      title={avisoDoFormato(lugar) ?? undefined}
                      onClick={() => {
                        if (temPeca) {
                          void alternarLugar(rede, lugar, daRede);
                          return;
                        }
                        const atuais = lugaresPedidos[rede] ?? ["feed"];
                        const prox = atuais.includes(lugar) ? atuais.filter((l) => l !== lugar) : [...atuais, lugar];
                        if (prox.length > 0) setLugaresPedidos({ ...lugaresPedidos, [rede]: prox });
                      }}
                      className={cn(
                        "h-6 px-2 rounded-md border text-[10px] font-medium transition-all",
                        ligado && conectada
                          ? "bg-orange-500/10 border-orange-500 text-[var(--text-primary)]"
                          : "border-[var(--border)] text-[var(--text-muted)]",
                        !unico && conectada && "hover:border-[var(--border-accent)]",
                      )}
                    >
                      {ligado && conectada ? "✓ " : ""}
                      {rotulo}
                    </button>
                  );
                })}
                {trabalhando === rede && <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--text-muted)" }} />}
              </div>

              {/* A REDE MARCADA SEM TEXTO pede ao especialista dela, e o custo
                  vai no rótulo antes do clique: é uma chamada de IA, cobrada
                  como post de texto (`CREDIT_COSTS.post_text`), a mesma régua
                  do "levar para outra rede". */}
              {/* O CORTE DO DIA NESTA REDE, sem custo (30/09). Aparece quando a
                  rede está marcada sem peça, ou quando ela já tem peça mas
                  falta algum corte do dia nela (dois cortes no mesmo dia). */}
              {conectada && cortesSemARede.length > 0 && (marcada || temPeca) && (
                <div className="pl-6 space-y-1" data-levar-corte={rede}>
                  {cortesSemARede.map((c) => {
                    // Por onde o corte sai: com peça na rede, a conta que já
                    // está acesa nela; sem peça, a conta escolhida nos botões.
                    const contaDoCorte = temPeca ? daRedeContas.find((x) => contasComPeca.has(x.id)) ?? contaAlvo : contaAlvo;
                    const qual = contaDoCorte ? (contaDoCorte.accountType === "organization" ? " (página)" : " (perfil)") : "";
                    return (
                    <button
                      key={`${c.videoJobId}:${c.trechoIndice}`}
                      type="button"
                      disabled={ocupadoAqui}
                      onClick={() => void levarCorte(rede, c, contaDoCorte)}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] font-medium transition-all hover:border-orange-500/50 hover:bg-orange-500/10 disabled:opacity-50"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                      title={`Vai o mesmo corte em pé (9:16), com o texto de ${NOME[rede]} que o redator já escreveu. Não chama IA.`}
                    >
                      {trabalhando === rede ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5 text-orange-400" />}
                      <span>
                        {cortes.length > 1
                          ? `Levar o corte ${c.trechoIndice + 1} para o ${NOME[rede]}${qual}`
                          : `Levar o corte deste dia para o ${NOME[rede]}${qual}`}
                        <span style={{ color: "var(--text-muted)" }}>, sem custo</span>
                      </span>
                    </button>
                    );
                  })}
                </div>
              )}

              {conectada && !temPeca && marcada && contaAlvo && !(fonteEhCorte && cortesSemARede.length > 0) && (
                <div className="pl-6">
                  <button
                    type="button"
                    data-pedir-adaptacao={rede}
                    disabled={!fonte || ocupadoAqui}
                    onClick={() => void pedirAdaptacao(rede, contaAlvo, lugaresAtuais)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] font-medium transition-all hover:border-orange-500/50 hover:bg-orange-500/10 disabled:opacity-50"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    title={fonte ? `Adapta o texto do dia para ${NOME[rede]} e cria um rascunho em ${contaAlvo.displayName ?? NOME[rede]}.` : undefined}
                  >
                    {trabalhando === rede ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-orange-400" />}
                    {trabalhando === rede
                      ? `${esp.nome} está adaptando…`
                      : `Pedir ${esp.artigo} ${esp.nome} (custa ~${custo} créditos)`}
                  </button>
                  {!fonte && (
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                      O dia ainda não tem texto para adaptar.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
