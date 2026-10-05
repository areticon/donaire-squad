// AS FOTOS DO BOOK DE MODELOS (05/10/2026), passo 1: busca na Pixabay (grátis).
// Para cada setor e para a reserva variada, uma consulta por tipo de foto
// (pessoa, ambiente, produto, planta, comida, arquitetura). Guarda os
// candidatos em JSON no rascunho; o passo 2 (subir.mts) baixa, reduz e sobe
// os escolhidos para o Blob público. Uso: npx tsx scripts/fotos-do-book/buscar.mts <saida.json>
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("C:/Users/devan/opensquad-app/.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

type Tipo = "pessoa" | "ambiente" | "produto" | "planta" | "comida" | "arquitetura";
// [tipo, consulta em inglês]. Pessoas sempre anônimas de banco de imagem.
const CONSULTAS: Record<string, Array<[Tipo, string]>> = {
  saude: [["pessoa", "doctor patient consultation"], ["ambiente", "modern clinic interior"], ["produto", "stethoscope desk"], ["planta", "green plant wellness"], ["comida", "healthy salad bowl"], ["arquitetura", "hospital building modern"]],
  juridico: [["pessoa", "lawyer office meeting"], ["ambiente", "law office library books"], ["produto", "contract signing pen"], ["planta", "office plant desk"], ["comida", "coffee cup meeting table"], ["arquitetura", "courthouse columns"]],
  fe: [["pessoa", "woman praying hands"], ["ambiente", "church interior light"], ["produto", "bible open table"], ["planta", "sunrise field"], ["comida", "bread table family"], ["arquitetura", "chapel architecture"]],
  energia: [["pessoa", "engineer solar panel"], ["ambiente", "wind farm landscape"], ["produto", "solar panels roof"], ["planta", "green leaves sunlight"], ["comida", "coffee control room"], ["arquitetura", "power station modern"]],
  consorcio: [["pessoa", "couple new car keys"], ["ambiente", "car dealership showroom"], ["produto", "house keys hand"], ["planta", "garden house"], ["comida", "family dinner home"], ["arquitetura", "modern house facade"]],
  financas: [["pessoa", "businesswoman laptop finance"], ["ambiente", "modern office desk"], ["produto", "calculator documents"], ["planta", "plant growing coins"], ["comida", "coffee notebook"], ["arquitetura", "glass skyscraper"]],
  educacao: [["pessoa", "teacher classroom students"], ["ambiente", "library study room"], ["produto", "books stack desk"], ["planta", "plant notebook desk"], ["comida", "school lunch apple"], ["arquitetura", "university campus building"]],
  alimentacao: [["pessoa", "chef cooking kitchen"], ["ambiente", "restaurant interior"], ["produto", "fresh bread bakery"], ["planta", "herbs basil"], ["comida", "gourmet dish plate"], ["arquitetura", "cafe storefront"]],
  beleza: [["pessoa", "hairdresser salon client"], ["ambiente", "beauty salon interior"], ["produto", "cosmetics skincare bottles"], ["planta", "flowers pink"], ["comida", "smoothie fruit"], ["arquitetura", "boutique shop facade"]],
  imoveis: [["pessoa", "real estate agent couple"], ["ambiente", "living room interior design"], ["produto", "keys new home"], ["planta", "garden backyard"], ["comida", "kitchen breakfast table"], ["arquitetura", "modern house architecture"]],
  industria: [["pessoa", "factory worker helmet"], ["ambiente", "factory production line"], ["produto", "metal gears machinery"], ["planta", "green industry"], ["comida", "food production factory"], ["arquitetura", "industrial building warehouse"]],
  agro: [["pessoa", "farmer field"], ["ambiente", "farm landscape"], ["produto", "harvest vegetables crate"], ["planta", "corn field"], ["comida", "fresh vegetables market"], ["arquitetura", "barn farm"]],
  marketing: [["pessoa", "creative team meeting"], ["ambiente", "coworking office"], ["produto", "smartphone social media"], ["planta", "plant desk laptop"], ["comida", "coffee laptop cafe"], ["arquitetura", "modern office building"]],
  tecnologia: [["pessoa", "programmer laptop"], ["ambiente", "tech office"], ["produto", "laptop code screen"], ["planta", "plant computer desk"], ["comida", "coffee keyboard"], ["arquitetura", "data center"]],
  negocios: [["pessoa", "business meeting team"], ["ambiente", "modern office interior"], ["produto", "notebook pen desk"], ["planta", "office plant"], ["comida", "coffee business"], ["arquitetura", "city skyline buildings"]],
  // A reserva: variada de propósito, para qualquer nicho.
  reserva: [
    ["pessoa", "businesswoman portrait smiling"], ["pessoa", "man working laptop cafe"], ["pessoa", "entrepreneur shop owner"], ["pessoa", "team collaboration office"],
    ["ambiente", "home office"], ["ambiente", "doctor office"], ["ambiente", "retail store interior"], ["ambiente", "cozy living room"],
    ["produto", "product packaging"], ["produto", "handmade crafts"], ["produto", "watch accessories flat lay"],
    ["planta", "monstera plant"], ["planta", "succulent pot"], ["planta", "forest path"],
    ["comida", "coffee latte art"], ["comida", "fresh fruit table"], ["comida", "pasta dish"],
    ["arquitetura", "minimalist architecture"], ["arquitetura", "staircase modern"], ["arquitetura", "city street"],
  ],
};

interface Candidato {
  id: number;
  tags: string;
  largeImageURL: string;
  imageURL?: string;
  fullHDURL?: string;
  imageWidth: number;
  imageHeight: number;
  pageURL: string;
  user: string;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PROIBIDO = /\b(text|sign|logo|quote|typography|letters?|words?|font|celebrity|president|pope|politician|flag|nude|bikini)\b/i;

async function buscar(q: string, editors: boolean): Promise<Candidato[]> {
  const p = new URLSearchParams({ key: env.PIXABAY_API_KEY, q, image_type: "photo", safesearch: "true", per_page: "30", min_width: "1600", lang: "en", order: "popular" });
  if (editors) p.set("editors_choice", "true");
  const r = await fetch(`https://pixabay.com/api/?${p}`);
  if (!r.ok) throw new Error(`Pixabay HTTP ${r.status}`);
  const d = (await r.json()) as { hits: Candidato[] };
  return d.hits.filter((h) => !PROIBIDO.test(h.tags));
}

const saida: Record<string, Array<{ tipo: Tipo; consulta: string; candidatos: Candidato[] }>> = {};
for (const [setor, lista] of Object.entries(CONSULTAS)) {
  saida[setor] = [];
  for (const [tipo, consulta] of lista) {
    let c = await buscar(consulta, true);
    await espera(700);
    if (c.length < 4) {
      c = [...c, ...(await buscar(consulta, false))];
      await espera(700);
    }
    saida[setor].push({ tipo, consulta, candidatos: c.slice(0, 6) });
    console.log(setor, tipo, consulta, c.length);
  }
}
writeFileSync(process.argv[2], JSON.stringify(saida, null, 1));
