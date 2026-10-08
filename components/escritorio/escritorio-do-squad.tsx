"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { AnimadorDoBoneco, BonecoDeMassinha } from "@/components/escritorio/boneco-de-massinha";
import {
  APARENCIA_DOS_AGENTES,
  APARENCIA_PADRAO_DO_USUARIO,
  type Aparencia,
} from "@/lib/squad/aparencia-do-boneco";
import { AGENTES, AGENTE_DEV, type Cena, type EstadoDoAgente, type SituacaoDoSquad } from "@/lib/squad/estado-do-squad";
import { MenuDoAgente, type Turno } from "@/components/escritorio/menu-do-agente";
import { BotaoDescartar } from "@/components/ui/descartar";
import { arteDoAgente } from "@/lib/squad/estado-do-squad";

/**
 * O escritório do squad, em 3D.
 *
 * ## O que é (segunda versão, 18/09 à noite)
 *
 * Um escritório de verdade, com corredores: duas fileiras de mesas viradas
 * para a câmera, um robô sentado em cada uma, e **a nossa mesa** na frente,
 * de costas para a câmera, que é de onde a pessoa olha. O Bruno reprovou a
 * primeira versão (mesas em arco, coladas, robôs de pé) com três pedidos:
 * espalhar com corredores, todo agente sentado enquanto trabalha, e o
 * trabalho sendo LEVADO de mesa em mesa até chegar em nós.
 *
 * ## O que se vê
 *
 * - quem está com o bastão trabalha sentado, monitor aceso, anel girando, e
 *   um **balão de fala** com o que ele está fazendo agora;
 * - quando termina, levanta, **anda até a mesa do próximo**, entrega, e volta
 *   a sentar; o Paulo, o último, anda até a nossa mesa;
 * - a plaqueta é a placa de mesa: nome, papel e a situação em uma linha;
 * - clicar na mesa ou na plaqueta abre a ficha do agente.
 *
 * ## O peso, e por que ele cabe
 *
 * UM modelo CC0 de 464 KB (o Robot Expressive do three.js), recolorido sete
 * vezes pelo material "Main". Three, R3F e drei entram por `next/dynamic`,
 * só nesta aba.
 *
 * ## O que este arquivo NÃO sabe
 *
 * Não sabe o que é card, log ou esteira. Recebe a `SituacaoDoSquad` pronta
 * (`lib/squad/estado-do-squad.ts`) e desenha.
 */

// Desde 28/09 os agentes são bonecos de massinha montados por partes
// (boneco-de-massinha.tsx), com 1,15 de altura em escala 1. A constante
// guarda o nome antigo porque as contas de escala da cena partem dela.
// 1,2: o boneco precisa de rosto visível da câmera isométrica, que fica longe.
const ESCALA_DO_ROBO = 1.2;
const ALTURA_DO_ASSENTO = 0.4;
const VELOCIDADE = 2.6;

/**
 * VOCÊ, e o que muda quando o avatar deixa de ser enfeite.
 *
 * Até 18/09 o nosso avatar era presença: sentava de costas na nossa mesa e
 * ficava lá. Agora ele anda, e isso trouxe números próprios.
 */
/** Você é 12% maior que eles. É uma das quatro marcas de que não é funcionário. */
const MINHA_ESCALA = ESCALA_DO_ROBO * 1.12;
const MINHA_VELOCIDADE = 3.2;
/**
 * A que distância de um agente o menu pode abrir, e a que distância ele fecha.
 *
 * 1,9 é pouco mais que a largura de uma mesa (1,8): perto o bastante para
 * dizer "estou falando COM ELE" e não com a fileira. Sair custa 2,4, e a folga
 * entre os dois números é o que impede o menu de piscar quando o avatar para
 * exatamente na borda.
 */
const ALCANCE = 1.9;
const ALCANCE_SAIDA = 2.4;
/** O corpo do robô, para a conta de não atravessar móvel. */
const CORPO = 0.3;

/**
 * A PLANTA DE 29/09: uma mesa comprida, a sala da Vera e a sua sala.
 *
 * Pedido do Bruno: "ao invés de várias mesas, apenas uma mesa comprida com
 * todos trabalhando juntos, uma sala para a Vera e para o avatar do usuário".
 * Com o squad de onze (um especialista por rede), sete baias não cabiam mais, e
 * a cena quebrava ao ler a oitava mesa que não existia.
 *
 * - A MESA COMPRIDA fica no fundo, de frente para a câmera: os dez agentes
 *   sentam lado a lado, na ordem do bastão, e o corredor de trás é por onde
 *   eles andam sem atravessar a mesa.
 * - A SALA DA VERA (direita) e A SUA SALA (esquerda) são de vidro, na frente,
 *   com porta virada para o café, que fica no meio.
 *
 * `MESAS` continua indexado por `AGENTES`: é o lugar de cada um, seja uma
 * cadeira da mesa comprida, seja a mesa da Vera.
 */
/**
 * MESA DUPLA desde 29/09 (pedido do Bruno): cinco agentes de cada lado, um de
 * frente para o outro, como um time trabalhando junto. O lado do fundo olha
 * para a câmera; o da frente fica de costas para ela, de frente para o colega.
 */
const MESA_COMPRIDA = { x: 0, z: -4.2, larg: 12.6, prof: 1.6 } as const;
const ESPACO_NA_MESA = 2.4;
/** O corredor atrás das cadeiras do fundo, por onde se chega a elas. */
const CORREDOR_Z = -6.2;
/** As pontas da mesa, por onde se entra e sai do corredor. */
const PONTA_X = 7.75;

/** As duas salas de vidro. A porta é um vão na parede virada para o café. */
const SALA_DA_VERA = { x0: 3.6, x1: 8.4, z0: -0.9, z1: 3.8, portaZ: [0.4, 1.6] as [number, number], ladoDaPorta: 3.6 };
const SUA_SALA = { x0: -8.4, x1: -3.6, z0: -0.9, z1: 3.8, portaZ: [0.4, 1.6] as [number, number], ladoDaPorta: -3.6 };
const MESA_DA_VERA = { x: 6.0, z: 1.1 };

/**
 * O POSTO de cada um: o ponto do tampo onde fica o notebook dele. Na ordem do
 * bastão, alternando lado: o 1º no fundo, o 2º de frente para ele, e assim
 * por diante, então quem passa o bastão entrega para quem está do outro lado.
 */
const LADO: Array<"fundo" | "frente"> = [];
const MESAS: { x: number; z: number }[] = (() => {
  let k = 0;
  const porLado = Math.ceil((AGENTES.length - 1) / 2);
  return AGENTES.map((a, i) => {
    if (a.id === "vera-veredito") {
      LADO[i] = "fundo";
      return MESA_DA_VERA;
    }
    const coluna = Math.floor(k / 2);
    const lado = k % 2 === 0 ? "fundo" : "frente";
    LADO[i] = lado;
    k += 1;
    const x = -((porLado - 1) * ESPACO_NA_MESA) / 2 + coluna * ESPACO_NA_MESA;
    return { x, z: MESA_COMPRIDA.z + (lado === "fundo" ? -0.45 : 0.45) };
  });
})();
/**
 * A BAIA DO DEV DA DEMANDOU (06/10/2026), pedido do Bruno: "cria mais um
 * boneco que é dev; ele pode trabalhar numa baia também, só que ele trabalha
 * para a Demandou". Fica FORA de `AGENTES` (não tem bastão, não entra na mesa
 * comprida nem no café): ganha o índice seguinte em `MESAS`, uma mesa própria
 * dentro da baia de divisórias que saiu de cena em 29/09, na frente, entre o
 * sofá do café e a sala da Vera, com a placa da Demandou.
 */
const INDICE_DO_DEV = AGENTES.length;
const MESA_DO_DEV = { x: 2.3, z: 3.55 };
MESAS[INDICE_DO_DEV] = MESA_DO_DEV;
LADO[INDICE_DO_DEV] = "fundo";
const FALA_DO_DEV = "Lendo o que os clientes pediram esta semana.";
const ehDaMesaComprida = (i: number) => i < AGENTES.length && AGENTES[i]?.id !== "vera-veredito";
/** 1 para quem olha para a câmera (fundo), −1 para quem fica de costas (frente). */
const sentidoDe = (i: number) => (LADO[i] === "frente" ? -1 : 1);

// A sua mesa, dentro da sua sala. Você senta de frente para a câmera desde
// 29/09: com sala própria, o que se quer ver é o seu boneco, não as suas costas.
const NOSSA_MESA = { x: -6.0, z: 1.1 };

/**
 * O CANTO DO CAFÉ, pedido do Bruno em 18/09: "coloque uma mesa de café, deixe
 * eles conversarem no café quando estiverem sem trabalho".
 *
 * Fica no lado oposto à planta, fora do corredor central, para quem atravessa
 * a sala levando trabalho não passar por dentro da roda de conversa.
 */
// Em x=-7,6 a mesa ficava FORA do enquadramento, e quem ia tomar café saía de
// cena (visto na tela logada em 18/09): um agente que desaparece da tela lê
// como defeito, não como pausa.
// No meio, entre as duas salas, desde 29/09.
const CAFE = { x: 0, z: 1.2 };
/**
 * O EFEITO DO CAFE, pedido do Bruno em 19/09: "quando eles tomam cafe devem
 * ficar mais rapidos". Vale para voce e para os agentes.
 *
 * 1,6x e visivel sem virar desenho animado; 60 s e tempo de a pessoa notar
 * que passou. O selo "☕" fica no ar enquanto dura, senao o turbo parece
 * defeito de velocidade.
 */
const TURBO_DO_CAFE = 1.6;
const CAFE_DURA_MS = 60_000;
/** Onde VOCE fica ao tomar cafe: o lado da mesa virado para a camera. */
const MEU_LUGAR_NO_CAFE = new THREE.Vector3(CAFE.x, 0, CAFE.z + 1.05);
/** Onde cada um fica em volta da mesa. Três lugares: mais que isso vira fila. */
const LUGARES_NO_CAFE: Array<[number, number]> = [
  [-0.85, 0.2],
  [0.85, 0.2],
  [0, -0.85],
];

/**
 * O que se diz no café.
 *
 * São falas de BASTIDOR, de propósito: nenhuma afirma um fato sobre o
 * trabalho, sobre números ou sobre o cliente. Um agente que "opina" sobre
 * dados na tela vira uma fonte a mais de coisa inventada, e o produto inteiro
 * é construído contra isso. Aqui eles falam do ofício, e só.
 */
const PAPO_DE_CAFE: Record<string, string[]> = {
  "roberto-radar": ["Achei três fontes boas hoje. Duas eram a mesma notícia.", "Dado sem fonte não sai de mim.", "Passei a manhã cavando."],
  "lucas-linkedin": ["Cortei metade do que escrevi. Ficou melhor.", "Gancho bom é o que dói um pouco.", "Reescrevi o primeiro parágrafo quatro vezes."],
  "xavier-x": ["280 caracteres educam qualquer um.", "Thread boa começa brigando.", "Cortei um tweet inteiro e ninguém sentiu falta."],
  "igor-instagram": ["Se não para o polegar, não existe.", "Carrossel bom a pessoa salva.", "Troquei cinco hashtags genéricas por três certeiras."],
  "fernanda-facebook": ["Pergunta no fim puxa comentário.", "Aqui o tom é de conversa, não de palco.", "Grupo certo vale mais que alcance."],
  "tiago-tiktok": ["Os primeiros dois segundos decidem tudo.", "Legenda curta, gancho repetido.", "Isso aqui tem cara de tendência."],
  "yan-youtube": ["Título e capa decidem o clique.", "Capítulo bom segura a pessoa até o fim.", "A descrição é para a busca, não para enfeite."],
  "diana-design": ["Cor da marca é para destacar, não para cobrir tudo.", "Tirei três elementos. Respirou.", "Texto na imagem tem que caber."],
  "vitor-video": ["O melhor trecho estava no minuto 34.", "Corte bom é o que ninguém percebe.", "Silêncio também é ritmo."],
  "vera-veredito": ["Número sem fonte eu tiro, não arredondo.", "Aprovar fácil é desrespeito com quem publica.", "O vídeo tem que conversar com a legenda.", "Quem errou esta semana recebe a lição antes de escrever."],
  "paulo-publicador": ["Nada sai sem aprovação. Nada.", "Confiro a conta antes de agendar.", "Horário errado estraga texto bom."],
};
/** Onde quem entrega fica de pé: ao lado da mesa do próximo, do lado de quem vem. */
function pontoDeEntrega(de: number, para: number | "voce"): THREE.Vector3 {
  // Na sua sala, ao lado da sua mesa, do lado da porta.
  if (para === "voce") return new THREE.Vector3(NOSSA_MESA.x + 1.35, 0, NOSSA_MESA.z + 0.2);
  const m = MESAS[para];
  // Na mesa da Vera, na frente dela, do lado da porta.
  if (!ehDaMesaComprida(para)) return new THREE.Vector3(m.x - 1.3, 0, m.z + 0.2);
  // Na mesa dupla, de pé ao lado da cadeira do colega, do lado dele da mesa.
  const lado = MESAS[de]?.x <= m.x ? -0.9 : 0.9;
  return new THREE.Vector3(m.x + lado, 0, m.z - 0.9 * sentidoDe(para));
}
/** A cadeira fica atrás da mesa; o robô senta virado para a câmera. */
function assento(i: number): THREE.Vector3 {
  return new THREE.Vector3(MESAS[i].x, ALTURA_DO_ASSENTO, MESAS[i].z - 0.62 * sentidoDe(i));
}

/** A sua cadeira: atrás da sua mesa, de frente para a câmera (29/09). */
const MEU_LUGAR = new THREE.Vector3(NOSSA_MESA.x, ALTURA_DO_ASSENTO, NOSSA_MESA.z - 0.72);
/** Para onde você olha sentado: para a câmera, como os agentes. */
const MEU_YAW_SENTADO = 0;

/**
 * O CAMINHO de um ponto a outro, sem atravessar a mesa comprida nem o vidro.
 *
 * Nasceu com a planta de 29/09. Com baias soltas, andar em linha reta servia;
 * com uma mesa de catorze metros entre as cadeiras e o resto da sala, a linha
 * reta passava por cima do tampo. A regra é a de um escritório de verdade: quem
 * está atrás da mesa sai pelo corredor de trás e contorna pela ponta; quem está
 * numa sala sai pela porta.
 */
type Sala = typeof SALA_DA_VERA;
function salaDe(p: THREE.Vector3): Sala | null {
  for (const sala of [SALA_DA_VERA, SUA_SALA]) {
    if (p.x > sala.x0 && p.x < sala.x1 && p.z > sala.z0) return sala;
  }
  return null;
}
function portaDe(sala: Sala): { dentro: THREE.Vector3; fora: THREE.Vector3 } {
  const z = (sala.portaZ[0] + sala.portaZ[1]) / 2;
  const sinal = sala === SALA_DA_VERA ? 1 : -1;
  return {
    dentro: new THREE.Vector3(sala.ladoDaPorta + sinal * 0.7, 0, z),
    fora: new THREE.Vector3(sala.ladoDaPorta - sinal * 0.8, 0, z),
  };
}
// Atrás da mesa é o lado do fundo: dali só se sai pelo corredor e pela ponta.
const atrasDaMesa = (p: THREE.Vector3) => p.z < MESA_COMPRIDA.z - 0.3 && Math.abs(p.x) < PONTA_X - 0.2;
function rota(de: THREE.Vector3, para: THREE.Vector3): THREE.Vector3[] {
  const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  const caminho: THREE.Vector3[] = [];
  let aqui = v(de.x, de.z);
  const salaDaSaida = salaDe(aqui);
  const salaDaChegada = salaDe(para);
  if (salaDaSaida && salaDaSaida !== salaDaChegada) {
    const porta = portaDe(salaDaSaida);
    caminho.push(porta.dentro, porta.fora);
    aqui = porta.fora;
  }
  if (atrasDaMesa(aqui) && atrasDaMesa(para)) {
    caminho.push(v(aqui.x, CORREDOR_Z), v(para.x, CORREDOR_Z), v(para.x, para.z));
    return caminho;
  }
  if (atrasDaMesa(aqui)) {
    const ponta = para.x < 0 ? -PONTA_X : PONTA_X;
    caminho.push(v(aqui.x, CORREDOR_Z), v(ponta, CORREDOR_Z), v(ponta, MESA_COMPRIDA.z + 1.9));
    aqui = v(ponta, MESA_COMPRIDA.z + 1.9);
  }
  if (atrasDaMesa(para)) {
    const ponta = aqui.x < 0 ? -PONTA_X : PONTA_X;
    caminho.push(v(ponta, MESA_COMPRIDA.z + 1.9), v(ponta, CORREDOR_Z), v(para.x, CORREDOR_Z));
  }
  if (salaDaChegada && salaDaChegada !== salaDaSaida) {
    const porta = portaDe(salaDaChegada);
    caminho.push(porta.fora, porta.dentro);
  }
  caminho.push(v(para.x, para.z));
  return caminho;
}


/**
 * A SALA, redesenhada em 28/09/2026 no estilo das referências isométricas do
 * Bruno: piso de maquete com a borda cortada à mostra, duas paredes claras com
 * janelas, e móveis brancos com madeira laranja (a mesma mesa da arte de
 * massinha dos agentes). A paleta é FIXA, e não do tema: a sala é um objeto,
 * uma maquete sobre a tela, e fica igual no claro e no escuro, como uma foto.
 */
const SALA = {
  piso: "#3f7fb0",
  pisoBorda: "#2c5f86",
  corredor: "#5a95c4",
  parede: "#eef1f4",
  paredeTopo: "#cfd5dd",
  rodape: "#d6dbe2",
  vidro: "#bfe2f4",
  moldura: "#ffffff",
  madeira: "#e2803f",
  madeiraEscura: "#b9612a",
  tampo: "#f7f7f5",
  gaveta: "#fbfbfa",
  puxador: "#c9a45c",
  cadeira: "#f08a3c",
  baia: "#f3f4f6",
} as const;
/** Os limites do piso. As paredes ficam no fundo (−z) e à esquerda (−x). */
const PISO = { x0: -8.4, x1: 8.4, z0: -7.3, z1: 4.6 } as const;

/** Os móveis, como retângulos no chão. O avatar não atravessa mesa. */
const OBSTACULOS: Array<{ x: number; z: number; larg: number; prof: number }> = [
  // a BAIA de cada agente (mesa, cadeira e as três divisórias), numa caixa só.
  // Cresceu em 19/09 junto com as divisórias: sem isto o avatar atravessava
  // o painel lateral como se fosse ar.
  // A MESA COMPRIDA com a fileira de cadeiras (29/09), numa caixa só.
  // A mesa dupla com as duas fileiras de cadeiras, numa caixa só.
  { x: MESA_COMPRIDA.x, z: MESA_COMPRIDA.z, larg: MESA_COMPRIDA.larg, prof: 2.9 },
  { x: MESA_DA_VERA.x, z: MESA_DA_VERA.z - 0.2, larg: 2.0, prof: 1.4 },
  { x: NOSSA_MESA.x, z: NOSSA_MESA.z - 0.2, larg: 2.7, prof: 1.4 },
  { x: CAFE.x, z: CAFE.z, larg: 1.3, prof: 1.3 },
  // a baia do Dev da Demandou (06/10): mesa, cadeira e as três divisórias, numa caixa só
  { x: MESA_DO_DEV.x, z: MESA_DO_DEV.z - 0.3, larg: 2.4, prof: 1.8 },
  { x: 2.4, z: -1.8, larg: 0.7, prof: 0.7 }, // a planta
  // o sofá do café, o bebedouro e as plantas de canto
  { x: 0, z: 3.75, larg: 2.1, prof: 0.95 },
  { x: 7.75, z: -2.3, larg: 0.6, prof: 0.6 },
  { x: 7.6, z: -6.8, larg: 0.7, prof: 0.7 },
  { x: -7.75, z: -2.3, larg: 0.7, prof: 0.7 },
  // As paredes de vidro das duas salas, com o vão da porta.
  ...[SALA_DA_VERA, SUA_SALA].flatMap((sala) => [
    { x: (sala.x0 + sala.x1) / 2, z: sala.z0, larg: sala.x1 - sala.x0, prof: 0.1 },
    { x: sala.ladoDaPorta, z: (sala.z0 + sala.portaZ[0]) / 2, larg: 0.1, prof: sala.portaZ[0] - sala.z0 },
    { x: sala.ladoDaPorta, z: (sala.portaZ[1] + sala.z1) / 2, larg: 0.1, prof: sala.z1 - sala.portaZ[1] },
  ]),
];

const dentroDo = (p: THREE.Vector3, o: (typeof OBSTACULOS)[number]) =>
  Math.abs(p.x - o.x) < o.larg / 2 + CORPO && Math.abs(p.z - o.z) < o.prof / 2 + CORPO;

/**
 * Empurra o ponto para fora do móvel, pelo eixo de MENOR penetração.
 *
 * Empurrar pelo eixo mais raso é o que faz o avatar deslizar pela borda da
 * mesa em vez de travar de frente nela. Quem anda encostado num móvel e para
 * de se mover lê isso como o controle ter falhado.
 *
 * `de` é onde ele JÁ ESTAVA, e existe por causa de um defeito visto no
 * protótipo: você senta colado na sua mesa, ou seja DENTRO da caixa dela, e ao
 * levantar a caixa empurrava de volta. O avatar ficava preso atrás da própria
 * mesa, sem conseguir entrar no escritório. **Um móvel em que você já está
 * dentro não empurra**, senão o único jeito de sair seria não ter colisão.
 */
function semAtravessar(p: THREE.Vector3, de?: THREE.Vector3): THREE.Vector3 {
  for (const o of OBSTACULOS) {
    if (de && dentroDo(de, o)) continue;
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const fx = o.larg / 2 + CORPO - Math.abs(dx);
    const fz = o.prof / 2 + CORPO - Math.abs(dz);
    if (fx > 0 && fz > 0) {
      if (fx < fz) p.x += Math.sign(dx || 1) * fx;
      else p.z += Math.sign(dz || 1) * fz;
    }
  }
  // As paredes: desde 28/09 a sala tem piso com borda e paredes de verdade,
  // e sair dele não é um lugar. A folga é o corpo, para não entrar na parede.
  p.x = Math.max(PISO.x0 + 0.45, Math.min(PISO.x1 - 0.35, p.x));
  p.z = Math.max(PISO.z0 + 0.45, Math.min(PISO.z1 - 0.35, p.z));
  return p;
}

/** Onde você para para falar com um agente: ao lado da mesa dele, do seu lado. */
function ladoDaMesa(i: number, vindoDe: THREE.Vector3): THREE.Vector3 {
  const m = MESAS[i];
  // Na mesa dupla, você para ao lado da cadeira dele, do lado dele da mesa.
  if (ehDaMesaComprida(i)) return new THREE.Vector3(m.x + (vindoDe.x <= m.x ? -0.9 : 0.9), 0, m.z - 1.55 * sentidoDe(i));
  return semAtravessar(new THREE.Vector3(m.x + (vindoDe.x <= m.x ? -1.5 : 1.5), 0, m.z + 0.5));
}

export type Tema = {
  fundo: string;
  superficie: string;
  elevado: string;
  borda: string;
  laranja: string;
  texto: string;
  apagado: string;
};

/** Uma cena em andamento: alguém atravessando a sala, e por quê. */
export type CenaAtiva = Cena & { n: number };
export type Gesto = { id: string; nome: "Wave" | "Yes"; n: number };

/** As expressões que o modelo tem (morph targets do Robot Expressive). */
export type Humor = "neutro" | "irritado" | "triste" | "surpreso";

const COR_DO_ESTADO: Record<EstadoDoAgente, string> = {
  trabalhando: "#ef6122",
  pronto: "#4ade80",
  esperando: "#9599a6",
  ocioso: "#9599a6",
  aviso: "#f87171",
};

function anguloCurto(de: number, para: number): number {
  let d = (para - de) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ── O robô ──────────────────────────────────────────────────────────────────

function Robo({
  indice,
  cor,
  estado,
  humor,
  missao,
  gesto,
  reduzido,
  fala,
  tema,
  aoClicar,
  turbo = false,
  lugarFixo,
  yawFixo,
  escala = ESCALA_DO_ROBO,
  aparencia,
}: {
  indice: number;
  cor: string;
  estado: EstadoDoAgente;
  /** A cara que ele faz. O modelo tem três expressões, e "neutro" é a quarta. */
  humor: Humor;
  /** Para onde atravessar a sala, com que ânimo, e por quanto tempo ficar lá. */
  missao: { alvo: THREE.Vector3; n: number; bronca: boolean; demora?: number; dePe?: boolean } | null;
  gesto: Gesto | null;
  reduzido: boolean;
  /** O que ele está dizendo. O balão anda junto com ele. */
  fala?: string | null;
  tema: Tema;
  aoClicar?: () => void;
  /** Acabou de tomar cafe: anda 1,6x. Ver TURBO_DO_CAFE. */
  turbo?: boolean;
  /** Lugar próprio, para quem não senta numa das sete mesas (você). */
  lugarFixo?: THREE.Vector3;
  /** Para onde ele olha parado. Padrão: para a câmera. */
  yawFixo?: number;
  escala?: number;
  /** Como o boneco é: cada agente igual ao busto dele (APARENCIA_DOS_AGENTES). */
  aparencia: Aparencia;
}) {
  void cor;
  const grupo = useRef<THREE.Group>(null);
  // Um animador por boneco: cada um faz o próprio gesto, na própria hora.
  const animador = useMemo(() => new AnimadorDoBoneco(), []);
  const yaw = useRef(0);
  const fase = useRef<{ n: number; etapa: "indo" | "entregando" | "voltando"; ate: number; bronca: boolean; caminho: THREE.Vector3[] } | null>(null);
  const gestoVisto = useRef(-1);
  const estadoAnterior = useRef<EstadoDoAgente | null>(null);
  const lugar = useMemo(() => lugarFixo ?? assento(indice), [lugarFixo, indice]);
  const paraOndeOlha = yawFixo ?? 0;

  function tocar(nome: string, umaVez = false) {
    animador.tocar(nome, umaVez, reduzido);
  }

  // Um gesto de uma vez só volta sozinho para a cadeira.
  useEffect(() => {
    animador.aoTerminar = () => {
      if (!fase.current) tocar("Sitting");
    };
    return () => {
      animador.aoTerminar = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animador]);

  // Começa sentado no lugar dele, sem deslizar do centro na primeira pintura.
  useEffect(() => {
    if (grupo.current) grupo.current.position.copy(lugar);
    tocar("Sitting");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O estado mudou: o gesto do momento, sem sair da mesa.
  useEffect(() => {
    const antes = estadoAnterior.current;
    estadoAnterior.current = estado;
    if (fase.current || !antes) return;
    if (antes !== "pronto" && estado === "pronto") tocar("ThumbsUp", true);
    else if (estado === "aviso" && antes !== "aviso") tocar("No", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  // Atravessa a sala: para entregar, ou para cobrar. Quem vai cobrar vai
  // CORRENDO, e é isso que se lê de longe como "está irritada".
  useEffect(() => {
    if (!missao || fase.current?.n === missao.n) return;
    const de = grupo.current?.position ?? lugar;
    fase.current = { n: missao.n, etapa: "indo", ate: 0, bronca: missao.bronca, caminho: rota(de, missao.alvo) };
    tocar(missao.bronca ? "Running" : "Walking");
  }, [missao]);

  // Vida de escritório: de vez em quando alguém acena ou concorda.
  useEffect(() => {
    if (!gesto || gesto.n === gestoVisto.current) return;
    gestoVisto.current = gesto.n;
    if (fase.current || estado === "trabalhando") return;
    tocar(gesto.nome, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesto]);

  useFrame((st, dt) => {
    const g = grupo.current;
    if (!g) return;
    const passo = Math.min(dt, 0.05);
    const f = fase.current;

    if (f && missao) {
      // Anda pelo caminho, ponto a ponto (ver `rota`); o último é o destino.
      const destino = f.caminho[0] ?? (f.etapa === "voltando" ? lugar : missao.alvo);
      if (f.etapa === "entregando") {
        // Na bronca, o "não" acaba antes da conversa: repete enquanto dura.
        if (f.bronca && !animador.rodando()) tocar("No", true);
        // No café, de pé: parado conversando.
        else if (missao.dePe && !animador.rodando()) tocar("Idle");
        if (st.clock.elapsedTime > f.ate) {
          f.etapa = "voltando";
          f.caminho = rota(g.position, lugar);
          tocar("Walking");
        }
      } else {
        const dir = new THREE.Vector3().subVectors(destino, g.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist < 0.06 && f.caminho.length > 1) {
          // Um ponto do caminho, não o destino: segue para o próximo.
          f.caminho.shift();
        } else if (dist < 0.06) {
          g.position.x = destino.x;
          g.position.z = destino.z;
          f.caminho = [];
          if (f.etapa === "indo") {
            f.etapa = "entregando";
            // A bronca demora mais que a entrega: ela é uma conversa. E o café
            // demora mais que as duas, porque café é para demorar.
            f.ate = st.clock.elapsedTime + (missao.demora ?? (f.bronca ? 3.4 : 1.8));
            // Vira para o colega (ou para nós).
            yaw.current = Math.atan2(-dir.x, -dir.z);
            // Quem entrega acena; quem cobra balança a cabeça dizendo não;
            // quem vai ao café fica de pé conversando.
            tocar(f.bronca ? "No" : missao.dePe ? "Idle" : "Wave", true);
          } else {
            fase.current = null;
            yaw.current = paraOndeOlha;
            tocar("Sitting");
          }
        } else {
          dir.normalize();
          g.position.addScaledVector(dir, Math.min(VELOCIDADE * (turbo ? TURBO_DO_CAFE : 1) * passo, dist));
          yaw.current = Math.atan2(dir.x, dir.z);
        }
      }
      // De pé enquanto anda; sobe de volta ao assento ao sentar.
      const alturaAlvo = f.etapa === "voltando" && g.position.distanceTo(lugar) < 0.5 ? ALTURA_DO_ASSENTO : 0;
      g.position.y += (alturaAlvo - g.position.y) * (1 - Math.exp(-passo * 8));
    } else if (f && !missao) {
      // A missão foi cancelada no meio (ganhou o bastão enquanto tomava café):
      // sem esta linha o robô ficava parado onde estivesse, para sempre.
      fase.current = null;
      yaw.current = paraOndeOlha;
      tocar("Sitting");
    } else if (!f) {
      g.position.lerp(lugar, 1 - Math.exp(-passo * 7));
      yaw.current += anguloCurto(yaw.current, paraOndeOlha) * (1 - Math.exp(-passo * 7));
    }
    g.rotation.y += anguloCurto(g.rotation.y, yaw.current) * (1 - Math.exp(-passo * 12));
  });

  return (
    <group ref={grupo} scale={escala}>
      {/* A expressão agora é do boneco: sobrancelhas e boca (ver Humor). */}
      <BonecoDeMassinha aparencia={aparencia} animador={animador} humor={humor} />
      {/* O BALÃO VIVE AQUI, dentro do robô, e não na mesa.

          Até 18/09 ele era filho do grupo da MESA, que é fixo: quando o agente
          levantava para entregar, para cobrar ou para tomar café, a fala dele
          ficava para trás, pairando sobre a cadeira vazia. O Bruno pegou na
          hora: "os balões do chat não estão acompanhando os agentes".

          O grupo interno desfaz a escala do robô, senão o balão sairia com
          19% do tamanho; a altura 6,6 é medida no modelo, que tem uns 6 de
          altura, e cai logo acima da cabeça em qualquer pose. */}
      {fala && (
        <group position={[0, 1.42, 0]} scale={1 / escala}>
          <Html center distanceFactor={7} zIndexRange={[22, 0]} style={{ pointerEvents: "auto" }}>
            <button
              type="button"
              onClick={aoClicar}
              title="Ver a ficha e o trabalho de agora"
              style={{
                transform: "translate(0, -60%)",
                border: "none",
                background: "none",
                padding: 0,
                cursor: aoClicar ? "pointer" : "default",
                font: "inherit",
              }}
            >
              <Balao texto={fala} tema={tema} />
            </button>
          </Html>
        </group>
      )}
    </group>
  );
}

// ── Você ────────────────────────────────────────────────────────────────────

/** O que o resto da cena precisa saber sobre você, sem passar por render. */
export type MeuEstado = {
  posicao: THREE.Vector3;
  sentado: boolean;
  /** Ate quando o cafe faz efeito (epoch ms), ou 0. */
  cafeinadoAte: number;
};

/**
 * VOCÊ, o único avatar que a pessoa move.
 *
 * ## As cinco marcas de que este não é um funcionário
 *
 * 1. veste o LARANJA DA MARCA, a única cor que nenhum agente usa;
 * 2. é 12% maior que eles;
 * 3. senta de COSTAS para a câmera, olhando o escritório: é de onde você olha;
 * 4. não entra na esteira, não recebe bastão e não vai ao café;
 * 5. **é o único que anda quando você manda.**
 *
 * ## Por que não é o `Robo` com mais uma prop
 *
 * O `Robo` tem um ciclo inteiro em volta de "missão": ir até a mesa de alguém,
 * entregar, voltar e sentar. Nada disso vale aqui, onde quem decide o próximo
 * passo é a pessoa. Encaixar controle manual naquele `useFrame` viraria uma
 * escada de condicionais em código que já funciona para sete robôs.
 *
 * ## Os dois controles, e por que os dois
 *
 * O Bruno pediu os dois, e eles servem a mãos diferentes: o clique funciona no
 * celular e não precisa ser descoberto; o teclado é o controle fino de quem já
 * está dentro da cena. O teclado CANCELA o destino do clique, senão o avatar
 * seria puxado para dois lugares ao mesmo tempo.
 */
function Voce({
  tema,
  reduzido,
  /** Para onde a pessoa clicou, ou null. A cena decide; aqui só se caminha. */
  destino,
  /** Chamado ao chegar, para a cena poder esquecer o destino. */
  aoChegar,
  /** As teclas apertadas agora. É ref e não estado: muda 60 vezes por segundo. */
  teclas,
  /** Escrito a cada quadro, lido pela cena. Não passa por render de propósito. */
  meuEstado,
  /**
   * Se o destino atual é a sua própria cadeira.
   *
   * É ref e não prop de valor porque muda junto com o destino, dentro de um
   * handler, e é lida no `useFrame`: passar `voltando.current` como prop leria
   * a ref durante o render e congelaria o valor até a próxima pintura.
   */
  voltandoParaAMesa,
  /** Se o destino atual e a mesa de cafe. Mesma razao de ser ref que a de cima. */
  indoAoCafe,
  /** Chamado quando o cafe foi tomado, para a cena marcar o turbo. */
  aoTomarCafe,
  /** O menu e o aviso de alcance, que andam junto com você. */
  children,
  aparencia,
}: {
  tema: Tema;
  reduzido: boolean;
  /** O caminho até o destino, ponto a ponto (ver `rota`). */
  destino: THREE.Vector3[] | null;
  aoChegar: () => void;
  teclas: React.RefObject<Set<string>>;
  meuEstado: React.RefObject<MeuEstado>;
  voltandoParaAMesa: React.RefObject<boolean>;
  indoAoCafe: React.RefObject<boolean>;
  aoTomarCafe: () => void;
  children?: React.ReactNode;
  /** O seu boneco, como você personalizou (ou o padrão, de laranja). */
  aparencia: Aparencia;
}) {
  void tema;
  const grupo = useRef<THREE.Group>(null);
  const animador = useMemo(() => new AnimadorDoBoneco(), []);
  const yaw = useRef(MEU_YAW_SENTADO);
  const sentado = useRef(true);
  /** Em que ponto do caminho você está (ver `rota`). */
  const pontoDoCaminho = useRef(0);
  const caminhoVisto = useRef<THREE.Vector3[] | null>(null);
  /** Ate quando fica parado bebendo, em segundos do relogio da cena. */
  const bebendoAte = useRef(0);
  const frente = useRef(new THREE.Vector3());
  const lado = useRef(new THREE.Vector3());

  function tocar(nome: string) {
    // Mesma pose em laço não reinicia (o robô antigo fazia isto pelo clipe).
    if (animador.base === nome && !animador.gesto) return;
    animador.tocar(nome, false, reduzido);
  }

  useEffect(() => {
    if (grupo.current) grupo.current.position.copy(MEU_LUGAR);
    tocar("Sitting");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((st, dt) => {
    const g = grupo.current;
    if (!g) return;
    const passo = Math.min(dt, 0.05);

    // 1. TECLADO, relativo à CÂMERA e não ao eixo z: W tem que ir para onde a
    // pessoa está vendo, senão girar a câmera inverte o controle sem aviso.
    const t = teclas.current ?? new Set<string>();
    let vx = 0;
    let vz = 0;
    if (t.has("w") || t.has("arrowup")) vz += 1;
    if (t.has("s") || t.has("arrowdown")) vz -= 1;
    if (t.has("a") || t.has("arrowleft")) vx -= 1;
    if (t.has("d") || t.has("arrowright")) vx += 1;
    const noTeclado = vx !== 0 || vz !== 0;

    let andando = false;
    // Com cafe no sangue, 1,6x. Ver TURBO_DO_CAFE.
    const turbo = (meuEstado.current?.cafeinadoAte ?? 0) > Date.now() ? TURBO_DO_CAFE : 1;
    const velocidade = MINHA_VELOCIDADE * turbo;

    // Bebendo: fica parado, de pe, ate acabar o gole. Teclado interrompe.
    if (bebendoAte.current > st.clock.elapsedTime && !noTeclado) {
      tocar("Idle");
      g.position.y += (0 - g.position.y) * (1 - Math.exp(-passo * 8));
      if (meuEstado.current) {
        meuEstado.current.posicao.copy(g.position);
        meuEstado.current.sentado = false;
      }
      return;
    }

    if (noTeclado) {
      sentado.current = false;
      st.camera.getWorldDirection(frente.current);
      frente.current.y = 0;
      frente.current.normalize();
      lado.current.crossVectors(frente.current, new THREE.Vector3(0, 1, 0)).normalize();
      const delta = new THREE.Vector3()
        .addScaledVector(frente.current, vz)
        .addScaledVector(lado.current, vx)
        .normalize()
        .multiplyScalar(velocidade * passo);
      const alvo = semAtravessar(new THREE.Vector3(g.position.x + delta.x, 0, g.position.z + delta.z), g.position);
      if (alvo.distanceTo(g.position) > 0.001) {
        yaw.current = Math.atan2(alvo.x - g.position.x, alvo.z - g.position.z);
        andando = true;
      }
      g.position.x = alvo.x;
      g.position.z = alvo.z;
    } else if (destino && destino.length) {
      sentado.current = false;
      if (caminhoVisto.current !== destino) {
        caminhoVisto.current = destino;
        pontoDoCaminho.current = 0;
      }
      const ultimo = pontoDoCaminho.current >= destino.length - 1;
      const ponto = destino[Math.min(pontoDoCaminho.current, destino.length - 1)];
      const dir = new THREE.Vector3().subVectors(ponto, g.position);
      dir.y = 0;
      const dist = dir.length();
      if (dist < 0.08 && !ultimo) {
        pontoDoCaminho.current += 1;
      } else if (dist < 0.08) {
        g.position.x = ponto.x;
        g.position.z = ponto.z;
        if (voltandoParaAMesa.current) {
          sentado.current = true;
          yaw.current = MEU_YAW_SENTADO;
        }
        if (indoAoCafe.current) {
          // Chegou ao cafe: vira para a mesa, bebe por dois segundos, e sai
          // mais rapido. O turbo e marcado na cena, que e quem desenha o selo.
          yaw.current = Math.atan2(CAFE.x - g.position.x, CAFE.z - g.position.z);
          bebendoAte.current = st.clock.elapsedTime + 2.2;
          aoTomarCafe();
        }
        aoChegar();
      } else {
        dir.normalize();
        const passoAte = new THREE.Vector3().copy(g.position).addScaledVector(dir, Math.min(velocidade * passo, dist));
        // Voltar para a PRÓPRIA cadeira não passa pela colisão: o assento fica
        // dentro da caixa da sua mesa, e com ela ligada o avatar parava na
        // borda e nunca sentava. Sair dali já era permitido pela regra do
        // "móvel em que você está dentro"; faltava a volta.
        // No caminho calculado não há móvel para desviar (`rota` já contorna);
        // a colisão fica para o teclado e para o último trecho livre.
        const alvo = voltandoParaAMesa.current || indoAoCafe.current || destino.length > 1 ? passoAte : semAtravessar(passoAte, g.position);
        if (alvo.distanceTo(g.position) < 0.004) {
          // Travou contra um móvel e o destino é inalcançável: desiste, em vez
          // de raspar na parede para sempre.
          aoChegar();
        } else {
          yaw.current = Math.atan2(alvo.x - g.position.x, alvo.z - g.position.z);
          g.position.x = alvo.x;
          g.position.z = alvo.z;
          andando = true;
        }
      }
    }

    tocar(sentado.current ? "Sitting" : andando ? "Walking" : "Idle");

    const alturaAlvo = sentado.current ? ALTURA_DO_ASSENTO : 0;
    g.position.y += (alturaAlvo - g.position.y) * (1 - Math.exp(-passo * 8));
    g.rotation.y += anguloCurto(g.rotation.y, yaw.current) * (1 - Math.exp(-passo * 12));

    if (meuEstado.current) {
      meuEstado.current.posicao.copy(g.position);
      meuEstado.current.sentado = sentado.current;
    }
  });

  return (
    <group ref={grupo} scale={MINHA_ESCALA}>
      <BonecoDeMassinha aparencia={aparencia} animador={animador} />
      {/* O MENU VIVE AQUI, dentro de você, e não no agente.

          É a lição da parte 136 aplicada antes de doer: o balão de fala era
          filho do grupo da mesa, que é fixo no chão, e sobrava sobre a cadeira
          vazia quando o dono levantava. O agente pode levantar no meio da
          conversa (ele entrega, é chamado pela Vera, vai ao café), e um menu
          preso a ele iria junto. Ancorado em você, o menu acompanha a conversa.

          O grupo interno desfaz a escala do avatar, senão o menu sairia com
          21% do tamanho; a altura 7,6 é medida no modelo e cai logo acima da
          cabeça em qualquer pose. */}
      {children && (
        <group position={[0, 1.2, 0]} scale={1 / MINHA_ESCALA}>
          {children}
        </group>
      )}
    </group>
  );
}

// ── A mesa ──────────────────────────────────────────────────────────────────

function Plaqueta({
  nome,
  papel,
  detalhe,
  estado,
  tema,
  foto,
  aoClicar,
  compacta = false,
}: {
  nome: string;
  papel: string;
  detalhe: string;
  estado: EstadoDoAgente;
  tema: Tema;
  /** O rosto de massinha do agente (arte de 28/09). */
  foto?: string;
  aoClicar: () => void;
  /**
   * Só rosto, estado e primeiro nome (29/09). Na mesa comprida os dez sentam a
   * 1,4 de distância, e a placa inteira de um cobria a do vizinho. O papel e o
   * detalhe continuam no título (passar o mouse) e na ficha, a um clique.
   */
  compacta?: boolean;
}) {
  const trabalhando = estado === "trabalhando";
  return (
    <button
      type="button"
      onClick={aoClicar}
      title={compacta ? `${nome} · ${papel}: ${detalhe}` : `Abrir a ficha de ${nome}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: compacta ? 5 : 7,
        padding: compacta ? "3px 7px 3px 4px" : "5px 9px",
        borderRadius: 9,
        border: `1px solid ${trabalhando ? tema.laranja : tema.borda}`,
        background: `color-mix(in srgb, ${tema.fundo} 90%, transparent)`,
        backdropFilter: "blur(6px)",
        color: tema.texto,
        fontFamily: "inherit",
        fontSize: 11.5,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        // A largura do conteúdo (29/09): dentro do <Html> do drei a caixa
        // encolhia até a largura do pai e o nome vazava para fora dela.
        width: "max-content",
        cursor: "pointer",
        boxShadow: "0 4px 14px rgba(0,0,0,.35)",
      }}
    >
      {/* O rosto de massinha: é por ele que a pessoa reconhece o agente na
          sala, o mesmo das listas e da ficha. */}
      {foto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto}
          alt=""
          width={compacta ? 22 : 26}
          height={compacta ? 22 : 26}
          draggable={false}
          style={{ width: compacta ? 22 : 26, height: compacta ? 22 : 26, borderRadius: 999, objectFit: "cover", objectPosition: "bottom", background: "rgba(255,255,255,.08)" }}
        />
      )}
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: COR_DO_ESTADO[estado],
          boxShadow: trabalhando ? `0 0 0 4px color-mix(in srgb, ${tema.laranja} 30%, transparent)` : undefined,
          animation: trabalhando ? "pulsoDoAgente 1.2s ease-in-out infinite" : undefined,
        }}
      />
      {compacta ? (
        // Nome inteiro e função (29/09): só o primeiro nome, pequeno, o Bruno
        // não conseguia ler. Com a mesa dupla há espaço para as duas linhas.
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0 }}>
          <b style={{ fontWeight: 700, fontSize: 11.5 }}>{nome}</b>
          <small style={{ fontSize: 9.5, color: tema.apagado }}>{papel}</small>
        </span>
      ) : (
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
        <b style={{ fontWeight: 700 }}>
          {nome} <span style={{ fontWeight: 500, color: tema.apagado }}>· {papel}</span>
        </b>
        <small style={{ fontSize: 10.5, color: tema.apagado, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
          {detalhe}
        </small>
      </span>
      )}
    </button>
  );
}

/**
 * O balão de fala: o que o agente está fazendo, nas palavras dele.
 *
 * O texto é cortado em 120 caracteres. O parecer da Vera tem parágrafos, e um
 * balão de cinco linhas cobre meio escritório: o balão é a chamada, e o texto
 * inteiro está na ficha, a um clique daqui.
 */
function Balao({ texto, tema }: { texto: string; tema: Tema }) {
  const curto = texto.length > 120 ? `${texto.slice(0, 120).trimEnd()}…` : texto;
  return (
    <div
      style={{
        position: "relative",
        maxWidth: 210,
        padding: "7px 10px",
        borderRadius: 12,
        borderBottomLeftRadius: 3,
        background: tema.texto,
        color: tema.fundo,
        fontFamily: "inherit",
        fontSize: 11.5,
        lineHeight: 1.35,
        boxShadow: "0 6px 18px rgba(0,0,0,.35)",
        whiteSpace: "normal",
        width: "max-content",
        textAlign: "left",
      }}
    >
      {curto}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 6,
          bottom: -6,
          width: 0,
          height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: `7px solid ${tema.texto}`,
        }}
      />
    </div>
  );
}

/**
 * A CADEIRA, desenhada como cadeira de escritório e não como duas caixas.
 *
 * Pedido do Bruno em 19/09: "as cadeiras devem ter um design melhor". Assento
 * com almofada, encosto com topo arredondado, coluna com pistão, base de cinco
 * pés com rodízios, e dois braços. A cor do agente vai numa faixa do encosto,
 * que é o que faz a cadeira ser DELE e não uma peça de mobília genérica.
 *
 * `posicao` é o centro do assento; a cadeira olha para +z (a câmera), que é
 * para onde o robô olha sentado.
 */
function Cadeira({ posicao, cor, tema }: { posicao: [number, number, number]; cor: string; tema: Tema }) {
  const [x, y, z] = posicao;
  return (
    <group position={[x, y, z]}>
      {/* base de cinco pés com rodízios */}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <group key={i} rotation-y={a}>
            <mesh position={[0.17, 0.05, 0]} rotation-z={0.1}>
              <boxGeometry args={[0.3, 0.035, 0.05]} />
              <meshStandardMaterial color="#1c1c22" roughness={0.6} metalness={0.3} />
            </mesh>
            <mesh position={[0.3, 0.03, 0]}>
              <sphereGeometry args={[0.035, 10, 10]} />
              <meshStandardMaterial color="#0f0f13" roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      {/* coluna e pistão */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 0.3, 12]} />
        <meshStandardMaterial color="#2a2a33" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* assento: almofada com canto arredondado por escala */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.28, 0.26, 0.09, 24]} />
        <meshStandardMaterial color={SALA.cadeira} roughness={0.75} />
      </mesh>
      {/* encosto, atrás (−z), levemente inclinado */}
      <group position={[0, 0.72, -0.24]} rotation-x={-0.12}>
        <mesh>
          <boxGeometry args={[0.46, 0.5, 0.07]} />
          <meshStandardMaterial color={SALA.cadeira} roughness={0.75} />
        </mesh>
        {/* O topo arredondado. Até 29/09 era MEIO cilindro, e meio cilindro no
            three.js não tampa a face reta: de certos ângulos via-se um corte
            atravessando o encosto (o Bruno viu). Agora é o disco inteiro, com a
            metade de baixo escondida dentro do encosto. */}
        <mesh position={[0, 0.25, 0]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.23, 0.23, 0.07, 32]} />
          <meshStandardMaterial color={SALA.cadeira} roughness={0.75} />
        </mesh>
        {/* a faixa na cor do agente */}
        <mesh position={[0, 0.06, 0.04]}>
          <boxGeometry args={[0.4, 0.09, 0.012]} />
          <meshStandardMaterial color={cor} emissive={cor} emissiveIntensity={0.25} roughness={0.5} />
        </mesh>
      </group>
      {/* braços */}
      {[-0.27, 0.27].map((bx) => (
        <group key={bx} position={[bx, 0.55, -0.02]}>
          <mesh position={[0, -0.07, 0]}>
            <boxGeometry args={[0.04, 0.14, 0.04]} />
            <meshStandardMaterial color="#2a2a33" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.07, 0.035, 0.3]} />
            <meshStandardMaterial color="#1c1c22" roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * A BAIA: três divisórias baixas em volta da mesa, com uma barra na cor do
 * agente. Pedido do Bruno em 19/09: "o escritório precisa ser melhor
 * delimitado, com baias delimitadas".
 *
 * Baixas (1,05) e um pouco translúcidas de propósito: a baia delimita o lugar
 * sem esconder o robô nem o rosto dele, que é o que a cena existe para
 * mostrar. A frente fica aberta, virada para o corredor e para a câmera.
 * Fica na posição da mesa (o pai já translada).
 */
function Baia({ tema, cor }: { tema: Tema; cor: string }) {
  const H = 1.05;
  // Painéis brancos, como as divisórias das referências (28/09). O tema não
  // entra mais aqui: a sala tem paleta própria (ver SALA).
  void tema;
  const painel = { color: SALA.baia, transparent: true, opacity: 0.92, roughness: 0.9 } as const;
  return (
    <group>
      {/* fundo, atrás da cadeira */}
      <mesh position={[0, H / 2, -1.12]}>
        <boxGeometry args={[2.3, H, 0.05]} />
        <meshStandardMaterial {...painel} />
      </mesh>
      {/* laterais */}
      {[-1.15, 1.15].map((bx) => (
        <mesh key={bx} position={[bx, H / 2, -0.32]}>
          <boxGeometry args={[0.05, H, 1.65]} />
          <meshStandardMaterial {...painel} />
        </mesh>
      ))}
      {/* a barra da cor do agente no topo das três divisórias */}
      <mesh position={[0, H + 0.015, -1.12]}>
        <boxGeometry args={[2.3, 0.03, 0.07]} />
        <meshStandardMaterial color={cor} emissive={cor} emissiveIntensity={0.35} />
      </mesh>
      {[-1.15, 1.15].map((bx) => (
        <mesh key={bx} position={[bx, H + 0.015, -0.32]}>
          <boxGeometry args={[0.07, 0.03, 1.65]} />
          <meshStandardMaterial color={cor} emissive={cor} emissiveIntensity={0.35} />
        </mesh>
      ))}
      {/* o tapete da baia, que marca o chão dela */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, -0.32]}>
        <planeGeometry args={[2.3, 1.65]} />
        <meshStandardMaterial
          color={cor}
          transparent
          opacity={0.16}
          roughness={1}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
    </group>
  );
}

/**
 * A MESA COMPRIDA (29/09): um tampo só para os dez, no estilo das mesas da
 * arte de massinha (tampo branco, pés e painel de madeira laranja).
 */
function MesaComprida() {
  const { x, z, larg, prof } = MESA_COMPRIDA;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.74, 0]}>
        <boxGeometry args={[larg, 0.08, prof]} />
        <meshStandardMaterial color={SALA.tampo} roughness={0.55} />
      </mesh>
      {[-larg / 2 + 0.2, -larg / 6, larg / 6, larg / 2 - 0.2].map((px) => (
        <mesh key={px} position={[px, 0.36, 0]}>
          <boxGeometry args={[0.12, 0.72, prof - 0.1]} />
          <meshStandardMaterial color={SALA.madeira} roughness={0.7} />
        </mesh>
      ))}
      {/* o painel de madeira na frente, que esconde as pernas de quem senta */}
      <mesh position={[0, 0.46, prof / 2 - 0.06]}>
        <boxGeometry args={[larg - 0.3, 0.5, 0.04]} />
        <meshStandardMaterial color={SALA.madeiraEscura} roughness={0.75} />
      </mesh>
    </group>
  );
}

/** As paredes de vidro de uma sala, com o vão da porta e a placa. */
function SalaDeVidro({ sala, rotulo, cor, tema }: { sala: Sala; rotulo: string; cor: string; tema: Tema }) {
  const H = 1.5;
  const vidro = { color: SALA.vidro, transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false } as const;
  const trechos: Array<{ x: number; z: number; larg: number; prof: number }> = [
    { x: (sala.x0 + sala.x1) / 2, z: sala.z0, larg: sala.x1 - sala.x0, prof: 0.05 },
    { x: sala.ladoDaPorta, z: (sala.z0 + sala.portaZ[0]) / 2, larg: 0.05, prof: sala.portaZ[0] - sala.z0 },
    { x: sala.ladoDaPorta, z: (sala.portaZ[1] + sala.z1) / 2, larg: 0.05, prof: sala.z1 - sala.portaZ[1] },
  ];
  return (
    <group>
      {trechos.map((t, k) => (
        <group key={k} position={[t.x, 0, t.z]}>
          <mesh position={[0, H / 2, 0]}>
            <boxGeometry args={[t.larg, H, t.prof]} />
            <meshStandardMaterial {...vidro} />
          </mesh>
          {/* o caixilho branco em cima, que é o que dá a forma da parede */}
          <mesh position={[0, H + 0.02, 0]}>
            <boxGeometry args={[t.larg + 0.02, 0.05, t.prof + 0.03]} />
            <meshStandardMaterial color={SALA.moldura} />
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <boxGeometry args={[t.larg + 0.02, 0.06, t.prof + 0.03]} />
            <meshStandardMaterial color={SALA.moldura} />
          </mesh>
        </group>
      ))}
      {/* o tapete da sala, na cor de quem é dono dela */}
      <mesh rotation-x={-Math.PI / 2} position={[(sala.x0 + sala.x1) / 2, 0.02, (sala.z0 + sala.z1) / 2]}>
        <planeGeometry args={[sala.x1 - sala.x0 - 0.3, sala.z1 - sala.z0 - 0.3]} />
        <meshStandardMaterial color={cor} transparent opacity={0.14} roughness={1} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <Html position={[(sala.x0 + sala.x1) / 2, H + 0.35, sala.z0]} center distanceFactor={9} zIndexRange={[18, 0]} style={{ pointerEvents: "none" }}>
        <div
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            background: `color-mix(in srgb, ${tema.fundo} 88%, transparent)`,
            border: `1px solid ${cor}`,
            color: tema.texto,
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {rotulo}
        </div>
      </Html>
    </group>
  );
}

function Mesa({
  indice,
  cor,
  estado,
  nome,
  papel,
  detalhe,
  tema,
  foto,
  aoClicar,
}: {
  indice: number;
  cor: string;
  estado: EstadoDoAgente;
  nome: string;
  papel: string;
  detalhe: string;
  tema: Tema;
  foto?: string;
  aoClicar: () => void;
}) {
  const m = MESAS[indice];
  // Na mesa comprida o tampo é um só (MesaComprida); aqui fica só o posto.
  const naMesaComprida = ehDaMesaComprida(indice);
  const tela = useRef<THREE.MeshStandardMaterial>(null);
  const anel = useRef<THREE.Mesh>(null);
  const trabalhando = estado === "trabalhando";
  const corDaTela = estado === "aviso" ? "#f87171" : cor;

  useFrame((st) => {
    if (tela.current) {
      const alvo = trabalhando ? 1.3 + Math.sin(st.clock.elapsedTime * 5) * 0.45 : estado === "pronto" ? 0.55 : 0.12;
      tela.current.emissiveIntensity += (alvo - tela.current.emissiveIntensity) * 0.1;
    }
    if (anel.current) {
      anel.current.rotation.y = st.clock.elapsedTime * 2.2;
      anel.current.rotation.x = Math.sin(st.clock.elapsedTime * 1.3) * 0.5;
    }
  });

  return (
    <group position={[m.x, 0, m.z]} rotation-y={sentidoDe(indice) === -1 ? Math.PI : 0}>
      <group
        onClick={(e) => {
          e.stopPropagation();
          aoClicar();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        {/* A MESA DA ARTE DE MASSINHA (28/09): tampo branco, gaveteiro branco
            com puxadores dourados de um lado, lateral de madeira laranja do
            outro e o painel de fundo na mesma madeira. */}
        {!naMesaComprida && (
        <>
        <mesh position={[0, 0.74, 0]}>
          <boxGeometry args={[1.8, 0.07, 0.8]} />
          <meshStandardMaterial color={SALA.tampo} roughness={0.55} />
        </mesh>
        <mesh position={[-0.6, 0.355, 0]}>
          <boxGeometry args={[0.56, 0.71, 0.72]} />
          <meshStandardMaterial color={SALA.madeira} roughness={0.7} />
        </mesh>
        {[0.52, 0.2].map((y) => (
          <group key={y} position={[-0.6, y, 0.365]}>
            <mesh>
              <boxGeometry args={[0.5, 0.28, 0.02]} />
              <meshStandardMaterial color={SALA.gaveta} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.02, 0.018]}>
              <boxGeometry args={[0.16, 0.035, 0.025]} />
              <meshStandardMaterial color={SALA.puxador} metalness={0.6} roughness={0.35} />
            </mesh>
          </group>
        ))}
        <mesh position={[0.87, 0.36, 0]}>
          <boxGeometry args={[0.06, 0.72, 0.72]} />
          <meshStandardMaterial color={SALA.madeira} roughness={0.7} />
        </mesh>
        <mesh position={[0.25, 0.46, -0.3]}>
          <boxGeometry args={[1.2, 0.5, 0.03]} />
          <meshStandardMaterial color={SALA.madeiraEscura} roughness={0.75} />
        </mesh>
        </>
        )}
        {/* a caneca branca da referência */}
        <mesh position={[-0.55, 0.82, 0.18]}>
          <cylinderGeometry args={[0.05, 0.045, 0.1, 14]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
        {/* O NOTEBOOK da arte de massinha (28/09), no lugar do monitor alto:
            baixo, deixa ver o rosto de quem está sentado. A tampa fica de
            costas para a câmera, então o estado do agente aparece na LUZ da
            tampa, na cor dele: acesa pulsando trabalhando, média pronto,
            vermelha no aviso, quase apagada parado. */}
        <mesh position={[0.15, 0.79, 0.1]}>
          <boxGeometry args={[0.56, 0.025, 0.36]} />
          <meshStandardMaterial color="#2a2a33" roughness={0.45} />
        </mesh>
        <group position={[0.15, 0.8, -0.07]} rotation-x={0.3}>
          <mesh position={[0, 0.18, 0]}>
            <boxGeometry args={[0.56, 0.36, 0.022]} />
            <meshStandardMaterial color="#2a2a33" roughness={0.45} />
          </mesh>
          {/* a luz da tampa, virada para a câmera */}
          <mesh position={[0, 0.19, 0.013]}>
            <circleGeometry args={[0.06, 24]} />
            <meshStandardMaterial
              ref={tela}
              color="#0a0a0d"
              emissive={corDaTela}
              emissiveIntensity={0.12}
              roughness={0.25}
            />
          </mesh>
          {/* a tela, do lado de quem trabalha */}
          <mesh position={[0, 0.18, -0.013]} rotation-y={Math.PI}>
            <planeGeometry args={[0.5, 0.3]} />
            <meshStandardMaterial color="#cfe8f7" emissive="#cfe8f7" emissiveIntensity={0.3} />
          </mesh>
        </group>
        {/* cadeira, atrás da mesa, virada para a câmera */}
        <Cadeira posicao={[0, 0, -0.62]} cor={cor} tema={tema} />
      </group>

      {/* A baia saiu em 29/09: na mesa comprida todos trabalham juntos, e a
          Vera tem a sala dela. O que marca o lugar de cada um agora é a faixa
          na cor dele no tampo, logo abaixo. */}
      {naMesaComprida && (
        <mesh position={[0, 0.785, 0.34]}>
          <boxGeometry args={[1.1, 0.012, 0.06]} />
          <meshStandardMaterial color={cor} emissive={cor} emissiveIntensity={0.35} />
        </mesh>
      )}

      {/* o anel de "processando", só de quem está com o bastão */}

      {/* o anel de "processando", só de quem está com o bastão */}
      {trabalhando && (
        <mesh ref={anel} position={[0.15, 1.62, 0.05]}>
          <torusGeometry args={[0.16, 0.025, 10, 40]} />
          <meshStandardMaterial color={cor} emissive={cor} emissiveIntensity={1.6} />
        </mesh>
      )}

      {/* a placa de mesa, na frente do tampo */}
      {/* Na mesa comprida as placas alternam de altura, uma sim, outra não:
          mesmo compactas, dez lado a lado encostavam umas nas outras. */}
      <Html
        position={naMesaComprida ? (sentidoDe(indice) === -1 ? [0, 0.35, -1.25] : [0, 1.0, 0.3]) : [0, 0.98, 0.55]}
        center
        // Maior na mesa dupla (29/09): a câmera ficou mais longe para caber a
        // sala inteira, e a placa encolheu junto até ficar ilegível. Com 10 ela
        // passou do ponto e cobria o robô do lado; 8,5 lê e deixa a mesa à vista.
        distanceFactor={naMesaComprida ? 8.5 : 7}
        zIndexRange={[20, 0]}
        style={{ pointerEvents: "auto" }}
      >
        <Plaqueta nome={nome} papel={papel} detalhe={detalhe} estado={estado} tema={tema} foto={foto} aoClicar={aoClicar} compacta={naMesaComprida} />
      </Html>

      {/* O balão NÃO fica aqui: ele é filho do ROBÔ, para andar junto com
          ele (18/09). Preso à mesa, ele ficava pairando sobre a cadeira
          vazia assim que o agente levantava para entregar ou tomar café. */}
    </group>
  );
}

// ── A nossa mesa ────────────────────────────────────────────────────────────

function NossaMesa({
  tema,
  titulo,
  fala,
  aoFecharFala,
  aoClicar,
}: {
  tema: Tema;
  titulo: string;
  fala: string | null;
  /** O X do balão (07/10): só ele recebe o toque; o resto do balão deixa passar para a cena. */
  aoFecharFala?: () => void;
  /** Clicar na própria mesa é o caminho de volta: você anda até ela e senta. */
  aoClicar?: () => void;
}) {
  return (
    <group
      position={[NOSSA_MESA.x, 0, NOSSA_MESA.z]}
      onClick={(e) => {
        if (!aoClicar) return;
        e.stopPropagation();
        aoClicar();
      }}
    >
      <mesh position={[0, 0.74, 0]}>
        <boxGeometry args={[2.6, 0.08, 0.9]} />
        <meshStandardMaterial color={SALA.tampo} roughness={0.55} />
      </mesh>
      {[-1.2, 1.2].map((x) => (
        <mesh key={x} position={[x, 0.36, 0]}>
          <boxGeometry args={[0.08, 0.72, 0.8]} />
          <meshStandardMaterial color={SALA.madeira} roughness={0.7} />
        </mesh>
      ))}
      {/* a nossa cadeira, de costas para a câmera (o grupo já está girado
          180°, então a Cadeira, que olha para +z, aqui olha para a sala) */}
      <Cadeira posicao={[0, 0, -0.72]} cor={tema.laranja} tema={tema} />
      {/* o que chega aqui: a semana */}
      <mesh position={[0, 0.79, 0.05]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.9, 0.6]} />
        <meshStandardMaterial color={tema.laranja} emissive={tema.laranja} emissiveIntensity={0.35} />
      </mesh>
      <Html position={[0, 1.05, 0.55]} center distanceFactor={7} zIndexRange={[20, 0]}>
        <div
          style={{
            padding: "5px 10px",
            borderRadius: 9,
            border: `1px solid ${tema.laranja}`,
            background: `color-mix(in srgb, ${tema.fundo} 90%, transparent)`,
            color: tema.texto,
            fontFamily: "inherit",
            fontSize: 11.5,
            whiteSpace: "nowrap",
          }}
        >
          <b>Você</b> <span style={{ color: tema.apagado }}>· {titulo}</span>
        </div>
      </Html>
      {fala && (
        <Html position={[0, 1.75, -0.2]} distanceFactor={7} zIndexRange={[22, 0]} style={{ pointerEvents: "none" }}>
          <div style={{ transform: "translate(-50%, -100%)", display: "flex", alignItems: "flex-start", gap: 2 }}>
            <Balao texto={fala} tema={tema} />
            {aoFecharFala ? (
              <BotaoDescartar
                compacto
                rotulo="Fechar a fala"
                aoDescartar={aoFecharFala}
                className="pointer-events-auto"
                style={{ background: tema.texto, color: tema.fundo, boxShadow: "0 6px 18px rgba(0,0,0,.35)" }}
              />
            ) : null}
          </div>
        </Html>
      )}
    </group>
  );
}

/** A mesa de café, com a garrafa e as xícaras. */
function MesaDeCafe({ tema, aoClicar }: { tema: Tema; aoClicar?: () => void }) {
  const vapor = useRef<THREE.Mesh>(null);
  useFrame((st) => {
    if (!vapor.current) return;
    const t = st.clock.elapsedTime;
    vapor.current.position.y = 1.02 + ((t * 0.25) % 0.5);
    const m = vapor.current.material as THREE.MeshStandardMaterial;
    m.opacity = 0.32 * (1 - ((t * 0.25) % 0.5) / 0.5);
  });
  return (
    <group
      position={[CAFE.x, 0, CAFE.z]}
      onClick={(e) => {
        // Clicar na mesa de cafe e ir tomar cafe. Para a propagacao, senao
        // o clique tambem chega ao chao e manda andar para debaixo da mesa.
        e.stopPropagation();
        aoClicar?.();
      }}
    >
      {/* tampo redondo e pé */}
      <mesh position={[0, 0.74, 0]}>
        <cylinderGeometry args={[0.72, 0.72, 0.06, 32]} />
        <meshStandardMaterial color={SALA.tampo} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.37, 0]}>
        <cylinderGeometry args={[0.09, 0.22, 0.72, 16]} />
        <meshStandardMaterial color={SALA.madeira} roughness={0.7} />
      </mesh>
      {/* a garrafa térmica */}
      <mesh position={[0, 0.92, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.3, 16]} />
        <meshStandardMaterial color={tema.laranja} roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.08, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.05, 16]} />
        <meshStandardMaterial color="#15151a" />
      </mesh>
      {/* o vapor, que é o que faz a mesa parecer em uso */}
      <mesh ref={vapor} position={[0, 1.02, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {/* três xícaras, uma por lugar */}
      {LUGARES_NO_CAFE.map(([dx, dz], i) => (
        <mesh key={i} position={[dx * 0.42, 0.8, dz * 0.42]}>
          <cylinderGeometry args={[0.055, 0.045, 0.07, 12]} />
          <meshStandardMaterial color={tema.texto} roughness={0.4} />
        </mesh>
      ))}
      <Html position={[0, 1.5, 0]} center distanceFactor={6} zIndexRange={[20, 0]}>
        <div
          style={{
            padding: "3px 8px",
            borderRadius: 999,
            border: `1px solid ${tema.borda}`,
            background: `color-mix(in srgb, ${tema.fundo} 85%, transparent)`,
            color: tema.apagado,
            fontFamily: "inherit",
            fontSize: 10,
            whiteSpace: "nowrap",
          }}
        >
          café
        </div>
      </Html>
    </group>
  );
}

/** Uma planta no canto vazio da fileira da frente. Escritório sem planta é sala de espera. */
function Planta({ tema }: { tema: Tema }) {
  return (
    <group position={[2.4, 0, -1.8]}>
      {/* o vaso, com boca mais larga que a base */}
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.3, 0.2, 0.44, 16]} />
        <meshStandardMaterial color="#8a5a3c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.05, 16]} />
        <meshStandardMaterial color="#6f452e" roughness={0.9} />
      </mesh>
      {/* a terra */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.27, 0.27, 0.03, 16]} />
        <meshStandardMaterial color="#3a2c22" roughness={1} />
      </mesh>
      {/* A FOLHAGEM em massas arredondadas.

          A primeira versão eram cinco cones verdes apontando para cima, e o
          Bruno perguntou, com razão, "o que que é esses negócios verdes
          aqui?". Cone lê como pinheiro de papel; planta de escritório é
          volume irregular. Três esferas achatadas de tamanhos e verdes
          diferentes resolvem com a mesma geometria primitiva. */}
      {([
        [0, 0.78, 0, 0.3, "#3f7d46"],
        [-0.2, 0.68, 0.12, 0.23, "#4f9455"],
        [0.18, 0.66, -0.14, 0.2, "#356b3c"],
      ] as Array<[number, number, number, number, string]>).map(([x, y, z, r, cor], k) => (
        <mesh key={k} position={[x, y, z]} scale={[1, 0.78, 1]}>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={cor} roughness={0.95} flatShading />
        </mesh>
      ))}
      {/* duas folhas soltas, para a silhueta não virar uma bola só */}
      {[0.55, -0.9].map((giro, k) => (
        <mesh key={k} position={[Math.sin(giro) * 0.26, 0.9 + k * 0.08, Math.cos(giro) * 0.26]} rotation={[0.5, giro, 0.3]}>
          <sphereGeometry args={[0.13, 8, 6]} />
          <meshStandardMaterial color="#4f9455" roughness={0.95} flatShading />
        </mesh>
      ))}
    </group>
  );
}

// ── A sala: paredes, janelas e decoração ───────────────────────────────────

/** Uma janela na parede, com moldura branca e vidro azul-claro. */
function Janela({ posicao, giro = 0, largura = 1.8 }: { posicao: [number, number, number]; giro?: number; largura?: number }) {
  return (
    <group position={posicao} rotation-y={giro}>
      <mesh>
        <boxGeometry args={[largura + 0.12, 1.62, 0.06]} />
        <meshStandardMaterial color={SALA.moldura} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[largura, 1.5]} />
        <meshStandardMaterial color={SALA.vidro} emissive={SALA.vidro} emissiveIntensity={0.25} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0, 0.045]}>
        <boxGeometry args={[0.05, 1.5, 0.02]} />
        <meshStandardMaterial color={SALA.moldura} />
      </mesh>
    </group>
  );
}

/** Uma planta de canto, maior que a do corredor. */
function PlantaDeCanto({ posicao }: { posicao: [number, number, number] }) {
  return (
    <group position={posicao}>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.28, 0.22, 0.5, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      {([
        [0, 0.95, 0, 0.36, "#3f7d46"],
        [-0.22, 0.8, 0.1, 0.27, "#4f9455"],
        [0.2, 0.78, -0.12, 0.25, "#356b3c"],
        [0.05, 1.22, 0.05, 0.22, "#4f9455"],
      ] as Array<[number, number, number, number, string]>).map(([x, y, z, r, cor], k) => (
        <mesh key={k} position={[x, y, z]} scale={[1, 0.85, 1]}>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={cor} roughness={0.95} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/**
 * A SALA das referências isométricas (28/09): duas paredes com janelas, o
 * relógio e o quadro de avisos no fundo, a prateleira na lateral, o bebedouro,
 * o sofá do canto do café e as plantas. Tudo é cenário: não tem clique, e os
 * móveis que ocupam chão estão em OBSTACULOS.
 */
function Sala() {
  const alturaParede = 3.1;
  const esp = 0.22;
  const largFundo = PISO.x1 - PISO.x0;
  const profLado = PISO.z1 - PISO.z0;
  return (
    <group>
      {/* parede do fundo */}
      <mesh position={[(PISO.x0 + PISO.x1) / 2, alturaParede / 2 - 0.38 / 2, PISO.z0 - esp / 2]}>
        <boxGeometry args={[largFundo + esp, alturaParede + 0.38, esp]} />
        <meshStandardMaterial color={SALA.parede} roughness={0.9} />
      </mesh>
      <mesh position={[(PISO.x0 + PISO.x1) / 2, alturaParede - 0.19 + 0.02, PISO.z0 - esp / 2]}>
        <boxGeometry args={[largFundo + esp, 0.04, esp + 0.01]} />
        <meshStandardMaterial color={SALA.paredeTopo} />
      </mesh>
      {/* parede da esquerda */}
      <mesh position={[PISO.x0 - esp / 2, alturaParede / 2 - 0.38 / 2, (PISO.z0 + PISO.z1) / 2]}>
        <boxGeometry args={[esp, alturaParede + 0.38, profLado]} />
        <meshStandardMaterial color={SALA.parede} roughness={0.9} />
      </mesh>
      <mesh position={[PISO.x0 - esp / 2, alturaParede - 0.19 + 0.02, (PISO.z0 + PISO.z1) / 2]}>
        <boxGeometry args={[esp + 0.01, 0.04, profLado]} />
        <meshStandardMaterial color={SALA.paredeTopo} />
      </mesh>
      {/* rodapé nas duas paredes */}
      <mesh position={[(PISO.x0 + PISO.x1) / 2, 0.06, PISO.z0 + 0.01]}>
        <boxGeometry args={[largFundo, 0.12, 0.03]} />
        <meshStandardMaterial color={SALA.rodape} />
      </mesh>
      <mesh position={[PISO.x0 + 0.01, 0.06, (PISO.z0 + PISO.z1) / 2]}>
        <boxGeometry args={[0.03, 0.12, profLado]} />
        <meshStandardMaterial color={SALA.rodape} />
      </mesh>

      {/* janelas */}
      {[-3.6, 0.4, 4.4].map((x) => (
        <Janela key={x} posicao={[x, 1.65, PISO.z0 + 0.02]} />
      ))}
      {[-4.6, -0.6].map((z) => (
        <Janela key={z} posicao={[PISO.x0 + 0.02, 1.65, z]} giro={Math.PI / 2} />
      ))}

      {/* relógio */}
      <group position={[-1.6, 2.35, PISO.z0 + 0.04]}>
        <mesh rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.28, 0.28, 0.05, 32]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0.06, 0.03]}>
          <boxGeometry args={[0.025, 0.16, 0.01]} />
          <meshStandardMaterial color="#2a2a33" />
        </mesh>
        <mesh position={[0.06, 0, 0.03]}>
          <boxGeometry args={[0.13, 0.022, 0.01]} />
          <meshStandardMaterial color="#2a2a33" />
        </mesh>
      </group>

      {/* quadro de avisos, com papéis coloridos */}
      <group position={[2.4, 1.75, PISO.z0 + 0.04]}>
        <mesh>
          <boxGeometry args={[1.5, 1.0, 0.04]} />
          <meshStandardMaterial color="#8a5a3c" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0, 0.022]}>
          <planeGeometry args={[1.38, 0.88]} />
          <meshStandardMaterial color="#c69c72" roughness={1} />
        </mesh>
        {([
          [-0.45, 0.2, "#fef08a"],
          [-0.05, 0.22, "#ffffff"],
          [0.4, 0.15, "#fbcfe8"],
          [-0.3, -0.2, "#bfdbfe"],
          [0.2, -0.18, "#ffffff"],
        ] as Array<[number, number, string]>).map(([x, y, cor], k) => (
          <mesh key={k} position={[x, y, 0.028]} rotation-z={(k % 2 ? 1 : -1) * 0.06}>
            <planeGeometry args={[0.3, 0.32]} />
            <meshStandardMaterial color={cor} roughness={1} />
          </mesh>
        ))}
      </group>

      {/* prateleira na parede lateral, com livros e um vaso */}
      <group position={[PISO.x0 + 0.2, 1.9, -2.6]} rotation-y={Math.PI / 2}>
        <mesh>
          <boxGeometry args={[1.3, 0.05, 0.3]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        {["#ef6122", "#3b82f6", "#22c55e", "#eab308"].map((cor, k) => (
          <mesh key={cor} position={[-0.45 + k * 0.13, 0.18, 0]}>
            <boxGeometry args={[0.1, 0.32 - k * 0.03, 0.22]} />
            <meshStandardMaterial color={cor} roughness={0.7} />
          </mesh>
        ))}
        <mesh position={[0.4, 0.14, 0]}>
          <cylinderGeometry args={[0.08, 0.07, 0.22, 12]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.4, 0.33, 0]}>
          <icosahedronGeometry args={[0.13, 1]} />
          <meshStandardMaterial color="#4f9455" flatShading />
        </mesh>
      </group>

      {/* bebedouro, no canto do fundo */}
      <group position={[7.75, 0, -2.3]}>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.5, 1.0, 0.5]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.28, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.55, 20]} />
          <meshStandardMaterial color="#7cc4ec" transparent opacity={0.85} roughness={0.2} />
        </mesh>
      </group>

      {/* o sofá do canto do café, encostado na parede lateral */}
      <group position={[0, 0, 3.75]} rotation-y={Math.PI}>
        <mesh position={[0, 0.25, 0]}>
          <boxGeometry args={[2.0, 0.4, 0.85]} />
          <meshStandardMaterial color="#ffffff" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.62, -0.34]}>
          <boxGeometry args={[2.0, 0.55, 0.2]} />
          <meshStandardMaterial color="#ffffff" roughness={0.85} />
        </mesh>
        {[-0.95, 0.95].map((x) => (
          <mesh key={x} position={[x, 0.45, 0]}>
            <boxGeometry args={[0.14, 0.45, 0.85]} />
            <meshStandardMaterial color="#f3f4f6" roughness={0.85} />
          </mesh>
        ))}
        {[-0.45, 0.45].map((x) => (
          <mesh key={x} position={[x, 0.52, -0.18]} rotation-x={-0.25}>
            <boxGeometry args={[0.5, 0.36, 0.12]} />
            <meshStandardMaterial color={SALA.cadeira} roughness={0.85} />
          </mesh>
        ))}
      </group>

      <PlantaDeCanto posicao={[7.6, 0, -6.8]} />
      <PlantaDeCanto posicao={[-7.75, 0, -2.3]} />
    </group>
  );
}

// ── A câmera entra ──────────────────────────────────────────────────────────

function EntradaDaCamera({ reduzido }: { reduzido: boolean }) {
  const feito = useRef(reduzido);
  const inicio = useRef<number | null>(null);
  useFrame((st, dt) => {
    if (feito.current) return;
    // Prazo de 3 s: depois disso a câmera é sua, chegue ou não ao alvo. Sem
    // prazo, qualquer limite do zoom que impeça a chegada vira zoom travado.
    inicio.current ??= st.clock.elapsedTime;
    if (st.clock.elapsedTime - inicio.current > 3) {
      feito.current = true;
      return;
    }
    // Perto o bastante para o robô ter rosto: a primeira versão desta planta
    // ficava a 13 de distância e os robôs viravam pontos coloridos.
    // Na diagonal desde 28/09: é o ângulo isométrico das referências, que
    // mostra as duas paredes e a sala inteira de uma vez.
    const alvo = new THREE.Vector3(9.0, 12.4, 14.6);
    st.camera.position.lerp(alvo, 1 - Math.exp(-dt * 2.2));
    st.camera.lookAt(0, 0.5, -1.3);
    if (st.camera.position.distanceTo(alvo) < 0.02) feito.current = true;
  });
  return null;
}

// ── A cena ──────────────────────────────────────────────────────────────────

function Cena({
  situacao,
  cena,
  gesto,
  titulo,
  falaDaMesa,
  aoFecharFalaDaMesa,
  tema,
  reduzido,
  onAbrirAgente,
  conversas,
  pensando,
  onPerguntar,
  onComentarSobre,
  minhaAparencia,
}: {
  situacao: SituacaoDoSquad;
  cena: CenaAtiva | null;
  gesto: Gesto | null;
  titulo: string;
  falaDaMesa: string | null;
  aoFecharFalaDaMesa?: () => void;
  tema: Tema;
  reduzido: boolean;
  onAbrirAgente: (agentId: string) => void;
  /** O seu boneco personalizado; sem ele, o padrão de laranja. */
  minhaAparencia?: Aparencia | null;
  /** O que já foi conversado com cada agente, por agentId. Vive fora da cena. */
  conversas: Record<string, Turno[]>;
  /** De quem estamos esperando resposta agora. */
  pensando: string | null;
  onPerguntar: (agentId: string, pergunta: string) => void;
  onComentarSobre: (agentId: string, outroId: string) => void;
}) {
  /**
   * O CAFÉ, que é o que faz a sala parecer habitada.
   *
   * Quem está sem trabalho vai tomar café e conversar; quem recebe o bastão
   * volta na hora, porque a missão some e o robô senta. No máximo três por
   * vez, que é quantos lugares a mesa tem.
   */
  const [noCafe, setNoCafe] = useState<Array<{ id: string; lugar: number; fala: string; n: number }>>([]);
  const contaCafe = useRef(1000);

  // Livre é quem não está com o bastão. Inclui quem já entregou: com a semana
  // pronta, o escritório inteiro está sem trabalho, e é justamente aí que a
  // mesa de café tem que encher.
  const livres = situacao.agentes
    .filter((s) => s.estado !== "trabalhando")
    .map((s) => s.agente.id)
    .join(",");

  useEffect(() => {
    if (reduzido) return;
    const t = setInterval(() => {
      setNoCafe((antes) => {
        const disponiveis = livres.split(",").filter(Boolean);
        // Quem deixou de estar livre sai do café na hora.
        const ficam = antes.filter((c) => disponiveis.includes(c.id));
        if (ficam.length >= LUGARES_NO_CAFE.length) return ficam;
        const candidatos = disponiveis.filter((id) => !ficam.some((c) => c.id === id));
        if (candidatos.length === 0) return ficam;
        const escolhido = candidatos[Math.floor(Math.random() * candidatos.length)];
        const ocupados = new Set(ficam.map((c) => c.lugar));
        const lugar = LUGARES_NO_CAFE.findIndex((_, i) => !ocupados.has(i));
        if (lugar < 0) return ficam;
        const falas = PAPO_DE_CAFE[escolhido] ?? ["…"];
        contaCafe.current += 1;
        return [...ficam, { id: escolhido, lugar, fala: falas[Math.floor(Math.random() * falas.length)], n: contaCafe.current }];
      });
    }, 8000);
    return () => clearInterval(t);
  }, [livres, reduzido]);

  // Quem está no café volta para a mesa depois de um tempo, e o lugar abre.
  useEffect(() => {
    if (noCafe.length === 0) return;
    const t = setTimeout(() => {
      setNoCafe((antes) => {
        const [saiu, ...ficam] = antes;
        // Quem sai do cafe sai com cafe: e o turbo dos agentes.
        if (saiu) setCafeinados((c) => ({ ...c, [saiu.id]: Date.now() + CAFE_DURA_MS * 1.5 }));
        return ficam;
      });
    }, 17000);
    return () => clearTimeout(t);
  }, [noCafe]);

  // Quem atravessa a sala, para onde, e com que ânimo. O trabalho vem antes
  // do café: quem está numa cena não é chamado para a mesa.
  const missoes = useMemo(() => {
    const r: Record<string, { alvo: THREE.Vector3; n: number; bronca: boolean; demora?: number; dePe?: boolean }> = {};
    if (reduzido) return r;

    for (const c of noCafe) {
      const [dx, dz] = LUGARES_NO_CAFE[c.lugar];
      r[c.id] = {
        alvo: new THREE.Vector3(CAFE.x + dx, 0, CAFE.z + dz),
        n: c.n,
        bronca: false,
        demora: 14,
        dePe: true,
      };
    }

    if (!cena) return r;
    const de = AGENTES.findIndex((a) => a.id === cena.de);
    if (de < 0) return r;
    const bronca = cena.humor === "bronca";
    if (cena.para === "voce") {
      r[cena.de] = { alvo: pontoDeEntrega(de, "voce"), n: cena.n, bronca, demora: cena.demora };
      return r;
    }
    const para = AGENTES.findIndex((a) => a.id === cena.para);
    if (para < 0 || para === de) return r;
    r[cena.de] = { alvo: pontoDeEntrega(de, para), n: cena.n, bronca };
    return r;
  }, [cena, reduzido, noCafe]);

  /**
   * A cara de cada um. Quem cobra fica irritado, quem é cobrado fica triste,
   * quem tem aviso no log fica surpreso. O resto trabalha de cara limpa.
   */
  const humorDe = (id: string, estado: EstadoDoAgente): Humor => {
    if (cena?.humor === "bronca") {
      if (cena.de === id) return "irritado";
      if (cena.para === id) return "triste";
    }
    if (estado === "aviso") return "surpreso";
    return "neutro";
  };

  // ── Você anda pela sala ───────────────────────────────────────────────────

  const meuEstado = useRef<MeuEstado>({ posicao: MEU_LUGAR.clone(), sentado: true, cafeinadoAte: 0 });
  /**
   * QUEM ESTA COM CAFE NO SANGUE, e ate quando.
   *
   * E estado de React (e nao ref) porque o selo "☕" na plaqueta e o `turbo`
   * do Robo sao render. Um agente entra aqui quando SAI do cafe (o gole
   * aconteceu), e sai sozinho quando o prazo passa.
   */
  const [cafeinados, setCafeinados] = useState<Record<string, number>>({});
  const [meuCafeAte, setMeuCafeAte] = useState(0);
  const indoAoCafe = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      const agora = Date.now();
      setCafeinados((antes) => {
        const vivos = Object.fromEntries(Object.entries(antes).filter(([, ate]) => ate > agora));
        return Object.keys(vivos).length === Object.keys(antes).length ? antes : vivos;
      });
      setMeuCafeAte((ate) => (ate && ate <= agora ? 0 : ate));
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const teclas = useRef<Set<string>>(new Set());
  const [destino, setDestinoCru] = useState<THREE.Vector3[] | null>(null);
  // Todo destino vira caminho (ver `rota`): da sua sala para a mesa comprida
  // passa pela porta e pelo corredor, como os agentes.
  const setDestino = (alvo: THREE.Vector3 | null) =>
    setDestinoCru(alvo ? rota(meuEstado.current.posicao, alvo) : null);
  const voltando = useRef(false);
  /** Com quem dá para falar agora, e com quem o menu está aberto. */
  const [pertoDe, setPertoDe] = useState<number | null>(null);
  const [conversaCom, setConversaCom] = useState<number | null>(null);
  const controles = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  /**
   * O TECLADO, ouvido na janela.
   *
   * Digitar no campo de pergunta não pode andar com o avatar: "a" e "d" estão
   * em quase toda frase em português. Por isso a primeira coisa que o handler
   * faz é sair quando o foco está num campo.
   */
  useEffect(() => {
    if (reduzido) return;
    const MOVIMENTO = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
    const aperta = (ev: KeyboardEvent) => {
      const alvo = ev.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) {
        if (ev.key === "Escape") alvo.blur();
        return;
      }
      const k = ev.key.toLowerCase();
      if (MOVIMENTO.includes(k)) {
        teclas.current.add(k);
        voltando.current = false;
        setDestino(null);
        ev.preventDefault();
      }
      if (k === "e") setConversaCom((c) => (c === null ? pertoDe : c));
      // X senta na sua mesa; C vai tomar cafe. Pedido do Bruno em 19/09.
      if (k === "x") voltarParaMinhaMesa();
      if (k === "c") irAoCafe();
      if (k === "escape") setConversaCom(null);
    };
    const solta = (ev: KeyboardEvent) => teclas.current.delete(ev.key.toLowerCase());
    const larga = () => teclas.current.clear();
    window.addEventListener("keydown", aperta);
    window.addEventListener("keyup", solta);
    window.addEventListener("blur", larga);
    return () => {
      window.removeEventListener("keydown", aperta);
      window.removeEventListener("keyup", solta);
      window.removeEventListener("blur", larga);
    };
  }, [pertoDe, reduzido]);

  /**
   * A PROXIMIDADE e a CÂMERA, uma vez por quadro.
   *
   * Isto roda aqui e não dentro do `Voce` porque o estado de React que decide o
   * menu mora aqui. `setPertoDe` só é chamado na MUDANÇA: chamar por quadro
   * repintaria a cena 60 vezes por segundo.
   */
  useFrame((_st, dt) => {
    const eu = meuEstado.current;
    let achado: number | null = null;
    let menor = Infinity;
    if (!eu.sentado) {
      MESAS.forEach((_, i) => {
        const r = situacao.agentes[i];
        if (!r) return;
        // A distância é até a CADEIRA do agente, e não até a mesa: é onde ele
        // está quando está trabalhando, que é quando se quer falar com ele.
        const lugar = assento(i);
        const d = Math.hypot(eu.posicao.x - lugar.x, eu.posicao.z - lugar.z);
        // Entrar custa menos que sair de propósito: com um limite só, parar na
        // borda exata faz o menu abrir e fechar a cada quadro.
        const limite = conversaCom === i ? ALCANCE_SAIDA : ALCANCE;
        if (d < limite && d < menor) {
          menor = d;
          achado = i;
        }
      });
    }
    if (achado !== pertoDe) setPertoDe(achado);
    if (conversaCom !== null && achado !== conversaCom) setConversaCom(null);

    // A câmera acompanha, mas só PELA METADE. Sem isso, andar até o fundo da
    // sala põe você e o seu menu fora da tela; acompanhar inteiro perderia a
    // sala, que continua sendo o assunto.
    const orbit = controles.current;
    if (orbit) {
      const alvo = eu.sentado
        ? new THREE.Vector3(0, 0.5, -1.3)
        : new THREE.Vector3(eu.posicao.x * 0.5, 0.6, -1.3 + (eu.posicao.z + 1.3) * 0.5);
      orbit.target.lerp(alvo, 1 - Math.exp(-Math.min(dt, 0.05) * 2.4));
    }
  });

  /** Clicar no chão manda andar; clicar num agente manda andar ATÉ ele. */
  const irPara = (ponto: THREE.Vector3) => {
    if (reduzido) return;
    let maisPerto = -1;
    let menor = 2.2;
    MESAS.forEach((m, i) => {
      const d = Math.hypot(ponto.x - m.x, ponto.z - m.z);
      if (d < menor) {
        menor = d;
        maisPerto = i;
      }
    });
    const alvo = maisPerto >= 0 ? ladoDaMesa(maisPerto, meuEstado.current.posicao) : semAtravessar(ponto.clone());
    // Clicar no chão no meio da volta para a mesa CANCELA a volta. Sem esta
    // linha o avatar chegava no ponto novo e sentava ali, de pé no corredor,
    // com pose de quem está numa cadeira. Achado pelo script, não deduzido.
    voltando.current = false;
    setDestino(alvo);
  };

  function voltarParaMinhaMesa() {
    voltando.current = true;
    indoAoCafe.current = false;
    setConversaCom(null);
    setDestino(MEU_LUGAR.clone());
  }

  /** Ir tomar cafe: anda ate o lado da mesa de cafe virado para a camera. */
  function irAoCafe() {
    if (reduzido) return;
    voltando.current = false;
    indoAoCafe.current = true;
    setConversaCom(null);
    setDestino(MEU_LUGAR_NO_CAFE.clone());
  }

  return (
    <>
      <color attach="background" args={[tema.fundo]} />
      <ambientLight intensity={0.75} />
      <hemisphereLight args={["#ffffff", "#8aa4bd", 0.45]} />
      <directionalLight position={[6, 12, 8]} intensity={1.35} />
      <pointLight position={[0, 4.5, -3]} intensity={14} distance={18} decay={2} color={tema.laranja} />

      {/* O CHÃO, que também é o controle: clicar nele manda você andar até lá.

          O R3F distingue clique de arrasto sozinho (`onClick` só dispara quando
          o ponteiro não se moveu), então isto não briga com o giro da câmera,
          que usa o mesmo botão do mouse. */}
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0}
        onClick={(e) => {
          e.stopPropagation();
          irPara(e.point);
        }}
      >
        <planeGeometry args={[PISO.x1 - PISO.x0, PISO.z1 - PISO.z0]} />
        <meshStandardMaterial color={SALA.piso} roughness={0.9} />
      </mesh>
      {/* A borda da maquete: o piso tem espessura, como nas referências.
          O topo fica 2 cm ABAIXO do plano do chão. Na primeira versão (28/09)
          ele coincidia com o chão, os dois disputavam o mesmo pixel e o piso
          piscava sem parar (o Bruno viu na hora). */}
      <mesh position={[(PISO.x0 + PISO.x1) / 2, -0.21, (PISO.z0 + PISO.z1) / 2]}>
        <boxGeometry args={[PISO.x1 - PISO.x0, 0.38, PISO.z1 - PISO.z0]} />
        <meshStandardMaterial color={SALA.pisoBorda} roughness={0.9} />
      </mesh>
      {/* o corredor central, um pouco mais claro */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, CORREDOR_Z]}>
        <planeGeometry args={[PONTA_X * 2, 1.2]} />
        <meshStandardMaterial
          color={SALA.corredor}
          roughness={0.95}
          transparent
          opacity={0.55}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      <Sala />
      <MesaComprida />
      <SalaDeVidro sala={SALA_DA_VERA} rotulo="Sala da Vera · gerente do time" cor="#eab308" tema={tema} />
      <SalaDeVidro sala={SUA_SALA} rotulo="A sua sala" cor={tema.laranja} tema={tema} />
      <ContactShadows position={[0, 0.03, -1.3]} opacity={0.38} scale={18} blur={2.6} far={3} resolution={1024} frames={reduzido ? 1 : Infinity} />

      <NossaMesa tema={tema} titulo={titulo} fala={falaDaMesa} aoFecharFala={aoFecharFalaDaMesa} aoClicar={voltarParaMinhaMesa} />
      {/* VOCÊ, e agora você anda.

          Pedido do Bruno em 18/09, na sequência do avatar que só existia
          sentado: "falta andar pela sala, chegar perto de um agente e abrir
          opções". Ele continua diferente dos agentes nas quatro coisas que
          dizem que este não é um funcionário (laranja da marca, 12% maior,
          senta de costas olhando a sala, fora da esteira), e ganhou a quinta,
          que é a que muda tudo: é o único que você move.

          Clique no chão ou num agente para caminhar, WASD e setas para o
          controle fino, E para falar com quem está do lado. */}
      <Voce
        tema={tema}
        reduzido={reduzido}
        destino={destino}
        aoChegar={() => {
          setDestino(null);
          voltando.current = false;
        }}
        teclas={teclas}
        meuEstado={meuEstado}
        voltandoParaAMesa={voltando}
        indoAoCafe={indoAoCafe}
        aparencia={minhaAparencia ?? APARENCIA_PADRAO_DO_USUARIO}
        aoTomarCafe={() => {
          const ate = Date.now() + CAFE_DURA_MS;
          meuEstado.current.cafeinadoAte = ate;
          setMeuCafeAte(ate);
          indoAoCafe.current = false;
        }}
      >
        {/* O SELO DO CAFE: enquanto o turbo dura, um "☕" acima de voce. Sem
            ele, andar mais rapido parece defeito, nao efeito. */}
        {meuCafeAte > 0 && conversaCom === null && (
          <Html center distanceFactor={7} zIndexRange={[36, 0]} style={{ pointerEvents: "none" }}>
            <span
              style={{
                transform: "translate(0, -190%)",
                padding: "2px 7px",
                borderRadius: 999,
                background: `color-mix(in srgb, ${tema.fundo} 85%, transparent)`,
                border: `1px solid ${tema.laranja}`,
                color: tema.laranja,
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              ☕ mais rápido
            </span>
          </Html>
        )}
        {/* O menu fica CENTRADO na altura do peito do avatar, e não acima da
            cabeça. Ancorado no alto, uma conversa de três turnos crescia para
            cima e o topo saía pela borda do palco, que tem uns 400px: a
            resposta ficava cortada justamente na primeira linha. Centrado, ele
            cresce para os dois lados e cabe. */}
        {conversaCom !== null && situacao.agentes[conversaCom] && (
          <Html center distanceFactor={7} zIndexRange={[40, 0]} style={{ pointerEvents: "auto" }}>
            <div>
              <MenuDoAgente
                key={situacao.agentes[conversaCom].agente.id}
                agente={situacao.agentes[conversaCom].agente}
                conversa={conversas[situacao.agentes[conversaCom].agente.id] ?? []}
                pensando={pensando === situacao.agentes[conversaCom].agente.id}
                onPerguntar={(p) => onPerguntar(situacao.agentes[conversaCom].agente.id, p)}
                onComentarSobre={(outro) => onComentarSobre(situacao.agentes[conversaCom].agente.id, outro)}
                onVerTrabalhos={() => onAbrirAgente(situacao.agentes[conversaCom].agente.id)}
                onFechar={() => setConversaCom(null)}
              />
            </div>
          </Html>
        )}
        {/* O AVISO DE ALCANCE: a dica de que dá para falar, antes de o menu
            abrir. Sem ela, quem não sabe que o menu existe passa direto pelo
            agente e o avatar vira um enfeite que anda. */}
        {conversaCom === null && pertoDe !== null && situacao.agentes[pertoDe] && (
          <Html center distanceFactor={7} zIndexRange={[38, 0]} style={{ pointerEvents: "auto" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConversaCom(pertoDe);
              }}
              // Mesma razão do menu: o R3F escuta no div que envolve o canvas,
              // e sem parar o par down/up o clique neste botão também manda o
              // avatar andar para o chão que está atrás dele.
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              style={{
                transform: "translate(0, -120%)",
                padding: "3px 8px",
                borderRadius: 999,
                border: `1px solid ${tema.laranja}`,
                background: `color-mix(in srgb, ${tema.fundo} 88%, transparent)`,
                color: tema.laranja,
                font: "inherit",
                fontSize: 10.5,
                fontWeight: 700,
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              Falar com {situacao.agentes[pertoDe].agente.primeiroNome} · E
            </button>
          </Html>
        )}
      </Voce>
      <MesaDeCafe tema={tema} aoClicar={irAoCafe} />
      <Planta tema={tema} />

      {situacao.agentes.map((s, i) => {
        // O BALÃO DE TODOS, e não só de quem está com o bastão: o Bruno pediu
        // em 18/09 que "todos os agentes devem ter um chat". A ordem é: o que
        // ele está dizendo na cena, senão o último log dele, senão nada.
        const comCafe = (cafeinados[s.agente.id] ?? 0) > Date.now();
        const fala =
          (cena && cena.de === s.agente.id ? cena.fala : null) ??
          noCafe.find((c) => c.id === s.agente.id)?.fala ??
          situacao.falas[s.agente.id] ??
          (s.estado === "trabalhando" || s.estado === "aviso" ? s.detalhe : null) ??
          // Quem acabou de tomar cafe e nao tem nada para dizer diz isso.
          (comCafe ? "☕ mais rápido por um tempo" : null);
        return (
          <group key={s.agente.id}>
            <Mesa
              indice={i}
              cor={s.agente.cor}
              estado={s.estado}
              nome={s.agente.nome}
              papel={s.agente.papel}
              detalhe={s.detalhe}
              tema={tema}
              foto={arteDoAgente(s.agente.id)?.avatarPequeno}
              aoClicar={() => onAbrirAgente(s.agente.id)}
            />
            <Robo
              indice={i}
              yawFixo={sentidoDe(i) === -1 ? Math.PI : undefined}
              cor={s.agente.cor}
              estado={s.estado}
              humor={humorDe(s.agente.id, s.estado)}
              missao={missoes[s.agente.id] ?? null}
              turbo={(cafeinados[s.agente.id] ?? 0) > Date.now()}
              gesto={gesto && gesto.id === s.agente.id ? gesto : null}
              aparencia={APARENCIA_DOS_AGENTES[s.agente.id] ?? APARENCIA_PADRAO_DO_USUARIO}
              reduzido={reduzido}
              fala={fala}
              tema={tema}
              aoClicar={() => onAbrirAgente(s.agente.id)}
            />
          </group>
        );
      })}

      {/* O DEV DA DEMANDOU (06/10): baia própria com a placa da Demandou, sempre
          trabalhando, sem bastão e sem peça. Trabalha para a plataforma, então
          aparece no escritório de todo projeto. Clicar abre a ficha dele. */}
      <group key={AGENTE_DEV.id}>
        <group position={[MESA_DO_DEV.x, 0, MESA_DO_DEV.z]}>
          <Baia tema={tema} cor={AGENTE_DEV.cor} />
        </group>
        <Mesa
          indice={INDICE_DO_DEV}
          cor={AGENTE_DEV.cor}
          estado="trabalhando"
          nome={AGENTE_DEV.nome}
          papel={AGENTE_DEV.papel}
          detalhe="melhora o produto para todo mundo"
          tema={tema}
          // Sem arte de massinha gerada ainda (06/10): a placa sai sem foto em vez de imagem quebrada.
          foto={undefined}
          aoClicar={() => onAbrirAgente(AGENTE_DEV.id)}
        />
        <Robo
          indice={INDICE_DO_DEV}
          cor={AGENTE_DEV.cor}
          estado="trabalhando"
          humor="neutro"
          missao={null}
          gesto={null}
          aparencia={APARENCIA_DOS_AGENTES[AGENTE_DEV.id] ?? APARENCIA_PADRAO_DO_USUARIO}
          reduzido={reduzido}
          fala={FALA_DO_DEV}
          tema={tema}
          aoClicar={() => onAbrirAgente(AGENTE_DEV.id)}
        />
        {/* a placa da Demandou, no alto da divisória do fundo */}
        <Html position={[MESA_DO_DEV.x, 1.45, MESA_DO_DEV.z - 1.12]} center distanceFactor={9} zIndexRange={[18, 0]} style={{ pointerEvents: "none" }}>
          <div
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              background: `color-mix(in srgb, ${tema.fundo} 88%, transparent)`,
              border: `1px solid ${AGENTE_DEV.cor}`,
              color: tema.texto,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            Demandou · trabalha para a plataforma
          </div>
        </Html>
      </group>

      <EntradaDaCamera reduzido={reduzido} />
      {/* O ZOOM entrou em 18/09 a pedido do Bruno: a roda do mouse aproxima.

          Com limite dos dois lados: perto o bastante para ler a cara do robô,
          e longe o bastante para ver a sala inteira, sem deixar a pessoa se
          perder dentro de uma mesa nem sair do prédio. */}
      <OrbitControls
        ref={controles}
        target={[0, 0.5, -1.3]}
        enablePan={false}
        enableZoom
        zoomSpeed={0.7}
        minDistance={4.5}
        // 28 e não 20 (29/09): a câmera de entrada ficou a 21,8 do centro com a
        // sala nova, acima do limite, e a entrada nunca "chegava": ela puxava a
        // câmera de volta a cada quadro e a roda do mouse parecia morta.
        maxDistance={28}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0.35}
        maxPolarAngle={1.35}
        minAzimuthAngle={-0.35}
        maxAzimuthAngle={1.15}
      />
    </>
  );
}

function Montando({ tema }: { tema: Tema }) {
  return (
    <Html center zIndexRange={[20, 0]}>
      <div style={{ color: tema.apagado, fontSize: 12, whiteSpace: "nowrap", fontFamily: "inherit" }}>
        montando o escritório…
      </div>
    </Html>
  );
}

/**
 * O escritório PARA de desenhar enquanto algum vídeo da página toca, ou
 * enquanto ele está fora da tela (30/09).
 *
 * Medido no Gestor do dev local: o corte aberto no visor derrubou 262 de 356
 * quadros em 12 s (74%), e o MESMO arquivo, tocado numa página vazia, zero de
 * 300. O arquivo estava sadio (faststart, 4 Mbps); quem disputava a máquina era
 * o escritório 3D redesenhando a cena inteira a 60 quadros por segundo atrás
 * do visor. "Se não roda liso, ele não aprova": durante o vídeo, o escritório
 * congela no último quadro e volta sozinho quando o vídeo pausa ou termina.
 *
 * Os eventos de mídia não borbulham, por isso a escuta é na fase de captura
 * do documento, que vê o `play` de qualquer `<video>` sem saber onde ele mora.
 */
function useEscritorioEmPausa(canvas: React.RefObject<HTMLCanvasElement | null>): boolean {
  const [videoTocando, setVideoTocando] = useState(false);
  const [foraDaTela, setForaDaTela] = useState(false);

  useEffect(() => {
    const recalcular = () => {
      const algum = [...document.querySelectorAll("video")].some((v) => !v.paused && !v.ended);
      setVideoTocando(algum);
    };
    const eventos = ["play", "playing", "pause", "ended", "emptied"];
    for (const e of eventos) document.addEventListener(e, recalcular, true);
    return () => {
      for (const e of eventos) document.removeEventListener(e, recalcular, true);
    };
  }, []);

  useEffect(() => {
    const alvo = canvas.current;
    if (!alvo || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => setForaDaTela(!e.isIntersecting));
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [canvas]);

  return videoTocando || foraDaTela;
}

export function EscritorioDoSquad(props: {
  situacao: SituacaoDoSquad;
  cena: CenaAtiva | null;
  gesto: Gesto | null;
  titulo: string;
  falaDaMesa: string | null;
  /** O X do balão da sua mesa (07/10): fecha a fala antes de ela sumir sozinha. */
  aoFecharFalaDaMesa?: () => void;
  tema: Tema;
  reduzido: boolean;
  onAbrirAgente: (agentId: string) => void;
  conversas: Record<string, Turno[]>;
  pensando: string | null;
  onPerguntar: (agentId: string, pergunta: string) => void;
  onComentarSobre: (agentId: string, outroId: string) => void;
  minhaAparencia?: Aparencia | null;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const pausado = useEscritorioEmPausa(canvas);
  return (
    <Canvas
      ref={canvas}
      // Parado enquanto um vídeo toca ou o escritório está fora da tela (30/09).
      frameloop={pausado ? "never" : "always"}
      dpr={[1, 1.5]}
      // near 1 e não 0,1: a câmera fica a uns 18 do chão, e com near 0,1 quase
      // toda a precisão de profundidade ia para o primeiro metro, que é vazio.
      // Sobrava pouca para o piso, e as camadas dele piscavam.
      camera={{ position: [10, 12, 15], fov: 32, near: 1, far: 60 }}
      gl={{ antialias: true, powerPreference: "low-power" }}
      style={{ width: "100%", height: "100%" }}
    >
      <Suspense fallback={<Montando tema={props.tema} />}>
        <Cena {...props} />
      </Suspense>
    </Canvas>
  );
}

export default EscritorioDoSquad;
