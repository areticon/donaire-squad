import { Video, UserRound, Lightbulb, ArrowRight } from "lucide-react";
import { VideoDoGemeo } from "@/components/landing/video-do-gemeo";

/**
 * OS TRÊS JEITOS DE COMEÇAR (01/10), os mesmos três da tela Criar da
 * plataforma (app/(app)/projects/[id]/criar), com as mesmas palavras: a
 * landing promete o que o cliente vai encontrar ao entrar.
 *
 * O GÊMEO DIGITAL DEIXOU DE SER "EM TESTE" em 01/10: o gêmeo do Bruno foi
 * gerado de verdade (OmniHuman, com fotos e um minuto da voz dele, autorizado
 * por ele), e a imagem do cartão é um quadro desse vídeo.
 *
 * As imagens: o caminho 1 é um quadro de um corte real feito pela plataforma;
 * o 3 é uma peça real publicada; o 2 é o vídeo do gêmeo digital do Bruno se
 * apresentando, com a autorização dele (01/10).
 */

const CASOS = [
  {
    n: "1",
    icon: Video,
    etiqueta: "Recomendado",
    titulo: "A partir do seu vídeo",
    texto:
      "Você sobe uma gravação: uma aula, uma live, uma reunião. A equipe edita o vídeo completo, tira os cortes verticais com legenda e escreve a semana a partir do que você falou.",
    itens: ["Vídeo completo editado", "Cortes para Reels, Shorts e TikTok", "Posts e carrosséis da semana"],
    // 02/10, pedido do Bruno: a imagem anterior tinha fundo laranja chapado e
    // o rosto parecia esticado (era um quadro de 720 px do estilo "destaque").
    // Esta é um quadro do corte 1080x1920 em colagem (gravação de 29/09,
    // 6,47 s), recortado em 4:3 sem redimensionar: proporção e nitidez da saída.
    imagem: "/pitch/caso-video-0210.jpg",
    alt: "Quadro de um corte vertical real feito pela plataforma, em colagem, com a legenda eu construí",
    legenda: "Corte real feito pela plataforma",
    // A legenda queimada do corte fica embaixo, então a da imagem sobe.
    legendaNoTopo: true,
  },
  {
    n: "2",
    icon: UserRound,
    etiqueta: "Novo",
    titulo: "O seu gêmeo digital",
    texto:
      "Sem tempo de gravar? A partir de fotos suas e de alguns minutos da sua voz, o gêmeo fala o roteiro com o seu rosto e a sua voz. Só você pode criar o seu, com autorização gravada por você.",
    itens: ["Seu rosto e sua voz", "A partir do roteiro da semana", "Revisão e aprovação iguais"],
    imagem: "/pitch/gemeo-0110b.jpg",
    // O gêmeo FALANDO, o que o Bruno aprovou (01/10, noite): rosto do
    // OmniHuman 1.5 gerado a partir de uma foto, com a VOZ REAL dele (a de voz
    // clonada saiu robótica e com o rosto distorcendo). 6,4 s, a frase inteira
    // ("O ponto é, não é a mudança em si..."), legenda queimada. Nome novo
    // (gemeo-0110b) para o navegador não mostrar a versão anterior guardada.
    video: "/pitch/gemeo-0110b.mp4",
    alt: "Vídeo do gêmeo digital do Bruno Donaire, sócio da Demandou: rosto gerado por IA a partir de uma foto, com a voz real dele",
    legenda: "Gêmeo do Bruno: rosto por IA, voz real",
  },
  {
    n: "3",
    icon: Lightbulb,
    etiqueta: "Sem gravar nada",
    titulo: "Tudo do zero, com IA",
    texto:
      "Sem gravação. A equipe pesquisa o seu mercado com fontes, sugere um tema por dia, escreve na sua voz e cria artes, carrosséis e vídeos narrados. Você aprova cada peça.",
    itens: ["Pesquisa com fontes", "Texto, arte e carrossel", "Vídeo por IA com narração"],
    imagem: "/pitch/caso-zero.jpg",
    alt: "Peça real gerada pela plataforma: Seis semanas calado custam mais do que você calcula",
    legenda: "Peça real publicada",
  },
];

export function TresCasos() {
  return (
    <section id="caminhos" className="relative py-24 lg:py-28">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <div className="selo mb-6">
            <span>Três jeitos de começar</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            Você escolhe como começar. <span className="text-orange-500">A equipe faz o resto.</span>
          </h2>
          <p className="text-xl text-[var(--text-muted)] max-w-2xl mx-auto">
            A escolha vale por semana. Revisão, agenda e publicação são iguais nos três.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {CASOS.map((c) => (
            <div
              key={c.n}
              className={`bg-[var(--bg-surface)] border rounded-2xl overflow-hidden flex flex-col ${
                c.n === "1" ? "border-orange-500/60" : "border-[var(--border)]"
              }`}
            >
              <figure className="relative aspect-[4/3] overflow-hidden bg-[var(--bg-elevated)]">
                {"video" in c && c.video ? (
                  <VideoDoGemeo src={c.video} capa={c.imagem} alt={c.alt} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imagem} alt={c.alt} loading="lazy" className="w-full h-full object-cover object-top" />
                )}
                <span className="absolute top-3 left-3 w-10 h-10 rounded-lg bg-orange-500 text-white font-black text-xl flex items-center justify-center">
                  {c.n}
                </span>
                <span
                  className={`absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-semibold ${
                    c.etiqueta === "Novo" ? "bg-amber-400/90 text-[#0a1f3b]" : "bg-[#0a1f3b]/85 text-[#dfe6ef]"
                  }`}
                >
                  {c.etiqueta}
                </span>
                {/* No cartão com vídeo, a legenda da imagem sobe para o topo: embaixo
                    ela brigava com a legenda queimada do próprio vídeo (01/10). */}
                <figcaption
                  className={`absolute right-3 text-[11px] text-white/85 drop-shadow ${("video" in c && c.video) || ("legendaNoTopo" in c && c.legendaNoTopo) ? "top-12" : "bottom-2"}`}
                >
                  {c.legenda}
                </figcaption>
              </figure>
              <div className="p-6 flex flex-col flex-1">
                <p className="flex items-center gap-2 text-xl font-black text-[var(--text-primary)] mb-3">
                  <c.icon className="w-5 h-5 text-orange-400" /> {c.titulo}
                </p>
                <p className="text-[var(--text-muted)] leading-relaxed mb-5 flex-1">{c.texto}</p>
                <ul className="space-y-2">
                  {c.itens.map((i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <span className="w-2 h-2 rounded-sm bg-orange-500 shrink-0" /> {i}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-[var(--text-muted)]">
          A nossa sugestão: intercale. Nas semanas em que você grava, comece pelo vídeo; nas outras, o gêmeo ou a
          IA mantêm a sua presença no ar.{" "}
          <a href="#calculadora" className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 font-semibold">
            Veja quanto isso custaria com gente <ArrowRight className="w-4 h-4" />
          </a>
        </p>
      </div>
    </section>
  );
}
