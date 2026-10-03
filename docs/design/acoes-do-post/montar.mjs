/**
 * Gera os artboards da tela de posts. A casca do cartao e uma so: o que muda
 * entre os quatro estados e o selo e a LINHA DE ACOES, que e a decisao inteira.
 * Escrever quatro vezes a mao faria os quatro divergirem na primeira correcao.
 *
 *   node docs/design/acoes-do-post/montar.mjs
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
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap">
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

/** Botao no tamanho sm do componente real: h-8, px-3, 14px, semibold. */
const botao = (texto, variante, icone) => {
  const estilos = {
    default: "background:#ef6122;color:#fff;border:0;",
    destructive: "background:rgba(127,29,29,0.2);color:#f87171;border:1px solid rgba(127,29,29,0.5);",
    outline: "background:transparent;color:#dcdde2;border:1px solid #3f3f4b;",
    ghost: "background:transparent;color:#9599a6;border:0;",
  };
  const cresce = variante === "default" ? "flex-grow:1;" : "";
  return `<button style="display:inline-flex;align-items:center;justify-content:center;gap:8px;height:32px;padding:0 12px;border-radius:4px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;${cresce}${estilos[variante]}">${icone}${texto}</button>`;
};

const svg = (d, cor = "currentColor", strokeW = 2) =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const ICONE = {
  enviar: svg('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
  x: svg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>'),
  arquivar: svg('<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>'),
  lixeira: svg('<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  voltar: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  relogio: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  ok: svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  link: svg('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
};

const SELO = {
  secondary: { fundo: "#31313c", texto: "#9599a6", borda: "#3f3f4b" },
  warning: { fundo: "rgba(161,98,7,0.2)", texto: "#facc15", borda: "rgba(250,204,21,0.25)" },
  success: { fundo: "rgba(21,128,61,0.2)", texto: "#4ade80", borda: "rgba(74,222,128,0.25)" },
  destructive: { fundo: "rgba(185,28,28,0.2)", texto: "#f87171", borda: "rgba(248,113,113,0.25)" },
};

/** Um cartao de post aberto, com a linha de acoes daquele estado. */
function cartao({ selo, variante, rede, data, texto, acoes, aviso, nota }) {
  const s = SELO[variante];
  return `
  <div style="border-radius:12px;border:1px solid #3f3f4b;background:#2a2a33;overflow:hidden;">
    <div style="padding:16px;display:flex;gap:12px;align-items:flex-start;">
      <div style="flex-grow:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:2px 8px;border-radius:9999px;background:${s.fundo};color:${s.texto};border:1px solid ${s.borda};">${selo}</span>
          <span style="font-size:12px;color:#9599a6;">${rede}</span>
          <span style="font-size:12px;color:#9599a6;margin-left:auto;">${data}</span>
        </div>
        <p style="margin:0;font-size:14px;line-height:1.5;color:#dcdde2;">${texto}</p>
      </div>
      ${svg('<path d="m18 15-6-6-6 6"/>', "#9599a6")}
    </div>
    <div style="border-top:1px solid #3f3f4b;padding:16px;display:flex;flex-direction:column;gap:16px;">
      ${aviso ?? ""}
      <div style="display:flex;gap:8px;">${acoes}</div>
      ${nota ? `<p style="margin:0;font-size:12px;line-height:1.5;color:#9599a6;">${nota}</p>` : ""}
    </div>
  </div>`;
}

const avisoConexao = `
      <div style="display:flex;gap:10px;align-items:flex-start;border-radius:10px;padding:12px 14px;border:1px solid rgba(248,113,113,0.3);background:rgba(185,28,28,0.08);">
        ${svg('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L14.7 3.9a2 2 0 0 0-3.4 0Z"/>', "#f87171")}
        <div>
          <p style="margin:0;font-size:13px;font-weight:600;color:#f87171;">Sua conexão com o LinkedIn foi revogada</p>
          <p style="margin:4px 0 0;font-size:12px;line-height:1.5;color:#9599a6;">Isso acontece quando o acesso é retirado em linkedin.com, nas permissões da sua conta. O post continua aqui, inteiro. Reconecte e publique de novo.</p>
          <a href="#" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:600;">Reconectar o LinkedIn</a>
        </div>
      </div>`;

// ── Artboard 1: os quatro estados e o que da para fazer em cada um ──────────
const main = `${CABECA}
<div style="padding:28px;background:#1e1e25;min-height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:18px;">

  <div>
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#dcdde2;">O que dá para fazer com um post, em cada estado</h2>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#9599a6;">
      Hoje a linha de ações só existe para Rascunho. Post que falhou ou foi rejeitado não tem botão nenhum, e é onde o post do LinkedIn parou. Cada estado ganha as ações que fazem sentido nele, e nada mais.
    </p>
  </div>

  ${cartao({
    selo: "Rascunho",
    variante: "secondary",
    rede: "LinkedIn",
    data: "14 de set.",
    texto: "Quais das 5 etapas de criação de conteúdo você deveria delegar para a IA agora mesmo?",
    acoes: [botao("Aprovar e publicar", "default", ICONE.enviar), botao("Rejeitar", "destructive", ICONE.x), botao("Apagar", "ghost", ICONE.lixeira)].join(""),
    nota: "Muda pouco: entra só o Apagar, discreto, no fim da linha. Rejeitar continua sendo o caminho normal, porque ele guarda o que a esteira gerou.",
  })}

  ${cartao({
    selo: "Falhou",
    variante: "destructive",
    rede: "LinkedIn",
    data: "14 de set.",
    texto: "Quais das 5 etapas de criação de conteúdo você deveria delegar para a IA agora mesmo?",
    aviso: avisoConexao,
    acoes: [botao("Tentar publicar de novo", "default", ICONE.voltar), botao("Arquivar", "outline", ICONE.arquivar), botao("Apagar", "ghost", ICONE.lixeira)].join(""),
    nota: "O estado que hoje é beco sem saída. Antes dos botões vem o motivo em português, porque tentar de novo sem reconectar falha igual.",
  })}

  ${cartao({
    selo: "Rejeitado",
    variante: "secondary",
    rede: "X (Twitter)",
    data: "14 de set.",
    texto: "1/ O levantamento da RD Station e da Reportei sobre criação de conteúdo aponta pra um caminho claro.",
    acoes: [botao("Voltar para rascunho", "outline", ICONE.voltar), botao("Apagar", "destructive", ICONE.lixeira)].join(""),
    nota: "Rejeitado é arquivado, então não precisa de Arquivar. Precisa de uma saída (apagar) e de uma volta, para quem rejeitou sem querer.",
  })}

  ${cartao({
    selo: "Agendado",
    variante: "warning",
    rede: "LinkedIn",
    data: "16 de set., 09:00",
    texto: "O que muda quando a pesquisa vem antes do texto, e não depois.",
    acoes: [botao("Publicar agora", "default", ICONE.relogio), botao("Arquivar", "outline", ICONE.arquivar)].join(""),
    nota: "Arquivar tira da fila antes da hora. Apagar fica de fora: post agendado sumir sem aviso é o tipo de coisa que a pessoa descobre tarde.",
  })}

  ${cartao({
    selo: "Publicado",
    variante: "success",
    rede: "LinkedIn",
    data: "12 de set.",
    texto: "R$ 6,5 bilhões perdidos por eólicas e solares em 2025 por curtailment.",
    acoes: [botao("Ver post publicado", "outline", ICONE.link)].join(""),
    nota: "Não ganha nada. Apagar aqui apagaria o registro de algo que está no ar, e o número do relatório mensal vem daqui.",
  })}

</div>
${PE}`;

// ── Artboard 2: a conexão que se assume morta ───────────────────────────────
const conexao = `${CABECA}
<div style="padding:28px;background:#1e1e25;min-height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:18px;">

  <div>
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#dcdde2;">A rede que o app acha que está conectada</h2>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#9599a6;">
      Hoje "ativa" é uma chave manual, não um fato. Oito contas aparecem verdes e seis estão mortas. Quando a publicação descobre a verdade, ela precisa gravar isso em vez de jogar fora.
    </p>
  </div>

  <div>
    <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#9599a6;text-transform:uppercase;">Hoje</p>
    <div style="display:flex;align-items:center;gap:12px;border-radius:12px;border:1px solid #3f3f4b;background:#2a2a33;padding:14px 16px;">
      <div style="width:36px;height:36px;border-radius:10px;background:#31313c;display:flex;align-items:center;justify-content:center;color:#9599a6;font-weight:700;font-size:13px;">in</div>
      <div style="flex-grow:1;min-width:0;">
        <p style="margin:0;font-size:14px;font-weight:600;color:#dcdde2;">Bruno Donaire</p>
        <p style="margin:2px 0 0;font-size:12px;color:#9599a6;">Perfil pessoal</p>
      </div>
      <div style="width:36px;height:20px;border-radius:9999px;background:#22c55e;position:relative;">
        <div style="position:absolute;top:2px;left:18px;width:16px;height:16px;border-radius:50%;background:#fff;"></div>
      </div>
      <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;background:rgba(21,128,61,0.2);color:#4ade80;border:1px solid rgba(74,222,128,0.25);">ativa</span>
    </div>
    <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#9599a6;">O token está morto há horas e a tela não tem como saber, porque ninguém nunca perguntou ao LinkedIn.</p>
  </div>

  <div>
    <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#f6803d;text-transform:uppercase;">Proposto</p>
    <div style="display:flex;align-items:center;gap:12px;border-radius:12px;border:1px solid rgba(248,113,113,0.35);background:#2a2a33;padding:14px 16px;">
      <div style="width:36px;height:36px;border-radius:10px;background:#31313c;display:flex;align-items:center;justify-content:center;color:#9599a6;font-weight:700;font-size:13px;">in</div>
      <div style="flex-grow:1;min-width:0;">
        <p style="margin:0;font-size:14px;font-weight:600;color:#dcdde2;">Bruno Donaire</p>
        <p style="margin:2px 0 0;font-size:12px;color:#f87171;">Acesso revogado no LinkedIn, hoje às 08:34</p>
      </div>
      ${botao("Reconectar", "default", ICONE.voltar)}
      <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;background:rgba(185,28,28,0.2);color:#f87171;border:1px solid rgba(248,113,113,0.25);">reconectar</span>
    </div>
    <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#9599a6;">
      O estado não é adivinhado: ele é gravado no momento em que uma publicação leva 401 do LinkedIn, com a data e o motivo que a rede devolveu. A chave liga e desliga continua existindo, e é outra coisa: ela é escolha sua, este é um fato da rede.
    </p>
  </div>

  <div style="border-radius:12px;padding:16px 18px;background:#2a2a33;border:1px solid #3f3f4b;">
    <p style="margin:0;font-size:13px;line-height:1.55;color:#9599a6;">
      <span style="color:#dcdde2;font-weight:600;">Por que isso importa esta semana:</span>
      gravar o App Review do LinkedIn EXIGE revogar o app para a tela de consentimento reaparecer. Ou seja você vai quebrar a própria conexão de propósito, mais de uma vez, e precisa ver na tela qual delas caiu.
    </p>
  </div>

</div>
${PE}`;

writeFileSync(join(aqui, "Main.dc.html"), main);
writeFileSync(join(aqui, "Conexao.dc.html"), conexao);
console.log("escritos Main.dc.html e Conexao.dc.html");
