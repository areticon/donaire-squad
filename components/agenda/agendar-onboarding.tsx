"use client";

import { useState } from "react";
import { Calendario, type ReuniaoMarcada } from "@/components/agenda/calendario";
import { Confirmada } from "@/components/agenda/agendamento";

/**
 * O CALENDÁRIO DO ONBOARDING (05/10): o mesmo calendário da demonstração,
 * preso à pessoa do onboarding (o Bruno), que marca pela rota do contrato.
 * Sem formulário: o servidor já sabe quem é o cliente pelo token da URL.
 * Marcou, vira o cartão de confirmação com o botão de remarcar ou cancelar
 * (que volta a esta mesma página, já com a reunião).
 */
export function AgendarOnboarding({ token, pessoa, saudacao, aviso }: {
  token: string;
  pessoa: { id: string; nome: string };
  saudacao: string;
  /** Um onboarding anterior que já passou, quando houver. */
  aviso: string | null;
}) {
  const [reuniao, setReuniao] = useState<ReuniaoMarcada | null>(null);

  if (reuniao) return <Confirmada r={reuniao} titulo="Onboarding marcado." />;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">{saudacao}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Com {pessoa.nome}, 30 minutos por vídeo. O convite vai para o e-mail do contrato.</p>
        {aviso && <p className="mt-2 text-sm text-[var(--text-muted)]">{aviso}</p>}
      </div>
      <Calendario
        enviarPara={`/api/onboarding/agendar/${encodeURIComponent(token)}`}
        pessoaFixa={pessoa.id}
        rotuloDoBotao="Confirmar o meu onboarding"
        onMarcada={setReuniao}
      />
    </div>
  );
}
