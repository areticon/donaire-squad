"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { pedirLeituraDoSino } from "@/lib/notificacoes/tipos";
import { criarFilaDosDescartes, estaDescartada, unirSemente } from "@/lib/avisos/fila-dos-descartes";

/**
 * O DESCARTE DOS AVISOS, NA TELA (07/10/2026).
 *
 * O pedido do Bruno, com a faixa da montagem que não saía da tela: "toda
 * notificação precisa ter a opção de descartar". Um mecanismo só para todas as
 * superfícies: o provider guarda o conjunto do que foi descartado (a semente
 * que o servidor manda, mais o que a pessoa descarta nesta visita), o
 * `BotaoDescartar` é o X de sempre, e o `Descartavel` some (ou recolhe) o aviso.
 *
 * - DESCARTAR É OTIMISTA: some na hora, grava no servidor (POST
 *   /api/avisos/descartes) e mostra "Aviso descartado." com Desfazer por 6 s.
 *   Sem a tabela (202), com erro de rede ou 500, o aviso fica escondido nesta
 *   visita e o toast diz a verdade: "Descartado só nesta tela".
 * - FILA POR CHAVE: descartar e desfazer da mesma chave saem em ordem; o
 *   DELETE espera o POST anterior responder, senão o POST lento gravaria por
 *   último e o aviso desfeito sumiria no próximo carregamento.
 * - PROVIDER ANINHÁVEL: o filho (a página do Gestor, com o conjunto exato das
 *   peças dela) soma as iniciais dele às do pai e usa as funções do pai; sino,
 *   faixa e card enxergam o mesmo conjunto. Só a raiz desenha a região
 *   aria-live, para o leitor de tela não anunciar duas vezes.
 * - O SERVIDOR NÃO TIRA NADA DAS PROPS: quem esconde é o componente, lendo o
 *   provider, que nasce com o mesmo conjunto no servidor e no navegador (sem
 *   divergência de hidratação), e o Desfazer funciona depois de um refresh.
 *
 * Sem provider, funciona só em memória e nunca lança. Sem animação de saída:
 * o aviso some no ato (e quem pede movimento reduzido não vê nada se mexer).
 *
 * Toast: o X dos toasts vem do Toaster (components/ui/avisos-rapidos.tsx). O
 * toast deste arquivo é um `toast()` comum, que passa por aquele render.
 */

type Opcoes = {
  desfazivel?: boolean;
  /** A frase do toast, quando não é "Aviso descartado." (o vídeo que não pôde ser apagado). */
  mensagem?: string;
};

export type Descartes = {
  /** Esta chave está descartada (ou escondida) nesta tela? */
  ehDescartado(chave: string | null | undefined): boolean;
  /** Descarta e lembra no servidor. Otimista, com Desfazer quando `desfazivel` (padrão). */
  descartar(chaves: readonly string[], opcoes?: Opcoes): void;
  /**
   * Desfaz o descarte, no servidor também. `soNaTela`: o servidor já desfez
   * por outro caminho (o sino restaura pelo id), e aqui só a tela volta.
   */
  desfazer(chaves: readonly string[], opcoes?: { soNaTela?: boolean }): void;
  /** Soma ao conjunto chaves que o servidor já sabe descartadas (o sino, a consulta dos vídeos). */
  registrar(chaves: readonly string[]): void;
  /** Esconde só nesta visita, sem POST e sem toast: o fato acabou (arquivar, cancelar). */
  esconderLocal(chaves: readonly string[]): void;
  /** Anuncia na região aria-live da raiz (o sino descarta pelo id, fora do descartar). */
  anunciar(texto: string): void;
};

type Interno = Descartes & {
  /** Foi desfeita nesta visita? O filho não deixa a semente dele vencer o desfazer. */
  foiDesfeita(chave: string): boolean;
};

const ContextoDosDescartes = createContext<Interno | null>(null);

const ROTA = "/api/avisos/descartes";

async function enviar(metodo: "POST" | "DELETE", chaves: string[]): Promise<boolean> {
  try {
    const r = await fetch(ROTA, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chaves }) });
    if (r.status !== 200) return false;
    const d = (await r.json().catch(() => ({}))) as { lembrado?: boolean };
    return d.lembrado !== false;
  } catch {
    return false;
  }
}

/** O conjunto das iniciais, que só cresce: a união de tudo o que o servidor mandou nesta visita. */
function useIniciais(iniciais: readonly string[] | undefined): Set<string> {
  const assinatura = (iniciais ?? []).join("\n");
  const [estado, setEstado] = useState(() => ({ assinatura, conjunto: new Set(iniciais ?? []) }));
  // Ajuste de estado quando a prop muda (router.refresh): a união, sem efeito,
  // para o desenho seguinte já sair com ela.
  if (estado.assinatura !== assinatura) setEstado({ assinatura, conjunto: unirSemente(estado.conjunto, iniciais ?? []) });
  return estado.conjunto;
}

type Estado = {
  /** Descartadas nesta visita (otimistas). */
  descartadas: Set<string>;
  /** Desfeitas nesta visita: vencem a semente e o registrado. */
  desfeitas: Set<string>;
  /** O que o sino e a consulta dos vídeos disseram que está descartado. */
  registradas: Set<string>;
  /** Escondidas só nesta visita (o fato acabou). */
  locais: Set<string>;
};

const comMais = (s: Set<string>, cs: readonly string[]) => {
  const n = new Set(s);
  for (const c of cs) n.add(c);
  return n;
};
const semEstas = (s: Set<string>, cs: readonly string[]) => {
  const n = new Set(s);
  for (const c of cs) n.delete(c);
  return n;
};

/**
 * O toast do descarte, com o Desfazer separado do X do Toaster. Exportado
 * para o sino, que descarta pelo id da notificação e desfaz pelo id.
 */
export function mostrarToastDoDescarte(p: { mensagem?: string; aoDesfazer: () => void; id?: string }): string {
  return toast((t) => <ToastDoDescarte id={t.id} mensagem={p.mensagem} aoDesfazer={p.aoDesfazer} />, { duration: 6000, id: p.id });
}

/** O toast honesto de quando o descarte não foi lembrado no servidor. */
export const FRASE_SO_NESTA_TELA = "Descartado só nesta tela; pode voltar ao recarregar.";

function ToastDoDescarte({ id, mensagem, aoDesfazer }: { id: string; mensagem?: string; aoDesfazer: () => void }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span>{mensagem ?? "Aviso descartado."}</span>
      <button
        type="button"
        onClick={() => {
          toast.dismiss(id);
          aoDesfazer();
        }}
        className="font-semibold text-orange-500 hover:underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
      >
        Desfazer
      </button>
    </span>
  );
}

function ProviderRaiz({ iniciais, children }: { iniciais?: readonly string[]; children: ReactNode }) {
  const semente = useIniciais(iniciais);
  const [estado, setEstado] = useState<Estado>(() => ({ descartadas: new Set(), desfeitas: new Set(), registradas: new Set(), locais: new Set() }));
  const [anuncio, setAnuncio] = useState({ texto: "", n: 0 });
  // A fila por chave mora em lib/avisos/fila-dos-descartes.ts (testada lá).
  const [fila] = useState(() => criarFilaDosDescartes(enviar));
  const desfazerRef = useRef<(chaves: readonly string[], opcoes?: { soNaTela?: boolean }) => void>(() => {});

  const anunciar = useCallback((texto: string) => setAnuncio((a) => ({ texto, n: a.n + 1 })), []);

  const descartar = useCallback(
    (chaves: readonly string[], opcoes?: Opcoes) => {
      // O segundo clique da mesma chave, com o primeiro na fila, não pesa.
      const pedido = fila.descartar(chaves);
      if (!pedido) return;
      const { novas } = pedido;
      setEstado((s) => ({ ...s, descartadas: comMais(s.descartadas, novas), desfeitas: semEstas(s.desfeitas, novas) }));
      anunciar("Aviso descartado.");
      const desfazivel = opcoes?.desfazivel ?? true;
      const idDoToast = desfazivel
        ? mostrarToastDoDescarte({ mensagem: opcoes?.mensagem, aoDesfazer: () => desfazerRef.current(novas) })
        : undefined;
      void pedido.lembrado.then((lembrado) => {
        if (!lembrado) toast(FRASE_SO_NESTA_TELA, { id: idDoToast, duration: 6000 });
        pedirLeituraDoSino();
      });
    },
    [anunciar, fila]
  );

  const desfazer = useCallback(
    (chaves: readonly string[], opcoes?: { soNaTela?: boolean }) => {
      const { lista, feito } = fila.desfazer(chaves, opcoes);
      if (!lista.length) return;
      setEstado((s) => ({ ...s, descartadas: semEstas(s.descartadas, lista), desfeitas: comMais(s.desfeitas, lista), locais: semEstas(s.locais, lista) }));
      anunciar("Aviso de volta.");
      if (opcoes?.soNaTela) return;
      void feito.then(() => pedirLeituraDoSino());
    },
    [anunciar, fila]
  );
  useEffect(() => {
    desfazerRef.current = desfazer;
  }, [desfazer]);

  const registrar = useCallback((chaves: readonly string[]) => {
    if (!chaves.length) return;
    setEstado((s) => (chaves.every((c) => s.registradas.has(c)) ? s : { ...s, registradas: comMais(s.registradas, chaves) }));
  }, []);

  const esconderLocal = useCallback((chaves: readonly string[]) => {
    const lista = chaves.filter(Boolean);
    if (!lista.length) return;
    setEstado((s) => (lista.every((c) => s.locais.has(c)) ? s : { ...s, locais: comMais(s.locais, lista) }));
  }, []);

  const valor = useMemo<Interno>(
    () => ({
      ehDescartado: (c) => estaDescartada(c, { semente, ...estado }),
      foiDesfeita: (c) => estado.desfeitas.has(c),
      descartar,
      desfazer,
      registrar,
      esconderLocal,
      anunciar,
    }),
    [estado, semente, descartar, desfazer, registrar, esconderLocal, anunciar]
  );

  return (
    <ContextoDosDescartes.Provider value={valor}>
      {children}
      {/* A única região que anuncia (o provider aninhado não desenha outra). */}
      <div className="sr-only" role="status" aria-live="polite" data-anuncio-dos-descartes>
        {anuncio.n ? <span key={anuncio.n}>{anuncio.texto}</span> : null}
      </div>
    </ContextoDosDescartes.Provider>
  );
}

function ProviderAninhado({ pai, iniciais, children }: { pai: Interno; iniciais?: readonly string[]; children: ReactNode }) {
  const proprias = useIniciais(iniciais);
  const valor = useMemo<Interno>(
    () => ({
      ...pai,
      ehDescartado: (c) => Boolean(c) && (pai.ehDescartado(c) || (proprias.has(c as string) && !pai.foiDesfeita(c as string))),
    }),
    [pai, proprias]
  );
  return <ContextoDosDescartes.Provider value={valor}>{children}</ContextoDosDescartes.Provider>;
}

/**
 * O conjunto dos descartes desta árvore. `iniciais`: as chaves que o servidor
 * sabe descartadas (a semente do layout, ou o conjunto exato de uma página).
 */
export function DescartesProvider({ iniciais, children }: { iniciais?: readonly string[]; children: ReactNode }) {
  const pai = useContext(ContextoDosDescartes);
  if (pai) return <ProviderAninhado pai={pai} iniciais={iniciais}>{children}</ProviderAninhado>;
  return <ProviderRaiz iniciais={iniciais}>{children}</ProviderRaiz>;
}

/** As funções do descarte. Sem provider, só em memória (nunca lança). */
export function useDescartes(): Descartes {
  const ctx = useContext(ContextoDosDescartes);
  const [locais, setLocais] = useState<Set<string>>(() => new Set());
  const reserva = useMemo<Descartes>(
    () => ({
      ehDescartado: (c) => Boolean(c) && locais.has(c as string),
      descartar: (cs) => setLocais((s) => comMais(s, cs)),
      desfazer: (cs) => setLocais((s) => semEstas(s, cs)),
      registrar: (cs) => setLocais((s) => comMais(s, cs)),
      esconderLocal: (cs) => setLocais((s) => comMais(s, cs)),
      anunciar: () => {},
    }),
    [locais]
  );
  return ctx ?? reserva;
}

/**
 * O descarte de UM aviso. Com chave null (o fato não tem a marca da
 * ocorrência, ou é efêmero), o X é só local: esconde nesta visita.
 */
export function useDescarte(chave: string | null | undefined): { descartado: boolean; descartar: (opcoes?: Opcoes) => void; desfazer: () => void } {
  const d = useDescartes();
  const [local, setLocal] = useState(false);
  if (!chave) return { descartado: local, descartar: () => setLocal(true), desfazer: () => setLocal(false) };
  return { descartado: d.ehDescartado(chave), descartar: (o) => d.descartar([chave], o), desfazer: () => d.desfazer([chave]) };
}

/** O aviso em volta do botão: o X sem props descarta o aviso em que está. */
const ContextoDoAviso = createContext<{ descartar: () => void } | null>(null);

/**
 * O AVISO QUE SE DESCARTA. `sumir`: descartado, não desenha nada. `recolher`:
 * descartado, desenha só o `compacto` (uma linha com o rótulo curto e o botão
 * da ação, sem cor de alerta), para o aviso que é a única porta de uma ação.
 */
export function Descartavel({
  chave,
  modo = "sumir",
  compacto,
  children,
}: {
  chave: string | null | undefined;
  modo?: "sumir" | "recolher";
  compacto?: ReactNode;
  children: ReactNode;
}) {
  const { descartado, descartar } = useDescarte(chave);
  const valor = useMemo(() => ({ descartar: () => descartar() }), [descartar]);
  if (descartado) return modo === "recolher" ? <>{compacto ?? null}</> : null;
  return <ContextoDoAviso.Provider value={valor}>{children}</ContextoDoAviso.Provider>;
}

/** Move o foco depois do descarte: o próximo X da mesma lista, o contêiner ou o <main>. */
function moverOFoco(botao: HTMLElement) {
  const lista = botao.closest<HTMLElement>("[data-lista-de-avisos]");
  const botoes = lista ? Array.from(lista.querySelectorAll<HTMLElement>("[data-botao-descartar]")) : [];
  const i = botoes.indexOf(botao);
  const candidatos = i >= 0 ? [...botoes.slice(i + 1), ...botoes.slice(0, i).reverse()] : [];
  requestAnimationFrame(() => {
    // O aviso continuou na tela (recolheu, ou a ação não escondia): o foco fica onde está.
    if (botao.isConnected) return;
    const proximo = candidatos.find((b) => b.isConnected);
    if (proximo) return proximo.focus();
    const destino = lista?.isConnected ? lista : document.querySelector<HTMLElement>("main");
    if (!destino) return;
    if (!destino.hasAttribute("tabindex")) destino.setAttribute("tabindex", "-1");
    destino.focus({ preventScroll: true });
  });
}

/**
 * O X DE TODO AVISO. `<button type="button">` com o X da lucide, sempre
 * visível (nunca só no hover), com o anel de foco dos botões da casa.
 *
 * - `chave`/`chaves`: descarta e lembra. Sem nenhum dos dois, descarta o
 *   `Descartavel` em volta. `aoDescartar`: a ação é outra (fechar um toast,
 *   apagar um vídeo, esconder um aviso efêmero).
 * - `rotulo`: o nome acessível quando a ação não é só esconder ("Dispensar e
 *   apagar o vídeo"); o padrão é "Descartar aviso". Com `texto` visível
 *   ("Descartar todas"), o nome é o próprio texto.
 * - `compacto`: nos lugares apertados (item do sino, cartão do quadro), ícone
 *   de 16 px num alvo de 24x24, sem sobrepor o vizinho (WCAG 2.5.8). Fora
 *   deles, alvo de 40x40.
 */
export function BotaoDescartar({
  chave,
  chaves,
  aoDescartar,
  rotulo,
  texto,
  descricaoId,
  compacto = false,
  desfazivel,
  className,
  style,
}: {
  chave?: string | null;
  chaves?: readonly (string | null | undefined)[];
  aoDescartar?: () => void;
  rotulo?: string;
  texto?: string;
  descricaoId?: string;
  compacto?: boolean;
  desfazivel?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const d = useDescartes();
  const doAviso = useContext(ContextoDoAviso);
  const nome = rotulo ?? "Descartar aviso";

  function aoClicar(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const botao = e.currentTarget;
    const lista = [...(chaves ?? []), ...(chave ? [chave] : [])].filter((c): c is string => Boolean(c));
    if (aoDescartar) aoDescartar();
    else if (lista.length) d.descartar(lista, { desfazivel });
    else doAviso?.descartar();
    moverOFoco(botao);
  }

  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label={texto ? undefined : nome}
      aria-describedby={descricaoId}
      title={texto ? undefined : nome}
      data-botao-descartar=""
      className={cn(
        "inline-flex items-center justify-center shrink-0 touch-manipulation rounded-full transition-colors cursor-pointer",
        "hover:bg-[var(--realce-2)] hover:text-[var(--text-primary)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]",
        texto ? "min-h-10 gap-1.5 px-3 text-xs font-semibold" : compacto ? "h-6 w-6" : "h-10 w-10",
        className
      )}
      style={{ color: "var(--text-muted)", ...style }}
    >
      <X className={compacto ? "h-4 w-4" : "h-[18px] w-[18px]"} aria-hidden="true" />
      {texto ? <span>{texto}</span> : null}
    </button>
  );
}

/** Um id estável para ligar o X ao título do aviso (aria-describedby). */
export function useIdDoAviso(): string {
  return `aviso-${useId().replace(/:/g, "")}`;
}

/**
 * O AVISO SIMPLES COM X (07/10): a caixa de sempre, com o conteúdo à esquerda
 * e o X no canto, já dentro do `Descartavel`. Para as frases soltas (dicas,
 * erros de estudo, avisos de plano) que só precisam sair da tela.
 */
export function AvisoDescartavel({
  chave,
  modo = "sumir",
  compacto,
  className,
  style,
  children,
}: {
  chave: string | null | undefined;
  modo?: "sumir" | "recolher";
  compacto?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Descartavel chave={chave} modo={modo} compacto={compacto}>
      <div className={cn("flex items-start gap-2", className)} style={style}>
        <div className="min-w-0 flex-1">{children}</div>
        <BotaoDescartar compacto className="-my-0.5 -mr-1" />
      </div>
    </Descartavel>
  );
}

/**
 * A FRASE COM X, no meio de um parágrafo (07/10): some só ela, e o resto da
 * linha fica. Com `chave`, lembrada; sem, só nesta visita.
 */
export function FraseDescartavel({ chave, children, className }: { chave?: string | null; children: ReactNode; className?: string }) {
  const { descartado, descartar } = useDescarte(chave);
  if (descartado) return null;
  return (
    <span className={className}>
      {children}
      <BotaoDescartar compacto aoDescartar={() => descartar()} className="ml-1 align-middle" />
    </span>
  );
}
