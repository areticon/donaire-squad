import { askClaude, askClaudeComImagem, DEFAULT_MODEL, type AskOptions } from "@/lib/claude";
import { estiloDoCatalogo, normalizarEscolha, MOVIMENTOS_DE_CAMERA, EFEITOS, LOOKS } from "@/lib/media/catalogo-de-estilos";
import { ARTE_DA_LINGUAGEM, nomeDaCor } from "@/lib/media/direcao-de-arte";
import { coresDaMarca, familiaDaLinguagem, type FamiliaDaCapa } from "@/lib/media/capa-composta";
import { marcasNaFala } from "@/lib/media/marcas-na-fala";
import type { PedidoDoCliente } from "@/lib/media/plano-de-montagem";
import { garantirRitmo, JANELA_DO_CURTO_SEG } from "@/lib/media/ritmo-da-edicao";
import { bibliaDoEstilo, type BibliaDoEstilo } from "@/lib/media/biblias";
import { sistemaDaBiblia } from "@/lib/media/biblias/prompt-do-diretor";
import { ajustarAoEstilo } from "@/lib/media/biblias/ajuste";
import { metasDoProjeto, metasNoPrompt } from "@/lib/media/metas-do-estilo";
import { perfilDoProjeto, perfilNoPrompt, type PerfilDoProjeto } from "@/lib/media/perfil-do-projeto";
import {
  LAYOUTS,
  REGRAS,
  apararCenas,
  cenasGeradasDoTrecho,
  type ModoDaMontagem,
  type TetosDoTrecho,
  ZONAS,
  validarPlano,
  type Formato,
  type PalavraNoCorte,
  type PlanoDeMontagem,
  type Retangulo,
} from "@/lib/media/plano-de-montagem";

/**
 * O DIRETOR DE MONTAGEM (30/09/2026): o Claude lê a fala com tempos e os
 * quadros do vídeo e escreve o plano de edição cena a cena, como no vídeo de
 * referência que o dono pediu ("O vídeo que o Opus editou sozinho"). Quem
 * monta é o Remotion no worker; aqui só se DECIDE.
 *
 * ## O que é do diretor e o que é do código
 *
 * Do diretor: o que entra em cada segundo (layout, movimento, transição,
 * elementos, o que gerar de imagem). É julgamento editorial, e é para isso que
 * vale o modelo mais forte.
 *
 * Do código (lib/media/plano-de-montagem.ts): tudo que dá para GARANTIR. Cena
 * sem buraco, âncora em palavra real, texto só com palavra falada, B-roll
 * curto, teto de cenas geradas por minuto, e principalmente a geometria: o
 * diretor escolhe uma ZONA, e o código põe o elemento onde não cobre o rosto.
 * Pedir ao modelo coordenada em pixel seria pedir o que ele erra.
 *
 * ## A linguagem é do cliente, as cores são da marca
 *
 * "Estilo Vox" é a linguagem da Vox com as cores do cliente (regra de
 * docs/estilos-de-edicao-de-video.md). O prompt leva a ficha da linguagem
 * escolhida no catálogo, as camadas (câmera, efeitos, look), o nicho e as
 * cores da marca por NOME: com o código hex no texto, o modelo de imagem
 * escreveu o código dentro da arte (teste de 30/09).
 *
 * ## A bíblia do estilo (01/10)
 *
 * Cada linguagem tem uma bíblia (lib/media/biblias): o prompt de sistema sai
 * dela (menos o Vox, que mantém o texto aprovado), as METAS de ritmo saem dela
 * ajustadas pelo nicho (metas-do-estilo.ts), e o PERFIL do projeto (setor,
 * público, tom e guardas do setor, perfil-do-projeto.ts) vai na mensagem. O
 * que a bíblia garante em número (teto de fundo escuro) o código confere
 * depois do validador (biblias/ajuste.ts).
 */

export type EntradaDoDiretor = {
  projectId?: string;
  /** Referência para o log (id do VideoJob e índice do corte). */
  referencia: string;
  palavras: PalavraNoCorte[];
  duracao: number;
  formato: Formato;
  /** Rosto e pessoa em fração do quadro da gravação. */
  rosto: Retangulo | null;
  pessoa: Retangulo | null;
  /** Project.videoEstiloEscolha, cru. */
  escolha: unknown;
  videoStyle?: string | null;
  colorPalette?: string | null;
  nicho?: string | null;
  /** Título do corte, quando existe: ajuda o diretor a achar a tese. */
  titulo?: string | null;
  /** Mosaico de quadros do trecho (JPEG em base64), para o diretor VER o vídeo. */
  mosaico?: { base64: string; legenda: string } | null;
  /**
   * Descrições do catálogo de recortes do projeto (assets-da-montagem.ts,
   * `recortesDoProjeto`): com a descrição exata, o recorte sai de graça.
   */
  recortesProntos?: string[];
  /**
   * Instrução de quem chama, além da fala (30/09, vídeo completo por blocos):
   * o resumo do vídeo, o que os blocos anteriores já usaram, os trechos em
   * tela compartilhada e os tetos do bloco. Ver lib/media/montagem-do-completo.ts.
   */
  contexto?: string | null;
  /**
   * Corte (9:16, com piso de cinema) ou bloco do vídeo completo (sem piso;
   * tetos de quem chama). Sem o campo: 16:9 é completo e 9:16 é corte, que é
   * como a esteira usa hoje.
   */
  modo?: ModoDaMontagem;
  /** Tetos de cena gerada deste trecho (no completo, a fatia do bloco). */
  tetos?: TetosDoTrecho;
  /**
   * Esforço de raciocínio (01/10). Sem ele, o padrão do modelo (alto). O bloco
   * do completo vai em "medium": na prova de 01/10 com o Sonnet 5, 5 de 6
   * blocos de 3,5 min gastaram os 32 mil tokens pensando e não responderam.
   */
  esforco?: "low" | "medium" | "high";
  /**
   * O perfil do projeto (01/10). Sem o campo, o diretor lê pelo `projectId`;
   * `null` explícito pula a leitura (prova sem banco).
   */
  perfil?: PerfilDoProjeto | null;
};

export type SaidaDoDiretor = {
  plano: PlanoDeMontagem;
  avisos: string[];
  /** Erros que sobraram depois da segunda rodada (já consertados por corte). */
  errosRestantes: string[];
  rodadas: number;
  modelo: string;
};

function fichaDaLinguagem(
  escolhaBruta: unknown,
  videoStyle: string | null | undefined,
  cores: ReturnType<typeof coresDaMarca>,
  perfil: PerfilDoProjeto | null = null
) {
  const escolha = normalizarEscolha(escolhaBruta, videoStyle);
  const estilo = estiloDoCatalogo(escolha.estiloId);
  const biblia = bibliaDoEstilo(escolha.estiloId);
  // A família do VALIDADOR é o kit da bíblia (o mesmo de familiaDaLinguagem).
  const familia: FamiliaDaCapa = biblia.kit ?? familiaDaLinguagem(escolha.estiloId);
  const metas = metasDoProjeto(biblia, perfil?.ritmoDoNicho);
  const nome = (lista: { id: string; nome: string; resumo: string }[], ids: string[]) =>
    ids.map((id) => lista.find((o) => o.id === id)).filter(Boolean).map((o) => `${o!.nome} (${o!.resumo})`);
  const linhas = [
    `Linguagem: ${estilo?.nome ?? escolha.estiloId}${estilo?.referencia ? ` (${estilo.referencia})` : ""}. ${estilo?.resumo ?? ""}`,
    `Visual desta linguagem: ${ARTE_DA_LINGUAGEM[escolha.estiloId]?.pt ?? biblia.essencia}.`,
    `METAS DESTE PROJETO (a bíblia do estilo${metas.peso > 0 ? ", ajustada ao nicho" : ""}; nunca cena acima de ${REGRAS.cenaMaxSeg} s):\n${metasNoPrompt(metas)}`,
  ];
  const doPerfil = perfilNoPrompt(perfil);
  if (doPerfil) linhas.push(doPerfil);
  const cam = nome(MOVIMENTOS_DE_CAMERA, escolha.camera);
  const efe = nome(EFEITOS, escolha.efeitos);
  const look = escolha.look ? nome(LOOKS, [escolha.look]) : [];
  if (cam.length) linhas.push(`Movimentos de câmera que o cliente escolheu: ${cam.join("; ")}.`);
  if (efe.length) linhas.push(`Efeitos que o cliente escolheu: ${efe.join("; ")}.`);
  if (look.length) linhas.push(`Look: ${look.join("; ")}.`);
  if (escolha.texto) linhas.push(`O cliente escreveu sobre o estilo: "${escolha.texto}".`);
  // Os ids que o validador aceita em "camera" e "efeito" das cenas geradas;
  // os do cliente vêm primeiro, e a cena de cinema gira entre eles.
  const ids = (lista: { id: string }[], preferidos: string[]) => [...preferidos, ...lista.map((o) => o.id).filter((id) => !preferidos.includes(id))];
  linhas.push(`Ids de "camera" para as cenas geradas (os primeiros são os do cliente): ${ids(MOVIMENTOS_DE_CAMERA, escolha.camera).join(", ")}.`);
  linhas.push(`Ids de "efeito" para as cenas geradas (opcional; "sumir" é a desintegração em partículas): ${ids(EFEITOS, escolha.efeitos).join(", ")}.`);
  linhas.push(
    `Cores da marca (use SÓ estas, por nome, nas descrições de imagem): destaque ${nomeDaCor(cores.acento)}, escuro ${nomeDaCor(cores.escuro)}${familia === "colagem" ? " (só em tinta, fotos P&B e sombras, NUNCA como fundo)" : ""}, claro ${nomeDaCor(cores.claro)}.`
  );
  return { texto: linhas.join("\n"), familia, escolha, biblia, metas };
}

/** O prompt de sistema do estilo: o do Vox aprovado, ou o gerado da bíblia. */
export function sistemaDoEstilo(b: BibliaDoEstilo): string {
  return b.promptProprio === "colagem-legado" ? SISTEMA_COLAGEM : sistemaDaBiblia(b);
}

/** O perfil do projeto que a entrada trouxe, ou o lido pelo projeto (null quando a entrada pede). */
async function perfilDaEntrada(e: { perfil?: PerfilDoProjeto | null; projectId?: string | null }): Promise<PerfilDoProjeto | null> {
  if (e.perfil !== undefined) return e.perfil;
  return perfilDoProjeto(e.projectId);
}

/**
 * O prompt da família COLAGEM (Vox, Johnny Harris, Kurzgesagt...): o texto de
 * sempre, intocado. As outras famílias têm o delas logo abaixo; antes de
 * 30/09 este era o único, e um cliente que escolheu Hormozi ou BBC recebia
 * papel, kraft, fita, letras de revista e carimbo.
 */
const SISTEMA_COLAGEM = `Você é o DIRETOR DE MONTAGEM da Demandou, um editor de vídeo de nível de canal grande (Vox, Johnny Harris, Dan Martell). Você recebe a fala de um corte com o tempo de cada palavra e quadros do vídeo, e escreve o PLANO DE EDIÇÃO cena a cena. Um motor (Remotion) monta exatamente o que você escrever; você não desenha nada, você decide.

O NARRADOR é o cliente, gravado. O rosto dele é sempre o pixel da gravação: você nunca pede imagem com pessoa, rosto, mão ou corpo. Imagem gerada NUNCA tem texto, letra, número, logotipo ou marca d'água; todo texto na tela é código (os elementos abaixo).

LAYOUTS (um por cena):
- narrador-cheio: o narrador ocupando o quadro. Use nas frases de EMOÇÃO, confissão, virada, chamada para ação.
- narrador-canto: uma colagem/imagem grande em cima e o narrador numa janela de cantos arredondados embaixo. Use quando há um CONCEITO a ilustrar, e logo DEPOIS de um broll-cheio de cinema, com a MESMA cena no alto (o narrador volta no canto). Pede "asset" (colagem, cena-em-movimento ou cena-do-narrador).
- narrador-na-foto: o narrador dentro de uma "foto" colada com fita, no meio de uma colagem de papel; recortes de objetos em volta. Use para apresentar quem fala, prova pessoal, bastidor.
- narrador-recortado: o narrador recortado do fundo (sem cenário), sobre papel ou cor da marca. Troca de fundo, ênfase, tom de revista.
- tela-dividida: metade imagem, metade narrador. Contraste, antes e depois, comparação.
- broll-cheio: a CENA DE CINEMA em tela cheia, CURTO (2 a 4 s), começando na palavra concreta que ela ilustra. Pede "asset" (cena-em-movimento ou cena-do-narrador; colagem só na falta).
- cartela: sem narrador, um título em letras de revista ou um gráfico sobre papel, a voz continua. Curta (2 a 4 s).

MOVIMENTO: estatico | zoom-in-lento (aproximação lenta quando fala algo importante) | zoom-out (afastamento, abre o assunto) | punch (zoom rápido na palavra forte).
TRANSIÇÃO de entrada: corte | folha-de-papel (uma folha passa pela frente; troca de bloco) | deslize | flash (revelação). Use folha-de-papel com parcimônia (2 a 4 por minuto), corte seco é a base.
FUNDO (quando o layout mostra fundo): papel | papel-marca (papel na cor de destaque da marca) | escuro. Troque o fundo entre blocos.

ELEMENTOS (até ${REGRAS.elementosPorCena} por cena; na linguagem de COLAGEM até ${REGRAS.elementosPorCenaColagem}, e nas cenas de canto, foto, recortado e cartela use de 4 a ${REGRAS.elementosPorCenaColagem}, com pelo menos 2 recortes: a referência tem 5 a 9 recortes por quadro. "palavra" é o ÍNDICE da palavra em que o elemento entra, dentro da cena; "zona" é onde ele fica: ${ZONAS.join(", ")}; o código afasta do rosto e da legenda sozinho):
- {"tipo":"recorte","asset":"<id de asset tipo elemento>","zona":...,"palavra":i,"entrada":"cair"|"deslizar"|"pop","tamanho":"p"|"m"|"g"}: o objeto do SUBSTANTIVO dito, em gravura recortada com borda branca e sombra. Entra na palavra que o motivou; caem e se acumulam. Misture tamanhos p, m e g.
- {"tipo":"icone","marca":"<id da lista MARCAS CITADAS>","zona":...,"palavra":i,"entrada":"pop"|"cair","tamanho":"p"|"m"|"g"}: o LOGO OFICIAL da marca citada, recortado em papel (desenhado em código, sem custo). Só marca que está na lista e só na cena em que ela é dita.
- {"tipo":"marca-texto","texto":"...","zona":...,"palavra":i}: frase-chave FALADA (até ${REGRAS.palavrasPorTexto} palavras, exatamente como foi dita) em papel com marca-texto na cor da marca.
- {"tipo":"letras-revista","texto":"...","zona":...,"palavra":i}: título de 1 a ${REGRAS.palavrasPorTitulo} palavras (até ${REGRAS.letrasPorTitulo} letras) montado com letras recortadas de revista. Português correto.
- {"tipo":"carimbo","texto":"...","zona":...,"palavra":i}: carimbo de 1 a ${REGRAS.palavrasPorTitulo} palavras (ex.: "PROVADO", "20 DIAS").
- {"tipo":"tarja","texto":"...","zona":...,"palavra":i}: tarja de terminal que digita a fala (até ${REGRAS.palavrasPorTexto} palavras FALADAS).
- {"tipo":"numero","valor":N,"prefixo":"","sufixo":"","rotulo":"...","zona":...,"palavra":i}: número grande que conta até N. Só número DITO na fala.
- {"tipo":"barras","titulo":"...","itens":[{"rotulo":"...","valor":N,"texto":"..."}],"zona":...,"palavra":i}: gráfico de barras em código. "valor" pode ser convertido para a mesma unidade (12 meses = 365 dias), mas "texto" mostra o número como foi dito ("12 meses").
- {"tipo":"seta"|"circulo","zona":...,"palavra":i}: traço desenhado à mão apontando/circulando algo.

ASSETS (o que gerar; reaproveite o mesmo asset em mais de uma cena).
PASSO 1, antes de escrever qualquer asset: liste para si os SUBSTANTIVOS CONCRETOS e as ferramentas da fala (lugar, objeto, mapa, tela, documento, calendário, empresa, chat...). PASSO 2: cada asset ilustra UM deles, LITERAL, e leva "ancora" = índice da palavra que o motivou; o asset entra na cena que contém essa palavra. Metáfora só quando a frase não tem substantivo concreto. Nunca foto de produto, nunca render 3D, nunca fundo escuro.
NENHUMA PALAVRA ESCRITA NA IMAGEM, em nenhuma língua: nada de rótulo, legenda, título, nome de período ("morning", "noon"), dia da semana ou número. A descrição nunca pede rótulo; sequência de tempo se mostra por posição do sol, relógio sem números, sombra que cresce; calendário é grade de quadrados vazios. O texto da tela é sempre código (elementos).
- {"id":"a1","tipo":"colagem","ancora":i,"descricao":"<em inglês>"}: composição inteira de colagem de papel com o substantivo dito (gravuras e recortes P&B sobre papel claro ou kraft, uma cor de destaque). Exemplos: "chat" -> "an old computer terminal window cut from paper, with blank speech bubbles"; "software" -> "a floppy disk and a motherboard as vintage engravings"; "contexto" -> "a stack of manila folders and index cards". Sem pessoas, sem texto.
- {"id":"e1","tipo":"elemento","ancora":i,"descricao":"<em inglês>"}: UM objeto só, que vira gravura de enciclopédia recortada com borda branca (ex.: "vintage scissors", "human eye", "old film camera", "film reel", "brass compass", "hourglass", "desk calendar"). Só objetos: nada de parte de corpo ou rosto. Peça de 6 a 12 por minuto; os RECORTES PRONTOS do projeto (lista na mensagem) saem de graça se você usar a descrição EXATA.
- {"id":"v1","tipo":"cena-em-movimento","ancora":i,"camera":"<id>","efeito":"<id ou vazio>","descricao":"<em inglês>"}: CENA DE CINEMA gerada em vídeo (live-action, 35 mm, profundidade de campo), o momento "fala mapa, aparece um mapa". A mensagem diz quantas este trecho pede: num CORTE há piso obrigatório (2 a 3 por minuto); num bloco do VÍDEO COMPLETO é só um teto baixo para o vídeo inteiro, então guarde para os 1 ou 2 momentos mais concretos do bloco. Cada uma na palavra mais CONCRETA ou na metáfora mais forte da fala. Descreva como diretor de fotografia: o que se vê, a luz, a textura, UMA ação simples (ex.: "twelve paper calendar pages tearing off one by one and flying away in warm window light"; "an antique map unrolling on a wooden desk, dust in a beam of light"). Nunca pessoa, nunca rosto, nunca texto legível (tela, placa ou livro sem letras ou desfocados).
- {"id":"n1","tipo":"cena-do-narrador","ancora":i,"camera":"<id>","efeito":"sumir","descricao":"<em inglês, o que acontece com a sala>"}: o CENÁRIO REAL do narrador (a sala da gravação, SEM ele: o código tira a pessoa antes) recriado em vídeo com um efeito, de preferência a desintegração em partículas ("sumir"). Num CORTE de ${REGRAS.cenaDoNarradorAPartirDe} s ou mais: exatamente ${REGRAS.cenasDoNarradorPorCorte}; no VÍDEO COMPLETO só quando a mensagem liberar. Sempre na VIRADA do argumento, em broll-cheio de 2 a 3 s (o texto da virada pode ficar por cima como carimbo).

REGRAS DO DONO:
1. Varie o layout a cada 4 a 8 s; nunca dois layouts iguais seguidos, exceto narrador-cheio.
2. Narrador cheio nas frases de emoção; canto quando há conceito a ilustrar; B-roll cheio curto (2 a 4 s).
3. Texto na tela: até ${REGRAS.palavrasPorTexto} palavras, e só palavras que foram faladas, ou títulos curtos corretos em português. Nunca invente dado.
4. Os primeiros 2 s prendem: narrador-na-foto com 2 a 3 recortes caindo em palavras diferentes, OU letras de revista com a promessa, OU uma cena de cinema; narrador-cheio com punch só quando a primeira frase é emoção pura.
5. ESCALONE: cada elemento na SUA palavra, nunca dois na mesma. Texto (marca-texto, tarja, letras, carimbo) entra na PRIMEIRA palavra do próprio texto; recorte e ícone na palavra que os motivou. Numa cena de 4 s ou mais algo novo entra pelo menos a cada 2 s.
6. Cada cena precisa de um "motivo" curto: por que este layout agora.
7. Título, carimbo ou marca-texto NUNCA pode dizer o contrário da fala: se ele diz "não é nem estagiário bem treinado", o carimbo não pode ser "BEM TREINADO" (seria "MAL TREINADO" ou o trecho inteiro no marca-texto). Releia a frase inteira antes de escolher o texto.
8. No narrador-cheio a cabeça ocupa o topo do quadro: cabe UM elemento só, na zona "base". Guarde os elementos para os layouts com espaço (canto, foto, recortado, cartela).
9. Cenas cobrem a fala inteira, em ordem: "de" é o índice da primeira palavra e "ate" o da última (inclusivo); a próxima começa em ate+1.
10. CINEMA: cada cena-em-movimento abre em broll-cheio de 2 a 4 s começando na palavra âncora dela; a cena seguinte pode trazer o narrador de volta no canto com a MESMA cena. Num CORTE, abaixo do mínimo de cenas de cinema da mensagem o plano é recusado; no COMPLETO não há mínimo.
11. MARCA CITADA VIRA ÍCONE: toda marca da lista MARCAS CITADAS entra como elemento "icone" na cena que contém a palavra em que ela é dita, naquela palavra. Em narrador-cheio o ícone é o único elemento, na zona "base".

Cada asset leva também "resumo": o que o cliente vai ver, em português simples e em até 12 palavras (ex.: "cena de cinema: um mapa antigo se abrindo na mesa"). Ele lê isso na tela de aprovação ANTES de gerarmos, então descreva a imagem, não a técnica.

Responda SÓ com um objeto JSON, sem comentário e sem cerca de código:
{"resumo":"...","legenda":{"estilo":"papel"|"destaque"|"limpa"},"assets":[...],"cenas":[{"de":0,"ate":12,"layout":"...","movimento":"...","transicao":"...","fundo":"...","asset":"a1","elementos":[...],"motivo":"..."}]}`;

// Os prompts de impacto e sóbrio escritos à mão (30/09) saíram em 01/10: o
// prompt fora do Vox é gerado da bíblia do estilo (lib/media/biblias/
// prompt-do-diretor.ts). Cópia dos antigos em scratchpad/bak-estilos-0110.

/** O modo explícito, ou o que a esteira usa hoje: 16:9 é o completo, 9:16 é corte. */
function modoDaEntrada(e: EntradaDoDiretor): ModoDaMontagem {
  return e.modo ?? (e.formato === "16:9" ? "completo" : "corte");
}

function mensagem(e: EntradaDoDiretor, ficha: string, legendaPadrao: string, mudancaSeg = 5): string {
  // A janela do ritmo do curto é a meta do estilo (01/10): 4 a 6 s servia ao
  // Vox e à BBC, e deixava o MrBeast parado; o teto continua 6 s.
  const janela = Math.min(6, Math.max(1.5, mudancaSeg));
  const janelaTxt = janela.toFixed(1).replace(".0", "").replace(".", ",");
  const fala = e.palavras.map((p, i) => `${i}|${p.inicio.toFixed(2)}|${p.texto}`).join("\n");
  // As menções saem do código (lista fechada de marcas com ícone oficial): o
  // diretor não precisa adivinhar se "Cloud" é Claude, e não inventa logo.
  const marcas = marcasNaFala(e.palavras);
  // O mesmo piso e teto que o validador cobra (plano-de-montagem.ts).
  const modo = modoDaEntrada(e);
  const n = cenasGeradasDoTrecho(e.duracao, modo, e.tetos);
  const cenario =
    n.tetoDoCenario === 0 ? `nenhuma "cena-do-narrador" (não peça)` : n.pisoDoCenario > 0 ? `exatamente ${n.pisoDoCenario} "cena-do-narrador"` : `até ${n.tetoDoCenario} "cena-do-narrador"`;
  const cinema =
    modo === "completo"
      ? `MODO: BLOCO DO VÍDEO COMPLETO. CENAS DE CINEMA neste bloco: no máximo ${n.teto} "cena-em-movimento", nenhuma obrigatória (o vídeo inteiro tem poucas; use só nos momentos mais concretos, cada uma em broll-cheio na sua palavra), e ${cenario}. Cobertura: as inserções (tudo que não é narrador-cheio) somam de 30 a 40% do tempo do bloco; o resto é o narrador cheio, com punch e zoom nas frases fortes.`
      : `MODO: CORTE. CENAS DE CINEMA neste corte: de ${n.piso} a ${n.teto} assets "cena-em-movimento", cada um em broll-cheio na sua palavra, e ${cenario}. RITMO MÍNIMO DO VÍDEO CURTO: algo muda na tela pelo menos a cada ${janelaTxt} s, do primeiro ao último segundo (troca de layout, punch ou zoom na palavra forte, palavra em destaque, ícone, imagem). Sem poluir: uma coisa nova por vez, e nenhuma janela de ${janelaTxt} s com o narrador parado e nada entrando.`;
  const partes = [
    // O completo gravado em pé (30/09) é 9:16 e continua sendo o completo.
    `Formato: ${e.formato === "9:16" ? (modo === "completo" ? "vídeo completo vertical 9:16 (1080x1920), gravado no celular em pé" : "corte vertical 9:16 (1080x1920) para Reels e Shorts") : "vídeo completo 16:9 (1920x1080) para YouTube"}.`,
    `Duração do ${modo === "completo" ? "bloco" : "corte"}: ${e.duracao.toFixed(1)} s. ${e.palavras.length} palavras.`,
    e.titulo ? `Título do corte: ${e.titulo}` : "",
    e.nicho ? `Nicho do projeto: ${e.nicho}` : "",
    ficha,
    `Estilo de legenda desta linguagem: ${legendaPadrao}.`,
    e.rosto ? `Onde está o rosto no quadro da gravação (fração): x ${e.rosto.x.toFixed(2)}, y ${e.rosto.y.toFixed(2)}, largura ${e.rosto.w.toFixed(2)}, altura ${e.rosto.h.toFixed(2)}.` : "",
    e.mosaico ? `A imagem anexa é um mosaico de quadros do corte (${e.mosaico.legenda}). Olhe o cenário, a roupa, a luz e a energia de quem fala.` : "",
    marcas.length
      ? `MARCAS CITADAS (cada uma vira elemento "icone" na palavra indicada):\n${marcas.map((m) => `- ${m.nome} (marca "${m.marca}") na palavra ${m.palavra}${m.inferida ? ` (transcrito "${e.palavras[m.palavra]?.texto}")` : ""}`).join("\n")}`
      : "",
    cinema,
    e.recortesProntos?.length
      ? `RECORTES PRONTOS do projeto (use a descrição EXATA em um asset "elemento" e ele sai sem custo):\n${e.recortesProntos.slice(-40).map((d) => `- ${d}`).join("\n")}`
      : "",
    // Por último antes da fala: o que quem chama pede vale sobre as regras
    // gerais acima (no completo, os tetos de cinema e de imagem do bloco).
    e.contexto ?? "",
    `Fala (índice|segundo|palavra):\n${fala}`,
  ];
  return partes.filter(Boolean).join("\n\n");
}

/**
 * O PRIMEIRO objeto JSON da resposta, com conserto do que é mecânico.
 *
 * Na primeira rodada em produção (30/09) o plano de um corte veio com
 * "Expected ',' or '}' after property value" na posição 4337 e o corte ficou
 * sem montagem. Aqui: o objeto é recortado pelo balanço de chaves (fora de
 * string), e antes de desistir tenta consertar aspas tipográficas, vírgula
 * sobrando antes de fechar e aspas duplas soltas dentro de texto ("motivo"
 * com citação). O que não conserta volta como erro, e quem chama pede de novo.
 */
export function extrairJson(t: string): unknown {
  const limpo = t.replace(/```(?:json)?/g, "");
  const i = limpo.indexOf("{");
  if (i < 0) throw new Error("o diretor não devolveu JSON");
  // Fim do primeiro objeto pelo balanço de chaves, ignorando o que está em string.
  let nivel = 0;
  let emTexto = false;
  let escapado = false;
  let f = -1;
  for (let k = i; k < limpo.length; k++) {
    const ch = limpo[k];
    if (emTexto) {
      if (escapado) escapado = false;
      else if (ch === "\\") escapado = true;
      else if (ch === '"') emTexto = false;
      continue;
    }
    if (ch === '"') emTexto = true;
    else if (ch === "{") nivel++;
    else if (ch === "}" && --nivel === 0) {
      f = k;
      break;
    }
  }
  const bruto = f > i ? limpo.slice(i, f + 1) : limpo.slice(i, limpo.lastIndexOf("}") + 1);
  try {
    return JSON.parse(bruto);
  } catch (primeiro) {
    const consertado = consertarJson(bruto);
    try {
      return JSON.parse(consertado);
    } catch {
      throw primeiro;
    }
  }
}

/** Consertos mecânicos: aspas tipográficas, vírgula sobrando, aspas soltas dentro de texto. */
function consertarJson(t: string): string {
  let s = t.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/,\s*([}\]])/g, "$1");
  // Aspas duplas dentro de um valor de texto: uma aspa que NÃO é seguida de
  // , } ] ou : (ignorando espaço) e NÃO vem depois de { [ , : é conteúdo, e
  // vira aspa simples.
  let saida = "";
  let emTexto = false;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === "\\" && emTexto) {
      saida += ch + (s[k + 1] ?? "");
      k++;
      continue;
    }
    if (ch === '"') {
      if (!emTexto) {
        emTexto = true;
        saida += ch;
        continue;
      }
      const depois = s.slice(k + 1).match(/^\s*(.)/)?.[1] ?? "";
      if (",}]:".includes(depois) || depois === "") {
        emTexto = false;
        saida += ch;
      } else {
        saida += "'";
      }
      continue;
    }
    saida += ch;
  }
  s = saida;
  return s;
}

/**
 * Pede o plano ao diretor, valida, e pede UMA revisão se sobrarem erros de
 * julgamento (cena longa, texto não falado). O que ainda sobrar depois disso já
 * foi consertado pelo validador (elemento cortado, cena aparada): a montagem
 * sai, com menos enfeite, em vez de não sair.
 */
export async function dirigirMontagem(e: EntradaDoDiretor): Promise<SaidaDoDiretor> {
  const cores = coresDaMarca(e.colorPalette);
  const perfil = await perfilDaEntrada(e);
  const { texto: ficha, familia, biblia, metas } = fichaDaLinguagem(e.escolha, e.videoStyle, cores, perfil);
  const legendaPadrao = biblia.legenda;
  // Fora da colagem: o catálogo de recortes do projeto são gravuras com borda
  // branca (linguagem da Vox) e não vai ao diretor; e o cenário do narrador
  // que se desintegra não cabe no sóbrio (telejornal não tem efeito de
  // partícula), salvo se quem chama pedir.
  if (familia !== "colagem") e = { ...e, recortesProntos: [] };
  if (familia === "sobrio" && e.tetos?.cenarioDoNarrador === undefined) e = { ...e, tetos: { ...e.tetos, cenarioDoNarrador: 0 } };
  // Os tetos do estilo no corte (02/10, consórcio): só quando quem chama não disse os dele.
  if (biblia.tetosDoCorte && modoDaEntrada(e) === "corte" && !e.tetos) e = { ...e, tetos: biblia.tetosDoCorte };
  const usuario = mensagem(e, ficha, legendaPadrao, metas.metas.mudancaACadaSeg);
  const opcoes = {
    model: DEFAULT_MODEL,
    // Julgamento editorial: esforço padrão (alto) e teto folgado, porque o
    // teto inclui o pensamento (regra da casa desde 22/08).
    maxTokens: 32000,
    timeoutMs: 290_000,
    usage: { projectId: e.projectId, operation: "montagem-diretor" },
    ...(e.esforco ? { effort: e.esforco } : {}),
  };
  // O prompt é o da BÍBLIA da linguagem escolhida (01/10). Até 30/09 era um
  // só, com o vocabulário da Vox; de 30/09 a 01/10, um por família.
  const sistema = sistemaDoEstilo(biblia);
  const perguntarCom = (m: string, o: typeof opcoes) =>
    e.mosaico ? askClaudeComImagem(sistema, m, e.mosaico.base64, "image/jpeg", o) : askClaude(sistema, m, o);
  // O prompt da bíblia é mais rico, e no esforço alto o Sonnet 5 às vezes
  // gasta os 32 mil tokens pensando e não responde (prova de 01/10, keynote e
  // bloco do completo). Nesse caso, UMA nova chamada em esforço médio.
  const perguntar = async (m: string): Promise<string> => {
    try {
      return await perguntarCom(m, opcoes);
    } catch (falha) {
      const msg = falha instanceof Error ? falha.message : "";
      if (!/pensando/.test(msg) || opcoes.effort === "medium" || opcoes.effort === "low") throw falha;
      console.warn(`[diretor ${e.referencia}] esgotou o teto pensando; de novo em esforço médio`);
      return perguntarCom(m, { ...opcoes, effort: "medium" });
    }
  };

  // JSON quebrado mesmo depois do conserto: UMA nova chamada pedindo só JSON
  // válido, antes de o corte ficar sem montagem.
  const pedirPlano = async (m: string): Promise<unknown> => {
    const texto = await perguntar(m);
    try {
      return extrairJson(texto);
    } catch (falha) {
      const motivo = falha instanceof Error ? falha.message : "erro";
      console.warn(`[diretor ${e.referencia}] JSON inválido (${motivo}), pedindo de novo`);
      return extrairJson(
        await perguntar(
          `${m}\n\nSUA RESPOSTA ANTERIOR NÃO ERA JSON VÁLIDO (${motivo}). Responda SOMENTE com o objeto JSON válido, sem comentário, sem cerca de código, com aspas duplas escapadas dentro dos textos (use aspas simples em citações).`
        )
      );
    }
  };
  let bruto = await pedirPlano(usuario);
  const ctxDaValidacao = {
    palavras: e.palavras,
    duracao: e.duracao,
    formato: e.formato,
    familia,
    recortesProntos: e.recortesProntos,
    modo: modoDaEntrada(e),
    tetos: e.tetos,
    // O selo com check do consórcio (02/10) pode trazer o nome do projeto.
    nomeDaMarca: perfil?.nome ?? null,
  };
  let r = validarPlano(bruto, ctxDaValidacao);
  let rodadas = 1;
  if (r.erros.length) {
    console.warn(`[diretor ${e.referencia}] ${r.erros.length} erro(s) na 1a rodada, pedindo revisão: ${r.erros.join(" | ")}`);
    const revisao =
      usuario +
      `\n\nSEU PLANO ANTERIOR:\n${JSON.stringify(bruto)}\n\nO VALIDADOR RECUSOU ISTO:\n- ${r.erros.join("\n- ")}\n\nDevolva o plano inteiro corrigido, no mesmo formato JSON.`;
    try {
      const segundo = await pedirPlano(revisao);
      const r2 = validarPlano(segundo, ctxDaValidacao);
      rodadas = 2;
      if (r2.erros.length <= r.erros.length) {
        bruto = segundo;
        r = r2;
      }
    } catch (err) {
      console.error(`[diretor ${e.referencia}] revisão falhou, segue com a 1a: ${err instanceof Error ? err.message : err}`);
    }
  }
  // O que sobrou de cena longa depois da revisão é aparado por código.
  const aparadoBruto = apararCenas(r.plano, e.palavras, e.duracao, familia);
  // O que a bíblia garante em número (01/10): teto de fundo escuro do
  // MrBeast, fundo colorido do keynote.
  const doEstilo = ajustarAoEstilo(aparadoBruto.plano, biblia);
  const aparado = { plano: doEstilo.plano, avisos: [...aparadoBruto.avisos, ...doEstilo.avisos] };
  // O RITMO MÍNIMO DO CORTE (01/10): o prompt pede algo novo na janela da
  // meta do estilo, e o código garante (regra da casa: o que dá para
  // garantir em código não fica na mão do modelo). Janela vazia ganha
  // movimento na palavra forte, um corte de câmera, ou uma palavra em
  // destaque. A janela do código é uma vez e meia a meta (o diretor faz o
  // ritmo; o código só tapa buraco), nunca acima da de antes. O completo tem
  // o fecho dele (fecharPlanoDoCompleto), com as cotas por minuto.
  if (modoDaEntrada(e) === "corte") {
    const janelaSeg = Math.min(JANELA_DO_CURTO_SEG, Math.max(2.5, metas.metas.mudancaACadaSeg * 1.5));
    const ritmo = garantirRitmo(aparado.plano, e.palavras, e.duracao, { janelaSeg, familia, comElementos: true });
    const avisosDoRitmo = ritmo.adicionados ? [`ritmo: ${ritmo.adicionados} movimento(s) ou destaque(s) nas janelas vazias`] : [];
    return { plano: ritmo.plano, avisos: [...r.avisos, ...aparado.avisos, ...avisosDoRitmo], errosRestantes: r.erros, rodadas, modelo: DEFAULT_MODEL };
  }
  return { plano: aparado.plano, avisos: [...r.avisos, ...aparado.avisos], errosRestantes: r.erros, rodadas, modelo: DEFAULT_MODEL };
}

export { LAYOUTS };

// ─────────────────────────────── outra ideia para UMA cena ───────────────────────────────

/**
 * OUTRA IDEIA PARA UMA CENA (30/09, tela de roteiro). O cliente olha o plano
 * antes de pagarmos imagem e cena, e numa cena pede "outra ideia" (com ou sem
 * dizer o que quer). Refazer o corte inteiro custaria ~US$ 0,27 e mudaria
 * cenas que ele já aprovou; aqui o diretor recebe só as palavras daquela cena,
 * com um pouco de fala de cada lado para contexto, e devolve UMA cena nova (ou
 * duas, se a fala pedir). Esforço baixo e teto curto: é uma decisão pequena.
 * Medido o tamanho: o prompt da família (~4 mil tokens) mais a fala da cena.
 *
 * Quem valida é o mesmo `validarPlano`, sobre um plano de mentira só com
 * esta fala: texto só com palavra dita, vocabulário da família, teto de cena
 * gerada (uma, no máximo).
 */
export async function novaIdeiaDaCena(p: {
  projectId?: string;
  referencia: string;
  /** As palavras da cena, no tempo da cena (a primeira começa perto do zero). */
  palavras: PalavraNoCorte[];
  duracao: number;
  formato: Formato;
  escolha: unknown;
  videoStyle?: string | null;
  colorPalette?: string | null;
  nicho?: string | null;
  /** Fala antes e depois da cena, só para contexto. */
  antes?: string;
  depois?: string;
  /** A cena de hoje, para o diretor NÃO repetir a mesma ideia. */
  atual: string;
  /** O que o cliente pediu, com as palavras dele (opcional). */
  pedido?: string | null;
  /**
   * Quem pede (01/10): o cliente ("outra ideia") ou o REVISOR do plano
   * (revisor-da-montagem.ts), que manda a correção como pedido.
   */
  origem?: "cliente" | "revisor";
  /** O perfil do projeto (sem o campo, lido pelo projectId). */
  perfil?: PerfilDoProjeto | null;
  /** Teto de cena de cinema da cena nova (padrão 1). */
  cinema?: number;
}): Promise<PlanoDeMontagem> {
  const cores = coresDaMarca(p.colorPalette);
  const perfil = await perfilDaEntrada(p);
  const { texto: ficha, familia, biblia } = fichaDaLinguagem(p.escolha, p.videoStyle, cores, perfil);
  const doRevisor = p.origem === "revisor";
  const fala = p.palavras.map((w, i) => `${i}|${w.inicio.toFixed(2)}|${w.texto}`).join("\n");
  const marcas = marcasNaFala(p.palavras);
  const usuario = [
    `Formato: ${p.formato === "9:16" ? "corte vertical 9:16" : "vídeo completo 16:9"}.`,
    p.nicho ? `Nicho do projeto: ${p.nicho}` : "",
    ficha,
    doRevisor
      ? `TAREFA: o revisor do plano apontou um problema nesta cena. Reescreva só esta cena (${p.duracao.toFixed(1)} s, ${p.palavras.length} palavras) corrigindo o que ele apontou e seguindo a linguagem. Pode dividir em até 2 cenas se a fala pedir. No máximo ${p.cinema ?? 1} asset "cena-em-movimento" e nenhum "cena-do-narrador".`
      : `TAREFA: o plano já existe e o cliente pediu OUTRA IDEIA para UMA cena só. Reescreva só esta cena (${p.duracao.toFixed(1)} s, ${p.palavras.length} palavras). Pode dividir em até 2 cenas se a fala pedir. No máximo 1 asset "cena-em-movimento" e nenhum "cena-do-narrador".`,
    `A CENA DE HOJE${doRevisor ? "" : " (não repita a mesma ideia)"}: ${p.atual}`,
    doRevisor
      ? `O QUE O REVISOR PEDIU CORRIGIR: ${p.pedido ?? "deixar a cena dentro das regras da linguagem"}`
      : p.pedido
        ? PEDIDO_DO_CLIENTE(p.pedido)
        : "O cliente não disse o que quer: proponha algo diferente e mais forte que a cena de hoje.",
    p.antes ? `Fala logo ANTES da cena (só contexto): ${p.antes}` : "",
    p.depois ? `Fala logo DEPOIS da cena (só contexto): ${p.depois}` : "",
    marcas.length ? `MARCAS CITADAS nesta cena:\n${marcas.map((m) => `- ${m.nome} (marca "${m.marca}") na palavra ${m.palavra}`).join("\n")}` : "",
    `Fala da cena (índice|segundo|palavra):\n${fala}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const texto = await askClaude(sistemaDoEstilo(biblia), usuario, {
    model: DEFAULT_MODEL,
    maxTokens: 8000,
    effort: "low",
    timeoutMs: 120_000,
    usage: { projectId: p.projectId, operation: doRevisor ? "montagem-correcao" : "roteiro-nova-ideia" },
  });
  const bruto = extrairJson(texto);
  const r = validarPlano(bruto, {
    palavras: p.palavras,
    duracao: p.duracao,
    formato: p.formato,
    familia,
    modo: "completo",
    tetos: { cinema: p.cinema ?? 1, cenarioDoNarrador: 0 },
  });
  if (!r.plano.cenas.length) throw new Error(`o diretor não devolveu cena (${p.referencia})`);
  if (doRevisor || !p.pedido?.trim()) return r.plano;
  // O PEDIDO DO CLIENTE NUNCA SOME EM SILÊNCIO (02/10): fica gravado na cena,
  // com o que o diretor disse que fez e, quando não fez inteiro, o motivo.
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as { atendimento?: { atendido?: string; motivo?: string }; assets?: Array<{ id?: string; comPessoas?: boolean }> };
  const atendido = b.atendimento?.atendido === "parcial" || b.atendimento?.atendido === "nao" ? b.atendimento.atendido : "sim";
  const motivo = typeof b.atendimento?.motivo === "string" && b.atendimento.motivo.trim() ? b.atendimento.motivo.replace(/\s+/g, " ").trim().slice(0, 200) : null;
  const comGente = new Set((b.assets ?? []).filter((a) => a?.comPessoas === true && typeof a.id === "string").map((a) => a.id as string));
  // O código confere o que o diretor DIZ: pediu imagem ou vídeo e a cena
  // voltou sem nenhuma, não foi atendido (nem "em parte").
  const pediuMidia = /(v[íi]deo|cena|imagem|foto|ilustra)/i.test(p.pedido);
  const semMidia = !r.plano.cenas.some((c) => c.asset);
  const atendidoDeFato = pediuMidia && semMidia ? "nao" : atendido;
  const motivoDeFato = pediuMidia && semMidia && atendido !== "nao" ? `${motivo ? `${motivo} ` : ""}A cena ficou sem a imagem ou o vídeo pedido.`.trim() : motivo;
  const pedido: PedidoDoCliente = { texto: p.pedido.trim().slice(0, 300), atendido: atendidoDeFato, motivo: atendidoDeFato === "sim" ? null : motivoDeFato ?? "o diretor não conseguiu fazer exatamente como pedido" };
  return {
    ...r.plano,
    assets: r.plano.assets.map((a) => (comGente.has(a.id) ? { ...a, comPessoas: true } : a)),
    cenas: r.plano.cenas.map((c) => ({ ...c, pedido })),
  };
}

/**
 * O PEDIDO DO CLIENTE É LEI (02/10). Até aqui ele valia "menos as regras de
 * imagem sem pessoa", e "um vídeo de Jesus falando com a multidão,
 * hiper-realista, com roupas da época" virou um título "a história" sem
 * nenhum aviso. Agora o pedido manda sempre que for possível e seguro:
 * pessoas entram quando ele pede (figura histórica ou bíblica, multidão,
 * gente fictícia), "vídeo" vira cena de cinema, e o que não der para fazer
 * volta escrito em uma linha.
 */
const PEDIDO_DO_CLIENTE = (pedido: string) => `O QUE O CLIENTE PEDIU, COM AS PALAVRAS DELE (é LEI: vale sobre as regras do estilo e da linguagem): "${pedido}"
COMO ATENDER:
- Faça exatamente o que ele pediu sempre que for possível e seguro.
- PESSOAS: se o pedido traz gente (figura histórica ou bíblica como Jesus ou Moisés, multidão com roupa da época, gente fictícia), o asset PODE mostrar pessoas: marque nele "comPessoas": true e descreva (em inglês) roupa da época e modesta, sem nada sensual. Figura sagrada com reverência: plano aberto com a multidão ou de costas, luz natural, sem auréola brilhante e sem caricatura. Nunca uma pessoa REAL CONTEMPORÂNEA identificável (político, celebridade).
- "Vídeo", "cena", "mostrando ... falando", movimento: use um asset "cena-em-movimento" (no máximo 1) em broll-cheio cobrindo a fala da cena; "imagem" ou "foto": "colagem".
- Texto escrito DENTRO da imagem continua proibido; texto na tela continua só com palavra dita.
- Se não der para fazer inteiro (pessoa real contemporânea, algo vulgar, mais de uma cena de cinema, texto não dito), faça o mais perto possível e diga o motivo.
Na RESPOSTA, além de "assets" e "cenas", inclua "atendimento": {"atendido":"sim"|"parcial"|"nao","motivo":"uma linha em português, só quando não for sim"}.`;
