"use client";

import { useEffect, useState } from "react";

/**
 * ABRIR A SALA (01/10, régua de alertas). Registra que o lead abriu a sala e
 * leva ao Meet.
 *
 * O REGISTRO É FEITO PELO NAVEGADOR (POST depois que a página carrega), e não
 * pelo GET do link: os filtros de segurança de e-mail (o do Outlook
 * corporativo, por exemplo) "clicam" em todo link quando a mensagem chega, e
 * um GET que registrasse presença faria o robô do filtro parecer o lead na
 * sala, segurando o aviso de atraso de quem não entrou.
 */
export function AbrirSala({ token, link, pessoa }: { token: string; link: string; pessoa: string }) {
  const [demorou, setDemorou] = useState(false);
  useEffect(() => {
    let ido = false;
    const ir = () => {
      if (ido) return;
      ido = true;
      window.location.replace(link);
    };
    fetch(`/api/agenda/sala/${encodeURIComponent(token)}`, { method: "POST", keepalive: true })
      .catch(() => {})
      .finally(ir);
    // Se o registro travar, a pessoa não pode ficar esperando: vai assim mesmo.
    const t1 = setTimeout(ir, 1500);
    const t2 = setTimeout(() => setDemorou(true), 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [token, link]);

  return (
    <div>
      <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2">Abrindo a sala...</h1>
      <p className="text-[var(--text-muted)]">A demonstração com {pessoa} é por videochamada.</p>
      <a
        href={link}
        className={`mt-5 inline-flex rounded-full bg-marca-600 px-6 py-3 text-sm font-bold text-white hover:bg-marca-700 ${demorou ? "" : "opacity-80"}`}
      >
        Entrar na sala
      </a>
    </div>
  );
}
