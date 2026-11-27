/* grade — planejador de curso BCC/ICMC.
   Roda inteiro no navegador: o histórico nunca sai da máquina e nada é salvo
   (sem localStorage, sem rede). Recarregar a página apaga tudo. */

import { lerHistorico, CONCLUIDO, CURSANDO } from './historico.js?v=4';

const G = window.CURRICULO;
const GRADE = new Map(G.disciplinas.map((d) => [d.c, d]));
const ESTAGIO = new Set(G.disciplinasEstagioProjeto);
const ENFASES = G.enfases || [];

/* rótulo curto do chip de cada ênfase; o nome completo vai no painel */
const ENFASE_CURTA = {
  'desenvolvimento-web': 'web',
  'engenharia-de-dados': 'eng. dados',
  'engenharia-de-software': 'eng. software',
  'inteligencia-artificial': 'IA',
  robotica: 'robótica',
  'sistemas-computacionais-avancados-e-de-alto-desempenho': 'alto desempenho',
  'sistemas-embarcados': 'embarcados',
  'tecnicas-de-programacao-avancada': 'programação',
  'ciencia-de-dados': 'ciência de dados',
};

/* Tabela de equivalências do ICMC: cursar `de` (partes exigidas, cada uma com
   siglas alternativas) conta como as disciplinas `para` da grade. Regras em que
   o lado cursado já é todo do BCC (troca entre turmas da própria grade) ficam de fora. */
const EQUIV = (window.EQUIVALENCIAS?.regras || [])
  .filter((r) => !r.de.every((parte) => parte.some((c) => GRADE.has(c))));

/** Créditos, período ideal e requisitos das disciplinas de outros cursos (JupiterWeb). */
const EXTERNAS = window.EQUIVALENCIAS?.externas || {};

/** Equivalências um-para-um de qualquer curso, nos dois sentidos: cumprem requisitos de fora. */
const PARES = new Map();
for (const [a, b] of window.EQUIVALENCIAS?.pares || []) {
  if (!PARES.has(a)) PARES.set(a, new Set());
  if (!PARES.has(b)) PARES.set(b, new Set());
  PARES.get(a).add(b);
  PARES.get(b).add(a);
}

/** Disciplina cursada em cada parte da regra: a primeira que o Júpiter ainda oferece. */
const cursadasDaRegra = (r) => r.de.map((parte) => parte.find((c) => EXTERNAS[c] || GRADE.has(c)) || parte[0]);

/**
 * Regras que trocam exatamente uma disciplina da grade e cujas disciplinas ainda
 * existem no Júpiter: dá para planejar "como" elas.
 */
const alternativasDe = (codigo) => EQUIV.filter((r) => r.para.length === 1 && r.para[0] === codigo
  && r.de.every((parte) => parte.some((c) => EXTERNAS[c] || GRADE.has(c))));

const rotuloRegra = (r) => r.de.map((parte) => parte.join(' ou ')).join(' + ');

const MINIMO_CREDITOS = 12; // abaixo disso o semestre não vale, exceto os dois últimos
const SEMESTRES_LIVRES = 2; // os dois últimos do plano podem ficar abaixo do mínimo
const NOTA_REQUISITO_FRACO = 3; // requisito fraco só libera com nota >= 3,0

const INSTITUTOS = [
  { id: 'SCC', rotulo: 'SCC', dep: 'scc', teste: (c) => c.startsWith('SCC') },
  { id: 'SSC', rotulo: 'SSC', dep: 'ssc', teste: (c) => c.startsWith('SSC') },
  { id: 'SMA', rotulo: 'SMA', dep: 'sma', teste: (c) => c.startsWith('SMA') },
  { id: 'SME', rotulo: 'SME', dep: 'sme', teste: (c) => c.startsWith('SME') },
  { id: 'OUT', rotulo: 'outros', dep: 'fis', teste: () => true },
];

const dep = (codigo) => INSTITUTOS.find((i) => i.teste(codigo)).dep;
const instituto = (codigo) => INSTITUTOS.find((i) => i.teste(codigo)).id;
const el = (id) => document.getElementById(id);

/** Créditos-aula de um semestre do plano. */
const creditosDoSemestre = (s) => s.itens.reduce((t, c) => t + (GRADE.has(c) ? perfil(c).ca : 0), 0);

/**
 * Como a disciplina vai ser cursada: a da grade ou, com "cursar como", as
 * equivalentes, com créditos, período ideal e requisitos delas. Requisito de
 * fora vale também cumprido por uma equivalente um-para-um.
 */
function perfil(codigo, via = S.via.get(codigo)) {
  if (!via) return GRADE.get(codigo);
  const cursadas = cursadasDaRegra(via).map((c) => EXTERNAS[c] || GRADE.get(c) || { ca: 0, ct: 0, p: 0, r: [] });
  return {
    c: codigo,
    via,
    ca: cursadas.reduce((t, x) => t + x.ca, 0),
    ct: cursadas.reduce((t, x) => t + x.ct, 0),
    p: cursadas.find((x) => x.p)?.p || 0,
    r: cursadas.flatMap((x) => x.r).map((g) => g.flatMap((r) => [r, ...[...(PARES.get(r.c) || [])].map((c) => ({ c, k: r.k }))])),
  };
}

/** Requisito de outro curso que não dá para planejar aqui: só avisa, quem confere é o Júpiter. */
const deFora = (pf, grupo) => pf.via && !grupo.some((r) => GRADE.has(r.c));

/** Teto de créditos-aula por semestre (Configurações). */
const limiteCreditos = () => S.limiteCreditos;

/** Semestre puxado: passa do limite de créditos-aula. */
export const pesado = (s) => creditosDoSemestre(s) > limiteCreditos();

export const avisoPesado = (s) =>
  `Este semestre tem ${creditosDoSemestre(s)} créditos-aula e vai ser mais puxado. `
  + 'Para um plano mais leve, espalhe as disciplinas.';

/** Só os dois últimos semestres do plano podem ficar abaixo do mínimo. */
const isentoDoMinimo = (idx) => idx >= S.plano.length - SEMESTRES_LIVRES;

export const leve = (s, idx) => !isentoDoMinimo(idx) && creditosDoSemestre(s) < MINIMO_CREDITOS;

export const avisoLeve = (s) =>
  `Este semestre tem ${creditosDoSemestre(s)} créditos-aula, abaixo do mínimo de ${MINIMO_CREDITOS}. `
  + `Só os ${SEMESTRES_LIVRES} últimos semestres do plano podem ficar abaixo disso.`;

/** Melhor nota já obtida na disciplina, ou null se nunca cursada. */
const notaDe = (codigo) => (S.hist?.notas.has(codigo) ? S.hist.notas.get(codigo) : null);

/** Requisito fraco: vale com a disciplina cumprida ou com nota >= 3,0 nela. */
const fracoOk = (codigo) => jaTem(codigo) || notaDe(codigo) >= NOTA_REQUISITO_FRACO;

/* ------------------------------------------------------------------ estado */

const S = {
  hist: null,       // histórico interpretado
  concluidas: new Set(),
  cursando: new Set(),
  plano: [],        // [{ ano, sem, itens: [sigla] }]
  filtroTexto: '',
  filtroInst: null,
  soLiberadas: false,
  paridade: true,
  limiteCreditos: 20, // acima disso o semestre é puxado e a sugestão não passa
  passarLimite: true, // arrastar à mão pode passar do limite (fica marcado como puxado)
  aproveitarLivres: true,
  enfases: new Set(), // ids das ênfases escolhidas
  planoAntes: null, // cópia do plano antes de aplicar a sugestão (desfazer)
  tempoBusca: 250,  // ms de busca da otimização; passou disso, fica a melhor solução achada
  usarEquivalencias: false, // otimização pode cursar disciplinas por equivalência
  viaAntes: null,   // "cursar como" antes de aplicar a sugestão (desfazer)
  equivalidas: new Map(), // sigla da grade → { regra, andamento } cobertas pelo histórico
  via: new Map(),         // sigla da grade → regra: planejada como disciplina equivalente
};

/* ------------------------------------------------------- derivação de estado */

function montarEstado(h) {
  S.hist = h;
  S.concluidas = new Set();
  S.cursando = new Set();
  for (const [codigo, st] of h.registros) {
    if (CONCLUIDO.has(st)) S.concluidas.add(codigo);
    else if (CURSANDO.has(st)) S.cursando.add(codigo);
  }
  S.via = new Map();
  calcularEquivalidas();

  const ultimo = h.semestres.reduce(
    (a, b) => (b.ano * 2 + b.sem > a.ano * 2 + a.sem ? b : a),
    { ano: new Date().getFullYear(), sem: new Date().getMonth() < 6 ? 1 : 2 },
  );
  S.plano = [];
  let { ano, sem } = ultimo;
  for (let i = 0; i < 4; i++) {
    if (sem === 1) sem = 2; else { sem = 1; ano += 1; }
    S.plano.push({ ano, sem, itens: [] });
  }
}

/** Disciplinas da grade cobertas por equivalência com o que o histórico tem. */
function calcularEquivalidas() {
  S.equivalidas = new Map();
  for (const regra of EQUIV) {
    const feita = regra.de.every((parte) => parte.some((c) => S.concluidas.has(c)));
    const andamento = !feita
      && regra.de.every((parte) => parte.some((c) => S.concluidas.has(c) || S.cursando.has(c)));
    if (!feita && !andamento) continue;
    for (const c of regra.para) {
      if (S.concluidas.has(c) || S.cursando.has(c)) continue;
      const atual = S.equivalidas.get(c);
      if (!atual || (atual.andamento && feita)) S.equivalidas.set(c, { regra, andamento });
    }
  }
}

/** Disciplina já resolvida pelo histórico (concluída, em andamento ou por equivalência). */
const jaTem = (c) => S.concluidas.has(c) || S.cursando.has(c) || S.equivalidas.has(c);

const planejadas = () => new Set(S.plano.flatMap((s) => s.itens));

function colunaDe(codigo) {
  return S.plano.findIndex((s) => s.itens.includes(codigo));
}

/**
 * Estágio, Projeto de Graduação, Projeto em Intercâmbio e Projeto Empreendedor
 * se equivalem, I e II inclusive: bastam 2 delas, em qualquer combinação. Contam
 * como obrigatórias as 2 primeiras entre cursadas, planejadas (na ordem do plano)
 * e, para preencher, os estágios; o resto conta como eletiva.
 */
function estagiosObrigatorios() {
  const ordem = [
    ...G.disciplinasEstagioProjeto.filter(jaTem),
    ...S.plano.flatMap((s) => s.itens).filter((c) => ESTAGIO.has(c)),
    ...G.disciplinasEstagioProjeto,
  ];
  return new Set([...new Set(ordem)].slice(0, G.estagioProjetoExigidas));
}

/** Tipo efetivo: estágio e projetos dependem do que já foi escolhido. */
function tipoDe(d) {
  if (!ESTAGIO.has(d.c)) return d.t;
  return estagiosObrigatorios().has(d.c) ? 'ob' : 'el';
}

function pendentes(t) {
  const dentro = planejadas();
  return G.disciplinas.filter((d) => tipoDe(d) === t && !jaTem(d.c) && !dentro.has(d.c));
}

/** Créditos-aula já obtidos, somados aos planejados antes da coluna `idx`. */
function creditosAulaAte(idx) {
  const t = S.hist.totais;
  let total = t.ob.a + t.el.a + t.li.a;
  for (let i = 0; i < idx; i++) {
    for (const c of S.plano[i].itens) total += (GRADE.get(c)?.ca || 0);
  }
  return total;
}

/** Eletivas: créditos-aula obtidos + em andamento + planejados, e quanto falta. */
function contaEletivas() {
  const t = S.hist.totais;
  let el = t.el.a;
  let li = t.li.a;
  const fora = [];
  const fontes = new Set([...S.equivalidas.values()].flatMap(({ regra }) => regra.de.flat()));
  for (const c of [...S.cursando, ...planejadas()]) {
    const d = GRADE.get(c);
    if (!d) { if (S.cursando.has(c) && !fontes.has(c)) fora.push(c); continue; }
    if (tipoDe(d) === 'el') el += d.ca;
    else if (d.t === 'li') li += d.ca;
  }
  // eletivas cobertas por equivalência entram com os créditos da disciplina da grade
  let porEquivalencia = 0;
  for (const c of S.equivalidas.keys()) {
    const d = GRADE.get(c);
    if (d && tipoDe(d) === 'el') { el += d.ca; porEquivalencia += d.ca; }
  }
  const aproveitado = S.aproveitarLivres ? Math.min(li, G.creditosLivresAproveitaveis) : 0;
  const total = el + aproveitado;
  return {
    el, li, aproveitado, total, fora, porEquivalencia,
    exigido: G.creditosEletivosExigidos,
    falta: Math.max(0, G.creditosEletivosExigidos - total),
  };
}

/* ---------------------------------------------------------------- ênfases */

const enfasesEscolhidas = () => ENFASES.filter((e) => S.enfases.has(e.id));

/** Sigla → rótulos curtos das ênfases escolhidas em que ela conta. */
function siglasDaEnfase() {
  const mapa = new Map();
  for (const e of enfasesEscolhidas()) {
    const rotulo = ENFASE_CURTA[e.id] || e.nome;
    for (const a of e.grupos.flatMap((g) => g.itens.flat())) {
      const rotulos = mapa.get(a.c) || [];
      if (!rotulos.includes(rotulo)) rotulos.push(rotulo);
      mapa.set(a.c, rotulos);
    }
  }
  return mapa;
}

/**
 * Situação de um item da ênfase (lista de siglas alternativas):
 * feita (histórico), plano (já num semestre), falta (na grade) ou fora (fora da grade).
 */
function situacaoItem(alternativas) {
  const dentro = planejadas();
  const feita = alternativas.find((a) => jaTem(a.c));
  if (feita) return { c: feita.c, estado: 'feita' };
  const plano = alternativas.find((a) => dentro.has(a.c));
  if (plano) return { c: plano.c, estado: 'plano' };
  const naGrade = alternativas.find((a) => GRADE.has(a.c));
  if (naGrade) return { c: naGrade.c, estado: 'falta' };
  return { c: alternativas[0].c, estado: 'fora' };
}

/** Progresso por grupo: quantos itens já contam (feitos ou no plano). */
function progressoEnfase(e) {
  const grupos = e.grupos.map((g) => {
    const itens = g.itens.map((alts) => ({ alts, ...situacaoItem(alts) }));
    const contam = itens.filter((i) => i.estado === 'feita' || i.estado === 'plano').length;
    return { ...g, itens, contam, falta: Math.max(0, g.minimo - contam) };
  });
  const concluida = grupos.every((g) => g.itens.filter((i) => i.estado === 'feita').length >= g.minimo);
  return { grupos, completa: grupos.every((g) => !g.falta), concluida };
}

/**
 * Ênfases cujo mínimo já fecha: "concluída" só com o histórico,
 * "prevista" quando depende de disciplinas do plano.
 */
function enfasesCompletas() {
  return ENFASES.map((e) => ({ e, ...progressoEnfase(e) }))
    .filter((x) => x.completa)
    .map(({ e, grupos, concluida }) => ({
      id: e.id,
      nome: e.nome,
      situacao: concluida ? 'concluida' : 'prevista',
      disciplinas: grupos.flatMap((g) => g.itens.filter((i) => i.estado !== 'falta' && i.estado !== 'fora').map((i) => i.c)),
    }));
}

/* ------------------------------------------------------------- requisitos */

// estágio e projetos (graduação, intercâmbio, empreendedor) podem ser feitos em qualquer semestre
const paridadeOk = (d, coluna) => !d.p || ESTAGIO.has(d.c) || (d.p % 2 === 1 ? coluna.sem === 1 : coluna.sem === 2);

/**
 * Avalia colocar `codigo` na coluna `idx`.
 * Requisito forte bloqueia; fraco e indicação de conjunto apenas avisam.
 */
function avaliar(codigo, idx) {
  const d = GRADE.get(codigo);
  const bloqueios = [];
  const avisos = [];
  if (!d) return { bloqueios, avisos };
  const pf = perfil(codigo);

  const antes = new Set();   // resolvido antes da coluna idx
  const junto = new Set();   // resolvido na própria coluna
  S.concluidas.forEach((c) => antes.add(c));
  S.cursando.forEach((c) => antes.add(c));
  S.plano.forEach((s, i) => {
    if (i < idx) s.itens.forEach((c) => antes.add(c));
    else if (i === idx) s.itens.forEach((c) => junto.add(c));
  });

  for (const grupo of pf.r) {
    const tipo = grupo[0].k;
    const nomes = grupo.map((r) => r.c).join(' ou ');

    if (tipo === 'forte') {
      if (grupo.some((r) => antes.has(r.c))) continue;
      if (deFora(pf, grupo)) { avisos.push(`a equivalente exige ${nomes}: confira no Júpiter`); continue; }
      bloqueios.push(`exige ${nomes} concluída antes`);
      continue;
    }

    if (tipo === 'fraca') {
      // cumprida ou planejada antes libera; senão vale a nota >= 3,0
      if (grupo.some((r) => antes.has(r.c) || notaDe(r.c) >= NOTA_REQUISITO_FRACO)) continue;
      if (deFora(pf, grupo)) { avisos.push(`a equivalente pede ${nomes} (fraco): confira no Júpiter`); continue; }
      const notas = grupo
        .map((r) => (notaDe(r.c) === null ? null : `${r.c} ficou com ${notaDe(r.c).toFixed(1).replace('.', ',')}`))
        .filter(Boolean)
        .join(', ');
      bloqueios.push(
        `requisito fraco ${nomes}: precisa estar cumprida ou com nota ${NOTA_REQUISITO_FRACO},0`
        + (notas ? ` — ${notas}` : ''),
      );
      continue;
    }

    // indicação de conjunto: mesma coluna já serve, e nunca bloqueia
    if (grupo.some((r) => antes.has(r.c) || junto.has(r.c))) continue;
    avisos.push(`${nomes} não cumprida`);
  }

  if (ESTAGIO.has(codigo)) {
    const creditos = creditosAulaAte(idx);
    if (creditos < G.creditosParaEstagio) {
      bloqueios.push(`precisa de ${G.creditosParaEstagio} créditos-aula aprovados (terá ${creditos})`);
    }
  }

  const coluna = S.plano[idx];
  if (coluna && !S.passarLimite && !coluna.itens.includes(codigo)
    && creditosDoSemestre(coluna) + pf.ca > limiteCreditos()) {
    bloqueios.push(`passa do limite de ${limiteCreditos()} créditos-aula do semestre`);
  }
  if (coluna && pf.via && !pf.p) {
    // sem período ideal no Júpiter (optativa no curso dela): não dá para saber a oferta
    avisos.push('confira a oferta da equivalente no Júpiter');
  } else if (coluna && !paridadeOk(pf, coluna)) {
    const certo = pf.p % 2 === 1 ? '1º' : '2º';
    if (S.paridade) bloqueios.push(`costuma ser oferecida no ${certo} semestre; desligue o filtro para planejar assim`);
    else avisos.push(`oferta usual no ${certo} semestre`);
  }
  return { bloqueios, avisos };
}

/** Sem requisito pendente considerando só o histórico (forte e fraco). */
function liberada(codigo) {
  if (!GRADE.has(codigo)) return true;
  const pf = perfil(codigo);
  return pf.r.every((g) => {
    if (deFora(pf, g)) return true;
    if (g[0].k === 'forte') return g.some((r) => jaTem(r.c));
    if (g[0].k === 'fraca') return g.some((r) => fracoOk(r.c));
    return true;
  });
}

/* ------------------------------------------------------------- otimização */

const SEMESTRES_EXTRAS = 8; // quantos semestres a sugestão pode criar além do plano

const copiaPlano = (plano) => plano.map((s) => ({ ...s, itens: [...s.itens] }));

const porPeriodo = (a, b) => (GRADE.get(a).p - GRADE.get(b).p) || a.localeCompare(b);

/** Já conta de graça: cursada (histórico) ou escolhida antes (plano). */
const conta = (c, dentro) => jaTem(c) || dentro.has(c);

/**
 * Requisitos (forte e fraco) de `codigo` que ninguém cobre: nem histórico, nem
 * plano, nem obrigatória (que vai ser cursada de qualquer jeito). Esses entram
 * junto com ela. null quando o requisito está fora da grade.
 */
function requisitosQuePuxa(codigo, dentro, via) {
  const faltam = [];
  const pf = perfil(codigo, via);
  for (const g of pf.r) {
    const tipo = g[0].k;
    if (tipo === 'conjunto' || deFora(pf, g)) continue;
    if (g.some((r) => conta(r.c, dentro) || (GRADE.has(r.c) && tipoDe(GRADE.get(r.c)) === 'ob')
      || (tipo === 'fraca' && fracoOk(r.c)))) continue;
    const alt = g.find((r) => GRADE.has(r.c) && !ESTAGIO.has(r.c));
    if (!alt) return null;
    faltam.push(alt.c);
  }
  return faltam;
}

/** As disciplinas e, em cadeia, os requisitos não obrigatórios que elas puxam. */
function fecho(codigos, dentro, vias = S.via) {
  const out = new Set();
  const pilha = [...codigos];
  while (pilha.length) {
    const c = pilha.pop();
    if (out.has(c) || conta(c, dentro)) continue;
    const puxa = requisitosQuePuxa(c, dentro, vias.get(c));
    if (puxa === null) return null;
    out.add(c);
    pilha.push(...puxa);
  }
  return out;
}

const somaCa = (siglas, vias = S.via) => [...siglas].reduce((t, c) => t + perfil(c, vias.get(c)).ca, 0);
const somaCt = (siglas, vias = S.via) => [...siglas].reduce((t, c) => t + perfil(c, vias.get(c)).ct, 0);

/**
 * Menor conjunto de disciplinas que fecha todas as ênfases escolhidas.
 *
 * Objetivo: menos créditos-aula (desempate: menos créditos-trabalho). O que já
 * foi cursado e o que já está no plano contam de graça, então disciplinas que
 * você já escolheu viram preferência. Disciplina que serve a mais de uma ênfase
 * conta uma vez só; requisito eletivo que ela puxa entra no custo.
 *
 * Busca em profundidade com poda (branch and bound): cada nó pega o grupo com
 * menos folga e ramifica em "entra c1", "entra c2 e c1 não", ... O limite
 * inferior soma, no grupo mais exigente, os créditos das opções mais baratas.
 */
function otimizarEnfases(enfases) {
  const dentro = planejadas();
  const grupos = enfases.flatMap((e) => e.grupos.map((g) => ({
    minimo: g.minimo,
    itens: g.itens.map((alts) => alts.map((a) => a.c)),
  })));

  // com equivalências, cada disciplina vai pelo jeito mais barato de cursá-la (a da grade ou
  // uma equivalente oferecida), contando os requisitos que cada jeito puxa.
  // shortcut: escolhe o jeito disciplina a disciplina; trocar dentro da busca acharia
  // combinações em que requisitos puxados se compartilham, a um custo bem maior de tempo.
  const vias = new Map(S.via);
  const valorDe = (tem, v = vias) => somaCa(tem, v) + somaCt(tem, v) / 1000;
  const custoSozinho = new Map();
  for (const g of grupos) {
    for (const c of g.itens.flat()) {
      if (custoSozinho.has(c) || !GRADE.has(c) || ESTAGIO.has(c) || conta(c, dentro)) continue;
      const jeitos = [undefined, ...(S.usarEquivalencias ? alternativasDe(c) : [])];
      let melhorJeito = null;
      for (const via of jeitos) {
        const v = new Map(vias);
        if (via) v.set(c, via); else v.delete(c);
        const f = fecho([c], dentro, v);
        if (f && (!melhorJeito || valorDe(f, v) < melhorJeito.valor)) melhorJeito = { via, valor: valorDe(f, v), ca: somaCa(f, v) };
      }
      if (!melhorJeito) continue;
      if (melhorJeito.via) vias.set(c, melhorJeito.via);
      custoSozinho.set(c, melhorJeito.ca);
    }
  }
  const valor = (tem) => valorDe(tem);

  let melhor = null;
  let esgotou = false;
  const prazo = performance.now() + S.tempoBusca;
  function busca(escolhidas, proibidas) {
    if (esgotou || performance.now() > prazo) { esgotou = true; return; }
    const tem = fecho(escolhidas, dentro, vias);
    const atual = valor(tem);
    if (melhor && atual >= melhor.valor) return;

    let alvo = null;
    let limite = 0;
    for (const g of grupos) {
      const abertos = g.itens.filter((alts) => !alts.some((c) => conta(c, dentro) || tem.has(c)));
      const falta = g.minimo - (g.itens.length - abertos.length);
      if (falta <= 0) continue;
      const opcoes = abertos
        .map((alts) => alts.filter((c) => custoSozinho.has(c) && !proibidas.has(c)))
        .filter((l) => l.length);
      if (opcoes.length < falta) return; // grupo não fecha mais neste ramo
      const baratas = opcoes.map((l) => Math.min(...l.map((c) => perfil(c, vias.get(c)).ca))).sort((a, b) => a - b);
      limite = Math.max(limite, baratas.slice(0, falta).reduce((t, x) => t + x, 0));
      if (!alvo || opcoes.length - falta < alvo.folga) alvo = { opcoes, folga: opcoes.length - falta };
    }
    if (!alvo) { melhor = { valor: atual, tem }; return; }
    if (melhor && atual + limite >= melhor.valor) return;

    const ramos = [...new Set(alvo.opcoes.flat())]
      .sort((a, b) => (custoSozinho.get(a) - custoSozinho.get(b)) || porPeriodo(a, b));
    const fora = new Set(proibidas);
    for (const c of ramos) {
      busca([...escolhidas, c], new Set(fora));
      fora.add(c);
    }
  }
  busca([], new Set());

  const escolhidas = melhor ? [...melhor.tem].sort(porPeriodo) : [];
  return {
    escolhidas,
    // equivalências novas que a solução usa (as do plano já estão em S.via)
    vias: new Map(escolhidas.filter((c) => vias.has(c) && !S.via.has(c)).map((c) => [c, vias.get(c)])),
    possivel: !!melhor,
    completa: !esgotou, // busca terminou: a solução é ótima
  };
}

/** Eletivas além das ênfases até fechar os créditos exigidos, preferindo as das ênfases. */
function eletivasParaFechar(escolhidas, enfases) {
  const dentro = planejadas();
  let falta = contaEletivas().falta - somaCa(escolhidas.filter((c) => tipoDe(GRADE.get(c)) === 'el'));
  const usadas = new Set(escolhidas);
  const daEnfase = enfases.flatMap((e) => e.grupos.flatMap((g) => g.itens.flat().map((a) => a.c)));
  const outras = pendentes('el').map((d) => d.c).sort(porPeriodo);
  const extras = [];
  for (const c of [...daEnfase, ...outras]) {
    if (falta <= 0) break;
    if (usadas.has(c) || !GRADE.has(c) || tipoDe(GRADE.get(c)) !== 'el' || ESTAGIO.has(c) || conta(c, dentro)) continue;
    const f = fecho([c], new Set([...dentro, ...usadas]));
    if (!f) continue;
    f.forEach((x) => { usadas.add(x); extras.push(x); });
    falta -= somaCa(f);
  }
  return extras;
}

/**
 * Distribui `siglas` em `n` semestres equilibrando a carga: em ordem de
 * requisitos, cada disciplina vai para o semestre permitido (requisitos,
 * paridade, estágio, limite de créditos) de menor carga. Quem tem cadeia de
 * dependentes na fila não pode ir tão para o fim que a cadeia não caiba.
 * Muda S.plano; devolve o que não coube.
 */
function distribuir(siglas, n) {
  while (S.plano.length < n) {
    const u = S.plano[S.plano.length - 1];
    S.plano.push({ ...(u.sem === 1 ? { ano: u.ano, sem: 2 } : { ano: u.ano + 1, sem: 1 }), itens: [] });
  }
  const fila = new Set(siglas);
  const requisitosNaFila = (c) => perfil(c).r
    .filter((g) => g[0].k !== 'conjunto')
    .flatMap((g) => g.map((r) => r.c))
    .filter((r) => fila.has(r));
  const altura = new Map();
  const alturaDe = (c) => {
    if (!altura.has(c)) {
      altura.set(c, 1);
      const dependentes = [...fila].filter((x) => requisitosNaFila(x).includes(c));
      altura.set(c, 1 + Math.max(0, ...dependentes.map(alturaDe)));
    }
    return altura.get(c);
  };

  const resto = [];
  const postas = new Set();
  for (let mudou = true; mudou;) {
    mudou = false;
    // semestres (e jeitos de cursar) onde cada uma pode entrar agora; a mais restrita vai
    // primeiro. Com equivalências, a equivalente pode cair em outra paridade e aliviar a carga.
    const lugares = (c) => {
      const ultimo = S.plano.length - alturaDe(c);
      const ok = [];
      const fixo = S.via.get(c);
      const jeitos = [fixo, ...(S.usarEquivalencias && !fixo ? alternativasDe(c) : [])];
      for (const via of jeitos) {
        if (via) S.via.set(c, via); else S.via.delete(c);
        for (let idx = 0; idx <= ultimo; idx++) {
          if (creditosDoSemestre(S.plano[idx]) + perfil(c).ca > limiteCreditos()) continue;
          if (!avaliar(c, idx).bloqueios.length) ok.push({ idx, via });
        }
      }
      if (fixo) S.via.set(c, fixo); else S.via.delete(c);
      return ok;
    };
    const prontas = [...fila]
      .filter((c) => !postas.has(c) && !resto.includes(c) && requisitosNaFila(c).every((r) => postas.has(r)))
      .map((c) => ({ c, ok: lugares(c) }))
      .sort((a, b) => (a.ok.length - b.ok.length) || (alturaDe(b.c) - alturaDe(a.c)) || porPeriodo(a.c, b.c));
    const proxima = prontas[0];
    if (!proxima) break;
    const ok = lugares(proxima.c); // a carga pode ter mudado desde a ordenação
    if (!ok.length) resto.push(proxima.c);
    else {
      // empate fica com o primeiro: a disciplina da grade antes das equivalentes
      const carga = (l) => creditosDoSemestre(S.plano[l.idx]);
      const { idx: alvo, via } = ok.reduce((a, b) => (carga(b) < carga(a) ? b : a));
      if (via) S.via.set(proxima.c, via);
      S.plano[alvo].itens.push(proxima.c);
      postas.add(proxima.c);
    }
    mudou = true;
  }
  return [...fila].filter((c) => !postas.has(c));
}

/** Quanto pior a distribuição: soma dos quadrados das cargas, com multa para
 *  semestre abaixo do mínimo ou acima do limite. Menor é mais equilibrado. */
function desequilibrio() {
  return S.plano.reduce((t, s, i) => {
    const ca = creditosDoSemestre(s);
    return t + ca * ca + (leve(s, i) ? 1000 : 0) + (ca > limiteCreditos() ? 1000 : 0);
  }, 0);
}

const planoValido = () => S.plano.every((s, i) => s.itens.every((c) => !avaliar(c, i).bloqueios.length));

/**
 * Busca local: move uma disciplina sugerida de semestre sempre que isso deixa
 * a carga mais equilibrada sem quebrar requisito de ninguém. O que você já
 * tinha posto no plano fica parado.
 */
function equilibrar(movaveis) {
  for (let voltas = 0; voltas < 40; voltas++) {
    const atual = desequilibrio();
    let melhor = null;
    for (const c of movaveis) {
      const de = colunaDe(c);
      if (de < 0) continue;
      for (let para = 0; para < S.plano.length; para++) {
        if (para === de || creditosDoSemestre(S.plano[para]) + perfil(c).ca > limiteCreditos()) continue;
        S.plano[de].itens = S.plano[de].itens.filter((x) => x !== c);
        S.plano[para].itens.push(c);
        const v = desequilibrio();
        if (v < atual && (!melhor || v < melhor.v) && planoValido()) melhor = { c, de, para, v };
        S.plano[para].itens.pop();
        S.plano[de].itens.push(c);
      }
    }
    if (!melhor) return;
    S.plano[melhor.de].itens = S.plano[melhor.de].itens.filter((x) => x !== melhor.c);
    S.plano[melhor.para].itens.push(melhor.c);
  }
}

/**
 * Coloca obrigatórias pendentes, disciplinas das ênfases e eletivas extras no
 * plano, usando o menor número de semestres em que tudo cabe (o que já está
 * no plano fica onde está). Muda S.plano.
 */
function encaixarEquilibrado(siglas) {
  const base = copiaPlano(S.plano);
  const viaBase = new Map(S.via);
  let melhor = null;
  for (let n = base.length; n <= base.length + SEMESTRES_EXTRAS; n++) {
    S.plano = copiaPlano(base);
    S.via = new Map(viaBase);
    const naoCoube = distribuir(siglas, n);
    equilibrar(siglas);
    // semestres criados que ficaram vazios saem
    while (S.plano.length > base.length && !S.plano[S.plano.length - 1].itens.length) S.plano.pop();
    if (!melhor || naoCoube.length < melhor.naoCoube.length) melhor = { plano: S.plano, via: S.via, naoCoube };
    if (!naoCoube.length) break;
  }
  S.plano = melhor.plano;
  S.via = melhor.via;
  return melhor.naoCoube;
}

let cacheSugestao = { chave: null, valor: null };

/** Simula a otimização sem mexer no plano. */
function sugestao(enfases) {
  const chave = JSON.stringify([enfases.map((e) => e.id), S.plano, S.paridade, S.limiteCreditos, S.passarLimite, S.tempoBusca, S.usarEquivalencias,
    [...S.via].map(([c, r]) => c + rotuloRegra(r)), [...S.concluidas].length]);
  if (cacheSugestao.chave === chave) return cacheSugestao.valor;

  const otimo = otimizarEnfases(enfases);
  const obrigatorias = pendentes('ob').map((d) => d.c);
  const extras = eletivasParaFechar(otimo.escolhidas, enfases);
  const antes = copiaPlano(S.plano);
  const viaAntes = new Map(S.via);
  const dentro = planejadas();
  otimo.vias.forEach((r, c) => S.via.set(c, r));
  const naoCoube = encaixarEquilibrado([...obrigatorias, ...otimo.escolhidas, ...extras]);
  const onde = new Map();
  S.plano.forEach((s) => s.itens.forEach((c) => { if (!dentro.has(c)) onde.set(c, `${s.ano}/${s.sem}`); }));
  const cargas = S.plano.map(creditosDoSemestre);
  const semestres = S.plano.length;
  const vias = new Map([...S.via].filter(([c]) => !viaAntes.has(c)));
  S.plano = antes;
  S.via = viaAntes;

  const valor = { ...otimo, viasOtimo: otimo.vias, vias, obrigatorias, extras, onde, naoCoube, semestres, maiorCarga: Math.max(0, ...cargas) };
  cacheSugestao = { chave, valor };
  return valor;
}

function aplicarSugestao(enfases) {
  const sug = sugestao(enfases);
  S.planoAntes = copiaPlano(S.plano);
  S.viaAntes = new Map(S.via);
  sug.viasOtimo.forEach((r, c) => S.via.set(c, r)); // as do encaixe, ele escolhe de novo
  const naoCoube = encaixarEquilibrado([...sug.obrigatorias, ...sug.escolhidas, ...sug.extras]);
  desenhar();
  if (naoCoube.length) recusar(naoCoube.join(', '), 'não couberam na sugestão; encaixe à mão');
}

function desfazerSugestao() {
  if (!S.planoAntes) return;
  S.plano = S.planoAntes;
  S.via = S.viaAntes;
  S.planoAntes = null;
  desenhar();
}

/* ------------------------------------------------------------------- cartões */

function cartao(d, origem) {
  const node = document.createElement('article');
  node.className = 'card';
  node.dataset.c = d.c;
  node.dataset.origem = origem;         // 'rail' ou índice da coluna
  node.style.setProperty('--dep', `var(--dep-${dep(d.c)})`);
  node.draggable = true;
  node.tabIndex = 0;

  const idx = origem === 'rail' ? null : +origem;
  const { bloqueios, avisos } = idx === null ? { bloqueios: [], avisos: [] } : avaliar(d.c, idx);

  const tags = [];
  if (origem === 'rail' && !liberada(d.c)) tags.push(['bloqueio', 'requisito pendente']);
  if (origem === 'rail' && d.p) tags.push(['neutra', `${d.p}º período`]);
  if (origem === 'rail' && ESTAGIO.has(d.c)) {
    tags.push(['neutra', tipoDe(d) === 'ob' ? 'troca com estágio ou projeto' : 'vale no lugar do estágio']);
  }
  const enfasesDela = siglasDaEnfase().get(d.c);
  if (enfasesDela) tags.push(['enfase', enfasesDela.join(' · ')]);
  if (S.via.has(d.c)) tags.push(['equiv', `como ${rotuloRegra(S.via.get(d.c))}`]);
  bloqueios.forEach((b) => tags.push(['bloqueio', b]));
  avisos.forEach((a) => tags.push(['aviso', a]));

  node.innerHTML = `
    <span class="card-sigla">${d.c}</span>
    <span class="card-cred">${perfil(d.c).ca}+${perfil(d.c).ct}${S.via.has(d.c) ? "" : ` · ${d.ch}h`}</span>
    <span class="card-nome">${d.n}</span>
    <span class="card-tags">${tags.map(([k, t]) => `<span class="tag tag-${k}">${t}</span>`).join('')}</span>
  `;

  const seletor = document.createElement('select');
  seletor.className = 'card-mover';
  seletor.title = 'Mover disciplina';
  seletor.innerHTML = [`<option value="rail">A cursar</option>`]
    .concat(S.plano.map((s, i) => `<option value="${i}">${s.ano}/${s.sem}</option>`))
    .join('');
  seletor.value = origem;
  seletor.addEventListener('change', () => mover(d.c, seletor.value));
  node.appendChild(seletor);

  const alternativas = alternativasDe(d.c);
  if (alternativas.length) {
    const via = document.createElement('select');
    via.className = 'card-via';
    via.title = 'Cursar por equivalência (tabela do ICMC)';
    via.innerHTML = [`<option value="">cursar ${d.c} (BCC)</option>`]
      .concat(alternativas.map((r, i) => `<option value="${i}">como ${rotuloRegra(r)} · ${r.texto.slice(0, 48)}</option>`))
      .join('');
    via.value = S.via.has(d.c) ? String(alternativas.indexOf(S.via.get(d.c))) : '';
    via.addEventListener('change', () => {
      if (via.value === '') S.via.delete(d.c);
      else S.via.set(d.c, alternativas[+via.value]);
      desenhar();
    });
    node.appendChild(via);
  }

  node.addEventListener('dragstart', (ev) => {
    ev.dataTransfer.setData('text/plain', d.c);
    ev.dataTransfer.effectAllowed = 'move';
    node.classList.add('arrastando');
  });
  node.addEventListener('dragend', () => node.classList.remove('arrastando'));
  node.addEventListener('mouseenter', () => cadeia(d.c));
  node.addEventListener('focus', () => cadeia(d.c));
  node.addEventListener('mouseleave', cadeiaLimpa);
  node.addEventListener('blur', cadeiaLimpa);
  return node;
}

/* A cadeia: de onde a disciplina vem e o que ela libera. */
function cadeia(codigo) {
  const d = GRADE.get(codigo);
  if (!d) return;
  const app = el('tela-app');
  app.dataset.cadeia = '1';
  const pre = new Set(d.r.flat().map((r) => r.c));
  const pos = new Set(G.disciplinas.filter((x) => x.r.flat().some((r) => r.c === codigo)).map((x) => x.c));

  document.querySelectorAll('.card').forEach((c) => {
    const alvo = c.dataset.c;
    c.classList.toggle('cadeia-foco', alvo === codigo);
    c.classList.toggle('cadeia-pre', pre.has(alvo));
    c.classList.toggle('cadeia-pos', pos.has(alvo));
    c.classList.toggle('cadeia-falta', pre.has(alvo) && !jaTem(alvo));
  });
}

function cadeiaLimpa() {
  el('tela-app').dataset.cadeia = '0';
  document.querySelectorAll('.card').forEach((c) => {
    c.classList.remove('cadeia-foco', 'cadeia-pre', 'cadeia-pos', 'cadeia-falta');
  });
}

/* ------------------------------------------------------------- movimentação */

function mover(codigo, destino) {
  S.plano.forEach((s) => { s.itens = s.itens.filter((c) => c !== codigo); });
  if (destino !== 'rail') {
    const idx = +destino;
    const { bloqueios } = avaliar(codigo, idx);
    if (bloqueios.length) { recusar(codigo, bloqueios[0]); desenhar(); return; }
    S.plano[idx].itens.push(codigo);
  }
  desenhar();
}

let avisoTimer = null;
function recusar(codigo, motivo) {
  document.querySelector('.aviso-flutuante')?.remove();
  const aviso = document.createElement('p');
  aviso.className = 'aviso-flutuante';
  aviso.setAttribute('role', 'status');
  aviso.textContent = `${codigo}: ${motivo}.`;
  document.body.appendChild(aviso);
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => aviso.remove(), 4200);
}

/* -------------------------------------------------------------- desenho (UI) */

function desenhar() {
  marcarEnfases();
  desenharRail();
  desenharBoard();
  desenharPlacar();
}

function visivel(d) {
  if (S.filtroInst && instituto(d.c) !== S.filtroInst) return false;
  if (S.soLiberadas && !liberada(d.c)) return false;
  if (S.filtroTexto) {
    const alvo = `${d.c} ${d.n}`.toLowerCase();
    if (!alvo.includes(S.filtroTexto)) return false;
  }
  return true;
}

function desenharRail() {
  const eletivas = contaEletivas();
  const faltaOb = pendentes('ob');
  el('rail-resumo').textContent =
    `${faltaOb.length} obrigatória${faltaOb.length === 1 ? '' : 's'} fora do plano · ` +
    `${eletivas.falta} créd.-aula eletivos a cobrir`;

  const grupos = [
    ['Obrigatórias', faltaOb],
    ['Optativas eletivas', pendentes('el')],
    ['Optativas livres', pendentes('li')],
  ];

  const alvo = el('listas');
  alvo.innerHTML = '';
  const escolhidas = enfasesEscolhidas();
  if (escolhidas.length) alvo.appendChild(painelOtimizacao(escolhidas));
  escolhidas.forEach((e) => alvo.appendChild(painelEnfase(e)));
  if (S.equivalidas.size) alvo.appendChild(painelEquivalidas());

  const daEnfase = siglasDaEnfase();
  for (const [nome, lista] of grupos) {
    const mostradas = lista.filter(visivel).sort((a, b) => (daEnfase.has(b.c) - daEnfase.has(a.c))
      || (a.p - b.p) || a.c.localeCompare(b.c));
    const bloco = document.createElement('section');
    bloco.className = 'grupo';
    bloco.innerHTML = `
      <header class="grupo-cab">
        <h3 class="grupo-nome">${nome}</h3>
        <span class="grupo-conta">${mostradas.length}/${lista.length}</span>
      </header>`;
    const corpo = document.createElement('div');
    corpo.className = 'grupo-lista';
    if (!mostradas.length) {
      corpo.innerHTML = `<p class="grupo-vazio">${lista.length ? 'Nada com esse filtro.' : 'Tudo coberto.'}</p>`;
    } else {
      mostradas.forEach((d) => corpo.appendChild(cartao(d, 'rail')));
    }
    bloco.appendChild(corpo);
    alvo.appendChild(bloco);
  }
}

/** Chip de ênfase completa ganha um ✓ (histórico) ou ◐ (depende do plano). */
/** Tira todas as ênfases da otimização; o plano fica como está. */
function limparEnfases() {
  S.enfases.clear();
  el('enfases').querySelectorAll('.chip[data-enfase]').forEach((chip) => chip.setAttribute('aria-pressed', 'false'));
  desenhar();
}

function marcarEnfases() {
  const completas = new Map(enfasesCompletas().map((x) => [x.id, x.situacao]));
  el('btn-limpar-enfases').hidden = !S.enfases.size;
  el('enfases').querySelectorAll('.chip[data-enfase]').forEach((chip) => {
    const situacao = completas.get(chip.dataset.enfase);
    chip.dataset.completa = situacao || '';
    chip.title = chip.dataset.nome + (situacao === 'concluida' ? ' · concluída'
      : situacao === 'prevista' ? ' · completa com o plano' : '');
  });
}

const ROTULO_SITUACAO = { feita: 'feita', plano: 'no plano', falta: 'a cursar', fora: 'fora da grade' };

/** Painel de uma ênfase escolhida: itens, situação de cada um e mínimo por grupo. */
function painelEnfase(e) {
  const { grupos, completa, concluida } = progressoEnfase(e);
  const sug = sugestao(enfasesEscolhidas());
  const sugeridas = new Set([...sug.escolhidas, ...sug.extras]);
  const bloco = document.createElement('section');
  bloco.className = 'grupo enfase-painel';
  const contam = grupos.reduce((t, g) => t + Math.min(g.contam, g.minimo), 0);
  const exigidas = grupos.reduce((t, g) => t + g.minimo, 0);
  bloco.innerHTML = `
    <header class="grupo-cab">
      <h3 class="grupo-nome">Ênfase · ${e.nome}</h3>
      <span class="grupo-conta">${contam}/${exigidas}</span>
    </header>
    ${grupos.map((g) => `
      <div class="enfase-grupo">
        <p class="enfase-regra">${g.nome ? `${g.nome}: ` : ''}mínimo de ${g.minimo} disciplinas
          ${g.falta ? `<span class="tag tag-aviso">faltam ${g.falta}</span>` : '<span class="tag tag-ok">ok</span>'}</p>
        <ul class="enfase-itens">
          ${g.itens.map((i) => {
            const sugerida = i.alts.map((a) => a.c).find((c) => sugeridas.has(c) && sug.onde.has(c));
            return `
            <li class="enfase-item" data-estado="${i.estado}">
              <span class="enfase-sigla">${i.alts.map((a) => a.c).join(' / ')}</span>
              <span class="enfase-nome">${GRADE.get(i.c)?.n || i.alts[0].n}</span>
              ${sugerida
                ? `<span class="tag tag-sugestao" title="semestre sugerido">→ ${sug.onde.get(sugerida)}</span>`
                : `<span class="tag tag-${i.estado === 'feita' ? 'ok' : i.estado === 'plano' ? 'enfase' : i.estado === 'fora' ? 'bloqueio' : 'neutra'}">${ROTULO_SITUACAO[i.estado]}</span>`}
            </li>`;
          }).join('')}
        </ul>
      </div>`).join('')}
    <p class="enfase-fim">${completa
      ? `<b>${concluida ? 'Ênfase concluída' : 'Ênfase completa com o plano'}</b>${concluida ? ' pelo histórico.' : ': depende das disciplinas planejadas.'}`
      : 'Disciplinas fora da grade não são oferecidas para este currículo.'}</p>`;
  return bloco;
}

/** Resultado da otimização para as ênfases escolhidas, com aplicar e desfazer. */
function painelOtimizacao(enfases) {
  const sug = sugestao(enfases);
  const marcas = siglasDaEnfase();
  const novas = sug.obrigatorias.length + sug.escolhidas.length + sug.extras.length - sug.naoCoube.length;
  const linha = (c, extra) => `
    <li class="enfase-item">
      <span class="enfase-sigla">${c}</span>
      <span class="enfase-nome">${GRADE.get(c).n}<small>${sug.vias.has(c) ? `como ${rotuloRegra(sug.vias.get(c))} · ` : ''}${extra}</small></span>
      ${sug.onde.has(c) ? `<span class="tag tag-sugestao">→ ${sug.onde.get(c)}</span>` : '<span class="tag tag-bloqueio">não coube</span>'}
    </li>`;

  const bloco = document.createElement('section');
  bloco.className = 'grupo enfase-painel otimo';
  bloco.innerHTML = `
    <header class="grupo-cab">
      <h3 class="grupo-nome">Melhor caminho · ${enfases.length} ênfase${enfases.length === 1 ? '' : 's'}</h3>
      <span class="grupo-conta">${somaCa(sug.escolhidas, new Map([...S.via, ...sug.vias]))} créd.</span>
    </header>
    <p class="enfase-resumo">${!sug.possivel
      ? '<span class="placar-erro">Não dá para fechar essas ênfases com as disciplinas da grade.</span>'
      : sug.escolhidas.length
        ? `${sug.escolhidas.length} disciplina(s), <b>${somaCa(sug.escolhidas, new Map([...S.via, ...sug.vias]))} créditos-aula</b>, fecham
          ${enfases.length === 1 ? 'a ênfase' : 'todas as ênfases'}: ${sug.completa ? 'o menor total possível' : `o menor que a busca achou em ${S.tempoBusca} ms (aumente o tempo de busca nas Configurações)`},
          contando o que você já cursou e o que já está no plano.`
        : `<b>Nada a acrescentar:</b> histórico e plano já fecham ${enfases.length === 1 ? 'a ênfase' : 'as ênfases'}.`}</p>
    ${sug.escolhidas.length ? `<ul class="enfase-itens">${sug.escolhidas.map((c) => linha(c,
      marcas.has(c) ? marcas.get(c).join(' · ') : 'requisito de outra escolhida')).join('')}</ul>` : ''}
    ${sug.extras.length ? `
      <p class="enfase-regra">Eletivas para fechar ${G.creditosEletivosExigidos} créditos</p>
      <ul class="enfase-itens">${sug.extras.map((c) => linha(c, marcas.has(c) ? marcas.get(c).join(' · ') : 'eletiva')).join('')}</ul>` : ''}
    ${sug.vias.size ? `<p class="enfase-resumo">Por equivalência: ${[...sug.vias]
      .map(([c, r]) => `<b>${c}</b> como ${rotuloRegra(r)}${sug.onde.has(c) ? ` (${sug.onde.get(c)})` : ''}`).join(', ')}.</p>` : ''}
    <div class="enfase-sugestao">
      <p class="enfase-resumo">${novas
        ? `Com ${sug.obrigatorias.length} obrigatória(s) pendente(s): ${sug.semestres} semestres,
          no máximo <b>${sug.maiorCarga} créd.-aula</b> por semestre, carga equilibrada entre eles.`
        : 'O plano já cobre o que dá para encaixar.'}
        ${sug.naoCoube.length ? `<span class="placar-erro">Não coube: ${sug.naoCoube.join(', ')}.</span>` : ''}</p>
      <div class="enfase-botoes"></div>
    </div>`;

  const botoes = bloco.querySelector('.enfase-botoes');
  if (novas) {
    const aplicar = document.createElement('button');
    aplicar.type = 'button';
    aplicar.className = 'btn btn-primario btn-pequeno';
    aplicar.textContent = 'Aplicar ao plano';
    aplicar.addEventListener('click', () => aplicarSugestao(enfases));
    botoes.appendChild(aplicar);
  }
  const limpar = document.createElement('button');
  limpar.type = 'button';
  limpar.className = 'btn btn-fantasma btn-pequeno';
  limpar.textContent = 'Limpar ênfases';
  limpar.addEventListener('click', limparEnfases);
  botoes.appendChild(limpar);
  if (S.planoAntes) {
    const desfazer = document.createElement('button');
    desfazer.type = 'button';
    desfazer.className = 'btn btn-fantasma btn-pequeno';
    desfazer.textContent = 'Desfazer';
    desfazer.addEventListener('click', desfazerSugestao);
    botoes.appendChild(desfazer);
  }
  return bloco;
}

/** Disciplinas da grade que o histórico cobre por equivalência. */
function painelEquivalidas() {
  const bloco = document.createElement('section');
  bloco.className = 'grupo';
  const itens = [...S.equivalidas].sort((a, b) => a[0].localeCompare(b[0]));
  bloco.innerHTML = `
    <header class="grupo-cab">
      <h3 class="grupo-nome">Cobertas por equivalência</h3>
      <span class="grupo-conta">${itens.length}</span>
    </header>
    <ul class="equiv-lista">
      ${itens.map(([c, { regra, andamento }]) => `
        <li class="equiv-item" title="${regra.texto}">
          <span class="equiv-sigla">${c}</span>
          <span class="equiv-nome">${GRADE.get(c)?.n || ''}<small>← ${rotuloRegra(regra)}</small></span>
          <span class="tag ${andamento ? 'tag-aviso' : 'tag-equiv'}">${andamento ? 'em andamento' : 'equivalência'}</span>
        </li>`).join('')}
    </ul>
    <p class="equiv-nota">Pela tabela de equivalências do ICMC. Peça o aproveitamento no Serviço de Graduação.</p>`;
  return bloco;
}

function desenharBoard() {
  const board = el('board');
  board.innerHTML = '';

  S.plano.forEach((s, idx) => {
    const ca = creditosDoSemestre(s);
    const ct = s.itens.reduce((t, c) => t + (GRADE.get(c)?.ct || 0), 0);
    const ch = s.itens.reduce((t, c) => t + (GRADE.get(c)?.ch || 0), 0);
    const puxado = pesado(s);
    const abaixo = leve(s, idx);

    const coluna = document.createElement('section');
    coluna.className = `coluna${puxado ? ' coluna-puxada' : ''}${abaixo ? ' coluna-leve' : ''}`;
    const selo = puxado ? '<span class="tag tag-aviso">puxado</span>'
      : abaixo ? '<span class="tag tag-bloqueio">abaixo do mínimo</span>' : '';
    coluna.innerHTML = `
      <header class="coluna-cab">
        <h3 class="coluna-nome">${s.ano} · ${s.sem}º semestre ${selo}</h3>
        <span class="coluna-cred">${ca} créd.-aula · ${ct} trab. · ${ch} h</span>
        ${puxado ? `<p class="coluna-aviso" role="status">${avisoPesado(s)}</p>` : ''}
        ${abaixo ? `<p class="coluna-aviso coluna-aviso-erro" role="status">${avisoLeve(s)}</p>` : ''}
      </header>`;

    if (S.plano.length > 1) {
      const fechar = document.createElement('button');
      fechar.className = 'coluna-x';
      fechar.type = 'button';
      fechar.title = 'Remover semestre';
      fechar.setAttribute('aria-label', `Remover ${s.ano}/${s.sem}`);
      fechar.textContent = '×';
      fechar.addEventListener('click', () => {
        S.plano.splice(idx, 1);
        desenhar();
      });
      coluna.querySelector('.coluna-cab').appendChild(fechar);
    }

    const lista = document.createElement('div');
    lista.className = 'coluna-lista';
    if (!s.itens.length) {
      lista.innerHTML = '<p class="coluna-vazia">Arraste disciplinas para cá</p>';
    } else {
      s.itens.forEach((c) => {
        const d = GRADE.get(c);
        if (d) lista.appendChild(cartao(d, String(idx)));
      });
    }

    const permite = (ev) => {
      const codigo = ev.dataTransfer.getData('text/plain')
        || document.querySelector('.card.arrastando')?.dataset.c;
      return codigo ? avaliar(codigo, idx).bloqueios.length === 0 : false;
    };
    coluna.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      const ok = permite(ev);
      ev.dataTransfer.dropEffect = ok ? 'move' : 'none';
      coluna.classList.toggle('alvo', ok);
      coluna.classList.toggle('recusa', !ok);
    });
    coluna.addEventListener('dragleave', () => coluna.classList.remove('alvo', 'recusa'));
    coluna.addEventListener('drop', (ev) => {
      ev.preventDefault();
      coluna.classList.remove('alvo', 'recusa');
      const codigo = ev.dataTransfer.getData('text/plain');
      if (codigo) mover(codigo, String(idx));
    });

    coluna.appendChild(lista);
    board.appendChild(coluna);
  });

  const mais = document.createElement('button');
  mais.className = 'coluna coluna-mais';
  mais.type = 'button';
  mais.innerHTML = '<span>+</span> Planejar mais um semestre';
  mais.addEventListener('click', () => {
    adicionarSemestre();
    board.scrollLeft = board.scrollWidth;
  });
  board.appendChild(mais);

  if (S.plano.length > 1) {
    const ultimo = S.plano[S.plano.length - 1];
    const menos = document.createElement('button');
    menos.className = 'coluna coluna-mais coluna-menos';
    menos.type = 'button';
    menos.innerHTML = `<span>−</span> Remover ${ultimo.ano}/${ultimo.sem}`;
    menos.title = 'As disciplinas dele voltam para a lista';
    menos.addEventListener('click', () => {
      S.plano.pop();
      desenhar();
    });
    board.appendChild(menos);
  }
}

function adicionarSemestre() {
  const ultimo = S.plano[S.plano.length - 1]
    || { ano: new Date().getFullYear(), sem: new Date().getMonth() < 6 ? 1 : 2 };
  const prox = ultimo.sem === 1 ? { ano: ultimo.ano, sem: 2 } : { ano: ultimo.ano + 1, sem: 1 };
  S.plano.push({ ...prox, itens: [] });
  desenhar();
}

function medidor({ nome, valor, atual, alvo, nota, ok, estado }) {
  const pct = Math.min(100, Math.round((atual / Math.max(alvo, 1)) * 100));
  return `
    <div class="medidor" data-estado="${estado || (ok ? 'ok' : 'falta')}">
      <div class="medidor-cab"><span class="medidor-nome">${nome}</span><span class="medidor-valor">${valor}</span></div>
      <div class="medidor-barra"><i style="width:${pct}%"></i></div>
      ${nota ? `<p class="medidor-nota">${nota}</p>` : ''}
    </div>`;
}

function diagnostico() {
  const faltaOb = pendentes('ob');
  const eletivas = contaEletivas();
  const h = S.hist;
  const obTotal = G.disciplinas.filter((d) => tipoDe(d) === 'ob').length;
  const cobertas = obTotal - faltaOb.length;
  const sobrecarga = S.plano.filter(pesado);
  const abaixoMinimo = S.plano.filter((s, i) => leve(s, i));
  const pendenciasPdf = [];
  if (faltaOb.length) pendenciasPdf.push(`${faltaOb.length} disciplina(s) obrigatória(s) fora do plano`);
  if (eletivas.falta) pendenciasPdf.push(`${eletivas.falta} crédito(s)-aula de optativas eletivas`);
  if (h.aac < h.aacExigido) pendenciasPdf.push(`${h.aacExigido - h.aac} h de Atividades Acadêmicas Complementares`);
  if (h.ext < G.extensaoHorasExigidas) pendenciasPdf.push(`${G.extensaoHorasExigidas - h.ext} h de atividades de extensão`);
  abaixoMinimo.forEach((s) => pendenciasPdf.push(
    `${s.ano}/${s.sem} com ${creditosDoSemestre(s)} créditos-aula, abaixo do mínimo de ${MINIMO_CREDITOS}`,
  ));

  return {
    faltaOb, eletivas, obTotal, cobertas, sobrecarga, abaixoMinimo, pendenciasPdf,
    enfases: enfasesCompletas(),
    pronto: !faltaOb.length && !eletivas.falta && !abaixoMinimo.length,
  };
}

function desenharPlacar() {
  const d = diagnostico();
  const h = S.hist;

  el('medidores').innerHTML = [
    medidor({
      nome: 'Obrigatórias', valor: `${d.cobertas}/${d.obTotal}`, atual: d.cobertas, alvo: d.obTotal,
      ok: !d.faltaOb.length, nota: 'concluídas, em andamento ou já no plano',
    }),
    medidor({
      nome: 'Optativas eletivas', valor: `${d.eletivas.total}/${d.eletivas.exigido} créd.-aula`,
      atual: d.eletivas.total, alvo: d.eletivas.exigido, ok: !d.eletivas.falta,
      nota: `${d.eletivas.el} eletivos + ${d.eletivas.aproveitado} de ${d.eletivas.li} livres aproveitados`
        + (d.eletivas.porEquivalencia ? ` · ${d.eletivas.porEquivalencia} por equivalência, sujeitos a aprovação` : '')
        + (d.eletivas.fora.length ? ` · ${d.eletivas.fora.join(', ')} fora da grade, não contabilizada(s)` : ''),
    }),
    medidor({
      nome: 'AAC', valor: `${h.aac}/${h.aacExigido} h`, atual: h.aac, alvo: h.aacExigido,
      ok: h.aac >= h.aacExigido, nota: 'lido do histórico',
    }),
    medidor({
      nome: 'Extensão', valor: `${h.ext}/${G.extensaoHorasExigidas} h`, atual: h.ext,
      alvo: G.extensaoHorasExigidas, ok: h.ext >= G.extensaoHorasExigidas, nota: 'lido do histórico',
    }),
    medidor({
      nome: 'Ênfases', valor: `${d.enfases.length} completa${d.enfases.length === 1 ? '' : 's'}`,
      atual: d.enfases.length, alvo: 1, estado: d.enfases.length ? 'ok' : 'neutro',
      nota: d.enfases.length
        ? d.enfases.map((x) => `${x.nome}${x.situacao === 'prevista' ? ' (com o plano)' : ''}`).join(' · ')
        : 'opcional · escolha uma em "Ênfase"',
    }),
  ].join('');

  const estado = el('placar-estado');
  const partes = [];
  if (d.faltaOb.length) partes.push(`${d.faltaOb.length} obrigatória(s)`);
  if (d.eletivas.falta) partes.push(`${d.eletivas.falta} créd.-aula eletivo(s)`);

  if (d.pronto) {
    estado.className = 'placar-estado pronto';
    estado.innerHTML = `<b>Plano fecha o curso.</b> ${d.pendenciasPdf.length ? 'Pendências de AAC/extensão vão listadas no PDF.' : ''}`;
  } else if (partes.length) {
    estado.className = 'placar-estado';
    estado.innerHTML = `Falta encaixar <b>${partes.join(' e ')}</b>.`;
  } else {
    estado.className = 'placar-estado';
    estado.innerHTML = '<b>Disciplinas cobertas.</b> Ajuste a carga dos semestres para liberar o PDF.';
  }

  if (d.abaixoMinimo.length) {
    const quais = d.abaixoMinimo.map((s) => `${s.ano}/${s.sem}`).join(', ');
    estado.innerHTML += ` <span class="placar-erro">${quais} ${d.abaixoMinimo.length === 1 ? 'fica' : 'ficam'}`
      + ` abaixo de ${MINIMO_CREDITOS} créditos-aula: só os ${SEMESTRES_LIVRES} últimos semestres podem.</span>`;
  }
  if (d.sobrecarga.length) {
    const quais = d.sobrecarga.map((s) => `${s.ano}/${s.sem}`).join(', ');
    estado.innerHTML += ` <span class="placar-puxado">${quais} ${d.sobrecarga.length === 1 ? 'passa' : 'passam'}`
      + ` de ${limiteCreditos()} créditos-aula: semestre${d.sobrecarga.length === 1 ? '' : 's'} mais puxado${d.sobrecarga.length === 1 ? '' : 's'}.</span>`;
  }

  el('btn-pdf').hidden = !d.pronto;
}

/* --------------------------------------------------------------- entrada */

async function receber(arquivo) {
  if (!arquivo) return;
  const erro = el('zona-erro');
  erro.hidden = true;
  el('carregando').hidden = false;
  try {
    const h = await lerHistorico(arquivo, G);
    if (!h.registros.size) throw new Error('Nenhuma disciplina reconhecida. Use o Histórico Escolar completo do Júpiter, em PDF.');
    montarEstado(h);
    el('marca-curso').textContent = `${h.aluno || 'Plano de curso'} · ${h.curso || G.curso}`;
    el('tela-entrada').hidden = true;
    el('tela-app').hidden = false;
    el('btn-recomecar').hidden = false;
    el('btn-limpar-plano').hidden = false;
    desenhar();
  } catch (e) {
    erro.textContent = e.message || 'Não foi possível ler o PDF.';
    erro.hidden = false;
  } finally {
    el('carregando').hidden = true;
  }
}

function ligarEntrada() {
  const zona = el('zona');
  const campo = el('arquivo');
  el('btn-escolher').addEventListener('click', () => campo.click());
  zona.addEventListener('click', (ev) => { if (!ev.target.closest('button')) campo.click(); });
  campo.addEventListener('change', () => receber(campo.files[0]));
  ['dragenter', 'dragover'].forEach((e) => zona.addEventListener(e, (ev) => {
    ev.preventDefault(); zona.classList.add('ativa');
  }));
  ['dragleave', 'drop'].forEach((e) => zona.addEventListener(e, () => zona.classList.remove('ativa')));
  zona.addEventListener('drop', (ev) => {
    ev.preventDefault();
    receber([...ev.dataTransfer.files].find((f) => f.type === 'application/pdf'));
  });
}

function ligarControles() {
  el('busca').addEventListener('input', (ev) => {
    S.filtroTexto = ev.target.value.trim().toLowerCase();
    desenharRail();
  });

  const filtros = el('filtros');
  const chips = [{ id: 'LIB', rotulo: 'liberadas' }, ...INSTITUTOS.map((i) => ({ id: i.id, rotulo: i.rotulo }))];
  chips.forEach(({ id, rotulo }) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = rotulo;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      const ligado = chip.getAttribute('aria-pressed') === 'true';
      if (id === 'LIB') {
        S.soLiberadas = !ligado;
        chip.setAttribute('aria-pressed', String(!ligado));
      } else {
        filtros.querySelectorAll('.chip').forEach((c) => {
          if (c !== chip && c.textContent !== 'liberadas') c.setAttribute('aria-pressed', 'false');
        });
        S.filtroInst = ligado ? null : id;
        chip.setAttribute('aria-pressed', String(!ligado));
      }
      desenharRail();
    });
    filtros.appendChild(chip);
  });

  const enfases = el('enfases');
  ENFASES.forEach((e) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = ENFASE_CURTA[e.id] || e.nome;
    chip.title = e.nome;
    chip.dataset.enfase = e.id;
    chip.dataset.nome = e.nome;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      if (S.enfases.has(e.id)) S.enfases.delete(e.id); else S.enfases.add(e.id);
      chip.setAttribute('aria-pressed', String(S.enfases.has(e.id)));
      desenhar();
      el('listas').scrollTop = 0;
    });
    enfases.appendChild(chip);
  });
  const limpar = document.createElement('button');
  limpar.className = 'chip chip-limpar';
  limpar.type = 'button';
  limpar.id = 'btn-limpar-enfases';
  limpar.textContent = '× Limpar';
  limpar.title = 'Tira todas as ênfases da otimização';
  limpar.hidden = true;
  limpar.addEventListener('click', limparEnfases);
  enfases.appendChild(limpar);

  el('btn-config').addEventListener('click', () => el('config').showModal());
  const ajustar = (id, campo, ler) => el(id).addEventListener('change', (ev) => {
    S[campo] = ler(ev.target);
    if (S.hist) desenhar();
  });
  ajustar('cfg-limite', 'limiteCreditos', (i) => {
    i.value = Math.min(99, Math.max(1, Math.round(Number(i.value)) || 20));
    return Number(i.value);
  });
  ajustar('cfg-passar', 'passarLimite', (i) => i.checked);
  ajustar('cfg-paridade', 'paridade', (i) => i.checked);
  ajustar('cfg-equiv', 'usarEquivalencias', (i) => i.checked);
  ajustar('cfg-tempo', 'tempoBusca', (i) => {
    i.value = Math.min(60000, Math.max(50, Math.round(Number(i.value)) || 250));
    return Number(i.value);
  });
  el('btn-recomecar').addEventListener('click', () => location.reload());
  el('btn-limpar-plano').addEventListener('click', () => {
    if (!S.plano.some((s) => s.itens.length) || !confirm('Tirar todas as disciplinas do plano?')) return;
    S.plano.forEach((s) => { s.itens = []; });
    desenhar();
  });

  // soltar um cartão do plano na lista tira ele do plano
  const rail = document.querySelector('.rail');
  const doPlano = (ev) => {
    const codigo = ev.dataTransfer.getData('text/plain') || document.querySelector('.card.arrastando')?.dataset.c;
    return codigo && colunaDe(codigo) >= 0 ? codigo : null;
  };
  rail.addEventListener('dragover', (ev) => {
    if (!doPlano(ev)) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    rail.classList.add('alvo');
  });
  rail.addEventListener('dragleave', (ev) => { if (!rail.contains(ev.relatedTarget)) rail.classList.remove('alvo'); });
  rail.addEventListener('drop', (ev) => {
    rail.classList.remove('alvo');
    const codigo = doPlano(ev);
    if (!codigo) return;
    ev.preventDefault();
    mover(codigo, 'rail');
  });
}

ligarEntrada();
ligarControles();

/* assets/pdf.js consome este estado para gerar o plano em PDF. */
export { perfil, calcularEquivalidas, diagnostico, S, GRADE, G, limiteCreditos, creditosDoSemestre, rotuloRegra };
