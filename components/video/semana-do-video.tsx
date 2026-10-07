"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, Film, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { RedeIcone } from "@/components/social/rede-icone";
import { AvisoDaIdentidade } from "@/components/modelos-de-arte/aviso-da-identidade";
import { tipoGeraArte } from "@/lib/modelos-de-arte/espera-da-identidade";
import {
  creditosDaSemana,
  datasDoPlano,
  diaComFormato,
  diasDoPlano,
  FORMATOS,
  hojeEmSaoPaulo,
  inicioEfetivo,
  normalizarSemana,
  ordenarRedes,
  planoParaGravar,
  redesDoFormato,
  rotuloDaRedeNoFormato,
  type ChaveDoDia,
  type FormatoDoDia,
  type RedeDoPlano,
  type SemanaDoVideo,
} from "@/lib/media/semana-do-video";

/**
 * O planejador dos dias a partir do vídeo: um dia por linha, com o formato e
 * as redes de cada um. O vídeo completo vem da gravação e vai para o YouTube.
 *
 * Desde 30/09 (pedido do Bruno) a linha diz FORMATO e REDES ("quarta imagem
 * no Instagram e no LinkedIn"), o "Vídeo curto" é um formato de dia (é ali
 * que os cortes saem) e a lista começa na data de início, que é hoje por
 * padrão, e não na segunda: gravar na quarta e ver a terça que já passou no
 * topo da lista era planejar o passado. As redes oferecidas são as que o
 * formato aceita, acesas só as conectadas; a sugestão sai de REDES_SUGERIDAS.
 *
 * A escolha mora no PROJETO (`videoSemana`), como o estilo e a trilha: vale
 * para as próximas gravações até o cliente mudar, e o quadro congela uma
 * cópia no run com a data de início efetiva. Salva a cada troca, sem botão,
 * porque a escolha é barata e reversível, e esperar a rede para pintar a
 * linha faria a tela parecer travada.
 *
 * Desenho aprovado pelo Bruno em 02/09 (docs/design/campanha-do-video).
 */
export function SemanaDoVideoPlanejador({
  projectId,
  inicial,
  redesConectadas,
  aoMudarArte,
}: {
  projectId: string;
  /** Project.videoSemana como veio do banco (pode ser nulo). */
  inicial: unknown;
  /**
   * As redes com conta ativa no projeto. Rede sem conta aparece apagada e não
   * se marca: marcar o que não pode sair é prometer uma publicação que falha.
   * Indefinido: não filtra (tela que não carrega as contas).
   */
  redesConectadas?: string[];
  /**
   * O plano tem dia de arte? (08/10) A jornada da campanha acompanha, para
   * saber se o passo do estilo dos posts precisa aparecer antes do envio.
   */
  aoMudarArte?: (temArte: boolean) => void;
}) {
  const conectadas = redesConectadas;
  const [semana, setSemana] = useState<SemanaDoVideo>(() => normalizarSemana(inicial, conectadas));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // O ponto de partida do "já guardado" é o plano JÁ NORMALIZADO: abrir a tela
  // não pode gravar nada no projeto só porque o formato antigo foi lido.
  const ultimaSalva = useRef<string>(JSON.stringify(planoParaGravar(normalizarSemana(inicial, conectadas))));
  const hoje = useMemo(() => hojeEmSaoPaulo(), []);
  const inicio = inicioEfetivo(semana, hoje);
  const datas = datasDoPlano(inicio);

  // Salva com um pequeno atraso, para uma sequência de cliques virar um PATCH.
  useEffect(() => {
    const plano = planoParaGravar(semana);
    const atual = JSON.stringify(plano);
    if (atual === ultimaSalva.current) return;
    const t = setTimeout(async () => {
      setSalvando(true);
      setErro(null);
      try {
        const r = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoSemana: plano }),
        });
        if (!r.ok) throw new Error();
        ultimaSalva.current = atual;
      } catch {
        setErro("Não consegui guardar os dias. A escolha continua na tela; tente trocar de novo.");
      } finally {
        setSalvando(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [semana, projectId]);

  const creditos = creditosDaSemana({ ...semana, inicio });
  const doPlano = datas.map((d) => semana.dias[String(d.dia) as ChaveDoDia]).filter(Boolean);
  const diasComPost = doPlano.length;
  const diasDeCorte = doPlano.filter((d) => d?.formato === "short").length;
  const temArte = doPlano.some((d) => d && tipoGeraArte(d.formato));
  useEffect(() => {
    aoMudarArte?.(temArte);
  }, [temArte]); // eslint-disable-line react-hooks/exhaustive-deps

  const conectada = (r: RedeDoPlano) => !conectadas || conectadas.includes(r);

  function mudarDia(dia: number, novo: SemanaDoVideo["dias"][ChaveDoDia]) {
    setSemana((s) => ({ ...s, dias: { ...s.dias, [String(dia)]: novo } }));
  }
  function ligar(dia: number, ligado: boolean) {
    mudarDia(dia, ligado ? diaComFormato("text", conectadas) : null);
  }
  // Trocar o formato troca as redes pela sugestão do formato novo: as redes
  // de um texto (LinkedIn e X) não são as de um vídeo curto (Shorts, TikTok,
  // Reels), e herdar a escolha anterior daria um dia incoerente.
  function trocar(dia: number, formato: FormatoDoDia) {
    mudarDia(dia, diaComFormato(formato, conectadas));
  }
  function alternarRede(dia: number, rede: RedeDoPlano) {
    const atual = semana.dias[String(dia) as ChaveDoDia];
    if (!atual) return;
    const tem = atual.redes.includes(rede);
    // A última rede não sai: o dia ficaria com formato e sem destino. Quem
    // quer tirar o dia desmarca o dia.
    if (tem && atual.redes.length <= 1) return;
    const redes = tem ? atual.redes.filter((r) => r !== rede) : ordenarRedes([...atual.redes, rede]);
    mudarDia(dia, { ...atual, redes });
  }
  function mudarInicio(valor: string) {
    // Hoje (ou vazio) grava nulo, que quer dizer "hoje" na próxima gravação
    // também; só uma data futura fica guardada como data.
    setSemana((s) => ({ ...s, inicio: valor && valor > hoje ? valor : null }));
  }

  const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h4 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            Como você quer a semana a partir deste vídeo?
          </h4>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Sugerido pelo squad. Troque o formato e as redes de cada dia.
          </p>
        </div>
        {/* A DATA DE INÍCIO (30/09): hoje por padrão, e o plano cobre os
            próximos dias a partir dela (DIAS_DO_PLANO). */}
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <CalendarDays className="h-4 w-4 shrink-0 text-orange-400" />
          Começa em
          <input
            type="date"
            value={inicio}
            min={hoje}
            onChange={(e) => mudarInicio(e.target.value)}
            className="rounded-lg border px-2 py-1 text-sm outline-none"
            style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            aria-label="Data de início"
          />
          <span>
            {inicio === hoje ? "hoje, " : ""}
            {diasDoPlano()} dias
          </span>
        </label>
      </div>

      <div className="divide-y rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        {/* O VÍDEO COMPLETO não tem linha de escolha: vai para o YouTube, no
            primeiro dia do plano, como sempre foi. Os CORTES viraram escolha
            de dia (30/09): saem nos dias de "Vídeo curto", nas redes do dia. */}
        <div className="grid items-center gap-3 px-3 py-2.5" style={{ gridTemplateColumns: "96px 1fr", background: "var(--bg-card)" }}>
          <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Vídeo</span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
            <span className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
              <Film className="w-4 h-4 shrink-0 text-orange-400" />
              Vídeo completo no YouTube, em {dataCurta(inicio)}
            </span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Os cortes saem nos dias de Vídeo curto, nas redes marcadas.
            </span>
          </div>
        </div>

        {datas.map(({ iso, dia, curto }) => {
          const doDia = semana.dias[String(dia) as ChaveDoDia] ?? null;
          const ligado = Boolean(doDia);
          const info = FORMATOS.find((f) => f.id === doDia?.formato);
          return (
            <div
              key={iso}
              data-dia={iso}
              className="grid items-center gap-3 px-3 py-2"
              style={{ gridTemplateColumns: "96px 200px 1fr", background: "var(--bg-card)", opacity: ligado ? 1 : 0.7 }}
              title={ligado && info ? info.dica : undefined}
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded accent-orange-500"
                  checked={ligado}
                  onChange={(e) => ligar(dia, e.target.checked)}
                  aria-label={`Postar em ${curto} ${dataCurta(iso)}`}
                />
                <span className="text-xs font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                  {curto} <span className="font-normal" style={{ color: "var(--text-muted)" }}>{dataCurta(iso)}</span>
                  {iso === hoje && <span className="block text-[10px] font-semibold text-orange-500">hoje</span>}
                </span>
              </label>
              {ligado && doDia ? (
                <select
                  value={doDia.formato}
                  onChange={(e) => trocar(dia, e.target.value as FormatoDoDia)}
                  className="text-sm px-2 py-1.5 rounded-lg border outline-none w-full"
                  style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  aria-label={`Formato de ${curto}`}
                >
                  {FORMATOS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.rotulo}
                      {f.creditos ? ` (${f.creditos} cr)` : ""}
                      {f.id === "free" ? " (o squad decide)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>não postar</span>
              )}
              {ligado && doDia ? (
                <div className="flex flex-wrap items-center gap-1.5" aria-label={`Redes de ${curto}`}>
                  {redesDoFormato(doDia.formato).map((rede) => {
                    const marcada = doDia.redes.includes(rede);
                    const pode = conectada(rede);
                    const ultima = marcada && doDia.redes.length <= 1;
                    return (
                      <button
                        key={rede}
                        type="button"
                        data-rede={rede}
                        aria-pressed={marcada && pode}
                        disabled={!pode || ultima}
                        onClick={() => alternarRede(dia, rede)}
                        title={
                          !pode
                            ? "Rede não conectada: conecte nas configurações do projeto para marcar."
                            : ultima
                              ? "O dia precisa de pelo menos uma rede. Para tirar o dia, desmarque o dia."
                              : marcada
                                ? "Sai nesta rede. Clique para tirar."
                                : "Clique para sair também nesta rede."
                        }
                        className={cn(
                          "flex items-center gap-1 h-6 px-2 rounded-md border text-[11px] font-medium transition-all",
                          marcada && pode
                            ? "bg-orange-500/10 border-orange-500 text-[var(--text-primary)]"
                            : "border-[var(--border)] text-[var(--text-muted)]",
                          pode && !ultima && "hover:border-orange-400",
                          !pode && "opacity-50 cursor-not-allowed",
                        )}
                      >
                        <RedeIcone plataforma={rede} className="w-3 h-3 shrink-0" monocromatico={!(marcada && pode)} />
                        {rotuloDaRedeNoFormato(rede, doDia.formato)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-start gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <Search className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-400" />
        <p>
          O Roberto pesquisa antes de qualquer texto: o que você disse no vídeo, o que estão falando sobre
          isso agora e dados com fonte. O especialista de cada rede e a Diana escrevem a partir dessa pesquisa.
        </p>
      </div>

      <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
        {diasDeCorte > 0
          ? `Cada dia de vídeo curto recebe um corte, na ordem do vídeo. Se sair mais corte do que dia, o que sobra entra nesses mesmos dias, e você desmarca no quadro o que não quiser.`
          : "Sem dia de vídeo curto, os cortes são espalhados pelos dias do plano, e você escolhe as redes de cada um quando ficarem prontos."}
      </p>

      <p className="mt-2 text-xs flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
        {diasComPost === 0
          ? "Só o vídeo completo e os cortes. Nenhum outro dia vai ter post."
          : `${diasComPost} ${diasComPost === 1 ? "dia" : "dias"} com post${diasDeCorte ? ` (${diasDeCorte} de vídeo curto)` : ""}, cerca de ${creditos} ${creditos === 1 ? "crédito" : "créditos"} em peças visuais.`}
        {salvando ? (
          <span className="opacity-70">Guardando...</span>
        ) : erro ? (
          <span className="text-orange-300">{erro}</span>
        ) : (
          <span className="inline-flex items-center gap-1 opacity-70">
            <Check className="w-3 h-3" /> Guardado no projeto
          </span>
        )}
      </p>
      {/* O estilo é perguntado ANTES (06/10): dia de arte sem identidade aprovada sai só com o texto. */}
      <AvisoDaIdentidade projectId={projectId} temArte={temArte} />
    </section>
  );
}
