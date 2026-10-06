/**
 * CRIA OS 3 PACOTES DE CRÉDITO NO STRIPE (06/10/2026): um produto e um price
 * avulso (pagamento único, sem renovação) por pacote, achados pela lookup_key.
 *
 *   npx tsx --env-file=.env.local scripts/stripe/criar-pacotes-de-credito.mts
 *       só mostra o que existe e o que criaria (nada é criado)
 *   npx tsx --env-file=.env.local scripts/stripe/criar-pacotes-de-credito.mts --aplicar
 *       cria o que falta (com chave de TESTE)
 *   npx tsx --env-file=.env.local scripts/stripe/criar-pacotes-de-credito.mts --aplicar --producao
 *       cria o que falta com a chave de PRODUÇÃO (sk_live): exige as duas marcas
 *
 * IDEMPOTENTE: procura cada price pela lookup_key antes de criar. Price que já
 * existe com o valor certo fica; price que existe com outro valor não é
 * alterado (price no Stripe é imutável): o script avisa e para, e a saída é
 * criar o novo com `--transferir`, que move a lookup_key para o price novo.
 *
 * A tabela (valor e créditos) vem de lib/credits/pacotes-de-credito.ts, a mesma
 * que a tela mostra: não há segunda cópia para divergir.
 *
 * Saída: os ids, para conferir. O app acha os prices pela lookup_key sozinho;
 * as variáveis STRIPE_PACOTE_97_PRICE_ID, STRIPE_PACOTE_197_PRICE_ID e
 * STRIPE_PACOTE_597_PRICE_ID são opcionais e, preenchidas, mandam.
 */
import { PACOTES_DE_CREDITO } from "../../lib/credits/pacotes-de-credito";

const chave = process.env.STRIPE_SECRET_KEY;
if (!chave) throw new Error("STRIPE_SECRET_KEY ausente");
const producao = chave.startsWith("sk_live") || chave.startsWith("rk_live");
const aplicar = process.argv.includes("--aplicar");
const transferir = process.argv.includes("--transferir");

if (aplicar && producao && !process.argv.includes("--producao")) {
  console.error("A chave no ambiente é de PRODUÇÃO. Para criar lá, rode com --aplicar --producao.");
  process.exit(1);
}

type Json = Record<string, any>;
async function stripe(caminho: string, corpo?: Record<string, string>): Promise<Json> {
  const r = await fetch(`https://api.stripe.com/v1/${caminho}`, {
    method: corpo ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${chave}`,
      ...(corpo ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(corpo ? { body: new URLSearchParams(corpo).toString() } : {}),
  });
  const json = (await r.json()) as Json;
  if (!r.ok) throw new Error(`${caminho}: ${json.error?.message ?? r.status}`);
  return json;
}

console.log(`Stripe em modo ${producao ? "PRODUÇÃO" : "teste"}. ${aplicar ? "Criando o que falta." : "Só mostrando (rode com --aplicar para criar)."}\n`);

let problema = false;
for (const p of PACOTES_DE_CREDITO) {
  const centavos = p.reais * 100;
  const achados = await stripe(`prices?lookup_keys[]=${encodeURIComponent(p.lookupKey)}&active=true&limit=1`);
  const existente = (achados.data ?? [])[0] as Json | undefined;
  if (existente && existente.unit_amount === centavos && existente.currency === "brl" && !existente.recurring) {
    console.log(`JÁ EXISTE  ${p.id.padEnd(13)} R$ ${String(p.reais).padStart(3)}  ${String(p.creditos).padStart(5)} créditos  price ${existente.id}  produto ${existente.product}`);
    continue;
  }
  if (existente && !transferir) {
    console.log(`DIVERGE    ${p.id}: o price ${existente.id} cobra ${existente.unit_amount / 100} ${existente.currency}. Rode com --transferir para criar o novo e mover a lookup_key.`);
    problema = true;
    continue;
  }
  if (!aplicar) {
    console.log(`CRIARIA    ${p.id.padEnd(13)} R$ ${String(p.reais).padStart(3)}  ${String(p.creditos).padStart(5)} créditos  lookup_key ${p.lookupKey}`);
    continue;
  }
  // O produto também é achado antes (pela metadata), para rodar duas vezes não deixar produto órfão.
  const busca = await stripe(`products/search?query=${encodeURIComponent(`metadata['pacote']:'${p.id}'`)}&limit=1`);
  const produto =
    ((busca.data ?? [])[0] as Json | undefined) ??
    (await stripe("products", {
      name: `Pacote de ${p.creditos.toLocaleString("pt-BR")} créditos`,
      description: `Créditos avulsos da Demandou para quem já assina: ${p.creditos.toLocaleString("pt-BR")} créditos no saldo de produção. Pagamento único.`,
      "metadata[pacote]": p.id,
      "metadata[creditos]": String(p.creditos),
    }));
  const price = await stripe("prices", {
    product: produto.id,
    currency: "brl",
    unit_amount: String(centavos),
    lookup_key: p.lookupKey,
    ...(transferir ? { transfer_lookup_key: "true" } : {}),
    nickname: `Pacote ${p.reais} reais (${p.creditos} créditos)`,
    "metadata[pacote]": p.id,
    "metadata[creditos]": String(p.creditos),
  });
  console.log(`CRIADO     ${p.id.padEnd(13)} R$ ${String(p.reais).padStart(3)}  ${String(p.creditos).padStart(5)} créditos  price ${price.id}  produto ${produto.id}`);
}

console.log("\nO app acha os prices pela lookup_key. Para fixar por variável (opcional):");
for (const p of PACOTES_DE_CREDITO) console.log(`  ${p.variavel}=<price acima>`);
if (problema) process.exit(2);
