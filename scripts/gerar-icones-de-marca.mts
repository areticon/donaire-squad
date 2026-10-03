/**
 * Copia os SVGs oficiais das marcas de lib/media/marcas-na-fala.ts para
 * lib/media/icones-de-marca-svg.ts (30/09/2026).
 *
 * Por que copiar em vez de importar o pacote em tempo de execução: o JSON do
 * @iconify-json/logos tem 7,6 MB e o do vscode-icons 3,8 MB; carregar isso em
 * cada função da Vercel para usar 40 ícones seria peso morto. Os pacotes ficam
 * como devDependencies e este script regenera o arquivo quando a lista muda.
 *
 * Uso: npx tsx scripts/gerar-icones-de-marca.mts
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { MARCAS } from "../lib/media/marcas-na-fala";

const require = createRequire(import.meta.url);
type Colecao = { width?: number; height?: number; icons: Record<string, { body: string; width?: number; height?: number }> };
const logos = require("@iconify-json/logos/icons.json") as Colecao;
const vscode = require("@iconify-json/vscode-icons/icons.json") as Colecao;
const simples = require("simple-icons") as Record<string, { slug: string; path: string; hex: string }>;

function doIconify(c: Colecao, nome: string): string {
  const i = c.icons[nome];
  if (!i) throw new Error(`ícone ${nome} não existe no pacote`);
  const w = i.width ?? c.width ?? 16;
  const h = i.height ?? c.height ?? 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${i.body}</svg>`;
}

function doSimpleIcons(slug: string): string {
  const i = Object.values(simples).find((x) => x && typeof x === "object" && x.slug === slug);
  if (!i) throw new Error(`ícone ${slug} não existe no simple-icons`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="#${i.hex}" d="${i.path}"/></svg>`;
}

const saida: Record<string, string> = {};
for (const m of MARCAS) {
  const f = m.fonte;
  saida[m.id] = f.pacote === "logos" ? doIconify(logos, f.icone) : f.pacote === "vscode-icons" ? doIconify(vscode, f.icone) : doSimpleIcons(f.icone);
}

const corpo = `/**
 * GERADO por scripts/gerar-icones-de-marca.mts; não editar à mão.
 * SVGs oficiais das marcas de lib/media/marcas-na-fala.ts, copiados de
 * @iconify-json/logos (CC0), @iconify-json/vscode-icons (MIT) e simple-icons
 * (CC0). As marcas pertencem aos donos; uso nominativo (identificar o produto
 * que o narrador citou).
 */
export const SVG_DA_MARCA: Record<string, string> = ${JSON.stringify(saida, null, 1)};
`;
writeFileSync(new URL("../lib/media/icones-de-marca-svg.ts", import.meta.url), corpo);
console.log(`${Object.keys(saida).length} ícones, ${(corpo.length / 1024).toFixed(0)} KB`);
