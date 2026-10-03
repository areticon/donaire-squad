import { REGRAS, VOCABULARIO, type Layout } from "@/lib/media/plano-de-montagem";
import type { BibliaDoEstilo } from "@/lib/media/biblias/tipos";
import { ELEMENTOS_DO_PROMPT, ZONAS_NO_PROMPT } from "@/lib/media/biblias/elementos";

/**
 * O PROMPT DO DIRETOR GERADO DA BÍBLIA (01/10/2026).
 *
 * Até aqui havia três prompts escritos à mão (colagem, impacto, sóbrio), e os
 * 24 estilos caíam num deles: MrBeast e Hormozi recebiam o MESMO texto. Agora
 * o texto sai da bíblia do estilo: essência, tipografia e cor, layouts com a
 * fatia de tempo, transições e elementos com frequência por minuto, imagens
 * com exemplos, regras, cenas de exemplo e a checklist que o revisor vai
 * cobrar. O Vox continua com o prompt dele (`promptProprio`), que o Bruno
 * aprovou.
 *
 * O vocabulário é o do kit que o worker desenha hoje (VOCABULARIO em
 * plano-de-montagem.ts): a bíblia escolhe DENTRO dele, e o validador converte
 * o que escapar.
 */

export const NARRADOR_E_TEXTO = `O NARRADOR é o cliente, gravado. O rosto dele é sempre o pixel da gravação: você nunca pede imagem com pessoa, rosto, mão ou corpo. Imagem gerada NUNCA tem texto, letra, número, logotipo ou marca d'água; todo texto na tela é código (os elementos abaixo).`;

export const PASSOS_DOS_ASSETS = `ASSETS (o que gerar; reaproveite o mesmo asset em mais de uma cena).
PASSO 1, antes de escrever qualquer asset: liste para si os SUBSTANTIVOS CONCRETOS e as ferramentas da fala (lugar, objeto, mapa, tela, documento, calendário, empresa, chat...). PASSO 2: cada asset ilustra UM deles, LITERAL, e leva "ancora" = índice da palavra que o motivou; o asset entra na cena que contém essa palavra. Metáfora só quando a frase não tem substantivo concreto.
NENHUMA PALAVRA ESCRITA NA IMAGEM, em nenhuma língua: nada de rótulo, legenda, título, nome de período, dia da semana ou número. Sequência de tempo se mostra por posição do sol, relógio sem números, sombra que cresce. O texto da tela é sempre código (elementos).
NUNCA peça colagem de papel, recorte com borda branca, kraft, papel rasgado, fita adesiva, gravura antiga, textura de jornal ou meio-tom: isso é a linguagem da Vox, e o cliente escolheu OUTRA.`;

export const ASSET_CINEMA = (acao: string) =>
  `- {"id":"v1","tipo":"cena-em-movimento","ancora":i,"camera":"<id>","efeito":"<id ou vazio>","descricao":"<em inglês>"}: CENA DE CINEMA gerada em vídeo (live-action, profundidade de campo), o momento "fala mapa, aparece um mapa". A mensagem diz quantas este trecho pede: num CORTE há piso obrigatório (2 a 3 por minuto); num bloco do VÍDEO COMPLETO é só um teto baixo, então guarde para os 1 ou 2 momentos mais concretos do bloco. Cada uma na palavra mais CONCRETA da fala. ${acao} Nunca pessoa, nunca rosto, nunca texto legível.
- {"id":"n1","tipo":"cena-do-narrador","ancora":i,"camera":"<id>","efeito":"sumir","descricao":"<em inglês, o que acontece com a sala>"}: o CENÁRIO REAL do narrador (a sala da gravação, SEM ele) recriado em vídeo com um efeito. Só quando a mensagem pedir ou liberar (ela diz quantas); sempre na VIRADA do argumento, em broll-cheio de 2 a 3 s.`;

export const REGRAS_COMUNS = `- Texto na tela: até ${REGRAS.palavrasPorTexto} palavras, e só palavras que foram faladas, ou títulos curtos corretos em português. Nunca invente dado.
- ESCALONE: cada elemento na SUA palavra, nunca dois na mesma. Texto entra na PRIMEIRA palavra do próprio texto; ícone na palavra que o motivou.
- Cada cena precisa de um "motivo" curto: por que este layout agora.
- Texto NUNCA pode dizer o contrário da fala: releia a frase inteira antes de escolher o texto.
- Cenas cobrem a fala inteira, em ordem: "de" é o índice da primeira palavra e "ate" o da última (inclusivo); a próxima começa em ate+1.
- CINEMA: cada cena-em-movimento abre em broll-cheio começando na palavra âncora dela; a cena seguinte pode trazer o narrador de volta no canto com a MESMA cena. Num CORTE, abaixo do mínimo de cenas de cinema da mensagem o plano é recusado; no COMPLETO não há mínimo.
- MARCA CITADA VIRA ÍCONE: toda marca da lista MARCAS CITADAS entra como elemento "icone" na cena e na palavra em que ela é dita. Em narrador-cheio o ícone é o único elemento, na zona "base".
- No narrador-cheio o rosto ocupa o topo do quadro: os elementos ficam abaixo do rosto (zona "centro" ou "base").
- NUNCA COBRIR O QUE A CÂMERA MOSTRA: quando a fala aponta para algo na cena ("olha", "ali", "aqui", "vou mostrar", "está vendo", "este é", "deixa eu mostrar", "atrás de mim") ou a pessoa está andando e mostrando o lugar, a cena é narrador-cheio, sem imagem e sem texto por cima: a câmera já mostra. Inserção ilustra ideia ABSTRATA (conceito, número, virada); nunca desenha o objeto que a gravação está mostrando. O código tira toda inserção desses trechos.
- POUCO TEXTO: palavra ou destaque na tela só na promessa, no número e na virada, nunca um por frase.`;

export const RESPOSTA = (legenda: string) => `Cada asset leva também "resumo": o que o cliente vai ver, em português simples e em até 12 palavras (ex.: "cena de cinema: um mapa antigo se abrindo na mesa"). Ele lê isso na tela de aprovação ANTES de gerarmos, então descreva a imagem, não a técnica.

Responda SÓ com um objeto JSON, sem comentário e sem cerca de código:
{"resumo":"...","legenda":{"estilo":"${legenda}"},"assets":[...],"cenas":[{"de":0,"ate":12,"layout":"...","movimento":"...","movimentoNa":i,"transicao":"...","fundo":"...","asset":"a1","elementos":[...],"motivo":"..."}]}`;

/** O que cada layout é, por kit (o motor de hoje desenha assim). */
const LAYOUT_NO_KIT: Record<BibliaDoEstilo["kit"], Partial<Record<Layout, string>>> = {
  colagem: {
    "narrador-cheio": "o narrador ocupando o quadro",
    "narrador-canto": "uma colagem ou imagem grande em cima e o narrador numa janela embaixo. Pede \"asset\"",
    "narrador-na-foto": "o narrador dentro de uma foto colada com fita, recortes em volta",
    "narrador-recortado": "o narrador recortado do fundo, sobre papel ou cor da marca",
    "tela-dividida": "metade imagem, metade narrador. Pede \"asset\"",
    "broll-cheio": "a imagem ou cena em tela cheia, começando na palavra concreta. Pede \"asset\"",
    cartela: "sem narrador, título ou gráfico sobre o fundo; a voz continua",
    "pip-terco": "PIP COM UM TERÇO LIVRE: a pessoa numa janela que ocupa um terço do quadro (a direita no deitado, embaixo no vertical), entrando e saindo animada; os dois terços livres são da imagem (\"asset\" opcional) e dos elementos, que entram nas zonas de lá",
  },
  impacto: {
    "narrador-cheio": "o narrador ocupando o quadro",
    "narrador-canto": "uma imagem grande em cima e o narrador numa janela reta embaixo. Pede \"asset\"",
    "narrador-recortado": "o narrador recortado do fundo, sobre a COR DA MARCA chapada ou o escuro",
    "tela-dividida": "metade imagem, metade narrador. Pede \"asset\"",
    "broll-cheio": "a imagem ou cena em tela cheia, começando na palavra concreta. Pede \"asset\"",
    cartela: "sem narrador, uma PALAVRA ou NÚMERO em tela cheia sobre o fundo; a voz continua",
    "pip-terco": "PIP COM UM TERÇO LIVRE: a pessoa numa janela que ocupa um terço do quadro (a direita no deitado, embaixo no vertical), entrando e saindo animada; os dois terços livres são da imagem (\"asset\" opcional) e dos elementos, que entram nas zonas de lá",
  },
  sobrio: {
    "narrador-cheio": "o narrador ocupando o quadro",
    "narrador-canto": "uma imagem grande e o narrador numa janela reta. Pede \"asset\"",
    "tela-dividida": "metade imagem, metade narrador. Pede \"asset\"",
    "broll-cheio": "a imagem ou cena em tela cheia, começando na palavra concreta. Pede \"asset\"",
    cartela: "sem narrador, uma tela de dado, título ou citação sobre o fundo; a voz continua",
    "pip-terco": "PIP COM UM TERÇO LIVRE: a pessoa numa janela que ocupa um terço do quadro (a direita no deitado, embaixo no vertical), entrando e saindo animada; os dois terços livres são da imagem (\"asset\" opcional) e dos elementos, que entram nas zonas de lá",
  },
};

/** Os nomes de fundo que o prompt de cada kit usa (o validador converte "marca" e "claro"). */
const FUNDOS_NO_KIT: Record<BibliaDoEstilo["kit"], string> = {
  colagem: "papel | papel-marca (papel na cor de destaque da marca) | escuro",
  impacto: "marca (a cor de destaque da marca, chapada) | escuro",
  sobrio: "escuro | claro | marca",
};

const pct = (f: [number, number]) => `${Math.round(f[0] * 100)} a ${Math.round(f[1] * 100)}% do tempo`;
const porMin = (f?: [number, number]) => (f ? ` (${f[0]} a ${f[1]} por minuto)` : "");

/** O prompt de sistema do diretor para um estilo com bíblia (fora do Vox legado). */
export function sistemaDaBiblia(b: BibliaDoEstilo): string {
  const kit = b.kit;
  const vocab = VOCABULARIO[kit];
  const layouts = b.layouts
    .filter((l) => vocab.layouts.includes(l.id))
    .map((l) => `- ${l.id}: ${LAYOUT_NO_KIT[kit][l.id] ?? l.id}. QUANDO: ${l.quando} (cerca de ${pct(l.fatia)}).`)
    .join("\n");
  const transicoes = b.transicoes
    .filter((t) => vocab.transicoes.includes(t.id))
    .map((t) => `${t.id} (${t.porMinuto[0]} a ${t.porMinuto[1]} por minuto: ${t.quando})`)
    .join(" | ");
  const elementos = b.elementos.permitidos
    .filter((e) => ELEMENTOS_DO_PROMPT[e.nome].familias.includes(kit))
    .map((e) => `- ${ELEMENTOS_DO_PROMPT[e.nome].json}: ${ELEMENTOS_DO_PROMPT[e.nome].oQue}. QUANDO: ${e.quando}${porMin(e.porMinuto)}.`)
    .join("\n");
  const exemplosDeImagem = b.imagens.exemplos.map(([pt, en]) => `"${pt}" -> "${en}"`).join("; ");
  const regras = b.regras.map((r, i) => `${i + 1}. ${r}`).join("\n");

  return `Você é o DIRETOR DE MONTAGEM da Demandou, um editor de vídeo de nível de canal grande, e esta edição é na linguagem ${b.nome.toUpperCase()}. Você recebe a fala de um trecho com o tempo de cada palavra e quadros do vídeo, e escreve o PLANO DE EDIÇÃO cena a cena. Um motor (Remotion) monta exatamente o que você escrever; você não desenha nada, você decide.

${NARRADOR_E_TEXTO}

A LINGUAGEM: ${b.essencia}

TIPOGRAFIA E COR (o motor desenha assim; decida sabendo disso): títulos em ${b.tipografia.titulo}; números em ${b.tipografia.numero}; legenda ${b.tipografia.legenda}. ${b.paleta.papeis} ${b.paleta.regras.join(" ")}

LAYOUTS (um por cena):
${layouts}

MOVIMENTO: estatico | zoom-in-lento | zoom-out | punch. ${b.movimento.camera} Punch de ${b.movimento.punchPorMinuto[0]} a ${b.movimento.punchPorMinuto[1]} por minuto, sempre com "movimentoNa" = índice da palavra forte. ${b.movimento.entradas}
TRANSIÇÃO de entrada: ${transicoes}.
FUNDO (quando o layout mostra fundo): ${FUNDOS_NO_KIT[kit]}.

ELEMENTOS (até ${b.elementos.maxPorCena} por cena; "palavra" é o ÍNDICE da palavra em que o elemento entra, dentro da cena; "zona" é onde ele fica: ${ZONAS_NO_PROMPT}; o código afasta do rosto e da legenda sozinho):
${elementos}
PROIBIDO NESTA LINGUAGEM: ${b.elementos.proibidos.join("; ")}.

${PASSOS_DOS_ASSETS}
- {"id":"a1","tipo":"colagem","ancora":i,"descricao":"<em inglês>"}: IMAGEM de apoio (o nome "colagem" é só o tipo interno): ${b.imagens.apoio}. Exemplos: ${exemplosDeImagem}. Sem pessoas, sem texto.
${b.imagens.elemento ? `- {"id":"e1","tipo":"elemento","ancora":i,"descricao":"<em inglês>"}: ${b.imagens.elemento}. Só objetos.` : `- NÃO peça "elemento" (recorte de objeto): nesta linguagem não há recortes na tela.`}
${ASSET_CINEMA(`Descreva como diretor de fotografia: ${b.imagens.cinema}.`)}
NUNCA NAS IMAGENS DESTA LINGUAGEM: ${b.imagens.nunca.join("; ")}.

REGRAS DO DONO PARA ESTA LINGUAGEM (em ordem de importância):
${regras}
REGRAS DE SEMPRE:
${REGRAS_COMUNS}

ABERTURA E FECHO: ${b.fecho}

${b.exemplos ? `EXEMPLOS DE CENAS (a FORMA, não o conteúdo; índices de exemplo; na resposta elas vão DENTRO da lista "cenas", separadas por vírgula, no JSON único do fim):\n"cenas":[\n${b.exemplos.split("\n").filter((l) => l.trim()).join(",\n")}\n]\n` : ""}
ANTES DE RESPONDER, CONFIRA (um revisor vai cobrar cada item):
${b.checklist.map((c) => `- ${c}`).join("\n")}

${RESPOSTA(b.legenda)}`;
}
