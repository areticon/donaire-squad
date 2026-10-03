"use client";

import { useEffect, useRef, useState } from "react";
import { Gauge, Wifi } from "lucide-react";
import {
  ARQUIVO_GRANDE_BYTES,
  ENVIO_LONGO_S,
  bytesPorSegundo,
  emDadosMoveis,
  registrar,
  segundosQueFaltam,
  tempoPorExtenso,
  velocidadePorExtenso,
  type Amostra,
} from "@/lib/media/velocidade-do-envio";

/**
 * O medidor do envio (item 14, 29/09): a velocidade da rede de quem envia,
 * medida no próprio envio, e quanto falta para o arquivo inteiro.
 *
 * Fica ao lado da barra que já existia, sem mexer no fluxo: recebe os bytes
 * enviados que o `onUploadProgress` já dava e faz a conta aqui.
 */
export function MedidorDeEnvio({ enviados, total }: { enviados: number; total: number }) {
  const amostras = useRef<Amostra[]>([]);
  const [bps, setBps] = useState<number | null>(null);

  // Cada progresso vira uma amostra da janela móvel.
  useEffect(() => {
    amostras.current = registrar(amostras.current, { t: Date.now(), enviados });
    setBps(bytesPorSegundo(amostras.current));
  }, [enviados]);

  // O tique de 1 s: se a rede parar de andar, sem progresso novo, a amostra
  // repetida derruba a média, e a estimativa cresce em vez de mentir parada.
  useEffect(() => {
    const t = setInterval(() => {
      const ultima = amostras.current.at(-1);
      if (ultima && Date.now() - ultima.t > 2000) {
        amostras.current = registrar(amostras.current, { t: Date.now(), enviados: ultima.enviados });
        setBps(bytesPorSegundo(amostras.current));
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const faltam = segundosQueFaltam(total, enviados, bps);
  const movel = emDadosMoveis();
  const longo = total > ARQUIVO_GRANDE_BYTES || (faltam !== null && faltam > ENVIO_LONGO_S);

  return (
    <div className="mt-2 space-y-2">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={{ color: "var(--text-muted)" }} data-medidor>
        <span className="inline-flex items-center gap-1.5">
          <Gauge className="h-4 w-4 text-orange-400" />
          {bps === null ? (
            "Medindo a velocidade da sua rede"
          ) : (
            <>
              Sua rede está enviando a{" "}
              <strong style={{ color: "var(--text-primary)" }}>{velocidadePorExtenso(bps)}</strong>
            </>
          )}
        </span>
        {faltam !== null && (
          <span>
            Faltam <strong style={{ color: "var(--text-primary)" }}>{tempoPorExtenso(faltam)}</strong> para o arquivo inteiro
          </span>
        )}
      </p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        O tempo depende da internet de quem envia, não da plataforma: é a sua conexão subindo o arquivo.
      </p>
      {(longo || movel) && <AvisoDeWifi movel={movel === true} />}
    </div>
  );
}

/**
 * O conselho de wi-fi. Com o celular detectado vira alerta (vai gastar a
 * franquia); sem saber o tipo de rede, é só conselho para arquivo grande.
 */
export function AvisoDeWifi({ movel }: { movel: boolean }) {
  return (
    <p
      className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
      style={{ borderColor: "color-mix(in srgb, var(--accent-orange) 35%, var(--border))", color: "var(--text-primary)" }}
      data-aviso-wifi
    >
      <Wifi className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" />
      {movel
        ? "Você está em dados móveis. Um arquivo deste tamanho consome boa parte da franquia e demora mais: se puder, troque para o wi-fi antes de enviar."
        : "Arquivo longo: prefira o wi-fi em vez dos dados móveis do celular. É mais rápido e não gasta a sua franquia."}
    </p>
  );
}
