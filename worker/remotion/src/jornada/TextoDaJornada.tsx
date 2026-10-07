import React from "react";
import { limitar, misturar, rgba, saiSuave } from "../sob-medida/base";
import { ICONES } from "../sob-medida/icones";
import type { ContextoDaPeca as Ctx } from "../sob-medida/tipos";

/**
 * O TEXTO EM CAMADA DA JORNADA (07/10/2026), a receita do vídeo da landing
 * (docs/referencia-landing/v4/montar_pitch4.py) liberada pelo Bruno: o texto é
 * desenhado em código POR CIMA da mídia gerada, nunca dentro dela.
 *
 *   - o título num painel de vidro (fundo escuro 0,9, borda clara, sombra
 *     funda; a gravação atrás desfocada de verdade pela passada "vidro"), com
 *     o trecho de destaque no degradê do acento;
 *   - os itens (até 3) entram cada um NA PALAVRA FALADA (o q() da landing),
 *     subindo 26 px em 0,35 s com esmaecimento de 0,28 s;
 *   - na tela cheia, a cena escurece por trás do texto (a landing escurece e
 *     dessatura toda cena de IA que carrega texto).
 *
 * O GRÁFICO (07/10, mesma tarde): quando `props.grafico`, a peça é o próprio
 * efeito ao lado da pessoa, sem mídia: o número que conta de 0 até o valor
 * dito, o ícone que entra com mola e pulsa, o cronômetro com o anel correndo,
 * a linha do tempo que cresce até o item da vez. O tipo vem do Claude em texto
 * livre; o que o desenho não conhece vira título com itens.
 *
 * O que está escrito vem do Claude (só escreve) e se entra, do JEV; o código
 * só desenha. Nenhum número aqui depende de estilo: o tema muda cor e letra.
 */

type Item = { texto: string; t: number };
type Ancora = { x: number; y: number; w: number };

const entrada = (t: number, de: number, u: number) => {
  const p = limitar((t - de) / 0.35);
  return { opacity: limitar((t - de) / 0.28), transform: `translateY(${((1 - saiSuave(p)) * 26 * u).toFixed(1)}px)` };
};

/** Mola com um passo além (o "pop" do ícone e do número). */
const pop = (t: number) => {
  const x = limitar(t / 0.5);
  return x >= 1 ? 1 : 1 - Math.cos(x * Math.PI * 2.2) * Math.exp(-5.2 * x);
};

function tituloComDestaque(titulo: string, destaque: string, grad: string): React.ReactNode {
  const i = destaque ? titulo.toLowerCase().indexOf(destaque.toLowerCase()) : -1;
  if (i < 0) return titulo;
  const estilo: React.CSSProperties = { backgroundImage: grad, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" };
  return (
    <>
      {titulo.slice(0, i)}
      <span style={estilo}>{titulo.slice(i, i + destaque.length)}</span>
      {titulo.slice(i + destaque.length)}
    </>
  );
}

type PartesDoNumero = { antes: string; valor: number; casas: number; depois: string };

/**
 * O número contando de 0 até o valor DITO, no formato brasileiro ("2.645", "88%", "24h"). As partes vêm
 * prontas da montagem (lib/media/jornada/numeros.ts): até 08/10 o desenho lia "2.645" como 2,645 e mostrava
 * "2,6" na tela (vídeo do Igor).
 */
function numeroContando(numero: string, partes: PartesDoNumero | null, t: number): string {
  if (!partes) return numero;
  const p = saiSuave(limitar((t - 0.15) / 0.9));
  const v = (partes.valor * p).toLocaleString("pt-BR", { minimumFractionDigits: partes.casas, maximumFractionDigits: partes.casas });
  return `${partes.antes}${v}${partes.depois}`;
}

function Icone({ nome, tam, cor }: { nome: string; tam: number; cor: string }) {
  const nos = ICONES[nome];
  if (!nos) return null;
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {nos.map(([tag, attrs], k) => React.createElement(tag, { key: k, ...attrs }))}
    </svg>
  );
}

export function TextoDaJornada(c: Ctx) {
  const titulo = String(c.props.titulo ?? "").trim();
  const itens = (Array.isArray(c.props.itens) ? (c.props.itens as Item[]) : []).filter((x) => x && String(x.texto ?? "").trim());
  // O número dito entra mesmo sem título (08/10: sem lugar para os dois, sai o título, nunca o número).
  if (!titulo && !itens.length && !(c.props.grafico && c.props.numero)) return null;
  const destaque = String(c.props.destaque ?? "").trim();
  const a = c.props.ancora as Ancora | undefined;
  const ancora: Ancora = a && [a.x, a.y, a.w].every((v) => typeof v === "number" && Number.isFinite(v)) ? a : { x: 0.06, y: c.vertical ? 0.11 : 0.08, w: c.vertical ? 0.86 : 0.5 };
  const escurecer = Boolean(c.props.escurecer);
  const grafico = Boolean(c.props.grafico);
  const tipo = String(c.props.tipo ?? "titulo");
  const numero = typeof c.props.numero === "string" && c.props.numero ? c.props.numero : "";
  const icone = typeof c.props.icone === "string" ? c.props.icone : "";
  const cronometro = /cronometro|relogio|prazo|tempo/.test(tipo);
  const linha = /linha|passo|etapa/.test(tipo);
  // A escala que a montagem mediu para caber fora do rosto (07/10): tudo é desenhado por `u`.
  const u = c.u * (Number(c.props.escala) > 0 ? Math.min(1, Number(c.props.escala)) : 1);
  const t = c.t;
  const sai = c.fica;
  const acento = c.tema.acento;
  const escuro = c.tema.escuro || "#06111f";
  const claro = "#e8eef6";
  // A DIREÇÃO DESTA EDIÇÃO (08/10): as cores, o peso e a energia que o Claude escreveu e o JEV escolheu para este
  // vídeo. Sem direção, o degradê da cor da marca, como antes. Nada aqui é cravado por nicho ou por tipo de número.
  const direcao = (c.props.direcao as { cores?: string[]; brilho?: string; peso?: number; energia?: string } | null) ?? null;
  const coresDaDirecao = Array.isArray(direcao?.cores) && direcao!.cores!.length >= 2 ? direcao!.cores! : null;
  const grad = coresDaDirecao ? `linear-gradient(100deg, ${coresDaDirecao.join(", ")})` : `linear-gradient(100deg, ${misturar(acento, "#ffffff", 0.55)}, ${acento})`;
  const gradNumero = coresDaDirecao ? `linear-gradient(180deg, ${coresDaDirecao.join(", ")})` : grad;
  const brilhoDoNumero = direcao?.brilho ?? acento;
  const pesoDaDirecao = Math.max(500, Math.min(900, Number(direcao?.peso) || 800));
  const energia = direcao?.energia === "contida" ? 0 : direcao?.energia === "alta" ? 2 : 1;
  const vidro: React.CSSProperties = {
    background: rgba(misturar(escuro, "#000000", 0.25), 0.9),
    border: `${Math.max(1, u)}px solid rgba(255,255,255,0.13)`,
    borderRadius: 22 * u,
    boxShadow: `0 ${24 * u}px ${60 * u}px rgba(0,0,0,0.45)`,
  };
  const tam = (c.vertical ? 50 : 58) * u * (titulo.length > 34 ? 0.84 : 1);
  // O destaque do gráfico: o número que conta ou o ícone (com o anel do cronômetro), entrando com mola antes do título.
  // O ícone sozinho vai NA LINHA do título (07/10: numa linha própria, encolhido para caber, virava um quadradinho apagado).
  const temCabeca = grafico && (numero || cronometro);
  const iconeNoTitulo = grafico && !temCabeca && Boolean(icone && ICONES[icone]);
  const p = pop(t);
  // O NÚMERO DE IMPACTO (08/10): sem caixa, do tamanho que a largura deixa, contando de 0 até o valor DITO com
  // desaceleração no fim, nas cores e na energia da direção desta edição (o dourado do pedido do Bruno foi um
  // exemplo para um vídeo, não regra: a direção decide).
  const partes = (c.props.numeroPartes as PartesDoNumero | null) ?? null;
  const textoFinal = partes ? `${partes.antes}${partes.valor.toLocaleString("pt-BR", { minimumFractionDigits: partes.casas, maximumFractionDigits: partes.casas })}${partes.depois}` : numero;
  const larguraUtil = ancora.w * c.W * 0.96;
  const tamNumero = Math.min((c.vertical ? 210 : 190) * u, larguraUtil / Math.max(3, textoFinal.length * 0.6));
  const subida = 1 - Math.pow(1 - limitar((t - 0.1) / [1.7, 1.3, 0.9][energia]), 4);
  const numeroDeImpacto = grafico && numero && !cronometro ? (
    <div style={{ width: "100%", display: "flex", justifyContent: "center", transform: `scale(${([0.9, 0.75, 0.6][energia] + [0.1, 0.25, 0.4][energia] * p).toFixed(4)})`, transformOrigin: "50% 60%", opacity: limitar(t / 0.12) }}>
      <div
        style={{
          fontWeight: pesoDaDirecao,
          fontSize: tamNumero,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          backgroundImage: gradNumero,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextFillColor: "transparent",
          fontVariantNumeric: "tabular-nums",
          // A sombra escura larga segura o número em fundo claro (08/10: o degradê claro sumia na parede branca do Igor).
          filter: `drop-shadow(0 0 ${3 * u}px rgba(0,0,0,0.85)) drop-shadow(0 ${6 * u}px ${18 * u}px rgba(0,0,0,0.6)) drop-shadow(0 0 ${22 * u}px ${rgba(brilhoDoNumero, 0.45)})`,
        }}
      >
        {partes ? `${partes.antes}${(partes.valor * subida).toLocaleString("pt-BR", { minimumFractionDigits: partes.casas, maximumFractionDigits: partes.casas })}${partes.depois}` : numero}
      </div>
    </div>
  ) : null;
  const cabeca = numeroDeImpacto ?? (temCabeca ? (
    <div data-vidro="" style={{ ...vidro, display: "flex", alignItems: "center", gap: 20 * u, padding: `${16 * u}px ${26 * u}px`, transform: `scale(${(0.6 + 0.4 * p).toFixed(4)})`, transformOrigin: "0% 50%", opacity: limitar(t / 0.15) }}>
      {cronometro ? (
        <div style={{ position: "relative", width: 96 * u, height: 96 * u, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: rgba(acento, 0.16) }}>
          {cronometro ? (
            <svg width={96 * u} height={96 * u} viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
              <circle cx="50" cy="50" r="45" fill="none" stroke={acento} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(283 * limitar(t / Math.max(1, c.dur))).toFixed(1)} 283`} />
            </svg>
          ) : null}
          <div style={{ transform: `scale(${(1 + 0.06 * Math.sin(t * 4)).toFixed(4)})` }}>
            <Icone nome={icone || (cronometro ? "relogio" : "")} tam={52 * u} cor="#ffffff" />
          </div>
        </div>
      ) : null}
      {numero ? (
        <div style={{ fontWeight: 700, fontSize: (c.vertical ? 104 : 112) * u, lineHeight: 1, letterSpacing: "-0.03em", backgroundImage: grad, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", fontVariantNumeric: "tabular-nums" }}>
          {numeroContando(numero, (c.props.numeroPartes as PartesDoNumero | null) ?? null, t)}
        </div>
      ) : null}
    </div>
  ) : null);
  // A linha do tempo: um fio que cresce do primeiro ao último item que já entrou.
  const entrados = itens.filter((it) => t >= it.t).length;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: sai, fontFamily: c.tema.fonteTitulo || "Geist", color: claro }}>
      {escurecer ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: limitar(t / 0.3),
            // A cena fica ATRÁS do texto: escurece inteira um pouco (a landing escurece de 6% a 30%), mais no alto, onde o texto mora, e com vinheta.
            background: `linear-gradient(180deg, ${rgba(escuro, 0.72)} 0%, ${rgba(escuro, 0.3)} 40%, rgba(0,0,0,0) 62%), radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 100%), ${rgba(escuro, 0.2)}`,
          }}
        />
      ) : null}
      <div style={{ position: "absolute", left: ancora.x * c.W, top: ancora.y * c.H, width: ancora.w * c.W, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16 * u }}>
        {cabeca}
        {titulo ? (
          <div data-vidro="" style={{ ...vidro, ...entrada(t, temCabeca ? 0.25 : 0, u), padding: `${22 * u}px ${30 * u}px`, maxWidth: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 * u }}>
              {iconeNoTitulo ? (
                <span style={{ flex: "0 0 auto", width: tam * 1.35, height: tam * 1.35, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: grad, transform: `scale(${(0.5 + 0.5 * p).toFixed(4)}) rotate(${((1 - p) * -20).toFixed(1)}deg)` }}>
                  <Icone nome={icone} tam={tam * 0.8} cor="#ffffff" />
                </span>
              ) : null}
              <div style={{ fontWeight: c.tema.pesoTitulo || 600, fontSize: tam, lineHeight: 1.06, letterSpacing: "-0.025em" }}>{tituloComDestaque(titulo, destaque, grad)}</div>
            </div>
          </div>
        ) : null}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 16 * u, paddingLeft: linha ? 34 * u : 0 }}>
          {linha && itens.length ? (
            <div
              style={{
                position: "absolute",
                left: 11 * u,
                top: 30 * u,
                width: 3 * u,
                borderRadius: 2 * u,
                background: grad,
                height: `${Math.max(0, entrados - 1) * (72 * u)}px`,
                transition: "none",
              }}
            />
          ) : null}
          {itens.slice(0, 3).map((it, k) => (
            <div
              key={k}
              data-vidro=""
              style={{ ...vidro, ...entrada(t, Math.max(0.05, it.t), u), position: "relative", borderRadius: 18 * u, padding: `${14 * u}px ${22 * u}px`, display: "flex", alignItems: "center", gap: 14 * u, opacity: t < it.t ? 0 : entrada(t, it.t, u).opacity }}
            >
              {linha ? (
                <span style={{ position: "absolute", left: -34 * u + 4 * u, width: 18 * u, height: 18 * u, borderRadius: "50%", background: grad, boxShadow: `0 0 ${12 * u}px ${rgba(acento, 0.7)}` }} />
              ) : (
                <span style={{ width: 12 * u, height: 12 * u, borderRadius: "50%", background: grad, flex: "0 0 auto", boxShadow: `0 0 ${12 * u}px ${rgba(acento, 0.7)}` }} />
              )}
              <span style={{ fontWeight: 600, fontSize: (c.vertical ? 34 : 36) * u, lineHeight: 1.15 }}>{String(it.texto)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
