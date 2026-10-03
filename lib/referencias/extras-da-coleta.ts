import type { ExtrasDoPost } from "@/lib/referencias/tipos-das-analises";

/**
 * OS SINAIS EXTRAS DE UM ITEM DA APIFY (02/10/2026), sem banco.
 *
 * Os atores já devolviam o áudio do vídeo, as hashtags, os salvamentos (no
 * TikTok) e a capa, e a coleta jogava tudo fora. As análises precisam deles
 * ("reels com áudio original rendem mais que com música") e as tendências da
 * semana vivem deles (o mesmo áudio em vídeos de criadores diferentes).
 *
 * Lido nos dados reais de 01/10:
 *   Instagram (instagram-scraper): musicInfo { artist_name, song_name,
 *     uses_original_audio, audio_id }; o da hashtag vem em outro formato,
 *     { audio_canonical_id, music_info: { music_asset_info: { title,
 *     display_artist } }, original_sound_info }. displayUrl é a capa.
 *   TikTok (tiktok-scraper): musicMeta { musicName, musicAuthor,
 *     musicOriginal, musicId }, collectCount (salvamentos), hashtags
 *     [{ name }], videoMeta.coverUrl e slideshowImageLinks.
 *
 * Nada de pessoa: o autor do áudio é o nome que a rede mostra no áudio (um
 * artista ou "som original" de quem postou), e quem comentou nunca entra.
 */

type Solto = Record<string, unknown>;

const obj = (v: unknown): Solto | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Solto) : null);
const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** "som original", "Original audio", "original sound": a voz de quem postou. */
export function nomeDeAudioOriginal(nome: string): boolean {
  return /^(original (audio|sound)|som original|áudio original|audio original)$/i.test(nome.trim());
}

function hashtagsDe(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((h) => (typeof h === "string" ? h : txt(obj(h)?.name)))
    .filter((h): h is string => Boolean(h))
    .map((h) => h.replace(/^#/, "").toLowerCase())
    .slice(0, 15);
}

export function extrasDoInstagram(item: unknown): ExtrasDoPost {
  const i = obj(item) ?? {};
  const m = obj(i.musicInfo);
  let audio: ExtrasDoPost["audio"] = null;
  if (m) {
    // Formato do instagram-scraper.
    const nome = txt(m.song_name);
    if (nome) {
      const original = m.uses_original_audio === true || nomeDeAudioOriginal(nome);
      audio = { id: txt(m.audio_id), nome, autor: txt(m.artist_name), original };
    } else {
      // Formato do instagram-hashtag-scraper.
      const musica = obj(obj(m.music_info)?.music_asset_info);
      const original = obj(m.original_sound_info);
      if (musica && txt(musica.title)) {
        audio = { id: txt(musica.audio_cluster_id) ?? txt(m.audio_canonical_id), nome: txt(musica.title)!, autor: txt(musica.display_artist), original: false };
      } else if (original) {
        audio = { id: txt(m.audio_canonical_id), nome: txt(original.original_audio_title) ?? "Original audio", autor: null, original: true };
      }
    }
  }
  return { audio, hashtags: hashtagsDe(i.hashtags), salvamentos: null, capa: txt(i.displayUrl) };
}

export function extrasDoTiktok(item: unknown): ExtrasDoPost {
  const i = obj(item) ?? {};
  const m = obj(i.musicMeta);
  const nome = txt(m?.musicName);
  const audio: ExtrasDoPost["audio"] = nome
    ? { id: txt(m?.musicId) ?? null, nome, autor: txt(m?.musicAuthor), original: m?.musicOriginal === true || nomeDeAudioOriginal(nome) }
    : null;
  const slides = Array.isArray(i.slideshowImageLinks) ? (i.slideshowImageLinks as unknown[]) : [];
  const capa = txt(obj(slides[0])?.tiktokLink) ?? txt(obj(slides[0])?.downloadLink) ?? txt(obj(i.videoMeta)?.coverUrl);
  return { audio, hashtags: hashtagsDe(i.hashtags), salvamentos: num(i.collectCount), capa };
}
