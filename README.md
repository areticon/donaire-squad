# Demandou

SaaS de criação e publicação de conteúdo com um squad de agentes de IA. O cliente
grava um vídeo (ou dá um tema) e a plataforma pesquisa, escreve, corta, revisa e
publica a semana em LinkedIn, Instagram, X, Facebook e YouTube. Produção em
[demandou.com](https://demandou.com).

## Onde está cada coisa

- **`HANDOFF.md`**: o estado completo do projeto. O cabeçalho (seções 1 a 11) é o
  resumo; as "partes" no fim são o diário de cada sessão, com o mecanismo de
  cada defeito e o motivo de cada decisão. Se o resumo divergir do código, o
  código manda.
- **`PROJETO.md`**: o que é, a stack real, as decisões que valem mais que o
  código e as armadilhas já pagas.
- **`CONTINUAR.md`**: o prompt para começar um chat novo com o Claude Code.
- **`ESTRATEGIA.md`** e **`MODELO_DE_NEGOCIO_v2.md`**: venda, preço e conta.
- **Notion**: a wiki "Estado da Demandou (documento vivo)" e o planner de
  execução. O HANDOFF é o técnico; a wiki é o pensamento; o planner é o "quando".

## Rodar local

```bash
npm install
npx tsx --env-file=.env.local scripts/tmp/sessao-e2e.mts criar <projectId>   # cookie de teste
npm run dev
```

O banco é compartilhado com produção (decisão de custo, ver `PROJETO.md`), então
o teste local roda sobre dados reais. O worker de vídeo mora em `worker/` e sobe
com `railway up --service video-worker --detach`, de dentro de `worker/`.

## Medir

```bash
npx tsx --env-file=.env.local scripts/funil.mts 7            # o funil da semana
npx tsx --env-file=.env.local scripts/tmp/medir-e2e-0809.mts # a esteira de ponta a ponta, em produção
```

## Regras da casa que o código carrega

Nenhum número sem fonte vai ao ar. O que dá para medir, mede-se antes de pedir
opinião ao modelo. Em integração com terceiro, medir o que voltou e tentar de
novo quando a falha for de tempo. Estado é derivado do dado na hora de mostrar,
nunca texto gravado. E nunca travessão em texto nenhum.
