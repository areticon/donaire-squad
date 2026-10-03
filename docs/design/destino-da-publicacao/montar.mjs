/**
 * Artboards da escolha de DESTINO (conta), e nao so de rede. Gera dois:
 * a janela de campanha e a linha do card do Paulo.
 *
 *   node docs/design/destino-da-publicacao/montar.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));

const CABECA = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
  <style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #1e1e25; }
    a { color: #f6803d; } a:hover { color: #ef6122; }
  </style>
</helmet>
`;
const PE = `</x-dc>
</body>
</html>
`;

const svg = (d, cor = "currentColor") =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONE = {
  pessoa: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  predio: svg('<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>', "#f6803d"),
  seta: svg('<path d="m6 9 6 6 6-6"/>', "#9599a6"),
};

/** O selo de cada rede, com a cor e o glifo da propria rede. Em 14/09 o
 * primeiro rascunho usou o "in" do LinkedIn em todas as linhas, inclusive
 * no Instagram, e o Bruno pegou na hora. */
const SELO_DA_REDE = {
  LinkedIn: `<span style="width:20px;height:20px;border-radius:5px;background:#0a66c2;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;">in</span>`,
  Instagram: `<span style="width:20px;height:20px;border-radius:6px;background:linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7);display:inline-flex;align-items:center;justify-content:center;">${svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none"/>', "#fff")}</span>`,
  Facebook: `<span style="width:20px;height:20px;border-radius:5px;background:#1877f2;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;">f</span>`,
  X: `<span style="width:20px;height:20px;border-radius:5px;background:#000;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">X</span>`,
};

/** Um chip de destino: rede + conta + tipo, ligado ou nao. */
const chip = (rede, nome, tipo, ligado) => `
        <button style="display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 12px;border-radius:8px;font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;${ligado ? "background:rgba(239,97,34,0.1);border:1px solid #ef6122;color:#dcdde2;" : "background:transparent;border:1px solid #3f3f4b;color:#9599a6;"}">
          ${SELO_DA_REDE[rede] ?? ""}
          <span><span style="font-weight:600;">${rede}</span> · ${nome}</span>
          <span style="font-size:10px;padding:1px 6px;border-radius:9999px;background:#31313c;color:#9599a6;">${tipo === "pagina" ? "página" : "perfil"}</span>
        </button>`;

const janela = `${CABECA}
<div style="padding:28px;background:#1e1e25;min-height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:18px;">
  <div>
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#dcdde2;">Janela de campanha: "Por onde sai?"</h2>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#9599a6;">
      Hoje a seção "Em quais redes?" lista redes. Com duas contas de LinkedIn no projeto (perfil e página), "LinkedIn" não diz por onde o post sai, e a esteira escolhe sozinha: hoje cai no perfil. A seção passa a listar CONTAS, uma por chip, com o tipo escrito.
    </p>
  </div>

  <div style="border-radius:16px;border:1px solid #3f3f4b;background:#2a2a33;padding:20px;display:flex;flex-direction:column;gap:14px;">
    <div>
      <p style="margin:0 0 8px;font-size:12px;font-weight:500;color:#9599a6;">Por onde sai?</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${chip("LinkedIn", "demandou", "pagina", true)}
        ${chip("LinkedIn", "Bruno Donaire", "perfil", false)}
        ${chip("Instagram", "@demandou", "perfil", true)}
        ${chip("Facebook", "Demandou", "pagina", true)}
      </div>
      <p style="margin:8px 0 0;font-size:10px;line-height:1.5;color:#9599a6;">
        Cada conta ligada é uma peça a mais por dia. Duas contas da mesma rede recebem o mesmo texto, uma publicação em cada. O padrão são as páginas ligadas e o perfil desligado; sua última escolha fica guardada no projeto.
      </p>
    </div>
  </div>

  <div style="border-radius:12px;padding:14px 16px;background:#2a2a33;border:1px solid #3f3f4b;">
    <p style="margin:0;font-size:12px;line-height:1.55;color:#9599a6;">
      <span style="color:#dcdde2;font-weight:600;">O que muda por baixo:</span> a esteira grava um post por CONTA escolhida, com o <span style="color:#f6803d;">socialAccountId</span> daquela conta desde o nascimento. Hoje ela grava um post por rede e adivinha a conta. O card do Paulo e a aba de posts param de "preferir o perfil".
    </p>
  </div>
</div>
${PE}`;

const linha = (rede, nome, tipo, estado, corEstado, comSeletor) => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid #3f3f4b;">
        <span style="width:16px;height:16px;border:1.5px solid #9599a6;border-radius:3px;display:inline-block;"></span>
        ${SELO_DA_REDE[rede] ?? SELO_DA_REDE.LinkedIn}
        <div style="flex-grow:1;min-width:0;">
          <p style="margin:0;font-size:12px;font-weight:600;color:#dcdde2;">${rede} <span style="font-weight:400;color:#9599a6;">· infográfico</span></p>
          <p style="margin:2px 0 0;font-size:10px;color:${corEstado};">${estado}</p>
        </div>
        ${comSeletor ? `
        <button style="display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:6px;border:1px solid #3f3f4b;background:transparent;color:#dcdde2;font-family:inherit;font-size:11px;cursor:pointer;">
          ${tipo === "pagina" ? ICONE.predio : ICONE.pessoa} ${nome} ${ICONE.seta}
        </button>` : `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#9599a6;">${tipo === "pagina" ? ICONE.predio : ICONE.pessoa} ${nome}</span>`}
      </div>`;

const paulo = `${CABECA}
<div style="padding:28px;background:#1e1e25;min-height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:18px;">
  <div>
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#dcdde2;">Card do Paulo: a conta aparece, e dá para trocar</h2>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#9599a6;">
      A lista "O que sai neste dia, por rede" mostra a rede e o tipo, mas não POR QUAL CONTA. Cada linha ganha o nome da conta; quando a rede tem mais de uma conta no projeto, o nome vira um seletor. Trocar grava no post na hora. Publicado não troca mais.
    </p>
  </div>

  <div style="border-radius:12px;overflow:hidden;border:1px solid #3f3f4b;background:#2a2a33;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#31313c;">
      <p style="margin:0;font-size:12px;font-weight:600;color:#dcdde2;">O que sai neste dia, por conta</p>
      <span style="font-size:10px;color:#9599a6;">Marcar tudo</span>
    </div>
    ${linha("LinkedIn", "demandou", "pagina", "Rascunho, sai às 09:00", "#9599a6", true)}
    ${linha("LinkedIn", "Bruno Donaire", "perfil", "Rascunho, sai às 09:00", "#9599a6", true)}
    ${linha("Instagram", "@demandou", "perfil", "Rascunho, sai às 09:00", "#9599a6", false)}
    ${linha("LinkedIn", "demandou", "pagina", "Publicado", "rgb(74,222,128)", false)}
  </div>

  <p style="margin:0;font-size:12px;line-height:1.5;color:#9599a6;">
    A última linha é o caso de hoje: publicado, e a conta fica escrita para ninguém precisar abrir o LinkedIn para saber por onde saiu. A conta só é seletor enquanto o post não saiu.
  </p>
</div>
${PE}`;

writeFileSync(join(aqui, "Main.dc.html"), janela);
writeFileSync(join(aqui, "Paulo.dc.html"), paulo);
console.log("escritos Main.dc.html e Paulo.dc.html");
