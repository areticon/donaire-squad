import { spawn } from "node:child_process";
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
  const filtrosVideo = [];
  let cwdDoFiltro;

  if (editaTempo) {
    // O que FICA é o complemento do que sai. `select` recebe a lista de
    // intervalos que sobrevivem, e `setpts` remonta a linha do tempo sem os
    // buracos, senão o player exibiria o vídeo congelado no lugar do corte.
    //
    // Um passe só, e não cortar em N arquivos e concatenar: concatenação exige
    // que cada pedaço comece em quadro-chave, e forçar isso ou recodifica tudo
    // duas vezes ou desalinha o áudio.
    const manter = intervalosQueFicam(remocoes, opcoes.duracaoSec);
    const expr = manter
      .map((m) => `between(t,${m.de.toFixed(3)},${m.ate.toFixed(3)})`)
      .join("+");
    filtrosVideo.push(`select='${expr}'`, "setpts=N/FRAME_RATE/TB");
    args.push("-af", `aselect='${expr}',asetpts=N/SR/TB`);
  }

  if (editaImagem) {
    // Só o NOME do arquivo, com o ffmpeg rodando dentro da pasta dele.
    //
    // Caminho completo aqui é armadilha: o filtro usa dois-pontos para separar
    // as próprias opções, então `C:/pasta/a.ass` faz o ffmpeg entender que
    // `/pasta/a.ass` é o valor da opção seguinte, e o erro que ele devolve fala
    // de "original_size", sem mencionar legenda nenhuma. Escapar funciona mas
    // muda entre plataformas. Sem letra de unidade, o problema não existe.
    filtrosVideo.push("subtitles=" + basename(opcoes.legendasArquivo));
    cwdDoFiltro = dirname(opcoes.legendasArquivo);
  }

  args.push("-vf", filtrosVideo.join(","));
  args.push(
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p"
  );

  // Áudio: copiado sempre que o tempo não é mexido. Quando há remoção, o áudio
  // precisa ser recortado junto e aí não tem como copiar; nesse caso vai em
  // 192k, acima do original, que é o mínimo dano possível.
  args.push(...(editaTempo ? ["-c:a", "aac", "-b:a", "192k"] : ["-c:a", "copy"]));

  args.push("-movflags", "+faststart", saida);
  await rodar(args, { cwd: cwdDoFiltro });

  const partes = [];
  if (editaTempo) partes.push(`${remocoes.length} trechos removidos`);
  if (editaImagem) partes.push("legendas de destaque");
  return { recodificado: true, motivo: partes.join(" e ") };
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
export async function cortarVertical(entrada, saida, inicio, duracao, enquadramento) {
  const filtro = montarFiltroVertical(enquadramento);

  await rodar([
    "-ss", String(inicio),
    "-i", entrada,
    "-t", String(duracao),
    "-filter_complex", filtro,
    "-map", "[v]", "-map", "0:a?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    saida,
  ]);
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
 * Tira a janela da webcam de dentro do recorte da tela.
 *
 * No empilhado, a pessoa aparece grande embaixo. Se o recorte de cima também
 * pegar a janelinha da webcam, ela aparece DUAS VEZES no mesmo quadro, uma
 * minúscula em cima e uma grande embaixo, e o resultado parece defeito de
 * edição (visto no teste de 23/08).
 *
 * A webcam quase sempre fica num canto inferior, então encurtar a tela até onde
 * a pessoa começa resolve sem perder conteúdo: slide bem feito não põe texto
 * embaixo da janela do apresentador.
 *
 * Só encurta quando sobra tela de verdade. Se a pessoa ocupa a metade de cima do
 * quadro, encurtar deixaria uma faixa fina e inútil, e aí é melhor conviver com
 * a duplicata.
 */
function semAPessoa(tela, pessoa) {
  if (!pessoa) return tela;
  const fimDaTela = tela.y + tela.h;
  // A pessoa não invade a tela: nada a fazer.
  if (pessoa.y >= fimDaTela) return tela;
  const alturaNova = pessoa.y - tela.y;
  if (alturaNova < 0.25) return tela;
  return { ...tela, h: alturaNova };
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
export async function cortarHorizontal(entrada, saida, inicio, duracao) {
  await rodar([
    "-ss", String(inicio),
    "-i", entrada,
    "-t", String(duracao),
    "-vf",
      "scale=1920:1080:force_original_aspect_ratio=decrease," +
      "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    saida,
  ]);
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
