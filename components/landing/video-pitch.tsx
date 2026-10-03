import { PlayCircle } from "lucide-react";

/**
 * O VÍDEO DE PITCH NO TOPO DA LANDING (01/10).
 *
 * 90 segundos narrados: a dor, as barreiras, a equipe de agentes, os três jeitos
 * de começar (vídeo próprio, gêmeo digital e do zero com IA), as objeções e a
 * economia contra time humano.
 * Montado com narração de voz pronta da ElevenLabs, cenas da Higgsfield sem
 * rosto real, telas reais da plataforma e cortes reais do Bruno. O roteiro e a
 * montagem estão no scratchpad da sessão de 01/10 (montar_pitch.py).
 *
 * Mora no Blob PÚBLICO com caminho fixo e versão no nome: trocar o vídeo é
 * subir outro (scripts/tmp/subir-pitch-0110.mts) e mudar a constante, e o
 * cache longo do CDN nunca serve a versão velha com o nome novo.
 *
 * `preload="none"` de propósito: são 31 MB, e a landing não pode pagar isso
 * de quem só rola a página. A capa carrega; o vídeo, no clique.
 *
 * A legenda está queimada no próprio vídeo, porque metade de quem chega pelo
 * celular assiste sem som.
 */
// A VERSÃO 2 (01/10): dor, barreiras, o squad, os três jeitos de começar (com
// o gêmeo real do Bruno falando), todas as redes e formatos, as objeções e a
// economia em porcentagem, nunca o preço. Identidade nova (azul-marinho; o logo
// B que estava no fecho saiu na versão 3).
// A primeira versão (pitch-0110, laranja, com "Postou") continua no Blob, fora
// da página. Montagem: scratchpad da sessão de 01/10, pitch/v2/montar_pitch2.py.
// A VERSÃO 3 (01/10): a v2 com o logo de 25/08 no fecho e o gêmeo novo do
// Bruno (OmniHuman, voz clonada); o resto do vídeo é o mesmo. Ganhou a versão
// vertical 9:16, que o celular abre no lugar da horizontal (na tela estreita
// a horizontal virava uma faixa de 200 px de altura com legenda ilegível).
// A v2 continua no Blob, fora da página. Montagem: scratchpad da sessão de
// 01/10, pitch/v3/montar_pitch3.py e vertical.py; subida:
// scripts/tmp/subir-pitch-v3-0110.mts (sem sobrescrever).
// A VERSÃO 4 (01/10, noite): a v3 com o gêmeo que o Bruno aprovou (rosto do
// OmniHuman 1.5 a partir de uma foto, VOZ REAL dele, frase inteira); o de voz
// clonada saiu robótico. O selo do trecho diz isso com todas as letras: "rosto
// gerado por IA a partir de uma foto" e "voz real do Bruno". O resto é a v3.
// A v3 continua no Blob, fora da página. Montagem: pitch/v4/montar_pitch4.py e
// vertical.py; subida: scripts/tmp/subir-pitch-v4-0110.mts (sem sobrescrever).
const BLOB = "https://9e0m1l1ldork0jul.public.blob.vercel-storage.com/landing";
const VIDEO: string = `${BLOB}/pitch-v4-0110.mp4`;
const CAPA: string = `${BLOB}/pitch-v4-0110-capa.jpg`;
const VIDEO_VERTICAL: string = `${BLOB}/pitch-v4-0110-vertical.mp4`;
const CAPA_VERTICAL: string = `${BLOB}/pitch-v4-0110-vertical-capa.jpg`;

/** A hero lê isto para decidir se o segundo botão leva ao vídeo. */
export const VIDEO_PITCH_PRONTO = VIDEO !== "";

export function VideoPitch() {
  if (!VIDEO_PITCH_PRONTO) return null;
  return (
    <section id="video" className="relative pt-4 pb-20 lg:pb-24 scroll-mt-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
          <p className="inline-flex items-center gap-2 text-sm text-orange-400 font-semibold">
            <PlayCircle className="w-4 h-4" /> Em 90 segundos
          </p>
          <p className="text-sm text-[var(--text-muted)]">Com som ou sem: a legenda está no vídeo.</p>
        </div>
        <div
          className="rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--bg-surface)]"
          style={{ boxShadow: "0 30px 70px rgba(0,0,0,.45)" }}
        >
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-2 text-xs font-mono text-[var(--text-muted)]">demandou, em 90 segundos</span>
          </div>
          {/* Dois vídeos, um por tamanho de tela, escondidos por CSS. Com
              preload="none" o escondido não baixa nada: só a capa de cada um. */}
          <video
            src={VIDEO}
            poster={CAPA}
            controls
            playsInline
            preload="none"
            className="hidden sm:block w-full aspect-video bg-black"
            aria-label="Vídeo de apresentação da Demandou: a dor de publicar todo dia, os três jeitos de começar e a conta contra um time humano"
          />
          <video
            src={VIDEO_VERTICAL}
            poster={CAPA_VERTICAL}
            controls
            playsInline
            preload="none"
            className="sm:hidden block w-full aspect-[9/16] bg-black"
            aria-label="Vídeo de apresentação da Demandou, versão vertical: a dor de publicar todo dia, os três jeitos de começar e a conta contra um time humano"
          />
        </div>
        <p className="mt-4 text-sm text-[var(--text-muted)] text-center max-w-3xl mx-auto">
          A equipe de agentes trabalhando, os três jeitos de começar (o seu vídeo, o seu gêmeo digital ou tudo do
          zero com IA) e quanto você economiza contra um time próprio. Telas, cortes e gêmeo reais da plataforma.
        </p>
      </div>
    </section>
  );
}
