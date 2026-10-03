/**
 * LIGA AS CONTAS DO BLOTATO ÀS CONTAS DA DEMANDOU (30/09).
 *
 * Desde 01/10 a mesma coisa existe na tela /admin/redes (só admin), que é o
 * caminho do dia a dia. Este script ficou para o terminal e chama as MESMAS
 * funções (lib/admin/blotato-vinculos.ts), então as regras valem igual.
 *
 * O Blotato não tem API para conectar rede: o dono da conta autoriza no painel
 * deles (my.blotato.com/settings), dentro da conta Blotato da Demandou. Depois
 * disso, a conta aparece na API com um número, e este script grava esse número
 * na SocialAccount do projeto (`blotatoAccountId`, coluna que já existe). É o
 * vínculo que o roteador (lib/publish/roteador.ts) lê.
 *
 *   npx tsx --env-file=.env.local scripts/blotato-contas.mts listar
 *       contas ligadas no Blotato, com páginas do Facebook e do LinkedIn
 *
 *   npx tsx --env-file=.env.local scripts/blotato-contas.mts ver <projectId>
 *       contas do projeto e por onde cada uma publica hoje
 *
 *   npx tsx --env-file=.env.local scripts/blotato-contas.mts ligar <projectId> <contaBlotato> [--pagina <id>] [--social <socialAccountId>]
 *       sem --social: cria (ou atualiza) uma conta no projeto ligada só pelo
 *       Blotato, para a rede que a Meta ou o TikTok ainda não deixam conectar;
 *       com --social: liga a conta que o projeto JÁ tem (com token próprio),
 *       e ela passa a sair pelo Blotato quando a rede estiver em
 *       PUBLICAR_VIA_BLOTATO.
 *       Facebook exige --pagina; LinkedIn com --pagina publica na página da
 *       empresa, sem ela no perfil de quem conectou.
 *
 *   npx tsx --env-file=.env.local scripts/blotato-contas.mts desligar <socialAccountId>
 *       tira o vínculo. Desde 01/10, conta SÓ do Blotato (sem token próprio) é
 *       apagada, como na tela do cliente: antes ela ficava no painel dele como
 *       conta fantasma que não publicava.
 */
import { prisma } from "../lib/db/prisma";
import {
  desligarContaDaPonte,
  lerContasDaPonte,
  lerContasDosProjetos,
  ligarContaDaPonte,
} from "../lib/admin/blotato-vinculos";

const [comando, ...resto] = process.argv.slice(2);
const opcao = (nome: string) => {
  const i = resto.indexOf(`--${nome}`);
  return i >= 0 ? resto[i + 1] : undefined;
};
const posicionais = resto.filter((v, i) => !v.startsWith("--") && !resto[i - 1]?.startsWith("--"));

async function listar() {
  const contas = await lerContasDaPonte();
  if (!contas.length) {
    console.log("Nenhuma conta ligada no Blotato. Conecte em https://my.blotato.com/settings.");
    return;
  }
  for (const c of contas) {
    console.log(`${c.platform.padEnd(10)} ${c.id.padEnd(10)} ${c.fullname ?? ""} ${c.username ? "@" + c.username : ""}`);
    if (c.erroDasPaginas) console.log(`           (não li as páginas: ${c.erroDasPaginas})`);
    for (const s of c.paginas) console.log(`           página/playlist ${s.id}  ${s.nome ?? ""}`);
  }
  const ligadas = (await lerContasDosProjetos()).filter((l) => l.vinculo);
  console.log(`\nJá ligadas na Demandou: ${ligadas.length}`);
  for (const l of ligadas) console.log(`  ${l.platform.padEnd(10)} ${l.vinculo!.padEnd(22)} social ${l.id} projeto ${l.projectId} ${l.nome}`);
}

async function ver(projectId: string) {
  const contas = await lerContasDosProjetos(projectId);
  if (!contas.length) return console.log("Projeto sem contas.");
  for (const c of contas) {
    console.log(
      `${c.platform.padEnd(10)} ${c.id}  ${c.nome.slice(0, 30).padEnd(30)} token=${c.temToken ? "sim" : "não"} vínculo=${c.vinculo ?? "-"}  => ${c.caminho} (${c.motivo})${c.ativa ? "" : " [inativa]"}`
    );
  }
}

async function ligar(projectId: string, contaId: string) {
  const r = await ligarContaDaPonte({ projectId, contaId, paginaId: opcao("pagina"), socialId: opcao("social") });
  console.log(`${r.criada ? "Criada" : "Ligada"}: conta ${r.socialAccountId} (${r.nome}) => Blotato ${r.vinculo}`);
  return ver(projectId);
}

async function desligar(socialId: string) {
  const r = await desligarContaDaPonte(socialId);
  console.log(
    r.apagada
      ? `Conta ${socialId} (${r.platform}) era só do Blotato e foi apagada do projeto ${r.projectId}.`
      : `Vínculo tirado de ${r.platform} ${socialId}. Ela volta a publicar pela API própria.`
  );
}

try {
  if (comando === "listar") await listar();
  else if (comando === "ver" && posicionais[0]) await ver(posicionais[0]);
  else if (comando === "ligar" && posicionais[0] && posicionais[1]) await ligar(posicionais[0], posicionais[1]);
  else if (comando === "desligar" && posicionais[0]) await desligar(posicionais[0]);
  else console.log("Uso: listar | ver <projectId> | ligar <projectId> <contaBlotato> [--pagina <id>] [--social <id>] | desligar <socialAccountId>");
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
await prisma.$disconnect().catch(() => {});
process.exit();
