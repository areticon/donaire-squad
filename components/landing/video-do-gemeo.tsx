"use client";

import { useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

/**
 * O GÊMEO FALANDO NO CARTÃO (01/10, pedido do Bruno).
 *
 * Toca sozinho, mudo e em laço, com a legenda queimada no próprio vídeo: quem
 * só rola a página lê o que o gêmeo diz. O clique liga o som e volta ao
 * começo, porque ouvir a voz é a prova (o rosto e a voz são do Bruno, gerados
 * a partir de uma foto e um minuto de voz, com a autorização dele).
 *
 * Componente de cliente só por causa do botão de som; o cartão em volta
 * continua de servidor.
 */
export function VideoDoGemeo({ src, capa, alt }: { src: string; capa: string; alt: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [mudo, setMudo] = useState(true);

  function alternar() {
    const v = ref.current;
    if (!v) return;
    const novo = !mudo;
    v.muted = novo;
    if (!novo) {
      v.currentTime = 0;
      void v.play().catch(() => {});
    }
    setMudo(novo);
  }

  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={capa}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={alt}
        className="w-full h-full object-cover object-top"
      />
      <button
        type="button"
        onClick={alternar}
        aria-label={mudo ? "Ouvir o gêmeo" : "Tirar o som"}
        // top-[4.5rem] e não top-16 (01/10): no celular o botão encostava na
        // legenda da imagem, que fica logo acima, à direita.
        className="absolute top-[4.5rem] left-3 inline-flex items-center gap-1.5 rounded-full bg-[#0a1f3b]/85 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0a1f3b]"
      >
        {mudo ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
        {mudo ? "Ouvir a voz" : "Sem som"}
      </button>
    </>
  );
}
