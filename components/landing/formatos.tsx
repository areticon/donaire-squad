/**
 * CADA REDE NO FORMATO DELA, com peças REAIS (01/10, pedido do Bruno).
 *
 * A versão anterior mostrava quatro recortes da mesma arte de uma campanha de
 * teste. O Bruno pediu artes reais do projeto: todas as imagens abaixo saíram
 * da esteira para o projeto Empreendedorismo Cristão em setembro de 2026
 * (campanha cmuo1qggn, a partir da gravação de 29/09; capas e cortes dos
 * vídeos de 30/09), copiadas do Blob para public/pitch sem retoque.
 *
 * As medidas saem de `formatoDaPeca`, a MESMA tabela que a esteira usa:
 * landing que promete tamanho que o produto não corta é promessa que o
 * cliente confere no primeiro post.
 *
 * Onde não há arte (thread do X, enquete do LinkedIn), a seção diz o formato
 * em texto em vez de desenhar uma peça que não existe.
 */

import { formatoDaPeca } from "@/lib/media/formatos-das-redes";
import { BotaoDeCaptura } from "@/components/landing/botao-de-captura";
import { LogoLinkedIn, LogoX, LogoInstagram, LogoFacebook, LogoYouTube, LogoTikTok } from "@/components/social/logos-redes";

type Peca = {
  titulo: string;
  formato: string;
  imagens: string[];
  alt: string;
  /** Proporção da caixa (largura / altura), a da própria peça. */
  proporcao: number;
  Logos: Array<(p: { className?: string }) => React.ReactElement>;
};

function medida(platform: string, tipo?: string) {
  const f = formatoDaPeca(platform, tipo);
  return { texto: `${f.largura} × ${f.altura}`, proporcao: f.largura / f.altura };
}

export function Formatos() {
  const ig = medida("instagram", "image");
  const li = medida("linkedin", "image");
  const car = medida("instagram", "carousel");
  const yt = medida("youtube", "image");
  const vert = medida("instagram", "reels");
  const PECAS: Peca[] = [
    { titulo: "Post do Instagram", formato: ig.texto, imagens: ["/pitch/arte-instagram.jpg"], alt: "Arte real de feed do Instagram: Seu segundo cérebro, uma wiki onde tudo que você conversa e constrói fica salvo", proporcao: ig.proporcao, Logos: [LogoInstagram, LogoFacebook] },
    { titulo: "Carrossel", formato: car.texto, imagens: ["/pitch/arte-carrossel-1.jpg", "/pitch/arte-carrossel-2.jpg", "/pitch/arte-carrossel-3.jpg"], alt: "Três lâminas reais de um carrossel: Da manhã até o fim da tarde, o povo esperava em pé", proporcao: car.proporcao, Logos: [LogoInstagram, LogoLinkedIn] },
    { titulo: "Infográfico do LinkedIn", formato: li.texto, imagens: ["/pitch/arte-linkedin.jpg"], alt: "Infográfico real do LinkedIn: IA rasa limita seu potencial, construa agentes inteligentes", proporcao: li.proporcao, Logos: [LogoLinkedIn] },
    { titulo: "Capa do YouTube", formato: yt.texto, imagens: ["/pitch/capa-jetro-0210.jpg"], alt: "Capa real de vídeo do YouTube, em colagem: Jetro já ensinou isso a Moisés", proporcao: yt.proporcao, Logos: [LogoYouTube] },
    { titulo: "Reels, Shorts e TikTok", formato: vert.texto, imagens: ["/pitch/arte-vertical-0210.jpg"], alt: "Quadro real de um corte vertical em colagem, com a legenda construí duas empresas de software", proporcao: vert.proporcao, Logos: [LogoInstagram, LogoYouTube, LogoTikTok] },
  ];

  return (
    <section id="formatos" className="border-t border-[var(--border)]/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 space-y-10">
        <div className="space-y-3 max-w-2xl">
          <div className="selo">Formatos</div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
            {/* 02/10: a referência do Bruno dizia "mais de 7 redes"; a
                plataforma publica em 6, e é 6 que a página diz. */}
            Uma gravação, seis redes. <span className="text-orange-500">Zero retrabalho.</span>
          </h2>
          <p className="text-base sm:text-lg leading-relaxed text-[var(--text-muted)]">
            Não é a mesma imagem esticada em seis feeds. A equipe redesenha cada peça na proporção da rede e
            entrega no tamanho exato que ela publica: LinkedIn, Instagram, Facebook, X, YouTube e TikTok.
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            Todas as peças abaixo são reais: saíram da plataforma para um projeto de verdade, em setembro de 2026.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          {PECAS.map((p) => (
            <figure key={p.titulo} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-3 m-0 h-full">
              {/* No celular (duas colunas de ~160 px) o título com três logos
                  ficava espremido em uma palavra por linha ("Reels, / Shorts /
                  e / TikTok"); abaixo de 640 px os logos descem para baixo do
                  título (01/10). */}
              <figcaption className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)] leading-tight">{p.titulo}</span>
                <span className="flex gap-1 shrink-0">
                  {p.Logos.map((L, i) => (
                    <L key={i} className="!w-5 !h-5 !rounded-md" />
                  ))}
                </span>
              </figcaption>
              <div className="flex-1 flex items-center justify-center min-h-[180px]">
                {p.imagens.length > 1 ? (
                  <div className="relative w-[78%]" style={{ aspectRatio: p.proporcao }}>
                    {p.imagens.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={src}
                        src={src}
                        alt={i === 0 ? p.alt : ""}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover rounded-md border border-[var(--border)] shadow-lg"
                        style={{ transform: `translate(${(i - 1) * 12}%, ${(1 - i) * 3}%) rotate(${(i - 1) * 4}deg)`, zIndex: 3 - i }}
                      />
                    ))}
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imagens[0]}
                    alt={p.alt}
                    loading="lazy"
                    className="rounded-md border border-[var(--border)] max-h-[260px] w-auto max-w-full object-contain"
                    style={{ aspectRatio: p.proporcao }}
                  />
                )}
              </div>
              <p className="text-xs tabular-nums text-[var(--text-muted)]">{p.formato}</p>
            </figure>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <LogoX className="!w-10 !h-10 !rounded-lg" />
            <p className="text-sm text-[var(--text-muted)]">
              <strong className="text-[var(--text-primary)]">X:</strong> post e thread escritos para quem lê rolando,
              com a arte em {medida("x", "image").texto}.
            </p>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <LogoFacebook className="!w-10 !h-10 !rounded-lg" />
            <p className="text-sm text-[var(--text-muted)]">
              <strong className="text-[var(--text-primary)]">Facebook:</strong> a página com feed e reels, arte em{" "}
              {medida("facebook", "image").texto}.
            </p>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <LogoLinkedIn className="!w-10 !h-10 !rounded-lg" />
            <p className="text-sm text-[var(--text-muted)]">
              <strong className="text-[var(--text-primary)]">LinkedIn:</strong> perfil e página, com texto, enquete,
              carrossel e infográfico.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-5">
          <p className="text-[var(--text-primary)] flex-1">
            Seis redes, todos os formatos, uma campanha. <strong>É assim que sai toda semana.</strong>
          </p>
          <BotaoDeCaptura origem="formatos">Agendar reunião</BotaoDeCaptura>
        </div>
      </div>
    </section>
  );
}
