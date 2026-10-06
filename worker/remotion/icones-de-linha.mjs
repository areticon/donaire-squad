// Gera os ícones de linha das peças novas (06/10): copia o desenho do lucide-react (ISC) como dados.
// Uso (da raiz do repo): node worker/remotion/icones-de-linha.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const dir = join(raiz, "node_modules/lucide-react/dist/esm/icons");
// nome em português -> [nome no lucide, do que se trata (para o JEV e o redator)]
const LISTA = {
  despertador: ["alarm-clock", "despertador, acordar cedo, rotina da manhã, hora certa"],
  "tv-desligada": ["monitor-off", "tela desligada, desligar a TV, menos tela, desconectar"],
  celular: ["smartphone", "celular, aplicativo, rede social no celular"],
  "sem-notificacao": ["bell-off", "silenciar notificações, foco, sem distração"],
  notificacao: ["bell-ring", "notificação, aviso, alerta chegando"],
  proibido: ["ban", "proibido, não faça, pare, evitar"],
  tesoura: ["scissors", "cortar, edição de vídeo, corte, aparar"],
  claquete: ["clapperboard", "gravação, take, cena, produção de vídeo"],
  filme: ["film", "vídeo, filme, rolo, edição"],
  play: ["circle-play", "play, assistir, vídeo, começar"],
  edicao: ["square-pen", "editar, escrever, ajustar, revisar"],
  camadas: ["layers", "camadas, linha do tempo, sobreposição, plataforma"],
  robo: ["bot", "robô, automação, inteligência artificial, agente"],
  brilho: ["sparkles", "IA, mágica, novo, automático, brilho"],
  varinha: ["wand-sparkles", "mágica, fazer sozinho, transformar, automático"],
  automacao: ["workflow", "fluxo automatizado, processo, integração, automação"],
  engrenagem: ["settings", "configurar, sistema, processo, ajuste"],
  codigo: ["code", "código, programação, desenvolvedor"],
  terminal: ["square-terminal", "terminal, comando, software, programação"],
  nuvem: ["cloud", "nuvem, online, armazenamento, servidor"],
  banco: ["database", "dados, banco de dados, informação guardada"],
  chip: ["cpu", "processador, tecnologia, máquina, computação"],
  teclado: ["keyboard", "digitar, escrever, trabalho no computador"],
  cafe: ["coffee", "café, pausa, manhã, conversa"],
  cama: ["bed", "dormir, descanso, sono"],
  lua: ["moon", "noite, dormir, descanso"],
  sol: ["sun", "dia, manhã, energia, clareza"],
  haltere: ["dumbbell", "treino, academia, disciplina física, força"],
  "livro-aberto": ["book-open", "ler, estudar, aprender, leitura"],
  caneta: ["pen-line", "escrever, anotar, assinar"],
  "lista-check": ["list-checks", "lista de tarefas, checklist, organizar"],
  cronometro: ["timer", "cronômetro, prazo, tempo contado, rapidez"],
  velocimetro: ["gauge", "velocidade, desempenho, medir, produtividade"],
  joinha: ["thumbs-up", "aprovado, gostei, positivo, curtir"],
  "nao-gostei": ["thumbs-down", "reprovado, não gostei, negativo"],
  certo: ["circle-check", "certo, correto, feito, aprovado"],
  errado: ["circle-x", "errado, incorreto, não faça"],
  equipe: ["users-round", "equipe, clientes, público, comunidade"],
  "pessoa-check": ["user-check", "cliente conquistado, pessoa aprovada, contratação"],
  mao: ["hand", "pare, mão, atenção, oi"],
  foco: ["focus", "foco, concentração, mirar"],
  porcentagem: ["percent", "porcentagem, desconto, taxa"],
  etiqueta: ["tag", "preço, etiqueta, oferta, valor"],
  recibo: ["receipt", "conta, nota, gasto, pagamento"],
  cartao: ["credit-card", "cartão, pagamento, compra"],
  pizza: ["chart-pie", "divisão, fatia, participação"],
  crescimento: ["chart-no-axes-combined", "crescimento, resultado subindo, evolução"],
  medalha: ["award", "prêmio, reconhecimento, melhor, qualidade"],
  pasta: ["folder-open", "arquivos, organização, documentos"],
  link: ["link", "link, conexão, ligar"],
  busca: ["search", "procurar, pesquisar, buscar"],
  conversa: ["messages-square", "conversa, chat, mensagens, atendimento"],
  podcast: ["podcast", "podcast, áudio, entrevista"],
  fone: ["headphones", "ouvir, áudio, música, atenção"],
  imagem: ["image", "imagem, foto, arte"],
  paleta: ["palette", "design, cores, criatividade, marca"],
  mira: ["crosshair", "mirar, precisão, alvo exato"],
  info: ["info", "informação, saiba, dica"],
  "escudo-check": ["shield-check", "segurança, proteção, garantia"],
  "calendario-check": ["calendar-check", "agenda cumprida, compromisso, constância"],
  "calendario-x": ["calendar-x", "falta, compromisso cancelado, sem agenda"],
  "cerebro-ia": ["brain-circuit", "inteligência, IA pensando, mente, estratégia"],
  "mao-dinheiro": ["hand-coins", "receber, pagamento, ganhar dinheiro"],
  caminhao: ["truck", "entrega, frete, logística"],
  pacote: ["package", "produto, pacote, entrega"],
  "ondas-de-som": ["audio-lines", "voz, áudio, som, fala"],
  mudo: ["volume-x", "silêncio, sem som, mudo"],
  "olho-fechado": ["eye-off", "esconder, não ver, ignorar"],
  sair: ["log-out", "sair, ir embora, deixar"],
  ampliar: ["zoom-in", "aproximar, detalhe, olhar de perto"],
  desfazer: ["undo-2", "desfazer, voltar atrás, corrigir"],
  atualizar: ["refresh-cw", "atualizar, recomeçar, repetir o ciclo"],
  bandeira: ["flag", "meta, chegada, objetivo, marco"],
  broto: ["sprout", "crescimento, começo, cultivar"],
  instituicao: ["landmark", "instituição, banco, governo, autoridade"],
  diamante: ["gem", "valor, premium, luxo, raro"],
};

const dados = {};
const faltam = [];
for (const [pt, [lu]] of Object.entries(LISTA)) {
  const f = join(dir, `${lu}.js`);
  if (!existsSync(f)) { faltam.push(`${pt}:${lu}`); continue; }
  const src = readFileSync(f, "utf8");
  const m = src.match(/const __iconNode = (\[[\s\S]*?\n\]);/);
  if (!m) { faltam.push(`${pt}:${lu}(sem nó)`); continue; }
  const nos = Function(`return ${m[1]}`)();
  dados[pt] = nos.map(([tag, at]) => { const { key, ...resto } = at; return [tag, resto]; });
}
if (faltam.length) { console.error("faltam:", faltam.join(", ")); process.exit(1); }

const cab = `// Os ícones de linha das peças novas (06/10): lucide-react 1.7.0, licença ISC (https://lucide.dev/license),
// copiados como dados porque o worker é publicado sem o node_modules do app. Gerado por
// worker/remotion/icones-de-linha.mjs. Traço 24x24. Somam-se aos de icones.ts (ICONES); o espelho dos nomes, com o
// "do que se trata" que o JEV e o redator leem, está em lib/media/editor-por-comando/icones-de-linha.ts.
import type { NoDoIcone } from "./icones";
`;
writeFileSync(join(raiz, "worker/remotion/src/sob-medida/icones-de-linha.ts"), `${cab}export const ICONES_DE_LINHA: Record<string, NoDoIcone[]> = ${JSON.stringify(dados)};\n`);

// Os nomes do catálogo antigo (icones.ts), com o próprio nome como descrição.
const antigo = readFileSync(join(raiz, "worker/remotion/src/sob-medida/icones.ts"), "utf8");
const nomesAntigos = Object.keys(Function(`return ${antigo.match(/export const ICONES: Record<string, NoDoIcone\[\]> = (\{.*\});/)[1]}`)());
const sobre = { ...Object.fromEntries(nomesAntigos.map((n) => [n, n.replace(/-/g, " ")])), ...Object.fromEntries(Object.entries(LISTA).map(([pt, [, d]]) => [pt, d])) };
const app = `/**
 * OS ÍCONES DE LINHA (06/10/2026): o catálogo que as peças vetoriais desenham (ícone com frase, cartões em
 * linha). Espelho dos nomes de worker/remotion/src/sob-medida/icones.ts e icones-de-linha.ts (o desenho mora
 * lá; o worker não lê o app). O redator SUGERE o nome; o JEV ESCOLHE entre os candidatos
 * (lib/media/editor-por-comando/icone-pelo-jev.ts). Gerado por worker/remotion/icones-de-linha.mjs.
 */
export const ICONES_DE_LINHA: Record<string, string> = ${JSON.stringify(sobre, null, 1)};

export const NOMES_DOS_ICONES_DE_LINHA = Object.keys(ICONES_DE_LINHA);
`;
writeFileSync(join(raiz, "lib/media/editor-por-comando/icones-de-linha.ts"), app);
console.log("ok", Object.keys(dados).length, "novos;", Object.keys(sobre).length, "no total");
