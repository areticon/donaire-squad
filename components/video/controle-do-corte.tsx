"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Loader2, Pause, Play, RotateCcw, Scissors, SkipBack, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  blocoDaIA,
  calcularCorte,
  fraseDaPalavra,
  mesmaEscolha,
  resumoDaMudanca,
  tempoCurto,
  trechosParaTocar,
  type ControleDoCorte as Dados,
  type EscolhaDoCorte,
} from "@/lib/media/controle-do-corte";

/**
 * O CONTROLE DO CORTE (03/10/2026), do lado do cliente: no card do corte e na
 * tela de roteiro, no celular (toque) e no computador.
 *
 * - a faixa do tempo, com o que fica e o que sai, e as duas alças (começo e
 *   fim) que encaixam na palavra; mais um passo de palavra e o ajuste fino de
 *   0,1 s em cada borda;
 * - a fala palavra por palavra: tocar numa frase tira ou devolve; o que a IA
 *   tirou aparece riscado e volta com um toque; palavra fora do corte vira o
 *   começo ou o fim;
 * - o player toca a gravação pulando o que sai, sem render: o que se ouve é o
 *   que o worker vai emendar (a conta é a mesma, lib/media/controle-do-corte.ts);
 * - "Aplicar e montar" refaz só este corte, sem pagar de novo o que já foi pago.
 *
 * Componente de cliente: só importa o módulo puro, nunca o de banco.
 */

type Resultado = { modo: "roteiro" | "no-ar"; mensagem: string; divergencias: number; controle: Dados };

export function ControleDoCorte({
  videoId,
  indice,
  aoAplicar,
  aoFechar,
}: {
  videoId: string;
  indice: number;
  /** Depois de aplicar: o card vigia o re-corte, a tela de roteiro recarrega. */
  aoAplicar?: (r: { modo: "roteiro" | "no-ar"; mensagem: string }) => void;
  aoFechar?: () => void;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<EscolhaDoCorte | null>(null);
  const [porPalavra, setPorPalavra] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch(`/api/videos/${videoId}/controle-do-corte?trecho=${indice}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as Dados & { error?: string };
      if (!r.ok) throw new Error(j.error ?? `A plataforma recusou (código ${r.status}).`);
      setDados(j);
      setEscolha(j.atual);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui abrir o controle do corte.");
    }
  }, [videoId, indice]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const pos = useMemo(() => new Map((dados?.palavras ?? []).map((p, k) => [p.i, k])), [dados]);
  const calc = useMemo(
    () => (dados && escolha ? calcularCorte(dados.palavras, dados.remocoesDaIA, escolha, dados.duracaoDaGravacao) : null),
    [dados, escolha]
  );
  const original = useMemo(
    () => (dados ? calcularCorte(dados.palavras, dados.remocoesDaIA, dados.atual, dados.duracaoDaGravacao) : null),
    [dados]
  );
  const mudou = Boolean(dados && escolha && !mesmaEscolha(dados.atual, escolha));
  const mudancas = useMemo(() => (dados && escolha && mudou ? resumoDaMudanca(dados.palavras, dados.atual, escolha) : []), [dados, escolha, mudou]);
  const noAr = useMemo(() => new Set(calc?.noAr ?? []), [calc]);
  const devolvidosAntes = useMemo(() => dados?.mantidosPeloUsuario ?? [], [dados]);

  // ─────────────── o player: a gravação, pulando o que sai ───────────────
  const video = useRef<HTMLVideoElement | null>(null);
  const [tocando, setTocando] = useState(false);
  const [agora, setAgora] = useState<number | null>(null);
  const [carregandoVideo, setCarregandoVideo] = useState(false);
  const trechos = useMemo(() => (calc ? trechosParaTocar(calc) : []), [calc]);
  const trechosRef = useRef(trechos);
  trechosRef.current = trechos;

  useEffect(() => {
    if (!tocando) return;
    let quadro = 0;
    const passo = () => {
      const v = video.current;
      const ts = trechosRef.current;
      if (!v || !ts.length) return;
      const t = v.currentTime;
      const dentro = ts.find((s) => t >= s.de - 0.03 && t < s.ate - 0.02);
      if (!dentro) {
        const proximo = ts.find((s) => s.de > t - 0.03);
        if (!proximo) {
          v.pause();
          setTocando(false);
          setAgora(null);
          return;
        }
        v.currentTime = proximo.de;
      }
      setAgora(v.currentTime);
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [tocando]);

  async function tocar(doComeco: boolean) {
    const v = video.current;
    if (!v || !trechos.length) return;
    if (tocando && !doComeco) {
      v.pause();
      setTocando(false);
      return;
    }
    const t = v.currentTime;
    const noCorte = trechos.some((s) => t >= s.de - 0.03 && t < s.ate - 0.02);
    if (doComeco || !noCorte) v.currentTime = trechos[0].de;
    setCarregandoVideo(true);
    try {
      await v.play();
      setTocando(true);
    } catch {
      setErro("O navegador não deixou tocar o vídeo. Toque de novo no play.");
    } finally {
      setCarregandoVideo(false);
    }
  }

  // O tempo no ar (do corte) do instante tocando.
  const tempoNoAr = useMemo(() => {
    if (agora === null) return 0;
    let s = 0;
    for (const x of trechos) {
      if (agora >= x.ate) s += x.ate - x.de;
      else {
        if (agora > x.de) s += agora - x.de;
        break;
      }
    }
    return s;
  }, [agora, trechos]);
  const palavraTocando = useMemo(() => {
    if (agora === null || !dados) return null;
    return dados.palavras.find((p) => agora >= p.inicio && agora < p.fim)?.i ?? null;
  }, [agora, dados]);

  // ─────────────── mexer na escolha ───────────────
  const mudar = (f: (e: EscolhaDoCorte) => EscolhaDoCorte) => {
    setFeito(null);
    setEscolha((e) => (e ? f(e) : e));
  };
  const lista = dados?.palavras ?? [];
  const k0 = escolha ? (pos.get(escolha.comecar) ?? 0) : 0;
  const k1 = escolha ? (pos.get(escolha.terminar) ?? 0) : 0;

  function moverBorda(lado: "comecar" | "terminar", k: number) {
    mudar((e) => {
      const alvo = Math.max(0, Math.min(lista.length - 1, k));
      const a = lado === "comecar" ? alvo : pos.get(e.comecar) ?? 0;
      const b = lado === "terminar" ? alvo : pos.get(e.terminar) ?? 0;
      if (b < a) return e;
      // A palavra que entra no corte vem como a IA deixou: a que a IA tirou continua fora.
      const fora = new Set(e.fora.filter((i) => {
        const p = pos.get(i) ?? -1;
        return p >= a && p <= b;
      }));
      for (let x = a; x <= b; x++) if ((x < (pos.get(e.comecar) ?? 0) || x > (pos.get(e.terminar) ?? 0)) && lista[x].ia) fora.add(lista[x].i);
      return { ...e, comecar: lista[a].i, terminar: lista[b].i, fora: [...fora], ...(lado === "comecar" ? { finoInicio: 0 } : { finoFim: 0 }) };
    });
  }

  function tocarPalavra(k: number) {
    if (!escolha) return;
    if (k < k0) return moverBorda("comecar", k);
    if (k > k1) return moverBorda("terminar", k);
    const p = lista[k];
    const fora = new Set(escolha.fora);
    const estaFora = fora.has(p.i);
    let [x, y]: [number, number] = [k, k];
    if (!porPalavra) [x, y] = estaFora && p.ia ? blocoDaIA(lista, k) : fraseDaPalavra(lista, k);
    x = Math.max(x, k0);
    y = Math.min(y, k1);
    mudar((e) => {
      const f = new Set(e.fora);
      for (let j = x; j <= y; j++) {
        // Devolver a frase que VOCÊ tirou não devolve junto o que a IA tirou nela (o gaguejo continua fora).
        if (estaFora) {
          if (porPalavra || p.ia || !lista[j].ia) f.delete(lista[j].i);
        } else f.add(lista[j].i);
      }
      return { ...e, fora: [...f] };
    });
  }

  const fino = (lado: "finoInicio" | "finoFim", d: number) =>
    mudar((e) => ({ ...e, [lado]: Math.max(-1.5, Math.min(1.5, Math.round((e[lado] + d) * 10) / 10)) }));

  async function aplicar() {
    if (!escolha) return;
    setAplicando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/videos/${videoId}/controle-do-corte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trecho: indice, escolha }),
      });
      const j = (await r.json().catch(() => ({}))) as Resultado & { error?: string };
      if (!r.ok) throw new Error(j.error ?? `A plataforma recusou (código ${r.status}).`);
      video.current?.pause();
      setTocando(false);
      setDados(j.controle);
      setEscolha(j.controle.atual);
      setFeito(j.mensagem + (j.divergencias ? ` (${j.divergencias} palavra(s) ficaram coladas no silêncio vizinho e não puderam sair sozinhas.)` : ""));
      aoAplicar?.({ modo: j.modo, mensagem: j.mensagem });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui aplicar agora.");
    } finally {
      setAplicando(false);
    }
  }

  // Abre com o começo do corte à vista.
  const caixaDasPalavras = useRef<HTMLDivElement | null>(null);
  const rolou = useRef(false);
  useEffect(() => {
    if (!dados || rolou.current) return;
    rolou.current = true;
    const el = caixaDasPalavras.current?.querySelector<HTMLElement>("[data-borda='comeco']");
    if (el && caixaDasPalavras.current) caixaDasPalavras.current.scrollTop = Math.max(0, el.offsetTop - caixaDasPalavras.current.offsetTop - 24);
  }, [dados]);

  if (erro && !dados) {
    return (
      <div className="rounded-xl border px-3 py-3 text-sm flex items-start gap-2 border-red-500/40 bg-red-500/10 text-red-400" role="alert">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <span className="flex-1">{erro}</span>
        <Button size="sm" variant="ghost" onClick={() => void carregar()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  if (!dados || !escolha || !calc || !original) {
    return (
      <div className="rounded-xl border px-3 py-6 text-sm flex items-center justify-center gap-2" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        <Loader2 className="w-4 h-4 animate-spin" /> Abrindo a fala deste corte…
      </div>
    );
  }

  const travado = Boolean(dados.impedimento);
  const curto = calc.duracao < 10;
  const comeco = lista.slice(k0, Math.min(k1 + 1, k0 + 4)).map((p) => p.texto).join(" ");
  const final = lista.slice(Math.max(k0, k1 - 3), k1 + 1).map((p) => p.texto).join(" ");
  const ref = dados.refacoes;

  return (
    <div className="rounded-xl border p-3 sm:p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }} data-controle-do-corte>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
            <Scissors className="w-4 h-4" /> Controle do corte
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Puxe o começo e o fim, toque numa frase para tirar ou devolver, e ouça antes de aplicar.
          </p>
        </div>
        <p className="text-sm tabular-nums font-semibold" style={{ color: "var(--text-primary)" }}>
          {tempoCurto(calc.duracao)} no ar
          {Math.abs(calc.duracao - original.duracao) >= 0.1 && (
            <span className="font-normal text-xs ml-1" style={{ color: "var(--text-muted)" }}>
              (era {tempoCurto(original.duracao)})
            </span>
          )}
        </p>
      </div>

      {/* O player: a gravação, pulando o que sai. */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,15rem)_1fr] items-start">
        <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
          <video
            ref={video}
            src={dados.fonteUrl}
            poster={dados.posterUrl ?? undefined}
            preload="metadata"
            playsInline
            onPause={() => setTocando(false)}
            onWaiting={() => setCarregandoVideo(true)}
            onPlaying={() => setCarregandoVideo(false)}
            className="w-full h-full object-contain"
          />
          {carregandoVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            </div>
          )}
        </div>
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="h-10 min-w-10" onClick={() => void tocar(false)} aria-label={tocando ? "Pausar" : "Ouvir o corte"}>
              {tocando ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {tocando ? "Pausar" : "Ouvir o corte"}
            </Button>
            <Button size="sm" variant="ghost" className="h-10" onClick={() => void tocar(true)}>
              <SkipBack className="w-4 h-4" /> Do começo
            </Button>
            <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              {tempoCurto(tempoNoAr, true)} de {tempoCurto(calc.duracao, true)}
            </span>
          </div>
          <FaixaDoTempo
            dados={dados}
            calc={calc}
            agora={agora}
            aoMoverBorda={(lado, t) => {
              // A alça encaixa na palavra mais perto do ponto solto.
              const candidatas = lista.map((p, k) => ({ p, k })).filter(({ k }) => (lado === "comecar" ? k <= k1 : k >= k0));
              const alvo = candidatas.reduce((m, c) => (Math.abs((lado === "comecar" ? c.p.inicio : c.p.fim) - t) < Math.abs((lado === "comecar" ? m.p.inicio : m.p.fim) - t) ? c : m), candidatas[0]);
              if (alvo) moverBorda(lado, alvo.k);
            }}
          />
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            O player toca a gravação pulando o que sai, sem gerar nada: é o que vai ao ar.
          </p>
        </div>
      </div>

      {/* As bordas: passo de palavra e ajuste fino. */}
      <div className="grid gap-2 sm:grid-cols-2">
        <Borda
          rotulo="Começa em"
          texto={`“${comeco}…”`}
          fino={escolha.finoInicio}
          aoPasso={(d) => moverBorda("comecar", k0 + d)}
          aoFino={(d) => fino("finoInicio", d)}
          desligado={travado}
        />
        <Borda
          rotulo="Termina em"
          texto={`“…${final}”`}
          fino={escolha.finoFim}
          aoPasso={(d) => moverBorda("terminar", k1 + d)}
          aoFino={(d) => fino("finoFim", d)}
          desligado={travado}
        />
      </div>

      {/* A fala, palavra por palavra. */}
      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            A fala, palavra por palavra
          </p>
          <div className="inline-flex rounded-lg border p-0.5 text-xs" style={{ borderColor: "var(--border)" }} role="group" aria-label="O toque tira ou devolve">
            {[
              [false, "Toque: a frase"],
              [true, "Toque: a palavra"],
            ].map(([v, r]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setPorPalavra(v as boolean)}
                className="px-2.5 py-1.5 rounded-md min-h-8"
                style={porPalavra === v ? { background: "var(--accent-orange)", color: "var(--bg-surface, #fff)" } : { color: "var(--text-muted)" }}
                aria-pressed={porPalavra === v}
              >
                {r as string}
              </button>
            ))}
          </div>
        </div>
        <div
          ref={caixaDasPalavras}
          className="rounded-lg border p-2.5 max-h-[45vh] sm:max-h-72 overflow-y-auto text-[15px] leading-9 select-none"
          style={{ borderColor: "var(--border)" }}
        >
          {lista.map((p, k) => {
            const dentro = k >= k0 && k <= k1;
            const fora = dentro && !noAr.has(p.i);
            const devolvida = dentro && !fora && Boolean(p.ia);
            const daIA = fora && Boolean(p.ia);
            const tocandoAgora = palavraTocando === p.i;
            const titulo = !dentro
              ? k < k0
                ? "Começar o corte aqui"
                : "Terminar o corte aqui"
              : fora
                ? daIA
                  ? `A IA tirou (${p.ia}). Toque para devolver.`
                  : "Você tirou. Toque para devolver."
                : devolvida
                  ? "Você devolveu este trecho. Toque para tirar de novo."
                  : "Toque para tirar.";
            return (
              <span key={p.i}>
                {k === k0 && (
                  <span data-borda="comeco" className="inline-block align-middle mx-0.5 px-1 rounded text-[10px] font-bold uppercase" style={{ background: "var(--accent-orange)", color: "var(--bg-surface, #fff)" }}>
                    começo
                  </span>
                )}
                <button
                  type="button"
                  disabled={travado}
                  title={titulo}
                  onClick={() => tocarPalavra(k)}
                  className={`px-[3px] py-0.5 rounded transition-colors ${fora ? "line-through" : ""} ${tocandoAgora ? "ring-2" : ""}`}
                  style={{
                    color: !dentro ? "var(--text-muted)" : fora ? (daIA ? "#f87171" : "#fb923c") : "var(--text-primary)",
                    opacity: !dentro ? 0.45 : fora ? 0.8 : 1,
                    background: tocandoAgora ? "color-mix(in srgb, var(--accent-orange) 25%, transparent)" : devolvida ? "color-mix(in srgb, #10b981 14%, transparent)" : "transparent",
                    textDecorationThickness: fora ? 2 : undefined,
                    boxShadow: devolvida ? "inset 0 -2px 0 #10b981" : undefined,
                  }}
                >
                  {p.texto}
                </button>{" "}
                {k === k1 && (
                  <span className="inline-block align-middle mx-0.5 px-1 rounded text-[10px] font-bold uppercase" style={{ background: "var(--accent-orange)", color: "var(--bg-surface, #fff)" }}>
                    fim
                  </span>
                )}
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span>
            <span className="line-through" style={{ color: "#f87171", textDecorationThickness: 2 }}>riscado</span>: a IA tirou, toque para devolver
          </span>
          <span>
            <span className="line-through" style={{ color: "#fb923c", textDecorationThickness: 2 }}>riscado</span>: você tirou
          </span>
          <span>
            <span style={{ boxShadow: "inset 0 -2px 0 #10b981" }}>sublinhado</span>: você devolveu, e fica mesmo
          </span>
          <span>apagado: fora do corte, toque para começar ou terminar ali</span>
        </div>
        {devolvidosAntes.length > 0 && (
          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
            Mantidos por você: {devolvidosAntes.map((d) => `“${d.texto}”`).join(", ")}. A revisão automática do vídeo pronto não tira esses trechos.
          </p>
        )}
      </div>

      {/* Resumo, custo e aplicar. */}
      <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: mudou ? "var(--accent-orange)" : "var(--border)" }}>
        {feito ? (
          <p className="text-sm flex items-start gap-2 text-emerald-500">
            <Check className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{feito}</span>
          </p>
        ) : mudancas.length ? (
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            <strong>O que muda:</strong> {mudancas.join("; ")}.
          </p>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nada mudou ainda.
          </p>
        )}
        {!feito && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {dados.modo === "roteiro"
              ? "Sem custo: fica no roteiro. "
              : ref.creditosDaProxima > 0
                ? `As ${ref.gratis} refações gratuitas deste corte já foram usadas: esta usa ${ref.creditosDaProxima} créditos${ref.saldo !== null && !ref.interno ? ` (seu saldo: ${ref.saldo.toLocaleString("pt-BR")})` : ""}. `
                : `Sem custo: refação ${ref.feitas + 1} de ${ref.gratis} gratuitas neste corte. `}
            {dados.depois}
          </p>
        )}
        {calc.divergencias.length > 0 && mudou && (
          <p className="text-xs text-amber-500">
            {calc.divergencias.length === 1 ? "1 palavra fica" : `${calc.divergencias.length} palavras ficam`} diferente do que você marcou: o silêncio entre elas é curto demais para cortar sem comer a vizinha.
          </p>
        )}
        {curto && <p className="text-xs text-red-400">Assim o corte fica com menos de 10 segundos no ar.</p>}
        {dados.impedimento && (
          <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {dados.impedimento}
          </p>
        )}
        {erro && (
          <p className="text-xs font-medium text-red-500" role="alert">
            {erro}
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {aoFechar && (
            <Button size="sm" variant="ghost" className="h-10" onClick={aoFechar}>
              Fechar
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-10" disabled={!mudou || aplicando} onClick={() => mudar(() => dados.atual)}>
            <Undo2 className="w-4 h-4" /> Desfazer
          </Button>
          <Button className="h-10 flex-1 sm:flex-none" disabled={!mudou || aplicando || travado || curto} onClick={() => void aplicar()}>
            {aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : dados.modo === "roteiro" ? <Check className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
            {dados.modo === "roteiro" ? "Guardar no roteiro" : ref.creditosDaProxima > 0 ? `Aplicar e montar (${ref.creditosDaProxima} créditos)` : "Aplicar e montar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * O botão que abre o controle dentro de um card (o do corte no quadro): o
 * controle só carrega a fala quando o cliente pede.
 */
export function AbrirControleDoCorte({
  videoId,
  indice,
  aoAplicar,
}: {
  videoId: string;
  indice: number;
  aoAplicar?: (r: { modo: "roteiro" | "no-ar"; mensagem: string }) => void;
}) {
  const [aberto, setAberto] = useState(false);
  if (!aberto) {
    return (
      <Button size="sm" variant="outline" className="h-10" onClick={() => setAberto(true)}>
        <Scissors className="w-4 h-4" /> Controlar o corte
      </Button>
    );
  }
  return <ControleDoCorte videoId={videoId} indice={indice} aoAplicar={aoAplicar} aoFechar={() => setAberto(false)} />;
}

function Borda({
  rotulo,
  texto,
  fino,
  aoPasso,
  aoFino,
  desligado,
}: {
  rotulo: string;
  texto: string;
  fino: number;
  aoPasso: (d: number) => void;
  aoFino: (d: number) => void;
  desligado: boolean;
}) {
  const b = "h-9 min-w-9 px-2 rounded-lg border text-xs inline-flex items-center justify-center gap-0.5 disabled:opacity-40";
  return (
    <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {rotulo}
      </p>
      <p className="text-sm truncate mt-0.5" style={{ color: "var(--text-primary)" }} title={texto}>
        {texto}
      </p>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <button type="button" className={b} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} disabled={desligado} onClick={() => aoPasso(-1)} aria-label={`${rotulo}: uma palavra antes`}>
          <ChevronLeft className="w-4 h-4" /> palavra
        </button>
        <button type="button" className={b} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} disabled={desligado} onClick={() => aoPasso(1)} aria-label={`${rotulo}: uma palavra depois`}>
          palavra <ChevronRight className="w-4 h-4" />
        </button>
        <span className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />
        <button type="button" className={b} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} disabled={desligado} onClick={() => aoFino(-0.1)} aria-label={`${rotulo}: 0,1 segundo antes`}>
          −0,1 s
        </button>
        <span className="text-xs tabular-nums w-12 text-center" style={{ color: fino ? "var(--text-primary)" : "var(--text-muted)" }}>
          {fino > 0 ? "+" : fino < 0 ? "−" : ""}
          {Math.abs(fino).toFixed(1).replace(".", ",")} s
        </span>
        <button type="button" className={b} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} disabled={desligado} onClick={() => aoFino(0.1)} aria-label={`${rotulo}: 0,1 segundo depois`}>
          +0,1 s
        </button>
      </div>
    </div>
  );
}

/**
 * A FAIXA DO TEMPO: a janela da gravação em volta do corte, com o que fica
 * (cheio), o que sai (listrado) e as duas alças. A alça se arrasta com o dedo
 * ou o mouse (pointer events com captura) e encaixa na palavra mais perto.
 */
function FaixaDoTempo({
  dados,
  calc,
  agora,
  aoMoverBorda,
}: {
  dados: Dados;
  calc: ReturnType<typeof calcularCorte>;
  agora: number | null;
  aoMoverBorda: (lado: "comecar" | "terminar", t: number) => void;
}) {
  const faixa = useRef<HTMLDivElement | null>(null);
  const [arrasto, setArrasto] = useState<{ lado: "comecar" | "terminar"; t: number } | null>(null);
  // A janela visível: o corte com uma folga dos dois lados, dentro da fala carregada.
  const w0 = dados.palavras[0].inicio;
  const w1 = dados.palavras[dados.palavras.length - 1].fim;
  const folga = Math.max(4, (calc.fim - calc.inicio) * 0.25);
  const de = Math.max(w0, Math.min(calc.inicio, arrasto?.t ?? Infinity) - folga);
  const ate = Math.min(w1, Math.max(calc.fim, arrasto?.t ?? -Infinity) + folga);
  const x = (t: number) => `${(((t - de) / Math.max(0.01, ate - de)) * 100).toFixed(3)}%`;
  const tempoDe = (clientX: number) => {
    const r = faixa.current!.getBoundingClientRect();
    return de + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (ate - de);
  };
  const tocar = trechosParaTocar(calc);
  const inicioMostrado = arrasto?.lado === "comecar" ? arrasto.t : calc.inicio;
  const fimMostrado = arrasto?.lado === "terminar" ? arrasto.t : calc.fim;

  const alca = (lado: "comecar" | "terminar") => (
    <div
      role="slider"
      tabIndex={0}
      aria-label={lado === "comecar" ? "Começo do corte" : "Fim do corte"}
      aria-valuenow={Math.round(lado === "comecar" ? inicioMostrado : fimMostrado)}
      className="absolute top-0 bottom-0 w-11 -ml-[22px] flex items-center justify-center cursor-ew-resize touch-none z-10"
      style={{ left: x(lado === "comecar" ? inicioMostrado : fimMostrado) }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setArrasto({ lado, t: tempoDe(e.clientX) });
      }}
      onPointerMove={(e) => {
        if (arrasto?.lado === lado) setArrasto({ lado, t: tempoDe(e.clientX) });
      }}
      onPointerUp={(e) => {
        if (arrasto?.lado === lado) aoMoverBorda(lado, tempoDe(e.clientX));
        setArrasto(null);
      }}
      onPointerCancel={() => setArrasto(null)}
    >
      <div className="h-full w-1.5 rounded-full shadow" style={{ background: "var(--accent-orange)" }} />
      <div className="absolute -top-0.5 w-4 h-4 rounded-sm rotate-45" style={{ background: "var(--accent-orange)" }} />
    </div>
  );

  return (
    <div>
      <div ref={faixa} className="relative h-14 rounded-lg overflow-visible select-none" style={{ background: "color-mix(in srgb, var(--text-muted) 12%, transparent)" }}>
        {/* As palavras como tracinhos, para a mão achar a fala. */}
        {dados.palavras
          .filter((p) => p.fim > de && p.inicio < ate)
          .map((p) => (
            <div key={p.i} className="absolute top-[38%] h-[24%] rounded-sm" style={{ left: x(p.inicio), width: `max(1px, calc(${x(p.fim)} - ${x(p.inicio)}))`, background: "color-mix(in srgb, var(--text-muted) 45%, transparent)" }} />
          ))}
        {/* O corte: listrado onde sai, cheio onde fica. */}
        <div
          className="absolute top-1 bottom-1 rounded"
          style={{
            left: x(inicioMostrado),
            width: `calc(${x(fimMostrado)} - ${x(inicioMostrado)})`,
            background: "repeating-linear-gradient(135deg, color-mix(in srgb, #f87171 30%, transparent) 0 4px, transparent 4px 8px)",
          }}
        />
        {!arrasto &&
          tocar.map((s, k) => (
            <div key={k} className="absolute top-1 bottom-1" style={{ left: x(s.de), width: `calc(${x(s.ate)} - ${x(s.de)})`, background: "color-mix(in srgb, var(--accent-orange) 45%, transparent)" }} />
          ))}
        {agora !== null && agora >= de && agora <= ate && <div className="absolute top-0 bottom-0 w-0.5 bg-white mix-blend-difference" style={{ left: x(agora) }} />}
        {alca("comecar")}
        {alca("terminar")}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums mt-1" style={{ color: "var(--text-muted)" }}>
        <span>{tempoCurto(de)}</span>
        <span>
          corte de {tempoCurto(inicioMostrado, true)} a {tempoCurto(fimMostrado, true)} da gravação
        </span>
        <span>{tempoCurto(ate)}</span>
      </div>
    </div>
  );
}
