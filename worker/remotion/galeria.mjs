// Galeria das peças do editor sob medida (03/10): cada peça parada no meio da
// camada, sobre um quadro real da gravação, numa folha. Só para conferir o desenho.
// Uso: node remotion/galeria.mjs <pasta> <quadro-16x9.jpg> <quadro-9x16.jpg> [visual]
import { renderStill, selectComposition } from "@remotion/renderer";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { bundleDoRemotion } from "../src/montagem.mjs";

const [pasta, q169, q916, visual = "vidro"] = process.argv.slice(2);
mkdirSync(pasta, { recursive: true });
const fontes = { vidro: ["Geist", 600, false], impacto: ["Archivo Black", 400, true], documental: ["Playfair Display", 700, false] }[visual];
const tema = { acento: "#F97316", escuro: "#1e1f22", claro: "#dbdee1", fonteTitulo: fontes[0], pesoTitulo: fontes[1], fonteTexto: "Geist", fonteMono: "Geist Mono", visual, caixaAlta: fontes[2] };
const svgCruz = '<rect x="88" y="20" width="24" height="160" rx="6" fill="ACENTO"/><rect x="45" y="60" width="110" height="24" rx="6" fill="ACENTO"/><circle cx="100" cy="72" r="60" fill="none" stroke="CLARO" stroke-width="3" stroke-dasharray="6 8"/>';
const PECAS = [
  ["titulo", { rotulo: "Capítulo 1", titulo: "Onde Deus está, **existe prosperidade**", apoio: "Não é sobre ter mais. É sobre servir melhor." }],
  ["capitulo", { numero: "2", titulo: "A **mesa** do escritório" }],
  ["rotulo-inferior", { nome: "Bruno **Donaire**", descricao: "Pastor e empresário" }],
  ["frase-impacto", { texto: "O perfil **some**." }],
  ["palavra-chave", { texto: "PROPÓSITO" }],
  ["citacao", { texto: "Tudo o que fizerem, façam **de todo o coração**.", autor: "Colossenses 3:23" }],
  ["pergaminho", { texto: "Consagre ao Senhor tudo o que você faz, e os seus planos serão bem-sucedidos.", referencia: "Provérbios 16:3" }],
  ["pergunta-resposta", { pergunta: "Sem tempo de gravar?", resposta: "O gêmeo segura a semana." }, [0.2]],
  ["painel-lateral", { lado: "esquerda", rotulo: "Os 3 pilares", titulo: "Gestão com **princípio**", itens: [{ texto: "Servir antes de vender" }, { texto: "Medir toda semana" }, { texto: "Descansar no sábado" }] }, [0.2, 0.4, 0.6]],
  ["cartoes", { titulo: "As saídas de sempre **travam**", marca: "x", itens: [{ titulo: "Time próprio", texto: "Caro, e traz passivo" }, { titulo: "Agência", texto: "Demora e fala genérico" }, { titulo: "Fazer sozinho", texto: "Não sobra agenda" }] }, [0.1, 0.3, 0.5]],
  ["linha-do-tempo", { titulo: "Três passos para **começar**", passos: [{ rotulo: "Organizar", texto: "a mesa e a agenda" }, { rotulo: "Servir", texto: "o cliente primeiro" }, { rotulo: "Crescer", texto: "com o que sobra" }] }, [0.1, 0.3, 0.5]],
  ["escada", { titulo: "Do zero ao **primeiro cliente**", degraus: [{ rotulo: "Ideia" }, { rotulo: "Oferta" }, { rotulo: "Venda" }, { rotulo: "Escala" }] }, [0.1, 0.3, 0.5, 0.7]],
  ["checklist", { titulo: "Antes de abrir a loja", itens: [{ texto: "Orar pela decisão" }, { texto: "Fazer a conta do mês" }, { texto: "Ouvir três clientes" }] }, [0.1, 0.3, 4]],
  ["comparacao", { titulo: "Antes e **depois**", esquerda: { titulo: "Sem sistema", itens: ["Tudo na cabeça", "Cliente esquecido"] }, direita: { titulo: "Com sistema", itens: ["Tudo no papel", "Cliente atendido"] } }, [0.3]],
  ["fluxo", { titulo: "Como a venda **acontece**", nos: [{ rotulo: "Conteúdo", icone: "video" }, { rotulo: "Conversa", icone: "mensagem" }, { rotulo: "Venda", icone: "aperto" }] }, [0.1, 0.3, 0.5]],
  ["numero", { rotulo: "Economia", antes: "Você economiza até", valor: 88, sufixo: "%", apoio: "contra um **time próprio**" }],
  ["barras", { titulo: "Faturamento por **trimestre**", unidade: " mil", barras: [{ rotulo: "T1", valor: 12 }, { rotulo: "T2", valor: 18 }, { rotulo: "T3", valor: 27 }, { rotulo: "T4", valor: 41, destaque: true }] }],
  ["cifrao", { simbolo: "R$", valor: "R$ 920 milhões", rotulo: "travados na greve" }],
  ["progresso", { valor: 70, rotulo: "da decisão acontece antes do vendedor" }],
  ["mapa", { titulo: "De **Salesópolis** a Mogi", pontos: [{ rotulo: "Salesópolis", x: 0.62, y: 0.55 }, { rotulo: "Mogi", x: 0.42, y: 0.45 }, { rotulo: "São Paulo", x: 0.25, y: 0.5 }] }, [0.1, 0.3, 0.5]],
  ["seta", { de: { x: 0.18, y: 0.25 }, para: { x: 0.5, y: 0.55 }, rotulo: "A mesa simples" }],
  ["circulo", { x: 0.55, y: 0.45, raio: 0.14, rotulo: "O cantinho do café" }],
  ["icone", { nome: "igreja", rotulo: "A igreja como **empresa**", apoio: "Gestão, pessoas e propósito", posicao: "direita" }],
  ["desenho", { svg: svgCruz, rotulo: "A **cruz** no centro", posicao: "direita" }],
  ["sublinhado", { texto: "Prosperidade" }],
  ["fecho", { marca: "Empreendedorismo Cristão", titulo: "Seu negócio, **com propósito**.", chamada: "Inscreva-se no canal" }],
];
const serveUrl = await bundleDoRemotion({ refazer: true });
async function folha(W, H, quadro, nome) {
  const pngs = [];
  for (const [k, [peca, props, ev]] of PECAS.entries()) {
    const camada = { id: "c", peca, de: 0, ate: 10, entrada: 1.3, saida: 0.3, evento: 0.7, eventos: (ev ?? []).map((x) => x), props };
    const inputProps = { largura: W, altura: H, fps: 30, tema, camadas: [camada], trechos: [{ c0: 0, t0: 5, n: 1 }], logoUrl: null };
    const composition = await selectComposition({ serveUrl, id: "SobMedidaCamadas", inputProps });
    const out = join(pasta, `${nome}-${String(k).padStart(2, "0")}.png`);
    await renderStill({ composition, serveUrl, inputProps, output: out, frame: 0, imageFormat: "png" });
    const comp = join(pasta, `${nome}-${String(k).padStart(2, "0")}c.jpg`);
    spawnSync("ffmpeg", ["-v", "error", "-y", "-i", quadro, "-i", out, "-filter_complex", `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[b];[b][1:v]overlay,drawtext=text='${peca}':x=20:y=20:fontsize=40:fontcolor=yellow:box=1:boxcolor=black@0.6,format=yuvj420p`, comp]);
    pngs.push(comp);
  }
  const cols = W > H ? 5 : 7;
  const ins = pngs.flatMap((p) => ["-i", p]);
  const esc = W > H ? "480:270" : "270:480";
  const n = pngs.length;
  const rows = Math.ceil(n / cols);
  let fc = pngs.map((_, i) => `[${i}:v]scale=${esc}[s${i}]`).join(";");
  fc += ";" + pngs.map((_, i) => `[s${i}]`).join("") + `xstack=inputs=${n}:layout=${Array.from({ length: n }, (_, i) => { const [w, h] = esc.split(":"); return `${(i % cols) * w}_${Math.floor(i / cols) * h}`; }).join("|")}:fill=black,format=yuvj420p`;
  spawnSync("ffmpeg", ["-v", "error", "-y", ...ins, "-filter_complex", fc, "-frames:v", "1", join(pasta, `${nome}-folha.jpg`)]);
}
await folha(1920, 1080, q169, `h-${visual}`);
await folha(1080, 1920, q916, `v-${visual}`);
console.log("ok");
