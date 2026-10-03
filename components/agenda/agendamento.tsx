"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Video } from "lucide-react";
import { FormularioDemonstracao } from "@/components/landing/formulario-demonstracao";
import { Calendario, type ReuniaoMarcada } from "@/components/agenda/calendario";
import { horaEmSP, rotuloLongoDoDia, dataEmSP } from "@/lib/agenda/tempo";

type Campo = "faturamento" | "tamanhoTime" | "setor" | "cargo" | "telefone" | "consentimentoEm";

/**
 * O AGENDAMENTO DA PÁGINA /demonstracao (01/10): formulário (só quando
 * preciso), calendário e confirmação, num cartão só.
 *
 * O SERVIDOR DECIDE O PASSO INICIAL (page.tsx lê o cookie do lead): quem veio
 * da calculadora abre direto no calendário, sem nenhum campo. Este componente
 * só anda para a frente a partir dali.
 */
export function Agendamento({
  inicial,
  emailConhecido,
  faltam,
  tokenDaUrl,
}: {
  inicial: "formulario" | "calendario" | "fora";
  /** E-mail do lead já conhecido, mascarado para a tela. */
  emailConhecido: string | null;
  faltam: Campo[] | null;
  /** Token `l` da URL (link de e-mail), repassado na marcação. */
  tokenDaUrl: string | null;
}) {
  const [passo, setPasso] = useState<"formulario" | "calendario" | "fora" | "feito">(inicial);
  const [reuniao, setReuniao] = useState<ReuniaoMarcada | null>(null);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 sm:p-7">
      {passo === "formulario" && (
        <FormularioDemonstracao
          emailConhecido={emailConhecido}
          faltam={faltam}
          onPronto={(qualificado) => setPasso(qualificado ? "calendario" : "fora")}
        />
      )}

      {passo === "calendario" && (
        <>
          <div className="mb-5">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Escolha o horário da sua demonstração</h2>
            {emailConhecido && (
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Já temos os seus dados ({emailConhecido}).{" "}
                <a href="/api/agenda/sair" className="text-orange-400 hover:text-orange-300 underline underline-offset-2">
                  Não é você?
                </a>
              </p>
            )}
          </div>
          <Calendario
            enviarPara="/api/agenda/reunioes"
            corpoExtra={tokenDaUrl ? { l: tokenDaUrl } : {}}
            onMarcada={(r) => {
              setReuniao(r);
              setPasso("feito");
            }}
            onSemLead={() => setPasso("formulario")}
          />
        </>
      )}

      {passo === "feito" && reuniao && <Confirmada r={reuniao} />}

      {passo === "fora" && (
        <div>
          <h2 className="text-2xl font-black text-[var(--text-primary)] mb-3">Obrigado pelo interesse.</h2>
          <p className="text-[var(--text-muted)]">
            Hoje a Demandou atende empresas que faturam acima de R$ 100 mil por mês, porque é a partir desse tamanho que
            o plano anual se paga com folga. Guardamos o seu contato e avisamos quando houver uma opção para o momento da
            sua empresa.
          </p>
        </div>
      )}
    </div>
  );
}

export function Confirmada({ r, titulo = "Demonstração marcada.", comGerenciar = true }: { r: ReuniaoMarcada; titulo?: string; comGerenciar?: boolean }) {
  const inicio = new Date(r.inicio);
  return (
    <div>
      <CheckCircle2 className="w-10 h-10 text-green-500 mb-3" />
      <h2 className="text-2xl font-black text-[var(--text-primary)] mb-2">{titulo}</h2>
      <p className="text-[var(--text-primary)] text-lg">
        {rotuloLongoDoDia(dataEmSP(inicio))}, às {horaEmSP(inicio)}{" "}
        <span className="text-[var(--text-muted)] text-base">(horário de Brasília)</span>
      </p>
      <p className="text-[var(--text-muted)] mt-1">Com {r.pessoa}, 30 minutos por vídeo.</p>
      {r.linkReuniao ? (
        <a
          href={r.linkReuniao}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-orange-400 hover:text-orange-300"
        >
          <Video className="w-4 h-4" /> Link da videochamada
        </a>
      ) : (
        <p className="mt-4 text-sm text-[var(--text-muted)]">O link da videochamada chega por e-mail antes da reunião.</p>
      )}
      <p className="mt-4 text-sm text-[var(--text-muted)]">
        Mandamos o convite para o seu e-mail e avisamos de novo antes da reunião, com o link da sala.
      </p>
      {comGerenciar && (
        <Link
          href={r.gerenciar}
          className="mt-5 inline-flex rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:border-orange-500/60"
        >
          Remarcar ou cancelar
        </Link>
      )}
    </div>
  );
}
