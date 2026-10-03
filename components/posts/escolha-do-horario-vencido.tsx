"use client";

import { Clock, Check } from "lucide-react";

/**
 * O que fazer com os dias cujo HORÁRIO já passou.
 *
 * ## De onde veio
 *
 * 18/09. O Bruno mandou uma campanha de sete dias às 23h41 de uma quinta, com
 * horário das 09:00. Segunda, terça e quarta já eram dias anteriores, e a
 * esteira já sabia empurrá-los para a semana seguinte (parte 137). A QUINTA
 * era hoje, e só a hora tinha passado: esse caso não era tratado por ninguém,
 * então ela entrava nesta semana e o agendamento a jogava para "agora mais dez
 * minutos", que caiu 01:25 da SEXTA.
 *
 * A peça de quinta foi publicada na madrugada de sexta sem ninguém ter
 * escolhido isso. **É decisão de produto, não de código**, e por isso ela volta
 * para quem pede a campanha, aqui, antes de gerar.
 *
 * ## Por que estes três caminhos
 *
 * Cada opção diz o que ACONTECE, e não como a regra se chama: quem está nesta
 * tela quer saber quando a peça sai, não o nome do comportamento. A segunda
 * (publicar ainda hoje) é o que o produto fazia sozinho, e continua disponível
 * porque às vezes é mesmo o que se quer; a diferença é que agora é escolha.
 */
export type EscolhaDeHorario = "semanaSeguinte" | "agora" | "pular";

export function EscolhaDoHorarioVencido({
  /** Os rótulos dos dias vencidos, na ordem da semana ("Segunda", "Quinta"). */
  diasVencidos,
  /** A hora agora, curta ("23:41"), lida quando a pessoa chegou nesta tela. */
  agora,
  /** Quantos dias a campanha pediu no total, para dizer com quantos ela fica. */
  totalPedido,
  escolha,
  onEscolher,
}: {
  diasVencidos: string[];
  agora: string;
  totalPedido: number;
  escolha: EscolhaDeHorario;
  onEscolher: (e: EscolhaDeHorario) => void;
}) {
  if (diasVencidos.length === 0) return null;

  const um = diasVencidos.length === 1;
  const sobram = Math.max(0, totalPedido - diasVencidos.length);

  const opcoes: Array<{ id: EscolhaDeHorario; titulo: string; detalhe: string }> = [
    {
      id: "semanaSeguinte",
      titulo: "Jogar para a semana que vem",
      detalhe: `${um ? "A peça sai" : "Cada peça sai"} no mesmo dia da semana, no mesmo horário. Nenhum dia é perdido.`,
    },
    {
      id: "agora",
      titulo: "Publicar ainda hoje",
      detalhe: um
        ? "Sai daqui a dez minutos, fora do horário que você escolheu."
        : "Saem daqui a pouco, uma atrás da outra, fora do horário que você escolheu.",
    },
    {
      id: "pular",
      titulo: um ? "Pular esse dia" : "Pular esses dias",
      detalhe:
        sobram === 0
          ? "A campanha fica sem nenhuma peça. Não há o que gerar."
          : `A campanha fica com ${sobram} ${sobram === 1 ? "peça" : "peças"}. ${um ? "O dia não é gerado nem cobrado" : "Os dias não são gerados nem cobrados"}.`,
    },
  ];

  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--accent-orange)", background: "var(--bg-card)" }}
      role="group"
      aria-label="O que fazer com os dias que já passaram do horário"
    >
      <div className="flex gap-3 p-4 pb-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--accent-orange)" }} />
        <div className="flex flex-col gap-1">
          <p className="text-[13.5px] font-bold" style={{ color: "var(--text-primary)" }}>
            {um ? `${diasVencidos[0]} já passou do horário` : `${diasVencidos.length} dias desta semana já passaram do horário`}
          </p>
          {/* Com um dia só, o título já o nomeou: repetir aqui ("Quinta já
              passou do horário / Quinta. Agora são 23:41") é o nome duas vezes
              em duas linhas seguidas. A lista só existe quando há o que listar. */}
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {um ? "" : `${diasVencidos.join(", ")}. `}Agora são {agora}. O que eu faço com {um ? "ele" : "eles"}?
          </p>
        </div>
      </div>

      <div className="flex flex-col">
        {opcoes.map((op) => {
          const ativa = escolha === op.id;
          return (
            <button
              key={op.id}
              type="button"
              onClick={() => onEscolher(op.id)}
              aria-pressed={ativa}
              className="flex w-full items-start gap-2.5 border-t px-4 py-3 text-left transition-colors"
              style={{
                borderColor: "var(--border)",
                background: ativa ? "color-mix(in srgb, var(--accent-orange) 12%, transparent)" : "transparent",
              }}
            >
              <span
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                style={{
                  background: ativa ? "var(--accent-orange)" : "transparent",
                  borderColor: ativa ? "var(--accent-orange)" : "var(--text-muted)",
                }}
              >
                {ativa && <Check className="h-2.5 w-2.5" style={{ color: "var(--bg-primary)" }} strokeWidth={4} />}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold" style={{ color: ativa ? "var(--accent-orange)" : "var(--text-primary)" }}>
                  {op.titulo}
                </span>
                <span className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                  {op.detalhe}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
