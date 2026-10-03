"use client";

import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * O PLANEJADOR SEMANAL: que dia sai o quê, e de quem foi a escolha.
 *
 * VIVE FORA DO MODAL DE PROPÓSITO, e a razão é a mesma que tirou o bloco do
 * horário vencido de lá na parte 140: dentro do assistente ele só existe no
 * passo 3, e nenhum script de renderização alcança um passo que depende de
 * três cliques. O que não dá para renderizar fora do navegador vai ao ar sem
 * ninguém ter visto, e foi assim que o modal inteiro quebrou em 14/09.
 *
 * O QUE ELE CONSERTA (card 508, medido em 18/09): a grade que aparecia quando
 * a janela abria NUNCA foi escolha de ninguém. É o padrão que a própria tela
 * monta a partir da frequência do projeto, alternando texto e imagem. Nada
 * dizia isso. O cliente gerava a campanha achando ter escolhido, via texto
 * onde não queria texto, e concluía que os agentes ignoravam o pedido dele.
 * Os agentes obedeceram: a ordem é que era da tela.
 *
 * É a segunda vez em dois dias que o mesmo defeito aparece com outra roupa
 * (a primeira foi o horário do dia vencido), e ele não é de código: é decisão
 * de produto tomada por omissão. A cura das duas vezes foi a mesma, e é só
 * uma: a tela dizer o que é dela e o que é da pessoa.
 */

export interface TipoDeConteudo {
  id: string;
  label: string;
  icon: LucideIcon;
  credits: number | null;
  time: string | null;
  activeColor: string;
}

export interface DiaDaSemana {
  key: string;
  label: string;
  short: string;
  dayNum: number;
  isWeekend: boolean;
}

interface Props {
  dias: DiaDaSemana[];
  tipos: TipoDeConteudo[];
  /** Chave do dia ("1".."7") para o tipo escolhido. Chave ausente = não postar. */
  agenda: Record<string, string | undefined>;
  /** Os dias cujo tipo a PESSOA escolheu. O resto é sugestão nossa. */
  escolhidos: Set<string>;
  /** "3x por semana", como está no setup do projeto. Some da frase quando falta. */
  frequencia?: string | null;
  quinzenal?: boolean;
  onEscolher: (dia: string, tipo: string | undefined) => void;
  onAceitarSugestao: () => void;
}

export function PlanejadorSemanal({
  dias,
  tipos,
  agenda,
  escolhidos,
  frequencia,
  quinzenal = false,
  onEscolher,
  onAceitarSugestao,
}: Props) {
  const ativos = Object.keys(agenda).filter((k) => agenda[k] !== undefined);
  const meus = ativos.filter((k) => escolhidos.has(k)).length;
  const sugeridos = ativos.length - meus;

  return (
    <>
      <div>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Planejador {quinzenal ? "quinzenal" : "semanal"}
        </h3>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {quinzenal
            ? "Ative os dias desejados: o planejamento será repetido nas 2 semanas."
            : "Um dia, um tipo de peça. O squad escreve, desenha e publica o que estiver aqui."}
        </p>
      </div>

      {/* O aviso: é ele que separa a sugestão da escolha, em palavras. */}
      {sugeridos > 0 ? (
        <div
          className="rounded-xl border p-3.5 space-y-2.5"
          style={{ borderColor: "rgba(250,204,21,.30)", background: "rgba(161,98,7,.14)" }}
        >
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#facc15" }} />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold" style={{ color: "#facc15" }}>
                Isto é uma sugestão nossa, não a sua escolha
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Montamos a partir da frequência do projeto
                {frequencia ? ` (${frequencia})` : ""}, alternando texto e imagem. Toque em
                qualquer dia para escolher você mesmo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAceitarSugestao}
            className="text-[11px] font-semibold rounded-lg px-3 py-1.5 border transition-all hover:border-[var(--border-accent)]"
            style={{ color: "var(--text-primary)", borderColor: "var(--border)", background: "rgba(255,255,255,.06)" }}
          >
            Aceitar a sugestão inteira
          </button>
        </div>
      ) : (
        <div
          className="rounded-xl border p-3.5 flex items-start gap-2.5"
          style={{ borderColor: "color-mix(in srgb, var(--acento) 35%, transparent)", background: "color-mix(in srgb, var(--acento) 6%, transparent)" }}
        >
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--accent-orange)" }} />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold" style={{ color: "var(--accent-orange)" }}>
              Este plano é seu
            </p>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Nenhum dia ficou por nossa conta. Dá para mudar qualquer um até apertar gerar.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {dias.map((day) => {
          const isActive = agenda[day.key] !== undefined;
          const selected = agenda[day.key];
          const selectedType = selected ? tipos.find((c) => c.id === selected) : null;
          // De quem é este dia. A etiqueta e o chip marcado contam a mesma
          // coisa em dois lugares de propósito: a pessoa varre a coluna de
          // cima a baixo e não lê linha por linha.
          const escolhido = escolhidos.has(day.key);
          return (
            <div
              key={day.key}
              className={cn(
                "rounded-xl border transition-all",
                isActive ? "border-[var(--border)]" : "border-dashed border-[var(--border)] opacity-50"
              )}
              style={{ background: isActive ? "var(--bg-elevated)" : "var(--bg-primary)" }}
            >
              <div className="flex items-center gap-3 px-3 py-2">
                <button
                  type="button"
                  onClick={() => onEscolher(day.key, isActive ? undefined : "text")}
                  className={cn(
                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
                    isActive ? "bg-orange-500" : "bg-gray-600"
                  )}
                  aria-pressed={isActive}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform duration-200",
                      isActive ? "translate-x-3" : "translate-x-0"
                    )}
                  />
                </button>
                <span
                  className={cn("text-xs font-semibold w-8 shrink-0", day.isWeekend ? "text-orange-400" : "")}
                  style={day.isWeekend ? undefined : { color: "var(--text-primary)" }}
                >
                  {day.short}
                </span>
                {!isActive && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    não postar
                  </span>
                )}
                {isActive && (
                  <span
                    className="text-[10px] font-semibold rounded-full px-2 py-0.5 border"
                    style={
                      escolhido
                        ? { color: "var(--accent-orange)", borderColor: "var(--accent-orange)", background: "color-mix(in srgb, var(--acento) 10%, transparent)" }
                        : { color: "var(--text-muted)", borderStyle: "dashed", borderColor: "var(--border)" }
                    }
                  >
                    {escolhido ? "sua escolha" : "sugerido"}
                  </span>
                )}
                {isActive && selectedType && (
                  <span className="text-xs ml-auto shrink-0" style={{ color: "var(--text-muted)" }}>
                    {selectedType.time ?? ""}
                  </span>
                )}
              </div>

              {isActive && (
                <div className="flex gap-1.5 flex-wrap px-3 pb-2.5">
                  {tipos.map((ct) => {
                    const Icon = ct.icon;
                    const isSel = selected === ct.id;
                    return (
                      <button
                        key={ct.id}
                        onClick={() => onEscolher(day.key, ct.id)}
                        title={`${ct.label}${ct.credits ? ` (${ct.credits} créditos)` : ""}${ct.time ? ` · ${ct.time}` : ""}`}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all",
                          isSel ? ct.activeColor : "border-[var(--border)] hover:border-[var(--border-accent)]",
                          isSel ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-muted)]"
                        )}
                        // O chip marcado num dia SUGERIDO fica pontilhado: a
                        // mesma informação da etiqueta, onde o olho já está.
                        style={isSel && !escolhido ? { borderStyle: "dashed" } : undefined}
                      >
                        <Icon className="w-3 h-3" />
                        {ct.label}
                        {ct.credits && isSel ? (
                          <span className="text-[10px] text-[var(--text-muted)]">{ct.credits}cr</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/*
        O PLACAR. É a frase que a pessoa lê antes de apertar gerar, e ela
        precisa dizer de quem é o plano, não só quantos dias ele tem.
      */}
      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        <span style={{ color: meus > 0 ? "var(--accent-orange)" : undefined, fontWeight: 600 }}>{meus}</span>{" "}
        {meus === 1 ? "dia que você escolheu" : "dias que você escolheu"}
        {sugeridos > 0 ? ` · ${sugeridos} ainda na sugestão` : ""} · {ativos.length} dia(s) ativo(s) esta
        semana
      </p>
    </>
  );
}
