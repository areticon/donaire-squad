import { spawn, spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { writeFile } from "node:fs/promises";

/**
 * As receitas de ffmpeg do produto, num lugar só.
 *
 * Regra que vale para todas: o corte usa `-ss` ANTES do `-i`, que faz o ffmpeg
 * pular direto para perto do ponto em vez de decodificar o vídeo inteiro até
 * chegar lá. Numa gravação de 27 minutos, cortar um trecho do minuto 26 leva
 * segundos em vez de minutos. O `-ss` depois do `-i` é mais preciso ao quadro,
 * mas aqui a precisão ao quadro não vale o custo: os tempos vêm de uma seleção
 * por fala, já arredondada para fronteira de frase.
 */

function rodar(args, { timeoutMs = 30 * 60 * 1000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd });
    let erro = "";
    p.stderr.on("data", (d) => {
      erro += d.toString();
      // Não deixa o buffer crescer sem limite num arquivo longo.
      if (erro.length > 8000) erro = erro.slice(-8000);
    });
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`ffmpeg passou de ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    p.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg saiu com ${code}: ${erro.slice(-600)}`));
    });
  });
}

/**
 * Como este ffmpeg aceita um filtro vindo de arquivo.
 *
 * Precisa vir de arquivo porque o filtro de um vídeo muito editado fica enorme:
 * o corte real de 23/08 gerou 22 mil caracteres e 700 segmentos passariam de 50
 * mil. No Windows o teto de linha de comando é 32.767, então quem recusa é o
 * shell, com um erro que não menciona filtro nenhum. No Linux o teto é maior,
 * mas o arquivo funciona nos dois e tira a diferença da conta.
 *
 * A opção mudou de nome: até a versão 6 é `-filter_complex_script`, e da 7 em
 * diante é `-/filter_complex`, com a antiga REMOVIDA. Isso importa de verdade
 * aqui, porque o contêiner do Railway roda o ffmpeg do Debian, mais antigo que
 * o da máquina de desenvolvimento. Escolher pela versão evita um bug que só
 * apareceria em produção.
 */
let _opcaoDeFiltro = null;

let _diagnostico = null;

/**
 * Qual ffmpeg está instalado e qual opção de filtro ele aceita.
 *
 * Calculado UMA vez e guardado. Isto é servido na rota de saúde, e o Railway
 * bate nela de tempos em tempos: sem o cache, cada verificação de saúde criaria
 * um processo só para perguntar uma versão que não muda enquanto o contêiner
 * vive.
 */
export function diagnostico() {
  if (_diagnostico) return _diagnostico;
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  // O Python entra aqui porque o recorte da pessoa depende dele, e sem esta
  // linha a única forma de descobrir que ele faltou no contêiner seria um corte
  // saindo na composição antiga sem ninguém entender por quê.
  // O teste importa `mediapipe.tasks.python.vision`, e NAO so `mediapipe`.
  // A diferenca nao e preciosismo: em 23/08 este diagnostico respondeu
  // "mediapipe 1.0.1" enquanto o recorte estava quebrado, porque `import
  // mediapipe` passa sem as bibliotecas de OpenGL e o import de visao e que
  // morre com `libEGL.so.1`. Verificador que testa MENOS do que o produto usa
  // da verde falso, que e pior que nao ter verificador.
  const py = spawnSync(
    "python3",
    [
      "-c",
      "import cv2, numpy, mediapipe as mp; from mediapipe.tasks.python import vision, BaseOptions; " +
        "vision.ImageSegmenterOptions; print(mp.__version__)",
    ],
    { encoding: "utf8" }
  );
  _diagnostico = {
    ffmpeg: ((r.stdout ?? "").split(String.fromCharCode(10))[0] || "desconhecido").trim(),
    opcaoDeFiltro: opcaoDeFiltro(),
    recorte:
      py.status === 0
        ? `mediapipe ${(py.stdout ?? "").trim()}`
        : `indisponivel, cortes saem na composicao antiga: ${
            (py.stderr ?? "").trim().split(String.fromCharCode(10)).pop() ||
            "motivo desconhecido"
          }`,
  };
  return _diagnostico;
}

function opcaoDeFiltro() {
  if (_opcaoDeFiltro) return _opcaoDeFiltro;
  try {
    const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
    const m = (r.stdout ?? "").match(/ffmpeg version n?(\d+)/i);
    const maior = m ? Number(m[1]) : 0;
    _opcaoDeFiltro = maior >= 7 ? "-/filter_complex" : "-filter_complex_script";
  } catch {
    _opcaoDeFiltro = "-filter_complex_script";
  }
  return _opcaoDeFiltro;
}

export function ffprobe(caminho) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      caminho,
    ]);
    let saida = "";
    p.stdout.on("data", (d) => (saida += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe saiu com ${code}`));
      try {
        const json = JSON.parse(saida);
        const video = (json.streams ?? []).find((s) => s.codec_type === "video");
        resolve({
          duracaoSec: Number(json.format?.duration ?? 0),
          largura: Number(video?.width ?? 0),
          altura: Number(video?.height ?? 0),
          bytes: Number(json.format?.size ?? 0),
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * O vídeo completo, pronto para o canal.
 *
 * REGRA DA CASA, decidida pelo Bruno em 23/08: **o que sai da Demandou nunca
 * pode ser pior que o que entrou.** O cliente paga uma agência e recebe o
 * trabalho melhorado, não degradado. Isso manda em três escolhas aqui:
 *
 * 1. **Sem edição, sem recodificar.** Se não há legenda para queimar nem corte
 *    para remover, o arquivo só é remuxado: os mesmos bytes de vídeo e áudio,
 *    com os metadados movidos para o começo. Perda zero por definição, e leva
 *    0,2 segundo em vez de minutos. Medido numa amostra de 60s da gravação
 *    real.
 * 2. **CRF 18, e não 20.** 18 é o patamar de "visualmente sem perda". A
 *    diferença de tamanho não justifica arriscar o que o cliente vê.
 * 3. **Áudio COPIADO, nunca recodificado, quando o tempo não é editado.**
 *    Recodificar AAC para AAC é sempre segunda geração de perda, e SUBIR o
 *    bitrate não recupera nada: a versão anterior pegava um áudio de 128k e
 *    gravava 160k, gastando mais bytes para entregar um som pior. Era o defeito
 *    mais silencioso deste arquivo.
 *
 * Nunca se mexe em resolução nem em quadros por segundo. O que entra em 1080p30
 * sai em 1080p30.
 */
export async function prepararCompleto(entrada, saida, opcoes = {}) {
  const remocoes = (opcoes.remocoes ?? []).filter((r) => r.ate > r.de);
  const editaTempo = remocoes.length > 0;
  const editaImagem = Boolean(opcoes.legendasArquivo);

  if (!editaTempo && !editaImagem) {
    await rodar(["-i", entrada, "-c", "copy", "-movflags", "+faststart", saida]);
    return { recodificado: false, motivo: "nada a editar, arquivo preservado" };
  }

  const args = ["-i", entrada];
  let cwdDoFiltro;
  let arquivoDeFiltro;

  if (editaTempo) {
    // TRIM e CONCAT, e não uma expressão `select` gigante.
    //
    // A versão anterior montava `select='between(t,a,b)+between(t,c,d)+...'`
    // com um termo por pedaço mantido. Funcionava com 67 remoções e MORRIA com
    // 155, que foi o que apareceu quando a limpeza de fala entrou: o parser de
    // expressão do ffmpeg quebra entre 80 e 120 termos, e o erro é "Cannot
    // allocate memory", que não diz nada sobre o motivo real.
    //
    // Medido em 23/08, expressão `select`:  80 termos OK, 120 falha.
    // Medido em 23/08, `trim` mais `concat`: 700 segmentos em 157s.
    //
    // A diferença é estrutural: cada pedaço vira um NÓ de filtro em vez de um
    // termo numa única expressão, e o ffmpeg lida bem com centenas de nós.
    const manter = intervalosQueFicam(remocoes, opcoes.duracaoSec);
    const partes = [];
    const mapa = [];
    manter.forEach((m, i) => {
      partes.push(
        `[0:v]trim=start=${m.de.toFixed(3)}:end=${m.ate.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
        `[0:a]atrim=start=${m.de.toFixed(3)}:end=${m.ate.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
      );
      mapa.push(`[v${i}][a${i}]`);
    });

    let grafo =
      partes.join(";") +
      ";" +
      mapa.join("") +
      `concat=n=${manter.length}:v=1:a=1[vc][ac]`;

    // A legenda entra DEPOIS da concatenação, porque os tempos dela já foram
    // calculados para a linha do tempo editada.
    if (editaImagem) {
      grafo += `;[vc]subtitles=${basename(opcoes.legendasArquivo)}[v]`;
    } else {
      grafo += ";[vc]null[v]";
    }

    // O grafo vai em ARQUIVO, e não na linha de comando. O corte real de 23/08,
    // com 161 remoções, gerou 322 nós e 22.007 caracteres; 700 segmentos passam
    // de 50 mil. O teto de linha de comando do Windows é 32.767, então lá quem
    // recusa é o shell, antes de o ffmpeg ver. No Linux o teto é bem maior, mas
    // o arquivo funciona nos dois e tira essa diferença da conta.
    cwdDoFiltro = dirname(opcoes.legendasArquivo ?? saida);
    arquivoDeFiltro = join(cwdDoFiltro, "filtro.txt");
    await writeFile(arquivoDeFiltro, grafo, "utf8");

    args.push(opcaoDeFiltro(), basename(arquivoDeFiltro), "-map", "[v]", "-map", "[ac]");
  } else {
    // Só legenda: o caminho simples continua sendo o melhor.
    cwdDoFiltro = dirname(opcoes.legendasArquivo);
    args.push("-vf", "subtitles=" + basename(opcoes.legendasArquivo));
  }

  args.push(
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p"
  );

  // Áudio: copiado sempre que o tempo não é mexido. Quando há remoção, o áudio
  // precisa ser recortado junto e aí não tem como copiar; nesse caso vai em
  // 192k, acima do original, que é o mínimo dano possível.
  args.push(...(editaTempo ? ["-c:a", "aac", "-b:a", "192k"] : ["-c:a", "copy"]));

  args.push("-movflags", "+faststart", saida);

  // O teto de tempo acompanha a duração, e não é fixo.
  //
  // Medido em 23/08 na gravação real: com o grafo de trim e concat mais a
  // legenda, o ffmpeg roda a cerca de 4x o tempo real. Um teto fixo de 30
  // minutos aguenta gravação de 2 horas e mata uma de 3, e o sintoma seria um
  // corte que "some" sem erro que explique. Um segundo de teto por segundo de
  // vídeo dá quatro vezes a folga medida, e nunca menos que os 30 minutos.
  const teto = Math.max(30 * 60 * 1000, Math.round((opcoes.duracaoSec ?? 0) * 1000));
  await rodar(args, { cwd: cwdDoFiltro, timeoutMs: teto });

  const partesDoMotivo = [];
  if (editaTempo) partesDoMotivo.push(`${remocoes.length} trechos removidos`);
  if (editaImagem) partesDoMotivo.push("legendas de destaque");
  return { recodificado: true, motivo: partesDoMotivo.join(" e ") };
}

/**
 * Recorta o trecho do arquivo cru JÁ SEM as pausas e as hesitações.
 *
 * ## O buraco que isto fecha
 *
 * A limpeza de fala entrou em 22/08 e foi ligada só em `prepararCompleto`, ou
 * seja, só no vídeo completo do YouTube. Os CORTES, que são o que vai para
 * Instagram, TikTok e LinkedIn, continuaram sendo recortados do arquivo cru,
 * com todo gaguejo e toda muleta intactos. Ninguém notou por um dia inteiro.
 *
 * Medido nos seis cortes da gravação real em 23/08: 30 dos 332 segundos que
 * iam ao ar eram pausa ou muleta, ou seja **9% do que o público assiste**, e
 * isso é PISO, porque nem conta autocorreção como "software como serviço, é
 * software as a service", que foi justamente o que o Bruno reclamou.
 *
 * ## Por que os intervalos chegam prontos, e não são calculados aqui
 *
 * Até 24/08 esta função recebia as remoções e deduzia sozinha o que fica: ela
 * descartava remoção menor que 0,05 s e pedaço mantido menor que 0,05 s. A
 * legenda, do outro lado, descontava TODAS as remoções. A diferença é pequena
 * por trecho e ela ACUMULA ao longo do corte, e legenda fora de sincronia é
 * pior que legenda nenhuma, porque parece defeito da plataforma.
 *
 * Agora a lista vem pronta do app, de `intervalosDoTrecho`, e é a MESMA que
 * gerou a legenda. Aqui só se emenda o que chegou. É a regra que o projeto já
 * segue para o deslocamento de tempo da abertura e do destaque: a matemática
 * mora num lugar só.
 *
 * ## Por que um passo separado, e não tudo num filtro só
 *
 * O recorte da pessoa gera a máscara a partir do vídeo, quadro a quadro. Se a
 * remoção acontecesse DEPOIS, a máscara e a imagem ficariam em linhas do tempo
 * diferentes e o recorte sairia deslocado da pessoa. Limpando primeiro, a
 * máscara nasce já alinhada, por construção.
 *
 * O custo é uma recodificação a mais por corte. Em trecho de 30 a 75 segundos
 * isso é rápido, e CRF 18 aqui é qualidade de intermediário: quem manda na
 * qualidade final é o corte de saída.
 */
export async function prepararTrecho(entrada, saida, inicio, duracao, intervalos) {
  const manter = (intervalos ?? []).filter((m) => m.ate - m.de > 0.05);
  // Um único pedaço que cobre o trecho inteiro quer dizer que não havia nada a
  // remover ali. Nesse caso não vale montar grafo de filtro nenhum.
  const inteiro =
    manter.length <= 1 &&
    (!manter.length || (manter[0].de <= 0.001 && manter[0].ate >= duracao - 0.001));

  if (inteiro) {
    // Nada a tirar: recorta e pronto, sem recodificar à toa.
    await rodar([
      "-ss", String(inicio), "-i", entrada, "-t", String(duracao),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart", saida,
    ]);
    return { removidos: 0, segundos: 0 };
  }

  const partes = [];
  const mapa = [];
  manter.forEach((m, i) => {
    partes.push(
      `[0:v]trim=start=${m.de.toFixed(3)}:end=${m.ate.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
      `[0:a]atrim=start=${m.de.toFixed(3)}:end=${m.ate.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
    );
    mapa.push(`[v${i}][a${i}]`);
  });
  const grafo =
    partes.join(";") + ";" + mapa.join("") +
    `concat=n=${manter.length}:v=1:a=1[v][a]`;

  // Mesmo cuidado do vídeo completo: grafo em ARQUIVO, com a opção que a versão
  // instalada do ffmpeg aceita.
  const pasta = dirname(saida);
  const arquivo = join(pasta, `filtro-trecho-${basename(saida)}.txt`);
  await writeFile(arquivo, grafo, "utf8");

  await rodar(
    [
      "-ss", String(inicio), "-i", entrada, "-t", String(duracao),
      opcaoDeFiltro(), basename(arquivo),
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart", saida,
    ],
    { cwd: pasta }
  );

  const mantidos = manter.reduce((s, m) => s + (m.ate - m.de), 0);
  return { removidos: manter.length - 1, segundos: duracao - mantidos };
}

/** O complemento das remoções: os pedaços que sobrevivem, em ordem. */
function intervalosQueFicam(remocoes, duracaoSec) {
  const ordenadas = [...remocoes].sort((a, b) => a.de - b.de);
  const fica = [];
  let cursor = 0;
  for (const r of ordenadas) {
    if (r.de > cursor) fica.push({ de: cursor, ate: r.de });
    cursor = Math.max(cursor, r.ate);
  }
  // Sem duração conhecida, o último pedaço vai até um valor bem alto: o ffmpeg
  // simplesmente para no fim do arquivo, e chutar a duração daria corte cedo.
  fica.push({ de: cursor, ate: duracaoSec && duracaoSec > cursor ? duracaoSec : 999999 });
  return fica.filter((f) => f.ate - f.de > 0.05);
}

/**
 * A abertura: os ganchos, um atrás do outro, com corte seco entre eles.
 *
 * Feita em arquivo separado e depois emendada ao corpo com `-c copy`, e não num
 * filtro só. A razão é a ORDEM: o filtro `select` que remove pausas mantém os
 * pedaços na sequência original e não sabe reordenar, e a abertura precisa
 * justamente disso, trazer o minuto 20 para antes do segundo zero.
 *
 * Emendar com `-c copy` no fim exige que os dois arquivos tenham os mesmos
 * parâmetros de codificação, e por isso a abertura usa exatamente os mesmos que
 * o corpo. Não é detalhe: com parâmetros diferentes a emenda ou falha ou
 * produz um vídeo que trava na virada.
 *
 * O fade de meio segundo no fim é a transição que separa a promessa do vídeo de
 * verdade. Sem ele o corte a frio emenda direto no "vamos lá" e parece defeito.
 */
export async function montarAbertura(entrada, saida, ganchos) {
  if (!ganchos?.length) return false;

  const partes = [];
  const mapa = [];
  ganchos.forEach((g, i) => {
    const dur = g.fim - g.inicio;
    partes.push(
      `[0:v]trim=start=${g.inicio.toFixed(3)}:end=${g.fim.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
      `[0:a]atrim=start=${g.inicio.toFixed(3)}:end=${g.fim.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
    );
    mapa.push(`[v${i}][a${i}]`);
    void dur;
  });

  const total = ganchos.reduce((s, g) => s + (g.fim - g.inicio), 0);
  const filtro = [
    ...partes,
    `${mapa.join("")}concat=n=${ganchos.length}:v=1:a=1[vc][ac]`,
    // O escurecer entra nos últimos 0,5s, e o áudio some junto: fade só na
    // imagem deixa a voz cortada no escuro, que soa pior que sem transição.
    `[vc]fade=t=out:st=${Math.max(0, total - 0.5).toFixed(3)}:d=0.5[v]`,
    `[ac]afade=t=out:st=${Math.max(0, total - 0.5).toFixed(3)}:d=0.5[a]`,
  ].join(";");

  await rodar([
    "-i", entrada,
    "-filter_complex", filtro,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    saida,
  ]);
  return true;
}

/**
 * Emenda abertura e corpo sem recodificar.
 *
 * `-c copy` porque os dois já saíram do mesmo codificador com os mesmos
 * parâmetros. Recodificar de novo seria uma terceira geração de perda em cima
 * de um arquivo que já passou por uma, e a regra da casa é que o que sai nunca
 * pode ser pior que o que entrou.
 */
export async function emendar(partes, saida, pasta) {
  const lista = join(pasta, "emenda.txt");
  await writeFile(
    lista,
    // `file '...'` com o NOME apenas, e o ffmpeg rodando dentro da pasta: o
    // demuxer de concatenação resolve caminho relativo à lista, e caminho
    // absoluto do Windows com dois-pontos quebra a leitura.
    partes.map((p) => "file '" + basename(p) + "'").join(String.fromCharCode(10)),
    "utf8"
  );
  await rodar(
    ["-f", "concat", "-safe", "0", "-i", basename(lista), "-c", "copy", "-movflags", "+faststart", saida],
    { cwd: pasta }
  );
}

/**
 * Mede o quanto o arquivo entregue difere do original, numa amostra.
 *
 * Existe para a promessa de qualidade ser VERIFICÁVEL em vez de prometida. O
 * Bruno perguntou, com razão, se reduzir tamanho não estava piorando o vídeo. A
 * resposta certa não é "confie", é um número por entrega.
 *
 * Amostra e não o arquivo inteiro: comparar 27 minutos exige decodificar os dois
 * arquivos por completo, e o custo não se paga. 60 segundos do meio, onde há
 * fala e troca de cena, representa bem.
 *
 * SSIM vai de 0 a 1. Acima de 0,99 é indistinguível a olho nu.
 */
export async function medirFidelidade(original, entregue, duracaoSec) {
  const inicio = Math.max(0, Math.floor(duracaoSec / 2) - 30);
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", [
      "-hide_banner",
      "-ss", String(inicio), "-t", "60", "-i", entregue,
      "-ss", String(inicio), "-t", "60", "-i", original,
      "-lavfi", "ssim", "-f", "null", "-",
    ]);
    let saida = "";
    p.stderr.on("data", (d) => (saida += d.toString()));
    p.on("error", () => resolve(null));
    p.on("close", () => {
      const m = saida.match(/All:([0-9.]+)/g);
      const ultimo = m?.[m.length - 1];
      resolve(ultimo ? Number(ultimo.replace("All:", "")) : null);
    });
  });
}

/**
 * Alguns quadros de um trecho, para o squad olhar e decidir o enquadramento.
 *
 * Ideia do Bruno: em vez de perguntar ao cliente que tipo de gravação ele
 * mandou, o time olha. Os quadros são descartados assim que a decisão volta,
 * então não custam armazenamento nenhum.
 *
 * Pequenos de propósito: 768 de largura é mais que suficiente para distinguir
 * slide de rosto e localizar uma webcam, e o custo de imagem no modelo cresce
 * com a área. A 768x432 cada quadro sai por volta de 440 tokens.
 */
export async function extrairQuadros(entrada, saidaPrefixo, inicio, duracao, quantos = 2) {
  const caminhos = [];
  for (let i = 0; i < quantos; i++) {
    // Espalha os quadros dentro do trecho, evitando as bordas: o primeiro e o
    // último segundo costumam pegar transição.
    const fracao = (i + 1) / (quantos + 1);
    const instante = inicio + duracao * fracao;
    const caminho = `${saidaPrefixo}-${i}.jpg`;
    await rodar([
      "-ss", String(instante),
      "-i", entrada,
      "-frames:v", "1",
      "-vf", "scale=768:-2",
      "-q:v", "5",
      caminho,
    ], { timeoutMs: 2 * 60 * 1000 });
    caminhos.push(caminho);
  }
  return caminhos;
}

/**
 * Quadros candidatos a capa, espalhados pelo vídeo INTEIRO.
 *
 * Diferente de `extrairQuadros`, que olha dentro de um trecho: aqui a varredura
 * cobre a gravação toda, INCLUSIVE a abertura. O motivo é que os melhores
 * momentos de fala não coincidem com os melhores momentos de imagem: a seleção
 * de trechos descarta abertura de propósito, e é justamente ali que muita gente
 * aparece falando em tela cheia, que é o quadro que vira boa capa.
 *
 * Apontado pelo Bruno em 23/08, com o próprio vídeo como prova: os trechos
 * escolhidos caíam todos em tela compartilhada, e a capa saía com texto branco
 * em cima de um slide.
 *
 * Devolve o caminho e o SEGUNDO de cada candidato, porque depois de escolhido é
 * preciso voltar ao vídeo e extrair o mesmo instante em resolução cheia: o
 * candidato tem 768 de largura, que serve para o agente olhar e é pouco para
 * virar thumbnail.
 */
/**
 * O quadro reduzido a tons de cinza, para o app medir o brilho do fundo.
 *
 * ## Por que o worker manda um numero e nao o app calcula do JPEG
 *
 * O halo do recorte e o branco da parede vazando pela borda semitransparente da
 * mascara, e ele so aparece porque o fundo gerado e escuro. Casar os dois exige
 * medir a parede, e medir exige pixels.
 *
 * Os pixels estao AQUI; o fundo e gerado no app, porque a conta de IA do
 * projeto vive num lugar so. O app nao tem como decodificar JPEG: nao ha
 * biblioteca de imagem nas dependencias dele, e acrescentar uma por causa de um
 * numero seria caro. Entao vai a imagem ja decodificada e reduzida.
 *
 * 128x72 sao 9 KB por trecho. Conferido no quadro real: o anel em volta da
 * pessoa mede 241 no pixel cheio e 237 nesta grade, quatro pontos de erro em
 * 255. Serve de sobra para alimentar um prompt e uma correcao de exposicao.
 */
export function gradeDeLuz(arquivo, largura = 128, altura = 72) {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", arquivo,
     "-vf", `scale=${largura}:${altura}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    { maxBuffer: 1 << 24 }
  );
  if (r.status !== 0 || !r.stdout || r.stdout.length < largura * altura) return null;
  return {
    largura,
    altura,
    luz: r.stdout.subarray(0, largura * altura).toString("base64"),
  };
}

/**
 * O brilho medio de uma imagem, de 0 a 255.
 *
 * Existe para conferir o que o gerador de imagem DEVOLVEU contra o que foi
 * pedido. Medido em 24/08: pedindo um fundo claro para casar com uma parede de
 * 241, o modelo entregou 194 numa tentativa e 207 na outra. Ele chega perto e
 * nao acerta, entao quem compoe corrige a diferenca em vez de torcer.
 */
export function brilhoMedio(arquivo) {
  const g = gradeDeLuz(arquivo, 32, 32);
  if (!g) return null;
  const bytes = Buffer.from(g.luz, "base64");
  let soma = 0;
  for (const b of bytes) soma += b;
  return soma / bytes.length;
}

export async function extrairCandidatosDeCapa(entrada, saidaPrefixo, duracaoSec, quantos = 10) {
  const candidatos = [];
  for (let i = 0; i < quantos; i++) {
    // Começa cedo e termina antes do fim: os últimos segundos costumam ser
    // despedida e tela parada.
    const instante = duracaoSec * (0.02 + (0.9 * i) / Math.max(1, quantos - 1));
    const caminho = `${saidaPrefixo}-${i}.jpg`;
    try {
      await rodar([
        "-ss", String(instante),
        "-i", entrada,
        "-frames:v", "1",
        "-vf", "scale=768:-2",
        "-q:v", "5",
        caminho,
      ], { timeoutMs: 2 * 60 * 1000 });
      candidatos.push({ caminho, instante });
    } catch {
      // Um candidato que falha não interessa: sobram nove.
    }
  }
  return candidatos;
}

/** O quadro escolhido, em resolução cheia e já recortado para 16:9. */
export async function extrairCapaFinal(entrada, saida, instante, recorte) {
  const filtros = [];
  if (recorte) {
    const par = (n) => `floor(${n}/2)*2`;
    filtros.push(
      `crop=${par(`iw*${recorte.w}`)}:${par(`ih*${recorte.h}`)}:` +
        `${par(`iw*${recorte.x}`)}:${par(`ih*${recorte.y}`)}`
    );
  }
  // 1280x720 é o tamanho que o YouTube pede para thumbnail. Maior não melhora e
  // só aumenta o que atravessa para o modelo de imagem.
  filtros.push(
    "scale=1280:720:force_original_aspect_ratio=increase",
    "crop=1280:720"
  );

  await rodar([
    "-ss", String(instante),
    "-i", entrada,
    "-frames:v", "1",
    "-vf", filtros.join(","),
    "-q:v", "2",
    saida,
  ], { timeoutMs: 2 * 60 * 1000 });
}

/**
 * Um trecho em 9:16, para Shorts, Reels e TikTok.
 *
 * O tratamento é fundo desfocado, e não barra preta. A receita comum de
 * `scale` mais `pad` deixa duas tarjas pretas enormes em cima e embaixo, que em
 * vídeo de pessoa falando parece erro de exportação e come o alcance dessas
 * plataformas, que privilegiam vídeo que ocupa a tela toda. Aqui o mesmo vídeo
 * entra duas vezes: uma ampliada e borrada como fundo, outra inteira e nítida
 * por cima. Nada da imagem é perdido e a tela fica cheia.
 *
 * Cortar em vez de desfocar cortaria a cabeça ou o corpo de quem fala, porque
 * não temos detecção de rosto para saber onde centralizar.
 */
export async function cortarVertical(
  entrada,
  saida,
  inicio,
  duracao,
  enquadramento,
  matte,
  fundo,
  legenda,
  ritmo,
  ajusteDeBrilho
) {
  const comRecorte = matte && (fundo || enquadramento?.tela);
  const filtro = comRecorte
    ? montarFiltroRecortado(enquadramento, matte, duracao, fundo, ritmo, ajusteDeBrilho)
    : montarFiltroVertical(enquadramento);

  // A legenda entra por ÚLTIMO, depois de tudo composto.
  //
  // Ordem não é detalhe aqui: o `subtitles` desenha em cima do que recebe, e a
  // sobreposição da pessoa vem depois de tudo o mais. Queimar antes deixaria a
  // silhueta passando por cima da própria legenda.
  //
  // Sem isto, a peça mais cara do corte não chegava na tela: 85% dos vídeos
  // curtos são assistidos sem som, e até 24/08 os cortes saíam sem legenda
  // nenhuma. O módulo existia e o fluxo não o chamava.
  const grafo = legenda
    ? filtro.replace(/\[v\]$/, `[semLegenda];[semLegenda]subtitles=${legenda}[v]`)
    : filtro;

  await rodar([
    "-ss", String(inicio),
    "-i", entrada,
    ...(comRecorte ? ["-i", matte.arquivo] : []),
    "-filter_complex", grafo,
    "-map", "[v]", "-map", "0:a?",
    // O `-t` fica DEPOIS de todos os inputs, senão ele vira opção de input do
    // último `-i` e limita o arquivo errado. Foi assim que o primeiro teste da
    // composição nova travou para sempre: o `-t` truncava a máscara em vez da
    // saída, e o gradiente do fundo é uma fonte SEM FIM, então o ffmpeg
    // codificava até o disco acabar.
    "-t", String(duracao),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    saida,
  ], {
    // O filtro `movie=` resolve caminho relativo a partir do diretório de
    // trabalho, e caminho absoluto do Windows com dois-pontos quebra o parser
    // de filtro. Rodar dentro da pasta e passar só o nome resolve os dois, e é
    // o mesmo cuidado que a legenda e o filtro em arquivo já tomavam.
    cwd: dirname(saida),
  });
}

/** Onde cada peça mora no quadro de 1080x1920. Em pixels, para conferir a conta. */
const LAYOUT = {
  CARTAO_LARGURA: 1000,
  CARTAO_TOPO: 150,
  PESSOA_LARGURA: 900,
  PESSOA_BASE: 70, // distância do rodapé até o pé do recorte
  /**
   * A largura da pessoa quando ela é o único assunto do quadro.
   *
   * 1400 num quadro de 1080 é DE PROPÓSITO: a silhueta recortada ocupa cerca de
   * 60% da caixa da webcam, então escalar a caixa para 1080 deixava a pessoa com
   * 541 px, metade da tela, e foi o que o Bruno viu e reprovou. Escalando a
   * caixa para 1400, a pessoa fica perto de 850 px de largura real, e as bordas
   * que sobram são fundo transparente, que não aparece.
   */
  PESSOA_SOZINHA: 1400,
};

/**
 * A composição com a pessoa recortada do fundo.
 *
 * Substitui o empilhamento, que o Bruno olhou em 23/08 e chamou de péssimo, com
 * razão. O que ele viu, medido no quadro real:
 *
 *   192 px vazios no topo, 269 px de faixa BORRADA no meio, e a interface do
 *   app de slides dentro do recorte da pessoa. 26% do quadro era desperdício,
 *   preenchido com uma cópia ilegível do próprio slide.
 *
 * O desenho novo não tem buraco para preencher: fundo desenhado, o slide como
 * cartão, a pessoa recortada e maior embaixo. A faixa entre o cartão e a pessoa
 * fica LIVRE de propósito, porque é onde a legenda entra.
 *
 * O fundo é gradiente e não desfoque do próprio vídeo. Desfoque do vídeo parece
 * defeito de compressão numa tela pequena, e ainda repete o conteúdo que já está
 * legível logo acima.
 */
function montarFiltroRecortado(enq, matte, duracao, fundo, ritmo, ajusteDeBrilho) {
  // O zoom do fundo vem do ESTILO: o acelerado avança 8% e o sério 2%, que é a
  // diferença entre um corte que empurra e um corte que deixa o argumento
  // mandar. Sem estilo cai em 4%, que era o valor fixo de antes.
  const zoom = Math.max(0.01, Math.min(0.2, ritmo?.forcaDoZoom ?? 0.04));
  const { x, y, w, h } = matte.recorte;

  // SÓ A PESSOA, sobre o fundo gerado. Sem slide.
  //
  // Decisão do Bruno em 24/08, depois de assistir: "tira os slides dos cortes,
  // deixa apenas eu, e o fundo feito por IA". Ele tem razão pelo formato: corte
  // vertical de rede social é rosto falando, e slide legível num telefone
  // ocupa quadro que o rosto deveria ter.
  //
  // Isso resolve de graça dois defeitos que eu vinha tentando consertar por
  // geometria: o slide cortado, que voltou de lado quando passei a escolher o
  // recorte por área, e os 45% de quadro vazio, porque a pessoa passa a ocupar
  // o espaço que era do cartão.
  //
  // O slide continua no vídeo COMPLETO do YouTube, onde a tela é grande e o
  // conteúdo escrito ajuda em vez de atrapalhar.
  if (fundo) {
    // A CORRECAO DE BRILHO DO FUNDO, que fecha o que o gerador de imagem nao
    // fechou.
    //
    // O prompt ja pede o fundo claro ou escuro conforme a gravacao, e isso
    // resolve quase tudo: medido em 24/08, o fundo saiu de 49 para 207 num alvo
    // de 241. Mas o modelo chega perto e nao acerta, e o que sobra ainda e o
    // contraste que faz o halo aparecer.
    //
    // A correcao e LIMITADA de proposito. Empurrar um fundo de 150 ate 241
    // lavaria a imagem inteira e destruiria a profundidade que e o motivo de
    // gerar fundo. Fechar os ultimos pontos vale; forcar a barra nao. Quem
    // calcula o limite e quem mede, no `index.mjs`.
    const brilho = ajusteDeBrilho ? `,eq=brightness=${ajusteDeBrilho.toFixed(3)}` : "";

    return [
      `movie=${basename(fundo)},scale=1080:1920,setsar=1${brilho},loop=loop=-1:size=1:start=0,` +
        // Zoom lento: fundo parado atrás de pessoa em movimento parece
        // fotografia, e custa zero perto de gerar vídeo. A força vem do estilo.
        `zoompan=z='min(${(1 + zoom).toFixed(3)},1+${zoom.toFixed(3)}*on/${Math.max(1, Math.round(duracao * 30))})':` +
        `d=1:s=1080x1920:fps=30,trim=duration=${duracao.toFixed(3)},` +
        `setpts=PTS-STARTPTS[fundo]`,
      `[0:v]crop=${w}:${h}:${x}:${y},scale=${LAYOUT.PESSOA_SOZINHA}:-2[pessoaRgb]`,
      `[1:v]format=gray,scale=${LAYOUT.PESSOA_SOZINHA}:-2[pessoaAlpha]`,
      "[pessoaRgb][pessoaAlpha]alphamerge[pessoa]",
      // Encostada na base, e não centralizada: rosto no terço superior é onde o
      // olho procura, e sobra espaço embaixo para a legenda.
      `[fundo][pessoa]overlay=(W-w)/2:H-h-${LAYOUT.PESSOA_BASE}:format=auto,format=yuv420p[v]`,
    ].join(";");
  }

  const tela = cropDeCaixa(semAPessoa(comFolga(enq.tela), enq.pessoa));

  return [
    // Fundo: gradiente escuro, de cima para baixo. Escuro porque o slide é
    // claro, e cartão claro sobre fundo claro some.
    // `d` é obrigatório aqui: sem duração o gradiente é uma fonte sem fim, e
    // um erro de ordem de argumento vira um ffmpeg que nunca termina.
    `gradients=s=1080x1920:c0=0x101728:c1=0x1d2942:x0=0:y0=0:x1=1080:y1=1920:n=2:d=${duracao.toFixed(3)}[fundo]`,

    // O slide vira cartão: largura fixa com margem dos dois lados, e uma borda
    // clara de 4 px que separa o cartão do fundo sem precisar de sombra.
    `[0:v]${tela},scale=${LAYOUT.CARTAO_LARGURA}:-2[cartao]`,
    `[cartao]pad=iw+8:ih+8:4:4:color=0x2f3d5c[cartaoBorda]`,
    `[fundo][cartaoBorda]overlay=(W-w)/2:${LAYOUT.CARTAO_TOPO}[comCartao]`,

    // A pessoa: recorta a janela da webcam, junta com a máscara, e o alpha faz
    // o fundo do quarto sumir.
    `[0:v]crop=${w}:${h}:${x}:${y},scale=${LAYOUT.PESSOA_LARGURA}:-2[pessoaRgb]`,
    `[1:v]format=gray,scale=${LAYOUT.PESSOA_LARGURA}:-2[pessoaAlpha]`,
    "[pessoaRgb][pessoaAlpha]alphamerge[pessoa]",
    `[comCartao][pessoa]overlay=(W-w)/2:H-h-${LAYOUT.PESSOA_BASE}:format=auto,format=yuv420p[v]`,
  ].join(";");
}

/**
 * Abre um pouco a caixa, sem sair do quadro.
 *
 * O agente de visão aperta a caixa no conteúdo, e no teste de 23/08 apertou
 * demais: o slide saiu com a primeira e a última palavra de cada linha cortadas.
 * Ilegível é pior que ter margem sobrando, e o modelo erra sempre para o mesmo
 * lado, então a folga entra em código em vez de virar mais uma súplica no
 * prompt.
 *
 * O 6% saiu de medição, não de chute. No quadro do slide de três colunas, o
 * texto ocupa de 12,3% a 86,7% da largura e o agente devolveu 17% a 85%: erro de
 * 4,7% para dentro no lado esquerdo. Com 3% ainda cortava a primeira letra de
 * cada linha. 6% cobre com folga, e o custo é o texto sair cerca de 7% menor,
 * que é invisível perto de perder a primeira palavra.
 */
function comFolga(c, folga = 0.06) {
  const x = Math.max(0, c.x - folga);
  const y = Math.max(0, c.y - folga);
  return {
    x,
    y,
    w: Math.min(1 - x, c.w + folga * 2),
    h: Math.min(1 - y, c.h + folga * 2),
  };
}

/**
 * Tira a janela da webcam de dentro do recorte da tela, pelo lado mais barato.
 *
 * No empilhado a pessoa aparece grande embaixo. Se o recorte de cima também
 * pegar a janelinha da webcam, ela aparece DUAS VEZES no mesmo quadro, e parece
 * defeito de edição.
 *
 * ## A versão anterior cortava sempre pelo eixo Y, e isso destruía o slide
 *
 * O raciocínio era "a webcam fica num canto inferior, então encurtar a tela até
 * onde ela começa não perde conteúdo, porque slide bem feito não põe texto
 * embaixo do apresentador". A premissa está errada: o slide do Bruno põe.
 *
 * Medido no vídeo real em 23/08, com a webcam no canto inferior DIREITO:
 *
 *   tela   x=209  y=119  w=1500  h=907
 *   webcam x=1488 y=778  w=422   h=302
 *
 *   cortar pela ALTURA  ate y=778  -> h=659, perde 27% e come o ultimo topico
 *   cortar pela LARGURA ate x=1488 -> w=1279, perde 15% e nao come nada
 *
 * Cortar pela altura tira uma faixa da largura INTEIRA por causa de uma
 * janelinha que ocupa só o canto. É desproporcional.
 *
 * ## Agora escolhe por área
 *
 * A webcam é um retângulo invadindo outro retângulo. Há quatro formas de tirá-la
 * encolhendo um lado só (por cima, por baixo, pela esquerda, pela direita).
 * Calcula a área que sobra em cada uma e fica com a maior. Isso resolve para
 * qualquer canto, e não só para o de baixo, sem heurística sobre onde a pessoa
 * costuma estar.
 */
function semAPessoa(tela, pessoa) {
  if (!pessoa) return tela;

  const telaFimX = tela.x + tela.w;
  const telaFimY = tela.y + tela.h;
  const pFimX = pessoa.x + pessoa.w;
  const pFimY = pessoa.y + pessoa.h;

  // Sem sobreposição real: nada a fazer.
  const invade =
    pessoa.x < telaFimX && pFimX > tela.x && pessoa.y < telaFimY && pFimY > tela.y;
  if (!invade) return tela;

  const candidatos = [
    { ...tela, h: pessoa.y - tela.y }, // corta embaixo
    { ...tela, y: pFimY, h: telaFimY - pFimY }, // corta em cima
    { ...tela, w: pessoa.x - tela.x }, // corta a direita
    { ...tela, x: pFimX, w: telaFimX - pFimX }, // corta a esquerda
  ].filter((c) => c.w > 0.2 && c.h > 0.2);

  if (!candidatos.length) return tela; // nada sobra: conviver com a duplicata

  return candidatos.reduce((m, c) => (c.w * c.h > m.w * m.h ? c : m));
}

/** Recorte em fração do quadro vira expressão de crop do ffmpeg. */
function cropDeCaixa(c) {
  // `iw` e `ih` são a largura e a altura da entrada. Usar fração em cima delas
  // deixa o filtro independente da resolução da gravação, então a mesma
  // decisão do agente serve para 1080p e para 4K.
  const par = (n) => `floor(${n}/2)*2`; // libx264 exige dimensão par
  return `crop=${par(`iw*${c.w}`)}:${par(`ih*${c.h}`)}:${par(`iw*${c.x}`)}:${par(`ih*${c.y}`)}`;
}

/**
 * Monta o filtro do vertical conforme o que o squad viu na cena.
 *
 * Os três tratamentos existem porque um só não serve. Testado contra gravação
 * real em 22/08: o tratamento de fundo desfocado, que é o certo para pessoa
 * falando, entregou um slide minúsculo e ilegível quando a gravação era
 * screencast. O enquadramento é a decisão que falta para o corte prestar.
 */
function montarFiltroVertical(enq) {
  const FUNDO =
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase," +
    "crop=1080:1920,gblur=sigma=28[fundo]";

  // Pessoa falando: recorta o meio em 9:16 e ela preenche a tela. Sem fundo
  // desfocado, porque não sobra borda nenhuma.
  if (enq?.vertical === "corte-central" || !enq) {
    const foco = enq?.pessoa
      ? cropDeCaixa(enq.pessoa) + ","
      : "";
    return (
      `[0:v]${foco}crop='min(iw,ih*9/16)':ih:'(iw-min(iw,ih*9/16))/2':0,` +
      "scale=1080:1920,format=yuv420p[v]"
    );
  }

  // Só tela: aperta na área útil do conteúdo (sem barra de navegador nem
  // margem vazia) e ocupa a largura inteira. É esse aperto que torna o texto
  // legível no celular.
  if (enq.vertical === "tela-grande") {
    const recorte = enq.tela ? cropDeCaixa(comFolga(enq.tela)) + "," : "";
    return (
      FUNDO +
      `;[0:v]${recorte}scale=1080:-2[frente]` +
      ";[fundo][frente]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]"
    );
  }

  // Misto: a tela grande em cima, a pessoa embaixo, as duas ocupando a largura
  // inteira. É o formato que Shorts de screencast usam, e é o único em que o
  // slide fica legível E o rosto aparece.
  // A tela ganha folga porque texto cortado é ilegível. A pessoa não ganha: a
  // caixa dela é a janela da webcam, que já tem borda de sobra, e alargar
  // traria pedaço do slide para dentro do recorte do rosto.
  const tela = cropDeCaixa(semAPessoa(comFolga(enq.tela), enq.pessoa));
  const pessoa = cropDeCaixa(enq.pessoa);
  return (
    FUNDO +
    `;[0:v]${tela},scale=1080:-2[cima]` +
    `;[0:v]${pessoa},scale=1080:-2[baixo]` +
    // A tela encosta no topo com uma margem, e a pessoa fica na parte de baixo.
    ";[fundo][cima]overlay=(W-w)/2:H*0.10[t1]" +
    ";[t1][baixo]overlay=(W-w)/2:H*0.58,format=yuv420p[v]"
  );
}

/**
 * O mesmo trecho em 16:9, para LinkedIn, X e YouTube.
 *
 * Existe separado do vertical porque no LinkedIn e no X o vídeo aparece dentro
 * do feed em caixa larga, e vídeo vertical entra minúsculo no meio da tela.
 */
export async function cortarHorizontal(entrada, saida, inicio, duracao, legenda) {
  // A legenda do horizontal é OUTRO arquivo, e não o mesmo do vertical.
  //
  // O ASS carrega a resolução para a qual foi escrito, e o libass escala o
  // desenho dessa referência para o quadro real. Reusar o arquivo de 1080x1920
  // num quadro de 1920x1080 esticaria a letra e jogaria a linha para fora,
  // porque a margem de 800 px que faz sentido em cima da cabeça no vertical é
  // metade da altura aqui.
  await rodar([
    "-ss", String(inicio),
    "-i", entrada,
    "-t", String(duracao),
    "-vf",
      "scale=1920:1080:force_original_aspect_ratio=decrease," +
      "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p" +
      (legenda ? `,subtitles=${legenda}` : ""),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    saida,
  ], {
    // Mesmo cuidado do vertical: o filtro `subtitles` resolve caminho relativo
    // ao diretório de trabalho, e caminho absoluto do Windows com dois-pontos
    // quebra o parser de filtro.
    cwd: dirname(saida),
  });
}

/**
 * A capa do trecho.
 *
 * Pega o quadro alguns segundos DEPOIS do início, e não no início exato:
 * começo de corte costuma cair numa transição, num piscar ou numa boca aberta
 * no meio de uma palavra. Alguns segundos adiante a pessoa já está falando em
 * postura estável.
 */
export async function extrairCapa(entrada, saida, inicio, duracao) {
  const instante = inicio + Math.min(3, Math.max(0.5, duracao * 0.15));
  await rodar([
    "-ss", String(instante),
    "-i", entrada,
    "-frames:v", "1",
    "-vf", "scale=1280:-2",
    "-q:v", "3",
    saida,
  ], { timeoutMs: 2 * 60 * 1000 });
}
