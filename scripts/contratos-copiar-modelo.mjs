/**
 * COPIA O MODELO DO CONTRATO para dentro do repositório (02/10/2026).
 *
 *   node scripts/contratos-copiar-modelo.mjs
 *
 * O texto das Condições Gerais é escrito fora do código, em
 * C:\Users\devan\Documents\Demandou\contratos\condicoes-gerais-demandou.md, e
 * a função da Vercel não lê a pasta Documentos. Este script copia a versão
 * atual para lib/contratos/modelos/condicoes-gerais.md, que é o arquivo que o
 * gestor de contratos usa. Rodou, publique: o texto novo só vale no próximo
 * deploy. Cada contrato grava o hash do texto que foi enviado.
 */
import { copyFileSync, existsSync } from "node:fs";

const ORIGEM = process.env.CONTRATO_MODELO_ORIGEM ?? "C:/Users/devan/Documents/Demandou/contratos/condicoes-gerais-demandou.md";
const DESTINO = "lib/contratos/modelos/condicoes-gerais.md";
if (!existsSync(ORIGEM)) {
  console.error(`Não achei o modelo em ${ORIGEM}.`);
  process.exit(1);
}
copyFileSync(ORIGEM, DESTINO);
console.log(`Modelo copiado: ${ORIGEM} -> ${DESTINO}`);
