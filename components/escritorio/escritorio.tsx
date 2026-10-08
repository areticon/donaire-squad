"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AGENTES,
  donoDaPeca,
  situacaoDoSquad,
  type LogDaEsteira,
  type PecaDoSquad,
  type SituacaoDoSquad,
} from "@/lib/squad/estado-do-squad";
import type { CenaAtiva, Gesto, Tema } from "@/components/escritorio/escritorio-do-squad";
import type { Turno } from "@/components/escritorio/menu-do-agente";
import { EscritorioDeMassinha } from "@/components/escritorio/escritorio-de-massinha";
import { UserRoundPen } from "lucide-react";
import { AvatarDoAgente } from "@/components/escritorio/avatar-do-agente";
import type { Sugestao } from "@/lib/squad/tipo-da-sugestao";
import { APARENCIA_PADRAO_DO_USUARIO, type Aparencia } from "@/lib/squad/aparencia-do-boneco";
import { bastaoDoVideo, videoDaVez, type VideoParaOBastao } from "@/lib/squad/bastao-do-video";
import { useUmaAUma } from "@/components/escritorio/pecas-uma-a-uma";
import { BotaoDescartar, useDescartes } from "@/components/ui/descartar";
import { chaveDaDica, chaveDaSugestao, chaveDaVisitaDaPeca } from "@/lib/avisos/chaves";

/** A dica dos controles da cena 3D (07/10): descarte permanente por pessoa. */
const CHAVE_DOS_CONTROLES = chaveDaDica("controles-escritorio") as string;

/**
 * O escritório, do lado de fora da cena.
 *
 * Este arquivo faz três coisas que a cena 3D não deve fazer:
 *
 * 1. **Ouve a esteira.** Enquanto há um run rodando, pergunta o status a cada
 *    2,5 s (o mesmo ritmo da faixa antiga, `pipeline-live.tsx`) e avisa a tela
 *    quando termina ou falha.
 * 2. **Percebe a passagem do bastão.** Quando o agente da vez muda, guarda
 *    quem entregou e quem recebeu: é isso que faz um boneco andar até o outro.
 * 3. **Carrega o 3D só quando faz sentido.** `next/dynamic` sem SSR. Sem WebGL,
 *    ou quando a pessoa pediu menos movimento, entra a fileira de mesas de
 *    massinha (escritorio-de-massinha.tsx), com a mesma informação e a mesma
 *    conversa. A informação nunca depende do 3D: o 3D é a forma.
 *
 * Em 28/09 a cena 3D chegou a ser TROCADA pela fileira de massinha, e o Bruno
 * reprovou: "os avatares precisam ser como antes, andar entre as salas e mesas,
 * o usuário deve ter seu próprio avatar... é pegar o que já tínhamos e melhorar
 * o design". A fileira ficou como a versão sem 3D, que é o lugar certo dela.
 */

const EscritorioDoSquad = dynamic(() => import("@/components/escritorio/escritorio-do-squad"), {
  ssr: false,
  loading: () => null,
});
// O editor do seu boneco carrega só quando alguém clica em personalizar.
const EditorDoBoneco = dynamic(() => import("@/components/escritorio/editor-do-boneco"), {
  ssr: false,
  loading: () => null,
});

const COR_DO_ESTADO = {
  trabalhando: "#ef6122",
  pronto: "#4ade80",
  esperando: "#9599a6",
  ocioso: "#9599a6",
  aviso: "#f87171",
} as const;

function temWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

function lerTema(): Tema {
  const s = getComputedStyle(document.documentElement);
  const v = (nome: string, padrao: string) => s.getPropertyValue(nome).trim() || padrao;
  return {
    fundo: v("--bg-primary", "#1e1e25"),
    superficie: v("--bg-surface", "#2a2a33"),
    elevado: v("--bg-elevated", "#31313c"),
    borda: v("--border", "#3f3f4b"),
    laranja: v("--accent-orange", "#ef6122"),
    texto: v("--text-primary", "#dcdde2"),
    apagado: v("--text-muted", "#9599a6"),
  };
}

/** A versão em linha: mesma informação, sem WebGL. */
export function SquadEmLinha({
  situacao,
  onAbrirAgente,
  className,
}: {
  situacao: SituacaoDoSquad;
  onAbrirAgente: (agentId: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {situacao.agentes.map((s) => (
        <button
          key={s.agente.id}
          type="button"
          onClick={() => onAbrirAgente(s.agente.id)}
          className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors hover:border-orange-500/50"
          style={{
            background: "var(--bg-card)",
            borderColor: s.estado === "trabalhando" ? "var(--accent-orange)" : "var(--border)",
            color: "var(--text-primary)",
            opacity: s.estado === "ocioso" || s.estado === "esperando" ? 0.65 : 1,
          }}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_DO_ESTADO[s.estado] }} />
          <span className="flex flex-col">
            <b className="font-semibold">{s.agente.nome}</b>
            <small style={{ color: "var(--text-muted)" }}>{s.detalhe}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Escritorio({
  pecas,
  runId,
  titulo,
  projectId,
  onRunTerminou,
  onRunFalhou,
  onAbrirAgente,
  videos,
}: {
  pecas: PecaDoSquad[];
  /** O run em andamento, ou nulo quando o squad está parado. */
  runId: string | null;
  titulo: string;
  /** De quem é este escritório. A conversa com um agente pergunta ao servidor. */
  projectId: string;
  onRunTerminou: () => void;
  onRunFalhou: () => void;
  onAbrirAgente: (agentId: string, falaAtual: string | null) => void;
  /**
   * Os vídeos do projeto, como a faixa da esteira já os consulta (item 12,
   * 29/09). Quem já tem a lista passa, e o escritório não pergunta de novo;
   * sem ela, o escritório pergunta sozinho, com calma.
   */
  videos?: VideoParaOBastao[];
}) {
  // Os logs ficam presos ao run que os produziu: quando o run muda, os do
  // anterior não valem mais, sem precisar de um setState de limpeza.
  const [logsDoRun, setLogsDoRun] = useState<{ runId: string; logs: LogDaEsteira[] } | null>(null);
  const logs = useMemo(() => (runId && logsDoRun?.runId === runId ? logsDoRun.logs : []), [runId, logsDoRun]);
  const [cena, setCena] = useState<CenaAtiva | null>(null);
  // O balão da nossa mesa, quando a semana chega nela.
  const [falaDaMesa, setFalaDaMesa] = useState<string | null>(null);
  const [gesto, setGesto] = useState<Gesto | null>(null);
  // WebGL, movimento e tema se decidem no primeiro render, que já é no
  // cliente: este componente entra por `dynamic` sem SSR.
  const [modo] = useState<"3d" | "linha">(() =>
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches && temWebGL() ? "3d" : "linha"
  );
  const [tema, setTema] = useState<Tema>(lerTema);
  // O SEU BONECO (28/09): a aparência gravada na conta, lida uma vez. Null
  // enquanto carrega; a cena usa o padrão de laranja até chegar.
  const [minhaAparencia, setMinhaAparencia] = useState<Aparencia | null>(null);
  const [editando, setEditando] = useState(false);
  useEffect(() => {
    if (modo !== "3d") return;
    let vivo = true;
    fetch("/api/account/boneco")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d?.aparencia) setMinhaAparencia(d.aparencia as Aparencia);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [modo]);
  const anterior = useRef<string | null>(null);
  const contador = useRef(0);

  // O tema claro/escuro troca em tempo real, e as cores do chão vão junto.
  useEffect(() => {
    const obs = new MutationObserver(() => setTema(lerTema()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => obs.disconnect();
  }, []);

  // Ouve a esteira enquanto ela roda.
  useEffect(() => {
    if (!runId) return;
    let vivo = true;
    const perguntar = async () => {
      try {
        const res = await fetch(`/api/pipeline/status?runId=${runId}`);
        const data = (await res.json()) as { logs?: LogDaEsteira[]; status?: string };
        if (!vivo) return;
        if (Array.isArray(data.logs)) setLogsDoRun({ runId, logs: data.logs });
        if (data.status === "completed" || data.status === "done") {
          clearInterval(intervalo);
          // A semana está pronta: o Paulo leva até a nossa mesa. A cena é
          // estado próprio, então sobrevive ao run virar nulo logo abaixo.
          contador.current += 1;
          setCena({
            de: "paulo-publicador",
            para: "voce",
            humor: "entrega",
            fala: "Pronto. Levando a semana para você.",
            n: contador.current,
          });
          setTimeout(() => setFalaDaMesa("Chegou. A semana está no calendário, esperando você."), 3500);
          setTimeout(() => setFalaDaMesa(null), 16000);
          setTimeout(onRunTerminou, 1500);
        } else if (data.status === "failed" || data.status === "error") {
          clearInterval(intervalo);
          onRunFalhou();
        }
      } catch {
        // Rede oscilou: a próxima pergunta vem em 2,5 s.
      }
    };
    const intervalo = setInterval(() => void perguntar(), 2500);
    void perguntar();
    return () => {
      vivo = false;
      clearInterval(intervalo);
    };
  }, [runId, onRunTerminou, onRunFalhou]);

  /**
   * A ESTEIRA DO VÍDEO no escritório (item 12, 29/09).
   *
   * O run de texto tem log; o vídeo só tem status. `bastaoDoVideo` traduz o
   * status em logs do mesmo formato, e daí para frente é o mesmo caminho:
   * quem tem o último "running" leva o bastão, e a troca vira um robô andando.
   * O run da campanha tem prioridade: se os dois rodam, é ele que está na sala.
   */
  const [videosProprios, setVideosProprios] = useState<VideoParaOBastao[]>([]);
  useEffect(() => {
    if (videos) return;
    let vivo = true;
    const buscar = () =>
      fetch(`/api/videos/status?projectId=${projectId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (vivo && Array.isArray(d?.videos)) setVideosProprios(d.videos as VideoParaOBastao[]);
        })
        .catch(() => {});
    void buscar();
    // Mais devagar que a faixa (4 s): aqui é só para a sala se mexer.
    const t = setInterval(buscar, 8000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [videos, projectId]);
  const listaDeVideos = videos ?? videosProprios;

  // O relógio da sala: o revezamento dos redatores e a viagem final até a
  // Vera e o Paulo são contados no tempo, então precisam de um tique. Só anda
  // enquanto há vídeo na esteira.
  const [agora, setAgora] = useState(() => Date.now());
  const haVideoAndando = !runId && videoDaVez(listaDeVideos, agora) !== null;
  useEffect(() => {
    if (!haVideoAndando) return;
    const t = setInterval(() => setAgora(Date.now()), 1500);
    return () => clearInterval(t);
  }, [haVideoAndando]);
  const bastao = useMemo(() => {
    if (runId) return null;
    const v = videoDaVez(listaDeVideos, agora);
    return v ? bastaoDoVideo(v, agora) : null;
  }, [runId, listaDeVideos, agora]);

  // As peças novas entram na sala uma de cada vez (ver pecas-uma-a-uma.ts).
  const pecasNaSala = useUmaAUma(pecas, (p) => p.id);

  const situacao = useMemo(() => {
    const base = bastao
      ? situacaoDoSquad({ pecas: pecasNaSala, logs: bastao.logs, rodando: true, agora })
      : situacaoDoSquad({ pecas: pecasNaSala, logs, rodando: Boolean(runId) });
    if (!bastao || bastao.ajudantes.length === 0) return base;
    // Quem trabalha JUNTO (a Diana no enquadramento, o Roberto pesquisando)
    // senta e trabalha também, sem levar o bastão: `situacaoDoSquad` só sabe
    // de um agente da vez.
    return {
      ...base,
      agentes: base.agentes.map((s) =>
        bastao.ajudantes.includes(s.agente.id)
          ? { ...s, estado: "trabalhando" as const, detalhe: base.falas[s.agente.id] ?? "trabalhando junto" }
          : s
      ),
    };
  }, [pecasNaSala, logs, runId, bastao, agora]);

  // A semana do vídeo chegou: quando o bastão do vídeo some depois de passar
  // pelo Paulo, ele leva até a sua mesa, como no fim do run de texto.
  // Depende só da FASE: o objeto do bastão é refeito a cada tique do relógio.
  const faseDoBastao = bastao?.fase ?? null;
  const faseAnterior = useRef<string | null>(null);
  useEffect(() => {
    const antes = faseAnterior.current;
    faseAnterior.current = faseDoBastao;
    if (antes === "publicando" && !faseDoBastao) {
      contador.current += 1;
      setCena({ de: "paulo-publicador", para: "voce", humor: "entrega", fala: "Pronto. Levando a semana do vídeo para você.", n: contador.current });
      setTimeout(() => setFalaDaMesa("Chegou. Os cortes e os textos estão no calendário, esperando você."), 3500);
      setTimeout(() => setFalaDaMesa(null), 16000);
    }
  }, [faseDoBastao]);

  // O bastão passou: quem tinha entrega para quem tem agora.
  useEffect(() => {
    const agora = situacao.trabalhando;
    const antes = anterior.current;
    anterior.current = agora;
    if (antes && agora && antes !== agora) {
      contador.current += 1;
      const nome = AGENTES.find((a) => a.id === agora)?.primeiroNome;
      setCena({
        de: antes,
        para: agora,
        humor: "entrega",
        fala: nome ? `Terminei. Levando para ${nome}.` : "Terminei, levando adiante.",
        n: contador.current,
      });
    }
  }, [situacao.trabalhando]);

  /**
   * A BRONCA: a Vera reprovou e volta na mesa de quem escreveu.
   *
   * Ela tem prioridade sobre a entrega, porque é o que está acontecendo agora
   * na sala, e é encenada UMA vez: o log dela continua na lista até o fim do
   * run, e sem esta marca a Vera atravessaria a sala a cada 2,5 segundos.
   */
  const broncaEncenada = useRef<string | null>(null);
  useEffect(() => {
    const b = situacao.bronca;
    if (!b) return;
    const assinatura = `${b.de}->${b.para}:${b.motivo}`;
    if (broncaEncenada.current === assinatura) return;
    broncaEncenada.current = assinatura;
    contador.current += 1;
    setCena({ de: b.de, para: b.para, humor: "bronca", fala: b.motivo, n: contador.current });
  }, [situacao.bronca]);

  // Vida de escritório: a cada 9 s alguém parado acena ou concorda. A
  // situação vai por ref: com o vídeo andando ela muda a cada tique do
  // relógio (1,5 s), e como dependência reiniciaria os 9 s para sempre.
  const situacaoAtual = useRef(situacao);
  useEffect(() => {
    situacaoAtual.current = situacao;
  }, [situacao]);
  useEffect(() => {
    if (modo !== "3d") return;
    const t = setInterval(() => {
      const parados = situacaoAtual.current.agentes.filter((s) => s.estado !== "trabalhando");
      if (parados.length === 0) return;
      const s = parados[Math.floor(Math.random() * parados.length)];
      contador.current += 1;
      setGesto({ id: s.agente.id, nome: Math.random() < 0.5 ? "Wave" : "Yes", n: contador.current });
    }, 9000);
    return () => clearInterval(t);
  }, [modo]);

  /**
   * AS VISITAS À SUA SALA (29/09), pedido do Bruno: os agentes "podem ir pedir
   * feedback para o usuário das entregas e dar sugestões para melhorar o
   * projeto".
   *
   * Duas razões para alguém atravessar a sala até você, e as duas saem de dado:
   * peça pronta esperando a sua aprovação (quem fez vem pedir retorno) e uma
   * sugestão para o documento do projeto (ver lib/squad/sugestoes-do-squad.ts).
   * Com a esteira rodando ninguém sai da mesa: trabalho vem antes de visita.
   */
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [visita, setVisita] = useState<{ agentId: string; sugestao?: Sugestao } | null>(null);
  /**
   * A VISITA SE DESCARTA (07/10, o print do Bruno: "não consigo mandar
   * embora"). O balão voltava a cada 40 s enquanto houvesse peça esperando. O
   * X sobre a cena grava uma chave por PEÇA pendente daquele agente
   * ("visita-peca:<agente>:<peça>"): a visita só volta quando aparece peça
   * pendente sem chave, ou seja, uma peça nova. Aprovar uma peça não traz a
   * visita de volta. Na sugestão, a chave é a dela, sem gravar recusa: o
   * "Agora não" continua sendo a recusa que o squad aprende. As peças
   * continuam no quadro, com "esperando você".
   */
  const descartes = useDescartes();
  const [visitaNaTela, setVisitaNaTela] = useState(false);
  // A mesma regra da contagem de `situacaoDoSquad`: o dono pela `donoDaPeca`
  // (que traduz os ids antigos e cai no tipo), sobre as peças que já estão na
  // sala. Pelo `agentId` cru, a peça de id antigo não tinha chave e o agente
  // parava de visitar sem ninguém ter dispensado.
  const pendentesDoAgente = useCallback(
    (agentId: string) => pecasNaSala.filter((p) => donoDaPeca(p)?.id === agentId && !p.emProducao && (p.status === "pending" || p.status === "needs_revision")),
    [pecasNaSala]
  );
  const chavesDaVisita = useCallback(
    (v: { agentId: string; sugestao?: Sugestao }) =>
      (v.sugestao ? [chaveDaSugestao(v.sugestao.id)] : pendentesDoAgente(v.agentId).map((p) => chaveDaVisitaDaPeca(v.agentId, p.id))).filter(
        (c): c is string => Boolean(c)
      ),
    [pendentesDoAgente]
  );
  // Em refs: o relógio das visitas não pode recomeçar a cada desenho do
  // Gestor (as peças chegam num array novo a cada desenho).
  const descartesRef = useRef(descartes);
  const chavesDaVisitaRef = useRef(chavesDaVisita);
  useEffect(() => {
    descartesRef.current = descartes;
    chavesDaVisitaRef.current = chavesDaVisita;
  });
  function dispensarVisita(v: { agentId: string; sugestao?: Sugestao }) {
    descartes.descartar(chavesDaVisita(v));
    setVisita(null);
    setVisitaNaTela(false);
    setCena(null);
  }
  const [sugestaoAberta, setSugestaoAberta] = useState<Sugestao | null>(null);
  const [decidindo, setDecidindo] = useState(false);
  const vezDaVisita = useRef(0);

  useEffect(() => {
    let vivo = true;
    const buscar = () =>
      fetch(`/api/projects/${projectId}/squad/sugestoes`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (vivo && Array.isArray(d?.sugestoes)) setSugestoes(d.sugestoes as Sugestao[]);
        })
        .catch(() => {});
    void buscar();
    const t = setInterval(buscar, 5 * 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [projectId]);

  useEffect(() => {
    if (modo !== "3d" || runId || haVideoAndando) return;
    const visitar = (primeira = false) => {
      const d = descartesRef.current;
      const pedidos = situacao.agentes
        .filter((s) => s.pendentes > 0 && s.estado !== "trabalhando")
        // Só quem tem peça pendente ainda não dispensada vem à sala.
        .filter((s) => chavesDaVisitaRef.current({ agentId: s.agente.id }).some((c) => !d.ehDescartado(c)))
        .map((s) => ({
          agentId: s.agente.id,
          fala: `${s.pendentes === 1 ? "Tenho 1 peça" : `Tenho ${s.pendentes} peças`} esperando você. Me dá um retorno?`,
        }));
      const comSugestao = sugestoes
        .filter((s) => !d.ehDescartado(chaveDaSugestao(s.id)))
        .map((s) => ({ agentId: s.agenteId, fala: s.fala, sugestao: s as Sugestao | undefined }));
      // Sugestão e pedido de retorno se revezam; a primeira visita é sempre
      // uma sugestão quando existe, porque é a que muda o projeto.
      const vez = vezDaVisita.current;
      const usarSugestao = comSugestao.length > 0 && (primeira || vez % 2 === 0 || pedidos.length === 0);
      const lista = usarSugestao ? comSugestao : pedidos;
      if (!lista.length) return;
      const escolha: { agentId: string; fala: string; sugestao?: Sugestao } = lista[Math.floor(vez / 2) % lista.length];
      vezDaVisita.current += 1;
      contador.current += 1;
      setVisita({ agentId: escolha.agentId, sugestao: escolha.sugestao });
      setVisitaNaTela(true);
      setTimeout(() => setVisitaNaTela(false), 14_000);
      setCena({ de: escolha.agentId, para: "voce", humor: "entrega", fala: escolha.fala, n: contador.current, demora: 14 });
    };
    // A primeira visita vem logo, para a sala não parecer parada; depois, com folga.
    const primeira = setTimeout(() => visitar(true), 9000);
    const t = setInterval(() => visitar(), 40_000);
    return () => {
      clearTimeout(primeira);
      clearInterval(t);
    };
  }, [modo, runId, haVideoAndando, situacao.agentes, sugestoes]);

  async function decidir(acao: "aceitar" | "recusar") {
    if (!sugestaoAberta) return;
    setDecidindo(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/squad/sugestoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sugestaoAberta.id, acao }),
      });
      const d = (await r.json().catch(() => ({}))) as { escrito?: boolean };
      setSugestoes((antes) => antes.filter((s) => s.id !== sugestaoAberta.id));
      setFalaDaMesa(d.escrito ? "Anotado no documento do projeto. Vale a partir da próxima campanha." : "Combinado, deixo para depois.");
      setTimeout(() => setFalaDaMesa(null), 9000);
    } finally {
      setDecidindo(false);
      setSugestaoAberta(null);
      setVisita(null);
      // O balão da visita sai junto (30/09): aceitar tirava a sugestão da lista
      // mas deixava o agente parado na sua sala falando a mesma coisa.
      setCena(null);
    }
  }

  // A fala vai junto do clique: quem abre a ficha de um agente enquanto a
  // esteira roda quer ver o que ele está fazendo AGORA, e é o escritório que
  // tem essa informação, não a tela de fora. Quem veio à sua sala com uma
  // sugestão abre a sugestão, e não a ficha.
  const abrir = useCallback(
    (id: string) => {
      if (visita?.agentId === id && visita.sugestao) {
        setSugestaoAberta(visita.sugestao);
        return;
      }
      onAbrirAgente(id, situacao.falas[id] ?? null);
    },
    [onAbrirAgente, situacao.falas, visita]
  );

  /**
   * A CONVERSA com um agente, que acontece quando você para ao lado dele.
   *
   * Mora aqui, e não na cena, por dois motivos: quem fala com o servidor é o
   * lado de fora (a cena 3D não sabe o que é rota), e o histórico precisa
   * sobreviver ao menu fechar. Você anda até o Lucas, pergunta, se afasta para
   * ver a mesa da Vera e volta: a conversa continua onde estava, e não do
   * zero, que é o que aconteceria se ela morasse dentro do menu.
   */
  const [conversas, setConversas] = useState<Record<string, Turno[]>>({});
  const [pensando, setPensando] = useState<string | null>(null);

  const conversar = useCallback(
    async (agentId: string, corpo: { pergunta?: string; sobre?: string }, meuTurno: string) => {
      // Duas perguntas ao mesmo tempo virariam duas respostas fora de ordem no
      // mesmo balão. Enquanto um pensa, ninguém mais é chamado.
      if (pensando) return;
      setConversas((antes) => ({ ...antes, [agentId]: [...(antes[agentId] ?? []), { de: "voce", texto: meuTurno }] }));
      setPensando(agentId);
      try {
        const res = await fetch(`/api/projects/${projectId}/squad/${agentId}/conversa`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
        const data = (await res.json()) as { resposta?: string; error?: string; fez?: string[] };
        const texto = res.ok && data.resposta ? data.resposta : (data.error ?? "Não consegui responder agora.");
        setConversas((antes) => ({
          ...antes,
          [agentId]: [...(antes[agentId] ?? []), { de: "agente", texto, fez: data.fez }],
        }));
      } catch {
        setConversas((antes) => ({
          ...antes,
          [agentId]: [...(antes[agentId] ?? []), { de: "agente", texto: "A conexão caiu no meio. Pergunta de novo?" }],
        }));
      } finally {
        setPensando(null);
      }
    },
    [projectId, pensando]
  );

  const perguntar = useCallback(
    (agentId: string, pergunta: string) => void conversar(agentId, { pergunta }, pergunta),
    [conversar]
  );

  const comentarSobre = useCallback(
    (agentId: string, outroId: string) => {
      const outro = AGENTES.find((a) => a.id === outroId);
      if (!outro) return;
      // A pergunta aparece no histórico com o artigo certo. "O que você acha
      // do Vera" foi o defeito que o protótipo pegou, e ele nasce de montar
      // frase com artigo fixo.
      const minha = `O que você acha d${outro.artigo === "A" ? "a" : "o"} ${outro.primeiroNome}?`;
      void conversar(agentId, { sobre: outroId }, minha);
    },
    [conversar]
  );
  const ultimaFala = [...(bastao ? bastao.logs : logs)].reverse().find((l) => l.status === "running");

  return (
    <div className="space-y-2">
      <div
        className={cn("relative rounded-xl border", modo === "3d" && "overflow-hidden")}
        style={{
          borderColor: "var(--border)",
          background: "radial-gradient(120% 90% at 50% 0%, var(--bg-elevated), var(--bg-primary))",
          // Maior desde 28/09, a pedido do Bruno: "a faixa do escritório na
          // tela pode ser maior, para caber o escritório completo". A sala
          // isométrica, com paredes e o canto do café, precisa de altura.
          height: modo === "3d" ? "min(62vw, 620px)" : undefined,
          minHeight: modo === "3d" ? 380 : undefined,
        }}
      >
        {modo === "3d" ? (
          <EscritorioDoSquad
            situacao={situacao}
            cena={cena}
            gesto={gesto}
            titulo={titulo}
            tema={tema}
            falaDaMesa={falaDaMesa}
            aoFecharFalaDaMesa={() => setFalaDaMesa(null)}
            reduzido={false}
            onAbrirAgente={abrir}
            conversas={conversas}
            pensando={pensando}
            onPerguntar={perguntar}
            onComentarSobre={comentarSobre}
            minhaAparencia={minhaAparencia}
          />
        ) : null}
        {/* Personalizar o seu boneco: corpo, cabelo, pele, roupa e detalhes. */}
        {modo === "3d" && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-[var(--shadow)] transition-colors hover:border-orange-500"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            <UserRoundPen className="h-3.5 w-3.5" style={{ color: "var(--accent-orange)" }} />
            Personalizar meu avatar
          </button>
        )}
        {/* A SUGESTÃO que o agente trouxe até a sua sala: o que ele quer mudar
            no documento do projeto, por quê, e a sua decisão. */}
        {sugestaoAberta && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
            <div
              className="w-full max-w-[460px] rounded-xl border p-5 shadow-2xl"
              style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
            >
              <div className="flex items-start gap-3">
                <AvatarDoAgente agenteId={sugestaoAberta.agenteId} tamanho={44} />
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {AGENTES.find((a) => a.id === sugestaoAberta.agenteId)?.nome ?? "O squad"}
                  </p>
                  <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {sugestaoAberta.fala}
                  </p>
                </div>
                {/* O X fecha e dispensa a VISITA desta sugestão, sem gravar
                    recusa (07/10): "Agora não" continua sendo a recusa. */}
                <BotaoDescartar
                  rotulo="Fechar e dispensar a visita"
                  aoDescartar={() => {
                    const s = sugestaoAberta;
                    setSugestaoAberta(null);
                    dispensarVisita({ agentId: s.agenteId, sugestao: s });
                  }}
                  className="-mt-2 -mr-2"
                />
              </div>
              <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {sugestaoAberta.porque}
              </p>
              {sugestaoAberta.regra && (
                <div className="mt-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    Entra no documento do projeto
                  </span>
                  <p className="mt-1">{sugestaoAberta.regra}</p>
                </div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={decidindo}
                  onClick={() => void decidir("recusar")}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                >
                  Agora não
                </button>
                {sugestaoAberta.regra ? (
                  <button
                    type="button"
                    disabled={decidindo}
                    onClick={() => void decidir("aceitar")}
                    className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Pôr no documento
                  </button>
                ) : (
                  <a
                    href={`/projects/${projectId}/${sugestaoAberta.link ?? "setup"}`}
                    className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Resolver agora
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
        {editando && (
          <EditorDoBoneco
            inicial={minhaAparencia ?? APARENCIA_PADRAO_DO_USUARIO}
            aoFechar={() => setEditando(false)}
            aoSalvar={(a) => {
              setMinhaAparencia(a);
              setEditando(false);
            }}
          />
        )}
        {modo === "linha" && (
          <EscritorioDeMassinha
            situacao={situacao}
            cena={cena}
            falaDaMesa={falaDaMesa}
            aoFecharFalaDaMesa={() => setFalaDaMesa(null)}
            onAbrirAgente={abrir}
            conversas={conversas}
            pensando={pensando}
            onPerguntar={perguntar}
            onComentarSobre={comentarSobre}
          />
        )}
        {/* A DICA, que é o que faz alguém descobrir que o avatar anda.

            Sem ela, o avatar sentado na mesa continua sendo lido como enfeite:
            ninguém clica no chão de um painel por conta própria. Ela começa
            pelo clique, que funciona também no celular, e o teclado vem
            depois, para quem já está dentro da cena. */}
        {modo === "3d" && !descartes.ehDescartado(CHAVE_DOS_CONTROLES) && (
          // A dica não segura o toque (07/10): o clique e o arraste passam
          // direto para a cena; só o X recebe o toque.
          <span
            className="pointer-events-none absolute bottom-2 right-3 inline-flex items-center gap-1 rounded-md py-0.5 pl-2 pr-0.5 text-[10px]"
            style={{ color: "var(--text-muted)", background: "color-mix(in srgb, var(--bg-surface) 80%, transparent)" }}
          >
            <span>clique no chão para andar · E fala · X senta na sua mesa · C toma café · WASD · arraste para olhar</span>
            <BotaoDescartar compacto chave={CHAVE_DOS_CONTROLES} className="pointer-events-auto" />
          </span>
        )}
        {/* A VISITA NA SUA SALA, com o X em HTML sobre a cena (07/10). No
            celular ela desce para baixo do "Personalizar meu avatar": na mesma
            faixa do topo ela cobria o botão e tomava o toque dele. */}
        {modo === "3d" && visita && visitaNaTela && !sugestaoAberta && (
          <div
            className="absolute left-3 top-14 z-10 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-lg border py-0.5 pl-2.5 pr-0.5 text-xs shadow-[var(--shadow)] sm:left-auto sm:right-3 sm:top-3"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            data-visita
          >
            <span className="min-w-0">{AGENTES.find((a) => a.id === visita.agentId)?.primeiroNome ?? "O squad"} veio até a sua sala</span>
            <BotaoDescartar rotulo="Dispensar a visita" aoDescartar={() => dispensarVisita(visita)} />
          </div>
        )}
        {/* A fala da sua mesa (07/10): o X mora no próprio balão da cena (uma
            pílula aqui repetia a mesma frase e cobria o botão do avatar no
            celular). Para o leitor de tela, a frase é anunciada aqui. */}
        {modo === "3d" && falaDaMesa && (
          <p className="sr-only" role="status" data-fala-da-mesa>
            {falaDaMesa}
          </p>
        )}
      </div>
      {(runId || bastao) && ultimaFala && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          <span className="font-medium text-orange-400">{ultimaFala.agent}: </span>
          {ultimaFala.message}
        </p>
      )}
    </div>
  );
}
