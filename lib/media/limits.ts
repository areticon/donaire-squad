/**
 * Limites do upload de vídeo, e o porquê de cada número.
 *
 * Medido em 18/08/2026 numa gravação real do OBS com as configurações padrão:
 * 92,53 MB para 47 segundos, ou seja 118 MB por minuto (16,2 Mbps). Nessa taxa
 * um vídeo de 20 minutos custa R$ 4,93 para processar contra R$ 6,00 de receita,
 * 18% de margem, e um de 60 minutos daria 6,92 GB, que o próprio limite de
 * tamanho rejeitaria.
 *
 * A mesma conta a 4 Mbps derruba o custo para R$ 2,20 e a margem sobe para 63%.
 * O bitrate de gravação é a variável que mais mexe na margem do produto de
 * vídeo, mais que a duração, e é a única otimização que não exige transcodificar
 * nada: o navegador já sabe a duração e o tamanho antes de enviar.
 *
 * Onde o custo mora, e é contraintuitivo: não é a transcrição nem a IA, é a
 * transferência. Blob acima de 512 MB nunca entra em cache, então todo acesso
 * paga, e store privado paga duas vezes, porque a função busca no store e depois
 * entrega ao navegador.
 */

/** 40 MB por minuto equivale a cerca de 5,3 Mbps. */
export const MAX_MB_POR_MINUTO = 40;

/** O que a gente recomenda gravar, que é onde a margem fica saudável. */
export const MB_POR_MINUTO_RECOMENDADO = 30; // 4 Mbps

/** 60 minutos consomem 180 créditos, 10% do plano Pro. */
export const MAX_DURACAO_SEGUNDOS = 60 * 60;

/** Teto absoluto do arquivo. Acima disso o upload nem começa. */
export const MAX_BYTES = 2 * 1024 * 1024 * 1024;

export const TIPOS_ACEITOS = [
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
];

/**
 * Limite duro de caracteres do X. Post acima disso é recusado na publicação.
 *
 * Mora aqui, e não junto do redator, porque a tela de aprovação precisa dele
 * para avisar antes de o cliente tentar publicar. O módulo do redator importa
 * o cliente do Claude, que importa o Prisma, que arrasta o driver do Postgres
 * para o bundle do navegador e quebra o build.
 */
export const MAX_X = 280;

/** Créditos do trabalho: 2 por minuto de vídeo mais 4 por clipe entregue. */
export const CREDITOS_POR_MINUTO = 2;
export const CREDITOS_POR_CLIPE = 4;

/** Quantos clipes um vídeo dessa duração rende. Sublinear de propósito: */
/** momento bom não escala junto com o tempo de gravação. */
export function clipesEstimados(duracaoSegundos: number): number {
  const minutos = duracaoSegundos / 60;
  return Math.max(3, Math.min(Math.round(minutos / 4), 15));
}

export function creditosEstimados(duracaoSegundos: number): number {
  const minutos = Math.ceil(duracaoSegundos / 60);
  return minutos * CREDITOS_POR_MINUTO + clipesEstimados(duracaoSegundos) * CREDITOS_POR_CLIPE;
}

export type Veredito =
  | { ok: true; mbPorMinuto: number; creditos: number }
  | { ok: false; motivo: string; dica?: string };

/**
 * Roda no navegador, antes de subir um byte. O navegador já sabe a duração
 * (metadados do elemento video) e o tamanho do arquivo, então dá para recusar
 * na hora, com instrução, em vez de deixar a pessoa esperar 45 minutos de
 * upload para descobrir que não serve.
 */
export function validarVideo(bytes: number, duracaoSegundos: number): Veredito {
  if (!duracaoSegundos || !Number.isFinite(duracaoSegundos)) {
    return {
      ok: false,
      motivo: "Não consegui ler a duração desse arquivo.",
      dica: "Tente exportar em MP4. Alguns arquivos gravados por tela vêm sem os metadados de duração.",
    };
  }

  if (duracaoSegundos > MAX_DURACAO_SEGUNDOS) {
    const min = Math.round(duracaoSegundos / 60);
    return {
      ok: false,
      motivo: `Esse vídeo tem ${min} minutos, e o limite é de 60.`,
      dica: "Vídeo mais longo não rende mais conteúdo bom, rende mais repetição. Corte no trecho mais forte e envie de novo.",
    };
  }

  const mbPorMinuto = bytes / 1048576 / (duracaoSegundos / 60);

  // O bitrate vem antes do tamanho de propósito. Quando os dois estouram, e é
  // o caso comum de quem grava no padrão do OBS, o tamanho é sintoma e o
  // bitrate é a causa. Dizer "o arquivo tem 2,31 GB" não diz o que fazer;
  // dizer "abaixe para 4000 Kbps" diz.
  if (mbPorMinuto > MAX_MB_POR_MINUTO) {
    return {
      ok: false,
      motivo: `Esse vídeo está gravado a ${((mbPorMinuto * 8) / 60).toFixed(1)} Mbps, bem acima do necessário para alguém falando.`,
      dica: "No OBS: Configurações, Saída, Taxa de bits do vídeo, coloque 4000 Kbps. O arquivo fica umas 4 vezes menor, sobe em segundos e a imagem continua igual.",
    };
  }

  if (bytes > MAX_BYTES) {
    return {
      ok: false,
      motivo: `O arquivo tem ${(bytes / 1073741824).toFixed(2)} GB, e o limite é 2 GB.`,
      dica: "Grave a 4000 Kbps no OBS (Configurações, Saída, Taxa de bits do vídeo), ou envie um trecho mais curto.",
    };
  }

  return {
    ok: true,
    mbPorMinuto,
    creditos: creditosEstimados(duracaoSegundos),
  };
}
