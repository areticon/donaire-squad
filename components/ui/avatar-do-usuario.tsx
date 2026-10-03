"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * O avatar da pessoa, com reserva de iniciais.
 *
 * Existe por causa de um defeito de 17/09: a foto some da tela sem motivo
 * aparente. A causa não era layout nem CSS. Quem entra pelo LinkedIn tem a foto
 * guardada como URL ASSINADA COM PRAZO do `media.licdn.com`, e essa URL expira.
 * A do Bruno venceu em 10/09 e passou a responder 403, medido.
 *
 * O código antigo já tinha reserva de inicial, mas ela só cobria foto AUSENTE
 * (`image` nulo). Foto PRESENTE e quebrada passava direto pela condição e virava
 * o ícone de imagem partida do navegador. **Ausência e falha são estados
 * diferentes, e o código só tratava o primeiro.**
 *
 * Por isso a reserva aqui é acionada por `onError`, e não só por `src` vazio:
 * é a única forma de saber que a imagem não carregou.
 *
 * O estado de falha é zerado quando o `src` muda, senão trocar a foto na tela
 * de conta mostraria as iniciais para sempre, porque o erro da foto anterior
 * teria ficado grudado.
 */
export function AvatarDoUsuario({
  src,
  nome,
  email,
  className,
  classeDoTexto = "text-sm",
}: {
  src: string | null | undefined;
  nome?: string | null;
  email?: string | null;
  /** Define o tamanho, sempre: por exemplo "w-8 h-8". */
  className?: string;
  classeDoTexto?: string;
}) {
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    setFalhou(false);
  }, [src]);

  const mostraImagem = Boolean(src) && !falhou;

  if (mostraImagem) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src as string}
        alt={nome ?? "Foto de perfil"}
        title={email ?? undefined}
        onError={() => setFalhou(true)}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <div
      title={email ?? undefined}
      aria-label={nome ?? email ?? "Foto de perfil"}
      className={cn(
        "shrink-0 rounded-full bg-orange-500 text-white flex items-center justify-center font-semibold select-none",
        classeDoTexto,
        className
      )}
    >
      {iniciaisDe(nome, email)}
    </div>
  );
}

/**
 * Até duas letras: a primeira do primeiro nome e a primeira do último.
 *
 * Cai para o e-mail quando não há nome, e para "?" quando não há nada, porque
 * um avatar vazio parece defeito e um "?" parece decisão.
 */
export function iniciaisDe(nome?: string | null, email?: string | null): string {
  const partes = (nome ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);

  if (partes.length >= 2) {
    const primeira = partes[0][0];
    const ultima = partes[partes.length - 1][0];
    return (primeira + ultima).toUpperCase();
  }
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  const doEmail = (email ?? "").trim();
  if (doEmail.length > 0) return doEmail.slice(0, 2).toUpperCase();

  return "?";
}
