import { CATALOGO_DE_ESTILOS, GRUPOS, arteDoEstilo } from "@/lib/media/catalogo-de-estilos";
import { ESTILOS_DE_LEGENDA } from "@/lib/media/legenda-escolhida";

/**
 * O ESTILO DA EDIÇÃO, com material REAL (01/10, pedido do Bruno).
 *
 * Até aqui esta seção era "O mesmo corte, para o seu ofício", com pessoas
 * geradas por IA e legenda queimada por código: ilustração, e não saída da
 * plataforma. O Bruno pediu para trocar pelos estilos que o cliente escolhe
 * de verdade antes de subir o vídeo.
 *
 * DUAS PROVAS, nesta ordem:
 *
 * 1. O MESMO TRECHO DA MESMA GRAVAÇÃO, editado em dois estilos. São dois
 *    cortes reais do projeto Empreendedorismo Cristão, os dois a partir do
 *    segundo 700 da gravação de 29/09 ("Moisés estava sobrecarregado"): um na
 *    linguagem explicativa em colagem (estilo Vox, legenda em recorte de
 *    papel), outro com o narrador em tela cheia e palavras gigantes na cor da
 *    marca. Os arquivos são os montados pela esteira, só reduzidos para a web
 *    (public/pitch/estilo-*.mp4, 10 s, sem som).
 * 2. O CATÁLOGO, com as mesmas artes de exemplo que o cliente vê na tela de
 *    estilo (public/estilos, lib/media/catalogo-de-estilos.ts) e os cinco
 *    estilos de legenda da aba "Legenda". A seção lê o catálogo do código: se
 *    um estilo entrar ou sair, a landing acompanha sem cópia manual.
 *
 * Componente de servidor: os vídeos tocam sozinhos, mudos e em laço, sem
 * JavaScript nosso.
 */

const LADO_A_LADO = [
  {
    video: "/pitch/estilo-colagem.mp4",
    capa: "/pitch/estilo-colagem.jpg",
    nome: "Explicativo editorial",
    detalhe: "Colagem de recortes e legenda em recorte de papel (estilo Vox)",
  },
  {
    // 02/10: só os trechos com a parede real de fundo (0 a 3 s e 7,5 a 10 s do
    // corte). O meio trocava o fundo por laranja chapado e trazia um cartão
    // "NAO PRECISA" sem acento, que é defeito da montagem e não vitrine.
    video: "/pitch/estilo-destaque-0210.mp4",
    capa: "/pitch/estilo-destaque-0210.jpg",
    nome: "Narrador com punch",
    detalhe: "Você em tela cheia e palavras gigantes na cor da marca",
  },
];

/** Os que aparecem primeiro: um de cada grupo e os que o mercado mais pede. */
const DESTAQUES = ["vox", "bbc", "natgeo", "kurzgesagt", "ali-abdaal", "ted", "keynote", "podcast", "hormozi", "mrbeast", "tipografia", "minimalista"];

export function Exemplos() {
  const destaques = DESTAQUES.map((id) => CATALOGO_DE_ESTILOS.find((e) => e.id === id)).filter((e) => e !== undefined);
  return (
    <section id="exemplos" className="py-24 lg:py-32 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="selo mb-6">O estilo da edição</div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            O mesmo trecho,
            <br />
            no estilo que você escolher.
          </h2>
          <p className="text-lg text-[var(--text-muted)] max-w-2xl mx-auto">
            Antes de subir o vídeo, você escolhe a linguagem da edição e o estilo da legenda. As cores, a
            fonte e o logo são sempre os da sua marca.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-6 max-w-3xl mx-auto mb-4">
          {LADO_A_LADO.map((v) => (
            <figure key={v.video}>
              <div className="rounded-2xl overflow-hidden border border-[var(--border)] bg-black">
                <video
                  src={v.video}
                  poster={v.capa}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="w-full aspect-[9/16] object-cover block"
                  aria-label={`Corte real editado no estilo ${v.nome}`}
                />
              </div>
              <figcaption className="mt-3">
                <p className="font-semibold text-[var(--text-primary)]">{v.nome}</p>
                <p className="text-sm text-[var(--text-muted)]">{v.detalhe}</p>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="text-center text-sm text-[var(--text-muted)] mb-16">
          Dois cortes reais da mesma gravação, do mesmo segundo, editados pela plataforma em estilos diferentes.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
          <div>
            <p className="rotulo mb-2">O catálogo</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">
              {CATALOGO_DE_ESTILOS.length} linguagens, em {GRUPOS.length} grupos
            </p>
          </div>
          <p className="text-sm text-[var(--text-muted)]">As artes de exemplo são as mesmas da tela de escolha.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-10">
          {destaques.map((e) => (
            <figure key={e.id} className="rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg-surface)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={arteDoEstilo(e.id)} alt={`Arte de exemplo do estilo ${e.nome}`} loading="lazy" className="w-full aspect-video object-cover" />
              <figcaption className="p-3">
                <p className="text-sm font-semibold text-[var(--text-primary)] leading-tight">{e.nome}</p>
                <p className="text-xs text-[var(--text-muted)]">{e.referencia ?? e.grupo}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6">
          <p className="rotulo mb-3">E a legenda, em 5 estilos</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {ESTILOS_DE_LEGENDA.map((l) => (
              <div key={l.id}>
                <p className="font-semibold text-[var(--text-primary)]">{l.nome}</p>
                <p className="text-sm text-[var(--text-muted)] leading-snug">{l.resumo}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
