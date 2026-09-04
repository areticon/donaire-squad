"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, RotateCcw, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { proximaAcao } from "@/lib/media/video-state";

/**
 * A faixa do piloto automático, dentro do Gestor de Conteúdo.
 *
 * Nasceu do veredito do Bruno em 02/09: "a tela do vídeo é ruim, todo o
 * processo deve acontecer na tela de gestor de conteúdo, em tempo real". O
 * problema era de lugar, não de mecanismo: o processo morava numa tela e o
 * resultado em outra, e o intervalo de 15 minutos entre os cortes e o vídeo
 * completo fazia o completo parecer perdido.
 *
 * Por isso este componente carrega DUAS coisas que antes viviam na tela do
 * vídeo: a faixa que se vê e **o piloto automático que dispara as etapas**. Se
 * só a faixa tivesse mudado de lugar, a tela do vídeo sairia de cena levando
 * junto quem empurra o fluxo, e nada mais andaria sozinho.
 *
 * O tempo real aqui é a consulta de quatro em quatro segundos, que já existia e
 * já sustentava a tela de espera. O `pusher` está nas dependências do projeto
 * desde sempre, mas não é importado em lugar nenhum e não tem chave no
 * ambiente: seria conta nova e infra nova, não uma economia.
 */

export type VideoAoVivo = {
  id: string;
  status: string;
  error: string | null;
  attempts: number;
  durationSec: number | null;
  criadoEm: string;
  originalName: string | null;
  trechosEscolhidos: number;
  cortesProntos: number;
  cortesQueVaoAoAr: number;
  temTranscricao: boolean;
  temTrechos: boolean;
  temCortes: boolean;
  temTrechosComPosts: boolean;
  temCompleto: boolean;
  /** As opções de capa do completo já existem (lib/media/capas-do-completo.ts). */
  capas?: boolean;
  rodandoHaSegundos: number | null;
  /** Há quanto tempo o registro não muda (ver a rota de status). */
  paradoHaSegundos?: number;
  /**
   * A pesquisa do Roberto, em contagem. Nula enquanto ele não terminou (ou
   * enquanto a página do servidor ainda não a trouxe: a primeira consulta
   * completa).
   */
  radar?: { teses: number; achados: number; dados: number; fontes: number } | null;
  /** Os cortes prontos que o cliente desligou: existem, mas não vão ao ar. */
  cortesGuardados?: CorteGuardado[];
};

export type CorteGuardado = {
  indice: number;
  titulo: string;
  /** As redes que o corte trazia quando foi desligado. */
  destinos?: string[];
  inicio: number | null;
  fim: number | null;
  capa: string;
  video: string;
};

/** De quanto em quanto tempo perguntar ao servidor se algo mudou. */
const INTERVALO_MS = 4000;

/**
 * As sete fases que o dono da gravação enxerga.
 *
 * Não são os estados do banco: `cut` cobre corte, capa e redação, e nenhum
 * deles tem nome que signifique algo para quem está esperando. O mapeamento
 * mora em `faseDe`.
 *
 * "Pesquisando" é a exceção da linha: o Roberto roda em PARALELO com a
 * escolha dos momentos, a partir da mesma transcrição, então o marco dele não
 * segue o índice e sim o `radar` do vídeo (feito quando existe, pulsando
 * enquanto há transcrição e não há pesquisa).
 */
const FASES = [
  { chave: "ouvindo", rotulo: "Ouvindo", detalhe: "Palavra por palavra, com marcação de tempo" },
  { chave: "pesquisando", rotulo: "Pesquisando", detalhe: "O que você disse, o que estão falando, dados com fonte" },
  { chave: "escolhendo", rotulo: "Escolhendo", detalhe: "Procurando as falas que sustentam um post sozinhas" },
  { chave: "cortando", rotulo: "Cortando", detalhe: "Enquadrando cada corte para o formato de cada rede" },
  { chave: "capas", rotulo: "Capas", detalhe: "Escrevendo os títulos e montando as capas" },
  { chave: "escrevendo", rotulo: "Escrevendo", detalhe: "Um texto por rede, na sua voz" },
  { chave: "completo", rotulo: "Vídeo completo", detalhe: "A gravação inteira editada, com capítulos" },
] as const;
const PESQUISANDO = 1;
const ULTIMA = FASES.length - 1;

/** Em que fase da faixa este vídeo está, e se ele terminou. */
function faseDe(v: VideoAoVivo, etapaLocal: string | null): number {
  switch (v.status) {
    case "uploaded":
    case "transcribing":
      return 0;
    case "transcribed":
    case "selecting":
      return 2;
    case "selected":
    case "cutting":
      return 3;
    case "cut":
      // O status do banco não separa capa de redação: as duas rodam com o vídeo
      // parado em `cut`. Quem sabe a diferença é quem disparou, aqui do lado do
      // cliente.
      return etapaLocal === "escrevendo" ? 5 : 4;
    case "writing":
      return 5;
    default:
      return ULTIMA;
  }
}

/**
 * Quanto tempo o processo inteiro leva, estimado da duração da gravação.
 *
 * Medido em 01 e 02/09 na gravação de 16 minutos: os cortes chegam em torno de
 * 5 minutos e o completo, que ganhou dois passes, em torno de 18. A conta é
 * proporcional porque as duas pontas são recodificação, e o piso existe porque
 * gravação curta ainda paga o custo fixo de subir, transcrever e escrever.
 */
function estimativaSegundos(duracaoSec: number | null): number {
  const base = duracaoSec ?? 900;
  return Math.max(6 * 60, Math.round(base * 1.15));
}

function mmss(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Está no meio do caminho?
 *
 * Vale para qualquer estado que não seja o fim da linha, e não só para os
 * estados de trabalho: entre uma etapa e a seguinte o vídeo fica parado em
 * `uploaded`, `transcribed`, `selected` ou `cut`, que é justamente quando o
 * piloto precisa enxergá-lo para disparar o próximo passo. Perguntar só nos
 * estados de trabalho deixaria o fluxo parado até alguém recarregar a página.
 */
function emAndamento(v: VideoAoVivo): boolean {
  if (v.status === "failed") return false;
  if (v.status === "ready") return !v.temCompleto;
  return true;
}

export function EsteiraDoVideo({
  projectId,
  videosIniciais,
  aoMudar,
  sinalDeRecarga = 0,
}: {
  projectId: string;
  videosIniciais: VideoAoVivo[];
  /**
   * O estado fresco das gravações, a cada consulta, mais o aviso de que algum
   * status MUDOU. É o que faz os cards aparecerem no quadro sem recarregar a
   * página: com a mudança o Gestor recarrega a semana, e com o estado ele
   * desenha o lugar guardado do vídeo completo e os cortes desligados, que não
   * têm card no banco e mesmo assim precisam ser vistos.
   */
  aoMudar: (videos: VideoAoVivo[], statusMudou: boolean) => void;
  /**
   * Muda quando o Gestor acabou de mandar uma gravação nova. Sem isto, a
   * gravação recém-enviada só apareceria na próxima visita: o ritmo de consulta
   * só liga quando já existe algo em andamento, e o que acabou de subir ainda
   * não estava na lista.
   */
  sinalDeRecarga?: number;
}) {
  const [videos, setVideos] = useState<VideoAoVivo[]>(videosIniciais);
  const [etapaLocal, setEtapaLocal] = useState<Record<string, string | null>>({});
  const [erroDaAcao, setErroDaAcao] = useState<string | null>(null);
  const [dispensados, setDispensados] = useState<string[]>([]);
  const [agora, setAgora] = useState(() => Date.now());

  // O relógio da faixa anda por conta própria entre uma consulta e outra, senão
  // o número ficaria parado quatro segundos e voltaria a andar, que é
  // exatamente a impressão de tela travada que este trabalho existe para tirar.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const statusConhecidos = useRef<Record<string, string>>({});
  const videosAgora = useRef<VideoAoVivo[]>(videos);
  useEffect(() => {
    statusConhecidos.current = Object.fromEntries(videos.map((v) => [v.id, v.status]));
    videosAgora.current = videos;
  });

  /**
   * Manda o quadro recarregar mesmo sem troca de status.
   *
   * Existe porque as ações que criam card não mudam o estado do vídeo:
   * `agendar` deixa o vídeo em "ready" e enche o quadro, e ligar o publicar de
   * um corte guardado não mexe no status nenhum. Confiar só na troca de status
   * deixaria a peça nova invisível até alguém recarregar a página.
   */
  const forcarRecarga = useCallback(() => {
    aoMudar(videosAgora.current, true);
  }, [aoMudar]);

  const consultar = useCallback(async () => {
    try {
      const r = await fetch(`/api/videos/status?projectId=${projectId}`, { cache: "no-store" });
      if (!r.ok) return;
      const { videos: frescos } = (await r.json()) as { videos: VideoAoVivo[] };
      // Só avisa o quadro quando um status realmente mudou. Sem esta guarda
      // seria uma recarga da semana a cada quatro segundos, para sempre.
      const mudou = frescos.some(
        (v) =>
          statusConhecidos.current[v.id] !== undefined &&
          statusConhecidos.current[v.id] !== v.status
      );
      setVideos(frescos);
      aoMudar(frescos, mudou);
    } catch {
      // Consulta que falha não vira erro na tela: a próxima tenta em quatro
      // segundos, e piscar "falha de rede" a cada oscilação assustaria mais do
      // que ajudaria.
    }
  }, [projectId, aoMudar]);

  const executar = useCallback(
    async (videoId: string, rota: string, opts?: { silencioso?: boolean }) => {
      setErroDaAcao(null);
      const disparo = fetch(`/api/videos/${videoId}/${rota}`, { method: "POST" });
      // Consultas escalonadas, e não uma só: a rota leva mais de 400 ms para
      // marcar o estado quando a função está fria, e a consulta única chegava
      // antes de o estado existir.
      for (const ms of [400, 1500, 3000, 6000, 10000, 15000, 25000]) {
        setTimeout(() => void consultar(), ms);
      }
      try {
        const r = await disparo;
        // 409 numa chamada do piloto quer dizer que o servidor já tomou a
        // etapa: não é erro, é a cura chegando atrasada. Só o clique humano
        // vê o 409.
        if (!r.ok && !(opts?.silencioso && r.status === 409)) {
          const corpo = await r.json().catch(() => ({}));
          setErroDaAcao(corpo.error ?? `A plataforma recusou com código ${r.status}.`);
        }
      } catch {
        // A requisição pode cair antes de a etapa longa terminar (rede, aba
        // trocada, proxy impaciente), e isso não quer dizer que o trabalho
        // parou. Quem sabe o estado de verdade é o banco.
      } finally {
        void consultar();
        forcarRecarga();
      }
    },
    [consultar, forcarRecarga]
  );

  /** Capas, redação e quadro em sequência, com a fase visível na faixa. */
  const prepararTudo = useCallback(
    async (videoId: string) => {
      try {
        setEtapaLocal((a) => ({ ...a, [videoId]: "capas" }));
        const capas = await fetch(`/api/videos/${videoId}/capas`, { method: "POST" });
        if (!capas.ok) throw new Error((await capas.json().catch(() => ({}))).error);
        setEtapaLocal((a) => ({ ...a, [videoId]: "escrevendo" }));
        const w = await fetch(`/api/videos/${videoId}/write`, { method: "POST" });
        if (!w.ok) throw new Error((await w.json().catch(() => ({}))).error);
        const ag = await fetch(`/api/videos/${videoId}/agendar`, { method: "POST" });
        if (!ag.ok) throw new Error((await ag.json().catch(() => ({}))).error);
        setEtapaLocal((a) => ({ ...a, [videoId]: null }));
      } catch (e) {
        setEtapaLocal((a) => ({ ...a, [videoId]: null }));
        setErroDaAcao(
          e instanceof Error && e.message
            ? e.message
            : "Uma etapa falhou. Dá para repetir daqui mesmo."
        );
      } finally {
        void consultar();
        forcarRecarga();
      }
    },
    [consultar, forcarRecarga]
  );

  /**
   * O PILOTO DA TELA, desde 04/09 só como CURA.
   *
   * Quem encadeia as etapas é o servidor (`lib/media/piloto-do-servidor.ts`):
   * a transcrição dispara seleção e semana de texto, a seleção dispara o
   * corte, o corte dispara capas, redação e quadro. Medido no teste de 04/09,
   * quando a aba era quem empurrava: os cortes ficaram prontos aos 6,9 min e a
   * etapa seguinte só saiu aos 12,5 min, porque a aba estava em segundo plano
   * e o navegador segura o relógio de aba escondida.
   *
   * O que sobra para a tela: a transcrição (o envio não tem callback), e
   * repetir qualquer etapa que ficou PARADA mais tempo do que o servidor
   * levaria para tomá-la. Como toda rota é idempotente e atômica
   * (`updateMany` por status), a cura que chega junto com o servidor leva 409
   * e some em silêncio.
   */
  const PARADO_S = 90;
  const disparados = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const v of videos) {
      const chave = `${v.id}:${v.status}`;
      if (disparados.current.has(chave)) continue;
      const parado = v.paradoHaSegundos ?? 0;

      if (v.status === "uploaded") {
        disparados.current.add(chave);
        void executar(v.id, "transcribe");
        continue;
      }
      const cura =
        v.status === "transcribed" ? "select" : v.status === "selected" ? "cortar" : null;
      if (cura && parado > PARADO_S) {
        disparados.current.add(chave);
        void executar(v.id, cura, { silencioso: true });
        continue;
      }
      // A pesquisa do Roberto sai do passo "semana" do servidor, um minuto
      // depois do envio. Cinco minutos sem briefing é corrente quebrada.
      const idadeS = (agora - new Date(v.criadoEm).getTime()) / 1000;
      if (v.temTranscricao && !v.radar && v.status !== "failed" && idadeS > 300) {
        const chavePesquisa = `${v.id}:pesquisar`;
        if (!disparados.current.has(chavePesquisa)) {
          disparados.current.add(chavePesquisa);
          void fetch(`/api/videos/${v.id}/pesquisar`, { method: "POST" }).then(() => void consultar());
        }
      }
      // As capas do completo saem do callback do worker; parado dois minutos
      // com o completo e sem capa, a tela pede.
      if (v.temCompleto && !v.capas && v.status !== "failed" && parado > 120) {
        const chaveCapas = `${v.id}:capas`;
        if (!disparados.current.has(chaveCapas)) {
          disparados.current.add(chaveCapas);
          void fetch(`/api/videos/${v.id}/capas-do-completo`, { method: "POST" }).then(() => {
            void consultar();
            forcarRecarga();
          });
        }
      }
      // "cut" dura o tempo das capas (a redação já troca para "writing"), por
      // isso a folga maior antes de considerar parado.
      if (v.status === "cut" && v.temCortes && !v.temTrechosComPosts && parado > 150) {
        disparados.current.add(chave);
        void prepararTudo(v.id);
        continue;
      }
      // O agendar é idempotente e barato: em "ready" parado ele só completa o
      // quadro com o que faltou (Vitor, Vera nos dias dos cortes).
      if (v.status === "ready" && parado > PARADO_S) {
        disparados.current.add(chave);
        void fetch(`/api/videos/${v.id}/agendar`, { method: "POST" }).then(() => {
          void consultar();
          forcarRecarga();
        });
        continue;
      }
      // Só a PRIMEIRA falha ganha retry sozinho: erro sistêmico novo queimava as
      // três tentativas em minutos e aposentava o botão (aconteceu em 01/09 com
      // o store recusando upload). A segunda falha fica para o clique humano.
      if (v.status === "failed" && v.attempts < 2) {
        const chaveRetry = `${v.id}:failed:${v.attempts}`;
        if (!disparados.current.has(chaveRetry)) {
          disparados.current.add(chaveRetry);
          const acao = proximaAcao(v);
          if (acao) void executar(v.id, acao.rota);
        }
      }
    }
    // A dependência inclui o "parado" arredondado ao meio minuto: é o que faz
    // o efeito acordar de novo quando um estado de espera envelhece, sem rodar
    // a cada consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos.map((v) => `${v.id}:${v.status}:${v.temCompleto ? 1 : 0}:${v.capas ? 1 : 0}:${v.radar ? 1 : 0}:${Math.floor((v.paradoHaSegundos ?? 0) / 30)}`).join("|")]);

  const algumAndando = videos.some(emAndamento);

  useEffect(() => {
    if (!algumAndando) return;
    void consultar();
    const t = setInterval(() => void consultar(), INTERVALO_MS);
    return () => clearInterval(t);
  }, [algumAndando, consultar]);

  useEffect(() => {
    if (sinalDeRecarga === 0) return;
    void consultar();
  }, [sinalDeRecarga, consultar]);

  /**
   * Quais gravações merecem faixa.
   *
   * As em andamento sempre. A que acabou de terminar também, por uma sessão:
   * é ela que responde "cadê o vídeo completo", e some quando a pessoa dispensa
   * ou recarrega a página com tudo pronto há mais de meia hora.
   */
  const emFaixa = videos.filter((v) => {
    if (dispensados.includes(v.id)) return false;
    if (v.status === "failed") return true;
    if (v.status === "ready" && v.temCompleto) {
      const desde = (Date.now() - new Date(v.criadoEm).getTime()) / 1000;
      return desde < 60 * 60;
    }
    return v.status !== "ready" || !v.temCompleto;
  });

  if (emFaixa.length === 0 && !erroDaAcao) return null;

  return (
    <div className="space-y-3">
      {erroDaAcao && (
        <p
          className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-300"
          role="alert"
        >
          {erroDaAcao}
        </p>
      )}

      {emFaixa.map((v) => (
        <FaixaDeUmVideo
          key={v.id}
          video={v}
          etapaLocal={etapaLocal[v.id] ?? null}
          agora={agora}
          aoRepetir={(rota) => void executar(v.id, rota)}
          aoDispensar={() => setDispensados((d) => [...d, v.id])}
        />
      ))}
    </div>
  );
}

function FaixaDeUmVideo({
  video: v,
  etapaLocal,
  agora,
  aoRepetir,
  aoDispensar,
}: {
  video: VideoAoVivo;
  etapaLocal: string | null;
  agora: number;
  aoRepetir: (rota: string) => void;
  aoDispensar: () => void;
}) {
  const decorrido = Math.max(0, Math.round((agora - new Date(v.criadoEm).getTime()) / 1000));
  const nome = v.originalName ?? "Gravação";

  // ── Terminou ──────────────────────────────────────────────────────────────
  if (v.status === "ready" && v.temCompleto) {
    const minutos = Math.max(1, Math.round(decorrido / 60));
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-green-500/25 bg-green-500/10 px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <CheckCircle2 className="w-[18px] h-[18px] text-green-400 shrink-0" />
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            <span className="font-semibold">Pronto em {minutos} minutos.</span>{" "}
            {v.cortesQueVaoAoAr} {v.cortesQueVaoAoAr === 1 ? "corte" : "cortes"} e o vídeo completo
            estão no quadro abaixo, com os textos de cada rede.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <p className="text-xs truncate max-w-[220px]" style={{ color: "var(--text-muted)" }}>
            {nome}
          </p>
          <button
            onClick={aoDispensar}
            title="Fechar"
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Falhou ────────────────────────────────────────────────────────────────
  if (v.status === "failed") {
    const acao = proximaAcao(v);
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
        <div className="flex items-start gap-3 min-w-0">
          <AlertCircle className="w-[18px] h-[18px] text-red-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              O processamento de {nome} parou
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {v.error ??
                "A etapa não terminou. O que já ficou pronto continua no quadro e não se perde."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={aoDispensar}>
            Dispensar
          </Button>
          {acao && (
            <Button size="sm" onClick={() => aoRepetir(acao.rota)}>
              <RotateCcw className="w-3.5 h-3.5" />
              {acao.rotulo}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Rodando ───────────────────────────────────────────────────────────────
  const fase = faseDe(v, etapaLocal);
  const restante = Math.max(0, estimativaSegundos(v.durationSec) - decorrido);
  const cortesNoQuadro = v.cortesQueVaoAoAr;

  return (
    <div
      className="rounded-2xl border p-5 space-y-4"
      style={{ background: "var(--bg-card)", borderColor: "var(--accent-orange)" }}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-[34px] h-[34px] rounded-lg border border-orange-500/35 bg-orange-500/10 flex items-center justify-center shrink-0">
            <Video className="w-[17px] h-[17px] text-orange-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {fase === ULTIMA && v.temTrechosComPosts
                ? cortesNoQuadro === 1
                  ? "O corte e os textos já estão no quadro abaixo"
                  : `Os ${cortesNoQuadro} cortes e os textos já estão no quadro abaixo`
                : nome}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {fase === ULTIMA
                ? "Falta o vídeo completo, que é o mais demorado. Você já pode revisar e publicar o resto."
                : FASES[fase].detalhe + "."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p
              className="text-xl font-bold tabular-nums leading-none"
              style={{ color: "var(--text-primary)" }}
            >
              {mmss(decorrido)}
            </p>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              {restante > 30 ? `faltam ~${Math.ceil(restante / 60)} min` : "quase lá"}
            </p>
          </div>
        </div>
      </div>

      <div className="relative grid grid-cols-7">
        <div className="absolute top-[9px] left-[8%] right-[8%] h-0.5" style={{ background: "var(--border)" }} />
        <div
          className="absolute top-[9px] left-[8%] h-0.5 bg-orange-500 transition-all duration-500"
          style={{ width: `${(fase / (FASES.length - 1)) * 84}%` }}
        />
        {FASES.map((f, i) => {
          const pesquisa = i === PESQUISANDO;
          const feita = pesquisa ? Boolean(v.radar) : i < fase;
          const atual = pesquisa ? !feita && v.temTranscricao : i === fase;
          return (
            <div key={f.chave} className="relative flex flex-col items-center gap-2">
              {feita ? (
                // `Check` puro, e não `CheckCircle2`: o ícone com círculo
                // próprio dentro do marco redondo virava círculo dentro de
                // círculo (visto na tela em 02/09).
                <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              ) : (
                <div
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                  style={{
                    borderColor: atual ? "var(--accent-orange)" : "var(--border)",
                    background: "var(--bg-card)",
                  }}
                >
                  {atual && <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />}
                </div>
              )}
              <p
                className="text-xs text-center"
                style={{
                  color: atual
                    ? "var(--accent-orange)"
                    : feita
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                  fontWeight: atual ? 700 : feita ? 600 : 500,
                }}
              >
                {f.rotulo}
              </p>
              <Detalhe indice={i} video={v} fase={fase} />
            </div>
          );
        })}
      </div>

      <div
        className="flex items-center justify-between gap-4 flex-wrap pt-3 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Nada aqui precisa de clique. Cada peça cai no quadro abaixo assim que fica pronta.
        </p>
        {v.temCompleto ? null : (
          <p className="text-xs font-medium text-orange-400">
            O vídeo completo chega por último, e o lugar dele já está guardado no quadro.
          </p>
        )}
      </div>
    </div>
  );
}

/** O número embaixo do marco, quando existe algo verdadeiro para contar. */
function Detalhe({ indice, video: v, fase }: { indice: number; video: VideoAoVivo; fase: number }) {
  let texto: string | null = null;
  if (indice === PESQUISANDO && v.radar)
    texto = `${v.radar.teses} ${v.radar.teses === 1 ? "tese" : "teses"}, ${v.radar.fontes} ${v.radar.fontes === 1 ? "fonte" : "fontes"}`;
  if (indice === 2 && v.trechosEscolhidos > 0)
    texto = `${v.trechosEscolhidos} ${v.trechosEscolhidos === 1 ? "momento" : "momentos"}`;
  if (indice === 3 && v.cortesProntos > 0 && fase === 3)
    texto = `${v.cortesProntos} de ${v.trechosEscolhidos} pronto${v.cortesProntos === 1 ? "" : "s"}`;
  if (indice === 3 && v.cortesProntos > 0 && fase > 3)
    texto = `${v.cortesProntos} ${v.cortesProntos === 1 ? "corte" : "cortes"}`;
  if (indice === ULTIMA && fase === ULTIMA) texto = "montando";
  if (!texto) return null;
  return (
    <p className="text-[10px] -mt-1 text-center" style={{ color: "var(--text-muted)" }}>
      {texto}
    </p>
  );
}
