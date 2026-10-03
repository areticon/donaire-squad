import { spawnSync } from "node:child_process";
import { cp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { emendar, ffprobe, fpsDe, rodar } from "./ffmpeg.mjs";

/**
 * A ABERTURA DE IMPACTO (01/10/2026): os melhores momentos do próprio vídeo,
 * em cortes rápidos, antes do conteúdo (estilo MrBeast). O app escolhe as
 * frases (o diretor pela transcrição, o cliente aprova na tela de roteiro) e
 * manda os tempos com as bordas já no silêncio, palavra inteira; aqui só se
 * monta, com ffmpeg, sem Chrome:
 *
 *   - ZOOM DE IMPACTO alternado: no momento par, o soco (sobe a 1,2 em 4
 *     quadros e assenta em 1,14); no ímpar, o empurrão contínuo (1,06 a 1,16).
 *     Origem no rosto, para a pessoa não sair do quadro;
 *   - FLASH branco de 0,12 s na entrada de cada momento, e o último sai para o
 *     branco, que é a passagem para o conteúdo;
 *   - SOM DE TRANSIÇÃO: um "whoosh" sintetizado (ruído rosa filtrado com
 *     subida e descida), mixado por baixo da voz no começo de cada corte. Sem
 *     arquivo de som: nada a baixar, nada a licenciar;
 *   - TEXTO DE SOCO: de 1 a 3 palavras ditas, em caixa alta, que estouram e
 *     assentam (libass, fonte Anton do produto).
 *
 * Serve ao completo (vários momentos, da base) e ao corte curto (um gancho,
 * do próprio corte montado).
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const PASTA_DAS_FONTES = resolve(AQUI, "..", "fontes");

/** Taxa e canais do áudio do arquivo (a abertura sai igual, para emendar por cópia). */
function audioDe(caminho) {
  try {
    const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels", "-of", "csv=p=0", caminho], { encoding: "utf8" });
    const [taxa, canais] = String(r.stdout ?? "").trim().split(",").map(Number);
    return taxa > 0 ? { taxa, canais: canais > 0 ? canais : 2 } : null;
  } catch {
    return null;
  }
}

const assCor = (hex, alfa = 0) => {
  const h = String(hex || "#FFFFFF").replace("#", "").padEnd(6, "0");
  return `&H${alfa.toString(16).padStart(2, "0").toUpperCase()}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
};
const assTempo = (s) => {
  const t = Math.max(0, s);
  const mi = Math.floor(t / 60);
  return `0:${String(mi).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;
};
const claro = (hex) => {
  const h = String(hex || "#F97316").replace("#", "").padEnd(6, "0");
  return (0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16)) / 255 > 0.6;
};

/**
 * O texto de soco em ASS. Colagem: caixa na cor da marca (o papel colado);
 * impacto: letra na cor da marca com contorno grosso; sóbrio: branco limpo,
 * menor. Entra 30% maior e assenta em 120 ms.
 */
/**
 * O soco como o app mandou, com a mesma regra de sentido fechado do app
 * (lib/media/abertura-do-roteiro.ts, `limparSoco`) como defesa: nunca termina
 * em preposição, artigo, conjunção, advérbio solto ou verbo que pede
 * complemento. Nada é cortado por contagem de palavras; acima de 14 letras o
 * texto quebra em duas linhas no espaço mais perto do meio.
 */
const FIM_PROIBIDO = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "no", "na", "nos", "nas", "um", "uma", "que", "pra", "para", "por", "pelo", "pela",
  "com", "se", "mas", "ou", "como", "porque", "quando", "onde", "seu", "sua", "meu", "minha", "esse", "essa", "este", "esta", "aquele", "aquela",
  "mais", "muito", "nao", "bem", "tao", "tambem", "so", "ja", "ainda", "sabia", "sabe", "vai", "vou", "ser", "sao", "ta", "tem", "tinha", "faz",
  "fazer", "foi", "era", "pode", "quer", "precisa", "estava", "nem", "eu", "ele", "ela", "voce", "isso", "ate", "sem", "sobre", "entre", "ao", "aos",
]);
const semAcento = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9%]/g, "");
export function textoDoSoco(soco) {
  const partes = String(soco || "").replace(/[{}\\.,!?;:"“”]/g, "").split(/\s+/).filter(Boolean).slice(0, 4);
  while (partes.length && FIM_PROIBIDO.has(semAcento(partes[partes.length - 1]))) partes.pop();
  const texto = partes.join(" ").toUpperCase();
  if (texto.length <= 14 || partes.length < 2) return texto;
  // Duas linhas, quebrando no espaço mais perto do meio.
  let melhor = 1;
  for (let k = 1; k < partes.length; k++) {
    const a = partes.slice(0, k).join(" ").length;
    const b = partes.slice(0, melhor).join(" ").length;
    if (Math.abs(a - texto.length / 2) < Math.abs(b - texto.length / 2)) melhor = k;
  }
  return `${partes.slice(0, melhor).join(" ")}\\N${partes.slice(melhor).join(" ")}`.toUpperCase();
}

function socoEmAss(soco, { W, H, duracao, familia, acento, vertical }) {
  // Grande de verdade (prova de 01/10: com 11% da altura o soco sumia no peito
  // de quem fala); no corte em pé vai no alto, longe da legenda do corte.
  const texto = textoDoSoco(soco);
  const duasLinhas = texto.includes("\\N");
  const tamanho = Math.round(H * (vertical ? 0.075 : familia === "sobrio" ? 0.1 : duasLinhas ? 0.12 : 0.15));
  const y = Math.round(H * (vertical ? 0.17 : duasLinhas ? 0.74 : 0.78));
  const estilo =
    familia === "colagem"
      ? `Style: S,Anton,${tamanho},${assCor(claro(acento) ? "#16171A" : "#FFFFFF")},${assCor("#FFFFFF")},${assCor(acento)},${assCor("#000000", 0x80)},0,0,0,0,100,100,1,0,3,${Math.round(tamanho * 0.18)},0,5,0,0,0,1`
      : familia === "sobrio"
        ? `Style: S,Anton,${tamanho},${assCor("#FFFFFF")},${assCor("#FFFFFF")},${assCor("#000000")},${assCor("#000000", 0x70)},0,0,0,0,100,100,1,0,1,${Math.round(tamanho * 0.05)},${Math.round(tamanho * 0.04)},5,0,0,0,1`
        : `Style: S,Anton,${tamanho},${assCor(acento)},${assCor(acento)},${assCor("#000000")},${assCor("#000000", 0x40)},0,0,0,0,100,100,1,0,1,${Math.round(tamanho * 0.09)},${Math.round(tamanho * 0.05)},5,0,0,0,1`;
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    estilo,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    texto
      ? `Dialogue: 0,${assTempo(0.05)},${assTempo(Math.max(0.3, duracao - 0.03))},S,,0,0,0,,{\\an5\\pos(${Math.round(W / 2)},${y})\\fad(30,60)\\fscx132\\fscy132\\t(0,120,\\fscx100\\fscy100)}${texto}`
      : "",
  ].join("\n") + "\n";
}

/**
 * O zoom de cada momento, por `zoompan` sobre a imagem 1,5x maior (o zoompan
 * trabalha em pixel inteiro e treme; maior, o tremor cai abaixo de um pixel,
 * o mesmo cuidado de montagem-do-completo.mjs).
 */
function filtroDoZoom(k, quadros, W, H, fps, foco, calmo = false) {
  const fx = Math.min(0.85, Math.max(0.15, foco?.x ?? 0.5));
  const fy = Math.min(0.8, Math.max(0.2, foco?.y ?? 0.4));
  // Calmo (passagem por fusão, 01/10): só a aproximação lenta, nunca o soco.
  const z = calmo
    ? `1.02+0.05*min(1,on/${Math.max(1, quadros - 1)})`
    : k % 2 === 0 ? `if(lt(on,4),1+0.2*on/4,1.2-0.06*min(1,(on-4)/10))` : `1.06+0.1*min(1,on/${Math.max(1, quadros - 1)})`;
  const W2 = Math.round((W * 1.5) / 2) * 2;
  const H2 = Math.round((H * 1.5) / 2) * 2;
  return (
    `scale=${W2}:${H2}:flags=bicubic,zoompan=z='${z}':d=1:s=${W}x${H}:fps=${fps}` +
    `:x='max(0,min(iw-iw/zoom,${fx}*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,${fy}*ih-ih/zoom/2))'`
  );
}

/**
 * Monta a abertura. `momentos`: [{ inicio, fim, soco }] no tempo de
 * `entrada`. `opcoes`: { familia, acento, foco: {x, y} em fração do quadro }.
 * Devolve o caminho do arquivo, ou null se nenhum momento coube.
 */
/**
 * A BORDA NO SILÊNCIO MEDIDO NO ÁUDIO (02/10). O app manda a frase inteira
 * com a borda no meio da pausa entre palavras da transcrição; aqui o áudio é
 * medido (silencedetect a -32 dB) em volta de cada borda, e ela só ANDA PARA
 * FORA: o começo recua até o silêncio que antecede a frase (0,12 s antes do
 * fim dele) e o fim avança até o silêncio que vem depois (0,25 s de respiro
 * dentro dele). Nunca entra na fala: a frase não perde sílaba, e o corte cai
 * onde ninguém está falando.
 */
export function silenciosEm(arquivo, de, ate) {
  try {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-ss", Math.max(0, de).toFixed(3), "-t", Math.max(0.2, ate - de).toFixed(3), "-i", arquivo, "-vn", "-af", "silencedetect=noise=-32dB:d=0.12", "-f", "null", "-"], { encoding: "utf8" });
    const texto = String(r.stderr ?? "");
    const inicios = [...texto.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => +m[1] + Math.max(0, de));
    const fins = [...texto.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => +m[1] + Math.max(0, de));
    return inicios.map((s, i) => ({ de: s, ate: fins[i] ?? ate }));
  } catch {
    return [];
  }
}

export function bordasNoSilencio(arquivo, m) {
  const antes = silenciosEm(arquivo, m.inicio - 0.6, m.inicio + 0.15);
  const depois = silenciosEm(arquivo, m.fim - 0.15, m.fim + 0.7);
  let inicio = m.inicio;
  let fim = m.fim;
  // Só o silêncio que ENCOSTA na borda: um silêncio mais cedo, com fala
  // entre ele e a frase, puxaria o rabo da frase anterior para dentro.
  const s0 = antes.filter((s) => s.ate <= m.inicio + 0.15 && s.ate >= m.inicio - 0.15).at(-1);
  if (s0) inicio = Math.min(m.inicio, Math.max(s0.de, s0.ate - 0.12));
  const s1 = depois.find((s) => s.de >= m.fim - 0.15 && s.de <= m.fim + 0.15);
  if (s1) fim = Math.max(m.fim, Math.min(s1.ate, s1.de + 0.25));
  return { ...m, inicio: +inicio.toFixed(3), fim: +fim.toFixed(3) };
}

export async function montarAberturaDeImpacto(entrada, momentos, pasta, opcoes = {}) {
  const lista = (momentos ?? [])
    .filter((m) => Number.isFinite(m.inicio) && Number.isFinite(m.fim) && m.fim - m.inicio >= 0.4)
    .slice(0, 14)
    .map((m) => (opcoes.bordasNoSilencio === false ? m : bordasNoSilencio(entrada, m)));
  if (!lista.length) return null;
  const dim = await ffprobe(entrada);
  const W = dim.largura;
  const H = dim.altura;
  const fps = fpsDe(entrada);
  const audio = audioDe(entrada) ?? { taxa: 48000, canais: 2 };
  const layout = audio.canais === 1 ? "mono" : "stereo";
  await cp(PASTA_DAS_FONTES, join(pasta, "fontes"), { recursive: true });
  const partes = [];
  // A PASSAGEM DO ESTILO (01/10, lib/media/biblias): flash e whoosh no
  // MrBeast; corte seco (sem clarão, whoosh baixo) no Hormozi, no Vox e na
  // lousa; fusão pelo preto, sem soco e sem whoosh, no telejornal e no keynote.
  const passagem = opcoes.passagem ?? "flash-e-whoosh";
  const calmo = passagem === "fusao";
  const clarao = passagem === "flash-e-whoosh";
  const volumeDoWhoosh = calmo ? 0 : clarao ? 0.5 : 0.22;
  for (const [k, m] of lista.entries()) {
    const d = +(m.fim - m.inicio).toFixed(3);
    const quadros = Math.max(2, Math.round(d * fps));
    const ultimo = k === lista.length - 1;
    const ass = `soco-${k}.ass`;
    await writeFile(join(pasta, ass), socoEmAss(m.soco, { W, H, duracao: d, familia: calmo ? "sobrio" : opcoes.familia ?? "impacto", acento: opcoes.acento ?? "#F97316", vertical: H > W }), "utf8");
    const entradaDoMomento = clarao ? `fade=t=in:st=0:d=0.12:color=white` : calmo ? `fade=t=in:st=0:d=0.22:color=black` : `fade=t=in:st=0:d=0.04:color=black`;
    const saidaDoUltimo = clarao ? `,fade=t=out:st=${Math.max(0, d - 0.16).toFixed(3)}:d=0.16:color=white` : `,fade=t=out:st=${Math.max(0, d - 0.22).toFixed(3)}:d=0.22:color=black`;
    const grafo = [
      `[0:v]setpts=PTS-STARTPTS,${filtroDoZoom(k, quadros, W, H, fps, opcoes.foco, calmo)},` +
        entradaDoMomento +
        (ultimo || calmo ? saidaDoUltimo : "") +
        `,subtitles=${ass}:fontsdir=fontes,format=yuv420p,setsar=1[v]`,
      `[0:a]asetpts=PTS-STARTPTS,aresample=${audio.taxa},aformat=sample_fmts=fltp:channel_layouts=${layout},` +
        `afade=t=in:st=0:d=0.02,afade=t=out:st=${Math.max(0, d - 0.03).toFixed(3)}:d=0.03[voz]`,
      // O whoosh: ruído rosa, só o meio do espectro, sobe em 0,18 s e some em 0,3 s.
      `[1:a]highpass=f=450,lowpass=f=4800,afade=t=in:st=0:d=0.18,afade=t=out:st=0.18:d=0.3,volume=${volumeDoWhoosh},aresample=${audio.taxa},aformat=sample_fmts=fltp:channel_layouts=${layout}[sw]`,
      `[voz][sw]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`,
    ].join(";");
    const arquivoDoGrafo = join(pasta, `grafo-abertura-${k}.txt`);
    await writeFile(arquivoDoGrafo, grafo, "utf8");
    const saida = join(pasta, `abertura-${String(k).padStart(2, "0")}.mp4`);
    const versao = Number((spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).stdout?.match(/ffmpeg version n?(\d+)/i) ?? [])[1] ?? 0);
    await rodar(
      [
        "-ss", Math.max(0, m.inicio).toFixed(3), "-t", d.toFixed(3), "-i", entrada,
        "-f", "lavfi", "-t", "0.5", "-i", `anoisesrc=d=0.5:c=pink:r=${audio.taxa}:a=0.6`,
        versao >= 7 ? "-/filter_complex" : "-filter_complex_script", `grafo-abertura-${k}.txt`,
        "-map", "[v]", "-map", "[a]",
        "-fps_mode", "cfr", "-r", String(fps),
        // Os mesmos parâmetros dos lotes do completo editado: a emenda por cópia fecha.
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-g", "60", "-keyint_min", "60", "-sc_threshold", "0", "-maxrate", "6M", "-bufsize", "12M",
        "-c:a", "aac", "-b:a", "160k", "-ar", String(audio.taxa), "-ac", String(audio.canais),
        saida,
      ],
      { cwd: pasta, timeoutMs: 5 * 60_000 }
    );
    partes.push(saida);
  }
  const abertura = join(pasta, "abertura.mp4");
  if (partes.length === 1) await cp(partes[0], abertura);
  else await emendar(partes, abertura, pasta);
  for (const p of partes) await rm(p, { force: true }).catch(() => {});
  return abertura;
}

/**
 * Abertura na frente do corpo. `copiar`: emenda por cópia (o completo de 20
 * min não pode ser recodificado só por isso; a abertura sai com os mesmos
 * parâmetros dele). Sem `copiar` (o corte curto, que sai do Remotion com
 * outros parâmetros), a emenda recodifica, o que num corte de 1 min é rápido.
 */
export async function prefixarAbertura(abertura, corpo, saida, pasta, { copiar = false } = {}) {
  if (copiar) {
    await emendar([abertura, corpo], saida, pasta);
    return saida;
  }
  const dim = await ffprobe(corpo);
  const fps = fpsDe(corpo);
  const audio = audioDe(corpo) ?? { taxa: 48000, canais: 2 };
  const layout = audio.canais === 1 ? "mono" : "stereo";
  const norm = (i) =>
    `[${i}:v]scale=${dim.largura}:${dim.altura}:flags=bicubic,fps=${fps},format=yuv420p,setsar=1[v${i}];` +
    `[${i}:a]aresample=${audio.taxa},aformat=sample_fmts=fltp:channel_layouts=${layout}[a${i}]`;
  await rodar(
    [
      "-i", abertura, "-i", corpo,
      "-filter_complex", `${norm(0)};${norm(1)};[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", saida,
    ],
    { cwd: pasta, timeoutMs: 20 * 60_000 }
  );
  return saida;
}
