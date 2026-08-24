/**
 * Prova de fumaca do worker: roda TODOS os caminhos de ffmpeg num video de
 * brinquedo, em segundos, antes de subir.
 *
 * ## Por que isto existe
 *
 * Em 24/08 tres erros meus chegaram em PRODUCAO e cada um custou uma rodada de
 * meia hora para aparecer:
 *
 *   1. um overlay de emoji que quebrava so no ffmpeg do conteiner
 *   2. `-af` junto de `-filter_complex` no video completo
 *   3. uma constante que uma limpeza minha apagou, e o erro foi
 *      "NIVELAR_VOZ is not defined" nos quatro cortes
 *
 * Os tres passariam por `node --check`, que so olha sintaxe, e pelo `tsc`, que
 * nem enxerga arquivos `.mjs`. O unico jeito de pegar era EXECUTAR, e executar
 * de verdade custava meia hora e uma geracao de imagem.
 *
 * Aqui o mesmo codigo roda contra um video de tres segundos feito na hora, com
 * mascara, fundo, legenda e emoji de brinquedo. Se algum caminho estiver
 * quebrado, quebra aqui.
 *
 * ## Como rodar
 *
 *     node worker/fumaca.mjs
 *
 * Precisa de ffmpeg no caminho. Nao precisa de rede, de chave, de banco nem de
 * Python: a segmentacao nao entra porque ela nao e ffmpeg, e ja tem prova
 * propria na construcao da imagem.
 */

import { mkdtemp, rm, writeFile, copyFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  ffprobe,
  prepararTrecho,
  prepararCompleto,
  cortarVertical,
  cortarHorizontal,
  extrairCapa,
  montarAbertura,
  emendar,
  diagnostico,
} from "./src/ffmpeg.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DURACAO = 6;

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`ffmpeg de apoio falhou: ${r.stderr?.slice(-400)}`);
}

/** Um ASS minimo, com as duas marcas que o produto usa de verdade. */
function legendaDeBrinquedo(largura, altura) {
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${largura}`,
    `PlayResY: ${altura}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Fala,Liberation Sans,60,&H0000E5FF,&H00FFFFFF,&H00000000,&HA0000000,-1,0,1,4,2,2,80,80,200,1",
    "Style: Destaque,Liberation Sans,30,&H0000E5FF,&H0000E5FF,&H00000000,&HA0000000,-1,0,1,4,2,2,80,80,400,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    "Dialogue: 0,0:00:00.20,0:00:01.20,Fala,,0,0,0,,{\\k80}TESTE",
    "Dialogue: 1,0:00:01.40,0:00:03.00,Destaque,,0,0,0,,{\\fscx70\\fscy70\\t(0,150,\\fscx100\\fscy100)}PROVA DE FUMACA",
  ].join("\n");
}

async function conferir(rotulo, arquivo, { duracaoEsperada, formato = "yuv420p" }) {
  const { size } = await stat(arquivo);
  if (size < 1000) throw new Error(`${rotulo}: arquivo de ${size} bytes, praticamente vazio`);
  const info = await ffprobe(arquivo);
  const dif = Math.abs(info.duracaoSec - duracaoEsperada);
  if (dif > 1.0) {
    throw new Error(
      `${rotulo}: duracao ${info.duracaoSec.toFixed(2)}s, esperada ${duracaoEsperada.toFixed(2)}s`
    );
  }
  // O formato de pixel e a checagem que pegaria a cor trocada do emoji: um
  // arquivo em outro formato sai valido e aparece errado no telefone.
  //
  // Cobra a AMOSTRAGEM (4:2:0) e nao a faixa de cor. A amostragem e o que
  // quebra aparelho: 4:4:4 ou 10 bits saem de um grafo mal negociado e metade
  // dos telefones nao decodifica. A faixa (`yuv420p` contra `yuvj420p`) muda o
  // contraste em alguns players e depende do fundo que o modelo devolveu
  // naquele dia, entao cobrar aqui daria alarme falso: medido em 24/08, o
  // arquivo de producao sai `yuv420p` e o mesmo codigo com o fundo de brinquedo
  // sai `yuvj420p`.
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=pix_fmt",
     "-of", "csv=p=0", arquivo],
    { encoding: "utf8" }
  );
  const pix = (r.stdout || "").trim();
  if (!pix.endsWith(formato.replace(/^yuvj?/, ""))) {
    throw new Error(`${rotulo}: formato de pixel ${pix}, esperada amostragem de ${formato}`);
  }
  console.log(`  ok  ${rotulo}  ${info.duracaoSec.toFixed(2)}s  ${(size / 1024).toFixed(0)} KB  ${pix}`);
}

async function main() {
  console.log("prova de fumaca do worker");
  console.log(`  ${JSON.stringify(diagnostico())}\n`);

  const pasta = await mkdtemp(join(tmpdir(), "fumaca-"));
  try {
    // A gravacao de brinquedo: imagem que muda e um tom, para o audio existir.
    const fonte = join(pasta, "fonte.mp4");
    ffmpeg([
      "-f", "lavfi", "-i", `testsrc=size=1280x720:rate=30:duration=${DURACAO}`,
      "-f", "lavfi", "-i", `sine=frequency=440:duration=${DURACAO}`,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-shortest", fonte,
    ]);

    // A mascara e o fundo, do tamanho que o produto usaria.
    const matteArquivo = join(pasta, "matte.mp4");
    ffmpeg([
      "-f", "lavfi", "-i", `color=c=white:s=320x240:rate=30:duration=${DURACAO}`,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", matteArquivo,
    ]);
    // O fundo de brinquedo precisa ter a MESMA amostragem de cor do real, que e
    // 4:2:0 em faixa cheia. Com 4:4:4 o ffmpeg negocia o resto do grafo de
    // outro jeito e a saida vira `yuvj420p`, e o teste acusaria uma diferenca
    // que so existe no brinquedo.
    const fundo = join(pasta, "fundo.jpg");
    ffmpeg(["-f", "lavfi", "-i", "gradients=s=1080x1920:n=2",
            "-pix_fmt", "yuvj420p", "-frames:v", "1", fundo]);

    // Um emoji de verdade, da paleta que vai para o conteiner.
    await copyFile(join(AQUI, "emoji", "u1f525.png"), join(pasta, "u1f525.png"));

    const legendaV = "l-v.ass";
    await writeFile(join(pasta, legendaV), legendaDeBrinquedo(1080, 1920), "utf8");
    const legendaH = "l-h.ass";
    await writeFile(join(pasta, legendaH), legendaDeBrinquedo(1920, 1080), "utf8");

    const enquadramento = {
      cena: "misto",
      vertical: "empilhado",
      pessoa: { x: 0.6, y: 0.5, w: 0.3, h: 0.4 },
      tela: { x: 0.05, y: 0.05, w: 0.9, h: 0.6 },
    };
    const matte = { arquivo: matteArquivo, recorte: { x: 0, y: 0, w: 320, h: 240 }, centro: 0.42 };
    const emojis = [{ arquivo: "u1f525.png", segundo: 1.0 }];
    const ritmo = { intervaloDeMovimento: 1.6, forcaDoZoom: 0.08 };
    const som = { volumeDaTrilha: 0.25, abaixarSobAVoz: 0.5 };

    // A trilha de brinquedo: um acorde CURTO de proposito (2s para um corte de
    // 5s), porque o caso que quebra e a musica mais curta que o corte, que
    // exige o stream_loop.
    const musica = "trilha.mp3";
    ffmpeg([
      "-f", "lavfi", "-i", "sine=frequency=220:duration=2",
      "-c:a", "libmp3lame", "-q:a", "5", join(pasta, musica),
    ]);

    // 1. O trecho limpo, com emendas, que e o que alimenta os cortes.
    //
    // O que entra sao os pedacos que FICAM, e nao as remocoes: quem calcula e
    // o app, em `intervalosDoTrecho`, e o worker so emenda o que recebeu. Aqui
    // ficam 0 a 2 e 3 a 6, ou seja cinco dos seis segundos, com uma emenda.
    console.log("1. prepararTrecho, com emendas");
    const limpo = join(pasta, "limpo.mp4");
    const corte = await prepararTrecho(fonte, limpo, 0, DURACAO, [
      { de: 0, ate: 2 },
      { de: 3, ate: DURACAO },
    ]);
    await conferir("trecho limpo", limpo, { duracaoEsperada: 5 });
    if (corte.removidos !== 1) throw new Error(`emendas ${corte.removidos}, esperado 1`);

    // 2. O corte vertical com TODAS as pecas ligadas ao mesmo tempo.
    console.log("2. cortarVertical com fundo, mascara, legenda, emoji, zoom, gama e TRILHA");
    const vertical = join(pasta, "v.mp4");
    await cortarVertical(limpo, vertical, 0, 5, enquadramento, matte, "fundo.jpg",
      legendaV, ritmo, 1.4, emojis, musica, som);
    await conferir("corte vertical", vertical, { duracaoEsperada: 5 });

    // 3. O caminho REAL de producao: sem fundo, corte central com push-in,
    //    fade de video e trilha em loop.
    console.log("3. cortarVertical do formato do mercado, com push-in e trilha");
    const semFundo = join(pasta, "v2.mp4");
    await cortarVertical(
      limpo, semFundo, 0, 5,
      { ...enquadramento, vertical: "corte-central" },
      null, null, legendaV, ritmo, null, [], musica, som
    );
    await conferir("corte central com trilha", semFundo, { duracaoEsperada: 5 });

    // 3b. E sem trilha nenhuma, que e o projeto que nao subiu musica.
    console.log("3b. cortarVertical sem trilha");
    const semTrilha = join(pasta, "v3.mp4");
    await cortarVertical(
      limpo, semTrilha, 0, 5,
      { ...enquadramento, vertical: "corte-central" },
      null, null, legendaV, ritmo, null, [], null, null
    );
    await conferir("corte sem trilha", semTrilha, { duracaoEsperada: 5 });

    // 4. O horizontal, com e sem trilha.
    console.log("4. cortarHorizontal com legenda e trilha");
    const horizontal = join(pasta, "h.mp4");
    await cortarHorizontal(limpo, horizontal, 0, 5, legendaH, musica, som);
    await conferir("corte horizontal", horizontal, { duracaoEsperada: 5 });
    const horizontalSem = join(pasta, "h2.mp4");
    await cortarHorizontal(limpo, horizontalSem, 0, 5, legendaH, null, null);
    await conferir("horizontal sem trilha", horizontalSem, { duracaoEsperada: 5 });

    // 5. A capa.
    console.log("5. extrairCapa");
    const capa = join(pasta, "c.jpg");
    await extrairCapa(limpo, capa, 0, 5);
    const { size: tamCapa } = await stat(capa);
    if (tamCapa < 1000) throw new Error("capa praticamente vazia");
    console.log(`  ok  capa  ${(tamCapa / 1024).toFixed(0)} KB`);

    // 6. O video completo COM remocao e legenda, que e onde o `-af` junto de
    //    `-filter_complex` derrubou a producao.
    console.log("6. prepararCompleto com remocoes e legenda");
    const legendaC = join(pasta, "destaques.ass");
    await writeFile(legendaC, legendaDeBrinquedo(1280, 720), "utf8");
    const completo = join(pasta, "completo.mp4");
    const como = await prepararCompleto(fonte, completo, {
      remocoes: [{ de: 1, ate: 2 }],
      duracaoSec: DURACAO,
      legendasArquivo: legendaC,
    });
    await conferir("video completo", completo, { duracaoEsperada: DURACAO - 1 });
    if (!como.recodificado) throw new Error("o completo deveria ter sido recodificado");

    // 7. O completo SEM nada a editar, que e o caminho de copia.
    console.log("7. prepararCompleto sem nada a editar, que preserva o arquivo");
    const copiado = join(pasta, "copia.mp4");
    const comoCopia = await prepararCompleto(fonte, copiado, { duracaoSec: DURACAO });
    await conferir("completo copiado", copiado, { duracaoEsperada: DURACAO });
    if (comoCopia.recodificado) throw new Error("o completo sem edicao nao devia recodificar");

    // 8. A abertura e a emenda dela com o corpo.
    console.log("8. montarAbertura e emendar");
    const abertura = join(pasta, "abertura.mp4");
    const tem = await montarAbertura(fonte, abertura, [{ inicio: 1, fim: 3 }]);
    if (!tem) throw new Error("a abertura devia ter sido montada");
    const juntos = join(pasta, "juntos.mp4");
    await emendar([abertura, fonte], juntos, pasta);
    await conferir("abertura mais corpo", juntos, { duracaoEsperada: DURACAO + 2 });

    console.log("\nTODOS OS CAMINHOS DE FFMPEG PASSARAM");
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => {
  console.error(`\nFALHOU: ${e.message}`);
  process.exit(1);
});
