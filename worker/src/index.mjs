import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdtemp, mkdir, rm, stat, statfs, readFile, writeFile, copyFile } from "node:fs/promises";
import { createWriteStream, createReadStream, constants as fsConstants } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { tmpdir, availableParallelism } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { get, put } from "@vercel/blob";
import {
  ffprobe,
  memoriaDoConteiner,
  prepararCompleto,
  prepararTrecho,
  cortarVertical,
  cortarHorizontal,
  extrairCapa,
  extrairQuadros,
  extrairCandidatosDeCapa,
  extrairCapaFinal,
  extrairQuadroInteiro,
  ehVertical,
  gradeDeLuz,
  brilhoMedio,
  montarAbertura,
  emendar,
  medirFidelidade,
  diagnostico,
  rodar,
  emendarAberturaNoCorte,
  inserirCenaDeApoio,
  quadroNaProporcao,
  comPrazoDoTrabalho,
} from "./ffmpeg.mjs";
import { gerarMatte, acharCaixaDaPessoa, quadroDaCapa, instantesEspalhados } from "./segmentacao.mjs";
import { guardarFala } from "./guarda-da-fala.mjs";
import { imprimirHtml } from "./contrato-pdf.mjs";
import { esperarMemoria, memoriaLivreMb } from "./memoria.mjs";
import { CAPACIDADE, comFatia, resumoDaCapacidade } from "./capacidade.mjs";

/**
 * A paleta de emoji, que mora ao lado do codigo e nao na pasta temporaria.
 *
 * Sao imagens e nao texto porque o libass deste ffmpeg desenha emoji so em
 * contorno, sem cor, medido em 24/08 com duas fontes diferentes.
 */
const PASTA_DE_EMOJI = join(dirname(fileURLToPath(import.meta.url)), "..", "emoji");

/**
 * Worker de vídeo da Demandou.
 *
 * Existe porque ffmpeg com arquivo de centenas de megabytes não roda em função
 * serverless: a Vercel tem teto de tempo e de memória, e a gravação de teste
 * tem 850 MB. Aqui não há teto de tempo, o disco é real e o ffmpeg é nativo.
 *
 * O contrato é deliberadamente burro: recebe um trabalho, responde 202 na hora,
 * e avisa por callback quando termina. Nada de o app ficar esperando, que é
 * exatamente a armadilha que derrubou a seleção de trechos duas vezes.
 */

const PORTA = Number(process.env.PORT) || 8080;
const SEGREDO = process.env.WORKER_SECRET;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!SEGREDO) throw new Error("WORKER_SECRET não configurado");
if (!BLOB_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN não configurado");
/** O store público da mídia produzida. Ausente, tudo cai no privado. */
const DESTINO_PUBLICO = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN || null;

/**
 * Assinatura HMAC sobre o corpo cru.
 *
 * Comparação em tempo constante, e não `===`: comparação comum vaza, pelo tempo
 * que leva, quantos bytes iniciais bateram, e isso permite descobrir a
 * assinatura byte a byte. É barato fazer certo.
 */
function assinaturaValida(corpoCru, recebida) {
  if (!recebida) return false;
  const esperada = createHmac("sha256", SEGREDO).update(corpoCru).digest("hex");
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(recebida, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function assinar(texto) {
  return createHmac("sha256", SEGREDO).update(texto).digest("hex");
}

/**
 * Baixa do store privado (pelo SDK, com token) ou de uma URL pública (o store
 * público e a URL temporária da Higgsfield), sempre em fluxo para o disco.
 */
async function baixarQualquer(url, destino) {
  if (url.includes(".private.blob.")) return baixarFonte(url, destino);
  const r = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
  if (!r.ok || !r.body) throw new Error(`download respondeu ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(destino));
}

async function baixarFonte(sourceUrl, destino) {
  // Com prazo (04/10): sem ele, um download do store privado que emperra
  // segura a montagem para sempre, e a gravação em cache (obterOriginal)
  // prende todo corte do mesmo vídeo atrás dela.
  const blob = await get(sourceUrl, { access: "private", token: BLOB_TOKEN, abortSignal: AbortSignal.timeout(30 * 60_000) });
  if (!blob || blob.statusCode !== 200) {
    throw new Error("Não consegui ler o vídeo no storage");
  }
  // Fluxo direto para o disco. Nunca `arrayBuffer()`: o contêiner tem memória
  // bem menor que os arquivos que ele processa.
  await pipeline(Readable.fromWeb(blob.stream), createWriteStream(destino));
  return blob.blob.contentType || "video/mp4";
}

/**
 * Manda um arquivo para o storage, sem poder ficar pendurado para sempre.
 *
 * Três decisões, e as três vieram de um envio real de 171 MB em 23/08.
 *
 * **Fluxo, e não `readFile`.** A versão anterior lia o arquivo inteiro para a
 * memória antes de começar. Num vídeo completo isso é o arquivo todo em RAM ao
 * mesmo tempo, e o contêiner do worker tem bem menos memória do que os arquivos
 * que ele processa. É o mesmo cuidado que a descida já tinha e a subida não.
 *
 * **`multipart` acima de 50 MB.** Divide em partes, manda em paralelo e
 * RETENTA a parte que falhar. Sem isso, um soluço de rede aos 90% joga fora
 * tudo que já subiu e o envio recomeça do zero.
 *
 * **Prazo, que é o que faltava de verdade.** Não havia nenhum, e sem prazo um
 * envio que emperra prende o trabalho para sempre: o worker fica vivo, ocioso,
 * segurando o vídeo, e o cliente vê "cortando" até o prazo do app estourar lá
 * na outra ponta, uma hora e meia depois. Falhar alto em vinte minutos é muito
 * melhor que pendurar em silêncio por noventa.
 *
 * O prazo acompanha o tamanho porque a velocidade de subida varia demais entre
 * o contêiner e uma máquina de casa. Medido em 23/08 na máquina do Bruno: 0,07
 * MB/s, ou seja 171 MB levariam 41 minutos. O piso de 10 minutos mais um minuto
 * a cada 3 MB dá margem para uma conexão ruim sem transformar emperramento em
 * espera eterna.
 */
function prazoDeEnvio(bytes) {
  const mb = bytes / (1024 * 1024);
  return Math.round(Math.min(45 * 60_000, 10 * 60_000 + (mb / 3) * 60_000));
}

async function subir(caminho, chave, contentType, { privado = false } = {}) {
  const { size } = await stat(caminho);

  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), prazoDeEnvio(size));
  try {
    const { url } = await put(chave, createReadStream(caminho), {
      // Tudo que sai daqui e MIDIA PRODUZIDA (corte, completo, capa), ou seja,
      // exatamente o que o navegador do cliente toca. Vai para o store
      // PUBLICO, cuja URL nao e adivinhavel, porque e o CDN dele que entrega
      // Range, cache e buffering nativos. A gravacao ORIGINAL do cliente
      // continua no store privado, e nao passa por aqui.
      //
      // A tentativa anterior (01/09) pediu access public no store ERRADO, que
      // e privado-only, e derrubou os cortes com "Cannot use public access on
      // a private store". Por isso o destino agora vem de uma variavel
      // separada, e a troca so subiu depois de um upload de prova.
      //
      // Sem a variavel, cai no store privado: pior de performance, identico
      // de comportamento, e nunca quebrado.
      //
      // `privado` e a excecao: o audio extraido da gravacao (29/09) e materia
      // prima do cliente, nao midia publicada, e fica no store privado.
      access: DESTINO_PUBLICO && !privado ? "public" : "private",
      token: privado ? BLOB_TOKEN : DESTINO_PUBLICO ?? BLOB_TOKEN,
      contentType,
      addRandomSuffix: true,
      multipart: size > 50 * 1024 * 1024,
      abortSignal: controle.signal,
    });
    return { url, bytes: size };
  } catch (e) {
    // Sem isto, o estouro de prazo chega como "This operation was aborted", que
    // não diz o que foi abortado nem por quê.
    if (controle.signal.aborted) {
      throw new Error(
        `envio de ${chave} passou de ${Math.round(prazoDeEnvio(size) / 60_000)} min ` +
          `para ${(size / 1048576).toFixed(0)} MB e foi cortado`
      );
    }
    throw e;
  } finally {
    clearTimeout(limite);
  }
}

/**
 * Pergunta ao squad como enquadrar cada trecho, mandando alguns quadros.
 *
 * Ideia do Bruno: em vez de perguntar ao cliente que tipo de gravação ele
 * mandou, o time olha e decide. Os quadros existem só para essa decisão e
 * morrem com a pasta temporária.
 *
 * A decisão mora no app, e não aqui, por dois motivos: a conta de custo de IA
 * do projeto vive num lugar só, e prompt de agente é produto, que se edita num
 * lugar só.
 *
 * Falhar aqui NÃO derruba o trabalho. Sem enquadramento o corte sai com o
 * tratamento seguro, que é pior mas existe. Entregar corte mediano é muito
 * melhor que não entregar corte porque o agente de visão teve um dia ruim.
 */
async function pedirEnquadramento(trabalho, fonte, pasta, duracaoSec) {
  if (!trabalho.enquadramentoUrl) {
    return { enquadramentos: new Map(), capa: null, fundoUrl: null, brilhoAlvo: null };
  }

  try {
    const paraOlhar = [];
    for (const t of trabalho.trechos) {
      const duracao = Math.max(1, t.fim - t.inicio);
      const caminhos = await extrairQuadros(
        fonte,
        join(pasta, `q-${t.indice}`),
        t.inicio,
        duracao,
        2
      );
      const quadros = [];
      for (const c of caminhos) {
        quadros.push((await readFile(c)).toString("base64"));
      }
      // A grade de luminancia vai junto: e com ela que o app mede o brilho da
      // parede atras da pessoa, que decide se o fundo gerado sai claro ou
      // escuro. Sem isso o halo do recorte continua gritando, que foi o que o
      // Bruno apontou em 24/08. Sao 9 KB por trecho.
      paraOlhar.push({
        indice: t.indice,
        quadros,
        mediaType: "image/jpeg",
        luz: caminhos.length ? gradeDeLuz(caminhos[0]) : null,
      });
    }

    // Candidatos a capa, do vídeo inteiro. Vão na mesma chamada que o
    // enquadramento: são as mesmas imagens do mesmo vídeo olhadas pelo mesmo
    // agente, e duas chamadas custariam duas vezes o prompt sem ganhar nada.
    const candidatos = await extrairCandidatosDeCapa(
      fonte,
      join(pasta, "capa-cand"),
      duracaoSec,
      10
    );
    const candidatosB64 = [];
    for (const c of candidatos) {
      candidatosB64.push((await readFile(c.caminho)).toString("base64"));
    }

    const texto = JSON.stringify({ trechos: paraOlhar, candidatosDeCapa: candidatosB64 });
    const res = await fetch(trabalho.enquadramentoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-demandou-assinatura": assinar(texto),
      },
      body: texto,
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`enquadramento respondeu ${res.status}`);
    const corpo = await res.json();

    // O instante do candidato escolhido, para reextrair em resolução cheia.
    let capa = null;
    if (corpo.capa && candidatos[corpo.capa.indice]) {
      capa = {
        instante: candidatos[corpo.capa.indice].instante,
        recorte: corpo.capa.recorte ?? null,
        motivo: corpo.capa.motivo ?? "",
      };
    }

    return {
      enquadramentos: new Map((corpo.enquadramentos ?? []).map((e) => [e.indice, e])),
      capa,
      // O FUNDO vem daqui e nao do pedido inicial. Ele depende do brilho da
      // parede atras da pessoa, e so agora, com a caixa da pessoa em maos, o
      // app conseguiu medir isso.
      fundoUrl: corpo.fundoUrl ?? null,
      brilhoAlvo: typeof corpo.brilhoAlvo === "number" ? corpo.brilhoAlvo : null,
    };
  } catch (e) {
    console.error(`[${trabalho.videoJobId}] enquadramento falhou: ${e.message}`);
    return { enquadramentos: new Map(), capa: null, fundoUrl: null, brilhoAlvo: null };
  }
}

/**
 * Quanto corrigir o brilho do fundo gerado para casar com a gravacao.
 *
 * ## Por que existe
 *
 * Sacada do Bruno em 24/08: o halo em volta do recorte e o branco da parede
 * vazando pela borda semitransparente da mascara, e ele so APARECE porque o
 * fundo gerado e escuro. Casando os brilhos, o halo perde o contraste que o faz
 * aparecer.
 *
 * ## Por que a correcao QUASE FOI REMOVIDA
 *
 * A primeira versao somava brilho, com `eq=brightness`. Medido na imagem que
 * foi ao ar: um empurrao de 23 pontos levou a area ESTOURADA de **0,4% para
 * 16%** da imagem. Dezesseis por cento do quadro virou branco puro, sem
 * textura nenhuma, e foi isso que o Bruno viu e chamou de "imagem pessima".
 *
 * Somar brilho e a ferramenta errada para clarear uma imagem que ja e clara:
 * ela empurra o que ja estava perto do teto para fora dele.
 *
 * ## O que ficou, e por que ele quase nunca vai agir
 *
 * Gama em vez de soma. A curva de gama leva 0 em 0 e 255 em 255, entao ela
 * clareia o meio-tom sem NUNCA estourar. Medido na mesma imagem: gama 1,7 leva
 * o brilho de 205 para 224, praticamente o mesmo que a soma levava, com 0,9%
 * de area estourada em vez de 16%.
 *
 * E o limiar. Medido no corte de producao: com 23 pontos de diferenca entre o
 * fundo e a parede, o halo ficou em +6, que ja e menos do que o olho separa
 * numa tela de telefone. Abaixo de 20 pontos a correcao nao tem o que
 * consertar, e mexer na imagem sem ganho e so risco.
 *
 * O teto de gama existe pela mesma razao do teto anterior: empurrar um fundo
 * muito escuro ate uma parede branca lavaria a imagem e destruiria a
 * profundidade, que e o motivo de gerar fundo em vez de usar cor solida.
 */
const DIFERENCA_QUE_IMPORTA = 20;
const GAMA_MAXIMA = 1.8;
const GAMA_MINIMA = 0.6;

function calcularAjusteDeBrilho(arquivo, alvo, videoJobId) {
  if (typeof alvo !== "number") return null;
  const medido = brilhoMedio(arquivo);
  if (medido === null) return null;

  const diferenca = alvo - medido;
  if (Math.abs(diferenca) < DIFERENCA_QUE_IMPORTA) {
    console.log(
      `[${videoJobId}] fundo com brilho ${medido.toFixed(0)}, alvo ${alvo}` +
        `, diferenca de ${diferenca.toFixed(0)} nao vale mexer`
    );
    return null;
  }

  // A gama que leva a media de `medido` ate `alvo`, na curva `saida =
  // entrada^(1/gama)` que o filtro `eq` aplica sobre o valor normalizado.
  const m = Math.min(0.999, Math.max(0.001, medido / 255));
  const t = Math.min(0.999, Math.max(0.001, alvo / 255));
  const bruta = Math.log(m) / Math.log(t);
  const gama = Math.max(GAMA_MINIMA, Math.min(GAMA_MAXIMA, bruta));
  const previsto = Math.pow(m, 1 / gama) * 255;

  console.log(
    `[${videoJobId}] fundo com brilho ${medido.toFixed(0)}, alvo ${alvo}` +
      `, gama ${gama.toFixed(2)} leva para ${previsto.toFixed(0)}` +
      (gama !== bruta
        ? ` (a gama que fecharia seria ${bruta.toFixed(2)}, limitada para nao lavar a imagem)`
        : "")
  );
  return gama;
}


/**
 * Quantas coisas rodar ao mesmo tempo, a partir do contêiner de verdade.
 *
 * Lido na subida, uma vez, em capacidade.mjs: núcleos e o teto de memória do
 * cgroup (7,6 GB no Railway Hobby, medido em 04/09 pelo /saude). Na máquina de
 * 8 vCPU / 7,6 GB dá os mesmos 3 trechos e 2 lotes de antes; numa maior, mais.
 */
const PARALELISMO = { trechos: CAPACIDADE.trechos, lotes: CAPACIDADE.lotes };
console.log(
  `paralelismo: ${PARALELISMO.trechos} trechos, ${PARALELISMO.lotes} lotes do completo, ` +
    `${CAPACIDADE.rendersJuntos} unidade(s) na fila de montagem (${CAPACIDADE.cpus} cpus, ${memoriaDoConteiner().limite})`
);

/** Roda `fn` sobre `itens`, no máximo `n` de cada vez. Nenhuma rejeição escapa: cada `fn` trata a própria. */
async function emPiscina(itens, n, fn) {
  const fila = [...itens];
  const operarios = Array.from({ length: Math.max(1, n) }, async () => {
    while (fila.length) {
      const item = fila.shift();
      await fn(item);
    }
  });
  await Promise.all(operarios);
}

/**
 * A legenda de destaque do completo no quadro EM PÉ (30/09).
 *
 * O app escreve o ASS para 1920x1080 (lib/media/edicao.ts), porque o completo
 * sempre foi deitado. Num completo de celular em pé o libass esticaria esse
 * sistema de coordenadas num quadro 1080x1920: letra deformada e a linha, que
 * não quebra (WrapStyle 2), passando da largura. Aqui a referência vira
 * 1080x1920, o que mantém o tamanho da letra em pixels (64 px, legível num
 * quadro de 1080 de largura), e a quebra passa a ser automática (WrapStyle 0).
 * Gravação deitada passa intocada.
 */
function legendaNoQuadroDoCompleto(ass, info) {
  if (!ehVertical(info)) return ass;
  return ass
    .replace(/^PlayResX:.*$/m, "PlayResX: 1080")
    .replace(/^PlayResY:.*$/m, "PlayResY: 1920")
    .replace(/^WrapStyle:.*$/m, "WrapStyle: 0");
}

async function produzirCompleto(trabalho, fonte, pasta, info, resultados, marca) {
  const completo = join(pasta, "completo.mp4");

  // As legendas de destaque chegam prontas do app, já com os tempos
  // convertidos para o vídeo DEPOIS das remoções. Convertê-las aqui
  // exigiria repetir a mesma matemática de deslocamento nos dois lados, e
  // duas contas iguais em lugares diferentes divergem com o tempo.
  let legendasArquivo = null;
  if (trabalho.legendasAss) {
    legendasArquivo = join(pasta, "destaques.ass");
    await writeFile(legendasArquivo, legendaNoQuadroDoCompleto(trabalho.legendasAss, info), "utf8");
  }

  // O CORPO primeiro: a gravação editada, do começo.
  const corpo = join(pasta, "corpo.mp4");
  const como = await prepararCompleto(fonte, corpo, {
    remocoes: trabalho.remocoes,
    duracaoSec: info.duracaoSec,
    legendasArquivo,
    // Prioridade baixa enquanto os trechos rodam; sozinho (`soCompleto`) o
    // nice não tira nada, porque não há com quem disputar.
    nice: 10,
    lotesEmParalelo: PARALELISMO.lotes,
  });
  marca("completo recodificado");

  // A abertura vai NA FRENTE, com os ganchos que o squad escolheu. Os
  // tempos dela já chegam convertidos para depois da edição, senão
  // apontariam para o instante errado do arquivo original.
  //
  // Se a abertura falhar, o vídeo sai sem ela: um vídeo que começa do
  // começo é pior de reter, mas é um vídeo. Sem corpo não há entrega.
  let temAbertura = false;
  try {
    const abertura = join(pasta, "abertura.mp4");
    temAbertura = await montarAbertura(corpo, abertura, trabalho.ganchos);
    if (temAbertura) {
      await emendar([abertura, corpo], completo, pasta);
    }
  } catch (e) {
    temAbertura = false;
    resultados.erros.push(
      `abertura: ${e instanceof Error ? e.message : "falhou"}`
    );
  }
  if (!temAbertura) {
    await copyFile(corpo, completo);
  }

  resultados.completo = await subir(
    completo,
    `cortes/${trabalho.videoJobId}/completo.mp4`,
    "video/mp4"
  );
  // A GUARDA NA SAÍDA (03/10): a base limpa é o completo que o cliente recebe
  // quando a edição falha, e é sobre ela que o editor trabalha. A fala dela é
  // conferida no próprio arquivo (src/guarda-da-fala.mjs) antes do aviso.
  if (trabalho.guardaDaFala) {
    const aberturaSeg = temAbertura ? (await ffprobe(join(pasta, "abertura.mp4")).catch(() => null))?.duracaoSec ?? 0 : 0;
    const guarda = await guardarFala({
      arquivo: completo,
      montado: resultados.completo,
      guarda: trabalho.guardaDaFala,
      protegido: aberturaSeg > 0 ? [{ de: 0, ate: aberturaSeg + 0.3 }] : [],
      pasta,
      chave: `cortes/${trabalho.videoJobId}/completo.mp4`,
      subir,
      assinar,
    });
    resultados.completo = guarda.montado;
    resultados.completo.guardaDaFala = guarda.relatorio;
    marca("guarda da fala");
  }
  resultados.completo.abertura = temAbertura ? trabalho.ganchos.length : 0;
  resultados.completo.recodificado = como.recodificado;
  resultados.completo.motivo = como.motivo;
  // A promessa de qualidade tem que ser verificável, não prometida. Só faz
  // sentido medir quando houve recodificação: remux é idêntico por
  // definição, e comparar um arquivo com ele mesmo custa CPU à toa.
  // A fidelidade compara o CORPO com a fonte, e não o arquivo final: o
  // final tem a abertura na frente, então os dois estariam desalinhados no
  // tempo e o SSIM mediria desencontro, não perda de qualidade.
  resultados.completo.fidelidade = como.recodificado
    ? await medirFidelidade(fonte, corpo, info.duracaoSec)
    : 1;
}

/**
 * A falha do completo, registrada como o `catch` de antes fazia: no LOG e na
 * lista de erros. Virou função porque o completo agora roda em paralelo com os
 * trechos, e a promessa dele é colhida depois do aviso parcial.
 */
function registrarFalhaDoCompleto(trabalho, resultados, e) {
  const mensagem = e instanceof Error ? e.message : "falhou";
  // O LOG, e nao so a lista de erros. Em 01/09 o completo falhou e ninguem
  // soube: o catch guardava a mensagem num campo que o callback tardio
  // ignorava, entao a plataforma inteira ficou cega para uma falha de 800
  // segundos de trabalho. Erro tecnico pertence ao log.
  //
  // O espaco em disco vai junto porque ele e o suspeito numero um quando o
  // passe 2 morre logo depois de o passe 1 escrever um intermediario
  // grande, e essa e a informacao que nao da para recuperar depois.
  let disco = "";
  try {
    disco = execSync("df -h /tmp . 2>/dev/null | tail -2").toString().trim().replace(/\s+/g, " ");
  } catch {}
  console.error(`[${trabalho.videoJobId}] COMPLETO FALHOU: ${mensagem}`);
  if (disco) console.error(`[${trabalho.videoJobId}] disco: ${disco}`);
  resultados.erros.push(`completo: ${mensagem}`);
}

/**
 * O trabalho de verdade.
 *
 * Prioridade deliberada: os TRECHOS têm o processador, e o vídeo completo roda
 * junto com `nice`, no que sobra. O completo é o item mais caro (recodifica a
 * gravação inteira) e o menos urgente (o cliente publica no canal com calma),
 * enquanto os trechos são o que ele quer ver para decidir. Os cortes vão para
 * o app assim que terminam (aviso parcial); o completo chega quando chegar.
 */
async function processar(trabalho) {
  const pasta = await mkdtemp(join(tmpdir(), "demandou-"));
  const resultados = { trechos: [], completo: null, capaFonte: null, capaFonteRecorte: null, erros: [] };
  // Vai junto no aviso: um pedido `soTrechos` refaz um corte e NAO produz
  // completo, e sem esta marca o app gravaria `completoUrl: null` por cima de
  // um video completo que existe e esta no ar.
  if (trabalho.soTrechos) resultados.soTrechos = true;
  // O re-corte de um trecho só (pedido do cliente na tela) volta marcado, para
  // o callback fundir em vez de reprocessar o vídeo inteiro.
  if (trabalho.reCorte) resultados.reCorte = true;
  // O relogio das fases: o tempo total do worker e o gargalo reclamado em
  // 31/08, e sem numero por fase todo plano de corte de tempo e chute.
  const t0 = Date.now();
  const marca = (fase) =>
    console.log(`[${trabalho.videoJobId}] tempo: ${fase} aos ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  try {
    const fonte = join(pasta, "fonte.mp4");
    await baixarFonte(trabalho.sourceUrl, fonte);
    marca("fonte baixada");
    const info = await ffprobe(fonte);

    // A TRILHA do projeto, baixada uma vez para todos os cortes. Falhar nao
    // derruba nada: os cortes saem sem musica, que e como sempre sairam.
    let musicaLocal = null;
    if (trabalho.musicaUrl) {
      try {
        musicaLocal = join(pasta, "trilha" + (trabalho.musicaUrl.match(/\.[a-z0-9]{2,4}(?=\?|$)/i)?.[0] ?? ".mp3"));
        await baixarFonte(trabalho.musicaUrl, musicaLocal);
      } catch (e) {
        musicaLocal = null;
        console.warn(`[${trabalho.videoJobId}] nao consegui baixar a trilha: ${e.message}`);
      }
    }

    // No `soCompleto` o enquadramento nem e pedido: ele serve aos cortes, custa
    // uma chamada de visao e os cortes ja estao prontos.
    const { enquadramentos, capa, fundoUrl, brilhoAlvo } = trabalho.soCompleto
      ? { enquadramentos: new Map(), capa: null, fundoUrl: null, brilhoAlvo: null }
      : await pedirEnquadramento(trabalho, fonte, pasta, info.duracaoSec);
    marca("enquadramento pronto");

    // O FUNDO dos cortes, gerado pelo app e guardado no storage. Baixa uma vez
    // e serve todos os cortes. Falhar aqui nao derruba nada: sem fundo os
    // cortes saem na composicao com o slide.
    //
    // Vem DEPOIS do enquadramento, e nao do pedido inicial, porque ele depende
    // do brilho da parede atras da pessoa, e so o agente de visao sabe onde a
    // pessoa esta. `trabalho.fundoUrl` fica de reserva para um pedido antigo,
    // montado antes desta mudanca, que ainda esteja na fila.
    let fundoLocal = null;
    let ajusteDeBrilho = null;
    const urlDoFundo = fundoUrl ?? trabalho.fundoUrl ?? null;
    if (urlDoFundo) {
      try {
        fundoLocal = join(pasta, "fundo.jpg");
        await baixarFonte(urlDoFundo, fundoLocal);
        ajusteDeBrilho = calcularAjusteDeBrilho(fundoLocal, brilhoAlvo, trabalho.videoJobId);
      } catch (e) {
        fundoLocal = null;
        console.warn(
          `[${trabalho.videoJobId}] nao consegui baixar o fundo: ${e.message}`
        );
      }
    }

    // A HONESTIDADE SOBRE A JANELA PEQUENA, pedida pelo Bruno em 24/08: "se o
    // usuario gravar um video igual o meu, com a imagem la no canto da tela, o
    // agente deve dizer" que os cortes vao sair ruins e por que.
    //
    // A conta e direta: o corte vertical precisa de 1080 px de largura, e a
    // regiao da pessoa tem `pessoa.w * largura da fonte` pixels. A razao entre
    // os dois e a ampliacao. Na gravacao do Bruno, a webcam de 422 px vira
    // 2,6x, e foi isso que ele viu como "imagem macia". Acima de 2x o aviso
    // entra no diagnostico do video, que e o campo que o cliente le.
    // Gravação em pé não amplia nada: o vertical é o quadro inteiro (ver
    // `cortarVertical`), então a conta abaixo não vale para ela.
    if (!ehVertical(info)) {
      const ampliacoes = [...enquadramentos.values()]
        .filter((e) => e?.pessoa?.w)
        .map((e) => 1080 / Math.max(1, e.pessoa.w * info.largura));
      if (ampliacoes.length) {
        const pior = Math.max(...ampliacoes);
        if (pior > 2) {
          resultados.avisoDeQualidade =
            `Você aparece numa janela pequena da gravação, e os cortes verticais ` +
            `precisam ampliar essa área ${pior.toFixed(1)} vezes, o que reduz a nitidez. ` +
            `Para cortes nítidos, grave com a câmera em tela cheia; a tela ` +
            `compartilhada continua valendo para o vídeo completo.`;
          console.log(
            `[${trabalho.videoJobId}] aviso de qualidade: ampliacao de ${pior.toFixed(1)}x`
          );
        }
      }
    }

    // A capa da gravação sai antes dos cortes: é barata (um quadro) e é o que a
    // tela mostra primeiro.
    if (capa) {
      try {
        const arquivo = join(pasta, "capa-fonte.jpg");
        // O agente de visão acha a REGIÃO (a webcam numa gravação de tela) e um
        // instante bom; o rosto decide o quadro exato, em volta desse instante,
        // com olho aberto e boca fechada (teste de 29/09: capa-fonte de olhos
        // semicerrados e boca aberta).
        let instante = capa.instante;
        const perto = await quadroDaCapa(
          {
            video: fonte,
            instantes: instantesEspalhados(Math.max(0, capa.instante - 6), 12, 12).concat(
              instantesEspalhados(0, info.duracaoSec, 12)
            ),
          },
          pasta,
          "qc-fonte"
        );
        if (perto?.instante != null) instante = perto.instante;
        await extrairCapaFinal(fonte, arquivo, instante, capa.recorte);
        // Em pé, a capa deitada tem as laterais desfocadas: o recorte da
        // pessoa sai de um quadro inteiro em pé, sem borrão para confundir o
        // segmentador (30/09).
        let imagemDoRecorte = arquivo;
        if (ehVertical(info)) {
          imagemDoRecorte = join(pasta, "capa-fonte-em-pe.jpg");
          await extrairQuadroInteiro(fonte, imagemDoRecorte, instante);
        }
        const recorteDaFonte = await quadroDaCapa({ imagem: imagemDoRecorte }, pasta, "qc-fonte-final");
        if (recorteDaFonte) {
          resultados.capaFonteRecorte = await subir(
            recorteDaFonte.recorte,
            `cortes/${trabalho.videoJobId}/recorte-fonte.png`,
            "image/png"
          );
          resultados.capaFonteRecorte.rosto = recorteDaFonte.rosto;
        }
        resultados.capaFonte = await subir(
          arquivo,
          `cortes/${trabalho.videoJobId}/capa-fonte.jpg`,
          "image/jpeg"
        );
        resultados.capaFonte.instante = Math.round(instante);
        resultados.capaFonte.motivo = capa.motivo;
      } catch (e) {
        resultados.erros.push(
          `capa: ${e instanceof Error ? e.message : "falhou"}`
        );
      }
    }

    // `soCompleto` refaz APENAS o video completo, sem recortar tudo de novo.
    //
    // Existe desde 02/09, quando o completo falhou e a unica saida era pagar
    // 800 segundos de worker refazendo tambem os cortes, que estavam prontos e
    // corretos. Falha de uma etapa nao pode custar o trabalho das outras.
    // ## Os trechos saem EM PARALELO, e o completo começa junto
    //
    // Até 04/09 tudo era em série: cada trecho levava perto de 55 s e o
    // completo só começava depois do último, num contêiner de 8 vCPU e 7,6 GB
    // que passava a maior parte do tempo com um núcleo ocupado. Medido no
    // teste do Bruno: cortes aos 6,9 min, completo aos 25 min.
    //
    // Agora os trechos rodam em piscina (três por vez: cada um é um ffmpeg
    // mais um Python de segmentação, perto de 1,5 GB juntos no pior caso), e o
    // completo começa AO MESMO TEMPO, com `nice`, para só usar o processador
    // que os trechos deixarem. Os cortes continuam sendo a prioridade: são o
    // que o cliente quer ver para decidir.
    const produzirTrecho = async (t) => {
      const duracao = Math.max(1, t.fim - t.inicio);
      const enq = enquadramentos.get(t.indice) ?? null;
      const saida = {
        indice: t.indice,
        titulo: t.titulo,
        duracaoSec: duracao,
        enquadramento: enq
          ? {
              cena: enq.cena,
              vertical: enq.vertical,
              motivo: enq.motivo,
              // As caixas vão junto de propósito. Sem elas, recorte errado vira
              // "está cortando o slide" sem ninguém conseguir dizer se a culpa
              // foi do agente que mediu ou do filtro que aplicou. Custam alguns
              // bytes e economizam uma investigação inteira.
              pessoa: enq.pessoa ?? null,
              tela: enq.tela ?? null,
            }
          : null,
      };
      try {
        // PRIMEIRO a limpeza, e depois tudo o mais.
        //
        // Até 23/08 a limpeza de fala rodava só no vídeo completo, e os cortes
        // saíam do arquivo cru com gaguejo e muleta intactos. Medido: 9% do que
        // ia ao ar era pausa ou muleta. Limpar aqui, ANTES do recorte da
        // pessoa, também garante que a máscara nasça alinhada com a imagem: se
        // a remoção viesse depois, as duas ficariam em linhas do tempo
        // diferentes e o recorte sairia deslocado.
        const limpo = join(pasta, `t-${t.indice}.mp4`);
        // Os pedaços que ficam vêm PRONTOS do app, e não são deduzidos aqui.
        // É a mesma lista que gerou a legenda deste corte, então as duas não
        // têm como divergir. Sem `manter` no pedido, cai no comportamento
        // antigo de não remover nada, que é pior mas não quebra.
        const corte = await prepararTrecho(
          fonte, limpo, t.inicio, duracao, t.manter ?? [{ de: 0, ate: duracao }],
          // O punch-in fecha o plano em volta da pessoa, nao do centro da tela.
          enq?.pessoa ?? null
        );
        const duracaoLimpa = Math.max(1, duracao - corte.segundos);
        // O gatilho é o TEMPO removido, e não a contagem de emendas. Um trecho
        // com uma remoção só na ponta tem uma emenda apenas, e a contagem dá
        // zero, o que esconderia do log um corte que tirou vários segundos.
        if (corte.segundos > 0.05) {
          console.log(
            `[${trabalho.videoJobId}] trecho ${t.indice}: ` +
              `${corte.removidos} emendas, ${corte.segundos.toFixed(1)}s a menos`
          );
        }

        // A partir daqui tudo trabalha sobre o trecho JÁ LIMPO, e os tempos
        // passam a ser relativos a ele, começando do zero.
        //
        // A MASCARA EXISTE EM DOIS CASOS, e o segundo entrou em 10/09.
        //
        // 1. Fundo gerado. Desligado desde 24/08 a noite, por decisao do Bruno:
        //    em corte de FALA o formato do mercado e o video real da pessoa,
        //    com o fundo real dela, e ninguem recorta a pessoa para colar numa
        //    arte gerada.
        // 2. EMPILHADO, que o agente de visao pede quando a cena e mista
        //    (slide ou tela compartilhada mais a janela da webcam).
        //
        // O empilhado tinha ido junto no desligamento do fundo sem ninguem
        // decidir isso, e ele nao depende de arte gerada: e o slide real em
        // cima e a pessoa real embaixo. O efeito, medido em 10/09 com uma
        // gravacao de tela passada pela esteira: o agente devolvia
        // `vertical: "empilhado"`, o worker nunca lia esse campo, e o cliente
        // recebia um crop ampliado 2,8x da janelinha da webcam, sem o slide. O
        // proprio log media a ampliacao e avisava, para ele mesmo.
        //
        // A conta do custo: a segmentacao volta a rodar, uns 13 segundos por
        // corte, e SO nos trechos mistos. Corte de fala continua sem ela.
        const querEmpilhado = enq?.vertical === "empilhado" && Boolean(enq?.tela);
        // Gravação em pé nunca precisa de máscara: o vertical é o quadro
        // inteiro, sem empilhado nem fundo (ver `cortarVertical`). Rodar a
        // segmentação aqui seria gastar uns 13 s por corte à toa (30/09).
        const precisaDeMascara =
          !ehVertical(info) && Boolean(enq?.pessoa) && (Boolean(fundoLocal) || querEmpilhado);
        const matte = precisaDeMascara
          ? await gerarMatte(limpo, pasta, t.indice, 0, duracaoLimpa, enq.pessoa)
          : null;
        if (precisaDeMascara && !matte) {
          // Aviso, e nao erro: sem mascara o corte ainda sai, na composicao
          // antiga. Mas ele SAI PIOR, e sem esta linha o sintoma vira "o
          // empilhado simplesmente nao aparece", que e a pior forma de defeito.
          console.warn(
            `[${trabalho.videoJobId}] trecho ${t.indice} sem recorte` +
              `${querEmpilhado ? " (o agente pediu empilhado)" : ""}, ` +
              "sai na composição antiga"
          );
        }

        // Sem mascara, o corte vertical e SEMPRE o corte central na pessoa: e
        // o que o Bruno pediu para os cortes ("deixa apenas eu"), e e o formato
        // do mercado.
        //
        // Quando o agente de visao nao devolve a caixa da pessoa (aconteceu em
        // 24/08, com ele DESCREVENDO a webcam no motivo e devolvendo null), a
        // caixa vem da deteccao de movimento, que e deterministica. So se as
        // duas falharem o corte cai no tratamento antigo do enquadramento.
        let caixaDaPessoa = enq?.pessoa ?? null;
        // Em pé a caixa não é usada (o vertical é o quadro inteiro): não vale
        // procurar movimento para achá-la.
        if (!caixaDaPessoa && !ehVertical(info)) {
          const achada = await acharCaixaDaPessoa(limpo, pasta, t.indice, 0, duracaoLimpa);
          if (achada) {
            // A deteccao devolve a regiao que SE MEXE, que e o rosto: no video
            // real ela achou h=0,21 onde a janela inteira tem 0,28. Um corte
            // 9:16 so do rosto seria ampliacao de 8x. A caixa cresce para
            // pegar o tronco, ANCORADA no fundo dela: crescer para baixo
            // incluiria a barra de botoes do aplicativo, que vive logo abaixo
            // da webcam, e foi o defeito ja visto neste mesmo dia.
            const h = Math.min(0.42, achada.h * 1.7);
            const w = Math.min(0.36, achada.w * 1.5);
            caixaDaPessoa = {
              x: Math.max(0, Math.min(1 - w, achada.x + achada.w / 2 - w / 2)),
              y: Math.max(0, achada.y + achada.h - h),
              w,
              h,
            };
            console.log(
              `[${trabalho.videoJobId}] trecho ${t.indice}: caixa da pessoa ` +
                `veio da deteccao de movimento (agente devolveu null)`
            );
          }
        }
        const enqDoVertical = matte
          ? enq
          : caixaDaPessoa
            ? { ...(enq ?? {}), pessoa: caixaDaPessoa, vertical: "corte-central" }
            : enq;

        // A LEGENDA palavra a palavra, escrita pelo app com o estilo do projeto
        // e com os tempos já convertidos para este corte.
        //
        // Vem pronta pelo mesmo motivo do enquadramento e da abertura: a
        // matemática do deslocamento de tempo mora num lugar só. E são dois
        // arquivos, porque o ASS carrega a resolução para a qual foi escrito e
        // o quadro deitado não é o mesmo que o em pé.
        //
        // Falhar em escrever a legenda não derruba o corte: sai sem ela, que é
        // muito pior de reter mas existe.
        let legendaV = null;
        let legendaH = null;
        try {
          if (t.legendaVertical) {
            legendaV = `legenda-v-${t.indice}.ass`;
            await writeFile(join(pasta, legendaV), t.legendaVertical, "utf8");
          }
          if (t.legendaHorizontal) {
            legendaH = `legenda-h-${t.indice}.ass`;
            await writeFile(join(pasta, legendaH), t.legendaHorizontal, "utf8");
          }
        } catch (e) {
          legendaV = null;
          legendaH = null;
          console.warn(
            `[${trabalho.videoJobId}] trecho ${t.indice} sem legenda: ${e.message}`
          );
        }
        saida.legenda = Boolean(legendaV);
        saida.musica = Boolean(musicaLocal);

        // OS EMOJI, copiados da paleta do repositorio para a pasta do trabalho.
        //
        // Copiados e nao referenciados no lugar de origem porque o filtro
        // `movie=` resolve caminho relativo ao diretorio de trabalho, e caminho
        // absoluto do Windows com dois-pontos quebra o parser. Rodar dentro da
        // pasta e passar so o nome vale para os dois sistemas, e e o mesmo
        // cuidado que o fundo e a legenda ja tomavam.
        const emojisDoTrecho = [];
        for (const e of t.emojis ?? []) {
          try {
            const origem = join(PASTA_DE_EMOJI, e.arquivo);
            // `COPYFILE_EXCL`: com os trechos em paralelo, dois deles podem
            // querer o mesmo emoji; o segundo não pode truncar o arquivo que
            // o ffmpeg do primeiro já está lendo. Já existe, serve.
            await copyFile(origem, join(pasta, e.arquivo), fsConstants.COPYFILE_EXCL).catch((erro) => {
              if (erro?.code !== "EEXIST") throw erro;
            });
            emojisDoTrecho.push({ arquivo: e.arquivo, segundo: e.segundo });
          } catch (erro) {
            console.warn(
              `[${trabalho.videoJobId}] emoji ${e.arquivo} nao copiou: ${erro.message}`
            );
          }
        }
        saida.efeitos = emojisDoTrecho.length;

        const vertical = join(pasta, `v-${t.indice}.mp4`);
        // Sem MASCARA nao ha como recortar a pessoa, e sem recorte o fundo
        // gerado nao serve: sobrepor o retangulo inteiro da webcam em cima de
        // uma arte fica pior que a composicao antiga. Por isso o fundo so entra
        // quando o recorte deu certo.
        // O EMOJI E A PRIMEIRA COISA A CAIR se o corte falhar.
        //
        // Em 24/08 o mesmo trecho morreu TRES vezes no codificador, sempre com
        // uma mensagem que nao menciona emoji nem overlay, enquanto os outros
        // tres cortes do mesmo video passavam. Enquanto a causa nao aparece,
        // um corte sem emoji e infinitamente melhor que um corte que nao
        // existe: o emoji e acento, a legenda e o fundo e que sao o produto.
        //
        // Mesma regra que o fluxo ja aplica ao recorte, ao fundo e a abertura.
        // A diferenca e que aqui a queda e uma SEGUNDA tentativa, e nao um
        // caminho alternativo, porque so da para saber que o grafo com emoji
        // nao serve depois de o ffmpeg recusar.
        const comporVertical = (comEmoji, comTratamento = true) =>
          cortarVertical(
            limpo, vertical, 0, duracaoLimpa, enqDoVertical, matte,
            matte && fundoLocal ? basename(fundoLocal) : null,
            legendaV,
            trabalho.estilo?.ritmo ?? null,
            ajusteDeBrilho,
            comEmoji ? emojisDoTrecho : [],
            musicaLocal ? basename(musicaLocal) : null,
            trabalho.estilo?.som ?? null,
            // As dimensoes da gravacao: o empilhado precisa delas para saber a
            // altura do cartao antes de compor, e sem isso o layout cai nas
            // larguras fixas, que deixavam um vazio no meio do quadro.
            { largura: info.largura, altura: info.altura },
            // A linguagem escolhida (30/09); a segunda tentativa vai sem ela,
            // porque corte cru é melhor que corte nenhum.
            comTratamento && trabalho.tratamento ? { ...trabalho.tratamento, momentos: t.momentos ?? [] } : null
          );

        try {
          await comporVertical(true);
        } catch (e) {
          // O tratamento da linguagem é o filtro mais novo do grafo: se o
          // ffmpeg recusar, o corte sai sem ele e o motivo fica no log e no
          // trecho, em vez de o corte não existir (30/09).
          if (trabalho.tratamento) {
            console.error(`[${trabalho.videoJobId}] trecho ${t.indice} falhou COM tratamento, tentando sem: ${e.message.slice(0, 300)}`);
            saida.tratamentoCaiu = true;
            await comporVertical(false, false);
          } else if (!emojisDoTrecho.length) throw e;
          else {
          console.error(
            `[${trabalho.videoJobId}] trecho ${t.indice} falhou COM emoji, ` +
              `tentando sem: ${e.message}`
          );
          await comporVertical(false);
          saida.efeitos = 0;
          saida.emojiCaiu = true;
          }
        }
        saida.vertical = await subir(
          vertical,
          `cortes/${trabalho.videoJobId}/vertical-${t.indice}.mp4`,
          "video/mp4"
        );

        const horizontal = join(pasta, `h-${t.indice}.mp4`);
        await cortarHorizontal(
          limpo, horizontal, 0, duracaoLimpa, legendaH,
          musicaLocal ? basename(musicaLocal) : null,
          trabalho.estilo?.som ?? null,
          trabalho.tratamento ? { ...trabalho.tratamento, momentos: t.momentos ?? [] } : null
        );
        saida.horizontal = await subir(
          horizontal,
          `cortes/${trabalho.videoJobId}/horizontal-${t.indice}.mp4`,
          "video/mp4"
        );

        // A capa do corte: o melhor quadro do trecho como FOTO (olho aberto,
        // boca fechada, rosto de frente) e a pessoa recortada dele, para a capa
        // ser composta em código sem o modelo de imagem tocar no rosto (teste de
        // 29/09). Sem rosto achado, cai no quadro fixo de antes.
        const escolhido = await quadroDaCapa(
          { video: limpo, instantes: instantesEspalhados(0, duracaoLimpa, 16) },
          pasta,
          `qc-${t.indice}`
        );
        if (escolhido) {
          saida.capa = await subir(
            escolhido.quadro,
            `cortes/${trabalho.videoJobId}/capa-${t.indice}.jpg`,
            "image/jpeg"
          );
          saida.recorte = await subir(
            escolhido.recorte,
            `cortes/${trabalho.videoJobId}/recorte-${t.indice}.png`,
            "image/png"
          );
          saida.recorte.rosto = escolhido.rosto;
          saida.recorte.notas = escolhido.notas;
        } else {
          const capa = join(pasta, `c-${t.indice}.jpg`);
          await extrairCapa(limpo, capa, 0, duracaoLimpa);
          saida.capa = await subir(
            capa,
            `cortes/${trabalho.videoJobId}/capa-${t.indice}.jpg`,
            "image/jpeg"
          );
        }
      } catch (e) {
        // Um trecho que falha não derruba os outros. Entregar quatro de cinco é
        // melhor que entregar zero, e a tela mostra qual faltou.
        saida.erro = e instanceof Error ? e.message : "falhou";
        resultados.erros.push(`trecho ${t.indice}: ${saida.erro}`);
      }
      resultados.trechos.push(saida);
      marca(`trecho ${t.indice} entregue`);
    };

    // O completo parte agora, em segundo plano e com prioridade baixa. A
    // promessa é esperada depois do aviso parcial; a falha dela é tratada lá.
    const completoEmAndamento = trabalho.soTrechos
      ? null
      : produzirCompleto(trabalho, fonte, pasta, info, resultados, marca).catch((e) => ({ falhou: e }));

    await emPiscina(trabalho.soCompleto ? [] : trabalho.trechos, PARALELISMO.trechos, produzirTrecho);

    // ## SEGUNDA CHANCE, SOZINHO, para o trecho que falhou
    //
    // Medido em 08/09, na primeira medicao de ponta a ponta com o piloto: dos
    // tres cortes, o do MEIO falhou com
    //
    //     Failed to configure output pad on Parsed_scale_101
    //     Error reinitializing filters!
    //     Failed to inject frame into filter network: Resource temporarily unavailable
    //
    // O arquivo nao muda de propriedade ali (conferido quadro a quadro nos 100 s
    // do trecho: 2560x1440 yuv420p do comeco ao fim), e o MESMO pedido, com os
    // mesmos 13 pedacos, passou em 32 s rodando sozinho na maquina de
    // desenvolvimento. O que separa esse trecho dos outros dois e tamanho: 13
    // pedacos contra 4 e 8, ou seja o maior grafo, disputando o conteiner com
    // outros dois trechos e com o passe 1 do completo. "Resource temporarily
    // unavailable" e falta de recurso na hora de montar o filtro, nao defeito
    // do video.
    //
    // Nao da para afirmar de qual dos dois e a culpa (tamanho do grafo ou
    // disputa), e a resposta util e a mesma nos dois casos: repetir o que
    // falhou SOZINHO, com a piscina ja vazia e o completo com prioridade baixa.
    // Se a segunda chance passar, era disputa, e o log diz isso na proxima vez.
    const falhados = trabalho.soCompleto
      ? []
      : trabalho.trechos.filter((t) => resultados.trechos.find((r) => r.indice === t.indice)?.erro);
    if (falhados.length) {
      console.warn(
        `[${trabalho.videoJobId}] ${falhados.length} trecho(s) falharam na piscina, ` +
          `repetindo um de cada vez: ${falhados.map((t) => t.indice).join(", ")}`
      );
      // Sai do resultado antes de repetir: `produzirTrecho` empilha um item
      // novo, e dois itens com o mesmo indice fariam o app escolher por sorte.
      resultados.trechos = resultados.trechos.filter(
        (r) => !falhados.some((t) => t.indice === r.indice)
      );
      resultados.erros = resultados.erros.filter(
        (e) => !falhados.some((t) => e.startsWith(`trecho ${t.indice}:`))
      );
      await emPiscina(falhados, 1, produzirTrecho);
      for (const t of falhados) {
        const r = resultados.trechos.find((x) => x.indice === t.indice);
        console.log(
          `[${trabalho.videoJobId}] trecho ${t.indice} na segunda chance: ` +
            (r?.erro ? `falhou de novo (${r.erro.slice(0, 120)})` : "passou")
        );
      }
    }

    // A piscina entrega fora de ordem; o app e a tela contam com a ordem dos índices.
    resultados.trechos.sort((a, b) => a.indice - b.indice);

    // OS CORTES VAO PARA O CLIENTE AGORA, sem esperar o completo.
    //
    // Medido em 01/09 no video real: cortes prontos aos 211s, completo aos
    // 1047s. O cliente esperava 14 minutos por um arquivo que nao bloqueia
    // nada do que ele quer fazer (revisar e publicar cortes). O aviso parcial
    // destrava o fluxo no app; o aviso final, com o completo, chega quando
    // chegar e se anexa sozinho ao quadro.
    if (!trabalho.soTrechos && !trabalho.soCompleto) try {
      await avisar(trabalho, {
        ok: true,
        parcial: true,
        trechos: resultados.trechos,
        capaFonte: resultados.capaFonte,
        capaFonteRecorte: resultados.capaFonteRecorte,
        avisoDeQualidade: resultados.avisoDeQualidade,
        erros: resultados.erros,
        duracaoSec: Math.round(info.duracaoSec),
      });
      marca("cortes entregues ao app");
      // Se o worker reiniciar daqui em diante, falta só o completo: o aviso de
      // reinício leva esta marca e o app pede só o completo de novo.
      trabalho.__parcialEnviado = true;
    } catch (e) {
      console.warn(`[${trabalho.videoJobId}] aviso parcial falhou: ${e?.message ?? e}`);
    }

    if (completoEmAndamento) {
      const r = await completoEmAndamento;
      if (r?.falhou) registrarFalhaDoCompleto(trabalho, resultados, r.falhou);
    }

    resultados.duracaoSec = Math.round(info.duracaoSec);
    marca("tudo pronto");
    return resultados;
  } finally {
    // O disco do contêiner é compartilhado entre trabalhos. Sem esta limpeza,
    // dois vídeos grandes seguidos enchem o disco e o terceiro falha por um
    // motivo que não tem nada a ver com ele.
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Quanto disco sobra na pasta temporaria, em GB.
 *
 * Existe desde 29/09 por causa do teto de 5 horas do Enterprise: um podcast de
 * 5 h com 3 cameras pesa perto de 27 GB, e o trabalho precisa baixar tudo antes
 * de montar. Sem este numero no /saude, a primeira pessoa a descobrir que o
 * disco nao cabe seria o cliente.
 */
async function discoLivre() {
  try {
    const s = await statfs(tmpdir());
    return {
      livreGb: Number(((s.bavail * s.bsize) / 1073741824).toFixed(1)),
      totalGb: Number(((s.blocks * s.bsize) / 1073741824).toFixed(1)),
    };
  } catch {
    return null;
  }
}

/**
 * Tira SO O AUDIO da gravacao, para a transcricao (29/09).
 *
 * A Deepgram aceita no maximo 2 GB por arquivo, e ate 29/09 esse era o teto do
 * upload. Com as gravacoes de ate 5 horas, o arquivo chega a 20 GB. O audio de
 * fala em AAC mono a 64 kbps pesa cerca de 29 MB por hora, e a Deepgram
 * transcreve igual: ela so ouve.
 *
 * Mono e 16 kHz nao, 44,1: a transcricao nao ganha nada acima de 16 kHz, mas o
 * mesmo arquivo pode servir depois para a sincronia de cameras, que ganha.
 */
async function extrairAudio(trabalho) {
  const pasta = await mkdtemp(join(tmpdir(), "demandou-audio-"));
  const t0 = Date.now();
  try {
    const fonte = join(pasta, "fonte");
    await baixarFonte(trabalho.sourceUrl, fonte);
    console.log(`[${trabalho.videoJobId}] audio: fonte baixada em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    const saida = join(pasta, "audio.m4a");
    // Assincrono, e nao execSync: 20 GB levam minutos para atravessar, e o
    // processo travado nao responderia nem ao /saude do Railway.
    await rodar(["-i", fonte, "-vn", "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", saida], {
      timeoutMs: 60 * 60 * 1000,
    });
    const { url, bytes } = await subir(saida, `audio/${trabalho.videoJobId}.m4a`, "audio/mp4", { privado: true });
    console.log(`[${trabalho.videoJobId}] audio: ${(bytes / 1048576).toFixed(0)} MB em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    return { audio: { url, bytes } };
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Avisa o app que terminou, insistindo.
 *
 * A retentativa não é zelo excessivo: o trabalho de cortar leva minutos e custa
 * CPU e transferência de verdade. Se o aviso se perder por um soluço de rede
 * entre as duas hospedagens, TUDO isso vira lixo, o cliente vê "cortando" até o
 * prazo estourar, e a única saída é refazer do zero.
 *
 * Encontrado no teste de ponta a ponta de 23/08, quando o servidor do outro
 * lado caiu no meio: o worker cortou tudo, avisou uma vez, levou "fetch
 * failed", e desistiu em silêncio.
 *
 * A espera cresce (5s, 15s, 45s, 135s) porque a falha típica aqui é um deploy
 * do app, que leva perto de um minuto. Insistir de segundo em segundo não
 * atravessaria a janela; esperar mais atravessa.
 *
 * O callback é idempotente do outro lado (ele ignora o que não está em
 * "cutting"), então repetir não estraga nada.
 */
async function avisar(trabalho, corpo) {
  // O trabalho já foi dado como interrompido no desligamento (o app recebeu
  // "reiniciado" e relançou). Um aviso de pronto atrasado deste mesmo trabalho
  // cairia em cima da nova rodada; melhor calar.
  if (trabalho?.__abandonado) return;
  const texto = JSON.stringify(corpo);
  const esperas = [5_000, 15_000, 45_000, 135_000];

  for (let tentativa = 0; ; tentativa++) {
    try {
      const res = await fetch(trabalho.callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-demandou-assinatura": assinar(texto),
        },
        body: texto,
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) return;
      // 4xx é problema do corpo ou da assinatura, e repetir não conserta.
      // 5xx e falha de rede valem retentativa.
      if (res.status < 500) {
        console.error(
          `[${trabalho.videoJobId}] callback recusado com ${res.status}, sem retentativa`
        );
        return;
      }
      throw new Error(`callback respondeu ${res.status}`);
    } catch (e) {
      if (tentativa >= esperas.length) {
        console.error(
          `[${trabalho.videoJobId}] callback falhou ${tentativa + 1} vezes, desistindo: ${e.message}`
        );
        return;
      }
      console.warn(
        `[${trabalho.videoJobId}] callback falhou (${e.message}), nova tentativa em ${esperas[tentativa] / 1000}s`
      );
      await new Promise((r) => setTimeout(r, esperas[tentativa]));
    }
  }
}

/**
 * Quantos trabalhos estao rodando agora.
 *
 * Existe porque a regra "deploy so com a fila vazia" era conferida no BANCO, e
 * o banco nao ve o `soCompleto`: o video fica em "cut" a rodada inteira. Em
 * 02/09 a checagem disse "fila vazia" e o deploy matou a rodada que eu mesmo
 * estava esperando. Quem sabe se ha trabalho em andamento e o worker.
 */
let emAndamento = 0;
// Os prints da gravação (amostras-de-tela) contam à parte (02/10): são leves e
// não podem segurar a fila de montagem, que espera o emAndamento zerar.
let amostrasEmAndamento = 0;

/**
 * OS TRABALHOS COM AVISO PENDENTE (01/10), por vídeo.
 *
 * Nasceu do incidente de 01/10: um deploy do worker reiniciou o contêiner no
 * meio de um corte, o pedido morreu sem aviso, e o vídeo do Bruno ficou mais
 * de uma hora em "cortando". O contador acima diz QUANTOS trabalhos rodam; este
 * registro diz QUAIS, e guarda como avisar cada um. Serve a duas coisas:
 *
 * - `/vivo`: o vigia do app pergunta se o corte de um vídeo ainda está aqui
 *   antes de relançar, para não cortar duas vezes;
 * - o desligamento: o que não terminar a tempo recebe o aviso "reiniciado", e
 *   o app relança na hora em vez de esperar o prazo inteiro.
 *
 * Cada entrada: { videoJobId, tipo, desde, destino, reinicio() }, onde
 * `destino` é o objeto que `avisar` recebe (marcado `__abandonado` depois do
 * aviso de reinício) e `reinicio()` monta o corpo desse aviso.
 */
const trabalhosVivos = new Map();
let proximoTrabalho = 0;
function registrarTrabalho(entrada) {
  const chave = ++proximoTrabalho;
  trabalhosVivos.set(chave, { ...entrada, desde: Date.now() });
  return () => trabalhosVivos.delete(chave);
}

/** Recebeu SIGTERM: não aceita pedido novo, espera o que está rodando. */
let desligando = false;

/**
 * Quanto esperar os trabalhos em andamento antes de avisar "reiniciado".
 *
 * O Railway manda SIGTERM e, depois de `drainingSeconds` (worker/railway.json,
 * também exposto como RAILWAY_DEPLOYMENT_DRAINING_SECONDS), SIGKILL. Sem
 * configuração o padrão é zero: o processo morre na hora e nada daqui roda, e
 * foi exatamente isso no incidente. Ficam 30 s de margem para os avisos
 * saírem antes do SIGKILL.
 */
function esperaNoDesligamentoMs() {
  const explicita = Number(process.env.WORKER_ESPERA_NO_DESLIGAMENTO_S);
  if (explicita > 0) return explicita * 1000;
  const drenagem = Number(process.env.RAILWAY_DEPLOYMENT_DRAINING_SECONDS);
  if (drenagem > 0) return Math.max(5, drenagem - 30) * 1000;
  return 870 * 1000;
}

/**
 * O aviso de reinício, com pressa: duas tentativas de 10 s. O `avisar` normal
 * insiste por até 3 minutos, o que estouraria a janela antes do SIGKILL.
 */
async function avisarReinicio(destino, corpo) {
  const texto = JSON.stringify(corpo);
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const res = await fetch(destino.callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-demandou-assinatura": assinar(texto) },
        body: texto,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok || res.status < 500) return res.ok;
    } catch (e) {
      console.warn(`[${destino.videoJobId}] aviso de reinício falhou (${e?.message ?? e})`);
    }
  }
  return false;
}

async function desligar(sinal) {
  if (desligando) return;
  desligando = true;
  const limite = Date.now() + esperaNoDesligamentoMs();
  console.log(`[desligamento] ${sinal}: sem pedidos novos; ${trabalhosVivos.size} trabalho(s) com aviso pendente, ${emAndamento} em andamento`);
  // Para de aceitar conexões novas; as abertas ainda respondem (o /saude e o
  // 503 dos pedidos novos).
  servidor.close();

  // As montagens que nem começaram não vão começar: avisa já, para o app
  // reenviar ao contêiner novo sem esperar a drenagem inteira.
  const naFila = filaDaMontagem.splice(0);
  await Promise.all(
    naFila
      .filter((t) => t.pedido.callbackUrl)
      .map((t) =>
        avisarReinicio(
          { callbackUrl: t.pedido.callbackUrl, videoJobId: t.pedido.videoJobId ?? t.pedido.chave },
          { ok: false, reiniciado: true, erro: "reiniciado", retorno: t.pedido.retorno ?? null }
        )
      )
  );

  while ((trabalhosVivos.size > 0 || emAndamento > 0) && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 1_000));
  }

  const restantes = [...trabalhosVivos.values()];
  if (restantes.length) {
    console.warn(`[desligamento] ${restantes.length} trabalho(s) não terminaram a tempo; avisando o app para relançar`);
    await Promise.all(
      restantes.map(async (t) => {
        t.destino.__abandonado = true;
        const ok = await avisarReinicio(t.destino, t.reinicio());
        console.log(`[desligamento] ${t.tipo} ${t.videoJobId}: aviso de reinício ${ok ? "entregue" : "não entregue"}`);
      })
    );
  } else {
    console.log("[desligamento] tudo terminou dentro da janela");
  }
  process.exit(0);
}
process.on("SIGTERM", () => void desligar("SIGTERM"));
process.on("SIGINT", () => void desligar("SIGINT"));

/**
 * A FILA DA MONTAGEM (30/09, primeira rodada em produção). Quatro montagens
 * chegaram juntas (uma por corte), cada uma com um Chrome de várias abas e
 * vários ffmpeg, às vezes junto do completo: o compositor do Remotion morreu
 * por memória (SIGKILL num contêiner de 7,6 GB) e dois ffmpeg morreram com
 * "Resource temporarily unavailable" (processos e threads demais).
 *
 * Agora: UMA montagem por vez, e ela só começa com o resto do worker parado
 * (cortes e completo têm prioridade, porque o cliente espera por eles). As
 * outras esperam aqui; o app já recebeu 202 e o resultado vai por callback.
 * Pedido repetido da mesma chave (o app reenvia depois do prazo) substitui o
 * que estava esperando, em vez de renderizar duas vezes.
 */
const filaDaMontagem = [];
let montagemRodando = false;
/** Renders da fila rodando agora, e as unidades que eles reservaram (só a fila paralela usa). */
let montagensRodando = 0;
let unidadesOcupadas = 0;
/** Acorda a fila paralela antes dos 10 s (pedido novo, render que terminou). */
let acordarFila = null;

/**
 * A gravação original, baixada UMA vez para todos os cortes do mesmo vídeo
 * que estão na fila (antes cada montagem baixava 1,3 GB de novo). Apagada
 * quando a fila esvazia.
 */
const PASTA_DOS_ORIGINAIS = join(tmpdir(), "montagem-originais");
const originais = new Map();
function obterOriginal(url) {
  if (!originais.has(url)) {
    const arquivo = join(PASTA_DOS_ORIGINAIS, `${createHmac("sha256", "original").update(url).digest("hex").slice(0, 16)}.mp4`);
    const pronto = mkdir(PASTA_DOS_ORIGINAIS, { recursive: true })
      .then(() => baixarQualquer(url, arquivo))
      .then(() => arquivo);
    // Download que falhou não fica no cache: a próxima montagem tenta de novo.
    pronto.catch(() => originais.delete(url));
    originais.set(url, pronto);
  }
  return originais.get(url);
}

/**
 * O CORTE NA FRENTE DO COMPLETO (04/10). A fila era por ordem de chegada: um
 * completo de 17 min (prévia e final, dezenas de minutos cada) segurava os
 * cortes de 1 min atrás dele, e o prazo do app vencia com o corte na fila.
 * Agora o corte (prioridade 0: /montar e o sob medida com `trecho`) passa na
 * frente de todo completo que ainda espera (prioridade 1). O que já está
 * rodando termina.
 */
function prioridadeDaMontagem(pedido, rota) {
  return rota === "completo" && !pedido?.trecho ? 1 : 0;
}

/**
 * O PRAZO DE UMA MONTAGEM (04/10), proporcional à duração do que se monta:
 * 20 min fixos (baixar, Chrome, subir, guarda da fala) mais `fator` segundos
 * por segundo de vídeo (8 no final, 3 na prévia de meia resolução). Medido
 * local em 04/10 com cmurtv2zg: o corte de 43 s levou 10 min (com a prévia do
 * completo rodando ao lado) e ganha 26; a prévia do completo de 17 min levou
 * 34 a 37 min e ganha 72; o final do completo (as camadas em 1080p passam de
 * uma hora na máquina local) ganha 158. Prazo curto mata render saudável;
 * prazo longo só atrasa a descoberta de um pendurado. MONTAGEM_PRAZO_FATOR
 * ajusta o fator do final sem deploy de código.
 */
export function prazoDaMontagem(pedido) {
  const dur = Number(pedido?.edicao?.duracao ?? pedido?.trecho?.duracao ?? pedido?.montagem?.duracao ?? pedido?.duracao) || 1200;
  const final = !(Number(pedido?.escala) < 1);
  const fator = final ? Number(process.env.MONTAGEM_PRAZO_FATOR) || 8 : 3;
  return Math.round((20 * 60 + dur * fator) * 1000);
}

function enfileirarMontagem(trabalho) {
  trabalho.prioridade ??= 0;
  // Só pedido com callback é substituído: o síncrono tem alguém esperando a resposta.
  const repetido = trabalho.pedido.callbackUrl
    ? filaDaMontagem.findIndex((t) => t.pedido.callbackUrl && t.pedido.chave === trabalho.pedido.chave)
    : -1;
  if (repetido >= 0) filaDaMontagem.splice(repetido, 1);
  const depois = filaDaMontagem.findIndex((t) => (t.prioridade ?? 0) > trabalho.prioridade);
  if (depois >= 0) filaDaMontagem.splice(depois, 0, trabalho);
  else filaDaMontagem.push(trabalho);
  void andarFilaDaMontagem();
}

async function andarFilaDaMontagem() {
  // Máquina maior que a de 8 vCPU / 7,6 GB: a fila paralela (abaixo). Com uma
  // unidade só, a fila serial de sempre, sem mudar uma linha.
  if (CAPACIDADE.rendersJuntos > 1) return andarFilaParalela();
  if (montagemRodando) return;
  montagemRodando = true;
  try {
    while (filaDaMontagem.length) {
      // Espera o worker esvaziar: corte ou completo rodando tem prioridade. Com
      // teto de 15 min (02/10): um trabalho preso não pode segurar a fila para sempre.
      const esperaAte = Date.now() + 15 * 60_000;
      while (emAndamento > 0 && Date.now() < esperaAte) await new Promise((r) => setTimeout(r, 10_000));
      // NUNCA DOIS RENDERS PESADOS JUNTOS (03/10, terceira volta): o completo
      // morreu por falta de memória com os cortes renderizando ao lado. Passados
      // os 15 min, só segue se houver memória para um render (3 GB); senão
      // espera mais 30 min por ela, e só então segue (com a guarda dos lotes).
      if (emAndamento > 0) {
        const ok = await esperarMemoria(3000, { ateMs: 30 * 60_000, rotulo: "fila de montagem" });
        console.error(`[montar] fila esperou por ${emAndamento} trabalho(s) em andamento; segue ${ok ? "com memória" : `com ${memoriaLivreMb()} MB livres`}`);
      }
      const trabalho = filaDaMontagem.shift();
      await trabalho.executar().catch((e) => console.error(`[montar] ${e?.message ?? e}`));
      // Respiro entre renders: o Chrome e o compositor do anterior terminam de
      // sair e devolvem a memória antes do próximo abrir.
      await new Promise((r) => setTimeout(r, 3_000));
    }
  } finally {
    montagemRodando = false;
    originais.clear();
    await rm(PASTA_DOS_ORIGINAIS, { recursive: true, force: true }).catch(() => {});
  }
}

/** Quantas unidades da máquina um render da fila reserva: o completo, todas menos uma; o corte, uma. */
function unidadesDaMontagem(trabalho) {
  return (trabalho.prioridade ?? 0) > 0 ? CAPACIDADE.unidadesDoCompleto : 1;
}

/**
 * A FILA PARALELA (05/10, máquina do plano Pro). A regra de 03/10 continua:
 * nunca dois renders pesados juntos NA MESMA UNIDADE. Cada render reserva a
 * sua fatia (capacidade.mjs) e roda com os números dela (abas, fios, lotes);
 * o próximo só começa se sobrar fatia para ele, na ordem da fila (o completo
 * na cabeça segura os de trás até caber, e os cortes sempre passam na frente
 * dele ao entrar). Os trabalhos fora da fila (cortes e completo de base) têm
 * prioridade: enquanto rodam, guardam metade das unidades para eles. E todo
 * render que começa com outro ao lado precisa de 3 GB livres por unidade.
 *
 * Quando nada da fila roda e os trabalhos não deixam fatia que baste, vale a
 * espera de sempre: até 15 min por eles, depois memória para um render.
 */
async function andarFilaParalela() {
  if (montagemRodando) {
    acordarFila?.();
    return;
  }
  montagemRodando = true;
  const dormir = (ms) =>
    new Promise((r) => {
      const t = setTimeout(r, ms);
      acordarFila = () => {
        clearTimeout(t);
        r();
      };
    });
  let esperaDesde = null;
  try {
    while (filaDaMontagem.length || montagensRodando > 0) {
      const cabeca = filaDaMontagem[0];
      if (cabeca) {
        const k = unidadesDaMontagem(cabeca);
        const reserva = emAndamento > 0 ? CAPACIDADE.unidadesDosTrabalhos : 0;
        const temFatia = CAPACIDADE.rendersJuntos - unidadesOcupadas - reserva >= k;
        const sozinho = unidadesOcupadas === 0 && emAndamento === 0;
        let pode = temFatia && (sozinho || memoriaLivreMb() >= 3000 * k);
        if (!pode && unidadesOcupadas === 0 && emAndamento > 0) {
          // A espera de sempre, sem nada da fila rodando: 15 min pelos trabalhos.
          esperaDesde ??= Date.now();
          if (Date.now() - esperaDesde >= 15 * 60_000) {
            const ok = await esperarMemoria(3000, { ateMs: 30 * 60_000, rotulo: "fila de montagem" });
            console.error(`[montar] fila esperou por ${emAndamento} trabalho(s) em andamento; segue ${ok ? "com memória" : `com ${memoriaLivreMb()} MB livres`}`);
            pode = true;
          }
        }
        if (pode && filaDaMontagem[0] === cabeca) {
          esperaDesde = null;
          filaDaMontagem.shift();
          montagensRodando++;
          unidadesOcupadas += k;
          console.log(`[montar] começa com ${k} unidade(s); ${unidadesOcupadas}/${CAPACIDADE.rendersJuntos} ocupadas, ${filaDaMontagem.length} na fila`);
          void comFatia(k, () => cabeca.executar())
            .catch((e) => console.error(`[montar] ${e?.message ?? e}`))
            // Respiro antes de soltar a fatia: o Chrome e o compositor deste
            // render terminam de sair e devolvem a memória.
            .then(() => new Promise((r) => setTimeout(r, 3_000)))
            .finally(() => {
              montagensRodando--;
              unidadesOcupadas -= k;
              acordarFila?.();
            });
          continue;
        }
      }
      await dormir(10_000);
    }
  } finally {
    montagemRodando = false;
    acordarFila = null;
    originais.clear();
    await rm(PASTA_DOS_ORIGINAIS, { recursive: true, force: true }).catch(() => {});
  }
}

const servidor = createServer((req, res) => {
  const responder = (status, corpo) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(corpo));
  };

  // O Railway checa a saúde do contêiner por aqui.
  //
  // Devolve também qual ffmpeg está instalado, porque o contêiner de produção
  // roda o do Debian (5.x) e a máquina de desenvolvimento roda o 9, e a opção
  // que passa o filtro por arquivo MUDOU DE NOME entre as duas. Sem isso a
  // diferença só apareceria como uma falha em produção que não reproduz local.
  if (req.method === "GET" && req.url === "/saude") {
    return discoLivre().then((disco) => responder(200, {
      disco,
      ok: true,
      trabalhando: emAndamento > 0 || amostrasEmAndamento > 0 || montagemRodando || filaDaMontagem.length > 0,
      // Para quem vai publicar (01/10): espere `emAndamento` e `trabalhos`
      // chegarem a zero. `desligando` diz que este contêiner já recebeu
      // SIGTERM e só termina o que tem.
      emAndamento,
      amostrasEmAndamento,
      trabalhos: trabalhosVivos.size,
      desligando,
      montagensNaFila: filaDaMontagem.length,
      ...diagnostico(),
      memoria: memoriaDoConteiner(),
      cpus: availableParallelism(),
      paralelismo: PARALELISMO,
      // Os números calculados da máquina (capacidade.mjs): unidades, a fatia
      // do corte e a do completo, e quantos renders da fila rodam agora.
      capacidade: { ...resumoDaCapacidade(), montagensRodando, unidadesOcupadas },
    }));
  }

  // /vivo (01/10): o vigia do app pergunta se o corte de um vídeo ainda roda
  // aqui antes de relançar. Assinada como o resto: a lista do que está
  // rodando é dado de cliente.
  if (req.method === "POST" && req.url?.startsWith("/vivo")) {
    const pedacos = [];
    req.on("data", (d) => pedacos.push(d));
    req.on("end", () => {
      const corpoCru = Buffer.concat(pedacos).toString("utf8");
      if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
        return responder(401, { error: "Assinatura inválida" });
      }
      let pedido;
      try {
        pedido = JSON.parse(corpoCru);
      } catch {
        return responder(400, { error: "Corpo não é JSON" });
      }
      const achado = [...trabalhosVivos.values()].find(
        (t) => t.videoJobId === pedido.videoJobId && (!pedido.tipo || t.tipo === pedido.tipo) && (!pedido.chave || t.chave === pedido.chave)
      );
      // A MONTAGEM NA FILA (04/10): o app pergunta pela `chave` antes de
      // desistir por prazo; esperando a vez aqui não é morta.
      const posicao = pedido.chave ? filaDaMontagem.findIndex((t) => t.pedido.chave === pedido.chave && (t.pedido.videoJobId ?? t.pedido.chave) === (pedido.videoJobId ?? t.pedido.videoJobId)) : -1;
      responder(200, {
        vivo: Boolean(achado),
        tipo: achado?.tipo ?? null,
        desdeSegundos: achado ? Math.round((Date.now() - achado.desde) / 1000) : null,
        prazoSegundos: achado?.prazoMs ? Math.round(achado.prazoMs / 1000) : null,
        naFila: posicao >= 0,
        posicaoNaFila: posicao >= 0 ? posicao + 1 : null,
        desligando,
      });
    });
    return;
  }

  // NO DESLIGAMENTO não entra trabalho novo: ele morreria no meio. O 503 faz
  // quem pediu tratar como "worker indisponível"; o contêiner novo já está no
  // ar e recebe o próximo pedido.
  if (desligando && req.method === "POST") {
    return responder(503, { error: "Worker reiniciando; tente de novo em instantes." });
  }

  // /contrato-pdf (05/10): imprime a página HTML do contrato com o Chrome do
  // Remotion e responde o PDF na hora (segundos). Assinada como o resto; o
  // corpo é {html, cabecalho, rodape}. Não entra na fila dos vídeos: é leve e
  // o app espera a resposta para mandar o PDF ao provedor de assinatura.
  if (req.method === "POST" && req.url?.startsWith("/contrato-pdf")) {
    const pedacos = [];
    req.on("data", (d) => pedacos.push(d));
    req.on("end", async () => {
      const corpoCru = Buffer.concat(pedacos).toString("utf8");
      if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
        return responder(401, { error: "Assinatura inválida" });
      }
      let pedido;
      try {
        pedido = JSON.parse(corpoCru);
      } catch {
        return responder(400, { error: "Corpo não é JSON" });
      }
      if (typeof pedido.html !== "string" || !pedido.html.trim()) return responder(400, { error: "Falta o html" });
      try {
        const pdf = await imprimirHtml({ html: pedido.html, cabecalho: pedido.cabecalho, rodape: pedido.rodape });
        res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": pdf.length });
        res.end(pdf);
      } catch (e) {
        console.error("[contrato-pdf] falhou:", e);
        responder(500, { error: e instanceof Error ? e.message : "falhou" });
      }
    });
    return;
  }

  const ehAudio = req.method === "POST" && req.url?.startsWith("/audio");
  // /recortar (30/09): recorta a pessoa de um quadro JÁ guardado e responde na
  // hora (poucos segundos). Serve às capas compostas em código dos vídeos que
  // foram cortados antes do quadro-da-capa existir.
  const ehRecorte = req.method === "POST" && req.url?.startsWith("/recortar");
  if (ehRecorte) {
    const pedacos = [];
    req.on("data", (d) => pedacos.push(d));
    req.on("end", async () => {
      const corpoCru = Buffer.concat(pedacos).toString("utf8");
      if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
        return responder(401, { error: "Assinatura inválida" });
      }
      let pedido;
      try {
        pedido = JSON.parse(corpoCru);
      } catch {
        return responder(400, { error: "Corpo não é JSON" });
      }
      if (!pedido.imagemUrl || !pedido.chave) return responder(400, { error: "Faltam imagemUrl ou chave" });
      const pasta = await mkdtemp(join(tmpdir(), "recorte-"));
      try {
        const arquivo = join(pasta, "quadro.jpg");
        if (pedido.imagemUrl.includes(".private.blob.")) {
          await baixarFonte(pedido.imagemUrl, arquivo);
        } else {
          const r = await fetch(pedido.imagemUrl);
          if (!r.ok) throw new Error(`imagem respondeu ${r.status}`);
          await writeFile(arquivo, Buffer.from(await r.arrayBuffer()));
        }
        const feito = await quadroDaCapa({ imagem: arquivo }, pasta, "qc");
        if (!feito) return responder(422, { error: "Não achei a pessoa no quadro" });
        const recorte = await subir(feito.recorte, pedido.chave, "image/png");
        responder(200, { recorte: { ...recorte, rosto: feito.rosto }, largura: feito.largura, altura: feito.altura });
      } catch (e) {
        responder(500, { error: e instanceof Error ? e.message : "falhou" });
      } finally {
        rm(pasta, { recursive: true, force: true }).catch(() => {});
      }
    });
    return;
  }
  // /melhor-quadro (05/10): o melhor quadro da GRAVAÇÃO como foto, escolhido
  // pelo Face Landmarker (rosto inteiro dentro, olho aberto, boca fechada, de
  // frente, nítido), e a pessoa recortada dele. Serve à arte do dia de vídeo
  // (lib/media/referencia-da-pessoa.ts), que usa o quadro SÓ como referência
  // do modelo de imagem, nunca como arte final. Síncrona como o /recortar:
  // baixa a gravação (o mesmo cache dos cortes), avalia os instantes pedidos
  // e responde em segundos. Entra {sourceUrl, instantes, chave}; sai
  // {quadro, recorte, rosto, notas, avaliados}.
  const ehMelhorQuadro = req.method === "POST" && req.url?.startsWith("/melhor-quadro");
  if (ehMelhorQuadro) {
    const pedacos = [];
    req.on("data", (d) => pedacos.push(d));
    req.on("end", async () => {
      const corpoCru = Buffer.concat(pedacos).toString("utf8");
      if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
        return responder(401, { error: "Assinatura inválida" });
      }
      let pedido;
      try {
        pedido = JSON.parse(corpoCru);
      } catch {
        return responder(400, { error: "Corpo não é JSON" });
      }
      if (!pedido.sourceUrl || !pedido.chave) return responder(400, { error: "Faltam sourceUrl ou chave" });
      const instantes = Array.isArray(pedido.instantes) ? pedido.instantes.map(Number).filter((t) => Number.isFinite(t) && t >= 0).slice(0, 40) : [];
      if (!instantes.length) return responder(400, { error: "Faltam instantes" });
      const pasta = await mkdtemp(join(tmpdir(), "melhor-quadro-"));
      emAndamento += 1;
      try {
        const fonte = join(pasta, "fonte.mp4");
        await baixarQualquer(pedido.sourceUrl, fonte);
        const escolhido = await quadroDaCapa({ video: fonte, instantes }, pasta, "mq");
        if (!escolhido) return responder(422, { error: "Nenhum quadro com rosto inteiro e olhos abertos" });
        const quadro = await subir(escolhido.quadro, `${pedido.chave}-quadro.jpg`, "image/jpeg");
        const recorte = await subir(escolhido.recorte, `${pedido.chave}-recorte.png`, "image/png");
        responder(200, {
          quadro,
          recorte,
          instante: escolhido.instante,
          rosto: escolhido.rosto,
          notas: escolhido.notas,
          avaliados: escolhido.avaliados,
          largura: escolhido.largura,
          altura: escolhido.altura,
        });
      } catch (e) {
        responder(500, { error: e instanceof Error ? e.message : "falhou" });
      } finally {
        emAndamento -= 1;
        rm(pasta, { recursive: true, force: true }).catch(() => {});
      }
    });
    return;
  }
  // /amostras-de-tela (01/10): os prints da gravação para a detecção de tela
  // compartilhada ANTES do roteiro (lib/media/telas-da-gravacao.ts). Síncrona:
  // baixa a gravação uma vez (o mesmo cache dos cortes, `obterOriginal`), tira
  // os prints pedidos e devolve em base64, junto da medida câmera/tela por
  // quadro-chave (a reserva do app quando a visão falha). Vem ANTES do
  // /quadro: o teste dele é por prefixo.
  const ehAmostrasDeTela = req.method === "POST" && req.url?.startsWith("/amostras-de-tela");
  if (ehAmostrasDeTela) {
    res.on("error", () => {});
    req.socket.on("error", () => {});
    const pedacos = [];
    req.on("data", (d) => pedacos.push(d));
    req.on("end", async () => {
      const corpoCru = Buffer.concat(pedacos).toString("utf8");
      if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
        return responder(401, { error: "Assinatura inválida" });
      }
      let pedido;
      try {
        pedido = JSON.parse(corpoCru);
      } catch {
        return responder(400, { error: "Corpo não é JSON" });
      }
      if (!pedido.sourceUrl || !Array.isArray(pedido.instantes)) return responder(400, { error: "Faltam sourceUrl ou instantes" });
      const pasta = await mkdtemp(join(tmpdir(), "amostras-"));
      amostrasEmAndamento += 1;
      try {
        const original = await obterOriginal(pedido.sourceUrl);
        const { amostrarQuadros } = await import("./amostras-de-tela.mjs");
        const quadros = await amostrarQuadros(original, pedido.instantes, pasta, { largura: pedido.largura ?? 640 });
        let medida = null;
        try {
          // A revisão visual e a demonstração (02/10) só querem os quadros.
          const { analisarCompleto } = await import("./montagem-do-completo.mjs");
          if (!pedido.semMedida) medida = await analisarCompleto(original);
        } catch (e) {
          console.error(`[amostras-de-tela] medida falhou: ${e instanceof Error ? e.message : e}`);
        }
        responder(200, { quadros, medida });
      } catch (e) {
        responder(500, { error: e instanceof Error ? e.message : "amostras falharam" });
      } finally {
        amostrasEmAndamento -= 1;
        rm(pasta, { recursive: true, force: true }).catch(() => {});
        // A gravação baixada só fica no cache se uma montagem vai usá-la já;
        // sem fila, 1,3 GB parados no disco até o cliente aprovar o roteiro
        // (pode levar dias) não valem o download que economizariam.
        if (!montagemRodando && !filaDaMontagem.length) {
          const guardado = originais.get(pedido.sourceUrl);
          originais.delete(pedido.sourceUrl);
          guardado?.then((arquivo) => rm(arquivo, { force: true })).catch(() => {});
        }
      }
    });
    return;
  }
  // /ler-video (06/10): A LEITURA DO VÍDEO, camada de medição sem IA paga
  // (src/leitura-do-video.mjs e src/leitura.py): pessoas, rostos, boca,
  // tela, quadro e movimento por amostra, mais o proxy leve (360p, 1 fps,
  // áudio) que o app manda para a visão. Síncrona, com a gravação no mesmo
  // cache dos cortes (`obterOriginal`). Medição e proxy correm juntos e cada
  // um falha sozinho: a resposta traz o que deu certo e os erros do resto.
  if (req.method === "POST" && req.url?.startsWith("/ler-video")) {
    res.on("error", () => {});
    req.socket.on("error", () => {});
    const pedacos = [];
    req.on("data", (d) => pedacos.push(d));
    req.on("end", async () => {
      const corpoCru = Buffer.concat(pedacos).toString("utf8");
      if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
        return responder(401, { error: "Assinatura inválida" });
      }
      let pedido;
      try {
        pedido = JSON.parse(corpoCru);
      } catch {
        return responder(400, { error: "Corpo não é JSON" });
      }
      if (!pedido.sourceUrl) return responder(400, { error: "Falta sourceUrl" });
      const pasta = await mkdtemp(join(tmpdir(), "leitura-"));
      amostrasEmAndamento += 1;
      const t0 = Date.now();
      const erros = [];
      const tempos = {};
      try {
        const original = await obterOriginal(pedido.sourceUrl);
        tempos.download = Date.now() - t0;
        const { cadenciaDosQuadrosChave, medirVideo, modoPelaCadencia, proxyParaVisao, TETO_DA_LEITURA_SEG } = await import("./leitura-do-video.mjs");
        const cadencia = await cadenciaDosQuadrosChave(original);
        const modo = modoPelaCadencia(cadencia);
        const ate = Math.min(Number(pedido.ate) > 0 ? Number(pedido.ate) : TETO_DA_LEITURA_SEG, TETO_DA_LEITURA_SEG);
        const chave = createHmac("sha256", "leitura").update(pedido.sourceUrl).digest("hex").slice(0, 12);
        const [medida, proxyUrl] = await Promise.all([
          (async () => {
            const t = Date.now();
            try {
              const m = await medirVideo(original, pasta, { ate, modo });
              tempos.medicao = Date.now() - t;
              return m;
            } catch (e) {
              erros.push(`medição: ${e instanceof Error ? e.message : e}`);
              return null;
            }
          })(),
          (async () => {
            if (pedido.proxy === false) return null;
            const t = Date.now();
            try {
              const arquivo = await proxyParaVisao(original, join(pasta, "proxy.mp4"), { ate, modo });
              tempos.proxy = Date.now() - t;
              const { url } = await subir(arquivo, `leitura/${chave}-proxy.mp4`, "video/mp4");
              tempos.proxyEnvio = Date.now() - t - tempos.proxy;
              return url;
            } catch (e) {
              erros.push(`proxy: ${e instanceof Error ? e.message : e}`);
              return null;
            }
          })(),
        ]);
        tempos.total = Date.now() - t0;
        responder(200, { medida, proxyUrl, cadencia: +cadencia.toFixed(2), modo, erros, tempos });
      } catch (e) {
        responder(500, { error: e instanceof Error ? e.message : "leitura falhou" });
      } finally {
        amostrasEmAndamento -= 1;
        rm(pasta, { recursive: true, force: true }).catch(() => {});
        // Mesma regra do /amostras-de-tela: a gravação só fica no cache se uma
        // montagem vai usá-la já.
        if (!montagemRodando && !filaDaMontagem.length) {
          const guardado = originais.get(pedido.sourceUrl);
          originais.delete(pedido.sourceUrl);
          guardado?.then((arquivo) => rm(arquivo, { force: true })).catch(() => {});
        }
      }
    });
    return;
  }
  // /medir-referencia (01/10): mede um vídeo de referência do nicho (cortes,
  // cena, fala, andamento e uma folha de contato para a visão) e APAGA o
  // vídeo na hora (src/medir-referencia.mjs). Síncrona, como o /recortar.
  // Vem antes do /quadro, cujo teste é por prefixo.
  if (req.method === "POST" && req.url?.startsWith("/medir-referencia")) {
    res.on("error", () => {});
    req.socket.on("error", () => {});
    const pedacos = [];
    req.on("data", (d) => pedacos.push(d));
    req.on("end", async () => {
      const corpoCru = Buffer.concat(pedacos).toString("utf8");
      if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
        return responder(401, { error: "Assinatura inválida" });
      }
      let pedido;
      try {
        pedido = JSON.parse(corpoCru);
      } catch {
        return responder(400, { error: "Corpo não é JSON" });
      }
      if (!pedido.url) return responder(400, { error: "Falta url" });
      emAndamento += 1;
      try {
        const { medirReferencia } = await import("./medir-referencia.mjs");
        const medida = await medirReferencia({ url: pedido.url, origem: pedido.origem ?? "instagram", maxSeg: Math.min(180, Math.max(10, Number(pedido.maxSeg) || 90)) });
        responder(200, { medida });
      } catch (e) {
        responder(e?.codigo === "sem-baixador" ? 501 : 500, { error: e instanceof Error ? e.message : "medida falhou", codigo: e?.codigo ?? null });
      } finally {
        emAndamento -= 1;
      }
    });
    return;
  }
  // /quadro e /emendar (29/09, item 9): a ponta do worker na abertura por IA
  // da Higgsfield. Síncronas como o /recortar: o app chama de dentro de um
  // passo da fila e espera a resposta (um quadro leva 1 s; a emenda de um
  // corte de 40 s levou 40 s no teste local). Quem gera o clipe é a
  // Higgsfield, chamada pelo app; aqui só se prepara o quadro e se emenda.
  const ehQuadro = req.method === "POST" && req.url?.startsWith("/quadro");
  const ehEmenda = req.method === "POST" && req.url?.startsWith("/emendar");
  if (ehQuadro || ehEmenda) {
    const pedacos = [];
    req.on("data", (d) => pedacos.push(d));
    req.on("end", async () => {
      const corpoCru = Buffer.concat(pedacos).toString("utf8");
      if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
        return responder(401, { error: "Assinatura inválida" });
      }
      let pedido;
      try {
        pedido = JSON.parse(corpoCru);
      } catch {
        return responder(400, { error: "Corpo não é JSON" });
      }
      if (!pedido.chave) return responder(400, { error: "Falta chave" });
      if (ehQuadro && !pedido.imagemUrl) return responder(400, { error: "Falta imagemUrl" });
      if (ehEmenda && (!pedido.corteUrl || (!pedido.aberturaUrl && !pedido.apoio?.url))) {
        return responder(400, { error: "Faltam corteUrl e ao menos aberturaUrl ou apoio.url" });
      }
      const pasta = await mkdtemp(join(tmpdir(), ehQuadro ? "quadro-" : "emenda-"));
      // Conta como trabalho em andamento: a regra de deploy só com a fila
      // vazia olha este contador, e uma emenda morta no meio desperdiça o
      // clipe que já foi pago.
      emAndamento += 1;
      try {
        if (ehQuadro) {
          const entrada = join(pasta, "entrada.jpg");
          await baixarQualquer(pedido.imagemUrl, entrada);
          const saida = join(pasta, "quadro.jpg");
          await quadroNaProporcao(entrada, saida, { proporcao: pedido.proporcao ?? "9:16", centroX: pedido.centroX });
          const quadro = await subir(saida, pedido.chave, "image/jpeg");
          return responder(200, { quadro });
        }
        let atual = join(pasta, "corte.mp4");
        await baixarQualquer(pedido.corteUrl, atual);
        let apoio = null;
        // A cena de apoio entra PRIMEIRO, no tempo do corte original; a
        // abertura vem depois e empurra tudo junto.
        if (pedido.apoio?.url) {
          const clipe = join(pasta, "apoio.mp4");
          await baixarQualquer(pedido.apoio.url, clipe);
          const comApoio = join(pasta, "com-apoio.mp4");
          apoio = await inserirCenaDeApoio(clipe, atual, comApoio, { instante: pedido.apoio.instante ?? null });
          if (apoio) atual = comApoio;
        }
        let abertura = null;
        if (pedido.aberturaUrl) {
          const clipe = join(pasta, "abertura.mp4");
          await baixarQualquer(pedido.aberturaUrl, clipe);
          const comAbertura = join(pasta, "com-abertura.mp4");
          abertura = await emendarAberturaNoCorte(clipe, atual, comAbertura, { crossfade: pedido.crossfade ?? 0.3 });
          atual = comAbertura;
        }
        const vertical = await subir(atual, pedido.chave, "video/mp4");
        responder(200, { vertical, abertura, apoio });
      } catch (e) {
        responder(500, { error: e instanceof Error ? e.message : "falhou" });
      } finally {
        emAndamento -= 1;
        rm(pasta, { recursive: true, force: true }).catch(() => {});
      }
    });
    return;
  }
  // O GÊMEO DIGITAL (01/10), ver src/gemeo.mjs:
  //   /rosto-do-gemeo  síncrona: a melhor foto, recortada no rosto (segundos);
  //   /voz-do-gemeo    síncrona: a amostra de voz em MP3 e a duração real;
  //   /juntar-gemeo    202 e callback: os pedaços do gerador num vídeo só;
  //   /treino-do-gemeo síncrona (03/10): o vídeo de treino vira vídeo
  //                    normalizado, voz, foto, quadro inteiro e as medidas
  //                    da checagem automática (rosto e áudio).
  // Tudo do gêmeo vai para o store PRIVADO: rosto, voz e o vídeo final são
  // matéria-prima do cliente até ele aprovar, como a gravação enviada.
  const ehRostoDoGemeo = req.method === "POST" && req.url?.startsWith("/rosto-do-gemeo");
  const ehVozDoGemeo = req.method === "POST" && req.url?.startsWith("/voz-do-gemeo");
  const ehJuntarGemeo = req.method === "POST" && req.url?.startsWith("/juntar-gemeo");
  const ehTreinoDoGemeo = req.method === "POST" && req.url?.startsWith("/treino-do-gemeo");
  if (ehRostoDoGemeo || ehVozDoGemeo || ehJuntarGemeo || ehTreinoDoGemeo) {
    res.on("error", () => {});
    req.socket.on("error", () => {});
    const pedacos = [];
    req.on("data", (d) => pedacos.push(d));
    req.on("end", async () => {
      const corpoCru = Buffer.concat(pedacos).toString("utf8");
      if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
        return responder(401, { error: "Assinatura inválida" });
      }
      let pedido;
      try {
        pedido = JSON.parse(corpoCru);
      } catch {
        return responder(400, { error: "Corpo não é JSON" });
      }
      if (!pedido.chave) return responder(400, { error: "Falta chave" });
      const gemeo = await import("./gemeo.mjs");
      if (ehTreinoDoGemeo) {
        if (!pedido.videoUrl || !pedido.prefixo) return responder(400, { error: "Faltam videoUrl ou prefixo" });
        const pasta = await mkdtemp(join(tmpdir(), "gemeo-treino-"));
        emAndamento += 1;
        try {
          responder(200, await gemeo.treinoDoGemeo(pedido, pasta, { baixar: baixarQualquer, subir }));
        } catch (e) {
          responder(500, { error: e instanceof Error ? e.message : "falhou" });
        } finally {
          emAndamento -= 1;
          rm(pasta, { recursive: true, force: true }).catch(() => {});
        }
        return;
      }
      if (ehJuntarGemeo) {
        if (!Array.isArray(pedido.pedacos) || !pedido.pedacos.length || !pedido.callbackUrl) {
          return responder(400, { error: "Faltam pedacos ou callbackUrl" });
        }
        responder(202, { aceito: true, chave: pedido.chave });
        const pasta = await mkdtemp(join(tmpdir(), "gemeo-juntar-"));
        emAndamento += 1;
        const destino = { callbackUrl: pedido.callbackUrl, videoJobId: pedido.chave };
        const soltar = registrarTrabalho({
          videoJobId: pedido.chave,
          tipo: "juntar-gemeo",
          destino,
          reinicio: () => ({ ok: false, reiniciado: true, erro: "reiniciado", retorno: pedido.retorno ?? null }),
        });
        try {
          const feito = await gemeo.juntarPedacos(pedido, pasta, { baixar: baixarQualquer });
          const video = await subir(feito.arquivo, pedido.chave, "video/mp4", { privado: true });
          await avisar(destino, { ok: true, video, duracaoSec: feito.duracaoSec, largura: feito.largura, altura: feito.altura, retorno: pedido.retorno ?? null });
        } catch (e) {
          const mensagem = e instanceof Error ? e.message : "junção do gêmeo falhou";
          console.error(`[juntar-gemeo ${pedido.chave}] ${mensagem}`);
          await avisar(destino, { ok: false, erro: mensagem, retorno: pedido.retorno ?? null }).catch(() => {});
        } finally {
          soltar();
          emAndamento -= 1;
          rm(pasta, { recursive: true, force: true }).catch(() => {});
        }
        return;
      }
      if (ehRostoDoGemeo && !(Array.isArray(pedido.fotos) && pedido.fotos.length)) return responder(400, { error: "Faltam fotos" });
      if (ehVozDoGemeo && !pedido.audioUrl) return responder(400, { error: "Falta audioUrl" });
      const pasta = await mkdtemp(join(tmpdir(), ehRostoDoGemeo ? "gemeo-rosto-" : "gemeo-voz-"));
      emAndamento += 1;
      try {
        const feito = ehRostoDoGemeo
          ? await gemeo.fotoDoGerador(pedido, pasta, { baixar: baixarQualquer, subir })
          : await gemeo.vozDoGemeo(pedido, pasta, { baixar: baixarQualquer, subir });
        responder(200, feito);
      } catch (e) {
        responder(500, { error: e instanceof Error ? e.message : "falhou" });
      } finally {
        emAndamento -= 1;
        rm(pasta, { recursive: true, force: true }).catch(() => {});
      }
    });
    return;
  }
  // /analisar-completo e /montar-completo (30/09): o VÍDEO COMPLETO EDITADO
  // (src/montagem-do-completo.mjs). Vêm ANTES do /montar porque o teste dele é
  // por prefixo e "/montar-completo" também começa com "/montar".
  //   /analisar-completo  síncrona: baixa o completo, separa câmera de tela
  //                       pelos quadros-chave e responde (~1 min);
  //   /montar-completo    202 e callback, na MESMA fila de uma montagem por
  //                       vez dos cortes (o Chrome não cabe duas vezes).
  const ehAnaliseDoCompleto = req.method === "POST" && req.url?.startsWith("/analisar-completo");
  const ehMontagemDoCompleto = req.method === "POST" && req.url?.startsWith("/montar-completo");
  if (ehAnaliseDoCompleto || ehMontagemDoCompleto) {
    res.on("error", () => {});
    req.socket.on("error", () => {});
    const pedacos = [];
    req.on("data", (d) => pedacos.push(d));
    req.on("end", async () => {
      const corpoCru = Buffer.concat(pedacos).toString("utf8");
      if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
        return responder(401, { error: "Assinatura inválida" });
      }
      let pedido;
      try {
        pedido = JSON.parse(corpoCru);
      } catch {
        return responder(400, { error: "Corpo não é JSON" });
      }
      if (!pedido.completoUrl) return responder(400, { error: "Falta completoUrl" });
      if (ehAnaliseDoCompleto) {
        const pasta = await mkdtemp(join(tmpdir(), "analise-"));
        emAndamento += 1;
        try {
          const arquivo = join(pasta, "completo.mp4");
          await baixarQualquer(pedido.completoUrl, arquivo);
          const { analisarCompleto } = await import("./montagem-do-completo.mjs");
          responder(200, await analisarCompleto(arquivo));
        } catch (e) {
          responder(500, { error: e instanceof Error ? e.message : "análise falhou" });
        } finally {
          emAndamento -= 1;
          rm(pasta, { recursive: true, force: true }).catch(() => {});
        }
        return;
      }
      // O EDITOR SOB MEDIDA (03/10) chega pela mesma porta, com `edicao` no
      // lugar de `montagem` (src/edicao-sob-medida.mjs), e a mesma fila.
      if (!pedido.chave || !(pedido.montagem || pedido.edicao) || !pedido.callbackUrl) {
        return responder(400, { error: "Faltam chave, montagem (ou edicao) ou callbackUrl" });
      }
      responder(202, { aceito: true, chave: pedido.chave, naFila: filaDaMontagem.length + (montagemRodando ? 1 : 0) });
      enfileirarMontagem({
        pedido,
        prioridade: prioridadeDaMontagem(pedido, "completo"),
        executar: async () => {
          const pasta = await mkdtemp(join(tmpdir(), "completo-editado-"));
          emAndamento += 1;
          const inicio = Date.now();
          const destino = { callbackUrl: pedido.callbackUrl, videoJobId: pedido.videoJobId ?? pedido.chave };
          const prazoMs = prazoDaMontagem(pedido);
          const soltar = registrarTrabalho({
            videoJobId: destino.videoJobId,
            tipo: "montar-completo",
            chave: pedido.chave,
            prazoMs,
            destino,
            reinicio: () => ({ ok: false, reiniciado: true, erro: "reiniciado", retorno: pedido.retorno ?? null }),
          });
          try {
            // O PRAZO DO TRABALHO (04/10): estourado, os processos dele morrem
            // e o erro vai ao app pelo callback; a fila anda.
            const { feito, montado, guarda } = await comPrazoDoTrabalho(prazoMs, pedido.edicao ? "o render da edição sob medida" : "o render do completo", async () => {
              let feito;
              if (pedido.edicao) {
                const { montarSobMedida } = await import("./edicao-sob-medida.mjs");
                feito = await montarSobMedida(pedido, pasta, { baixar: baixarQualquer });
              } else {
                const { montarCompleto } = await import("./montagem-do-completo.mjs");
                feito = await montarCompleto(pedido, pasta, { baixar: baixarQualquer });
              }
              let montado = await subir(feito.arquivo, pedido.chave, "video/mp4");
              // A GUARDA NA SAÍDA (03/10, src/guarda-da-fala.mjs): só no render
              // final (o app manda `guardaDaFala`). A abertura e o gancho repetem
              // uma frase de propósito e ficam protegidos.
              const inicioProtegido = (feito.aberturaSeg ?? 0) + (feito.ganchoSeg ?? 0);
              const guarda = await guardarFala({
                arquivo: feito.arquivo,
                montado,
                guarda: pedido.guardaDaFala,
                protegido: inicioProtegido > 0 ? [{ de: 0, ate: inicioProtegido + 0.3 }] : [],
                pasta,
                chave: pedido.chave,
                subir,
                assinar,
              });
              montado = guarda.montado;
              return { feito, montado, guarda };
            });
            await avisar(destino, {
              ok: true,
              montado,
              guardaDaFala: guarda.relatorio,
              tempos: feito.tempos,
              janelas: feito.janelas,
              fracaoDeJanela: feito.fracaoDeJanela,
              // A conferência depois do render (02/10): o que foi achado vazio e consertado.
              conferencia: feito.conferencia ?? null,
              aberturaSeg: feito.aberturaSeg ?? 0,
              segundos: Math.round((Date.now() - inicio) / 1000),
              retorno: pedido.retorno ?? null,
            });
          } catch (e) {
            const mensagem = e instanceof Error ? e.message : "montagem do completo falhou";
            console.error(`[montar-completo ${pedido.chave}] ${mensagem}`);
            await avisar(destino, { ok: false, erro: mensagem, retorno: pedido.retorno ?? null }).catch(() => {});
          } finally {
            soltar();
            emAndamento -= 1;
            await rm(pasta, { recursive: true, force: true }).catch(() => {});
          }
        },
      });
    });
    return;
  }
  // /montar (30/09): o EDITOR COMPLETO. Recebe o plano de montagem já
  // resolvido pelo app (lib/media/plano-de-montagem.ts) e renderiza com o
  // Remotion (src/montagem.mjs). Assinada como as outras. Com `callbackUrl`
  // responde 202 e avisa no fim, como o /cortar (a montagem de um corte de
  // 40 s passa de 2 min); sem ela, responde quando acabar (prova e refação).
  const ehMontagem = req.method === "POST" && req.url?.startsWith("/montar");
  if (ehMontagem) {
    // Resposta síncrona de minutos: se quem chamou desistiu, responder num
    // socket fechado não pode derrubar o worker (EPIPE visto no teste local).
    res.on("error", () => {});
    req.socket.on("error", () => {});
    const pedacos = [];
    req.on("data", (d) => pedacos.push(d));
    req.on("end", async () => {
      const corpoCru = Buffer.concat(pedacos).toString("utf8");
      if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
        return responder(401, { error: "Assinatura inválida" });
      }
      let pedido;
      try {
        pedido = JSON.parse(corpoCru);
      } catch {
        return responder(400, { error: "Corpo não é JSON" });
      }
      if (!pedido.chave || !pedido.montagem || (!pedido.narradorUrl && !pedido.sourceUrl)) {
        return responder(400, { error: "Faltam chave, montagem e narradorUrl ou sourceUrl" });
      }
      const assincrono = Boolean(pedido.callbackUrl);
      if (assincrono) responder(202, { aceito: true, chave: pedido.chave, naFila: filaDaMontagem.length + (montagemRodando ? 1 : 0) });
      enfileirarMontagem({ pedido, prioridade: prioridadeDaMontagem(pedido, "corte"), executar: () => executarMontagem(pedido, assincrono) });
    });
    return;
  }
  async function executarMontagem(pedido, assincrono) {
      const pasta = await mkdtemp(join(tmpdir(), "montagem-"));
      emAndamento += 1;
      const inicio = Date.now();
      // Só a montagem com aviso entra no registro: a síncrona tem alguém
      // esperando a resposta, e quem espera vê a conexão cair.
      const destino = { callbackUrl: pedido.callbackUrl, videoJobId: pedido.videoJobId ?? pedido.chave };
      const prazoMs = prazoDaMontagem(pedido);
      const soltar = assincrono
        ? registrarTrabalho({
            videoJobId: destino.videoJobId,
            tipo: "montar",
            chave: pedido.chave,
            prazoMs,
            destino,
            reinicio: () => ({ ok: false, reiniciado: true, erro: "reiniciado", retorno: pedido.retorno ?? null }),
          })
        : () => {};
      try {
        const { montado, tempos, guarda } = await comPrazoDoTrabalho(prazoMs, "o render do corte", async () => {
          const { montar } = await import("./montagem.mjs");
          const { arquivo, tempos, ganchoSeg } = await montar(pedido, pasta, { baixar: baixarQualquer, obterOriginal });
          let montado = await subir(arquivo, pedido.chave, "video/mp4");
          // A GUARDA NA SAÍDA (03/10): o corte montado conferido pela fala do
          // próprio arquivo antes de ir ao cliente (src/guarda-da-fala.mjs).
          const guarda = await guardarFala({
            arquivo,
            montado,
            guarda: pedido.guardaDaFala,
            protegido: ganchoSeg ? [{ de: 0, ate: ganchoSeg + 0.3 }] : [],
            pasta,
            chave: pedido.chave,
            subir,
            assinar,
          });
          montado = guarda.montado;
          return { montado, tempos, guarda };
        });
        // `retorno` volta como veio: o app manda nele o corte e o estado que
        // pediu, e o callback (assinado no corpo) só age se ainda casar.
        const resultado = { ok: true, montado, tempos, guardaDaFala: guarda.relatorio, segundos: Math.round((Date.now() - inicio) / 1000), retorno: pedido.retorno ?? null };
        if (assincrono) await avisar(destino, resultado);
        else responder(200, resultado);
      } catch (e) {
        const mensagem = e instanceof Error ? e.message : "montagem falhou";
        console.error(`[montar ${pedido.chave}] ${mensagem}`);
        if (assincrono) await avisar(destino, { ok: false, erro: mensagem, retorno: pedido.retorno ?? null }).catch(() => {});
        else responder(500, { error: mensagem });
      } finally {
        soltar();
        emAndamento -= 1;
        await rm(pasta, { recursive: true, force: true }).catch(() => {});
      }
  }
  if (!ehAudio && (req.method !== "POST" || !req.url?.startsWith("/cortar"))) {
    return responder(404, { error: "Not found" });
  }

  const pedacos = [];
  req.on("data", (d) => pedacos.push(d));
  req.on("end", async () => {
    const corpoCru = Buffer.concat(pedacos).toString("utf8");

    if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
      return responder(401, { error: "Assinatura inválida" });
    }

    let trabalho;
    try {
      trabalho = JSON.parse(corpoCru);
    } catch {
      return responder(400, { error: "Corpo não é JSON" });
    }
    if (!trabalho.videoJobId || !trabalho.sourceUrl || !trabalho.callbackUrl) {
      return responder(400, { error: "Faltam videoJobId, sourceUrl ou callbackUrl" });
    }

    // Responde ANTES de trabalhar. O app não pode ficar segurando uma requisição
    // por vários minutos: é a mesma armadilha que derrubou a seleção de trechos.
    responder(202, { aceito: true, videoJobId: trabalho.videoJobId });

    emAndamento += 1;
    // O aviso de reinício leva o que o app precisa para retomar do ponto
    // certo: o corte inteiro, só o completo (os cortes já foram), ou o
    // recorte de um trecho.
    const soltar = registrarTrabalho({
      videoJobId: trabalho.videoJobId,
      tipo: ehAudio ? "audio" : "cortar",
      destino: trabalho,
      reinicio: () => ({
        ok: false,
        reiniciado: true,
        erro: "reiniciado",
        soCompleto: Boolean(trabalho.soCompleto),
        soTrechos: Boolean(trabalho.soTrechos),
        reCorte: Boolean(trabalho.reCorte),
        parcialEnviado: Boolean(trabalho.__parcialEnviado),
        indices: (trabalho.trechos ?? []).map((t) => t.indice),
        retorno: trabalho.retorno ?? null,
      }),
    });
    try {
      // TRABALHO FALSO, só para a prova local do desligamento (01/10): com
      // WORKER_TRABALHO_FALSO=1 (nunca ligado em produção) o pedido com
      // `falsoSegundos` só espera, sem baixar nem cortar nada.
      const falso = process.env.WORKER_TRABALHO_FALSO === "1" && Number(trabalho.falsoSegundos) > 0;
      const resultados = falso
        ? await new Promise((ok) => setTimeout(() => ok({ trechos: [], falso: true }), Number(trabalho.falsoSegundos) * 1000))
        : ehAudio
          ? await extrairAudio(trabalho)
          : await processar(trabalho);
      await avisar(trabalho, { ok: true, ...resultados });
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Falha no processamento";
      console.error(`[${trabalho.videoJobId}] ${mensagem}`);
      // `trabalho`, e não `pedido`: neste escopo não existe `pedido`, e a
      // ReferenceError aqui dentro do catch derrubava o processo inteiro
      // (rejeição sem tratamento) justo quando um corte falhava.
      await avisar(trabalho, { ok: false, erro: mensagem, retorno: trabalho.retorno ?? null }).catch(() => {});
    } finally {
      soltar();
      emAndamento -= 1;
    }
  });
});

servidor.listen(PORTA, () => {
  console.log(`worker de vídeo ouvindo na porta ${PORTA}`);
});
