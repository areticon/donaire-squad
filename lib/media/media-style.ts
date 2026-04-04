/**
 * Visual style presets for AI-generated images and videos (campaign config).
 * Prompt fragments are in English for compatibility with Imagen / Veo.
 */

export type MediaStyleId =
  | "auto"
  | "photorealistic"
  | "illustration"
  | "cartoon"
  | "caricature"
  | "documentary"
  | "cinematic"
  | "corporate_clean";

export const MEDIA_STYLE_OPTIONS: Array<{
  id: MediaStyleId;
  label: string;
  short: string;
}> = [
  { id: "auto", label: "Automático", short: "A IA escolhe o melhor estilo para o tema" },
  { id: "cinematic", label: "Cinematográfico", short: "Luz de cinema, composição dramática" },
  { id: "photorealistic", label: "Realismo extremo", short: "Fotografia hiper-realista, pele e textura naturais" },
  { id: "documentary", label: "Reportagem / documentário", short: "Estilo jornalístico, luz natural, handheld" },
  { id: "illustration", label: "Ilustração", short: "Arte digital, traço editorial, limpo" },
  { id: "cartoon", label: "Desenho animado", short: "Estilo cartoon, cores vivas, expressivo" },
  { id: "caricature", label: "Charge / caricatura", short: "Traços exagerados, humor visual" },
  { id: "corporate_clean", label: "Corporativo clean", short: "Minimalista, stock premium, B2B" },
];

/** English fragment appended to image / video prompts */
export function getMediaStylePromptFragment(style: MediaStyleId | undefined): string {
  const s = style ?? "auto";
  const map: Record<MediaStyleId, string> = {
    auto:
      "Choose the most appropriate visual style for the topic — may mix professional photography and subtle motion design.",
    photorealistic:
      "Hyperrealistic photography, extreme detail, natural skin and fabric texture, shallow depth of field, shot on high-end full-frame camera, no illustration look.",
    illustration:
      "Digital illustration, editorial art direction, clean lines, cohesive color palette, magazine-quality artwork, not photorealistic.",
    cartoon:
      "Animated cartoon aesthetic, bold saturated colors, expressive shapes, friendly and readable, not photorealistic.",
    caricature:
      "Caricature illustration style, exaggerated proportions for humorous or satirical effect, bold outlines, expressive faces — tasteful and professional context.",
    documentary:
      "Documentary news footage aesthetic, natural available light, handheld subtle movement, reportage feel, authentic environment, vérité style.",
    cinematic:
      "Cinematic lighting, film color grading, dramatic composition, shallow depth of field, moody and polished, anamorphic lens feel.",
    corporate_clean:
      "Clean corporate stock aesthetic, minimal clutter, soft even lighting, neutral background, professional B2B visual language.",
  };
  return map[s] ?? map.auto;
}

/** Max spoken words for PT-BR voice-over to fit duration without mid-sentence cut */
export function maxNarrationWordsForDuration(seconds: number): number {
  return Math.max(8, Math.floor(seconds * 2.0));
}
