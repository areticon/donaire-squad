/**
 * A trava dos ambientes no worker (06/10/2026).
 *
 * O worker não fala com banco: ele recebe o pedido assinado e devolve o
 * resultado por callback para o endereço que veio no pedido. Então o cruzamento
 * perigoso aqui é o worker de dev entregar resultado na produção (ou o de
 * produção entregar em dev). A primeira barreira é o segredo: cada ambiente tem
 * o seu `WORKER_SECRET`, e o pedido assinado com o segredo do outro morre em
 * 401. Esta trava é a segunda: confere o destino do callback antes de mandar,
 * e confere na partida que nenhuma variável de banco de produção entrou num
 * worker de dev.
 *
 * Em produção a única recusa nova é callback para dev.demandou.com, que a
 * produção nunca usa: o comportamento de hoje não muda.
 *
 * Cópia enxuta de `lib/ambiente/trava-do-banco.mjs` (a imagem do Railway só
 * leva a pasta `worker/`). Os dois testes ficam em
 * `scripts/testes/trava-do-ambiente-0610.test.mts`.
 */

export const REF_DO_BANCO_DE_PRODUCAO = "lvrolepscwpexrakemrq";
export const HOSTS_DO_APP_DE_PRODUCAO = ["demandou.com", "www.demandou.com"];
export const HOST_DO_APP_DE_DEV = "dev.demandou.com";

/**
 * `DEMANDOU_AMBIENTE` explícito vence; sem ele, o nome do ambiente do Railway
 * (`RAILWAY_ENVIRONMENT_NAME`, automático): "production" é produção, qualquer
 * outro nome do Railway é dev, e fora do Railway é local.
 */
/** @param {Record<string, string | undefined>} [env] */
export function ambienteDoWorker(env = process.env) {
  const explicito = (env.DEMANDOU_AMBIENTE ?? "").trim().toLowerCase();
  const railway = (env.RAILWAY_ENVIRONMENT_NAME ?? "").trim().toLowerCase();
  const peloRailway = !railway ? "local" : railway === "production" ? "producao" : "dev";
  if (!explicito) return peloRailway;
  if (!["producao", "dev", "local"].includes(explicito)) {
    throw new Error(`[trava worker] DEMANDOU_AMBIENTE="${explicito}" não existe; use producao, dev ou local`);
  }
  if (railway === "production" && explicito !== "producao") {
    throw new Error(`[trava worker] ambiente production do Railway com DEMANDOU_AMBIENTE="${explicito}"`);
  }
  if (railway && railway !== "production" && explicito === "producao") {
    throw new Error(`[trava worker] ambiente "${railway}" do Railway marcado como producao`);
  }
  return explicito;
}

function refDoBanco(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const usuario = decodeURIComponent(u.username || "");
    return (
      usuario.match(/^[a-z_]+\.([a-z0-9]{20})$/i)?.[1] ??
      u.hostname.match(/^(?:db\.)?([a-z0-9]{20})\.supabase\.(?:co|com)$/i)?.[1] ??
      null
    )?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** Na partida: lança se o ambiente estiver cruzado. Hoje o worker não tem variável de banco. */
/** @param {Record<string, string | undefined>} [env] */
export function travarPartidaDoWorker(env = process.env) {
  const ambiente = ambienteDoWorker(env);
  const problemas = [];
  for (const nome of ["DATABASE_URL", "DIRECT_URL"]) {
    const ref = refDoBanco(env[nome]);
    if (!ref) continue;
    if (ambiente === "dev" && ref === REF_DO_BANCO_DE_PRODUCAO) problemas.push(`${nome} do worker de dev aponta para o banco de produção`);
    if (ambiente === "producao" && ref !== REF_DO_BANCO_DE_PRODUCAO) problemas.push(`${nome} do worker de produção aponta para outro banco`);
  }
  if (problemas.length) throw new Error(`[trava worker] ambiente "${ambiente}" recusado:\n- ${problemas.join("\n- ")}`);
  return ambiente;
}

/**
 * O callback pode ir para este endereço? `null` quando pode; o motivo quando não.
 * Dev nunca entrega na produção; produção nunca entrega em dev.demandou.com.
 */
export function motivoParaRecusarCallback(url, ambiente) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null; // endereço ilegível falha sozinho no fetch, como antes
  }
  if (ambiente === "dev" && HOSTS_DO_APP_DE_PRODUCAO.includes(host)) {
    return `worker de dev recusou callback para a produção (${host})`;
  }
  if (ambiente === "producao" && host === HOST_DO_APP_DE_DEV) {
    return `worker de produção recusou callback para dev (${host})`;
  }
  return null;
}
