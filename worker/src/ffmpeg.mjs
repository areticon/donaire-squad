import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { copyFile, rm, writeFile } from "node:fs/promises";

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

/**
 * A normalizacao de volume, que e a "sacada de som" com numero.
 *
 * Medido no corte de producao de 24/08: ele saia a **-27,2 LUFS**, e o padrao
 * que Instagram, TikTok e YouTube usam para nivelar o feed e **-14 LUFS**. Ou
 * seja, o video da Demandou tocava treze decibeis mais baixo que tudo o que
 * vem antes e depois dele na rolagem. Quem assiste sem fone nao ouve, e sobe.
 *
 * Isso nao e efeito sonoro nem trilha, e nao depende de licenca de ninguem: e
 * corrigir um defeito que estava saindo em todo corte.
 *
 * `TP=-1.5` deixa margem de pico: as redes recomprimem o audio, e som que
 * encosta em zero volta distorcido do outro lado. `LRA=11` e o padrao de
 * transmissao e preserva a variacao natural da fala em vez de achatar tudo.
 */
const NIVELAR_VOZ = "loudnorm=I=-14:TP=-1.5:LRA=11";

/**
 * O quanto o plano fecha na emenda do vídeo COMPLETO.
 *
 * 6% e não os 8% dos cortes, por duas diferenças reais entre os dois formatos:
 * o completo mantém a composição 16:9 original (nada foi reenquadrado, então
 * qualquer zoom aparece mais), e ele é longo, com uma emenda a cada 6,5s
 * medidos no vídeo real de 01/09. Alternância forte a cada seis segundos por
 * catorze minutos cansa; 6% lê como troca de câmera e não como zoom.
 *
 * E o centro é o da TELA, nunca o da pessoa. Nos cortes o centro vai na caixa
 * dela porque o quadro 9:16 já foi reenquadrado nela; aqui o quadro é o
 * original, que pode ter slide, lousa ou tela compartilhada ao lado de quem
 * fala. Puxar o zoom para a webcam jogaria fora justamente o que o vídeo
 * mostra.
 */
const ZOOM_DO_COMPLETO = 1.06;

/**
 * A ALTURA de saída do vídeo completo.
 *
 * Medido em 08/09 na gravação real do Bruno (2560x1440 a 7,5 Mbps), 60 s numa
 * máquina de 8 núcleos igual à do Railway:
 *
 *   decodificar só                      4,8 s
 *   decodificar e reduzir para 1080     8,2 s
 *   passe completo em 1440p            25,7 s, 55,2 MB (7,4 Mbps)
 *   passe completo em 1080p            19,6 s, 31,5 MB (4,2 Mbps)
 *
 * Ou seja: o CODIFICADOR cai 45% (20,9 s para 11,4 s), a redução come 3,4 s de
 * volta, e como o completo faz DOIS passes o ganho de ponta a ponta fica perto
 * de um terço do tempo. O arquivo cai quase pela metade, que é o que explica o
 * completo de 1,1 GB visto em 02/09.
 *
 * A perda visual é desprezível numa gravação de câmera falando: 1080p a 4,2
 * Mbps está acima do que o YouTube entrega ao espectador de qualquer jeito.
 * Para voltar ao original, basta pôr 0 aqui: nada mais no caminho depende
 * disto, porque o passe 2 lê a dimensão do arquivo do passe 1.
 */
const ALTURA_DO_COMPLETO = 1080;

/**
 * O que todo arquivo ENTREGUE ao player precisa (30/09): teto de pico e
 * quadro-chave a cada 2 s.
 *
 * O CRF sozinho mantém a média (os cortes de 29/09 mediram 3,6 a 4,2 Mbps),
 * mas deixa o pico livre: 8 Mbps num segundo de zoom com grão. O teto de 6
 * Mbps com buffer de 12 segura esse pico sem mexer na média. E o GOP padrão do
 * libx264 (250 quadros, um quadro-chave a cada 8 s nos cortes medidos) faz
 * cada busca na barra do player decodificar até 8 s antes de mostrar a
 * imagem; a cada 2 s a busca responde na hora, por alguns por cento de bytes.
 */
const PLAYER_WEB = ["-maxrate", "6M", "-bufsize", "12M", "-g", "60"];

/**
 * Roda um ffmpeg até o fim. `nice` (0 a 19) abaixa a prioridade de CPU do
 * processo: o escalonador dá o processador a quem não tem nice quando os dois
 * disputam, e a quem tem nice quando sobra. É como o completo roda junto com
 * os trechos sem atrasá-los.
 */
/**
 * O TETO DE FIOS DOS FILTROS em todo ffmpeg do worker (01/10, parte 240).
 *
 * A causa de "Failed to configure output pad on Parsed_scale_N ... Error
 * reinitializing filters! ... Resource temporarily unavailable" (29/09 no
 * passe 2, 30/09 na montagem, 01/10 no completo do Bruno com 78 cenas): desde
 * o ffmpeg 5, cada `scale` que de fato converte abre uma piscina de fios do
 * tamanho de `-filter_complex_threads`, e o padrão dele é o número de núcleos
 * (8 no Railway). Um lote do acabamento do completo tem até 42 `scale`: o
 * processo chegava a 165 fios, dois lotes juntos a 330, e o contêiner tem
 * teto de processos e fios. Quando o teto chega, o `pthread_create` devolve
 * EAGAIN ("Resource temporarily unavailable") justamente na configuração do
 * filtro seguinte. Reproduzido no WSL com o lote real e `ulimit -u 120`: a
 * mesma mensagem, no `Parsed_scale_85`.
 *
 * Com o teto, o número de fios deixa de crescer com o tamanho do plano (o
 * mesmo lote: 165 fios sem teto, 46 com 2). O ganho de velocidade de muitos
 * fios por `scale` é nenhum aqui: o codificador é quem trabalha.
 * `FFMPEG_FIOS_DO_FILTRO` ajusta sem deploy de código. Quem já passa o seu
 * próprio teto (a montagem dos cortes e o completo) não é tocado.
 */
const FIOS_DO_FILTRO = String(Math.max(1, Number(process.env.FFMPEG_FIOS_DO_FILTRO) || 2));
export function comTetoDeFios(args) {
  const extra = [];
  if (!args.includes("-filter_complex_threads")) extra.push("-filter_complex_threads", FIOS_DO_FILTRO);
  if (!args.includes("-filter_threads")) extra.push("-filter_threads", FIOS_DO_FILTRO);
  // Opções globais: valem em qualquer posição antes da saída, então entram na frente.
  return [...extra, ...args];
}

export function rodar(args, { timeoutMs = 30 * 60 * 1000, cwd, nice = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const linha = ["-hide_banner", "-loglevel", "error", "-y", ...comTetoDeFios(args)];
    // No Windows do desenvolvimento não há `nice`; a prioridade só importa no contêiner.
    const p = nice > 0 && process.platform !== "win32"
      ? spawn("nice", ["-n", String(nice), "ffmpeg", "-nostdin", ...linha], { cwd, stdio: ["ignore", "pipe", "pipe"] })
      : spawn("ffmpeg", ["-nostdin", ...linha], { cwd, stdio: ["ignore", "pipe", "pipe"] });
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
      else reject(new Error(`ffmpeg saiu com ${code}: ${erro.slice(-1800)}`));
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
/**
 * O teto de memória do contêiner, lido do cgroup.
 *
 * Existe porque em 02/09 o vídeo completo morreu duas vezes e a suspeita
 * principal era memória, sem NINGUÉM saber quanta memória a máquina tem. O
 * ffmpeg desta etapa pede entre 600 MB e 1,3 GB, medido; sem o teto do
 * contêiner ao lado, esse número não decide nada.
 *
 * cgroup v2 primeiro (`memory.max`), v1 como reserva. Fora de contêiner os
 * arquivos não existem e a resposta é honesta sobre isso.
 */
export function memoriaDoConteiner() {
  const ler = (caminho) => {
    try {
      return readFileSync(caminho, "utf8").trim();
    } catch {
      return null;
    }
  };
  const max = ler("/sys/fs/cgroup/memory.max") ?? ler("/sys/fs/cgroup/memory/memory.limit_in_bytes");
  const uso = ler("/sys/fs/cgroup/memory.current") ?? ler("/sys/fs/cgroup/memory/memory.usage_in_bytes");
  const mb = (v) => (v && v !== "max" && Number(v) < 1e15 ? Math.round(Number(v) / 1048576) + " MB" : v ?? "desconhecido");
  return { limite: mb(max), emUso: mb(uso) };
}

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
    // Sai no /saude para dar para saber, de fora, qual build esta rodando:
    // sem isto a unica prova de que a reducao subiu e esperar um video sair.
    alturaDoCompleto: ALTURA_DO_COMPLETO || "original",
  };
  return _diagnostico;
}

export function opcaoDeFiltro() {
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

/**
 * A rotação que o player aplica ao fluxo de vídeo, em graus (0, 90, -90, 180).
 *
 * Dois lugares, porque depende de quem gravou: celular e ffmpeg novo põem na
 * matriz de exibição (`side_data_list`, campo `rotation`); arquivo antigo e
 * alguns Android põem na tag `rotate`. O sinal não importa para a troca de
 * largura e altura, só o módulo.
 */
function rotacaoDoFluxo(video) {
  if (!video) return 0;
  for (const sd of video.side_data_list ?? []) {
    if (sd?.rotation != null && Number.isFinite(Number(sd.rotation))) return Math.round(Number(sd.rotation));
  }
  const tag = Number(video.tags?.rotate);
  return Number.isFinite(tag) ? Math.round(tag) : 0;
}

/** A gravação é em pé (mais alta que larga), já com a rotação aplicada. */
export function ehVertical(dim) {
  return Boolean(dim?.largura && dim?.altura && dim.altura > dim.largura);
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
        // GRAVAÇÃO DE CELULAR EM PÉ (30/09). O celular grava o sensor deitado
        // (1920x1080) e marca "gire 90 graus" no metadado (displaymatrix, ou a
        // tag antiga `rotate`). O ffprobe devolve a largura e a altura CODIFICADAS,
        // sem a rotação, mas o ffmpeg aplica a rotação ao decodificar
        // (autorotate, padrão). Sem a troca abaixo, todo filtro que usa estas
        // dimensões (punch-in, recorte da pessoa, redução do completo) faria a
        // conta num quadro deitado e aplicaria num quadro em pé: crop maior que
        // a imagem, vídeo esticado ou erro do ffmpeg.
        const rotacao = rotacaoDoFluxo(video);
        const girado = Math.abs(rotacao) % 180 === 90;
        const w = Number(video?.width ?? 0);
        const h = Number(video?.height ?? 0);
        resolve({
          duracaoSec: Number(json.format?.duration ?? 0),
          largura: girado ? h : w,
          altura: girado ? w : h,
          // A rotação do metadado, em graus. Vai junto para quem precisa saber
          // que o arquivo NÃO pode ser copiado byte a byte e emendado com outro
          // que já saiu em pé (ver prepararCompleto).
          rotacao,
          bytes: Number(json.format?.size ?? 0),
          // Existe para a prova de fumaça poder cobrar o áudio: o passe 2 em
          // lotes sai sem som e o som é colado depois, então "tem áudio" virou
          // uma afirmação que precisa de verificação.
          temAudio: (json.streams ?? []).some((x) => x.codec_type === "audio"),
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
/**
 * ## Por que o EMOJI nao entra aqui, e entra nos cortes
 *
 * Foi tentado, e derrubou o video completo DUAS vezes seguidas em 24/08, com
 * duas construcoes diferentes do overlay. As duas falharam no mesmo ponto:
 *
 *     Failed to configure output pad on Parsed_scale_NNN
 *     Error reinitializing filters!
 *
 * A causa provavel: `movie=` e uma fonte DENTRO do grafo, e um grafo com fonte
 * interna nao sobrevive a uma reinicializacao. O ffmpeg reinicializa o grafo
 * quando as propriedades do quadro decodificado mudam, e a entrada do completo
 * e a GRAVACAO CRUA do cliente, que pode mudar de propriedade no meio; a
 * entrada dos cortes e um intermediario que este proprio codigo recodificou,
 * uniforme por construcao. Por isso os cortes aguentam e o completo nao.
 *
 * Poderia ser resolvido passando cada emoji como `-i` de verdade, com
 * `-loop 1 -framerate 1 -t`, que sobrevive a reinicializacao porque a entrada e
 * decodificada fora do grafo. Nao foi feito por uma razao de prioridade: o
 * completo e o artefato mais caro do fluxo, sao vinte e cinco minutos de
 * codificacao, e o ganho de por emoji num video longo de YouTube e pequeno
 * perto do risco de perder o video inteiro.
 *
 * O que o completo LEVA dos reforcos e a frase de destaque, que e texto e entra
 * pelo arquivo de legenda, sem fonte nenhuma dentro do grafo.
 */
/**
 * O trecho de filtro que reduz a altura do completo, ou vazio quando não há o
 * que reduzir. Largura `-2` porque o libx264 exige dimensão par.
 */
function reducaoDoCompleto(dim) {
  // Gravação EM PÉ (celular, 1080x1920): o teto de 1080 vale para o lado
  // CURTO, que aqui é a largura. Aplicar na altura, como no deitado, reduzia
  // um 1080x1920 para 608x1080, ou seja, entregava pior do que entrou, o que
  // a regra da casa proíbe (30/09).
  if (ehVertical(dim)) {
    if (!ALTURA_DO_COMPLETO || dim.largura <= ALTURA_DO_COMPLETO) return "";
    return `,scale=${ALTURA_DO_COMPLETO}:-2:flags=bicubic`;
  }
  if (!ALTURA_DO_COMPLETO || !dim?.altura || dim.altura <= ALTURA_DO_COMPLETO) return "";
  return `,scale=-2:${ALTURA_DO_COMPLETO}:flags=bicubic`;
}

/*
 * ## DECISÃO (30/09): o completo de gravação EM PÉ sai EM PÉ
 *
 * O que um editor faz com 22 minutos gravados no celular em pé: entrega em pé
 * (Shorts longos, Reels, IGTV, Stories, e o YouTube toca vertical sem tarja no
 * celular, onde está a maior parte da audiência de quem grava assim). A
 * alternativa, 16:9 com a pessoa no meio e ~60% do quadro de fundo borrado
 * durante 22 minutos, é a tarja preta com outra roupa, e inventar pixel para
 * encher a lateral pioraria o que entrou, o que a regra da casa proíbe.
 *
 * Por isso aqui nada muda de proporção: a rotação do celular é aplicada, a
 * redução respeita o lado curto (`reducaoDoCompleto`) e a legenda de destaque
 * é reescrita para o quadro em pé (worker/src/index.mjs,
 * `legendaNoQuadroDoCompleto`). A montagem de colagem do completo segue o
 * formato desta base: em pé ela é montada em 9:16, com a geometria dos cortes
 * verticais (desde 30/09, noite; lib/media/montagem-do-completo.ts,
 * `formatoDoCompleto`, e worker/src/montagem-do-completo.mjs). Os CORTES seguem com os dois formatos de sempre: o vertical é
 * o quadro inteiro, e o horizontal põe a pessoa no meio com a própria imagem
 * desfocada nas laterais (`quadroDeitado`), porque ali são segundos, e não
 * minutos, e o feed do LinkedIn e do X pede caixa larga.
 */
export async function prepararCompleto(entrada, saida, opcoes = {}) {
  const remocoes = (opcoes.remocoes ?? []).filter((r) => r.ate > r.de);
  const nice = opcoes.nice ?? 0;
  const editaTempo = remocoes.length > 0;
  const editaImagem = Boolean(opcoes.legendasArquivo);

  // Gravação com ROTAÇÃO no metadado (celular em pé) não pode ser só copiada:
  // a cópia sai deitada com a marca "gire 90", e a abertura, que é
  // recodificada, sai em pé e sem a marca. A emenda das duas por cópia
  // (`emendar`) juntaria dois tamanhos no mesmo fluxo e o player mostraria a
  // segunda metade deitada ou esticada. Recodificar uma vez aplica a rotação
  // nos pixels, e daí em diante tudo é em pé de verdade (30/09).
  const dimDaEntrada = await ffprobe(entrada).catch(() => null);
  const temRotacao = Boolean(dimDaEntrada?.rotacao);

  if (!editaTempo && !editaImagem && !temRotacao) {
    await rodar(["-i", entrada, "-c", "copy", "-movflags", "+faststart", saida], { nice });
    return { recodificado: false, motivo: "nada a editar, arquivo preservado" };
  }

  if (!editaTempo && !editaImagem && temRotacao) {
    const teto = Math.max(30 * 60 * 1000, Math.round((opcoes.duracaoSec ?? 0) * 1000));
    await rodar(
      [
        "-i", entrada,
        // O ffmpeg já gira ao decodificar; o `format` só existe para a cadeia
        // não ficar vazia quando não há redução.
        "-vf", "format=yuv420p" + reducaoDoCompleto(dimDaEntrada),
        "-c:v", "libx264", "-preset", "faster", "-crf", "18", "-pix_fmt", "yuv420p", ...PLAYER_WEB,
        "-c:a", "copy",
        "-movflags", "+faststart", saida,
      ],
      { timeoutMs: teto, nice }
    );
    return { recodificado: true, motivo: "rotação do celular aplicada" };
  }

  // O teto de tempo acompanha a duração, e não é fixo.
  //
  // Medido em 23/08 na gravação real: com o grafo de trim e concat mais a
  // legenda, o ffmpeg roda a cerca de 4x o tempo real. Um teto fixo de 30
  // minutos aguenta gravação de 2 horas e mata uma de 3, e o sintoma seria um
  // corte que "some" sem erro que explique. Um segundo de teto por segundo de
  // vídeo dá quatro vezes a folga medida, e nunca menos que os 30 minutos.
  const teto = Math.max(30 * 60 * 1000, Math.round((opcoes.duracaoSec ?? 0) * 1000));

  // Só legenda para queimar: não há emenda, então não há o que mascarar, e um
  // passe resolve. O áudio é COPIADO, que é a qualidade máxima possível.
  if (!editaTempo) {
    const cwd = dirname(opcoes.legendasArquivo);
    await rodar(
      [
        "-i", entrada,
        "-vf", "subtitles=" + basename(opcoes.legendasArquivo) + reducaoDoCompleto(await ffprobe(entrada).catch(() => null)),
        "-c:v", "libx264", "-preset", "faster", "-crf", "18", "-pix_fmt", "yuv420p", ...PLAYER_WEB,
        "-c:a", "copy",
        "-movflags", "+faststart", saida,
      ],
      { cwd, timeoutMs: teto, nice }
    );
    return { recodificado: true, motivo: "legendas de destaque" };
  }

  const manter = intervalosQueFicam(remocoes, opcoes.duracaoSec);
  const pasta = dirname(opcoes.legendasArquivo ?? saida);

  // ===================== PASSE 1: UNIFORMIZAR =====================
  //
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
  // Aqui NÃO entra scale, crop nem overlay, e a razão é a causa raiz de três
  // bugs de 24/08: a entrada é a GRAVAÇÃO CRUA do cliente, que pode mudar de
  // propriedade no meio do arquivo. Quando muda, o ffmpeg reinicializa o grafo,
  // e um grafo com nó de imagem sobre [0:v] morre com "Failed to configure
  // output pad ... Error reinitializing filters!". `trim` puro sobrevive.
  //
  // O que sai daqui é justamente o arquivo UNIFORME que o passe 2 precisa.
  // A dimensão da entrada decide se há o que reduzir: gravação que já chega em
  // 1080p ou menos passa reta, porque aumentar vídeo é gastar tempo para
  // entregar a mesma imagem com mais bytes.
  const reducao = reducaoDoCompleto(await ffprobe(entrada).catch(() => null));

  const partes = [];
  const mapa = [];
  manter.forEach((m, i) => {
    partes.push(
      `[0:v]trim=start=${m.de.toFixed(3)}:end=${m.ate.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
      `[0:a]atrim=start=${m.de.toFixed(3)}:end=${m.ate.toFixed(3)},asetpts=PTS-STARTPTS${audioDoSegmento(m)}[a${i}]`
    );
    mapa.push(`[v${i}][a${i}]`);
  });

  // A nivelação de volume entra DENTRO do grafo, e não em `-af`.
  //
  // Descoberto em produção em 24/08, e o erro do ffmpeg diz exatamente o
  // motivo: "-vf/-af/-filter e -filter_complex nao podem ser usados juntos
  // para o mesmo fluxo". Aqui o áudio sai do `concat`, ou seja de dentro do
  // grafo, então pedir `-af` por fora é pedir duas donas para o mesmo fluxo.
  const grafo =
    partes.join(";") + ";" + mapa.join("") +
    `concat=n=${manter.length}:v=1:a=1[vc][ac];[ac]${NIVELAR_VOZ}[a];` +
    // A legenda entra AQUI, e não no passe 2, por dois motivos. Os tempos dela
    // já foram calculados para a linha do tempo editada, que é exatamente esta;
    // e o passe 2 roda em lotes, onde cada lote começaria num instante
    // diferente e a legenda sairia deslocada em doze pedaços.
    // A redução de altura entra AQUI, depois do `concat` e depois da legenda.
    // Depois do concat porque o fluxo já é uniforme neste ponto (é o mesmo
    // lugar onde `subtitles` roda em produção desde 23/08, e é por isso que
    // ela sobrevive à reinicialização que mata nó de imagem sobre `[0:v]`).
    // Depois da legenda porque assim ela é desenhada no tamanho para o qual foi
    // calculada, e só então a imagem inteira encolhe junto.
    (opcoes.legendasArquivo
      ? `[vc]subtitles=${basename(opcoes.legendasArquivo)}${reducao}[v]`
      : reducao ? `[vc]${reducao.slice(1)}[v]` : `[vc]null[v]`);

  // O grafo vai em ARQUIVO, e não na linha de comando. O corte real de 23/08,
  // com 161 remoções, gerou 322 nós e 22.007 caracteres; 700 segmentos passam
  // de 50 mil. O teto de linha de comando do Windows é 32.767, então lá quem
  // recusa é o shell, antes de o ffmpeg ver. No Linux o teto é bem maior, mas
  // o arquivo funciona nos dois e tira essa diferença da conta.
  const arquivoDeFiltro = join(pasta, "filtro.txt");
  await writeFile(arquivoDeFiltro, grafo, "utf8");

  const uniforme = join(pasta, "uniforme.mp4");
  const t1 = Date.now();
  await rodar(
    [
      "-i", entrada,
      opcaoDeFiltro(), basename(arquivoDeFiltro),
      "-map", "[v]", "-map", "[a]",
      // Intermediário: crf 14 e ULTRAFAST (30/09; antes veryfast crf 16). O crf
      // mais fino que o do arquivo final existe para a segunda geração não
      // somar perda visível, e o preset é o mais rápido porque este arquivo
      // não é entregue a ninguém, é insumo. Medido em 60 s de gravação real
      // em 1080p: veryfast 22,0 s, ultrafast 11,8 s, com o arquivo 4x maior
      // (cerca de 2,3 GB para 22 min), o que o disco de 2,9 TB do contêiner
      // nem sente. No teste de 29/09 este passe levou 249 s.
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "14", "-pix_fmt", "yuv420p",
      // Áudio: esta é a ÚNICA recodificação de som do caminho. O passe 2 copia,
      // então a fala nunca passa por duas gerações de AAC.
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart", uniforme,
    ],
    { cwd: pasta, timeoutMs: teto, nice }
  );

  console.log(`completo: passe 1 (uniformizar) em ${((Date.now() - t1) / 1000).toFixed(0)}s`);

  // ===================== PASSE 2: ACABAMENTO =====================
  //
  // ## Por que existe, e o que ele conserta
  //
  // O vídeo que o Bruno reprovou em 01/09 tinha 160 emendas em 14 minutos, uma
  // a cada 6,5 segundos, TODAS em corte seco: nenhum tratamento de imagem na
  // virada. Nos cortes verticais o mesmo problema estava resolvido desde 24/08
  // com o punch-in alternado, e o completo ficava de fora por um impedimento
  // técnico (o grafo morria sobre a entrada crua), não por decisão de produto.
  //
  // Com o passe 1 entregando um arquivo uniforme, o impedimento acabou: a
  // entrada daqui é um intermediário que este próprio código escreveu, do mesmo
  // jeito que a dos cortes.
  //
  // ## Por que ele roda em LOTES, e não num grafo só
  //
  // A primeira versão montava um grafo único com uma fatia por emenda. Em
  // produção, com 149 fatias e 74 pares de `crop`/`scale` em 1440p, o ffmpeg
  // morreu ao configurar o nó 138:
  //
  //     Failed to configure output pad on Parsed_scale_138
  //
  // A mensagem é a MESMA do erro de reinicialização de grafo que já matou o
  // overlay de emoji, e por isso levou a investigação para o lado errado. O
  // grafo aqui está correto: medido em 02/09, ele roda em 10 segundos numa
  // máquina de mesa. O que falta é MEMÓRIA, e agora tem número: **496 MB só
  // para montar esse grafo**, medido no pico do processo, antes de codificar
  // um único quadro. Um contêiner pequeno não tem isso sobrando, e a falha
  // aparece exatamente onde a alocação estourou, num nó de escala qualquer.
  //
  // Em lotes, cada rodada monta poucos escaladores e a memória fica plana, não
  // importa se o vídeo tem 15 minutos ou duas horas. O custo é um processo por
  // lote, que é ruído perto de uma codificação de 1440p.
  //
  // ## Por que o áudio não entra nos lotes
  //
  // Recortar áudio com `-ss` por lote arrisca deslocar alguns milissegundos em
  // cada emenda, e treze lotes depois isso vira um quarto de segundo fora da
  // imagem. Os lotes saem SEM áudio, e o som do intermediário é colado inteiro
  // no fim, copiado, sem recodificar e sem chance de deriva.
  const dim = await ffprobe(uniforme).catch(() => null);
  const emendas = [];
  let acumulado = 0;
  for (const m of manter) {
    const ate = Math.min(m.ate, opcoes.duracaoSec ?? m.ate);
    if (ate - m.de <= 0) continue;
    acumulado += ate - m.de;
    emendas.push(acumulado);
  }
  const fim = dim?.duracaoSec ?? acumulado;

  // ## A fatia mínima
  //
  // Medido no vídeo real: as 149 emendas produziam uma fatia de 0,110s, três
  // quadros a 30 fps. Fatia assim não dá material para o filtro trabalhar e
  // não vira efeito nenhum aos olhos. O piso de 0,6s garante 18 quadros e, de
  // quebra, limita a troca de plano a uma a cada 0,6s, que é o que separa
  // "corte de câmera" de estrobo (a lição de 30/08, agora com número).
  //
  // A emenda que não vira troca de plano continua no vídeo: ela só deixa de
  // ganhar tratamento de imagem, e o pedaço herda o plano do vizinho.
  const MINIMO_DA_FATIA = 0.6;
  const cortes = [0];
  for (const t of emendas) {
    if (t < MINIMO_DA_FATIA) continue;
    if (t > fim - MINIMO_DA_FATIA) continue;
    if (t - cortes[cortes.length - 1] < MINIMO_DA_FATIA) continue;
    cortes.push(t);
  }
  cortes.push(fim);

  const porLote = Math.max(2, opcoes.fatiasPorLote ?? 12);
  const t2 = Date.now();

  // Os lotes são montados todos antes e codificados em piscina (dois por vez
  // no contêiner de 7,6 GB). A paridade do plano é GLOBAL, calculada aqui na
  // montagem, então a ordem em que os lotes terminam não importa: cada um sabe
  // o próprio lugar (`ordem`) e o próprio arquivo.
  const lotes = [];
  for (let inicio = 0; inicio < cortes.length - 1; inicio += porLote) {
    const doLote = cortes.slice(inicio, Math.min(inicio + porLote + 1, cortes.length));
    if (doLote.length < 2) break;
    const t0 = doLote[0];
    const duracaoDoLote = doLote[doLote.length - 1] - t0;

    const nos = [];
    const rotulos = [];
    for (let k = 0; k < doLote.length - 1; k++) {
      // A paridade é GLOBAL, e não do lote: o plano tem que continuar
      // alternando na virada de um lote para o outro, senão a emenda que cai
      // na fronteira fica sem tratamento e reaparece o corte seco.
      const fechado = (inicio + k) % 2 === 1;
      const de = doLote[k] - t0;
      const ate = doLote[k + 1] - t0;
      nos.push(
        `[0:v]trim=start=${de.toFixed(3)}:end=${ate.toFixed(3)},setpts=PTS-STARTPTS` +
          `${segmentoComPunchIn(fechado, dim?.largura, dim?.altura, null, ZOOM_DO_COMPLETO, ate - de)}[w${k}]`
      );
      rotulos.push(`[w${k}]`);
    }
    const ordem = lotes.length;
    const grafoDoLote =
      nos.join(";") + ";" + rotulos.join("") + `concat=n=${rotulos.length}:v=1:a=0[v]`;
    const arquivoDoLote = join(pasta, `filtro-lote-${ordem}.txt`);
    await writeFile(arquivoDoLote, grafoDoLote, "utf8");
    lotes.push({
      ordem,
      t0,
      duracaoDoLote,
      arquivoDoLote,
      parte: join(pasta, `parte-${String(ordem).padStart(3, "0")}.mp4`),
    });
  }

  const codificarLote = ({ t0, duracaoDoLote, arquivoDoLote, parte }) =>
    rodar(
      [
        // `-ss` ANTES do `-i` para não decodificar o vídeo inteiro em cada
        // lote: com recodificação, o ffmpeg busca o quadro-chave anterior e
        // descarta até o instante exato, então o lote começa onde deve.
        "-ss", t0.toFixed(3),
        "-i", uniforme,
        "-t", duracaoDoLote.toFixed(3),
        opcaoDeFiltro(), basename(arquivoDoLote),
        "-map", "[v]", "-an",
        // ## MEMÓRIA, medida em 02/09 e relida em 04/09
        //
        // Quem pesa não é o grafo, é o CODIFICADOR. No arquivo real de 1440p,
        // pico do processo: um lote em `veryfast` com 2 fios, 643 MB; com os
        // fios automáticos (8 vCPU) perto de 1,2 GB. Até 04/09 este comando
        // rodava com `-threads 2` e lookahead curto porque se acreditava num
        // contêiner pequeno; o /saude mostrou 7629 MB de limite, e o passe 2
        // levava 13 minutos num núcleo e meio. Dois lotes ao mesmo tempo, cada
        // um com os fios que quiser, cabem com folga ao lado dos trechos.
        //
        // Em CRF a qualidade é a mesma; o preset mexe no TAMANHO do arquivo.
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        // Cada lote precisa abrir com quadro-chave e fechar o GOP no fim, senão
        // a emenda por cópia entre os lotes trava na virada.
        "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
        // Teto de pico para o player (ver PLAYER_WEB); o GOP já está acima.
        "-maxrate", "6M", "-bufsize", "12M",
        "-movflags", "+faststart", parte,
      ],
      { cwd: pasta, timeoutMs: teto, nice }
    );

  // ## Segunda chance por lote, e o completo SEM plano como última saída
  //
  // Em 29/09 o passe 2 morreu com "Failed to configure output pad on
  // Parsed_scale_17 ... Resource temporarily unavailable" enquanto três cortes
  // travados disputavam o contêiner, e o vídeo completo simplesmente não veio:
  // 22 minutos de trabalho perdidos e a faixa do Gestor contando para sempre.
  // "Resource temporarily unavailable" é falta de recurso na hora, não defeito
  // do lote (a mesma lição dos trechos em 08/09). Então: o lote que falha é
  // repetido SOZINHO no fim; se falhar de novo, o completo sai do passe 1 numa
  // codificação simples, sem a troca de plano nas emendas. Um completo sem
  // punch-in é pior; completo nenhum é defeito.
  const emParalelo = Math.max(1, opcoes.lotesEmParalelo ?? 1);
  const fila = [...lotes];
  const falhados = [];
  await Promise.all(
    Array.from({ length: Math.min(emParalelo, lotes.length) }, async () => {
      while (fila.length) {
        const lote = fila.shift();
        try {
          await codificarLote(lote);
        } catch (e) {
          console.warn(`completo: lote ${lote.ordem} falhou, repete sozinho no fim: ${String(e?.message ?? e).slice(0, 200)}`);
          falhados.push(lote);
        }
      }
    })
  );
  try {
    for (const lote of falhados) await codificarLote(lote);
  } catch (e) {
    console.error(`completo: passe 2 falhou de novo, entrego sem troca de plano: ${String(e?.message ?? e).slice(0, 300)}`);
    await rodar(
      [
        "-i", uniforme,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", ...PLAYER_WEB,
        "-c:a", "copy",
        "-movflags", "+faststart", saida,
      ],
      { cwd: pasta, timeoutMs: teto }
    );
    await rm(uniforme, { force: true }).catch(() => {});
    for (const l of lotes) await rm(l.parte, { force: true }).catch(() => {});
    return {
      recodificado: true,
      motivo: `${remocoes.length} trechos removidos, sem troca de plano (o acabamento falhou duas vezes)`,
    };
  }
  const partesDoVideo = lotes.map((l) => l.parte);

  // Os lotes viram um vídeo só por CÓPIA, sem recodificar nada.
  const soVideo = join(pasta, "so-video.mp4");
  if (partesDoVideo.length === 1) {
    await copyFile(partesDoVideo[0], soVideo);
  } else {
    await emendar(partesDoVideo, soVideo, pasta);
  }

  // E o som do intermediário entra inteiro, copiado.
  await rodar(
    [
      "-i", soVideo,
      "-i", uniforme,
      "-map", "0:v", "-map", "1:a",
      "-c", "copy", "-shortest",
      "-movflags", "+faststart", saida,
    ],
    { cwd: pasta, timeoutMs: teto }
  );
  console.log(
    `completo: passe 2 (acabamento) em ${((Date.now() - t2) / 1000).toFixed(0)}s, ` +
      `${partesDoVideo.length} lotes, ${cortes.length - 1} fatias`
  );

  // O intermediário e os lotes saem do disco na hora: juntos eles passam do
  // tamanho do arquivo entregue, e dois vídeos grandes seguidos enchem o
  // contêiner.
  await rm(uniforme, { force: true }).catch(() => {});
  await rm(soVideo, { force: true }).catch(() => {});
  for (const p of partesDoVideo) await rm(p, { force: true }).catch(() => {});

  const partesDoMotivo = [`${remocoes.length} trechos removidos`];
  partesDoMotivo.push(`${Math.max(0, cortes.length - 2)} emendas com mudança de plano`);
  if (opcoes.legendasArquivo) partesDoMotivo.push("legendas de destaque");
  return { recodificado: true, motivo: partesDoMotivo.join(", ") };
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
/**
 * O SILÊNCIO REAL NO FIM DO CORTE, medido no áudio (30/09).
 *
 * A transcrição cola as palavras: no teste do Bruno "ferramentas." terminava
 * em 769,08 s e "Hoje" começava em 769,08 s, sem pausa nenhuma entre elas.
 * Com a borda decidida só pelos tempos das palavras, o corte levava o começo
 * da frase seguinte, e ele ouviu isso como "termina no início da próxima
 * frase". Aqui o áudio decide, perto da fronteira que a transcrição deu: no
 * trecho de 0,22 s antes até 0,04 s depois dela, acha o VALE de energia (o
 * instante mais baixo, e entre vales parecidos o mais tardio) e devolve esse
 * instante absoluto. O chamador emudece dali em diante, então nenhum tempo
 * muda e legenda e montagem continuam alinhadas.
 *
 * A primeira versão procurava "o último silêncio da janela de 0,5 s" e, na
 * prova com a gravação do Bruno, emudecia o "né?" inteiro (a pausa antes dele)
 * e cortava o "-tas" de "ferramentas" (a oclusão do "t"). O vale colado na
 * fronteira não tem esse risco: cai entre "ferramentas" e "Hoje" (768,92 s) e
 * entre "né?" e "Você" (64,26 s). Sem vale claro, devolve null e nada muda.
 */
export async function silencioNoFim(entrada, fimAbs) {
  const antes = 0.8;
  const depois = 0.1;
  const de = Math.max(0, fimAbs - antes);
  const taxa = 16000;
  const pcm = await new Promise((resolver) => {
    const pedacos = [];
    const p = spawn("ffmpeg", [
      "-nostdin",
      "-v", "error", "-ss", de.toFixed(3), "-i", entrada, "-t", (fimAbs - de + depois).toFixed(3),
      "-vn", "-ac", "1", "-ar", String(taxa), "-f", "s16le", "-",
    ]);
    p.stdout.on("data", (d) => pedacos.push(d));
    p.on("error", () => resolver(null));
    p.on("close", (codigo) => resolver(codigo === 0 ? Buffer.concat(pedacos) : null));
  });
  if (!pcm || pcm.length < 2 * taxa * 0.4) return null;
  const amostras = Math.floor(pcm.length / 2);
  const passo = taxa / 100; // quadros de 10 ms
  const bruto = [];
  for (let i = 0; i + passo <= amostras; i += passo) {
    let soma = 0;
    for (let j = 0; j < passo; j++) {
      const v = pcm.readInt16LE((i + j) * 2) / 32768;
      soma += v * v;
    }
    bruto.push(Math.sqrt(soma / passo));
  }
  // Média de 30 ms: um quadro isolado baixo no meio de uma sílaba não é vale.
  const rms = bruto.map((_, k) => {
    const viz = bruto.slice(Math.max(0, k - 1), k + 2);
    return viz.reduce((x, y) => x + y, 0) / viz.length;
  });
  const ordenado = [...rms].sort((x, y) => x - y);
  const fala = ordenado[Math.floor(ordenado.length * 0.9)] ?? 0;
  if (fala < 0.01) return null;
  const alvo = Math.round((fimAbs - de) * 100);
  const k0 = Math.max(0, alvo - 22);
  const k1 = Math.min(rms.length - 1, alvo + 4);
  let minimo = Infinity;
  for (let k = k0; k <= k1; k++) minimo = Math.min(minimo, rms[k]);
  // Vale de verdade: bem abaixo do nível da fala.
  if (minimo > fala * 0.3) return null;
  let escolhido = k0;
  for (let k = k0; k <= k1; k++) if (rms[k] <= minimo * 1.3 + 0.0005) escolhido = k;
  return de + escolhido / 100;
}

export async function prepararTrecho(entrada, saida, inicio, duracao, intervalos, pessoa = null) {
  const manter = (intervalos ?? []).filter((m) => m.ate - m.de > 0.05);
  // Onde o áudio de verdade termina (ver `silencioNoFim`). Só vale se cair no
  // último pedaço mantido e antes do fim: aí o som é emudecido desse ponto em
  // diante, sem mudar a duração.
  const ultimoPedaco = manter.length ? manter[manter.length - 1] : { de: 0, ate: duracao };
  const fimDoAudio = await silencioNoFim(entrada, inicio + Math.min(duracao, ultimoPedaco.ate)).catch(() => null);
  const mudoDesde =
    fimDoAudio != null && fimDoAudio - inicio > ultimoPedaco.de + 0.3 && fimDoAudio - inicio < Math.min(duracao, ultimoPedaco.ate) - 0.02
      ? fimDoAudio - inicio
      : null;
  if (mudoDesde != null) console.log(`[trecho] fim da fala no áudio: emudece a partir de ${mudoDesde.toFixed(2)} s de ${duracao.toFixed(2)} s`);
  // Um único pedaço que cobre o trecho inteiro quer dizer que não havia nada a
  // remover ali. Nesse caso não vale montar grafo de filtro nenhum.
  const inteiro =
    manter.length <= 1 &&
    (!manter.length || (manter[0].de <= 0.001 && manter[0].ate >= duracao - 0.001));

  if (inteiro) {
    // Nada a tirar: recorta e pronto, sem recodificar à toa.
    await rodar([
      "-ss", String(inicio), "-i", entrada, "-t", String(duracao),
      ...(mudoDesde != null ? ["-af", `afade=t=out:st=${Math.max(0, mudoDesde - 0.015).toFixed(3)}:d=0.03`] : []),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart", saida,
    ]);
    return { removidos: 0, segundos: 0 };
  }

  const dim = await ffprobe(entrada);
  const partes = [];
  const mapa = [];
  // O plano alterna em TODA emenda. A regra de 30/08 (segmento curto herda o
  // plano) foi revertida em 31/08 pelo proprio Bruno: sem mudanca de plano, a
  // emenda vira pulo seco ("cortes bruscos entre falas"). O estrobo de 30/08
  // nao era a alternancia, era o zoom centrado na TELA deslocando a pessoa;
  // com o centro na caixa dela (abaixo), alternar sempre le como corte de
  // camera, que e o efeito que ele pediu ("mudar a cena, dando um pouco de
  // zoom").
  manter.forEach((m, i) => {
    const fechado = i % 2 === 1;
    partes.push(
      `[0:v]trim=start=${m.de.toFixed(3)}:end=${m.ate.toFixed(3)},setpts=PTS-STARTPTS` +
        `${segmentoComPunchIn(fechado, dim.largura, dim.altura, pessoa, 1.08, m.ate - m.de)}[v${i}]`,
      `[0:a]atrim=start=${m.de.toFixed(3)}:end=${m.ate.toFixed(3)},asetpts=PTS-STARTPTS${audioDoSegmento(m)}` +
        // O último pedaço emudece onde a fala acabou de verdade (30/09).
        (i === manter.length - 1 && mudoDesde != null ? `,afade=t=out:st=${Math.max(0, mudoDesde - m.de - 0.015).toFixed(3)}:d=0.03` : "") +
        `[a${i}]`
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

/**
 * O filtro de vídeo de um segmento mantido, com o PUNCH-IN alternado.
 *
 * Pedido do Bruno em 24/08: "toda vez que limpar, dar um efeito para a
 * transição do corte ficar sutil". É o tratamento padrão de jump cut do
 * mercado inteiro: a cada emenda, o enquadramento alterna entre o plano normal
 * e um plano 5,5% mais fechado. O pulo da pessoa entre dois pedaços deixa de
 * parecer defeito e passa a parecer um corte de câmera intencional.
 *
 * 5,5% e não mais: acima de ~8% o vaivém vira zoom nervoso; abaixo de ~4% o
 * olho não registra a mudança de plano e o pulo volta a aparecer.
 *
 * O `scale` de volta para o tamanho EXATO da fonte não é enfeite: o `concat`
 * exige todos os segmentos com a mesma dimensão, e um crop de conta quebrada
 * derrubaria a emenda inteira.
 */
function segmentoComPunchIn(fechado, largura, altura, pessoa = null, zoom = 1.08, duracao = null) {
  // TODA fatia sai com os MESMOS parâmetros, tenha ela punch-in ou não.
  //
  // O `concat` exige que suas entradas casem em formato e proporção de pixel.
  // Quando metade das fatias passa por `scale` (que normaliza os dois) e a
  // outra metade vai crua, as entradas podem divergir, e o ffmpeg tenta
  // reconfigurar o grafo no meio do fluxo:
  //
  //     Failed to configure output pad on Parsed_scale_138
  //     Error reinitializing filters!
  //     Failed to inject frame into filter network
  //
  // Foi o erro que segurou o vídeo completo do cliente em 02/09. Normalizar as
  // duas pontas custa nada e fecha a porta inteira.
  const normalizado = ",format=yuv420p,setsar=1";
  if (!fechado || !largura || !altura) return normalizado;
  // Pedaço curto demais não ganha tratamento de imagem: poucos quadros não dão
  // material para o filtro e o olho não registra a troca de plano.
  if (duracao !== null && duracao < 0.14) return normalizado;
  // 8%: o topo da faixa que nao vira zoom nervoso (medido em 24/08: acima de
  // ~8% cansa, abaixo de ~4% o olho nao registra). O 5,5% de 24/08 era para
  // emenda frequente; com o pedido do Bruno de "mudar a cena" (31/08), o
  // plano fechado precisa ser percebido como plano NOVO.
  const z = zoom;
  const w = Math.round(largura / z / 2) * 2;
  const h = Math.round(altura / z / 2) * 2;
  // O zoom e centrado na PESSOA, e nao no centro do quadro.
  //
  // Medido em 30/08, na gravacao de tela do Bruno com a webcam na borda
  // esquerda: o punch-in centrado na tela deslocava a janela dela uns 60 px na
  // fonte, que viram 200 px no corte vertical de 1080, entao a cada emenda a
  // pessoa pulava de lugar e mudava de tamanho. O audio estava em sincronia
  // (conferido quadro a quadro), mas o pulo le como "imagem descasada".
  // Com o centro na caixa da pessoa, ela fica parada e so o plano fecha.
  const cx = pessoa ? (pessoa.x + pessoa.w / 2) * largura : largura / 2;
  const cy = pessoa ? (pessoa.y + pessoa.h / 2) * altura : altura / 2;
  const x = Math.round(Math.max(0, Math.min(largura - w, cx - w / 2)));
  const y = Math.round(Math.max(0, Math.min(altura - h, cy - h / 2)));
  return `,crop=${w}:${h}:${x}:${y},scale=${largura}:${altura}${normalizado}`;
}

/**
 * O filtro de áudio de um segmento mantido, com o TIRA-ESTALO.
 *
 * O Bruno ouviu em 25/08: "ainda tem alguns cortes secos, dá aquele ruído".
 * É o clique clássico de emenda: o áudio de um segmento termina num ponto
 * qualquer da onda e o seguinte começa em outro, e o salto vira um estalo.
 *
 * ## 30ms, e não 15ms, e a razão não é o número
 *
 * Até 01/09 o fade era de 15ms e caía SOBRE A FALA: o segmento começava na
 * primeira palavra e subia de zero, comendo o ataque da consoante. Medido no
 * arquivo entregue que o Bruno reprovou: 18 pontos ainda com descontinuidade de
 * amostra, ou seja, o tira-estalo não estava dando conta.
 *
 * Agora o app devolve 30ms de folga em cada ponta da remoção
 * (`folgaParaEmenda`), e essa folga é silêncio ou rabo de muleta. O fade
 * acontece em cima DELA, e a fala entra e sai em volume cheio. Por isso o fade
 * daqui tem que casar com a folga de lá: 30ms dos dois lados.
 *
 * O fade de saída só entra quando o fim do segmento é conhecido: o último
 * pedaço do vídeo completo corre até o fim do arquivo, sem duração declarada.
 */
const FADE_DA_EMENDA = 0.03;

function audioDoSegmento(m) {
  const dur = m.ate - m.de;
  if (dur < 0.1) return "";
  // Em segmento curtíssimo o fade não pode passar de um terço dele, senão o
  // pedaço inteiro vira rampa e o volume oscila de forma audível.
  const d = Math.min(FADE_DA_EMENDA, dur / 3).toFixed(3);
  let filtro = `,afade=t=in:st=0:d=${d}`;
  if (m.ate < 999998) {
    filtro += `,afade=t=out:st=${Math.max(0, dur - Number(d)).toFixed(3)}:d=${d}`;
  }
  return filtro;
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
      "-nostdin",
      "-hide_banner",
      "-ss", String(inicio), "-t", "60", "-i", entregue,
      "-ss", String(inicio), "-t", "60", "-i", original,
      // `scale2ref` porque desde 08/09 o completo sai em 1080p e o original
      // pode ser 1440p, e o `ssim` recusa entradas de tamanhos diferentes: sem
      // isto a medida sumiria em silêncio, virando null em toda entrega. O que
      // se mede aqui é a perda de COMPRESSÃO no tamanho entregue; a redução de
      // altura é decisão declarada, não defeito a medir.
      "-lavfi", "[1:v][0:v]scale2ref=flags=bicubic[orig][ent];[ent][orig]ssim",
      "-f", "null", "-",
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
  // Gravação em pé (30/09): cortar 16:9 do meio de um quadro 9:16 fica com
  // uma faixa do peito e corta a cabeça. A capa deitada leva a pessoa inteira
  // no centro e a própria imagem desfocada nas laterais, como o horizontal
  // dos cortes; o `recorte` do agente (a janela da webcam numa gravação de
  // tela) não se aplica a quadro de celular.
  if (ehVertical(await ffprobe(entrada).catch(() => null))) {
    await rodar([
      "-ss", String(instante),
      "-i", entrada,
      "-frames:v", "1",
      "-vf",
      "split=2[cfundo][cfrente];" +
        "[cfundo]scale=320:180:force_original_aspect_ratio=increase,crop=320:180,boxblur=10:2," +
        "scale=1280:720,eq=brightness=-0.06,setsar=1[cborrado];" +
        "[cfrente]scale=-2:720,setsar=1[cpessoa];[cborrado][cpessoa]overlay=(W-w)/2:0",
      "-q:v", "2",
      saida,
    ], { timeoutMs: 2 * 60 * 1000 });
    return;
  }
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
 * Um quadro inteiro, na resolução e na orientação da gravação (já girado).
 * Existe para o recorte da pessoa da capa de uma gravação em pé: a capa
 * deitada tem a imagem desfocada nas laterais, e o segmentador poderia achar
 * "pessoa" no borrão (30/09).
 */
export async function extrairQuadroInteiro(entrada, saida, instante) {
  await rodar(["-ss", String(instante), "-i", entrada, "-frames:v", "1", "-q:v", "2", saida], {
    timeoutMs: 2 * 60 * 1000,
  });
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
/**
 * Sobrepoe os emoji num grafo que termina em `[v]`.
 *
 * Existe fatorado porque o corte vertical e o video completo precisam da mesma
 * coisa em quadros de tamanhos diferentes, e duas copias disto divergiriam na
 * primeira vez que um dos dois mudasse.
 *
 * Imagem e nao texto porque o libass deste ffmpeg desenha emoji so em contorno,
 * sem cor: medido em 24/08 com a fonte do sistema (COLR) e com a Noto Color
 * Emoji (CBDT), e nas duas o resultado foi monocromatico.
 */
/**
 * A cadeia de áudio de um corte, com ou sem trilha.
 *
 * ## Como a música entra, e por que assim
 *
 * A trilha toca por baixo da voz no volume do ESTILO (`som.volumeDaTrilha`) e
 * ABAIXA quando a pessoa fala, pelo `sidechaincompress`: a voz comprime a
 * trilha, que volta sozinha nas pausas. É a mixagem que todo editor faz, e o
 * quanto abaixa vem de `som.abaixarSobAVoz`, também do estilo.
 *
 * A trilha entra com fade de 0,6s e sai com fade de 1s antes do fim do corte:
 * música que corta seca no fim parece erro, e música que já está tocando no
 * primeiro quadro engole a primeira palavra.
 *
 * O `loudnorm` fecha a cadeia DEPOIS da mixagem, porque nivelar antes deixaria
 * a soma voz mais trilha acima do alvo.
 *
 * @param musica nome do arquivo da trilha na pasta de trabalho, ou null
 * @param indiceDaMusica índice do input `-i` da trilha no comando
 */
function cadeiaDeAudio(musica, indiceDaMusica, duracao, som) {
  if (!musica) return null;
  const volume = Math.max(0.05, Math.min(0.6, som?.volumeDaTrilha ?? 0.25));
  // O quanto a voz comprime a trilha: abaixar 0,5 vira razão ~6:1, abaixar
  // 0,75 vira ~9:1. Mais que 12:1 soa como liga-desliga.
  const razao = Math.max(3, Math.min(12, Math.round(2 + (som?.abaixarSobAVoz ?? 0.5) * 10)));
  const fimDoFade = Math.max(0, duracao - 1).toFixed(3);
  return (
    `[${indiceDaMusica}:a]atrim=0:${duracao.toFixed(3)},asetpts=PTS-STARTPTS,` +
      `volume=${volume.toFixed(2)},afade=t=in:st=0:d=0.6,afade=t=out:st=${fimDoFade}:d=1[trilha];` +
    `[0:a]asplit=2[vozLado][vozMix];` +
    `[trilha][vozLado]sidechaincompress=threshold=0.02:ratio=${razao}:attack=25:release=400[trilhaBaixa];` +
    `[vozMix][trilhaBaixa]amix=inputs=2:duration=first:dropout_transition=0,${NIVELAR_VOZ}[aout]`
  );
}

function comEmoji(grafo, emojis, largura, x, y) {
  const daPaleta = (emojis ?? []).filter((e) => e && e.arquivo);
  if (!daPaleta.length) return grafo;

  const partes = [grafo.replace(/\[v\]$/, "[base0]")];
  daPaleta.forEach((e, i) => {
    const de = Math.max(0, e.segundo);
    const destino = i === daPaleta.length - 1 ? "v" : `base${i + 1}`;
    partes.push(
      // UM QUADRO SO, e o `enable` decide quando ele aparece.
      //
      // Esta e a terceira versao, e as duas anteriores quebraram em producao de
      // formas diferentes. Vale registrar as tres, porque o caminho entre elas
      // e a explicacao:
      //
      //   1. Fluxo curto, atrasado com `setpts`, ligado por `enable`.
      //      QUEBROU num corte: o `overlay` precisa de um quadro do fluxo
      //      secundario para se configurar, e antes de 1,94s nao havia nenhum.
      //      O erro falava de largura e altura do codificador.
      //
      //   2. Fluxo cobrindo o video INTEIRO, com o alpha fazendo aparecer.
      //      Resolveu o corte e QUEBROU o video completo: 14 emoji vezes 27
      //      minutos a 30 quadros sao 690 mil quadros de imagem parada para o
      //      grafo carregar. O erro foi "Failed to configure output pad" num
      //      `scale`, que e o sintoma de um grafo pesado demais.
      //
      //   3. Esta: UM quadro, sem `fps`, sem `trim`, sem `setpts`. O `overlay`
      //      repete o ultimo quadro do secundario por padrao, entao a imagem
      //      existe do instante zero ao fim, e custa um quadro em vez de
      //      cinquenta mil. O `enable` cuida do tempo.
      //
      // O preco e a entrada em corte seco, sem esmaecer. Para um acento de 1,6
      // segundo isso le como pontuacao e nao como falta, e vale muito mais que
      // uma animacao que derruba o video completo.
      `movie=${e.arquivo},format=rgba,scale=${largura}:-1[e${i}]`,
      `[base${i}][e${i}]overlay=${x}:${y}:` +
        `enable='between(t,${de.toFixed(3)},${(de + 1.6).toFixed(3)})':format=auto` +
        // O ULTIMO overlay devolve o formato para yuv420p. A composicao ja
        // terminava em yuv420p e o emoji entra depois disso com um fluxo rgba:
        // sem esta linha o codificador escolhe outro formato, e o simbolo de
        // aviso sai verde e roxo em vez de amarelo e preto. Visto no teste
        // local, e nao em log nenhum, porque o arquivo sai valido.
        (destino === "v" ? ",format=yuv420p" : "") +
        `[${destino}]`
    );
  });
  return partes.join(";");
}

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
  ajusteDeBrilho,
  emojis,
  musica,
  som,
  // As dimensoes da gravacao, para o empilhado saber a ALTURA de cada bloco
  // antes de compor. Sem elas o layout cai nas larguras fixas de antes.
  dimensoes,
  // O tratamento da linguagem (30/09): { ...tratamento, momentos }.
  tratamento = null
) {
  // GRAVAÇÃO JÁ EM PÉ (celular, 30/09): o quadro inteiro já é o vertical. Não
  // há webcam no canto para achar nem slide para empilhar, e recortar a caixa
  // da pessoa seria ampliar o rosto duas vezes sem motivo. O corte central
  // abaixo, com a caixa ignorada, devolve o quadro inteiro em 1080x1920.
  const emPe = ehVertical(dimensoes);
  const comRecorte = !emPe && matte && (fundo || enquadramento?.tela);
  const filtro = comRecorte
    ? montarFiltroRecortado(enquadramento, matte, duracao, fundo, ritmo, ajusteDeBrilho, dimensoes)
    : montarFiltroVertical(
        emPe ? null : enquadramento,
        Math.max(0, Math.min(0.12, ritmo?.forcaDoZoom ?? 0.04)),
        duracao
      );

  // A legenda entra por ÚLTIMO, depois de tudo composto.
  //
  // Ordem não é detalhe aqui: o `subtitles` desenha em cima do que recebe, e a
  // sobreposição da pessoa vem depois de tudo o mais. Queimar antes deixaria a
  // silhueta passando por cima da própria legenda.
  //
  // Sem isto, a peça mais cara do corte não chegava na tela: 85% dos vídeos
  // curtos são assistidos sem som, e até 24/08 os cortes saíam sem legenda
  // nenhuma. O módulo existia e o fluxo não o chamava.
  // O tratamento da linguagem entra ANTES da legenda: câmera e cor mexem no
  // vídeo, nunca no texto por cima dele.
  const trat = cadeiaDoTratamento(tratamento, 1080, 1920, duracao, tratamento?.momentos);
  const comTratamento = trat ? filtro.replace(/\[v\]$/, `[semTrat];[semTrat]${trat}[v]`) : filtro;
  let grafo = legenda
    ? comTratamento.replace(/\[v\]$/, `[semLegenda];[semLegenda]subtitles=${legenda}[v]`)
    : comTratamento;

  // E o emoji por último de todos, porque ele é acento e acento fica por cima.
  grafo = comEmoji(
    grafo,
    emojis,
    LAYOUT.EMOJI,
    `(W-w)/2+${LAYOUT.EMOJI_X}`,
    `H-${LAYOUT.EMOJI_Y}`
  );

  // O FADE DE VÍDEO nas pontas: um quarto de segundo entrando e um terço
  // saindo. Corte que abre e fecha seco parece arquivo cortado; o fade curto é
  // a transição que o Bruno pediu sem virar efeito de slide.
  grafo = grafo.replace(
    /\[v\]$/,
    `[semFade];[semFade]fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(0, duracao - 0.35).toFixed(3)}:d=0.35[v]`
  );

  // A TRILHA, quando o projeto tem uma.
  const audio = cadeiaDeAudio(musica, comRecorte ? 2 : 1, duracao, som);
  if (audio) grafo += ";" + audio;

  // O GRAFO entra na mensagem de erro quando algo quebra.
  //
  // Em 24/08 o mesmo trecho falhou tres vezes com "Error while opening encoder
  // for output stream, maybe incorrect parameters such as width or height", que
  // nao diz qual filtro nem qual valor. Sem o grafo em maos, cada hipotese
  // custava uma rodada de meia hora. Sao alguns milhares de caracteres num
  // caminho que so roda quando ja deu errado.
  try {
    await rodar([
    "-ss", String(inicio),
    "-i", entrada,
    ...(comRecorte ? ["-i", matte.arquivo] : []),
    // A trilha em loop: gravação mais longa que a faixa não fica muda no meio.
    ...(musica ? ["-stream_loop", "-1", "-i", musica] : []),
    "-filter_complex", grafo,
    "-map", "[v]", ...(audio ? ["-map", "[aout]"] : ["-map", "0:a?"]),
    // O `-t` fica DEPOIS de todos os inputs, senão ele vira opção de input do
    // último `-i` e limita o arquivo errado. Foi assim que o primeiro teste da
    // composição nova travou para sempre: o `-t` truncava a máscara em vez da
    // saída, e o gradiente do fundo é uma fonte SEM FIM, então o ffmpeg
    // codificava até o disco acabar.
    "-t", String(duracao),
    // `-pix_fmt` explicito alem do `format` no grafo: se um dia o grafo mudar e
    // alguem esquecer o formato no fim, o video sai num formato que metade dos
    // aparelhos nao decodifica, e o sintoma e "o video nao abre no celular
    // dele", que e caro de diagnosticar.
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", ...PLAYER_WEB,
    // Com trilha, o loudnorm ja fechou a cadeia dentro do grafo; sem ela, entra
    // como -af no caminho simples.
    ...(audio ? [] : ["-af", NIVELAR_VOZ]),
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    saida,
  ], {
    // O filtro `movie=` resolve caminho relativo a partir do diretório de
    // trabalho, e caminho absoluto do Windows com dois-pontos quebra o parser
    // de filtro. Rodar dentro da pasta e passar só o nome resolve os dois, e é
    // o mesmo cuidado que a legenda e o filtro em arquivo já tomavam.
    cwd: dirname(saida),
    // Com o tratamento da linguagem, teto proporcional ao corte, e não os 30
    // minutos padrão: em 29/09 três cortes travaram com o tratamento e cada
    // um só caiu para a segunda tentativa (sem ele) depois de 1800 s. Oito
    // segundos por segundo de corte são seis vezes o medido com a cadeia nova.
    ...(trat ? { timeoutMs: Math.max(4 * 60_000, Math.round(duracao * 8000)) } : {}),
    });
  } catch (e) {
    e.message = `${e.message}
  grafo: ${grafo}`;
    throw e;
  }
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
  /**
   * O emoji sobreposto, em pixels de largura.
   *
   * 180 num quadro de 1080 e 17% da largura, que e grande o bastante para ser
   * lido de relance num telefone e pequeno o bastante para nao virar o assunto.
   * A imagem original tem 128 px, entao ha uma ampliacao de 1,4x; e desenho
   * vetorial rasterizado, sem textura, e ampliar nao mostra defeito.
   */
  EMOJI: 180,
  /** Deslocamento a direita do centro, para o emoji ficar ao lado do texto. */
  EMOJI_X: 300,
  /** Distancia do rodape ate a base do emoji. */
  EMOJI_Y: 1180,
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
function montarFiltroRecortado(enq, matte, duracao, fundo, ritmo, ajusteDeBrilho, dimensoes) {
  // O zoom do fundo vem do ESTILO: o acelerado avança 8% e o sério 2%, que é a
  // diferença entre um corte que empurra e um corte que deixa o argumento
  // mandar. Sem estilo cai em 4%, que era o valor fixo de antes.
  const zoom = Math.max(0.01, Math.min(0.2, ritmo?.forcaDoZoom ?? 0.04));

  // Onde pousar a imagem da pessoa para que ELA fique no meio da tela.
  //
  // A imagem tem `PESSOA_SOZINHA` de largura e a pessoa está em `centro` dela,
  // então o deslocamento que põe a pessoa no meio de 1080 é
  // `540 - largura * centro`. Sem `centro`, 0,5 devolve exatamente o
  // comportamento antigo, que é o que uma máscara velha em fila deve receber.
  //
  // O limite existe para o caso extremo: pessoa muito na beirada da própria
  // janela empurraria a imagem tanto que sobraria fundo vazio de um lado. Meia
  // largura de tela de folga cobre o caso real sem permitir o absurdo.
  const centroDaPessoa = Math.max(0.15, Math.min(0.85, matte?.centro ?? 0.5));
  const xDaPessoa = Math.round(
    Math.max(
      -LAYOUT.PESSOA_SOZINHA + 810,
      Math.min(270, 540 - LAYOUT.PESSOA_SOZINHA * centroDaPessoa)
    )
  );
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
    // A CORRECAO DE BRILHO DO FUNDO, por GAMA e nao por soma.
    //
    // Somar brilho estourava a imagem: medido em 24/08, um empurrao de 23
    // pontos levou a area sem textura nenhuma de 0,4% para 16% do quadro, e foi
    // isso que o Bruno chamou de "imagem pessima". A curva de gama leva 0 em 0
    // e 255 em 255, entao clareia o meio-tom sem nunca estourar.
    //
    // Quem decide se vale mexer e quanto e o `index.mjs`, que mede o arquivo.
    // Nulo quer dizer que a diferenca era pequena demais para justificar tocar
    // na imagem.
    const brilho = ajusteDeBrilho ? `,eq=gamma=${ajusteDeBrilho.toFixed(3)}` : "";

    return [
      // `out_range=tv` fixa a faixa de cor do fundo.
      //
      // JPEG pode vir em faixa CHEIA (0 a 255) e video de rede social e faixa
      // de TV (16 a 235). Sem converter, o corte sai marcado como faixa cheia,
      // e aparelho que assume a faixa de TV mostra a imagem com o contraste
      // errado, lavada ou fechada demais. Pego pela prova de fumaca em 24/08,
      // com um fundo de faixa cheia: o arquivo saiu `yuvj420p` em vez de
      // `yuv420p`, valido e diferente do que o resto do fluxo produz.
      `movie=${basename(fundo)},scale=1080:1920:out_range=tv,setsar=1${brilho},` +
        `loop=loop=-1:size=1:start=0,` +
        // Zoom lento: fundo parado atrás de pessoa em movimento parece
        // fotografia, e custa zero perto de gerar vídeo. A força vem do estilo.
        `zoompan=z='min(${(1 + zoom).toFixed(3)},1+${zoom.toFixed(3)}*on/${Math.max(1, Math.round(duracao * 30))})':` +
        `d=1:s=1080x1920:fps=30,trim=duration=${duracao.toFixed(3)},` +
        `setpts=PTS-STARTPTS[fundo]`,
      `[0:v]crop=${w}:${h}:${x}:${y},scale=${LAYOUT.PESSOA_SOZINHA}:-2[pessoaRgb]`,
      `[1:v]format=gray,scale=${LAYOUT.PESSOA_SOZINHA}:-2[pessoaAlpha]`,
      "[pessoaRgb][pessoaAlpha]alphamerge[pessoa]",
      // Encostada na base, e não centralizada na vertical: rosto no terço
      // superior é onde o olho procura, e sobra espaço embaixo para a legenda.
      //
      // Na HORIZONTAL o alinhamento é pela PESSOA e não pela caixa. Medido na
      // gravação real: ela fica em 33% da janela da webcam, e centralizar a
      // caixa deixava a cabeça cerca de 100 px à esquerda do centro da tela,
      // que é 10% da largura. Com o fundo escuro isso passava despercebido; com
      // o fundo claro ficou evidente.
      `[fundo][pessoa]overlay=${xDaPessoa}:H-h-${LAYOUT.PESSOA_BASE}:format=auto,format=yuv420p[v]`,
    ].join(";");
  }

  const caixaDaTela = semAPessoa(comFolga(enq.tela), enq.pessoa);
  const tela = cropDeCaixa(caixaDaTela);

  // O EMPILHADO SEM O BURACO NO MEIO.
  //
  // Ate 10/09 o cartao era preso no topo com largura fixa de 1000 e a pessoa
  // presa no rodape com largura fixa de 900. Slide largo vira cartao baixo, e
  // o que sobrava entre os dois era um vazio de uns 560 px, quase um terco do
  // quadro. Ninguem tinha visto porque o empilhado estava inalcancavel desde
  // 24/08 (a mascara so era gerada com fundo gerado, que esta desligado), e a
  // imagem que ilustrava isso na landing era montagem feita a mao.
  //
  // Agora as larguras sao TETO e nao medida: a pessoa cresce ate o espaco que
  // sobra depois do cartao, e o cartao e centrado no espaco acima dela. Sem as
  // dimensoes da gravacao nao da para saber a altura de cada bloco antes de
  // compor, entao o caminho antigo fica como queda.
  const larguraFonte = Number(dimensoes?.largura) || 0;
  const alturaFonte = Number(dimensoes?.altura) || 0;
  const podeMedir = larguraFonte > 0 && alturaFonte > 0 && caixaDaTela.h > 0 && h > 0;

  // O respiro entre o cartao e a pessoa. Encostar um no outro faria o slide
  // parecer parte da pessoa.
  const RESPIRO = 60;

  let cartaoLargura = LAYOUT.CARTAO_LARGURA;
  let pessoaLargura = LAYOUT.PESSOA_LARGURA;
  let cartaoY = LAYOUT.CARTAO_TOPO;

  if (podeMedir) {
    const par = (n) => Math.max(2, Math.floor(n / 2) * 2);
    const cartaoAltura = Math.round(
      cartaoLargura * ((caixaDaTela.h * alturaFonte) / (caixaDaTela.w * larguraFonte))
    );
    const aspectoDaPessoa = w / h;
    const sobra = 1920 - LAYOUT.PESSOA_BASE - LAYOUT.CARTAO_TOPO - cartaoAltura - RESPIRO;
    // O teto e o mesmo do corte de rosto (PESSOA_SOZINHA, 1400 num quadro de
    // 1080), e nao a largura do quadro. O motivo ja estava escrito ali desde
    // 24/08: a silhueta recortada ocupa cerca de 60% da caixa da webcam, entao
    // o que passa de 1080 e margem TRANSPARENTE, que nao aparece. Com o teto em
    // 1080 a pessoa parava em 850 px de altura, sobrava um vazio de 355 px
    // entre ela e o cartao, e a legenda (que mora no terco inferior) caia no
    // rosto dela em vez de cair abaixo dele.
    pessoaLargura = par(Math.min(LAYOUT.PESSOA_SOZINHA, Math.max(LAYOUT.PESSOA_LARGURA, sobra * aspectoDaPessoa)));
    const pessoaAltura = Math.round(pessoaLargura / aspectoDaPessoa);
    const pessoaTopo = 1920 - LAYOUT.PESSOA_BASE - pessoaAltura;
    // O cartao fica centrado no espaco acima da pessoa, e nunca colado no topo:
    // o que sobra vira margem em cima e embaixo dele, em vez de um buraco so.
    cartaoY = Math.max(60, Math.round((pessoaTopo - RESPIRO - cartaoAltura) / 2));
  }

  return [
    // Fundo: gradiente escuro, de cima para baixo. Escuro porque o slide é
    // claro, e cartão claro sobre fundo claro some.
    // `d` é obrigatório aqui: sem duração o gradiente é uma fonte sem fim, e
    // um erro de ordem de argumento vira um ffmpeg que nunca termina.
    `gradients=s=1080x1920:c0=0x101728:c1=0x1d2942:x0=0:y0=0:x1=1080:y1=1920:n=2:d=${duracao.toFixed(3)}[fundo]`,

    // O slide vira cartão: largura com margem dos dois lados, e uma borda
    // clara de 4 px que separa o cartão do fundo sem precisar de sombra.
    `[0:v]${tela},scale=${cartaoLargura}:-2[cartao]`,
    `[cartao]pad=iw+8:ih+8:4:4:color=0x2f3d5c[cartaoBorda]`,
    `[fundo][cartaoBorda]overlay=(W-w)/2:${cartaoY}[comCartao]`,

    // A pessoa: recorta a janela da webcam, junta com a máscara, e o alpha faz
    // o fundo do quarto sumir. As duas escalas precisam ser IGUAIS, senao o
    // alpha nao casa com a imagem e a silhueta sai deslocada.
    `[0:v]crop=${w}:${h}:${x}:${y},scale=${pessoaLargura}:-2[pessoaRgb]`,
    `[1:v]format=gray,scale=${pessoaLargura}:-2[pessoaAlpha]`,
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
/** A mesma caixa com a base aparada, em fração da altura DELA. */
function aparadaNaBase(c, fracao) {
  return { ...c, h: Math.max(0.05, c.h * (1 - fracao)) };
}

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
function montarFiltroVertical(enq, pushIn, duracaoDoPush) {
  const FUNDO =
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase," +
    "crop=1080:1920,gblur=sigma=28[fundo]";

  // Pessoa falando: recorta o meio em 9:16 e ela preenche a tela. Sem fundo
  // desfocado, porque não sobra borda nenhuma.
  if (enq?.vertical === "corte-central" || !enq) {
    // A base da caixa é aparada em 12% porque é ali que mora a interface do
    // aplicativo de quem grava com tela: no vídeo real do Bruno, a caixa da
    // pessoa incluía a barra VOLTAR/RECOMEÇAR logo abaixo da webcam, e ela
    // apareceu no corte de 24/08. Em gravação de pessoa em tela cheia o custo
    // é perder uma tira do peito, que o enquadramento de rosto nem mostraria.
    const foco = enq?.pessoa
      ? cropDeCaixa(aparadaNaBase(enq.pessoa, 0.12)) + ","
      : "";
    // O PUSH-IN do estilo: um avanço contínuo e lento ao longo do corte
    // inteiro, com a força vinda de `ritmo.forcaDoZoom` (2% no sério, 8% no
    // acelerado). É o movimento que faz plano parado parecer filmado, e entra
    // ANTES da legenda, para o texto ficar cravado enquanto a imagem avança.
    // O `fps=30` fixa a cadência que o zoompan precisa para a conta do quadro.
    const push = pushIn ?? 0;
    const zoom = push > 0.005
      ? `,fps=30,zoompan=z='min(${(1 + push).toFixed(3)},1+${push.toFixed(3)}*on/${Math.max(1, Math.round((duracaoDoPush ?? 30) * 30))})':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30`
      : "";
    // A altura do recorte também é limitada (`min(ih,iw*16/9)`): celular
    // grava 9:19,5 ou 9:20 (1080x2340, 1080x2400), mais alto que 9:16, e com
    // a altura inteira o `scale` achataria a pessoa. Nesse caso sobra altura,
    // e o corte guarda mais do topo (35% da sobra em cima) para não cortar a
    // cabeça. Em gravação deitada a sobra é zero e nada muda.
    return (
      `[0:v]${foco}crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':'(iw-min(iw,ih*9/16))/2':'(ih-min(ih,iw*16/9))*0.35',` +
      `scale=1080:1920${zoom},format=yuv420p[v]`
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
export async function cortarHorizontal(entrada, saida, inicio, duracao, legenda, musica, som, tratamento = null) {
  // A legenda do horizontal é OUTRO arquivo, e não o mesmo do vertical.
  //
  // O ASS carrega a resolução para a qual foi escrito, e o libass escala o
  // desenho dessa referência para o quadro real. Reusar o arquivo de 1080x1920
  // num quadro de 1920x1080 esticaria a letra e jogaria a linha para fora,
  // porque a margem de 800 px que faz sentido em cima da cabeça no vertical é
  // metade da altura aqui.
  // Com trilha, video E audio moram no mesmo -filter_complex: misturar -vf com
  // grafo complexo no mesmo comando foi exatamente o erro que derrubou o
  // completo em 24/08. A entrada aqui e intermediario recodificado, entao
  // filtros de video sao seguros.
  const trat = tratamento ? cadeiaDoTratamento(tratamento, 1920, 1080, duracao, tratamento.momentos) : "";
  const audio = cadeiaDeAudio(musica, 1, duracao, som);
  // Gravação em pé vira 16:9 com a pessoa inteira no meio e a PRÓPRIA imagem
  // ampliada e desfocada nas laterais, e não com tarja preta (30/09). Ver
  // `quadroDeitado`.
  const emPe = ehVertical(await ffprobe(entrada).catch(() => null));
  // O horizontal ganhou o tratamento em 30/09 SEM a segunda tentativa que o
  // vertical tem: se o tratamento falhasse aqui, o trecho inteiro caía depois
  // de o vertical já estar pronto. Agora cai só o tratamento, com teto
  // proporcional ao corte (mesma conta do vertical).
  if (trat) {
    try {
      return await codificarHorizontal(entrada, saida, inicio, duracao, legenda, musica, audio, trat, {
        timeoutMs: Math.max(4 * 60_000, Math.round(duracao * 8000)),
      }, emPe);
    } catch (e) {
      console.error(`horizontal falhou COM tratamento, tentando sem: ${String(e?.message ?? e).slice(0, 300)}`);
    }
  }
  return codificarHorizontal(entrada, saida, inicio, duracao, legenda, musica, audio, "", {}, emPe);
}

/**
 * O quadro 16:9 de uma gravação EM PÉ: a pessoa inteira, na altura toda, no
 * centro, e nas laterais a mesma imagem ampliada, desfocada e um pouco mais
 * escura. É o que editor faz com vídeo de celular em timeline deitada; a tarja
 * preta de `pad` parece erro de exportação (30/09).
 *
 * O desfoque roda num quadro pequeno (384x216) e só depois sobe para 1920x1080:
 * borrar 1080p inteiro a cada quadro custa caro e o resultado é o mesmo borrão.
 * Um grafo com rótulos internos e UMA entrada e UMA saída, então serve tanto
 * em `-vf` quanto depois de `[0:v]` num `-filter_complex`.
 */
function quadroDeitado() {
  return (
    "split=2[hfundo][hfrente];" +
    "[hfundo]scale=384:216:force_original_aspect_ratio=increase,crop=384:216,boxblur=12:2," +
    "scale=1920:1080,eq=brightness=-0.06,setsar=1[hborrado];" +
    "[hfrente]scale=-2:1080,setsar=1[hpessoa];" +
    "[hborrado][hpessoa]overlay=(W-w)/2:0,format=yuv420p"
  );
}

async function codificarHorizontal(entrada, saida, inicio, duracao, legenda, musica, audio, trat, limites, emPe = false) {
  const filtroDeVideo =
    (emPe
      ? quadroDeitado()
      : "scale=1920:1080:force_original_aspect_ratio=decrease," +
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p") +
    (trat ? `,${trat},format=yuv420p` : "") +
    (legenda ? `,subtitles=${legenda}` : "");

  await rodar([
    "-ss", String(inicio),
    "-i", entrada,
    ...(musica ? ["-stream_loop", "-1", "-i", musica] : []),
    "-t", String(duracao),
    ...(audio
      ? ["-filter_complex", `[0:v]${filtroDeVideo}[v];${audio}`, "-map", "[v]", "-map", "[aout]"]
      : ["-vf", filtroDeVideo, "-af", NIVELAR_VOZ]),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    // Teto de pico e quadro-chave a cada 2 s: é o arquivo que o player do
    // card toca e que a rede recebe. Ver PLAYER_WEB.
    ...PLAYER_WEB,
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    saida,
  ], {
    // Mesmo cuidado do vertical: o filtro `subtitles` resolve caminho relativo
    // ao diretório de trabalho, e caminho absoluto do Windows com dois-pontos
    // quebra o parser de filtro.
    cwd: dirname(saida),
    ...limites,
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

/**
 * O TRATAMENTO DA LINGUAGEM (30/09/2026): câmera, look e efeitos pontuais.
 *
 * No teste de 29/09 o cliente escolheu Vox com aproximação, afastamento e luz
 * vazada, e o corte saiu cru: o worker só recebia o perfil de legenda. O app
 * agora manda `tratamento` (lib/media/linguagem-da-edicao.ts) e esta função o
 * traduz em filtros, aplicados ANTES da legenda, para a cor e o movimento não
 * mexerem no texto.
 *
 * Só entra o que o ffmpeg faz bem e de graça. O que exige gerar imagem nova
 * (timelapse, mundo congelado, drone) é da Higgsfield, que liga à parte.
 *
 * Devolve a cadeia sem colchetes (filtros separados por vírgula), ou "" quando
 * não há nada a fazer. `largura` e `altura` são as do quadro final.
 */
export function cadeiaDoTratamento(tratamento, largura, altura, duracao, momentos = []) {
  if (!tratamento) return "";
  const partes = [];
  const D = Math.max(1, duracao).toFixed(3);
  const F = Math.max(0, Math.min(0.2, tratamento.camera?.forca ?? 0.05));
  const par = (expr) => `trunc((${expr})/2)*2`;
  // Os momentos fortes, no máximo seis, para o grafo não crescer sem limite.
  const ms = (momentos ?? []).filter((m) => m > 0.3 && m < duracao - 0.3).slice(0, 6);

  // ── CÂMERA ── dolly digital com `zoompan`, que entrega SEMPRE o mesmo
  // tamanho de quadro.
  //
  // Até 30/09 era `scale=...:eval=frame` seguido de `crop`: o quadro mudava de
  // tamanho a cada imagem, e o ffmpeg 5.1 do contêiner reconfigura o grafo a
  // cada mudança. Medido no teste de 29/09 (vídeo de 22 min, três cortes): um
  // corte morreu na hora com "Error while opening encoder ... width or
  // height", e outros três TRAVARAM até o teto de 1800 s do `rodar`, o que
  // sozinho respondeu por uns 30 dos 36 minutos até os cortes chegarem. No
  // ffmpeg 9 local a mesma cadeia levava 9x o tempo de um corte sem
  // tratamento; com `zoompan` o custo da câmera cai para cerca de 1,2x.
  //
  // O tempo aqui é `on/30` (quadro de saída a 30 fps, garantido pelo `fps=30`
  // logo antes), porque `t` não existe dentro do `zoompan`.
  const T = "(on/30)";
  const zoom = {
    aproximacao: `1+${F}*${T}/${D}`,
    afastamento: `1+${F}*(1-${T}/${D})`,
    alternado: `1+${F}*(0.5+0.5*sin(2*PI*${T}/6))`,
    impacto: ms.length
      ? `1+0.02*${T}/${D}+${F}*(${ms.map((m) => `between(${T},${m.toFixed(2)},${(m + 0.7).toFixed(2)})`).join("+")})`
      : `1+${F}*${T}/${D}`,
  }[tratamento.camera?.modo];
  if (tratamento.camera?.modo === "na-mao") {
    // Tremor leve de quem segura a câmera: o quadro cresce 5% UMA vez (escala
    // fixa, barata) e o recorte passeia com duas senoides fora de fase.
    partes.push(`scale=${par(`${largura}*1.05`)}:${par(`${altura}*1.05`)}`);
    partes.push(`crop=${largura}:${altura}:'(iw-${largura})/2+9*sin(t*2.3)+5*sin(t*5.9)':'(ih-${altura})/2+7*sin(t*1.7)+4*sin(t*6.7)'`);
  } else if (zoom) {
    partes.push(
      `fps=30,zoompan=z='${zoom}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${largura}x${altura}:fps=30`
    );
  }

  // ── LOOK ── a cor da linguagem. Tabela curta e medida a olho nos quadros do
  // teste; o destaque em preto e branco segura a cor da MARCA.
  const acento = (tratamento.marca?.acento ?? "#F97316").replace("#", "0x");
  const looks = {
    natural: "",
    "cinema-quente": "eq=contrast=1.08:saturation=1.08,colorbalance=rs=.05:gs=.01:bs=-.06:rh=.03:bh=-.04",
    "frio-escuro": "eq=contrast=1.12:brightness=-0.03:saturation=0.88,colorbalance=rs=-.05:bs=.07",
    pastel: "eq=contrast=0.9:saturation=0.78:brightness=0.04",
    "pb-destaque": `colorhold=color=${acento}:similarity=0.22:blend=0.12`,
    "filme-16mm": "eq=contrast=1.05:saturation=0.9,noise=alls=12:allf=t,vignette=PI/5",
    vhs: "rgbashift=rh=-3:bh=3,eq=saturation=0.82,noise=alls=9:allf=t",
    ilustrado: "eq=saturation=1.15:contrast=1.1,unsharp=5:5:1.2",
    papel: "eq=contrast=1.04:saturation=0.9,noise=alls=7:allf=t,vignette=PI/6",
    pintura: "eq=saturation=1.2,gblur=sigma=0.6",
    "alto-contraste": "eq=contrast=1.18:saturation=1.25",
  };
  const look = looks[tratamento.look ?? "natural"];
  if (look) partes.push(look);
  if (tratamento.efeitos?.grao && tratamento.look !== "papel" && tratamento.look !== "filme-16mm") {
    partes.push("noise=alls=6:allf=t");
  }

  // ── EFEITOS PONTUAIS nos momentos fortes ──
  for (const [i, m] of ms.entries()) {
    const a = m.toFixed(2);
    if (tratamento.efeitos?.flash && i % 2 === 0) {
      // Clarão curto: dois quadros claros e um de volta, lido como "revelação".
      partes.push(`eq=brightness=0.38:enable='between(t,${a},${(m + 0.07).toFixed(2)})'`);
    }
    if (tratamento.efeitos?.glitch && i % 2 === 1) {
      partes.push(`rgbashift=rh=14:bh=-14:gv=6:enable='between(t,${a},${(m + 0.16).toFixed(2)})'`);
    }
    if (tratamento.efeitos?.luzVazada && i % 3 === 0) {
      // Luz vazada de filme: um brilho vindo do canto de cima, que sobe e desce
      // em 0,9 s (seno do tempo dentro da janela).
      //
      // Até 30/09 era um `geq` por pixel em RGB, e ele custava duas vezes: a
      // expressão com `exp` avaliada em 2 milhões de pixels por quadro, e a
      // conversão do fluxo INTEIRO para RGB, porque o formato é negociado para
      // o grafo todo e não só para a janela do efeito. Medido em 10 s de
      // 1080x1920: +9 s só o `geq`. Agora é um clarão quente do quadro inteiro
      // (`eq` em YUV, brilho e saturação na mesma rampa), que custa quase nada.
      // Perde o foco no canto; a vinheta fora do centro foi testada para
      // recuperá-lo e deixava meio quadro preto, então ficou de fora.
      const env = `sin(PI*(t-${a})/0.9)`;
      const janela = `enable='between(t,${a},${(m + 0.9).toFixed(2)})'`;
      partes.push(`eq=brightness='0.09*${env}':saturation='1+0.25*${env}':gamma='1+0.12*${env}':eval=frame:${janela}`);
    }
  }
  return partes.join(",");
}

/**
 * O fps de um arquivo, lido do fluxo de vídeo (ex.: "30/1" vira 30).
 *
 * Existe porque o `xfade` e o `overlay` exigem os dois lados no MESMO ritmo, e
 * o clipe gerado pela Higgsfield (Kling) sai a 24 quadros enquanto o corte sai
 * a 30. Sem igualar, o `xfade` recusa ou a emenda sai com o tempo torto.
 */
export function fpsDe(caminho) {
  try {
    const r = spawnSync("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", caminho,
    ], { encoding: "utf8" });
    const [a, b] = String(r.stdout ?? "").trim().split("/").map(Number);
    const fps = b ? a / b : a;
    return fps > 0 && fps < 121 ? Math.round(fps * 1000) / 1000 : 30;
  } catch {
    return 30;
  }
}

/**
 * Deixa o clipe gerado exatamente no formato do corte: mesmo tamanho (cobrindo
 * o quadro e cortando a sobra, nunca com tarja), mesmo fps, mesmo formato de
 * pixel. Serve à abertura e à cena de apoio.
 */
function clipeNoFormato(largura, altura, fps, duracao) {
  return [
    `scale=${largura}:${altura}:force_original_aspect_ratio=increase`,
    `crop=${largura}:${altura}`,
    `fps=${fps}`,
    "format=yuv420p",
    "setsar=1",
    `trim=duration=${duracao.toFixed(3)}`,
    "setpts=PTS-STARTPTS",
  ].join(",");
}

/**
 * A ABERTURA DA HIGGSFIELD emendada no começo do corte (item 9, 29/09).
 *
 * O clipe gerado (3 s, sem som) entra ANTES do corte, com um crossfade de
 * 0,3 s para o primeiro quadro do corte. O som do corte começa junto do
 * crossfade, com fade de entrada do mesmo tamanho: a voz não pode começar
 * cortada no meio de uma sílaba, e o vídeo gerado não tem som próprio.
 *
 * Só filtros que existem no ffmpeg 5.1 do contêiner (`xfade` é do 4.3,
 * `adelay` e `afade` são antigos). Recodifica porque o crossfade exige; CRF 20
 * e não o 23 do corte, para a segunda geração não piorar o que o cliente vê.
 *
 * A duração final é a do corte mais a da abertura menos o crossfade. Emojis e
 * remoções do corte não mudam: a emenda entra depois deles.
 */
export async function emendarAberturaNoCorte(abertura, corte, saida, { crossfade = 0.3 } = {}) {
  const c = await ffprobe(corte);
  const a = await ffprobe(abertura);
  if (!c.largura || !c.altura) throw new Error("corte sem vídeo legível");
  const fps = fpsDe(corte);
  // A abertura nunca passa de 5 s aqui: é gancho, não trecho.
  const durA = Math.min(5, Math.max(crossfade + 0.5, a.duracaoSec || 3));
  const offset = durA - crossfade;
  const atraso = Math.round(offset * 1000);

  const partes = [
    `[0:v]${clipeNoFormato(c.largura, c.altura, fps, durA)}[ab]`,
    `[1:v]fps=${fps},format=yuv420p,setsar=1,setpts=PTS-STARTPTS[co]`,
    `[ab][co]xfade=transition=fade:duration=${crossfade}:offset=${offset.toFixed(3)}[v]`,
  ];
  if (c.temAudio) {
    partes.push(
      `[1:a]aresample=48000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${crossfade},adelay=${atraso}|${atraso}[a]`
    );
  }
  await rodar([
    "-i", abertura,
    "-i", corte,
    "-filter_complex", partes.join(";"),
    "-map", "[v]",
    ...(c.temAudio ? ["-map", "[a]"] : []),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", ...PLAYER_WEB,
    ...(c.temAudio ? ["-c:a", "aac", "-b:a", "160k", "-ar", "48000"] : []),
    "-movflags", "+faststart",
    saida,
  ], { timeoutMs: 10 * 60 * 1000 });
  return { duracaoSec: c.duracaoSec + durA - crossfade };
}

/**
 * A CENA DE APOIO da Higgsfield no meio do corte.
 *
 * Diferente da abertura, ela NÃO empurra o tempo: entra por cima da imagem do
 * corte por 3 s, com a voz seguindo intacta por baixo (o áudio é copiado, sem
 * recodificar). É o que um editor faz com imagem de cobertura. Fade de 0,3 s
 * na entrada e na saída, pelo canal alfa, para não virar corte seco.
 *
 * Custo conhecido: a legenda queimada no corte fica escondida durante a cena.
 * Por isso ela entra no meio do corte, longe do gancho do começo e do fecho.
 */
export async function inserirCenaDeApoio(apoio, corte, saida, { instante = null, crossfade = 0.3 } = {}) {
  const c = await ffprobe(corte);
  const a = await ffprobe(apoio);
  if (!c.largura || !c.altura) throw new Error("corte sem vídeo legível");
  const fps = fpsDe(corte);
  const d = Math.min(5, Math.max(2 * crossfade + 0.5, a.duracaoSec || 3));
  // Sem espaço para a cena inteira longe das pontas, não insere.
  if (c.duracaoSec < d + 6) return null;
  const meio = instante ?? (c.duracaoSec - d) / 2;
  const t0 = Math.min(Math.max(3, meio), c.duracaoSec - d - 3);

  const filtro = [
    `[1:v]${clipeNoFormato(c.largura, c.altura, fps, d)},format=yuva420p,` +
      `fade=t=in:st=0:d=${crossfade}:alpha=1,fade=t=out:st=${(d - crossfade).toFixed(3)}:d=${crossfade}:alpha=1,` +
      `setpts=PTS+${t0.toFixed(3)}/TB[ap]`,
    `[0:v][ap]overlay=eof_action=pass:enable='between(t,${t0.toFixed(3)},${(t0 + d).toFixed(3)})',format=yuv420p[v]`,
  ].join(";");
  await rodar([
    "-i", corte,
    "-i", apoio,
    "-filter_complex", filtro,
    "-map", "[v]",
    ...(c.temAudio ? ["-map", "0:a", "-c:a", "copy"] : []),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", ...PLAYER_WEB,
    "-movflags", "+faststart",
    saida,
  ], { timeoutMs: 10 * 60 * 1000 });
  return { instante: t0, duracaoSec: d };
}

/**
 * O quadro que vai para a Higgsfield, já na proporção do corte.
 *
 * O Kling devolve o vídeo na proporção da imagem que recebe. A capa do corte
 * sai em 16:9 (1280x720); mandada assim, a abertura voltaria deitada e teria
 * de ser cortada DEPOIS, jogando fora 2/3 dos pixels gerados. Recortar ANTES,
 * em volta da pessoa, faz o modelo gerar direto em pé.
 *
 * `centroX` (0 a 1) é o centro da pessoa no quadro, quando o enquadramento do
 * corte sabe; sem ele, o meio.
 */
export async function quadroNaProporcao(entrada, saida, { proporcao = "9:16", centroX = 0.5 } = {}) {
  const [pw, ph] = proporcao.split(":").map(Number);
  const cx = Math.min(1, Math.max(0, Number(centroX) || 0.5));
  const alvoL = pw >= ph ? 1280 : 720;
  const alvoA = pw >= ph ? 720 : 1280;
  const crop =
    `crop='min(iw,ih*${pw}/${ph})':'min(ih,iw*${ph}/${pw})':` +
    `'max(0,min(iw-min(iw,ih*${pw}/${ph}),iw*${cx.toFixed(4)}-min(iw,ih*${pw}/${ph})/2))':'(ih-min(ih,iw*${ph}/${pw}))/2'`;
  await rodar([
    "-i", entrada,
    "-vf", `${crop},scale=${alvoL}:${alvoA}:flags=lanczos,setsar=1`,
    "-frames:v", "1", "-q:v", "2",
    saida,
  ]);
}
