/**
 * OS MODELOS DE WHATSAPP DA RÉGUA DA DEMONSTRAÇÃO, a partir de
 * lib/whatsapp/modelos.ts (a fonte única).
 *
 *   npx tsx scripts/whatsapp-modelos.mts                 gera docs/whatsapp-modelos-da-agenda.md
 *   npx tsx scripts/whatsapp-modelos.mts --mostrar       mostra o corpo do cadastro de cada modelo (nada sai)
 *   npx tsx scripts/whatsapp-modelos.mts --cadastrar     cadastra todos na Meta (precisa de WHATSAPP_TOKEN e WHATSAPP_BUSINESS_ACCOUNT_ID)
 *   npx tsx scripts/whatsapp-modelos.mts --situacao      lista os modelos da conta e se já foram aprovados
 *
 * Cadastrar pelo script é o mesmo que preencher à mão no WhatsApp Manager, sem
 * erro de digitação: o nome, o corpo, o rodapé, os botões e os exemplos saem
 * exatamente do que o código envia. O token nunca é impresso.
 */
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
config({ path: "C:/Users/devan/opensquad-app/.env.local" });
const { MODELOS, cadastroDoModelo, IDIOMA_DOS_MODELOS } = await import("@/lib/whatsapp/modelos");
type Modelo = import("@/lib/whatsapp/modelos").ModeloDeWhatsapp;

const API = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v26.0"}`;
const lista: Modelo[] = Object.values(MODELOS);
const arg = process.argv[2] ?? "";

if (arg === "--mostrar") {
  for (const m of lista) console.log(JSON.stringify(cadastroDoModelo(m), null, 2));
} else if (arg === "--cadastrar" || arg === "--situacao") {
  const token = process.env.WHATSAPP_TOKEN;
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!token || !waba) {
    console.error("Faltam WHATSAPP_TOKEN e WHATSAPP_BUSINESS_ACCOUNT_ID no .env.local.");
    process.exit(1);
  }
  if (arg === "--situacao") {
    const r = await fetch(`${API}/${waba}/message_templates?fields=name,status,category,language,rejected_reason&limit=100`, { headers: { Authorization: `Bearer ${token}` } });
    const d = (await r.json()) as { data?: Array<{ name: string; status: string; category: string; language: string; rejected_reason?: string }>; error?: { message: string } };
    if (!r.ok) throw new Error(d.error?.message ?? String(r.status));
    const nossos = new Set(lista.map((m) => m.nome));
    for (const t of d.data ?? []) if (nossos.has(t.name)) console.log(`${t.name.padEnd(36)} ${t.status.padEnd(10)} ${t.category} ${t.language}${t.rejected_reason && t.rejected_reason !== "NONE" ? ` (${t.rejected_reason})` : ""}`);
    const faltam = lista.filter((m) => !(d.data ?? []).some((t) => t.name === m.nome));
    if (faltam.length) console.log("Ainda não cadastrados:", faltam.map((m) => m.nome).join(", "));
  } else {
    for (const m of lista) {
      const r = await fetch(`${API}/${waba}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(cadastroDoModelo(m)),
      });
      const d = (await r.json()) as { id?: string; status?: string; category?: string; error?: { message?: string; error_user_msg?: string } };
      console.log(`${m.nome.padEnd(36)} ${r.ok ? `${d.status} (${d.category})` : `FALHOU: ${d.error?.error_user_msg ?? d.error?.message}`}`);
    }
  }
} else {
  // O arquivo de referência para o WhatsApp Manager.
  const linhas: string[] = [
    "# Modelos de WhatsApp da demonstração",
    "",
    "Gerado por `npx tsx scripts/whatsapp-modelos.mts` a partir de `lib/whatsapp/modelos.ts` (a fonte). Não edite aqui: mude o código e gere de novo.",
    "",
    `Todos com categoria **Utilidade** (UTILITY) e idioma **Português (BR)** (${IDIOMA_DOS_MODELOS}). O nome precisa ser exatamente o daqui. Variáveis no formato {{1}}, {{2}}, na ordem.`,
    "",
    "Para cadastrar todos de uma vez pela API: `npx tsx scripts/whatsapp-modelos.mts --cadastrar` (com WHATSAPP_TOKEN e WHATSAPP_BUSINESS_ACCOUNT_ID no .env.local). Para ver a aprovação: `--situacao`.",
    "",
    "| Modelo | Para | Quando |",
    "| --- | --- | --- |",
    ...lista.map((m) => `| ${m.nome} | ${m.para === "lead" ? "lead" : "time"} | ${m.quando} |`),
    "",
  ];
  for (const m of lista) {
    linhas.push(`## ${m.nome}`, "", `- Para: ${m.para === "lead" ? "o lead" : "a pessoa do time"}`, `- Quando: ${m.quando}`, "- Categoria: Utilidade", "", "Corpo:", "", "```", m.corpo, "```", "");
    if (m.variaveis.length) {
      linhas.push("Variáveis (com o exemplo que a Meta pede no cadastro):", "");
      m.variaveis.forEach((v, i) => linhas.push(`- {{${i + 1}}} ${v}: \`${m.exemplo[i]}\``));
      linhas.push("");
    }
    if (m.rodape) linhas.push(`Rodapé: \`${m.rodape}\``, "");
    if (m.botoes?.length) {
      linhas.push("Botões (tipo Visitar site):", "");
      for (const b of m.botoes) {
        linhas.push(b.url.includes("{{1}}") ? `- "${b.texto}", endereço dinâmico \`${b.url}\` (exemplo do fim: \`${b.exemplo}\`)` : `- "${b.texto}", endereço fixo \`${b.url}\``);
      }
      linhas.push("");
    }
  }
  const destino = "C:/Users/devan/opensquad-app/docs/whatsapp-modelos-da-agenda.md";
  writeFileSync(destino, linhas.join("\n"), "utf8");
  console.log(`${lista.length} modelos escritos em ${destino}`);
}
