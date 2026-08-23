"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { EstadoDeTrabalho } from "@/lib/media/video-state";

/**
 * O que a pessoa vê enquanto o squad trabalha.
 *
 * Nasceu de um teste real em 22/08: o Bruno subiu uma gravação de 27 minutos e
 * só descobriu que a transcrição tinha terminado porque apertou F5 por conta
 * própria. O tédio é o menor problema. O grave é que, sem sinal de vida, não dá
 * para distinguir "está rodando" de "morreu e ninguém contou".
 *
 * Duas decisões dele, com o porquê, para não serem desfeitas por engano:
 *
 * - **Sem barra de porcentagem.** A transcrição roda fora daqui e não reporta
 *   progresso, então qualquer barra seria interpolação inventada. Barra que
 *   anda sozinha e depois trava em 90% mente com mais confiança que texto
 *   nenhum.
 * - **Sem figuras públicas reais** nas frases. São pessoas de verdade, e usar
 *   nome ou imagem delas para decorar uma tela de espera é uso de imagem de
 *   terceiro sem autorização.
 *
 * O tempo corrido é honesto: ele conta para cima, sem prometer fim. Quem sabe
 * quanto falta é ninguém.
 */

const ETAPAS: Array<{ chave: EstadoDeTrabalho; rotulo: string; detalhe: string }> = [
  {
    chave: "transcribing",
    rotulo: "Ouvindo a gravação",
    detalhe: "Palavra por palavra, com marcação de tempo",
  },
  {
    chave: "selecting",
    rotulo: "Escolhendo os melhores momentos",
    detalhe: "Procurando as falas que sustentam um post sozinhas",
  },
  {
    chave: "cutting",
    rotulo: "Cortando os vídeos",
    detalhe: "Enquadrando cada corte para o formato de cada rede",
  },
  {
    chave: "writing",
    rotulo: "Escrevendo os posts",
    detalhe: "Um texto por rede, na sua voz",
  },
];

/**
 * As frases giram para mostrar que a tela está viva, e cada uma diz uma coisa
 * verdadeira sobre o que o agente daquela etapa realmente faz. Frase genérica
 * de carregamento ("preparando tudo para você") não informa nada e a pessoa
 * aprende a ignorar.
 */
const FRASES: Record<EstadoDeTrabalho, string[]> = {
  transcribing: [
    "Separando cada palavra e o segundo exato em que ela foi dita.",
    "Guardando os nomes próprios do seu negócio para não virarem outra coisa.",
    "Gravação longa demora mais aqui do que em todo o resto junto.",
  ],
  selecting: [
    "Roberto Radar está procurando onde você defendeu uma tese, não onde deu conselho.",
    "Trecho que só faz sentido junto com o que veio dez minutos antes está sendo descartado.",
    "Abertura e encerramento saem fora: ninguém compartilha um 'então é isso, pessoal'.",
    "Melhor devolver três momentos bons que sete para encher cota.",
  ],
  cutting: [
    "Diana Design está olhando os quadros para decidir o enquadramento de cada corte.",
    "Gravação de tela vira slide grande em cima e você embaixo, não slide minúsculo no meio.",
    "Cada corte sai em vertical para Shorts e Reels, e em horizontal para LinkedIn e X.",
    "A gravação inteira também está sendo preparada, com capítulos, para o seu canal.",
  ],
  writing: [
    "Lucas LinkedIn está escrevendo para quem lê no meio do expediente.",
    "Tiago Twitter está cortando o que não cabe em 280 caracteres.",
    "Vera Veredito confere se o texto ficou fiel ao que você falou de verdade.",
    "Cada trecho vira um texto por rede, e nenhum deles inventa fala sua.",
  ],
};

function formatarDuracao(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  if (m === 0) return `${s}s`;
  return `${m}min ${String(s).padStart(2, "0")}s`;
}

export function VideoEspera({
  status,
  rodandoHaSegundos,
}: {
  status: EstadoDeTrabalho;
  /**
   * Vem do servidor, e é nulo até a primeira consulta responder. O relógio do
   * navegador não serve de substituto: máquina com hora dessincronizada
   * mostraria tempo negativo ou absurdo justamente na tela em que o cliente
   * está ansioso.
   */
  rodandoHaSegundos: number | null;
}) {
  // O contador anda sozinho entre uma consulta e outra, para o número não ficar
  // parado por quatro segundos e parecer travado. Quando o servidor responde,
  // o valor dele manda.
  //
  // O ajuste é feito DURANTE a renderização, e não dentro de um efeito. É o
  // padrão do React para "uma prop mudou, corrija o estado derivado": fazer
  // isso num efeito provoca uma renderização a mais toda vez, e o próprio lint
  // do projeto reprova.
  const [segundos, setSegundos] = useState(rodandoHaSegundos ?? 0);
  const [ultimoDoServidor, setUltimoDoServidor] = useState(rodandoHaSegundos);
  if (ultimoDoServidor !== rodandoHaSegundos) {
    setUltimoDoServidor(rodandoHaSegundos);
    if (rodandoHaSegundos !== null) setSegundos(rodandoHaSegundos);
  }

  useEffect(() => {
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const frases = FRASES[status];
  const [frase, setFrase] = useState(0);
  const [ultimasFrases, setUltimasFrases] = useState(frases);
  if (ultimasFrases !== frases) {
    setUltimasFrases(frases);
    setFrase(0);
  }

  useEffect(() => {
    const t = setInterval(() => setFrase((i) => (i + 1) % frases.length), 6000);
    return () => clearInterval(t);
  }, [frases]);

  const atual = ETAPAS.findIndex((e) => e.chave === status);

  return (
    <div
      className="rounded-xl border p-4 space-y-4"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          O squad está trabalhando
        </p>
        {rodandoHaSegundos !== null && (
          <p
            className="text-sm tabular-nums"
            style={{ color: "var(--text-muted)" }}
            aria-label={`Rodando há ${formatarDuracao(segundos)}`}
          >
            {formatarDuracao(segundos)}
          </p>
        )}
      </div>

      <ol className="space-y-2">
        {ETAPAS.map((etapa, i) => {
          const feita = i < atual;
          const agora = i === atual;
          return (
            <li key={etapa.chave} className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0">
                {feita ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : agora ? (
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    style={{ color: "var(--accent-orange)" }}
                  />
                ) : (
                  <span
                    className="block w-4 h-4 rounded-full border"
                    style={{ borderColor: "var(--border)" }}
                  />
                )}
              </span>
              <span className="min-w-0">
                <span
                  className="block text-sm"
                  style={{
                    color: agora ? "var(--text-primary)" : "var(--text-muted)",
                    fontWeight: agora ? 600 : 400,
                  }}
                >
                  {etapa.rotulo}
                </span>
                {agora && (
                  <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                    {etapa.detalhe}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {/* aria-live para quem usa leitor de tela ouvir a frase trocar sem que o
          foco saia de onde está. */}
      <p
        className="text-xs italic border-t pt-3"
        style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}
        aria-live="polite"
      >
        {frases[frase]}
      </p>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        O andamento fica guardado. Se você sair desta tela, é só voltar para ver
        onde parou.
      </p>
    </div>
  );
}
