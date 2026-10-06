/**
 * A trava dos ambientes (06/10/2026): dev nunca fala com o banco de produção,
 * e produção nunca fala com um banco que não seja o dela.
 *
 * Por que existe: até agosto um banco só servia produção e desenvolvimento, e
 * o Preview da Vercel tem `DATABASE_URL` gravada há semanas sem ninguém saber
 * para onde aponta. Com o ambiente de dev (banco `demandou-dev`, worker `dev`
 * no Railway, Preview em dev.demandou.com), basta uma variável colada no lugar
 * errado para um teste escrever em cliente de verdade. A trava confere na
 * partida, antes do primeiro comando ao banco, e recusa subir.
 *
 * Como reconhece o banco: pelo "ref" do projeto Supabase, que aparece no
 * usuário do pooler (`postgres.<ref>`) e no host da conexão direta
 * (`db.<ref>.supabase.co`). O host do pooler (`aws-0-us-east-2...`) é o mesmo
 * para todos os projetos da região, então ele sozinho não prova nada. A
 * transferência de organização no Supabase mantém o ref, então a separação
 * das contas não mexe aqui.
 *
 * Esta trava só LÊ variáveis e analisa texto. Nunca abre conexão, nunca roda
 * comando no banco (e muito menos SET: no pooler do Supabase o SET vaza para
 * as outras conexões, incidente de 01/10).
 *
 * Arquivo .mjs puro para servir a todos que partem antes do TypeScript:
 * `scripts/build.mjs`, `prisma.config.ts` (migrações), `lib/db/prisma.ts`
 * (o app) e os scripts de dev. O worker tem a cópia dele em
 * `worker/src/trava-do-ambiente.mjs`, porque a imagem do Railway só leva a
 * pasta `worker/`.
 */

/** O projeto Supabase de produção (`demandou`). Trocar só se a produção mudar de projeto. */
export const REF_DO_BANCO_DE_PRODUCAO = "lvrolepscwpexrakemrq";

/** O host do worker de produção no Railway. */
export const HOST_DO_WORKER_DE_PRODUCAO = "video-worker-production-2eb6.up.railway.app";

/** Os endereços públicos da produção. */
export const HOSTS_DO_APP_DE_PRODUCAO = ["demandou.com", "www.demandou.com"];

/** O endereço fixo do ambiente de dev (alias do Preview). */
export const HOST_DO_APP_DE_DEV = "dev.demandou.com";

const AMBIENTES = ["producao", "dev", "local"];

/**
 * Em que ambiente este processo roda.
 *
 * `DEMANDOU_AMBIENTE` explícito vence. Sem ele: `VERCEL_ENV=production` é
 * produção, `preview` é dev, e o resto (máquina do Bruno, scripts) é local.
 * Contradição entre os dois (dizer dev num deploy de produção) é erro, não
 * palpite.
 */
/** @param {Record<string, string | undefined>} [env] */
export function ambienteAtual(env = process.env) {
  const explicito = (env.DEMANDOU_AMBIENTE ?? "").trim().toLowerCase();
  const vercel = env.VERCEL_ENV;
  const pelaVercel = vercel === "production" ? "producao" : vercel === "preview" ? "dev" : "local";
  if (!explicito) return pelaVercel;
  if (!AMBIENTES.includes(explicito)) {
    throw new Error(`[trava] DEMANDOU_AMBIENTE="${explicito}" não existe; use producao, dev ou local`);
  }
  if (vercel === "production" && explicito !== "producao") {
    throw new Error(`[trava] deploy de produção da Vercel com DEMANDOU_AMBIENTE="${explicito}": variável no ambiente errado`);
  }
  if (vercel === "preview" && explicito === "producao") {
    throw new Error('[trava] Preview da Vercel com DEMANDOU_AMBIENTE="producao": o Preview é dev, nunca produção');
  }
  return explicito;
}

/**
 * O ref do projeto Supabase de uma URL de banco, ou o host quando não é
 * Supabase (Postgres local, por exemplo). `null` para vazio ou ilegível.
 */
export function identidadeDoBanco(url) {
  if (!url || typeof url !== "string") return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return { ref: null, host: null, legivel: false };
  }
  const host = u.hostname.toLowerCase();
  const usuario = decodeURIComponent(u.username || "");
  const peloUsuario = usuario.match(/^[a-z_]+\.([a-z0-9]{20})$/i)?.[1] ?? null;
  const peloHost = host.match(/^(?:db\.)?([a-z0-9]{20})\.supabase\.(?:co|com)$/)?.[1] ?? null;
  return { ref: (peloUsuario ?? peloHost)?.toLowerCase() ?? null, host, legivel: true };
}

export function ehBancoDeProducao(url) {
  const id = identidadeDoBanco(url);
  return Boolean(id?.ref && id.ref === REF_DO_BANCO_DE_PRODUCAO);
}

function hostDe(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Confere as variáveis contra o ambiente e devolve `{ ambiente, problemas,
 * avisos }`. Não lança: quem chama decide (ver `travarAmbiente`).
 */
/** @param {Record<string, string | undefined>} [env] */
export function conferirAmbiente(env = process.env) {
  const ambiente = ambienteAtual(env);
  const problemas = [];
  const avisos = [];
  const urls = { DATABASE_URL: env.DATABASE_URL, DIRECT_URL: env.DIRECT_URL };

  if (ambiente === "producao") {
    for (const [nome, url] of Object.entries(urls)) {
      if (!url) continue;
      const id = identidadeDoBanco(url);
      if (!id?.legivel) problemas.push(`${nome} ilegível em produção`);
      else if (id.ref !== REF_DO_BANCO_DE_PRODUCAO) {
        problemas.push(`${nome} de produção aponta para outro banco (${id.ref ?? id.host}), não para o projeto de produção`);
      }
    }
    if (hostDe(env.NEXT_PUBLIC_APP_URL) === HOST_DO_APP_DE_DEV) {
      problemas.push("NEXT_PUBLIC_APP_URL de produção aponta para dev.demandou.com");
    }
    return { ambiente, problemas, avisos };
  }

  if (ambiente === "dev") {
    for (const [nome, url] of Object.entries(urls)) {
      if (!url) {
        if (nome === "DATABASE_URL") problemas.push("DATABASE_URL vazia em dev (sem ela o app cairia no endereço padrão)");
        continue;
      }
      const id = identidadeDoBanco(url);
      if (!id?.legivel) problemas.push(`${nome} ilegível em dev`);
      else if (id.ref === REF_DO_BANCO_DE_PRODUCAO) problemas.push(`${nome} de dev aponta para o BANCO DE PRODUÇÃO`);
    }
    const worker = hostDe(env.VIDEO_WORKER_URL);
    if (worker === HOST_DO_WORKER_DE_PRODUCAO) problemas.push("VIDEO_WORKER_URL de dev aponta para o worker de produção");
    const app = hostDe(env.NEXT_PUBLIC_APP_URL);
    if (!app) problemas.push("NEXT_PUBLIC_APP_URL vazia em dev (o padrão do código é demandou.com, e os callbacks iriam para a produção)");
    else if (HOSTS_DO_APP_DE_PRODUCAO.includes(app)) problemas.push("NEXT_PUBLIC_APP_URL de dev aponta para a produção");
    const auth = hostDe(env.BETTER_AUTH_URL);
    if (auth && HOSTS_DO_APP_DE_PRODUCAO.includes(auth)) problemas.push("BETTER_AUTH_URL de dev aponta para a produção");
    if ((env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_")) problemas.push("STRIPE_SECRET_KEY de dev é chave de produção (sk_live_); use a de teste");
    for (const nome of ["PUBLICAR_VIA_BLOTATO", "PUBLICAR_VIA_BLOTATO_CONTAS"]) {
      if ((env[nome] ?? "").trim()) problemas.push(`${nome} ligado em dev: dev nunca publica em rede de verdade`);
    }
    if ((env.ZAPSIGN_AMBIENTE ?? "").trim().toLowerCase() === "producao") problemas.push('ZAPSIGN_AMBIENTE="producao" em dev: contrato de teste viraria contrato de verdade');
    return { ambiente, problemas, avisos };
  }

  // local: a máquina do Bruno ainda usa o banco compartilhado (memória
  // "tela logada só no dev local"), então aqui é aviso, nunca bloqueio.
  if (ehBancoDeProducao(env.DATABASE_URL) || ehBancoDeProducao(env.DIRECT_URL)) {
    avisos.push("processo local apontando para o BANCO DE PRODUÇÃO (permitido em local; com DEMANDOU_AMBIENTE=dev ele recusa)");
  }
  return { ambiente, problemas, avisos };
}

let jaAvisou = false;

/**
 * Lança se o ambiente estiver cruzado. Avisos saem uma vez por processo.
 * Chamada na partida do app, das migrações, do build e dos scripts de dev.
 */
/**
 * @param {Record<string, string | undefined>} [env]
 * @param {{ origem?: string }} [opcoes]
 */
export function travarAmbiente(env = process.env, { origem = "app" } = {}) {
  const { ambiente, problemas, avisos } = conferirAmbiente(env);
  if (avisos.length && !jaAvisou) {
    jaAvisou = true;
    for (const a of avisos) console.warn(`[trava ${origem}] aviso: ${a}`);
  }
  if (problemas.length) {
    throw new Error(
      `[trava ${origem}] ambiente "${ambiente}" recusado:\n- ${problemas.join("\n- ")}\n` +
        "Conferir as variáveis do ambiente (Vercel, Railway ou .env) antes de subir."
    );
  }
  return ambiente;
}
