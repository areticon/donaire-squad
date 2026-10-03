"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Blend,
  Check,
  Columns2,
  FileText,
  Film,
  Hash,
  Image as ImageIcon,
  MessageSquareQuote,
  MoveRight,
  PictureInPicture2,
  Smile,
  Square,
  Type,
  User,
  UserSquare2,
  ZoomIn,
  ZoomOut,
  ClipboardCheck,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  RotateCcw,
  Scissors,
  Shuffle,
  Sparkles,
  SpellCheck,
  Undo2,
  Video,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EscolhaDaLegenda } from "@/components/video/escolha-da-legenda";
import { ControleDoCorte } from "@/components/video/controle-do-corte";
import { mmss, type CenaNaTela, type CompletoNaTela, type CorteNaTela, type IconeDaPeca, type PecaDaCena, type TelaDeRoteiro as Tela } from "@/lib/media/roteiro-em-texto";
import { creditosNaTela } from "@/lib/media/limits";

/**
 * A TELA DE ROTEIRO (30/09/2026), do lado do cliente. Só desenha e manda as
 * ações; quem decide e grava é o servidor (lib/media/roteiro-da-edicao.ts), e
 * cada ação devolve a tela inteira já refeita.
 *
 * O que o Bruno pediu, em ordem: a linha editorial; os cortes possíveis com o
 * trecho da fala e a ideia de cada cena; escolher os cortes (até 3 no pedido
 * de 30/09, até 8 desde 01/10); o vídeo completo; a
 * correção de palavra ("Cloud" quando ele disse "Claude"); por cena, tirar o
 * efeito, mudar a ideia ou pedir outra; e o aviso de que os créditos da
 * geração só são usados depois da aprovação.
 */

type AlvoDaCena = { alvo: "corte" | "completo"; trecho?: number; cena: number };
type AcaoDaAbertura = { alvo: "completo" | "corte"; trecho?: number; acao: "trocar" | "tirar" | "acrescentar" | "desligar" | "ligar"; momento?: number };
const chaveDe = (a: AlvoDaCena) => `${a.alvo}:${a.trecho ?? "c"}:${a.cena}`;

export function TelaDeRoteiro({ inicial, abrirEdicao = false }: { inicial: Tela; abrirEdicao?: boolean }) {
  const router = useRouter();
  const [tela, setTela] = useState<Tela>(inicial);
  const [escolhidos, setEscolhidos] = useState<number[]>(inicial.escolhidos);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aprovando, setAprovando] = useState(false);

  // O servidor refaz a tela (router.refresh) enquanto o roteiro é montado.
  useEffect(() => setTela(inicial), [inicial]);
  useEffect(() => {
    if (inicial.status !== "roteirizando" && inicial.status !== "selected") return;
    const t = setInterval(() => router.refresh(), 6000);
    return () => clearInterval(t);
  }, [inicial.status, router]);

  // "Voltar à edição" (30/09): vídeo já aprovado com a edição reaberta. As
  // mesmas ações de antes da aprovação, só que num rascunho, e no fim
  // "Refazer com estes ajustes" no lugar de "Aprovar e gerar".
  const reed = tela.reedicao ?? null;
  const editando = Boolean(reed?.aberta);
  const aberto = tela.status === "roteiro" || editando;
  const aprovado = Boolean(tela.aprovadoEm);
  const [refeito, setRefeito] = useState<string[] | null>(null);
  const [refazendo, setRefazendo] = useState(false);
  const n = escolhidos.length;
  // A abertura dos melhores momentos (01/10) entra no total, e some dele se o cliente desligar.
  const aberturaCreditos = tela.creditos.abertura ?? 0;
  const aPagar = tela.creditos.completo + aberturaCreditos + n * tela.creditos.porCorte;

  async function acao(url: string, corpo: unknown, chave: string): Promise<boolean> {
    setErro(null);
    setOcupado(chave);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const j = (await r.json().catch(() => ({}))) as { tela?: Tela; error?: string };
      if (!r.ok) {
        setErro(j.error ?? `A plataforma recusou (código ${r.status}).`);
        return false;
      }
      if (j.tela) setTela(j.tela);
      return true;
    } catch {
      setErro("A conexão caiu no meio do pedido. Tente de novo.");
      return false;
    } finally {
      setOcupado(null);
    }
  }

  // O botão do card e da faixa chegam com ?editar=1: a edição já abre.
  const [jaPediuAbrir, setJaPediuAbrir] = useState(false);
  useEffect(() => {
    if (!abrirEdicao || jaPediuAbrir || !reed || reed.aberta || !reed.podeAbrir) return;
    setJaPediuAbrir(true);
    void acao(`/api/videos/${tela.videoId}/roteiro/reedicao`, { acao: "abrir" }, "reedicao");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirEdicao, jaPediuAbrir, reed]);

  const naBorda = (trecho: number, lado: "inicio" | "fim", sentido: "antes" | "depois") =>
    acao(`/api/videos/${tela.videoId}/roteiro/reedicao`, { acao: "borda", trecho, lado, sentido }, `borda:${trecho}`);

  async function refazer() {
    setErro(null);
    setRefazendo(true);
    try {
      const r = await fetch(`/api/videos/${tela.videoId}/roteiro/reedicao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "refazer" }),
      });
      const j = (await r.json().catch(() => ({}))) as { tela?: Tela; feito?: string[]; error?: string };
      if (!r.ok) {
        setErro(j.error ?? `A plataforma recusou (código ${r.status}).`);
        return;
      }
      if (j.tela) setTela(j.tela);
      setRefeito(j.feito ?? []);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setErro("A conexão caiu no meio do pedido. Recarregue a página para ver se ele entrou.");
    } finally {
      setRefazendo(false);
    }
  }

  // O CONTROLE DO CORTE (03/10): antes da aprovação, o ajuste fica no roteiro
  // e as artes saem em cima dele; com o vídeo pronto, refaz só aquele corte.
  // Na reedição aberta fica de fora: ela tem o rascunho dela.
  const podeControlar = tela.status === "roteiro" || (["cut", "writing", "ready"].includes(tela.status) && aprovado && !editando);
  const [controlado, setControlado] = useState<string | null>(null);
  const aoControlar = (r: { modo: "roteiro" | "no-ar"; mensagem: string }) => {
    setControlado(r.modo === "no-ar" ? r.mensagem : null);
    router.refresh();
  };

  const naCena = (a: AlvoDaCena, acaoDaCena: "remover" | "editar" | "restaurar" | "nova-ideia", texto?: string) =>
    acao(`/api/videos/${tela.videoId}/roteiro/cena`, { ...a, acao: acaoDaCena, texto }, `${chaveDe(a)}:${acaoDaCena}`);

  // A abertura e os ganchos (01/10): trocar, tirar, pôr mais um, desligar. Sem IA, sem custo.
  const naAbertura = (corpo: AcaoDaAbertura) =>
    acao(`/api/videos/${tela.videoId}/roteiro/abertura`, corpo, `abertura:${corpo.alvo}:${corpo.trecho ?? "c"}:${corpo.momento ?? "-"}:${corpo.acao}`);
  // Mexer na abertura só antes da aprovação (a reedição ainda não refaz a abertura).
  const podeMexerNaAbertura = tela.status === "roteiro" && !editando;

  function alternar(i: number) {
    setEscolhidos((atual) => {
      if (atual.includes(i)) return atual.filter((x) => x !== i);
      if (atual.length >= tela.maxCortes) return atual;
      return [...atual, i].sort((a, b) => a - b);
    });
  }

  async function aprovar() {
    setErro(null);
    setAprovando(true);
    try {
      const r = await fetch(`/api/videos/${tela.videoId}/roteiro/aprovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escolhidos }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setErro(j.error ?? `A plataforma recusou (código ${r.status}).`);
        setAprovando(false);
        return;
      }
      router.push(`/projects/${tela.projectId}/live`);
    } catch {
      setErro("A conexão caiu no meio da aprovação. Recarregue a página para ver se ela entrou.");
      setAprovando(false);
    }
  }

  return (
    <div className="px-4 lg:px-8 pt-6 max-w-5xl mx-auto">
      <Link
        href={`/projects/${tela.projectId}/live`}
        className="inline-flex items-center gap-1.5 text-sm hover:text-orange-400 transition-colors"
        style={{ color: "var(--text-muted)" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar ao Gestor
      </Link>

      <div className="mt-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg border border-orange-500/35 bg-orange-500/10 flex items-center justify-center shrink-0">
          <ClipboardCheck className="w-5 h-5 text-orange-500" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Roteiro da edição
          </h1>
          <p className="text-sm mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
            {tela.nome}, {mmss(tela.duracaoSec)} de gravação
          </p>
        </div>
      </div>

      {reed ? (
        <p className="text-sm mt-4 leading-relaxed" style={{ color: "var(--text-secondary, var(--text-muted))" }}>
          Aqui está a edição deste vídeo como ela está hoje: a fala exata de cada corte e as cenas de cada um, e as
          inserções do vídeo completo.
        </p>
      ) : (
        <p className="text-sm mt-4 leading-relaxed" style={{ color: "var(--text-secondary, var(--text-muted))" }}>
          Antes de gerar qualquer imagem, cena ou corte, quero a sua aprovação. Separei os cortes possíveis com a fala
          exata que vai ao ar e planejei cada cena em texto. Confira se o corte pegou a fala certa, corrija palavras,
          troque o que não gostou e escolha até {tela.maxCortes} cortes. Os créditos vêm em duas partes: a primeira (
          {creditosNaTela(tela.creditos.roteiro)}) já pagou a transcrição, a limpeza, a semana escrita e este roteiro; a
          segunda ({creditosNaTela(tela.creditos.completo)} do vídeo completo
          {aberturaCreditos ? `, ${creditosNaTela(aberturaCreditos)} da abertura com os melhores momentos` : ""} e{" "}
          {creditosNaTela(tela.creditos.porCorte)} por corte escolhido) só é usada quando você aprovar, e só então eu gero.
        </p>
      )}

      {tela.status === "roteirizando" && (
        <Aviso tipo="andando">
          Ainda estou montando o roteiro: limpando a fala e planejando as cenas. Esta página se atualiza sozinha.
        </Aviso>
      )}
      {tela.status === "failed" && !aprovado && (
        <Aviso tipo="erro">
          O roteiro parou no meio. Volte ao Gestor e toque em tentar de novo: o que já foi planejado fica guardado.
        </Aviso>
      )}
      {aprovado && !reed && (
        <Aviso tipo="ok">
          Roteiro aprovado. O squad já está gerando os cortes e o vídeo completo com as cenas que você aprovou; o
          andamento aparece no Gestor.
        </Aviso>
      )}
      {refeito && (
        <Aviso tipo="ok">
          Mandei refazer só o que mudou: {refeito.join("; ")}. O card de cada peça mostra que o squad está fazendo, e
          a versão nova entra sozinha quando ficar pronta.
        </Aviso>
      )}
      {reed && !reed.aberta && !refeito && (
        <div className="mt-4 rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: "var(--border)" }}>
          <span style={{ color: "var(--text-muted)" }}>
            {reed.podeAbrir
              ? "Este vídeo já foi aprovado e está pronto. Quer mudar alguma coisa? Volte à edição: nada muda no ar até você mandar refazer."
              : reed.motivo}
          </span>
          <Button
            size="sm"
            disabled={!reed.podeAbrir || ocupado === "reedicao"}
            onClick={() => void acao(`/api/videos/${tela.videoId}/roteiro/reedicao`, { acao: "abrir" }, "reedicao")}
          >
            {ocupado === "reedicao" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
            Voltar à edição
          </Button>
        </div>
      )}
      {editando && (
        <Aviso tipo="andando" parado>
          Você está editando um vídeo já aprovado. Corrija palavras, mude o começo e o fim dos cortes e as cenas: nada
          muda no ar até você tocar em Refazer com estes ajustes, e só o que mudou é refeito.
        </Aviso>
      )}
      {/* O projeto mudou de estilo depois do plano (01/10): replanejar os cortes no estilo novo. */}
      {editando && reed?.estiloNovo && (
        <div className="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3" style={{ borderColor: "var(--brand)", background: "var(--bg-elevated)" }}>
          <p className="text-sm flex-1" style={{ color: "var(--text-primary)" }}>
            O estilo do projeto agora é <b>{reed.estiloNovo.nome}</b>, e {reed.estiloNovo.cortes.length === 1 ? "1 corte deste vídeo foi planejado" : `${reed.estiloNovo.cortes.length} cortes deste vídeo foram planejados`} no estilo
            anterior. O diretor pode planejar de novo no estilo novo; você confere as cenas aqui antes de refazer.
          </p>
          <Button
            disabled={ocupado === "replanejar"}
            onClick={() => void acao(`/api/videos/${tela.videoId}/roteiro/replanejar`, {}, "replanejar")}
          >
            {ocupado === "replanejar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
            {ocupado === "replanejar" ? "O diretor está replanejando" : "Replanejar no estilo novo"}
          </Button>
        </div>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {controlado && <Aviso tipo="ok">{controlado}</Aviso>}

      {/* ── Linha editorial ── */}
      <Secao titulo="A linha editorial do vídeo">
        {tela.tema ? (
          <>
            <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {tela.tema}
            </p>
            {tela.resumo && (
              <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {tela.resumo}
              </p>
            )}
            {tela.teses.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {tela.teses.map((t, i) => (
                  <li key={i} className="text-sm flex gap-2" style={{ color: "var(--text-primary)" }}>
                    <span className="text-orange-400 tabular-nums shrink-0">{t.minuto}</span>
                    <span>{t.frase}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            O Roberto ainda está fechando a pesquisa do tema. Os cortes abaixo já podem ser revisados.
          </p>
        )}
        {tela.diagnostico && (
          <p className="text-xs mt-3 italic" style={{ color: "var(--text-muted)" }}>
            Sobre a gravação: {tela.diagnostico}
          </p>
        )}
      </Secao>

      {/* ── Palavras ── */}
      <CorrecaoDePalavras tela={tela} aberto={aberto} ocupado={ocupado} aoCorrigir={(errado, certo) => acao(`/api/videos/${tela.videoId}/roteiro/termos`, { errado, certo }, "termos")} />

      {/* ── Cortes ── */}
      <Secao
        titulo={reed ? "Os cortes" : `Cortes possíveis: escolha até ${tela.maxCortes}`}
        subtitulo={
          reed
            ? "Os cortes que você aprovou, como estão hoje."
            : `${tela.cortes.length} ${tela.cortes.length === 1 ? "momento" : "momentos"} que se sustentam sozinhos. Marque os que vão ao ar.`
        }
      >
        <div className="space-y-4">
          {tela.cortes.map((c) => (
            <CartaoDoCorte
              key={c.indice}
              corte={c}
              escolhido={escolhidos.includes(c.indice)}
              podeEscolher={!editando && aberto && (escolhidos.includes(c.indice) || escolhidos.length < tela.maxCortes)}
              naBorda={editando ? (lado, sentido) => naBorda(c.indice, lado, sentido) : undefined}
              aberto={aberto}
              aoAlternar={() => alternar(c.indice)}
              ocupado={ocupado}
              novaIdeia={tela.creditos.novaIdeia}
              naCena={(cena, a, texto) => naCena({ alvo: "corte", trecho: c.indice, cena }, a, texto)}
              maxCortes={tela.maxCortes}
              naAbertura={podeMexerNaAbertura ? (acaoDoGancho) => naAbertura({ alvo: "corte", trecho: c.indice, acao: acaoDoGancho }) : undefined}
              controle={podeControlar ? { videoId: tela.videoId, aoAplicar: aoControlar } : undefined}
            />
          ))}
        </div>
      </Secao>

      {/* ── Completo ── */}
      {tela.completo && (
        <Secao
          titulo="O vídeo completo"
          subtitulo={`${mmss(tela.completo.duracao)} depois da limpeza de fala. ${
            tela.completo.insercoes.length
              ? `Editado do começo ao fim, com mais efeitos no começo, onde quem chega decide se fica (${tela.completo.insercoes.length} ${tela.completo.insercoes.length === 1 ? "cena" : "cenas"} com inserção); entre elas, você em tela cheia, com cortes secos e zoom na palavra forte.`
              : ""
          }`}
        >
          <AberturaDoCompleto completo={tela.completo} creditos={aberturaCreditos} ocupado={ocupado} naAbertura={podeMexerNaAbertura ? naAbertura : undefined} />
          <CoberturaETelas completo={tela.completo} />
          {tela.completo.semCenas ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {tela.completo.semCenas}
            </p>
          ) : (
            <div className="space-y-2">
              {tela.completo.insercoes.map((cena) => (
                <LinhaDaCena
                  key={cena.indice}
                  cena={cena}
                  aberto={aberto}
                  ocupado={ocupado}
                  chave={chaveDe({ alvo: "completo", cena: cena.indice })}
                  novaIdeia={tela.creditos.novaIdeia}
                  naCena={(a, texto) => naCena({ alvo: "completo", cena: cena.indice }, a, texto)}
                />
              ))}
            </div>
          )}
        </Secao>
      )}

      {/* ── Legenda (30/09): a escolha que vale para os cortes e o completo,
          com o atalho para mudar ANTES de aprovar. A montagem lê a escolha na
          hora de montar, então trocar aqui vale para esta geração. ── */}
      <Secao titulo="Legenda dos vídeos" subtitulo="Com ou sem legenda, e em qual estilo. Vale para os cortes e para o vídeo completo.">
        <EscolhaDaLegenda projectId={tela.projectId} compacto />
      </Secao>

      {/* ── Refazer com estes ajustes (reedição, 30/09) ── */}
      {editando && reed && (
        <div className="sticky bottom-0 z-30 mt-6 -mx-4 lg:-mx-8 border-t" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
          <div className="px-4 lg:px-8 py-4 flex items-center justify-between gap-4 flex-wrap lg:flex-nowrap">
            <div className="text-sm min-w-0" style={{ color: "var(--text-muted)" }}>
              {reed.mudancas.length ? (
                <>
                  <p>
                    <strong style={{ color: "var(--text-primary)" }}>
                      {reed.mudancas.length} {reed.mudancas.length === 1 ? "mudança" : "mudanças"}:
                    </strong>{" "}
                    {reed.mudancas.join("; ")}.
                  </p>
                  <p className="text-xs mt-0.5">
                    {reed.creditos > 0
                      ? `Gera ${reed.geracao}: ${reed.creditos} créditos. O resto reaproveita as imagens e cenas que já existem.`
                      : "Sem custo novo: reaproveito as imagens e cenas que já existem."}
                    {tela.creditos.saldo !== null && !tela.creditos.interno ? ` Seu saldo: ${creditosNaTela(tela.creditos.saldo)}.` : ""}
                  </p>
                </>
              ) : (
                <p>Nada mudou ainda. Mexa numa cena, numa palavra ou no começo e no fim de um corte.</p>
              )}
              {erro && (
                <p className="text-xs mt-1 font-medium text-red-500" role="alert">
                  {erro}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                disabled={refazendo || Boolean(ocupado)}
                onClick={() => void acao(`/api/videos/${tela.videoId}/roteiro/reedicao`, { acao: "descartar" }, "reedicao")}
              >
                Descartar mudanças
              </Button>
              <Button size="lg" onClick={refazer} disabled={!reed.mudancas.length || refazendo || Boolean(ocupado)}>
                {refazendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Refazer com estes ajustes{reed.creditos > 0 ? ` (${reed.creditos} créditos)` : ""}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Aprovar ── */}
      {aberto && !reed && (
        <div
          className="sticky bottom-0 z-30 mt-6 -mx-4 lg:-mx-8 border-t"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="px-4 lg:px-8 py-4 flex items-center justify-between gap-4 flex-wrap lg:flex-nowrap">
            <div className="text-sm min-w-0" style={{ color: "var(--text-muted)" }}>
              {/* SÓ O COMPLETO (02/10): vídeo curto já vai inteiro, sem cortes. */}
              {tela.videoCurto && (
                <p className="text-xs mb-1 font-medium" style={{ color: "var(--accent-orange)" }}>
                  Este vídeo já é curto ({mmss(tela.duracaoSec)}): publique ele inteiro. Os cortes são opcionais.
                </p>
              )}
              <p>
                <strong style={{ color: "var(--text-primary)" }}>
                  {n === 0 ? "Só o vídeo completo" : `${n} ${n === 1 ? "corte escolhido" : "cortes escolhidos"}`}
                </strong>{" "}
                {n === 0 ? "(nenhum corte)." : "e o vídeo completo."} Ao aprovar, uso{" "}
                <strong style={{ color: "var(--text-primary)" }}>{creditosNaTela(aPagar)} créditos</strong>, a segunda
                parte ({creditosNaTela(tela.creditos.completo + aberturaCreditos)} do completo e {creditosNaTela(tela.creditos.porCorte)} por
                corte).
              </p>
              {aberturaCreditos > 0 && (
                <p className="text-xs mt-0.5">Inclui {creditosNaTela(aberturaCreditos)} créditos da abertura com os melhores momentos.</p>
              )}
              <p className="text-xs mt-0.5">
                A primeira parte, {creditosNaTela(tela.creditos.roteiro)} créditos da transcrição, da limpeza, da semana
                escrita e deste roteiro, já foi usada.
                {tela.creditos.saldo !== null && !tela.creditos.interno ? ` Seu saldo: ${creditosNaTela(tela.creditos.saldo)}.` : ""}
              </p>
              {/* O erro também AQUI, ao lado do botão (30/09): o aviso do topo
                  ficava fora da vista de quem aprova no fim da página, e o
                  clique parecia não fazer nada. */}
              {erro && (
                <p className="text-xs mt-1 font-medium text-red-500" role="alert">
                  {erro}
                </p>
              )}
            </div>
            <Button size="lg" className="w-full sm:w-auto h-auto min-h-11 whitespace-normal py-2" onClick={aprovar} disabled={(!n && !tela.completo) || aprovando || Boolean(ocupado)}>
              {aprovando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {n === 0 ? "Aprovar só o vídeo completo" : "Aprovar e gerar"} ({creditosNaTela(aPagar)} créditos)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────── partes ───────────────────────────────

function Secao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border p-3 sm:p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
        {titulo}
      </h2>
      {subtitulo && (
        <p className="text-xs mt-1 mb-3" style={{ color: "var(--text-muted)" }}>
          {subtitulo}
        </p>
      )}
      <div className={subtitulo ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Aviso({ tipo, children, parado = false }: { tipo: "andando" | "ok" | "erro"; children: React.ReactNode; parado?: boolean }) {
  const estilo =
    tipo === "erro"
      ? "border-red-500/40 bg-red-500/10 text-red-300"
      : tipo === "ok"
        ? "border-green-500/30 bg-green-500/10 text-green-300"
        : "border-orange-500/40 bg-orange-500/10 text-orange-300";
  const Icone = tipo === "erro" ? AlertCircle : tipo === "ok" ? Check : parado ? Pencil : Loader2;
  return (
    <div className={`mt-4 rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${estilo}`} role={tipo === "erro" ? "alert" : undefined}>
      <Icone className={`w-4 h-4 mt-0.5 shrink-0 ${tipo === "andando" && !parado ? "animate-spin" : ""}`} />
      <span>{children}</span>
    </div>
  );
}

function CorrecaoDePalavras({
  tela,
  aberto,
  ocupado,
  aoCorrigir,
}: {
  tela: Tela;
  aberto: boolean;
  ocupado: string | null;
  aoCorrigir: (errado: string, certo: string) => Promise<boolean>;
}) {
  const [errado, setErrado] = useState("");
  const [certo, setCerto] = useState("");
  return (
    <Secao
      titulo="Corrigir palavras"
      subtitulo="Viu uma palavra que saiu errada na fala abaixo? Corrija aqui e ela muda na legenda e no texto do vídeo inteiro, e nos próximos vídeos deste projeto."
    >
      {tela.trocas.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {tela.trocas.map((t) => (
            <span
              key={`${t.errado}>${t.certo}`}
              className="text-xs rounded-full border px-2.5 py-1"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <span className="line-through opacity-60">{t.errado}</span> vira <strong>{t.certo}</strong>
            </span>
          ))}
        </div>
      )}
      {aberto && (
        <form
          className="flex items-center gap-2 flex-wrap"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await aoCorrigir(errado, certo)) {
              setErrado("");
              setCerto("");
            }
          }}
        >
          <input
            value={errado}
            onChange={(e) => setErrado(e.target.value)}
            placeholder="Como saiu (ex.: Cloud)"
            className="h-9 rounded-lg border px-3 text-sm bg-transparent w-44"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            vira
          </span>
          <input
            value={certo}
            onChange={(e) => setCerto(e.target.value)}
            placeholder="O certo (ex.: Claude)"
            className="h-9 rounded-lg border px-3 text-sm bg-transparent w-44"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={!errado.trim() || !certo.trim() || ocupado === "termos"}>
            {ocupado === "termos" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SpellCheck className="w-3.5 h-3.5" />}
            Corrigir no vídeo inteiro
          </Button>
        </form>
      )}
    </Secao>
  );
}

function TextoNoAr({ texto }: { texto: string }) {
  // " / " marca onde a limpeza tirou pausa, muleta ou repetição.
  const partes = texto.split(" / ");
  return (
    <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
      {partes.map((p, i) => (
        <span key={i}>
          {i > 0 && (
            <span className="text-orange-400/70 mx-1" title="Aqui tirei uma pausa, muleta ou repetição">
              /
            </span>
          )}
          {p}
        </span>
      ))}
    </p>
  );
}

function CartaoDoCorte({
  corte: c,
  escolhido,
  podeEscolher,
  aberto,
  aoAlternar,
  ocupado,
  novaIdeia,
  naCena,
  naBorda,
  maxCortes,
  naAbertura,
  controle,
}: {
  corte: CorteNaTela;
  escolhido: boolean;
  podeEscolher: boolean;
  aberto: boolean;
  aoAlternar: () => void;
  ocupado: string | null;
  novaIdeia: number;
  naCena: (cena: number, acao: "remover" | "editar" | "restaurar" | "nova-ideia", texto?: string) => Promise<boolean>;
  /** Só na reedição: muda o começo ou o fim do corte, uma frase por vez. */
  naBorda?: (lado: "inicio" | "fim", sentido: "antes" | "depois") => Promise<boolean>;
  maxCortes: number;
  /** Trocar ou desligar o gancho do corte (antes da aprovação). */
  naAbertura?: (acao: "trocar" | "desligar" | "ligar") => Promise<boolean>;
  /** O controle do corte (03/10): começo, fim e trechos do meio, palavra por palavra. */
  controle?: { videoId: string; aoAplicar: (r: { modo: "roteiro" | "no-ar"; mensagem: string }) => void };
}) {
  const [controlando, setControlando] = useState(false);
  // Aberto por escolha do cliente, ou por estar escolhido (o corte que vai ao ar mostra as cenas).
  const [abertoAMao, setVerCenas] = useState<boolean | null>(null);
  const verCenas = abertoAMao ?? escolhido;
  const efeitos = useMemo(() => (c.cenas ?? []).filter((x) => x.efeito).length, [c.cenas]);
  return (
    <div
      className="rounded-xl border p-3 sm:p-4 transition-colors"
      style={{ borderColor: escolhido ? "var(--accent-orange)" : "var(--border)", background: escolhido ? "color-mix(in srgb, var(--acento) 5%, transparent)" : "transparent" }}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={aoAlternar}
          disabled={!podeEscolher}
          aria-pressed={escolhido}
          title={escolhido ? "Tirar este corte" : podeEscolher ? "Escolher este corte" : `Você já escolheu ${maxCortes} cortes`}
          className="mt-0.5 w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 disabled:opacity-40"
          style={{ borderColor: escolhido ? "var(--accent-orange)" : "var(--border)", background: escolhido ? "var(--accent-orange)" : "transparent" }}
        >
          {escolhido && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {c.titulo}
            </p>
            <p className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              {mmss(c.inicio)} a {mmss(c.fim)} da gravação, {Math.round(c.duracao)} s no ar
              {c.nota !== null ? `, nota ${c.nota}` : ""}
            </p>
          </div>
          {c.motivo && (
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {c.motivo}
            </p>
          )}
          {/* A revisão do plano (01/10): o cliente vê que o plano foi conferido. */}
          {c.revisado && (
            <p className="mt-2 text-xs flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              {c.revisado}
            </p>
          )}
          <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
              <Scissors className="w-3 h-3" />O que vai ao ar, palavra por palavra
            </p>
            <TextoNoAr texto={c.texto} />
            {c.gancho && <LinhaDoGancho gancho={c.gancho} ocupado={ocupado} chave={`abertura:corte:${c.indice}`} naAbertura={naAbertura} />}
            {naBorda && (
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                {(
                  [
                    ["inicio", "antes", "Começar uma frase antes"],
                    ["inicio", "depois", "Começar uma frase depois"],
                    ["fim", "antes", "Terminar uma frase antes"],
                    ["fim", "depois", "Terminar uma frase depois"],
                  ] as const
                ).map(([lado, sentido, rotulo]) => (
                  <Button key={rotulo} size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={Boolean(ocupado)} onClick={() => void naBorda(lado, sentido)}>
                    {rotulo}
                  </Button>
                ))}
                {ocupado === `borda:${c.indice}` && <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />}
              </div>
            )}
            {controle && !controlando && (
              <Button size="sm" variant="outline" className="mt-2 h-9" onClick={() => setControlando(true)}>
                <Scissors className="w-4 h-4" /> Controlar o corte
              </Button>
            )}
          </div>
          {controle && controlando && (
            <div className="mt-3">
              <ControleDoCorte videoId={controle.videoId} indice={c.indice} aoAplicar={controle.aoAplicar} aoFechar={() => setControlando(false)} />
            </div>
          )}

          {c.cenas ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setVerCenas(!verCenas)}
                className="text-sm font-medium text-orange-400 hover:underline"
              >
                {verCenas ? "Esconder as cenas" : `Ver as ${c.cenas.length} cenas (${efeitos} com efeito)`}
              </button>
              {verCenas && (
                <div className="mt-2 space-y-2">
                  {c.cenas.map((cena) => (
                    <LinhaDaCena
                      key={cena.indice}
                      cena={cena}
                      aberto={aberto}
                      ocupado={ocupado}
                      chave={chaveDe({ alvo: "corte", trecho: c.indice, cena: cena.indice })}
                      novaIdeia={novaIdeia}
                      naCena={(a, texto) => naCena(cena.indice, a, texto)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            c.semCenas && (
              <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                {c.semCenas}
              </p>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A ABERTURA COM OS MELHORES MOMENTOS (01/10): as frases que abrem o vídeo
 * completo, em cortes rápidos, com o texto de soco de cada uma. O cliente
 * troca uma frase pela próxima forte, tira, põe mais uma, ou desliga a
 * abertura inteira (e os créditos dela saem do total).
 */
function AberturaDoCompleto({
  completo,
  creditos,
  ocupado,
  naAbertura,
}: {
  completo: CompletoNaTela;
  creditos: number;
  ocupado: string | null;
  naAbertura?: (corpo: AcaoDaAbertura) => Promise<boolean>;
}) {
  const a = completo.abertura;
  if (!a) return null;
  const ocupada = Boolean(ocupado?.startsWith("abertura:completo"));
  return (
    <div className="mb-4 rounded-xl border p-3 sm:p-4" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
            <Zap className="w-4 h-4 text-orange-400" />
            Abertura com os melhores momentos
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {a.ativa
              ? `Antes do conteúdo, ${a.momentos.length} frases fortes do próprio vídeo em cortes rápidos (${Math.round(a.duracao)} s), cada uma com zoom de impacto, o texto de soco na tela, flash e som de transição. ${creditos ? `${creditos} créditos.` : ""}`
              : a.semAbertura ?? "Abertura desligada: o vídeo começa direto no conteúdo, e os créditos dela saem do total."}
          </p>
        </div>
        {naAbertura && (a.momentos.length > 0 || !a.ativa) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={ocupada}
            onClick={() => void naAbertura({ alvo: "completo", acao: a.ativa ? "desligar" : "ligar" })}
          >
            {a.ativa ? <XCircle className="w-3.5 h-3.5" /> : <Undo2 className="w-3.5 h-3.5" />}
            {a.ativa ? "Tirar a abertura" : "Voltar com a abertura"}
          </Button>
        )}
      </div>
      {a.ativa && (
        <ol className="mt-3 space-y-2">
          {a.momentos.map((m) => (
            <li key={`${m.indice}-${m.inicio}`} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
              <div className="flex flex-col sm:flex-row items-start gap-1 sm:gap-3">
                <p className="text-xs font-semibold tabular-nums shrink-0 sm:w-[88px] pt-0.5 text-orange-400">
                  {mmss(m.inicio)}, {(m.fim - m.inicio).toFixed(1)} s
                </p>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
                    {m.soco}
                  </p>
                  <p className="text-xs mt-0.5 italic" style={{ color: "var(--text-muted)" }}>
                    “{m.frase}”
                  </p>
                  {m.porque && (
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      Por quê: {m.porque}
                    </p>
                  )}
                  {naAbertura && (
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={ocupada || a.reservas === 0} onClick={() => void naAbertura({ alvo: "completo", acao: "trocar", momento: m.indice })}>
                        <Shuffle className="w-3.5 h-3.5" />
                        Trocar por outra frase
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={ocupada || a.momentos.length <= 1} onClick={() => void naAbertura({ alvo: "completo", acao: "tirar", momento: m.indice })}>
                        <XCircle className="w-3.5 h-3.5" />
                        Tirar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {a.ativa && naAbertura && a.reservas > 0 && a.duracao < 25 && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs mt-2" disabled={ocupada} onClick={() => void naAbertura({ alvo: "completo", acao: "acrescentar" })}>
          <Plus className="w-3.5 h-3.5" />
          Pôr mais uma frase
        </Button>
      )}
      {ocupada && <Loader2 className="w-3.5 h-3.5 mt-2 animate-spin text-orange-400" />}
    </div>
  );
}

/**
 * Onde há edição ao longo do vídeo e onde há tela compartilhada (01/10): uma
 * barra por minuto com o número de inserções, e as faixas de tela com o que
 * elas mostram. O cliente confere que nada fica sem edição, nem a tela.
 */
function CoberturaETelas({ completo }: { completo: CompletoNaTela }) {
  const porMinuto = completo.porMinuto ?? [];
  const telas = completo.telas ?? [];
  if (!porMinuto.length && !telas.length) return null;
  const maior = Math.max(1, ...porMinuto);
  return (
    <div className="mb-4">
      {porMinuto.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
            Efeitos por minuto
          </p>
          <div className="flex items-end gap-0.5 h-10" role="img" aria-label={`Efeitos por minuto: ${porMinuto.join(", ")}`}>
            {porMinuto.map((q, i) => (
              <div key={i} className="flex-1 min-w-[4px] rounded-sm bg-orange-400/80" style={{ height: `${Math.max(6, (q / maior) * 100)}%`, opacity: q ? 1 : 0.25 }} title={`Minuto ${i}: ${q}`} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] mt-0.5 tabular-nums" style={{ color: "var(--text-muted)" }}>
            <span>0:00</span>
            <span>{mmss(completo.duracao)}</span>
          </div>
        </>
      )}
      {telas.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
            Tela compartilhada (editada com zoom e chamada, com você no canto)
          </p>
          <ul className="space-y-1">
            {telas.map((t, i) => (
              <li key={i} className="text-xs flex gap-2" style={{ color: "var(--text-primary)" }}>
                <Monitor className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
                <span className="tabular-nums shrink-0" style={{ color: "var(--text-muted)" }}>
                  {mmss(t.inicio)} a {mmss(t.fim)}
                </span>
                <span>{t.mostra.length ? t.mostra.join("; ") : "tela do computador"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** O gancho do corte curto (01/10): a frase que toca antes do começo, com zoom e som de impacto. */
function LinhaDoGancho({
  gancho,
  ocupado,
  chave,
  naAbertura,
}: {
  gancho: NonNullable<CorteNaTela["gancho"]>;
  ocupado: string | null;
  chave: string;
  naAbertura?: (acao: "trocar" | "desligar" | "ligar") => Promise<boolean>;
}) {
  const ocupada = Boolean(ocupado?.startsWith(chave));
  return (
    <div className="mt-2 pt-2 border-t text-xs" style={{ borderColor: "var(--border)" }}>
      <p style={{ color: "var(--text-muted)" }}>
        <Zap className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-orange-400" />
        {gancho.ativo ? (
          <>
            Abre com o gancho ({(gancho.fim - gancho.inicio).toFixed(1)} s, de {mmss(gancho.inicio)} do corte):{" "}
            <span className="italic" style={{ color: "var(--text-primary)" }}>
              “{gancho.frase}”
            </span>{" "}
            <strong className="uppercase" style={{ color: "var(--text-primary)" }}>
              {gancho.soco}
            </strong>
          </>
        ) : (
          "Sem gancho: o corte começa direto na primeira frase."
        )}
      </p>
      {naAbertura && (
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {gancho.ativo && gancho.reservas > 0 && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={ocupada} onClick={() => void naAbertura("trocar")}>
              <Shuffle className="w-3.5 h-3.5" />
              Trocar o gancho
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={ocupada} onClick={() => void naAbertura(gancho.ativo ? "desligar" : "ligar")}>
            {gancho.ativo ? <XCircle className="w-3.5 h-3.5" /> : <Undo2 className="w-3.5 h-3.5" />}
            {gancho.ativo ? "Sem gancho" : "Voltar com o gancho"}
          </Button>
          {ocupada && <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />}
        </div>
      )}
    </div>
  );
}

/** O desenho de cada peça da edição (02/10): ícone e rótulo curto. */
const ICONE_DA_PECA: Record<IconeDaPeca, typeof User> = {
  pessoa: User,
  "pessoa-elemento": UserSquare2,
  video: Film,
  imagem: ImageIcon,
  janela: PictureInPicture2,
  dividida: Columns2,
  cartela: Type,
  recorte: Scissors,
  texto: Type,
  icone: Smile,
  numero: Hash,
  grafico: BarChart3,
  logo: BadgeCheck,
  seta: ArrowUpRight,
  aproximacao: ZoomIn,
  parado: Square,
  afastamento: ZoomOut,
  corte: Scissors,
  deslize: MoveRight,
  flash: Zap,
  fusao: Blend,
  papel: FileText,
};

function Peca({ peca, destaque }: { peca: PecaDaCena; destaque?: boolean }) {
  const Icone = ICONE_DA_PECA[peca.icone] ?? Sparkles;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-tight max-w-full"
      style={{ background: destaque ? "rgba(249,115,22,0.12)" : "var(--bg-elevated)", color: destaque ? "var(--accent-orange)" : "var(--text-primary)" }}
    >
      <Icone className="w-3 h-3 shrink-0" />
      <span className="min-w-0 break-words">{peca.rotulo}</span>
    </span>
  );
}

export function LinhaDaCena({
  cena,
  aberto,
  ocupado,
  chave,
  novaIdeia,
  naCena,
}: {
  cena: CenaNaTela;
  aberto: boolean;
  ocupado: string | null;
  chave: string;
  novaIdeia: number;
  naCena: (acao: "remover" | "editar" | "restaurar" | "nova-ideia", texto?: string) => Promise<boolean>;
}) {
  const [modo, setModo] = useState<"ver" | "editar" | "ideia">("ver");
  const [texto, setTexto] = useState("");
  const trabalhando = Boolean(ocupado?.startsWith(`${chave}:`));
  const rotuloDoEditar = cena.edicao.tipo === "imagem" ? "Mudar a imagem" : cena.edicao.tipo === "texto" ? "Mudar o texto" : "Pôr uma imagem aqui";
  const selo =
    cena.ajuste === "removido" ? "efeito tirado" : cena.ajuste === "editado" ? "ideia sua" : cena.ajuste === "nova-ideia" ? "ideia nova" : null;

  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--bg-primary, transparent)" }}>
      {/* No celular o tempo vai EM CIMA do texto (30/09): lado a lado, com as
          margens da seção e do corte, sobravam ~120 px para a descrição da
          cena e o Bruno viu a linha do tempo "encavalada". */}
      <div className="flex flex-col sm:flex-row items-start gap-1 sm:gap-3">
        <p className="text-xs font-semibold tabular-nums shrink-0 sm:w-[88px] pt-0.5" style={{ color: cena.efeito ? "var(--accent-orange)" : "var(--text-muted)" }}>
          {mmss(cena.inicio)} a {mmss(cena.fim)}
        </p>
        <div className="min-w-0 flex-1">
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            {cena.efeito ? <Sparkles className="inline w-3.5 h-3.5 mr-1 text-orange-400 -mt-0.5" /> : <Video className="inline w-3.5 h-3.5 mr-1 -mt-0.5 opacity-50" />}
            {cena.descricao}
            {selo && (
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 bg-orange-500/15" style={{ color: "var(--accent-orange)" }}>
                {selo}
              </span>
            )}
          </p>
          {/* A EDIÇÃO DE VERDADE (02/10): o que acontece na tela, em peças. */}
          <div className="flex flex-wrap gap-1 mt-1.5">
            <Peca peca={cena.visual.tela} destaque={cena.efeito} />
            {cena.visual.entra.map((p, i) => (
              <Peca key={i} peca={p} />
            ))}
            <Peca peca={cena.visual.movimento} />
            <Peca peca={cena.visual.transicao} />
          </div>
          {/* O PEDIDO DO CLIENTE (02/10): nunca some em silêncio. */}
          {cena.pedido && (
            <div className="mt-1.5 rounded-md px-2 py-1.5 text-[11px] space-y-0.5" style={{ background: "var(--bg-elevated)" }}>
              <p style={{ color: "var(--text-primary)" }}>
                <MessageSquareQuote className="inline w-3 h-3 mr-1 -mt-0.5 opacity-70" />
                Seu pedido: “{cena.pedido.texto}”
              </p>
              {cena.pedido.atendido === "sim" ? (
                <p className="text-emerald-500">
                  <Check className="inline w-3 h-3 mr-1 -mt-0.5" />
                  Vai ser feito assim.
                </p>
              ) : (
                <p style={{ color: "var(--accent-orange)" }}>
                  <AlertCircle className="inline w-3 h-3 mr-1 -mt-0.5" />
                  Não deu para fazer exatamente assim: {cena.pedido.motivo ?? "o diretor fez o mais perto possível"}.
                </p>
              )}
            </div>
          )}
          {cena.pedidoDaImagem && (
            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
              Pedido ao gerador de imagem: {cena.pedidoDaImagem}
            </p>
          )}
          <p className="text-xs mt-1 italic" style={{ color: "var(--text-muted)" }}>
            “{cena.fala}”
          </p>
          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
            Entra com: {cena.transicao}
            {cena.porque ? `. Por quê: ${cena.porque}` : ""}
          </p>

          {aberto && modo === "ver" && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {cena.efeito && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={trabalhando} onClick={() => void naCena("remover")}>
                  <XCircle className="w-3.5 h-3.5" />
                  Tirar o efeito
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={trabalhando}
                onClick={() => {
                  setTexto(cena.edicao.atual);
                  setModo("editar");
                }}
              >
                <Pencil className="w-3.5 h-3.5" />
                {rotuloDoEditar}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={trabalhando}
                onClick={() => {
                  setTexto("");
                  setModo("ideia");
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Outra ideia (~{novaIdeia} créditos)
              </Button>
              {cena.temOriginal && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={trabalhando} onClick={() => void naCena("restaurar")}>
                  <Undo2 className="w-3.5 h-3.5" />
                  Desfazer
                </Button>
              )}
              {trabalhando && <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />}
            </div>
          )}

          {aberto && modo !== "ver" && (
            <form
              className="mt-2 space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await naCena(modo === "editar" ? "editar" : "nova-ideia", texto);
                if (ok) setModo("ver");
              }}
            >
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={2}
                autoFocus
                placeholder={
                  modo === "editar"
                    ? cena.edicao.tipo === "texto"
                      ? "O texto que aparece na tela"
                      : "Descreva o que você quer ver (ex.: imagem realista de Moisés no alto do monte)"
                    : "Diga o que você quer nesta cena (opcional). Em branco, o diretor propõe outra ideia."
                }
                className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
              />
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={trabalhando || (modo === "editar" && !texto.trim())}>
                  {trabalhando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : modo === "editar" ? <Check className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  {modo === "editar" ? "Salvar" : `Pedir outra ideia (${novaIdeia} créditos)`}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={trabalhando} onClick={() => setModo("ver")}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
