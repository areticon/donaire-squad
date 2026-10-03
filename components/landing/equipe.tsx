import { AGENTES } from "@/lib/squad/estado-do-squad";

/**
 * A EQUIPE, COM ROSTO (02/10, pedido do Matheus): retratos fotográficos no
 * lugar dos bonecos, cada um com o nome e a função do agente, como a Viver de
 * IA apresenta a dela.
 *
 * As pessoas NÃO EXISTEM: são retratos gerados por IA para a landing
 * (scripts/tmp/retratos-equipe-0210.mts, public/equipe). A tela diz isso duas
 * vezes, no selo e na nota, para ninguém achar que são funcionários.
 *
 * Os nomes vêm de lib/squad/estado-do-squad.ts, a mesma lista do produto; aqui
 * só a função é escrita em linguagem de empresário.
 */
const FUNCAO: Record<string, string> = {
  "roberto-radar": "Pesquisa de mercado",
  "lucas-linkedin": "Posts do LinkedIn",
  "xavier-x": "Posts do X",
  "igor-instagram": "Posts do Instagram",
  "fernanda-facebook": "Posts do Facebook",
  "tiago-tiktok": "Vídeos do TikTok",
  "yan-youtube": "Canal do YouTube",
  "diana-design": "Artes e carrosséis",
  "vitor-video": "Edição e cortes de vídeo",
  "vera-veredito": "Gerente da equipe",
  "paulo-publicador": "Agenda e publicação",
};

export function Equipe() {
  return (
    <section id="equipe" className="relative pt-24 lg:pt-28 pb-12">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="selo mb-6">
            <span>Sua equipe</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            Conheça a sua equipe. <span className="text-orange-500">Onze especialistas.</span>
          </h2>
          <p className="text-xl text-[var(--text-muted)] max-w-2xl mx-auto">Cada um cuida de uma parte. A Vera revisa tudo antes de chegar a você.</p>
        </div>

        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {AGENTES.map((a) => (
            <li key={a.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
              <div className="relative aspect-square bg-[var(--bg-elevated)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/equipe/${a.id}.jpg`}
                  alt={`${a.nome}, ${FUNCAO[a.id] ?? a.papel}: retrato fictício gerado por IA`}
                  loading="lazy"
                  width={400}
                  height={400}
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-2 left-2 rounded-full bg-[#0a1f3b]/85 px-2 py-0.5 text-[10px] font-bold tracking-wide text-[#dfe6ef]">
                  IA
                </span>
              </div>
              <div className="p-3">
                <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">{a.nome}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-snug">{FUNCAO[a.id] ?? a.papel}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
          São agentes de inteligência artificial. Os retratos são ilustrativos, gerados por IA: essas pessoas não existem.
        </p>
        {/* Os botões desta seção moram no bloco "Solução pronta", logo abaixo
            (02/10, noite): dois pares seguidos poluíam. */}
      </div>
    </section>
  );
}
