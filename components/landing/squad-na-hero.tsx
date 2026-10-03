"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AGENTES } from "@/lib/squad/estado-do-squad";
import { LogoLinkedIn, LogoX, LogoInstagram, LogoFacebook, LogoYouTube, LogoTikTok } from "@/components/social/logos-redes";

/**
 * O SQUAD NA HERO, com os sete agentes de verdade.
 *
 * Ele existiu, saiu em 19/09 para o clipe da plataforma entrar no lugar, e
 * VOLTOU no mesmo dia por um pedido do Bruno com uma condição nova: "cada um
 * com seu avatar igual da plataforma". A troca inteira tinha sido pelo motivo
 * certo (uma ilustração não prova nada, o clipe prova) e pelo custo errado: a
 * hero passou a mostrar o PRODUTO e deixou de apresentar QUEM trabalha, que é
 * a coisa que diferencia a Demandou de um gerador de post.
 *
 * Agora as duas coisas convivem: aqui ficam as pessoas, e o clipe desce para
 * uma seção própria, maior, onde ele tem espaço para ser visto (ver
 * components/landing/o-que-eles-fazem.tsx).
 *
 * OS NOMES, OS PAPÉIS E AS CORES NÃO SÃO ESCRITOS AQUI. Vêm de
 * lib/squad/estado-do-squad.ts, a mesma lista que o escritório 3D e o quadro
 * da semana usam. Uma landing com um elenco próprio é uma landing que mente
 * assim que alguém renomear um agente.
 *
 * O LOGO DA REDE ENTRA ONDE O AGENTE É DE UMA REDE. É regra do Bruno, dada em
 * 19/09: "toda vez que for citar uma rede, precisa trazer o logo dela, as
 * pessoas estão acostumadas com o logo, é padrão claro de identificação".
 */

/** A rede de cada agente, quando ele tem uma. Chave é o id do agente. */
const REDE_DO_AGENTE: Record<string, React.ComponentType<{ className?: string }>> = {
  "lucas-linkedin": LogoLinkedIn,
  "xavier-x": LogoX,
  "igor-instagram": LogoInstagram,
  "fernanda-facebook": LogoFacebook,
  "tiago-tiktok": LogoTikTok,
  "yan-youtube": LogoYouTube,
};

/**
 * O que cada agente diz enquanto trabalha.
 *
 * Frases de TRABALHO, no gerúndio e específicas, não slogans: o cartão precisa
 * parecer um time em serviço, e time em serviço fala do que está fazendo
 * agora. Genérico ("Otimizando conteúdo") é o que faz parecer enfeite.
 */
const FALA: Record<string, string> = {
  "roberto-radar": "Procurando fonte para o dado do terceiro parágrafo",
  "lucas-linkedin": "Reescrevendo a abertura, estava começando pelo meio",
  "xavier-x": "Cortando a thread em cinco, a quarta estava frouxa",
  "igor-instagram": "Trocando a primeira linha da legenda, não parava o polegar",
  "fernanda-facebook": "Fechando o post com uma pergunta para a comunidade",
  "tiago-tiktok": "Repetindo o gancho do vídeo na legenda",
  "yan-youtube": "Título com 58 caracteres e capítulos marcados",
  "diana-design": "Desenhando a manchete em 1080x1350",
  "vitor-video": "Achando o corte vertical de 41 segundos",
  "vera-veredito": "Conferindo se o vídeo conversa com a legenda",
  "paulo-publicador": "Agendando terça, 9h, nas seis redes",
};

export function SquadNaHero() {
  /**
   * Um agente ativo por vez, passando o bastão.
   *
   * É assim que a esteira roda de verdade (um trabalho por grupo por vez, ver
   * lib/fila), então a animação não é licença poética: é o comportamento real
   * em velocidade de vitrine.
   */
  const [ativo, setAtivo] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setAtivo((i) => (i + 1) % AGENTES.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="overflow-hidden rounded-2xl border shadow-[0_30px_80px_rgba(0,0,0,.45)]"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      {/* A barra de janela diz que aquilo é uma TELA do produto, e não um
          infográfico sobre o produto. */}
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
        <span className="ml-2 text-xs font-mono" style={{ color: "var(--text-muted)" }}>
          seu marketing, ao vivo
        </span>
      </div>

      {/* Linhas mais baixas desde 29/09: com onze agentes (um por rede), a altura
          de sete empurrava o rodapé dos logos para fora da primeira dobra. */}
      <div className="p-2.5 sm:p-3 space-y-0.5">
        {AGENTES.map((agente, i) => {
          const trabalhando = i === ativo;
          const Rede = REDE_DO_AGENTE[agente.id];
          return (
            <div
              key={agente.id}
              className="flex items-center gap-3 rounded-xl px-3 py-1.5 border transition-colors duration-500"
              style={{
                borderColor: trabalhando ? `${agente.cor}66` : "transparent",
                background: trabalhando ? `${agente.cor}14` : "transparent",
              }}
            >
              {/* O AVATAR: o círculo na cor do agente, a mesma cor que ele tem
                  no escritório 3D e no quadro da semana. É o que faz a pessoa
                  reconhecer o Roberto azul lá dentro depois de ver aqui. */}
              <span
                className="relative w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: `${agente.cor}22`, border: `1.5px solid ${agente.cor}` }}
              >
                {/* RETRATO FICTÍCIO (02/10, pedido do Matheus): pessoa gerada
                    por IA, que não existe, no lugar do boneco de massinha. Só
                    na landing; o produto segue com os bonecos. A barra da
                    janela diz "equipe de IA" para não parecer funcionário. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/equipe/${agente.id}.jpg`}
                  alt={`${agente.nome}, ${agente.papel}: retrato fictício gerado por IA`}
                  width={36}
                  height={36}
                  className="h-full w-full rounded-full object-cover"
                />
                {trabalhando && (
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    style={{ border: `1.5px solid ${agente.cor}` }}
                    initial={{ opacity: 0.8, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.55 }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                    {agente.nome}
                  </span>
                  {/* O logo da rede, no tamanho de etiqueta. */}
                  {Rede && <Rede className="!w-4 !h-4 !rounded" />}
                </div>
                {/* A cor do agente misturada com a cor do texto (01/10): o azul
                    do Lucas puro sumia no fundo azul-noite novo. */}
                <div className="text-xs truncate" style={{ color: trabalhando ? `color-mix(in srgb, ${agente.cor} 55%, var(--text-primary))` : "var(--text-muted)" }}>
                  {trabalhando ? FALA[agente.id] : agente.papel}
                </div>
              </div>

              <span
                className="text-[10px] font-semibold uppercase tracking-wide shrink-0"
                style={{ color: trabalhando ? `color-mix(in srgb, ${agente.cor} 55%, var(--text-primary))` : "var(--text-muted)" }}
              >
                {trabalhando ? "agora" : "pronto"}
              </span>
            </div>
          );
        })}
      </div>

      {/* O rodapé fecha a promessa: as seis redes (o TikTok entrou em 29/09), com os logos, e o YouTube
          junto. O YouTube entrou em 19/09 por falta notada pelo Bruno: a
          plataforma gera a thumb e o vídeo, então esconder o logo dele era
          entregar menos do que se faz. */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 border-t"
        style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Publica em
        </span>
        <div className="flex items-center gap-1.5">
          <LogoLinkedIn className="!w-6 !h-6 !rounded-md" />
          <LogoInstagram className="!w-6 !h-6 !rounded-md" />
          <LogoFacebook className="!w-6 !h-6 !rounded-md" />
          <LogoX className="!w-6 !h-6 !rounded-md" />
          <LogoYouTube className="!w-6 !h-6 !rounded-md" />
          <LogoTikTok className="!w-6 !h-6 !rounded-md" />
        </div>
      </div>
    </div>
  );
}
