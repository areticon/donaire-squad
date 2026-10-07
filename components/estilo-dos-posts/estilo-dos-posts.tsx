"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Check, Images, Library, Loader2, MessageSquareText, Palette, Pencil, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { GaleriaDaBiblioteca } from "@/components/biblioteca-de-design/galeria-da-biblioteca";
import type { DesignDaGaleria } from "@/lib/biblioteca-de-design/tipos";
import { resumoDoEstilo, type EstadoDoEstiloDosPosts } from "@/lib/estilo-dos-posts/tipos";

/**
 * O ESTILO DOS POSTS, UM PASSO SÓ (08/10/2026).
 *
 * As decisões do Bruno, literais: "isso precisa ser um quadro de chat para o
 * usuário escrever como ele quer o estilo dos posts, ou ele pode escolher
 * estilos da biblioteca"; e "o usuário gera a campanha toda e só no final
 * descobre que está faltando aprovar o estilo, as artes; está muito confuso".
 *
 * Duas portas, e as duas aprovam na hora:
 *   - ESCREVER: um quadro de chat. A primeira mensagem é o estilo, as
 *     seguintes são ajustes ("mais escuro", "sem pessoa"); cada envio vira o
 *     pedido da biblioteca de design (o JEV compara, o Claude escreve a
 *     ficha) e o design passa a ser o estilo aprovado;
 *   - ESCOLHER: a galeria da biblioteca, só com os designs de imagem.
 * Sem aprovar em outro lugar: escrever ou escolher já destrava a arte.
 *
 * O mesmo componente mora no assistente do projeto (etapa Fotos e estilo),
 * na janela da campanha (antes de gerar), na jornada do vídeo (antes de
 * enviar) e em Configurações. `aoAprovar` avisa quem chama, que segue
 * (a campanha gera, a jornada vai para o envio).
 */

type Porta = "chat" | "biblioteca";
type Mensagem = { de: "cliente" | "squad"; texto: string };

// 08/10, revisão: sem prometer "foto sua" aqui. O estilo escrito vira a
// linguagem da imagem gerada; foto real da pessoa só entra pela Biblioteca
// de materiais (a linha no rodapé do passo diz isso).
const BOAS_VINDAS =
  "Como você quer que os seus posts fiquem? Conte do jeito que vier: o clima, as cores, se quer ilustração, colagem, fotografia de cena, só tipografia, algo que você viu e gostou. Eu monto o estilo e ele já vale para as próximas artes.";

/**
 * O tamanho mínimo do que se escreve (08/10, revisão): a primeira mensagem é
 * o estilo e precisa de uma frase (a rota recusa menos de 12 letras); depois
 * dela, ajuste curto vale ("azul", "sem pessoa").
 */
const MINIMO_DO_PEDIDO = 12;
const MINIMO_DO_AJUSTE = 3;

const EXEMPLOS = [
  "Fundo escuro, letra grande e branca, a cor da marca só no destaque",
  "Ilustração leve, cores claras, nada de foto de banco",
  "Colagem de papel com recortes, estilo revista",
];

export function EstiloDosPosts({
  projectId,
  aoAprovar,
  aoLer,
  titulo = "Estilo dos posts",
  explicacao,
  sempreAberto = false,
}: {
  projectId: string;
  /** O estilo ficou aprovado (pelo chat ou pela biblioteca). */
  aoAprovar?: (estado: EstadoDoEstiloDosPosts) => void;
  /**
   * O estado chegou do servidor (08/10, revisão). Quem abriu o passo porque o
   * estilo faltava fica sabendo se ele já foi aprovado em outro lugar e segue,
   * em vez de mostrar "Aprovado" sem caminho para continuar.
   */
  aoLer?: (estado: EstadoDoEstiloDosPosts) => void;
  titulo?: string;
  /** Uma linha sobre por que o passo aparece aqui. */
  explicacao?: string;
  /** Mostra as portas mesmo com o estilo já aprovado (o assistente e Configurações). */
  sempreAberto?: boolean;
}) {
  const [estado, setEstado] = useState<EstadoDoEstiloDosPosts | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(sempreAberto);
  const [porta, setPorta] = useState<Porta>("chat");
  const [conversa, setConversa] = useState<Mensagem[]>([{ de: "squad", texto: BOAS_VINDAS }]);
  const [texto, setTexto] = useState("");
  const [soNoMeuProjeto, setSoNoMeuProjeto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [reaprovando, setReaprovando] = useState(false);
  const fimDaConversa = useRef<HTMLDivElement>(null);
  // Quem chama recria a função a cada desenho; a leitura não deve repetir por isso.
  const aoLerAtual = useRef(aoLer);
  useEffect(() => {
    aoLerAtual.current = aoLer;
  });

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/estilo-dos-posts`, { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as EstadoDoEstiloDosPosts & { error?: string };
      if (!r.ok) throw new Error(d.error || "Não consegui ler o estilo dos posts.");
      setEstado(d);
      setErro(null);
      aoLerAtual.current?.(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ler o estilo dos posts.");
    }
  }, [projectId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    fimDaConversa.current?.scrollIntoView({ block: "nearest" });
  }, [conversa.length]);

  const aprovado = useCallback(
    (novo: EstadoDoEstiloDosPosts) => {
      setEstado(novo);
      if (novo.aprovada) aoAprovar?.(novo);
    },
    [aoAprovar]
  );

  const jaTemPedido = conversa.some((m) => m.de === "cliente");
  const minimo = jaTemPedido ? MINIMO_DO_AJUSTE : MINIMO_DO_PEDIDO;

  async function enviar(mensagem?: string) {
    const nova = (mensagem ?? texto).trim();
    if (nova.length < minimo) {
      toast.error("Conte com pelo menos uma frase como você quer os posts.");
      return;
    }
    const doCliente = [...conversa.filter((m) => m.de === "cliente").map((m) => m.texto), nova];
    setConversa((c) => [...c, { de: "cliente", texto: nova }]);
    setTexto("");
    setEnviando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/estilo-dos-posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversa: doCliente, soNoMeuProjeto }),
      });
      const d = (await r.json().catch(() => ({}))) as { design?: DesignDaGaleria; aprovado?: boolean; efeito?: string; estado?: EstadoDoEstiloDosPosts; error?: string };
      if (!r.ok || !d.design) throw new Error(d.error || "Não consegui registrar o estilo.");
      const ficha = `Ficou assim: ${d.design.nome}. ${d.design.descricao}`.trim();
      const resposta = d.aprovado
        ? `${ficha}\n\n${d.efeito ?? "Estilo aprovado."}\n\nQuer ajustar? Escreva aqui, por exemplo: "mais escuro", "sem pessoa", "mais colorido".`
        : `${ficha}\n\n${d.efeito ?? "Não consegui aprovar este estilo."}`;
      setConversa((c) => [...c, { de: "squad", texto: resposta }]);
      if (d.estado) aprovado(d.estado);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não consegui registrar o estilo.";
      // A mensagem que falhou sai da conversa (08/10, revisão): ela volta para
      // a caixa de texto, e reenviada entrava duas vezes no pedido.
      setConversa((c) => {
        const i = c.map((m) => m.de).lastIndexOf("cliente");
        const sem = i >= 0 ? [...c.slice(0, i), ...c.slice(i + 1)] : c;
        return [...sem, { de: "squad", texto: `${msg} O que você escreveu continua aqui: tente de novo.` }];
      });
      setTexto(nova);
    } finally {
      setEnviando(false);
    }
  }

  async function escolher(d: Pick<DesignDaGaleria, "id">) {
    const r = await fetch(`/api/projects/${projectId}/estilo-dos-posts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designId: d.id }),
    });
    const j = (await r.json().catch(() => ({}))) as { aprovado?: boolean; efeito?: string; estado?: EstadoDoEstiloDosPosts; error?: string };
    if (!r.ok) throw new Error(j.error || "Não consegui usar este design.");
    if (j.aprovado) toast.success(j.efeito || "Estilo aprovado.", { id: "estilo-dos-posts", duration: 6000 });
    else toast.error(j.efeito || "Não consegui aprovar este estilo.", { id: "estilo-dos-posts" });
    if (j.estado) aprovado(j.estado);
  }

  /**
   * A APROVAÇÃO CAIU, O DESIGN FICOU (08/10, revisão): trocar as cores da
   * marca (ou a letra) derruba a aprovação, mas o design escolhido continua
   * gravado. Um clique aprova o mesmo estilo de novo, com as cores de agora,
   * sem obrigar a pessoa a reescrever o que já tinha escrito.
   */
  async function usarDeNovo() {
    if (!estado?.design) return;
    setReaprovando(true);
    try {
      await escolher({ id: estado.design.id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui aprovar este estilo de novo.", { id: "estilo-dos-posts" });
    } finally {
      setReaprovando(false);
    }
  }

  /** As artes de campanhas antigas que esperavam o estilo: o mesmo "gerar" de Modelos de arte. */
  async function gerarAsQueEsperavam() {
    setGerando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/modelos-de-arte`, { method: "POST" });
      const d = (await r.json().catch(() => ({}))) as { frase?: string; error?: string };
      if (!r.ok) throw new Error(d.error || "Não consegui pedir as artes que esperavam.");
      toast.success(d.frase || "As artes estão sendo geradas e caem no quadro em alguns minutos.", { duration: 6000 });
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui pedir as artes que esperavam.");
    } finally {
      setGerando(false);
    }
  }

  if (!estado) {
    return (
      <div className="flex items-center gap-2 rounded-xl border px-4 py-5 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        {erro ? erro : <><Loader2 className="h-4 w-4 animate-spin" /> Lendo o estilo dos posts</>}
      </div>
    );
  }

  const mostrarPortas = estado.podeMudar && (aberto || !estado.aprovada);

  return (
    <section className="space-y-3 rounded-xl border p-4" style={{ borderColor: estado.aprovada ? "var(--brand, #f97316)" : "rgba(234,88,12,0.45)", background: "var(--bg-surface)" }} aria-labelledby={`estilo-dos-posts-${projectId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 id={`estilo-dos-posts-${projectId}`} className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            <Palette className="h-4 w-4 text-orange-500" />
            {titulo}
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={estado.aprovada ? { background: "rgba(34,197,94,0.15)", color: "#16a34a" } : { background: "rgba(249,115,22,0.15)", color: "#ea580c" }}
            >
              {estado.aprovada ? "Aprovado" : "Falta escolher"}
            </span>
          </h3>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-primary)" }}>
            {resumoDoEstilo(estado)}
            {estado.design?.descricao ? <span style={{ color: "var(--text-muted)" }}> {estado.design.descricao}</span> : null}
          </p>
          {explicacao && (
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {explicacao}
            </p>
          )}
        </div>
        {estado.aprovada && estado.podeMudar && !sempreAberto && (
          <button type="button" onClick={() => setAberto((v) => !v)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
            <Pencil className="h-3.5 w-3.5" /> {aberto ? "Fechar" : "Mudar o estilo"}
          </button>
        )}
      </div>

      {!estado.podeMudar && !estado.aprovada && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Só o dono da conta escolhe o estilo dos posts. Peça para ele escrever como quer ou escolher um da biblioteca.
        </p>
      )}

      {estado.podeMudar && !estado.aprovada && estado.design && (
        <button
          type="button"
          onClick={() => void usarDeNovo()}
          disabled={reaprovando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {reaprovando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Aprovar &ldquo;{estado.design.nome}&rdquo; de novo
        </button>
      )}

      {estado.aprovada && estado.aguardando > 0 && estado.podeMudar && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
          <span>
            {estado.aguardando === 1 ? "1 arte de uma campanha anterior esperava o estilo." : `${estado.aguardando} artes de campanhas anteriores esperavam o estilo.`}
          </span>
          <button type="button" onClick={() => void gerarAsQueEsperavam()} disabled={gerando} className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
            {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Gerar agora
          </button>
        </div>
      )}

      {mostrarPortas && (
        <>
          <div className="flex gap-1.5" role="tablist" aria-label="Como escolher o estilo">
            {(
              [
                ["chat", "Escrever como eu quero", MessageSquareText],
                ["biblioteca", "Escolher da biblioteca", Library],
              ] as const
            ).map(([id, rotulo, Icone]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={porta === id}
                onClick={() => setPorta(id)}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={porta === id ? { borderColor: "#f97316", background: "rgba(249,115,22,0.10)", color: "var(--text-primary)" } : { borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                <Icone className="h-3.5 w-3.5" /> {rotulo}
              </button>
            ))}
          </div>

          {porta === "chat" ? (
            <div className="space-y-2">
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }} aria-live="polite">
                {conversa.map((m, i) => (
                  <div key={i} className={cn("flex", m.de === "cliente" ? "justify-end" : "justify-start")}>
                    <p
                      className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-snug"
                      style={m.de === "cliente" ? { background: "#f97316", color: "#fff" } : { background: "var(--bg-elevated)", color: "var(--text-primary)" }}
                    >
                      {m.texto}
                    </p>
                  </div>
                ))}
                {enviando && (
                  <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Montando o estilo (leva uns segundos)
                  </div>
                )}
                <div ref={fimDaConversa} />
              </div>
              {!jaTemPedido && (
                <div className="flex flex-wrap gap-1.5">
                  {EXEMPLOS.map((ex) => (
                    <button key={ex} type="button" onClick={() => setTexto(ex)} className="rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                      {ex}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !enviando) {
                      e.preventDefault();
                      void enviar();
                    }
                  }}
                  rows={2}
                  maxLength={600}
                  placeholder={jaTemPedido ? "Quer ajustar? Ex.: mais escuro, sem pessoa, mais colorido" : "Escreva como você quer os seus posts"}
                  aria-label="Como você quer os seus posts"
                  className="min-w-0 flex-1 resize-y rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                  style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                />
                <button type="button" onClick={() => void enviar()} disabled={enviando || texto.trim().length < minimo} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white disabled:opacity-50" aria-label="Enviar">
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="hidden sm:inline">Enviar</span>
                </button>
              </div>
              <label className="flex items-start gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                <input type="checkbox" checked={soNoMeuProjeto} onChange={(e) => setSoNoMeuProjeto(e.target.checked)} className="mt-0.5 accent-orange-500" />
                <span>
                  <b style={{ color: "var(--text-primary)" }}>Só no meu projeto.</b> Sem marcar, só a descrição do visual entra na biblioteca de todos, sem o seu nome, a sua marca ou o seu contato.
                </span>
              </label>
            </div>
          ) : (
            <GaleriaDaBiblioteca
              projectId={projectId}
              tipoFixo="imagem"
              semEscrever
              aoEscolher={escolher}
              titulo="Estilos da biblioteca"
              descricao="Do mais usado ao menos: os modelos do nosso book e os estilos que outros clientes escreveram. Toque em Usar este e ele vira o estilo dos seus posts."
            />
          )}
        </>
      )}

      <p className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Images className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Foto real nos posts, só as que você sobe em{" "}
          <Link href={`/projects/${projectId}/settings?aba=materiais`} className="font-semibold text-orange-500 underline-offset-2 hover:underline">
            Seus materiais
          </Link>
          . Sem foto sua, a arte sai sem pessoa: nunca com um print do seu vídeo.
        </span>
      </p>
      {estado.aprovada && (
        <p className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <Check className="h-3 w-3 text-green-600" /> A letra e as cores seguem a sua marca; para ajustar onde cada cor entra, use{" "}
          <Link href={`/projects/${projectId}/settings?aba=modelos`} className="font-semibold text-orange-500 underline-offset-2 hover:underline">
            Estilo dos posts em Configurações
          </Link>
          .
        </p>
      )}
    </section>
  );
}
