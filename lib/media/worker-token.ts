import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Autenticação entre a plataforma e o worker de vídeo.
 *
 * Diferente de `callback-token.ts`, que assina só o id do vídeo, aqui a
 * assinatura é sobre o CORPO INTEIRO da mensagem. A razão é o que passa por
 * aqui: o worker manda de volta as URLs dos arquivos que produziu, e o app
 * manda para o worker o que cortar. Assinar só o id deixaria qualquer um que
 * descobrisse um id trocar as URLs por outras, e o cliente publicaria no canal
 * dele um vídeo que não é o dele.
 *
 * Segredo próprio, e não o da autenticação: o worker é um serviço separado, em
 * outra hospedagem, e vazar o segredo dele não pode dar acesso às sessões de
 * ninguém. Vive em `VIDEO_WORKER_SECRET` nos dois lados.
 *
 * Comparação em tempo constante pelo mesmo motivo de sempre: comparação comum
 * vaza, pelo tempo, quantos bytes iniciais bateram.
 */

function segredo(): string {
  const s = process.env.VIDEO_WORKER_SECRET;
  if (!s) throw new Error("VIDEO_WORKER_SECRET não configurado");
  return s;
}

export function assinarCorpo(corpo: string): string {
  return createHmac("sha256", segredo()).update(corpo).digest("hex");
}

export function corpoAssinadoConfere(corpo: string, recebida: string | null): boolean {
  if (!recebida) return false;
  const esperada = assinarCorpo(corpo);
  if (recebida.length !== esperada.length) return false;
  return timingSafeEqual(Buffer.from(recebida), Buffer.from(esperada));
}

export const CABECALHO_ASSINATURA = "x-demandou-assinatura";
