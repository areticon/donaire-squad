/**
 * Infographic generation using Gemini Flash image generation ("Nano Banana").
 *
 * Gemini Nano Banana Pro (gemini-3-pro-image-preview) is specifically designed
 * for complex layouts with accurate text rendering — this is the same engine
 * used by NotebookLM to generate infographics with perfect typography.
 *
 * Approach:
 * 1. Gemini (text) extracts structured content from the post (PT-BR, with data)
 * 2. Gemini (image) generates the visual infographic using the structured content
 *    with the "Nano Banana" prompt formula
 *
 * Output: 9:16 portrait PNG — optimal LinkedIn format
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

export type InfographicTheme =
  | "linkedin_blue"
  | "energy_orange"
  | "growth_green"
  | "tech_dark"
  | "executive_navy";

interface StructuredContent {
  title: string;
  subtitle: string;
  theme: InfographicTheme;
  sections: Array<{
    heading: string;
    body: string;
    stat?: string;
  }>;
  highlight?: { value: string; label: string };
  keyNumbers?: Array<{ value: string; label: string }>;
}

const THEME_STYLES: Record<InfographicTheme, string> = {
  linkedin_blue:   "deep navy blue and white, LinkedIn brand color scheme, electric blue accents",
  energy_orange:   "dark background with vibrant orange and amber accents, energetic style",
  growth_green:    "dark background with emerald green and mint accents, growth and nature feel",
  tech_dark:       "ultra dark background with purple and violet neon accents, futuristic tech look",
  executive_navy:  "deep midnight navy, gold and silver accents, premium executive look",
};

const NICHE_THEMES: Record<string, InfographicTheme> = {
  energy:          "energy_orange",
  "energia":       "energy_orange",
  startup:         "energy_orange",
  sustainability:  "growth_green",
  sustentabilidade:"growth_green",
  agro:            "growth_green",
  saúde:           "growth_green",
  health:          "growth_green",
  tech:            "tech_dark",
  tecnologia:      "linkedin_blue",
  saas:            "tech_dark",
  ia:              "executive_navy",
  ai:              "executive_navy",
  finance:         "executive_navy",
  finanças:        "executive_navy",
  consultoria:     "executive_navy",
  juridico:        "executive_navy",
};

function detectTheme(niche: string): InfographicTheme {
  const lower = niche.toLowerCase();
  for (const [key, theme] of Object.entries(NICHE_THEMES)) {
    if (lower.includes(key)) return theme;
  }
  return "linkedin_blue";
}

/** Step 1: Extract structured content from post in Portuguese */
async function extractContent(
  postContent: string,
  niche: string,
  apiKey: string
): Promise<StructuredContent> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Extraia os dados do post abaixo para montar um infográfico profissional para LinkedIn.

⚠️ REGRAS ABSOLUTAS:
1. TODO texto deve estar em PORTUGUÊS BRASILEIRO.
2. NUNCA use lorem ipsum, placeholders ou inventar dados.
3. Use apenas informações reais do post.
4. Se faltar dado para algum campo, resuma a ideia principal do post.
5. O título NÃO pode começar com rótulos de categoria como "IA:", "AI:", "Tech:", "Digital:", "Inovação:" ou similares. Escreva direto a manchete.

Retorne APENAS JSON válido sem markdown:
{
  "title": "manchete impactante em português (máx 60 chars — NÃO inicie com 'IA:', 'AI:' ou qualquer prefixo de categoria)",
  "subtitle": "frase complementar em português (máx 100 chars)",
  "theme": "${detectTheme(niche)}",
  "sections": [
    {"heading": "título da seção em português (máx 40 chars)", "body": "descrição em português (máx 90 chars)", "stat": "número destaque opcional como '50 GW' ou 'R$ 7,6bi'"}
  ],
  "highlight": {"value": "número ou dado mais impactante (máx 15 chars)", "label": "o que significa em português (máx 35 chars)"},
  "keyNumbers": [{"value": "número", "label": "descrição em português (máx 30 chars)"}]
}

O campo "theme" já está definido como "${detectTheme(niche)}" — mantenha esse valor exatamente.

CONTEÚDO DO POST:
${postContent.slice(0, 3000)}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini não retornou JSON estruturado");

  const data = JSON.parse(jsonMatch[0]) as StructuredContent;

  // Use niche-based theme if Gemini didn't set one
  if (!data.theme) data.theme = detectTheme(niche);

  data.sections = (data.sections ?? []).slice(0, 4);
  data.keyNumbers = (data.keyNumbers ?? []).slice(0, 3);

  return data;
}

/** Step 2: Generate the infographic image using Gemini Flash ("Nano Banana") */
async function generateWithGeminiFlash(
  content: StructuredContent,
  apiKey: string,
  platform: "linkedin" | "twitter" | "both" = "linkedin"
): Promise<string | null> {
  const themeStyle = THEME_STYLES[content.theme ?? "linkedin_blue"];

  // Format structured content — NO label prefixes to avoid Gemini copying them into the image
  const sectionsText = (content.sections ?? [])
    .map((s, i) => {
      const stat = s.stat ? ` (${s.stat})` : "";
      return `${i + 1}. ${s.heading}${stat} — ${s.body}`;
    })
    .join("\n");

  const numbersText = (content.keyNumbers ?? [])
    .map((n) => `${n.value} — ${n.label}`)
    .join(" | ");

  const highlightLine = content.highlight
    ? `Big callout box: "${content.highlight.value}" with label "${content.highlight.label}"`
    : "";

  // Aspect ratio: 1:1 square works on both LinkedIn and X; 9:16 portrait is LinkedIn-only best
  const aspectLabel = platform === "twitter"
    ? "1:1 square format (optimized for X/Twitter feed)"
    : platform === "both"
    ? "1:1 square format (compatible with both LinkedIn and X/Twitter feeds)"
    : "9:16 vertical portrait format (maximum LinkedIn feed presence)";

  // CRITICAL: instruct Gemini NOT to render the structural labels (TÍTULO, SUBTÍTULO, etc.)
  const imagePrompt = `Create a professional infographic for LinkedIn/social media.

LAYOUT STRUCTURE:
- Top header: bold large title text reads exactly: "${content.title}"
- Below title: smaller subtitle text reads exactly: "${content.subtitle}"
${highlightLine ? `- ${highlightLine}` : ""}
- Content sections:
${sectionsText}
- Bottom bar with key metrics: ${numbersText || "—"}

⚠️ CRITICAL RENDERING RULES — strictly follow:
1. DO NOT write the words "TÍTULO", "SUBTÍTULO", "SEÇÕES", "INDICADORES", "DESTAQUES" or any structural labels anywhere in the image. These are instructions only — NEVER render them as text.
2. The title "${content.title}" must appear as a styled headline, NOT preceded by any label.
3. ALL text must be in Brazilian Portuguese exactly as specified above.
4. The image must be ${aspectLabel}.
5. No lorem ipsum, no placeholder text, no English words.

DESIGN:
Color scheme: ${themeStyle}.
Style: modern corporate infographic, bold typography, clean sections, professional icons for each topic.
Typography: large bold title, clear section headings with numbers, readable body text, standout statistics in large accent numbers.
Quality: high-resolution, pixel-perfect text, suitable for professional social media posting.`;

  // Priority: Nano Banana Pro (best text rendering) → Nano Banana 2 → Nano Banana
  const models = [
    "gemini-3-pro-image-preview",       // Nano Banana Pro — studio-quality text rendering
    "gemini-3.1-flash-image-preview",   // Nano Banana 2 — fast, 4K quality
    "gemini-2.5-flash-image",           // Nano Banana — stable, fast
  ];

  for (const modelName of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: imagePrompt }] }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
          }),
          signal: AbortSignal.timeout(30_000),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        console.warn(`[Infographic][${modelName}] HTTP ${res.status}: ${err.slice(0, 150)}`);
        continue;
      }

      const data = await res.json() as {
        candidates?: Array<{
          content?: { parts?: Array<{ inlineData?: { data: string; mimeType: string } }> };
        }>;
      };

      const imgPart = (data.candidates?.[0]?.content?.parts ?? []).find(
        (p) => p.inlineData?.data
      );

      if (imgPart?.inlineData) {
        const { data: b64, mimeType } = imgPart.inlineData;
        console.log(`[Infographic] ✓ Gerado com ${modelName}`);
        return `data:${mimeType ?? "image/png"};base64,${b64}`;
      }

      console.warn(`[Infographic][${modelName}] Resposta sem dados de imagem`);
    } catch (e) {
      console.warn(`[Infographic][${modelName}] Erro:`, e);
    }
  }

  return null;
}

/** Generates a professional infographic from post content.
 *  @param platform  "linkedin" (9:16 portrait) | "twitter" (1:1 square) | "both" (1:1 square — safe for both)
 */
export async function generateInfographic(
  postContent: string,
  niche: string,
  apiKey: string,
  platform: "linkedin" | "twitter" | "both" = "linkedin"
): Promise<string> {
  // Step 1: Extract structured content in Portuguese
  const content = await extractContent(postContent, niche, apiKey);
  console.log(`[Infographic] Conteúdo extraído — tema: ${content.theme}, seções: ${content.sections.length}, plataforma: ${platform}`);

  // Step 2: Generate the visual with Gemini Flash ("Nano Banana")
  const imageUrl = await generateWithGeminiFlash(content, apiKey, platform);
  if (imageUrl) return imageUrl;

  // Step 3: Fallback — Imagen 3 via API key with descriptive prompt
  console.warn("[Infographic] Gemini Flash falhou, tentando Imagen 3 como fallback...");
  const themeStyle = THEME_STYLES[content.theme ?? "linkedin_blue"];
  const fallbackAspect = platform === "linkedin" ? "portrait 9:16" : "square 1:1";
  const fallbackPrompt = `Professional social media infographic, ${fallbackAspect}, ${themeStyle}, headline text "${content.title}", modern corporate design, clear typography, data visualization, no lorem ipsum, all text in Brazilian Portuguese, do not include the word TÍTULO or SUBTÍTULO`;

  const imagenRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: fallbackPrompt }],
        parameters: { sampleCount: 1, aspectRatio: platform === "linkedin" ? "9:16" : "1:1", outputMimeType: "image/jpeg" },
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (imagenRes.ok) {
    const imagenData = await imagenRes.json() as { predictions?: Array<{ bytesBase64Encoded?: string }> };
    const b64 = imagenData.predictions?.[0]?.bytesBase64Encoded;
    if (b64) {
      console.log("[Infographic] ✓ Fallback com Imagen 3");
      return `data:image/jpeg;base64,${b64}`;
    }
  }

  throw new Error("Não foi possível gerar o infográfico. Verifique se a GEMINI_API_KEY tem acesso ao Nano Banana Pro (gemini-3-pro-image-preview).");
}
