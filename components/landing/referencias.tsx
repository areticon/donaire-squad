import { REFERENCIAS_DE_MERCADO, ritmoEmTexto } from "@/lib/landing/referencias-de-mercado";

/**
 * O CARROSSEL DAS REFERÊNCIAS, logo abaixo da hero (02/10, noite, decisão do
 * Bruno): cartões passando com o LOGO oficial de cada empresa e o ritmo medido,
 * "<quem> publica em média N conteúdos por <dia ou semana>". Os números, a
 * regra da medida e a fonte de cada logo estão em
 * lib/landing/referencias-de-mercado.ts.
 *
 * Os logos ficam todos BRANCOS por CSS (brightness(0) invert(1)), para o fundo
 * escuro ficar uniforme; a altura de cada um vem da lista, ajustada para o
 * mesmo peso visual. Nunca foto de pessoa.
 *
 * Componente de servidor. O movimento é CSS puro: a lista vai duplicada para o
 * laço não dar salto, o trilho anda com translate3d (a placa de vídeo faz o
 * trabalho, e no celular roda liso) e para em quem pede menos movimento. O
 * corte das bordas fica no próprio bloco (overflow hidden), então a página
 * não ganha rolagem horizontal.
 */
export function Referencias() {
  const lista = [...REFERENCIAS_DE_MERCADO, ...REFERENCIAS_DE_MERCADO];
  return (
    <section id="referencias" aria-label="Empresas que usam conteúdo para vender mais" className="relative pt-4 pb-14">
      <style>{`
        @keyframes lp-passa { from { transform: translate3d(0,0,0); } to { transform: translate3d(-50%,0,0); } }
        .lp-trilho { animation: lp-passa 36s linear infinite; will-change: transform; }
        .lp-carrossel:hover .lp-trilho { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .lp-trilho { animation: none; } }
      `}</style>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-6">
        {/* Título como o Matheus fala (02/10, noite); a frase de antes desceu
            para o subtítulo. */}
        <h2 className="text-2xl lg:text-3xl font-black text-[var(--text-primary)]">
          Empresas que usam conteúdo <span className="text-orange-500">para vender mais.</span>
        </h2>
        <p className="mt-1 text-base text-[var(--text-muted)]">Quem vende muito aparece toda semana.</p>
      </div>

      <div className="lp-carrossel relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
        <ul className="lp-trilho flex w-max gap-4 px-2">
          {lista.map((r, i) => (
            <li
              key={`${r.perfil}-${i}`}
              aria-hidden={i >= REFERENCIAS_DE_MERCADO.length}
              className="w-[280px] sm:w-[310px] shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-4 flex items-center gap-4"
            >
              <span className="flex h-10 w-[68px] sm:w-[88px] shrink-0 items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.logo}
                  alt={`Logo ${r.nome.includes("Cimed") ? "da Cimed" : `de ${r.nome}`}`}
                  style={{ height: r.logoAltura }}
                  className="w-auto max-w-[68px] sm:max-w-[88px] object-contain [filter:brightness(0)_invert(1)] opacity-90"
                />
              </span>
              <div className="min-w-0 text-left">
                <p className="font-bold text-[var(--text-primary)] leading-tight">{r.nome}</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  publica em média <strong className="text-orange-400">{ritmoEmTexto(r)}</strong>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 px-4 text-center text-xs text-[var(--text-muted)]">
        Referências de mercado, não clientes da Demandou. Medido em 02/10/2026, nos posts do Instagram de cada perfil.
      </p>
    </section>
  );
}
