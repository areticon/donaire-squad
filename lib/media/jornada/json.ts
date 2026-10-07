/** O primeiro objeto JSON de um texto (o Sonnet às vezes cerca com ```), pelo balanço de chaves fora de string. Puro. */
export function primeiroJson(t: string): unknown {
  const limpo = String(t ?? "").replace(/```(?:json)?/g, "");
  const i = limpo.indexOf("{");
  if (i < 0) throw new Error("a resposta não tem JSON");
  let nivel = 0;
  let emTexto = false;
  let escapado = false;
  for (let k = i; k < limpo.length; k++) {
    const ch = limpo[k];
    if (emTexto) {
      if (escapado) escapado = false;
      else if (ch === "\\") escapado = true;
      else if (ch === '"') emTexto = false;
      continue;
    }
    if (ch === '"') emTexto = true;
    else if (ch === "{") nivel++;
    else if (ch === "}") {
      nivel--;
      if (nivel === 0) return JSON.parse(limpo.slice(i, k + 1));
    }
  }
  throw new Error("JSON incompleto na resposta");
}
