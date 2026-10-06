#!/usr/bin/env node
/**
 * Deploy pela cópia limpa, para dev ou para produção (06/10/2026).
 *
 * É a mesma receita que publica a produção desde setembro, agora escrita uma
 * vez só e com as travas que hoje dependem de memória:
 *
 *   1. git archive HEAD numa pasta fora do repositório (nada que esteja fora do
 *      git sobe, nada do working tree sujo sobe);
 *   2. .vercel/project.json da pasta principal;
 *   3. junção de node_modules para a pasta principal;
 *   4. npx prisma generate e npx tsc --noEmit;
 *   5. app: produção `npx vercel --prod --yes`; dev `npx vercel --yes` (Preview)
 *      e `npx vercel alias set <url> dev.demandou.com`;
 *   6. worker: `railway up --service video-worker --detach --path-as-root
 *      <copia>/worker` de dentro de worker/ da pasta principal (a ligada ao
 *      projeto no Railway), com `--environment dev` em dev.
 *
 * As travas:
 *   - produção só da branch de produção (hoje backup-0210; depois `producao`),
 *     com a árvore limpa, e só um commit que JÁ ESTÁ na branch `dev` (tudo passa
 *     por dev antes);
 *   - produção só terça a quinta, das 11h00 às 13h30 (horário de Brasília);
 *   - worker só com /saude ocioso (emAndamento, amostras, trabalhos e fila em
 *     zero) e, quando o /saude diz o ambiente, o ambiente certo;
 *   - dev confere que o Preview da Vercel tem DEMANDOU_AMBIENTE, DATABASE_URL e
 *     VIDEO_WORKER_URL gravadas (os valores, quem confere é a trava do app na
 *     partida: lib/ambiente/trava-do-banco.mjs).
 *
 * Uso (na pasta do projeto):
 *   node scripts/deploy/copia-limpa.mjs --alvo dev                 só o plano e as conferências
 *   node scripts/deploy/copia-limpa.mjs --alvo dev --preparar      + cópia, prisma generate e tsc (nada sobe)
 *   node scripts/deploy/copia-limpa.mjs --alvo dev --executar      + publica app e worker de dev
 *   node scripts/deploy/copia-limpa.mjs --alvo producao --so app --executar
 *
 * Opções: --so app|worker|tudo (padrão tudo). O worker de dev é lido de
 * DEMANDOU_WORKER_DEV_URL ou do VIDEO_WORKER_URL do .env.dev.local.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAMO_DE_PRODUCAO = process.env.DEMANDOU_RAMO_PRODUCAO || "backup-0210";
const RAMO_DE_DEV = "dev";
const WORKER_DE_PRODUCAO = "https://video-worker-production-2eb6.up.railway.app";
const ALIAS_DE_DEV = "dev.demandou.com";
const SERVICO_DO_WORKER = "video-worker";
const AMBIENTE_RAILWAY_DE_DEV = "dev";
const TAR = process.platform === "win32" ? "C:\\Windows\\System32\\tar.exe" : "tar";

// ─── argumentos ───
const args = process.argv.slice(2);
function opcao(nome, padrao) {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : padrao;
}
const alvo = opcao("alvo", "");
const so = opcao("so", "tudo");
const executar = args.includes("--executar");
const preparar = executar || args.includes("--preparar");
if (!["dev", "producao"].includes(alvo)) parar("informe --alvo dev ou --alvo producao");
if (!["app", "worker", "tudo"].includes(so)) parar("--so aceita app, worker ou tudo");
const comApp = so !== "worker";
const comWorker = so !== "app";

// ─── utilidades ───
function parar(msg) {
  console.error(`\n[deploy] PAROU: ${msg}\n`);
  process.exit(1);
}
function passo(msg) {
  console.log(`[deploy] ${msg}`);
}
function rodar(cmd, argv, { cwd, capturar = false, shell = false } = {}) {
  const r = spawnSync(cmd, argv, { cwd, encoding: "utf8", stdio: capturar ? "pipe" : "inherit", shell });
  if (r.status !== 0) {
    if (capturar) process.stderr.write(r.stderr ?? "");
    parar(`${cmd} ${argv.join(" ")} saiu com ${r.status ?? r.error?.message}`);
  }
  return (r.stdout ?? "").trim();
}
function git(...argv) {
  return rodar("git", argv, { cwd: AQUI, capturar: true });
}

const AQUI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// A pasta principal (onde moram .vercel e node_modules), mesmo rodando de um worktree.
const PRINCIPAL = resolve(AQUI, git("rev-parse", "--git-common-dir"), "..");

function lerEnvArquivo(caminho) {
  if (!existsSync(caminho)) return {};
  const saida = {};
  for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) saida[m[1]] = m[2];
  }
  return saida;
}

/** Hora de Brasília, sem depender do fuso da máquina. */
function agoraEmBrasilia() {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return { dia: partes.weekday, minutos: Number(partes.hour) * 60 + Number(partes.minute), texto: `${partes.weekday} ${partes.hour}:${partes.minute}` };
}

async function saudeDoWorker(base, ambienteEsperado) {
  let corpo;
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/saude`, { signal: AbortSignal.timeout(15_000) });
    corpo = await r.json();
  } catch (e) {
    parar(`/saude de ${base} não respondeu (${e?.message ?? e})`);
  }
  const ocupado = ["emAndamento", "amostrasEmAndamento", "trabalhos", "montagensNaFila"].filter((k) => Number(corpo?.[k] ?? 0) > 0);
  if (!corpo?.ok) parar(`/saude de ${base} não disse ok`);
  if (corpo.desligando) parar(`worker ${base} está desligando (outro deploy em curso?)`);
  if (ocupado.length) {
    parar(`worker ${base} trabalhando (${ocupado.map((k) => `${k}=${corpo[k]}`).join(", ")}); esperar /saude ocioso`);
  }
  if (corpo.ambiente && corpo.ambiente !== ambienteEsperado) {
    parar(`worker ${base} diz ambiente "${corpo.ambiente}", esperado "${ambienteEsperado}"`);
  }
  return corpo;
}

// ─── conferências (só leitura) ───
const ramo = git("rev-parse", "--abbrev-ref", "HEAD");
const hash = git("rev-parse", "--short", "HEAD");
const sujo = git("status", "--porcelain", "--untracked-files=no");
passo(`alvo ${alvo}, ${so}; branch ${ramo} em ${hash}`);

if (alvo === "producao") {
  if (ramo !== RAMO_DE_PRODUCAO) parar(`produção só sai da branch ${RAMO_DE_PRODUCAO} (está em ${ramo})`);
  if (sujo) parar("árvore com alterações não commitadas; produção sai só de commit");
  const r = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", RAMO_DE_DEV], { cwd: AQUI });
  if (r.status !== 0) parar(`o commit ${hash} ainda não passou pela branch ${RAMO_DE_DEV}; provar em dev primeiro`);
  const { dia, minutos, texto } = agoraEmBrasilia();
  const naJanela = ["Tue", "Wed", "Thu"].includes(dia) && minutos >= 11 * 60 && minutos <= 13 * 60 + 30;
  if (!naJanela) parar(`fora da janela de produção (terça a quinta, 11h00 às 13h30); agora: ${texto} em Brasília`);
  passo(`janela ok (${texto} em Brasília)`);
} else {
  if (ramo !== RAMO_DE_DEV) parar(`dev só sai da branch ${RAMO_DE_DEV} (está em ${ramo})`);
  if (sujo) passo("aviso: há alterações não commitadas; elas NÃO sobem (a cópia é do HEAD)");
}

const envDev = lerEnvArquivo(join(PRINCIPAL, ".env.dev.local"));
const workerAlvo = alvo === "producao" ? WORKER_DE_PRODUCAO : process.env.DEMANDOU_WORKER_DEV_URL || envDev.VIDEO_WORKER_URL || "";
if (comWorker) {
  if (!workerAlvo) parar("endereço do worker de dev desconhecido (DEMANDOU_WORKER_DEV_URL ou VIDEO_WORKER_URL no .env.dev.local)");
  if (alvo === "dev" && workerAlvo.includes(new URL(WORKER_DE_PRODUCAO).hostname)) parar("o worker de dev configurado é o de produção");
  const s = await saudeDoWorker(workerAlvo, alvo);
  passo(`/saude ocioso em ${workerAlvo} (ambiente ${s.ambiente ?? "não informado"})`);
}

const projetoVercel = join(PRINCIPAL, ".vercel", "project.json");
if (comApp && !existsSync(projetoVercel)) parar(`falta ${projetoVercel}`);
const modulos = join(PRINCIPAL, "node_modules");
if (!existsSync(modulos)) parar(`falta ${modulos}`);

const copia = join(tmpdir(), "demandou-deploy", `${alvo}-${hash}-${Date.now()}`);
passo(`cópia limpa: ${copia}`);

if (!preparar) {
  console.log(`
[deploy] Só o plano (nada foi criado). Os passos seriam:
  git archive HEAD -> ${copia}
  copiar ${projetoVercel}
  mklink /J node_modules -> ${modulos}
  npx prisma generate; npx tsc --noEmit
${comApp ? (alvo === "producao" ? "  npx vercel --prod --yes\n" : `  npx vercel env ls preview (confere DEMANDOU_AMBIENTE, DATABASE_URL, VIDEO_WORKER_URL)\n  npx vercel --yes; npx vercel alias set <url> ${ALIAS_DE_DEV}\n`) : ""}${
    comWorker
      ? `  (de ${join(PRINCIPAL, "worker")}) railway up --service ${SERVICO_DO_WORKER} --detach --path-as-root ${join(copia, "worker")}${alvo === "dev" ? ` --environment ${AMBIENTE_RAILWAY_DE_DEV}` : ""}\n`
      : ""
  }Use --preparar para montar a cópia e compilar, ou --executar para publicar.
`);
  process.exit(0);
}

// ─── cópia limpa ───
mkdirSync(copia, { recursive: true });
const pacote = `${copia}.tar`;
git("archive", "--format=tar", "-o", pacote, "HEAD");
rodar(TAR, ["-xf", pacote, "-C", copia]);
rmSync(pacote, { force: true });
if (comApp) {
  mkdirSync(join(copia, ".vercel"), { recursive: true });
  copyFileSync(projetoVercel, join(copia, ".vercel", "project.json"));
}
if (process.platform === "win32") rodar("cmd", ["/c", "mklink", "/J", join(copia, "node_modules"), modulos], { capturar: true });
else rodar("ln", ["-s", modulos, join(copia, "node_modules")]);
passo("npx prisma generate");
rodar("npx", ["prisma", "generate"], { cwd: copia, shell: true });
passo("npx tsc --noEmit");
rodar("npx", ["tsc", "--noEmit"], { cwd: copia, shell: true });
passo("tsc limpo");

if (!executar) {
  passo(`preparado e compilado em ${copia}; nada foi publicado (use --executar)`);
  process.exit(0);
}

// ─── publicação ───
if (comApp) {
  if (alvo === "producao") {
    passo("app: npx vercel --prod --yes");
    rodar("npx", ["vercel", "--prod", "--yes"], { cwd: copia, shell: true });
  } else {
    const nomes = rodar("npx", ["vercel", "env", "ls", "preview"], { cwd: copia, capturar: true, shell: true });
    const faltam = ["DEMANDOU_AMBIENTE", "DATABASE_URL", "DIRECT_URL", "VIDEO_WORKER_URL", "VIDEO_WORKER_SECRET", "NEXT_PUBLIC_APP_URL"].filter(
      (n) => !new RegExp(`^\\s*${n}\\s`, "m").test(nomes)
    );
    if (faltam.length) parar(`o Preview da Vercel não tem: ${faltam.join(", ")}`);
    passo("app: npx vercel --yes (Preview)");
    const saida = rodar("npx", ["vercel", "--yes"], { cwd: copia, capturar: true, shell: true });
    const url = saida.split(/\s+/).reverse().find((t) => /^https:\/\/\S+\.vercel\.app$/.test(t));
    if (!url) parar(`não achei o endereço do Preview na saída da Vercel:\n${saida}`);
    passo(`app: alias ${url} -> ${ALIAS_DE_DEV}`);
    rodar("npx", ["vercel", "alias", "set", url, ALIAS_DE_DEV], { cwd: copia, shell: true });
  }
}
if (comWorker) {
  await saudeDoWorker(workerAlvo, alvo); // de novo: o app pode ter despachado trabalho nesse meio tempo
  const pastaDoWorker = join(copia, "worker");
  const argv = ["up", "--service", SERVICO_DO_WORKER, "--detach", "--path-as-root", pastaDoWorker];
  if (alvo === "dev") argv.push("--environment", AMBIENTE_RAILWAY_DE_DEV);
  // De dentro de worker/ da pasta PRINCIPAL: é ela que está ligada ao projeto
  // (o `railway link` fica gravado por pasta); o código que sobe é o da cópia.
  passo(`worker: railway ${argv.join(" ")} (de ${join(PRINCIPAL, "worker")})`);
  rodar("railway", argv, { cwd: join(PRINCIPAL, "worker"), shell: true });
}

console.log(`
[deploy] Publicado ${alvo} (${hash}). Prova pós-deploy:
  - /saude do worker até "ok" com o contêiner novo (${workerAlvo || "sem worker nesta rodada"});
  - login em ${alvo === "producao" ? "https://demandou.com" : `https://${ALIAS_DE_DEV}`} e abrir um quadro;
  - npx tsx --test scripts/testes/*.test.mts;
  - registro no HANDOFF e no planner.
`);
