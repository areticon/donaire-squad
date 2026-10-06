// RECOMPÕE AS PRÉVIAS DE IMAGEM DA BIBLIOTECA DE DESIGN (card 711, 06/10/2026).
//
// Reaproveita o que já foi pago: a foto crua guardada em
// biblioteca-de-design/previas/fotos/<id>.jpg (as 45 do book geradas às 02:40)
// e, na família Vox (8 modelos por prompt), o fundo gerado em 05/10 que ficou
// em disco (<id do modelo>-fundo.jpg). Compõe pelo modelo real
// (comporNoModelo) com o jogo de textos coerente da prévia e a marca neutra
// "Sua marca", e troca `previaUrl`. NENHUMA FOTO NOVA É GERADA.
//
// IDEMPOTENTE: o caminho da composição leva a assinatura das entradas
// (modelo, textos, marca, foto, recorte, versão). Rodar de novo com as mesmas
// entradas encontra "igual" e não escreve nada.
//
// SEM ARGUMENTO, NÃO ESCREVE NADA: mostra o que mudaria e grava as imagens em
// --saida (padrão: pasta previas-recompostas no diretório temporário).
//
// Uso (da raiz do repositório, depois do merge):
//   npx tsx scripts/tmp/recompor-previas-0610.mts                 # ensaio, sem escrever
//   npx tsx scripts/tmp/recompor-previas-0610.mts --gravar        # grava no Blob e no banco
//   ... --pagar-recorte    libera o BiRefNet (US$ 0,003 por modelo com pessoa recortada, mostrado antes)
//   ... --aceitar-sem-recorte   compõe os de pessoa recortada sem a profundidade (só para olhar; não use com --gravar)
//   ... --so voce-na-frente-do-titulo,foto-pb-com-tira-de-papel  (id do catálogo ou id da linha)
//   ... --fundos <pasta>   onde estão os <modelo>-fundo.jpg da família Vox
//   ... --saida <pasta>    onde gravar as imagens do ensaio
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

for (const arq of ["C:/Users/devan/opensquad-app/.env.local", ".env.local"]) {
  if (!existsSync(arq)) continue;
  for (const l of readFileSync(arq, "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  break;
}

const args = process.argv.slice(2);
const tem = (f: string) => args.includes(f);
const valor = (f: string) => (args.indexOf(f) >= 0 ? args[args.indexOf(f) + 1] : undefined);
const gravar = tem("--gravar");
const pagarRecorte = tem("--pagar-recorte");
const aceitarSemRecorte = tem("--aceitar-sem-recorte");
if (gravar && aceitarSemRecorte) {
  console.error("--aceitar-sem-recorte é só para olhar: não grave prévia sem a pessoa recortada.");
  process.exit(1);
}
const so = valor("--so")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
const fundos = valor("--fundos") ?? "C:/Users/devan/AppData/Local/Temp/claude/c--/d4e00b36-43ee-4c24-aefb-bf5fb9d889cc/scratchpad/book-modelos/previas-vox";
const saida = valor("--saida") ?? join(tmpdir(), "previas-recompostas");
mkdirSync(saida, { recursive: true });

const { prisma } = await import("../../lib/db/prisma");
const { recomporPrevia, modeloDaPrevia, modeloPedeRecorte, recorteDaPrevia, fotoBaseDaPrevia, CUSTO_DO_RECORTE_USD } = await import("../../lib/biblioteca-de-design/previas");
const { fundoInteiroDoModelo } = await import("../../lib/modelos-de-arte/prompts-com-foto");

const linhas = await prisma.designDaBiblioteca.findMany({
  where: { tipo: "imagem" },
  select: { id: true, tipo: true, nome: true, catalogoId: true, pedidoOriginal: true, linguagem: true, previaUrl: true },
  orderBy: [{ usos: "desc" }, { createdAt: "asc" }],
});
const alvo = linhas.filter((l) => !so || so.includes(l.id) || (l.catalogoId && so.includes(l.catalogoId)));
console.log(`${gravar ? "GRAVANDO" : "ENSAIO (nada é escrito)"}: ${alvo.length} entrada(s) de imagem. Imagens em ${saida}`);

// O custo antes de qualquer coisa: só o recorte da pessoa pode custar, e só com --pagar-recorte.
if (pagarRecorte) {
  let semRecorte = 0;
  for (const l of alvo) {
    const m = modeloDaPrevia(l);
    if (modeloPedeRecorte(m) && (await fotoBaseDaPrevia(l.id)) && !(await recorteDaPrevia(l.id))) semRecorte++;
  }
  console.log(`--pagar-recorte: ${semRecorte} recorte(s) de pessoa no BiRefNet, US$ ${(semRecorte * CUSTO_DO_RECORTE_USD).toFixed(3)} no total (fica guardado; a próxima vez é de graça).`);
}

const contagem: Record<string, number> = {};
let custo = 0;
for (const l of alvo) {
  const modelo = modeloDaPrevia(l);
  // A família Vox: o fundo gerado de 05/10, guardado em disco, quando o Blob ainda não tem a foto base.
  const arqFundo = join(fundos, `${modelo.id}-fundo.jpg`);
  const fotoAlternativa = fundoInteiroDoModelo(modelo) && existsSync(arqFundo) ? readFileSync(arqFundo) : null;
  try {
    const r = await recomporPrevia(l, { gravar, pagarRecorte, aceitarSemRecorte, fotoAlternativa });
    contagem[r.estado] = (contagem[r.estado] ?? 0) + 1;
    custo += r.recorteUsd;
    if (r.jpeg) writeFileSync(join(saida, `${modelo.id}.jpg`), r.jpeg);
    const extra = [r.fotoGuardada ? "foto base guardada" : "", r.recorteGuardado ? "recorte guardado" : "", r.recorteUsd ? `US$ ${r.recorteUsd.toFixed(3)}` : ""].filter(Boolean).join(", ");
    console.log(`${r.estado.padEnd(11)} ${modelo.id.padEnd(36)} ${l.id}${extra ? `  (${extra})` : ""}${r.previaUrl && gravar ? `\n            ${r.previaUrl}` : ""}`);
  } catch (e) {
    contagem.falha = (contagem.falha ?? 0) + 1;
    console.log(`falha       ${modelo.id.padEnd(36)} ${l.id}  ${e instanceof Error ? e.message.slice(0, 160) : e}`);
  }
}
console.log("\nresumo:", JSON.stringify(contagem), `custo US$ ${custo.toFixed(3)}`);
if (contagem["sem-recorte"]) console.log(`Os "sem-recorte" ficaram como estavam: a pessoa recortada não estava guardada. Para recompor com profundidade: --pagar-recorte (US$ ${CUSTO_DO_RECORTE_USD} cada).`);
if (contagem["sem-foto"]) console.log(`Os "sem-foto" não têm foto guardada nem fundo em ${fundos}: ficaram como estavam.`);
await prisma.$disconnect();
