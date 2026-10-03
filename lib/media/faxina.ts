import { del } from "@vercel/blob";
import { ehPublica, midiaProduzida } from "@/lib/media/storage";

/**
 * Apagar o arquivo que foi SUBSTITUIDO, no mesmo lugar em que se grava o novo.
 *
 * ## O vazamento que este modulo fecha, medido em 18/09/2026
 *
 * O storage tinha **26,64 GB para DUAS gravacoes vivas no banco**: 23 GB de
 * arquivo que nenhuma linha alcanca, cobrado todo mes, invisivel em qualquer
 * tela e impossivel de achar sem cruzar storage com banco a mao.
 *
 * Nao veio de uma rota de apagar mal escrita: **nao existe rota de apagar**.
 * Veio de SUBSTITUICAO. Cada capa refeita grava um arquivo novo e deixa o
 * anterior; cada re-corte funde a midia nova por cima da antiga e abandona os
 * verticais de antes. Uma substituicao apaga o PONTEIRO, nunca o arquivo.
 *
 * ## A regra, e ela vale para qualquer arquivo daqui para a frente
 *
 * **Quem troca o ponteiro apaga o antigo, na mesma funcao.** Nao em um cron, nao
 * numa faxina semanal: no mesmo lugar, porque e o unico ponto do codigo que
 * sabe qual era o arquivo velho. Um cron depois teria que adivinhar isso
 * cruzando storage com banco, que e exatamente o trabalho manual que produziu
 * este modulo.
 *
 * O molde ja existia em `apagarSeForNossa`, na rota do logo (17/09). Aqui ele
 * vira funcao da casa, em vez de ser copiado uma terceira vez.
 *
 * ## Falhar apagando nunca derruba a operacao
 *
 * A troca ja foi gravada e e ela que a pessoa ve. Arquivo orfao e um custo
 * pequeno e recuperavel; erro na cara de quem pediu um ajuste, depois de o
 * ajuste ter funcionado, e a ferramenta parecendo quebrada enquanto acerta.
 */

/** Uma URL nossa de blob, ou nada. Aceita lixo sem reclamar de proposito. */
function ehNossa(url: unknown): url is string {
  return typeof url === "string" && url.includes("blob.vercel-storage.com");
}

/**
 * Apaga as midias indicadas, ignorando o que nao for nossa.
 *
 * Recebe `unknown` porque quase toda chamada vem de dentro de um JSON do banco
 * (`clips`, `capas`), onde o tipo e uma promessa e nao um fato. Filtrar aqui e
 * mais seguro que pedir a cada chamador que filtre igual.
 */
export async function apagarMidias(urls: Array<unknown>, contexto: string): Promise<number> {
  const nossas = [...new Set(urls.filter(ehNossa))];
  if (nossas.length === 0) return 0;

  // Os dois stores nao se misturam na mesma chamada: cada um tem o seu token, e
  // `del` com o token errado devolve 403 no lote inteiro.
  const publicas = nossas.filter((u) => ehPublica(u));
  const privadas = nossas.filter((u) => !ehPublica(u));

  let apagadas = 0;
  for (const [lista, token] of [
    [publicas, midiaProduzida().token],
    [privadas, process.env.BLOB_READ_WRITE_TOKEN],
  ] as Array<[string[], string | undefined]>) {
    if (lista.length === 0) continue;
    try {
      await del(lista, { token });
      apagadas += lista.length;
    } catch (e) {
      console.error(`[faxina][${contexto}] não consegui apagar ${lista.length} arquivo(s)`, e);
    }
  }
  return apagadas;
}

/**
 * As URLs de midia dentro da midia de UM trecho.
 *
 * Existe para o re-corte: quando o worker devolve o trecho refeito, e preciso
 * apagar os arquivos do trecho ANTERIOR, e eles estao espalhados em `vertical`,
 * `horizontal` e `capa`, cada um num formato proprio.
 *
 * `capaArte` NAO entra: ela e a capa que o cliente mandou refazer com uma
 * instrucao, e um re-corte de tempo nao a invalida. Apagar aqui destruiria um
 * trabalho que a pessoa pediu de proposito, por causa de outra coisa.
 */
export function urlsDaMidia(midia: unknown): string[] {
  if (!midia || typeof midia !== "object") return [];
  const m = midia as Record<string, unknown>;
  const achadas: unknown[] = [];
  for (const chave of ["vertical", "horizontal", "capa"]) {
    const v = m[chave];
    if (typeof v === "string") achadas.push(v);
    else if (v && typeof v === "object") achadas.push((v as Record<string, unknown>).url);
  }
  return achadas.filter(ehNossa);
}
