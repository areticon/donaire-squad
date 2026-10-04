"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, BellRing, Check, CheckCircle2, ChevronDown, ClipboardCheck, Minus, RotateCcw, ShieldCheck, Sparkles, UserRound, Video, WifiOff, X } from "lucide-react";
import { AproveitarRoteiro } from "@/components/video/aproveitar-roteiro";
import { etapaDeRetomada, proximaAcao } from "@/lib/media/video-state";
import { abrirChamado } from "@/lib/suporte/abrir-chamado";
import { segundosDaEdicao } from "@/lib/media/tempos-medidos";
import { lerLinhaDoTempo, linhaQueSoAvanca, mesmaMemoria, type ExtrasDaLinha, type GemeoNaLinha, type LeituraDaLinha, type MemoriaDaLinha, type Passo } from "@/lib/media/linha-do-tempo";
import { CODIGO_DA_ETAPA, pedirLeituraDoSino } from "@/lib/notificacoes/tipos";

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
  /**
   * De onde a contagem parte: a rodada atual (30/09). Igual a `criadoEm` no
   * vídeo que roda uma vez só. Opcional porque a página do servidor pode não
   * trazer; aí vale `criadoEm`.
   */
  inicioDaRodada?: string;
  /**
   * O vídeo completo não veio: o worker avisou a falha, ou a rodada passou do
   * prazo dele. Vira estado explícito com ação, nunca contagem infinita.
   */
  completoFalhou?: boolean;
  /** Quando ficou pronto de verdade. Null enquanto trabalha, e nos videos
   *  anteriores a 08/09. */
  terminadoEm?: string | null;
  originalName: string | null;
  trechosEscolhidos: number;
  cortesProntos: number;
  cortesQueVaoAoAr: number;
  /** Cortes e completo com a edição (montagem) ainda rodando. */
  edicoesEmAndamento?: number;
  /** Estado da montagem do completo (na-fila, dirigindo, ilustrando, gerando, montando, pronto). */
  etapaDoCompleto?: string | null;
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
  /**
   * A tela de roteiro (30/09): existe um roteiro, e ele foi aprovado? Com o
   * roteiro pronto a faixa leva o cliente à tela; antes da aprovação nada é
   * gerado nem cortado.
   */
  roteiro?: { existe: boolean; aprovado: boolean } | null;
  /** O próximo passo é montar (ou terminar) o roteiro, e não cortar. */
  roteiroPendente?: boolean;
  /**
   * A etapa passou do prazo do vigia do servidor (01/10): ele vai retomá-la
   * sozinho na próxima passada, em até um minuto.
   */
  passouDoPrazo?: boolean;
  /**
   * O vigia já retomou a etapa atual nesta rodada: quantas vezes, de quantas,
   * e por quê ("prazo" sem aviso, ou "reiniciado" quando o servidor de vídeo
   * reiniciou no meio).
   */
  retomada?: { n: number; max: number; motivo: string; em: string } | null;
  /**
   * A LINHA DO TEMPO INTEIRA (02/10): a montagem com efeitos, a revisão final
   * e as peças esperando aprovação. Vem da página e da consulta; ver
   * lib/media/linha-do-tempo.ts.
   */
  linha?: ExtrasDaLinha | null;
  /**
   * O VÍDEO DO GÊMEO (02/10): enquanto grava, a linha é dele (status
   * "gemeo", id "gemeo-<id>"); depois de entrar na esteira, as três etapas
   * dele aparecem feitas antes do "Ouvindo".
   */
  gemeo?: GemeoNaLinha | null;
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
 * Quantas consultas seguidas sem resposta antes de dizer "sem conexão" (01/10).
 * Duas, e não uma: uma consulta perdida é oscilação comum e piscar a faixa a
 * cada uma assustaria mais do que ajudaria. Duas são oito segundos sem ouvir o
 * servidor, o que já é queda de verdade.
 */
const FALHAS_PARA_SEM_CONEXAO = 2;

/**
 * AS ETAPAS DA LINHA moram em `lib/media/linha-do-tempo.ts` desde 02/10: eram
 * oito, acabavam no "Vídeo completo" e deixavam de fora a aprovação do
 * roteiro, a montagem com efeitos e a revisão final (a "tarja roxa" depois do
 * fim, no relato do Bruno). Agora são todas, e a faixa só desenha.
 *
 * A PROMESSA DE TEMPO também mudou (02/10): era o alvo de 1,5 min por minuto
 * de gravação (`MINUTOS_POR_MINUTO`), sem a montagem com efeitos nem a
 * revisão final. Agora é o MEDIDO por etapa, pelo alto
 * (lib/media/tempos-medidos.ts): "melhor prometer mais e entregar em menos".
 */
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
  // Roteiro pronto espera o cliente: nada muda sozinho até ele aprovar.
  if (v.status === "roteiro") return false;
  // O completo que falhou para de pedir consulta: nada vai mudar sozinho até
  // alguém pedir de novo, e o pedido já consulta por conta própria.
  // A EDIÇÃO COM EFEITOS E A REVISÃO FINAL (02/10) rodam com o vídeo em
  // "ready" e o completo já presente: antes a consulta parava ali, e a faixa
  // ficava no "montando" até alguém recarregar a página.
  if (v.status === "ready") return (!v.temCompleto && !v.completoFalhou) || (v.temCompleto && !lerLinhaDoTempo(v).fim);
  return true;
}

/** Instante (ms) em que a rodada atual começou. */
function inicioDe(v: VideoAoVivo): number {
  return new Date(v.inicioDaRodada ?? v.criadoEm).getTime();
}

/**
 * O que conta como "o estado mudou" (02/10): o status do banco e, com o vídeo
 * em "ready", o passo da edição com efeitos e da revisão. Sem isto, o fim da
 * montagem do completo não recarregava o quadro.
 */
function assinaturaDoEstado(v: VideoAoVivo): string {
  const l = lerLinhaDoTempo(v);
  return `${v.status}|${v.temCompleto ? 1 : 0}|${l.passos[l.atual]?.chave ?? ""}|${l.fim ? 1 : 0}`;
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
  /**
   * O AVISO DO VIGIA, FIXO POR ETAPA (02/10, incidente das 21h): o texto do
   * "passou do tempo normal" ou da retomada fica o mesmo enquanto a etapa for
   * a mesma, mesmo que uma consulta venha sem ele (o vigia acabou de retomar
   * e `passouDoPrazo` voltou a falso). Sem isto a tarja piscava a cada 4 s.
   * Só troca quando chega um aviso NOVO (retomada) ou a etapa muda.
   */
  const avisosFixos = useRef<Record<string, { etapa: string; texto: string }>>({});
  const avisoDaEtapa = (v: VideoAoVivo): string | null => {
    const etapa = v.status;
    const novo = v.retomada
      ? v.retomada.motivo === "reiniciado"
        ? `Nossos servidores de vídeo foram atualizados no meio desta etapa, e ela foi retomada de onde parou (tentativa ${v.retomada.n} de ${v.retomada.max}).`
        : `Ela demorou mais que o normal e foi retomada sozinha (tentativa ${v.retomada.n} de ${v.retomada.max}).`
      : v.passouDoPrazo
        ? "Ela passou do tempo normal; o servidor confere e retoma sozinho, do ponto onde parou."
        : null;
    const guardado = avisosFixos.current[v.id];
    if (guardado && guardado.etapa !== etapa) delete avisosFixos.current[v.id];
    if (novo && (!guardado || guardado.etapa !== etapa || v.retomada)) avisosFixos.current[v.id] = { etapa, texto: novo };
    return avisosFixos.current[v.id]?.texto ?? null;
  };
  /**
   * "APROVEITAR O ROTEIRO" aberto para qual vídeo (02/10). Abre pelo botão da
   * faixa pronta ou pelo link do aviso e do e-mail (?aproveitar=<id>), lido
   * depois de montar para não divergir do desenho do servidor.
   */
  const [aproveitar, setAproveitar] = useState<string | null>(null);
  // Reativo: o clique no sino estando já no Gestor muda só a busca da URL.
  const aproveitarDoLink = useSearchParams().get("aproveitar");
  useEffect(() => {
    if (aproveitarDoLink) setAproveitar(aproveitarDoLink);
  }, [aproveitarDoLink]);
  const [agora, setAgora] = useState(() => Date.now());
  /**
   * SEM CONEXÃO (01/10, pedido do Bruno depois do incidente): a internet dele
   * caiu no meio de um corte, e a tela continuou dizendo "passou do previsto"
   * como se fosse o vídeo que travou. A edição nunca dependeu da aba, e a faixa
   * precisa dizer isso. Liga pelo evento `offline` do navegador ou por consultas
   * seguidas sem resposta; desliga no `online` ou na primeira consulta que volta.
   */
  const [semConexao, setSemConexao] = useState(false);
  const falhasSeguidas = useRef(0);

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
    statusConhecidos.current = Object.fromEntries(videos.map((v) => [v.id, assinaturaDoEstado(v)]));
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
      // Resposta do servidor, mesmo com erro, prova que a conexão existe.
      falhasSeguidas.current = 0;
      setSemConexao(false);
      if (!r.ok) return;
      const { videos: frescos } = (await r.json()) as { videos: VideoAoVivo[] };
      // Só avisa o quadro quando um status realmente mudou. Sem esta guarda
      // seria uma recarga da semana a cada quatro segundos, para sempre.
      // Desde 02/10 a "assinatura" inclui a edição com efeitos: ela anda com o
      // vídeo parado em "ready", e o card do completo precisa ver o fim dela.
      const mudou = frescos.some(
        (v) =>
          statusConhecidos.current[v.id] !== undefined &&
          statusConhecidos.current[v.id] !== assinaturaDoEstado(v)
      );
      setVideos(frescos);
      aoMudar(frescos, mudou);
      if (mudou) {
        // ERRO GRAVADO QUE NINGUÉM APAGA VIRA MENTIRA NA TELA (02/10): o aviso
        // de uma ação que falhou some quando o vídeo anda, em vez de ficar em
        // cima da faixa dizendo o contrário do que ela mostra.
        setErroDaAcao(null);
        // O sino olha de novo: a mudança costuma ser um aviso novo.
        pedirLeituraDoSino();
      }
    } catch {
      // Uma consulta que falha não vira aviso: a próxima tenta em quatro
      // segundos. Só a sequência (ou o navegador dizendo que está offline)
      // acende a faixa de sem conexão.
      falhasSeguidas.current += 1;
      if (falhasSeguidas.current >= FALHAS_PARA_SEM_CONEXAO) setSemConexao(true);
    }
  }, [projectId, aoMudar]);

  // O navegador avisa quando a rede cai e quando volta. Na volta, consulta NA
  // HORA (sem esperar o próximo ciclo de quatro segundos): quem estava olhando
  // a faixa parada quer ver o estado real assim que a internet voltar.
  useEffect(() => {
    const caiu = () => setSemConexao(true);
    const voltou = () => {
      falhasSeguidas.current = 0;
      setSemConexao(false);
      void consultar();
    };
    // Depois de montar, e não no estado inicial: o servidor não sabe se o
    // navegador está online, e ler `navigator` no desenho quebraria a hidratação.
    if (typeof navigator !== "undefined" && navigator.onLine === false) caiu();
    window.addEventListener("offline", caiu);
    window.addEventListener("online", voltou);
    return () => {
      window.removeEventListener("offline", caiu);
      window.removeEventListener("online", voltou);
    };
  }, [consultar]);

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
          const corpo = (await r.json().catch(() => ({}))) as { error?: string; jaEmAndamento?: boolean };
          // "A ETAPA JÁ COMEÇOU" NÃO É ERRO (02/10). Era o "Outra aba já
          // começou a transcrever este vídeo." que o Bruno leu com uma aba só:
          // quem tinha começado era o servidor, no aviso de upload concluído.
          // Quem chega depois só consulta o estado, que já mostra a etapa.
          if (!corpo.jaEmAndamento) setErroDaAcao(corpo.error ?? `A plataforma recusou com código ${r.status}.`);
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

      // A TRANSCRIÇÃO É DO SERVIDOR (02/10): o aviso de upload concluído já a
      // começa (upload/route.ts). A tela pedia a mesma coisa no mesmo segundo,
      // perdia a corrida e mostrava "Outra aba já começou a transcrever este
      // vídeo." com uma aba só. Agora a tela só cura, como nas outras etapas:
      // depois de 20 s parado em "uploaded", e em silêncio. Os 20 s cobrem o
      // dev local, onde o aviso do storage não chega e a tela é quem começa.
      if (v.status === "uploaded") {
        if (parado > 20) {
          disparados.current.add(chave);
          void executar(v.id, "transcribe", { silencioso: true });
        }
        continue;
      }
      // "selected" sem roteiro aprovado cura pelo ROTEIRO (30/09): a rota de
      // corte recusa cortar o que o cliente não aprovou.
      const cura =
        v.status === "transcribed"
          ? "select"
          : v.status === "selected"
            ? v.roteiroPendente
              ? "roteiro"
              : "cortar"
            : null;
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
   * Quais gravações merecem cartão.
   *
   * As em andamento sempre. As que esperam o cliente (roteiro, peças, falha)
   * também. As prontas ficam por três dias (03/10): no primeiro dia na lista
   * "Prontos", depois num "ver anteriores" recolhido, e então somem. Antes a
   * pronta sumia em uma hora e as peças esperando, em um dia, e a pessoa que
   * voltava no dia seguinte não achava o que ainda pedia o ok dela.
   */
  const emFaixa = videos.filter((v) => {
    if (dispensados.includes(v.id)) return false;
    if (v.status === "failed") return true;
    if (v.status === "ready" && v.temCompleto) {
      // A edição ainda rodando mantém o cartão, por mais que demore: efeitos,
      // revisão final e consertos (02/10) contam como edição.
      const linha = lerLinhaDoTempo(v);
      if (!linha.fim) return true;
      return idadeDoPronto(v) < JANELA_DOS_PRONTOS_S;
    }
    // O completo que não veio aparece enquanto a rodada é recente: vídeo de
    // semanas atrás sem completo não ressurge na faixa de hoje.
    if (v.completoFalhou) return (Date.now() - inicioDe(v)) / 1000 < 24 * 60 * 60;
    return v.status !== "ready" || !v.temCompleto;
  });

  /**
   * A ETAPA EXIBIDA SÓ AVANÇA (03/10), agora guardada AQUI, por vídeo, e não
   * dentro de cada cartão: o agrupamento ("Precisa de você", "Em andamento",
   * "Prontos") precisa da mesma leitura que o cartão desenha, senão o vídeo
   * podia estar num grupo e o cartão dizer outra coisa. Estado derivado da
   * renderização anterior: só regrava quando alguma memória mudou de fato.
   */
  const [memorias, setMemorias] = useState<Record<string, MemoriaDaLinha>>({});
  const leituras: Record<string, LeituraDaLinha> = {};
  let memoriasNovas: Record<string, MemoriaDaLinha> | null = null;
  for (const v of emFaixa) {
    const anterior = memorias[v.id] ?? null;
    const { leitura, memoria } = linhaQueSoAvanca(lerLinhaDoTempo(v, etapaLocal[v.id] ?? null), anterior, `${v.id}:${v.inicioDaRodada ?? v.criadoEm}`);
    leituras[v.id] = leitura;
    if (!mesmaMemoria(anterior, memoria)) (memoriasNovas ??= { ...memorias })[v.id] = memoria;
  }
  if (memoriasNovas) setMemorias(memoriasNovas);

  /** Grupos recolhidos pelo cliente nesta visita. */
  const [recolhidos, setRecolhidos] = useState<Record<Grupo, boolean>>({ voce: false, andamento: false, prontos: false });
  const [anterioresAbertos, setAnterioresAbertos] = useState(false);

  if (emFaixa.length === 0 && !erroDaAcao && !aproveitar) return null;

  // A faixa de sem conexão só faz sentido com algo andando: é ela que diz ao
  // cliente que o trabalho continua do lado de cá.
  const mostrarSemConexao = semConexao && emFaixa.some(emAndamento);

  // ── OS GRUPOS (03/10, "tem 3 linhas do tempo aqui, que confusão") ─────────
  // Um cartão compacto por vídeo, e os cartões juntos pelo que pedem: primeiro
  // o que espera o cliente, depois o que está andando, por fim o que ficou pronto.
  const porGrupo: Record<Grupo, VideoAoVivo[]> = { voce: [], andamento: [], prontos: [] };
  for (const v of emFaixa) porGrupo[grupoDe(v, leituras[v.id])].push(v);
  const pesoNaFila = (v: VideoAoVivo) =>
    v.status === "failed" || (v.completoFalhou && !v.temCompleto) ? 0 : leituras[v.id].esperandoVoce === "roteiro" ? 1 : 2;
  porGrupo.voce.sort((a, b) => pesoNaFila(a) - pesoNaFila(b) || inicioDe(a) - inicioDe(b));
  porGrupo.andamento.sort((a, b) => inicioDe(a) - inicioDe(b));
  porGrupo.prontos.sort((a, b) => idadeDoPronto(a) - idadeDoPronto(b));
  const prontosRecentes = porGrupo.prontos.filter((v) => idadeDoPronto(v) < 24 * 60 * 60);
  const prontosAnteriores = porGrupo.prontos.filter((v) => idadeDoPronto(v) >= 24 * 60 * 60);

  // AS MENSAGENS QUE SE REPETIAM EM CADA VÍDEO, UMA VEZ SÓ, no topo da lista.
  const podeSair = porGrupo.voce.length === 0 && porGrupo.andamento.some((v) => leituras[v.id].podeSair);
  const andandoSemCompleto = porGrupo.andamento.some((v) => !v.temCompleto);
  const pecasEsperando = porGrupo.voce.some((v) => leituras[v.id].esperandoVoce === "pecas");
  const algumGemeoGravando = porGrupo.andamento.some((v) => leituras[v.id].relogio === "gemeo");

  const cartao = (v: VideoAoVivo) => (
    <CartaoDoVideo
      key={v.id}
      projectId={projectId}
      video={v}
      linha={leituras[v.id]}
      agora={agora}
      semConexao={semConexao}
      aoRepetir={(rota) => void executar(v.id, rota)}
      aoDispensar={() => {
        // Some da tela na hora; o vídeo que parou é apagado de vez no servidor
        // (03/10), para não voltar ao recarregar.
        setDispensados((d) => [...d, v.id]);
        if (v.status === "failed") void fetch(`/api/videos/${v.id}/dispensar`, { method: "POST" }).catch(() => {});
      }}
      aoAproveitar={() => setAproveitar(v.id)}
      avisoFixo={avisoDaEtapa(v)}
    />
  );
  const alternar = (g: Grupo) => setRecolhidos((r) => ({ ...r, [g]: !r[g] }));

  return (
    <div className="space-y-3" data-esteira>
      {mostrarSemConexao && (
        <div
          className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3"
          role="status"
          aria-live="polite"
          data-faixa="sem-conexao"
        >
          <WifiOff className="w-[18px] h-[18px] text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            <span className="font-semibold">Sem conexão com a internet.</span>{" "}
            A edição continua nos nossos servidores; quando a conexão voltar, a tela atualiza sozinha.
          </p>
        </div>
      )}
      {erroDaAcao && (
        <p
          className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-300"
          role="alert"
        >
          {erroDaAcao}
        </p>
      )}

      {emFaixa.length > 0 && (
        <section
          className="rounded-2xl border p-3 sm:p-4 space-y-3"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          aria-label="Seus vídeos em produção"
        >
          <div className="flex items-baseline justify-between gap-x-3 gap-y-0.5 flex-wrap">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Seus vídeos
            </h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {[
                porGrupo.voce.length ? `${porGrupo.voce.length} ${porGrupo.voce.length === 1 ? "precisa" : "precisam"} de você` : null,
                porGrupo.andamento.length ? `${porGrupo.andamento.length} em andamento` : null,
                porGrupo.prontos.length ? `${porGrupo.prontos.length} ${porGrupo.prontos.length === 1 ? "pronto" : "prontos"}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          {/* UMA VEZ SÓ (03/10): antes "Pode fechar esta tela", "Nada sai nas
              redes sem o seu ok" e "o vídeo completo chega por último" se
              repetiam dentro de cada vídeo. */}
          {(podeSair || pecasEsperando || andandoSemCompleto) && (
            <ul className="space-y-1.5 rounded-xl px-3 py-2.5" style={{ background: "var(--realce-1)" }} data-avisos-da-lista>
              {podeSair && (
                <li className="flex items-start gap-2 text-xs" style={{ color: "var(--text-primary)" }} data-pode-sair>
                  <BellRing className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                  <span>
                    <span className="font-semibold">Pode fechar esta tela.</span>{" "}
                    <span style={{ color: "var(--text-muted)" }}>Vamos te avisar aqui e por e-mail quando precisarmos de você ou quando estiver pronto.</span>
                  </span>
                </li>
              )}
              {pecasEsperando && (
                <li className="flex items-start gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <ShieldCheck className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                  <span>Nada sai nas redes sem o seu ok.</span>
                </li>
              )}
              {andandoSemCompleto && (
                <li className="flex items-start gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <Video className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                  <span>
                    {algumGemeoGravando ? "O vídeo do gêmeo entra na edição como uma gravação sua. " : ""}
                    Cada peça cai no quadro abaixo assim que fica pronta; o vídeo completo chega por último, e o lugar dele já está guardado.
                  </span>
                </li>
              )}
            </ul>
          )}

          {porGrupo.voce.length > 0 && (
            <GrupoDaLista grupo="voce" titulo="Precisa de você" quantos={porGrupo.voce.length} recolhido={recolhidos.voce} aoAlternar={() => alternar("voce")}>
              {porGrupo.voce.map(cartao)}
            </GrupoDaLista>
          )}
          {porGrupo.andamento.length > 0 && (
            <GrupoDaLista grupo="andamento" titulo="Em andamento" quantos={porGrupo.andamento.length} recolhido={recolhidos.andamento} aoAlternar={() => alternar("andamento")}>
              {porGrupo.andamento.map(cartao)}
            </GrupoDaLista>
          )}
          {porGrupo.prontos.length > 0 && (
            <GrupoDaLista grupo="prontos" titulo="Prontos" quantos={porGrupo.prontos.length} recolhido={recolhidos.prontos} aoAlternar={() => alternar("prontos")}>
              {prontosRecentes.map(cartao)}
              {prontosAnteriores.length > 0 &&
                (anterioresAbertos || prontosRecentes.length === 0 ? (
                  prontosAnteriores.map(cartao)
                ) : (
                  <button
                    type="button"
                    onClick={() => setAnterioresAbertos(true)}
                    className="w-full rounded-lg border border-dashed px-3 py-2 text-xs font-semibold text-left hover:border-orange-500/60 transition-colors"
                    style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                    data-ver-anteriores
                  >
                    Ver anteriores ({prontosAnteriores.length})
                  </button>
                ))}
            </GrupoDaLista>
          )}
        </section>
      )}

      {aproveitar && (
        <AproveitarRoteiro
          key={aproveitar}
          projectId={projectId}
          videoId={aproveitar}
          nome={videos.find((x) => x.id === aproveitar)?.originalName ?? null}
          aoFechar={() => {
            setAproveitar(null);
            // Tira o ?aproveitar= da barra, para recarregar não abrir de novo
            // (o history do Next acompanha a troca e o parâmetro some).
            const u = new URL(window.location.href);
            if (u.searchParams.has("aproveitar")) {
              u.searchParams.delete("aproveitar");
              window.history.replaceState(window.history.state, "", u.toString());
            }
          }}
        />
      )}
    </div>
  );
}

type Grupo = "voce" | "andamento" | "prontos";

/** Por quanto tempo o vídeo pronto fica na lista (três dias). */
const JANELA_DOS_PRONTOS_S = 3 * 24 * 60 * 60;

/** Há quantos segundos o vídeo ficou pronto (sem `terminadoEm`, desde a rodada). */
function idadeDoPronto(v: VideoAoVivo): number {
  const fim = v.terminadoEm ? new Date(v.terminadoEm).getTime() : inicioDe(v);
  return (Date.now() - fim) / 1000;
}

function grupoDe(v: VideoAoVivo, l: LeituraDaLinha): Grupo {
  if (v.status === "failed" || (v.completoFalhou && !v.temCompleto) || l.esperandoVoce) return "voce";
  if (l.fim) return "prontos";
  return "andamento";
}

/** Um grupo da lista, com o cabeçalho que recolhe e abre. */
function GrupoDaLista({
  grupo,
  titulo,
  quantos,
  recolhido,
  aoAlternar,
  children,
}: {
  grupo: Grupo;
  titulo: string;
  quantos: number;
  recolhido: boolean;
  aoAlternar: () => void;
  children: ReactNode;
}) {
  const destaque = grupo === "voce";
  return (
    <div
      className={destaque ? "rounded-xl border p-2 sm:p-2.5 space-y-2" : "space-y-2"}
      style={destaque ? { borderColor: "color-mix(in srgb, #f59e0b 55%, transparent)", background: "color-mix(in srgb, #f59e0b 7%, transparent)" } : undefined}
      data-grupo={grupo}
    >
      <button type="button" onClick={aoAlternar} aria-expanded={!recolhido} className="flex w-full items-center gap-2 px-1 py-0.5 text-left">
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${recolhido ? "-rotate-90" : ""}`} style={{ color: "var(--text-muted)" }} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: destaque ? "#d97706" : "var(--text-muted)" }}>
          {titulo}
        </span>
        <span
          className="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
          style={destaque ? { background: "#f59e0b", color: "#fff" } : { background: "var(--realce-2)", color: "var(--text-muted)" }}
        >
          {quantos}
        </span>
      </button>
      {!recolhido && <div className="space-y-2">{children}</div>}
    </div>
  );
}

/** O nome do vídeo para ler: sem a extensão do arquivo e sem o prefixo do gêmeo. */
function tituloDoVideo(v: VideoAoVivo): { titulo: string; gemeo: boolean } {
  const bruto = (v.originalName ?? "Gravação").replace(/\.(mp4|mov|m4v|webm|mkv|avi)$/i, "").trim();
  const m = bruto.match(/^Gêmeo digital\s*[-:–]\s*(.+)$/i);
  return { titulo: m ? m[1] : bruto || "Gravação", gemeo: Boolean(m || v.gemeo || v.status === "gemeo") };
}

/** A etapa atual em linguagem simples, para a linha "Etapa N de M: ...". */
function etapaEmPalavras(p: Passo | undefined): string {
  if (!p) return "";
  if (p.estado === "falhou") return `parou em ${p.rotulo.toLowerCase()}`;
  switch (p.chave) {
    case "gemeo-voz":
      return "gravando a sua voz";
    case "gemeo-pedacos":
      return "gerando o vídeo com o seu rosto";
    case "gemeo-juntar":
      return "juntando os pedaços do vídeo";
    case "ouvindo":
      return "ouvindo a gravação";
    case "pesquisando":
      return "pesquisando o seu tema";
    case "escolhendo":
      return "escolhendo os melhores trechos";
    case "roteiro":
      return "escrevendo o roteiro da edição";
    case "aprovar-roteiro":
      return p.estado === "voce" ? "o roteiro espera a sua aprovação" : "recebendo a sua aprovação";
    case "cortando":
      return "cortando os vídeos curtos";
    case "capas":
      return "montando as capas";
    case "escrevendo":
      return "escrevendo os textos de cada rede";
    case "edicao-da-fala":
      return "editando a fala do vídeo inteiro";
    case "efeitos":
      return "criando os efeitos";
    case "montagem":
      return "montando com abertura, legenda e som";
    case "revisao":
      return "conferindo o vídeo quadro a quadro";
    case "pronto":
      return "vídeo completo pronto";
    case "aprovar-pecas":
      return p.estado === "voce" ? "as peças esperam a sua aprovação" : "tudo aprovado";
  }
}

const maiuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Leva o cliente ao quadro da semana, onde as peças se aprovam. */
function irAoQuadro() {
  document.getElementById("quadro-da-semana")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * UM CARTÃO POR VÍDEO (03/10). Antes cada vídeo era uma faixa inteira, com 14
 * a 17 marcos lado a lado, título, parágrafo e rodapé; três vídeos viravam
 * três linhas do tempo empilhadas e o Bruno não sabia qual era qual. Agora o
 * cartão diz em uma ou duas linhas: qual vídeo, onde está (barra e "Etapa N de
 * M"), quanto falta, e o botão quando a vez é do cliente. A linha do tempo
 * inteira, o "Agora:" e a promessa de tempo ficam no "ver etapas".
 */
function CartaoDoVideo({
  projectId,
  video: v,
  linha,
  agora,
  semConexao,
  aoRepetir,
  aoDispensar,
  aoAproveitar,
  avisoFixo,
}: {
  projectId: string;
  video: VideoAoVivo;
  /** A leitura que só avança, guardada pelo pai (linhaQueSoAvanca). */
  linha: LeituraDaLinha;
  agora: number;
  semConexao: boolean;
  aoRepetir: (rota: string) => void;
  aoDispensar: () => void;
  /** Abre o "Aproveitar o roteiro" deste vídeo (02/10). */
  aoAproveitar: () => void;
  /** O aviso do vigia desta etapa, fixo até a etapa mudar (sem piscar). */
  avisoFixo: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  // Conta da RODADA atual, e não do envio (30/09): o vídeo refeito contava do
  // envio original e mostrou 196 minutos.
  const decorrido = Math.max(0, Math.round((agora - inicioDe(v)) / 1000));
  const nome = v.originalName ?? "Gravação";
  const { titulo, gemeo } = tituloDoVideo(v);

  const falhou = v.status === "failed";
  const completoFalhou = Boolean(v.completoFalhou && !v.temCompleto) && !falhou;
  const esperando = linha.esperandoVoce;
  const pronto = linha.fim && !esperando && !falhou && !completoFalhou;
  const passoAtual = linha.passos[linha.atual];
  const n = linha.passos.length;

  // ── O relógio (a mesma conta de antes, agora numa linha) ─────────────────
  // O total é a promessa MEDIDA pelo alto; o número só desce e, passada a
  // promessa, só sobe ("passou do previsto em N min"), nunca parado.
  const total = linha.totalSegundos;
  const atraso = decorrido - total;
  const atrasou = atraso > 0;
  const restante = Math.max(total - decorrido, 0);
  const atrasandoNaEtapa = !atrasou && total - decorrido < linha.restaDepoisDoAtualSegundos;
  const minutosDaEdicao = Math.ceil(
    segundosDaEdicao(v.durationSec, { efeitos: Boolean(v.linha?.efeitosLigados), revisao: Boolean(v.linha?.revisaoLigada) }) / 60
  );
  // O relógio PARA quando a esteira termina (08/09): sem `terminadoEm` (vídeos
  // antigos) fica o decorrido, que ao menos não mente sobre a ordem de grandeza.
  const ateOFim = v.terminadoEm ? Math.max(0, Math.round((new Date(v.terminadoEm).getTime() - inicioDe(v)) / 1000)) : decorrido;
  const avisoDoVigia = semConexao ? null : avisoFixo;
  const codigoDaFalha = falhou ? CODIGO_DA_ETAPA[etapaDeRetomada(v)] : null;
  const acaoDaFalha = falhou ? proximaAcao(v) : null;

  // ── A barra única: quantas etapas já ficaram para trás ───────────────────
  const feitas = linha.passos.filter((p) => p.estado === "feito" || p.estado === "pulado").length;
  const fracao = pronto ? 1 : Math.min(1, Math.max(feitas, linha.atual) / Math.max(1, n));
  const corDaBarra = falhou || completoFalhou ? "#ef4444" : esperando ? "#f59e0b" : pronto ? "#22c55e" : "var(--accent-orange)";

  // ── A linha de baixo, em palavras ────────────────────────────────────────
  const etapaTexto = falhou
    ? `Parou em ${(passoAtual?.rotulo ?? "uma etapa").toLowerCase()}`
    : completoFalhou
      ? "O vídeo completo não ficou pronto"
      : pronto
        ? `Pronto em ${Math.max(1, Math.round(ateOFim / 60))} min`
        : `Etapa ${linha.atual + 1} de ${n}: ${maiuscula(etapaEmPalavras(passoAtual))}`;
  const complemento = falhou
    ? null
    : completoFalhou
      ? "os cortes e os textos estão salvos"
      : pronto
        ? `${v.cortesQueVaoAoAr} ${v.cortesQueVaoAoAr === 1 ? "corte" : "cortes"} e o vídeo completo no quadro`
        : esperando === "roteiro"
          ? `a edição leva até ${minutosDaEdicao} min depois`
          : esperando === "pecas"
            ? (v.linha?.postsParaAprovar ?? 0) > 0
              ? `${v.linha!.postsParaAprovar} no quadro abaixo`
              : null
            : null;

  // ── O relógio de quem está andando ───────────────────────────────────────
  const relogio = !pronto && !esperando && !falhou && !completoFalhou;
  const rotuloDoRelogio = semConexao
    ? "sem conexão, última previsão"
    : atrasou
      ? "passou do previsto em"
      : v.retomada
        ? "retomada, faltam até"
        : linha.relogio === "gemeo"
          ? "gêmeo pronto em até"
          : linha.relogio === "roteiro"
            ? "roteiro em até"
            : "tudo pronto em até";

  // ── O botão da vez do cliente ─────────────────────────────────────────────
  const classeDoPrincipal =
    "inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 transition-colors whitespace-nowrap";
  const classeDoSecundario =
    "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold hover:border-orange-500/60 transition-colors whitespace-nowrap";
  const principal = falhou ? (
    acaoDaFalha ? (
      <button type="button" onClick={() => aoRepetir(acaoDaFalha.rota)} className={classeDoPrincipal}>
        <RotateCcw className="w-3.5 h-3.5" />
        {acaoDaFalha.rotulo}
      </button>
    ) : null
  ) : completoFalhou ? (
    <button type="button" onClick={() => aoRepetir("refazer-completo")} className={classeDoPrincipal}>
      <RotateCcw className="w-3.5 h-3.5" />
      Refazer o vídeo completo
    </button>
  ) : esperando === "roteiro" ? (
    <Link href={`/projects/${projectId}/video/${v.id}/roteiro`} className={classeDoPrincipal} data-acao="aprovar-roteiro">
      <ClipboardCheck className="w-3.5 h-3.5" />
      Revisar e aprovar o roteiro
    </Link>
  ) : esperando === "pecas" ? (
    <button type="button" onClick={irAoQuadro} className={classeDoPrincipal} data-acao="aprovar-pecas">
      <ClipboardCheck className="w-3.5 h-3.5" />
      Aprovar as peças
    </button>
  ) : null;

  const tipoDeFaixa = falhou ? "falhou" : completoFalhou ? "completo-falhou" : pronto ? "pronto" : "linha-do-tempo";
  const Icone = falhou || completoFalhou ? AlertCircle : pronto ? CheckCircle2 : gemeo ? UserRound : Video;
  const corDoIcone = falhou ? "text-red-400" : completoFalhou ? "text-orange-400" : pronto ? "text-green-500" : esperando ? "text-amber-500" : "text-orange-500";
  const dispensavel = pronto || esperando === "pecas" || falhou || completoFalhou;

  return (
    <div
      className="relative rounded-xl border px-3 py-3 sm:px-4"
      style={{
        background: "var(--bg-card)",
        borderColor: falhou ? "rgba(239,68,68,.45)" : esperando || completoFalhou ? "color-mix(in srgb, #f59e0b 60%, transparent)" : "var(--border)",
      }}
      data-faixa={tipoDeFaixa}
      data-etapa={passoAtual?.chave}
      data-video={v.id}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className="w-9 h-9 rounded-lg border flex items-center justify-center shrink-0"
            style={{ borderColor: "var(--border)", background: "var(--realce-1)" }}
            title={gemeo ? "Vídeo do gêmeo digital" : "Gravação enviada por você"}
          >
            <Icone className={`w-[18px] h-[18px] ${corDoIcone}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={`text-[13px] sm:text-sm font-semibold leading-snug line-clamp-2 sm:line-clamp-1 break-words ${dispensavel ? "pr-6 sm:pr-0" : ""}`}
              style={{ color: "var(--text-primary)" }}
              title={nome}
            >
              {titulo}
            </p>
            <div
              className="mt-1.5 h-1 w-full rounded-full overflow-hidden"
              style={{ background: "var(--realce-2)" }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={n}
              aria-valuenow={pronto ? n : feitas}
              aria-label={etapaTexto}
            >
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.round(fracao * 100)}%`, background: corDaBarra }} />
            </div>
            <p className="mt-1.5 text-xs leading-snug" style={{ color: "var(--text-muted)" }} data-etapa-resumo>
              {gemeo ? <span>Gêmeo digital · </span> : null}
              <span className="font-medium" style={{ color: esperando ? "#d97706" : falhou ? "#ef4444" : "var(--text-primary)" }}>
                {etapaTexto}
              </span>
              {complemento ? <span> · {complemento}</span> : null}
              {codigoDaFalha ? <span className="font-mono"> · Código {codigoDaFalha}</span> : null}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:shrink-0">
          {relogio && (
            <div className="mr-auto sm:mr-0 sm:text-right pl-12 sm:pl-0" data-relogio>
              <p className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>
                {rotuloDoRelogio}
              </p>
              {/* O relógio é desenhado no servidor e de novo no navegador, com
                  um ou dois segundos de diferença: o aviso de hidratação aqui
                  seria falso alarme (visto na prova de 01/10). */}
              <p className="text-base font-bold tabular-nums leading-tight" style={{ color: "var(--text-primary)" }} suppressHydrationWarning>
                {atrasou && !semConexao ? `${Math.max(1, Math.ceil(atraso / 60))} min` : mmss(restante)}
              </p>
            </div>
          )}
          {principal}
          {/* APROVEITAR O ROTEIRO (02/10): o vídeo terminou, a pergunta de
              gerar mais peças a partir dele. */}
          {(pronto || esperando === "pecas") && (
            <button
              type="button"
              onClick={aoAproveitar}
              className={`${classeDoSecundario} ${pronto ? "flex-1 sm:flex-none" : ""}`}
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
              data-botao-aproveitar
              title="Aproveitar o roteiro"
            >
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              <span className={esperando === "pecas" ? "hidden min-[400px]:inline" : ""}>Aproveitar o roteiro</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setAberto((a) => !a)}
            aria-expanded={aberto}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold hover:bg-[var(--realce-2)] transition-colors whitespace-nowrap"
            style={{ color: "var(--text-muted)" }}
            data-ver-etapas
          >
            {falhou || completoFalhou ? "detalhes" : "etapas"}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${aberto ? "rotate-180" : ""}`} />
          </button>
          {dispensavel && (
            <button
              type="button"
              onClick={aoDispensar}
              title={falhou || completoFalhou ? "Dispensar" : "Tirar da lista"}
              aria-label={falhou || completoFalhou ? "Dispensar" : "Tirar da lista"}
              // No celular o X sobe para o canto do cartão: na fileira dos
              // botões ele passava da borda em 360 px.
              className="absolute right-1.5 top-1.5 sm:static p-1.5 rounded-lg hover:bg-[var(--realce-2)] transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {aberto && (
        <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: "var(--border)" }} data-etapas-abertas>
          {(falhou || completoFalhou) && (
            <div className="text-xs space-y-1.5" style={{ color: "var(--text-muted)" }}>
              <p>
                {falhou
                  ? v.error ?? "A etapa não terminou. O que já ficou pronto continua no quadro e não se perde."
                  : `${v.error?.includes("completo:") ? "A montagem da gravação inteira falhou no meio do caminho." : "A montagem da gravação inteira passou muito do tempo previsto."} Os cortes e os textos já estão no quadro e não se perdem. Dá para refazer só o vídeo completo, sem mexer no resto.`}
              </p>
              {/* O CÓDIGO E O CHAMADO (02/10): o mesmo código do aviso no sino,
                  para a pessoa informar sem descrever o erro. */}
              {codigoDaFalha && (
                <button
                  type="button"
                  onClick={() => abrirChamado({ categoria: "problema", codigo: codigoDaFalha, texto: `O processamento de ${nome} parou.` })}
                  className="font-semibold text-orange-400 hover:underline"
                >
                  Abrir chamado
                </button>
              )}
            </div>
          )}

          <LinhaDetalhada linha={linha} />

          {/* O QUE ESTÁ ACONTECENDO AGORA, numa frase (02/10). */}
          {relogio && (
            <p className="text-xs" style={{ color: "var(--text-primary)" }} data-agora>
              <span className="font-semibold">Agora:</span> {linha.agora}
              {avisoDoVigia ? (
                <span style={{ color: "var(--text-muted)" }} data-retomada> {avisoDoVigia}</span>
              ) : (atrasou || atrasandoNaEtapa) && !semConexao ? (
                <span style={{ color: "var(--text-muted)" }}> Esta etapa está levando mais que o previsto, e segue andando.</span>
              ) : null}
            </p>
          )}

          {/* A PROMESSA DITA NO INÍCIO, com o número deste vídeo (30/09),
              medida pelo alto e com todas as etapas dentro (02/10). */}
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {linha.relogio === "gemeo" && relogio ? (
              <>Primeiro o seu gêmeo grava o vídeo (até {Math.ceil(total / 60)} min). Depois ele entra na edição como uma gravação sua, com o roteiro para você aprovar.</>
            ) : linha.relogio === "roteiro" && relogio ? (
              <>
                Primeiro eu preparo o roteiro da edição para você aprovar (até {Math.ceil(total / 60)} min).
                {v.durationSec
                  ? ` Depois da sua aprovação, a edição inteira deste vídeo, com efeitos, abertura e revisão final, leva até ${minutosDaEdicao} min.`
                  : " Depois da sua aprovação vem a edição inteira, com efeitos, abertura e revisão final."}
              </>
            ) : esperando === "roteiro" ? (
              <>
                Separei {v.trechosEscolhidos} {v.trechosEscolhidos === 1 ? "corte possível" : "cortes possíveis"}, com a fala exata e as cenas planejadas. Escolha os que vão ao
                ar (até 8) e aprove: só depois disso eu gero imagens, cenas e cortes. Nada é gerado nem cobrado além do roteiro antes da sua aprovação.
              </>
            ) : esperando === "pecas" ? (
              <>{linha.agora} Assista, ajuste o que quiser e aprove para agendar.</>
            ) : relogio ? (
              <>A edição inteira deste vídeo, com efeitos, abertura e revisão final, leva até {Math.ceil(total / 60)} min.</>
            ) : pronto ? (
              <>Os cortes e o vídeo completo estão no quadro abaixo, com os textos de cada rede.</>
            ) : null}
          </p>

          {/* "Voltar à edição" (30/09, pedido do Bruno): reabre o roteiro do
              vídeo aprovado para corrigir palavra, bordas e cenas, e refazer
              só o que mudou. */}
          {(pronto || esperando === "pecas") && (
            <Link
              href={`/projects/${projectId}/video/${v.id}/roteiro?editar=1`}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:border-orange-500/60 transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <ClipboardCheck className="w-3.5 h-3.5 text-orange-400" />
              Voltar à edição
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A linha do tempo inteira, atrás do "etapas" (03/10): no computador os
 * marcos lado a lado, no celular a lista em pé. As duas leem a MESMA leitura
 * que só avança.
 */
function LinhaDetalhada({ linha }: { linha: LeituraDaLinha }) {
  const n = linha.passos.length;
  const ultimoFeito = linha.passos.reduce((u, p, i) => (p.estado === "feito" || p.estado === "pulado" ? i : u), -1);
  const ate = Math.max(linha.atual, ultimoFeito, 0);
  const metadeDaColuna = 50 / n;
  return (
    <>
      <div className="relative hidden sm:grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        <div className="absolute top-[9px] h-0.5" style={{ left: `${metadeDaColuna}%`, right: `${metadeDaColuna}%`, background: "var(--border)" }} />
        <div
          className="absolute top-[9px] h-0.5 bg-orange-500 transition-all duration-500"
          style={{ left: `${metadeDaColuna}%`, width: `${(ate / Math.max(1, n - 1)) * (100 - 2 * metadeDaColuna)}%` }}
        />
        {linha.passos.map((p, i) => (
          <Marco key={p.chave} passo={p} atual={i === linha.atual} />
        ))}
      </div>
      <EtapasNoCelular passos={linha.passos} atual={linha.atual} />
    </>
  );
}

/** Um marco da linha: o círculo, o rótulo e o número curto embaixo. */
function Marco({ passo: p, atual }: { passo: Passo; atual: boolean }) {
  const voce = p.estado === "voce";
  const cor =
    p.estado === "falhou"
      ? "#ef4444"
      : voce
        ? "#f59e0b"
        : atual || p.estado === "agora"
          ? "var(--accent-orange)"
          : p.estado === "feito"
            ? "var(--text-primary)"
            : "var(--text-muted)";
  return (
    <div className="relative flex flex-col items-center gap-2 min-w-0" data-passo={p.chave} data-estado={p.estado}>
      {p.estado === "feito" ? (
        // `Check` puro, e não `CheckCircle2`: o ícone com círculo próprio
        // dentro do marco redondo virava círculo dentro de círculo (02/09).
        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${p.chave === "pronto" ? "bg-green-500" : "bg-orange-500"}`}>
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        </div>
      ) : p.estado === "falhou" ? (
        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
          <X className="w-3 h-3 text-white" strokeWidth={3} />
        </div>
      ) : p.estado === "pulado" ? (
        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }} title="Não se aplica a este vídeo">
          <Minus className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
        </div>
      ) : (
        <div
          className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
          style={{
            borderColor: voce ? "#f59e0b" : p.estado === "agora" ? "var(--accent-orange)" : "var(--border)",
            background: voce ? "#f59e0b" : "var(--bg-card)",
          }}
        >
          {p.estado === "agora" && <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />}
          {voce && <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
        </div>
      )}
      {/* Rótulos só do celular para cima: no celular a etapa atual vem
          escrita por inteiro embaixo da linha. */}
      <p
        className="hidden sm:block text-[11px] leading-tight text-center px-0.5 max-w-full"
        // Com 17 marcos (o vídeo do gêmeo) a coluna fica estreita: a palavra
        // longa quebra com hífen em vez de encostar na vizinha
        // ("PesquisandoEscolhendo", visto na prova de 02/10).
        lang="pt-BR"
        style={{ color: cor, fontWeight: atual || voce ? 700 : p.estado === "feito" ? 600 : 500, hyphens: "auto", overflowWrap: "anywhere" }}
      >
        {p.rotulo}
      </p>
      {voce ? (
        <p className="hidden sm:block text-[10px] -mt-1 text-center font-semibold" style={{ color: "#d97706" }}>
          esperando você
        </p>
      ) : p.nota ? (
        <p className="hidden sm:block text-[10px] -mt-1 text-center leading-tight" style={{ color: "var(--text-muted)" }}>
          {p.nota}
        </p>
      ) : null}
    </div>
  );
}

const ESTADO_NA_LISTA: Record<Passo["estado"], string> = {
  feito: "feito",
  agora: "em andamento",
  voce: "esperando você",
  falta: "a seguir",
  falhou: "parou",
  pulado: "não se aplica",
};

/** Minutos pelo alto de um passo ("até 3 min"), ou nada se o passo não pesa no relógio. */
function previstoDoPasso(p: Passo): string | null {
  if (!p.previstoSegundos || p.estado === "feito" || p.estado === "pulado" || p.estado === "falhou") return null;
  return `até ${Math.max(1, Math.ceil(p.previstoSegundos / 60))} min`;
}

/**
 * A linha do tempo no celular (03/10): uma lista em pé, etapa por linha, com o
 * estado e o tempo previsto. As etapas feitas ficam recolhidas numa linha só
 * (abre com um toque) para a etapa atual aparecer sem rolar.
 */
function EtapasNoCelular({ passos, atual }: { passos: Passo[]; atual: number }) {
  const [abertas, setAbertas] = useState(false);
  const feitas = passos.filter((p, i) => i < atual && (p.estado === "feito" || p.estado === "pulado"));
  const recolher = !abertas && feitas.length > 1;
  const visiveis = recolher ? passos.filter((p) => !feitas.includes(p)) : passos;
  return (
    <div className="sm:hidden" data-etapa-celular>
      <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        Etapa {atual + 1} de {passos.length}: {passos[atual]?.rotulo}
      </p>
      <ol className="relative flex flex-col">
        <span className="absolute left-[9px] top-3 bottom-3 w-0.5" style={{ background: "var(--border)" }} aria-hidden />
        {recolher && (
          <li>
            <button type="button" onClick={() => setAbertas(true)} className="relative flex w-full items-center gap-3 py-1.5 text-left">
              <span className="w-5 h-5 shrink-0 rounded-full bg-orange-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" strokeWidth={3} />
              </span>
              <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                {feitas.length} etapas feitas
              </span>
              <span className="ml-auto text-xs font-semibold text-orange-400">ver todas</span>
            </button>
          </li>
        )}
        {visiveis.map((p) => {
          const i = passos.indexOf(p);
          const eAtual = i === atual;
          const previsto = previstoDoPasso(p);
          const corDoEstado =
            p.estado === "falhou" ? "#ef4444" : p.estado === "voce" ? "#d97706" : eAtual || p.estado === "agora" ? "var(--accent-orange)" : "var(--text-muted)";
          return (
            <li key={p.chave} className="relative flex items-start gap-3 py-1.5" data-passo={p.chave} data-estado={p.estado}>
              <MarcadorDoPasso passo={p} />
              <div className="min-w-0 flex-1">
                <p
                  className="text-[13px] leading-snug break-words"
                  style={{ color: p.estado === "falta" || p.estado === "pulado" ? "var(--text-muted)" : "var(--text-primary)", fontWeight: eAtual ? 700 : 500 }}
                >
                  {p.rotulo}
                </p>
                <p className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                  <span style={{ color: corDoEstado, fontWeight: eAtual || p.estado === "voce" ? 600 : 400 }}>{ESTADO_NA_LISTA[p.estado]}</span>
                  {p.nota ? ` · ${p.nota}` : ""}
                </p>
              </div>
              {previsto && (
                <span className="shrink-0 pt-0.5 text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {previsto}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** O círculo de um passo na lista do celular (o mesmo desenho do marco da linha). */
function MarcadorDoPasso({ passo: p }: { passo: Passo }) {
  if (p.estado === "feito")
    return (
      <span className={`relative w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${p.chave === "pronto" ? "bg-green-500" : "bg-orange-500"}`}>
        <Check className="w-3 h-3 text-white" strokeWidth={3} />
      </span>
    );
  if (p.estado === "falhou")
    return (
      <span className="relative w-5 h-5 shrink-0 rounded-full bg-red-500 flex items-center justify-center">
        <X className="w-3 h-3 text-white" strokeWidth={3} />
      </span>
    );
  if (p.estado === "pulado")
    return (
      <span className="relative w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <Minus className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
      </span>
    );
  const voce = p.estado === "voce";
  return (
    <span
      className="relative w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center"
      style={{ borderColor: voce ? "#f59e0b" : p.estado === "agora" ? "var(--accent-orange)" : "var(--border)", background: voce ? "#f59e0b" : "var(--bg-card)" }}
    >
      {p.estado === "agora" && <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />}
      {voce && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
    </span>
  );
}
