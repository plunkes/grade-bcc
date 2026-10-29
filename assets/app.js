/* contínuo — planejador de curso BCC/ICMC.
   Roda inteiro no navegador: o histórico nunca sai da máquina e nada é salvo
   (sem localStorage, sem rede). Recarregar a página apaga tudo. */

import { lerHistorico, CONCLUIDO, CURSANDO } from './historico.js';

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

const LIMITE_CREDITOS = 20; // acima disso o semestre é marcado como puxado
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
const creditosDoSemestre = (s) => s.itens.reduce((t, c) => t + (GRADE.get(c)?.ca || 0), 0);

/** Semestre puxado: passa do limite de créditos-aula. */
export const pesado = (s) => creditosDoSemestre(s) > LIMITE_CREDITOS;

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
  aproveitarLivres: true,
  enfase: null,     // id da ênfase escolhida
  planoAntes: null, // cópia do plano antes de aplicar a sugestão (desfazer)
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

/** Disciplina já resolvida pelo histórico (concluída ou em andamento). */
const jaTem = (c) => S.concluidas.has(c) || S.cursando.has(c);

const planejadas = () => new Set(S.plano.flatMap((s) => s.itens));

function colunaDe(codigo) {
  return S.plano.findIndex((s) => s.itens.includes(codigo));
}

function pendentes(tipo) {
  const dentro = planejadas();
  return G.disciplinas.filter((d) => d.t === tipo && !jaTem(d.c) && !dentro.has(d.c));
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
  for (const c of [...S.cursando, ...planejadas()]) {
    const d = GRADE.get(c);
    if (!d) { if (S.cursando.has(c)) fora.push(c); continue; }
    if (d.t === 'el') el += d.ca;
    else if (d.t === 'li') li += d.ca;
  }
  const aproveitado = S.aproveitarLivres ? Math.min(li, G.creditosLivresAproveitaveis) : 0;
  const total = el + aproveitado;
  return {
    el, li, aproveitado, total, fora,
    exigido: G.creditosEletivosExigidos,
    falta: Math.max(0, G.creditosEletivosExigidos - total),
  };
}

/* ---------------------------------------------------------------- ênfases */

const enfaseAtual = () => ENFASES.find((e) => e.id === S.enfase) || null;

/** Siglas da ênfase escolhida (todas as alternativas). */
function siglasDaEnfase() {
  const e = enfaseAtual();
  return new Set(e ? e.grupos.flatMap((g) => g.itens.flat().map((a) => a.c)) : []);
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

const paridadeOk = (d, coluna) => !d.p || (d.p % 2 === 1 ? coluna.sem === 1 : coluna.sem === 2);

/**
 * Avalia colocar `codigo` na coluna `idx`.
 * Requisito forte bloqueia; fraco e indicação de conjunto apenas avisam.
 */
function avaliar(codigo, idx) {
  const d = GRADE.get(codigo);
  const bloqueios = [];
  const avisos = [];
  if (!d) return { bloqueios, avisos };

  const antes = new Set();   // resolvido antes da coluna idx
  const junto = new Set();   // resolvido na própria coluna
  S.concluidas.forEach((c) => antes.add(c));
  S.cursando.forEach((c) => antes.add(c));
  S.plano.forEach((s, i) => {
    if (i < idx) s.itens.forEach((c) => antes.add(c));
    else if (i === idx) s.itens.forEach((c) => junto.add(c));
  });

  for (const grupo of d.r) {
    const tipo = grupo[0].k;
    const nomes = grupo.map((r) => r.c).join(' ou ');

    if (tipo === 'forte') {
      if (grupo.some((r) => antes.has(r.c))) continue;
      bloqueios.push(`exige ${nomes} concluída antes`);
      continue;
    }

    if (tipo === 'fraca') {
      // cumprida ou planejada antes libera; senão vale a nota >= 3,0
      if (grupo.some((r) => antes.has(r.c) || notaDe(r.c) >= NOTA_REQUISITO_FRACO)) continue;
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
  if (coluna && !paridadeOk(d, coluna)) {
    const certo = d.p % 2 === 1 ? '1º' : '2º';
    if (S.paridade) bloqueios.push(`costuma ser oferecida no ${certo} semestre; desligue o filtro para planejar assim`);
    else avisos.push(`oferta usual no ${certo} semestre`);
  }
  return { bloqueios, avisos };
}

/** Sem requisito pendente considerando só o histórico (forte e fraco). */
function liberada(codigo) {
  const d = GRADE.get(codigo);
  if (!d) return true;
  return d.r.every((g) => {
    if (g[0].k === 'forte') return g.some((r) => jaTem(r.c));
    if (g[0].k === 'fraca') return g.some((r) => fracoOk(r.c));
    return true;
  });
}

/* --------------------------------------------------------------- sugestão */

const SEMESTRES_EXTRAS = 8; // quantos semestres a sugestão pode criar além do plano

const copiaPlano = (plano) => plano.map((s) => ({ ...s, itens: [...s.itens] }));

/** Requisitos fortes e fracos que o histórico ou as obrigatórias ainda vão cobrir. */
function alcancavel(codigo) {
  const d = GRADE.get(codigo);
  if (!d) return false;
  const vira = (r) => jaTem(r.c) || GRADE.get(r.c)?.t === 'ob';
  return d.r.every((g) => {
    if (g[0].k === 'forte') return g.some(vira);
    if (g[0].k === 'fraca') return g.some((r) => vira(r) || fracoOk(r.c));
    return true;
  });
}

const porPeriodo = (a, b) => (GRADE.get(a).p - GRADE.get(b).p) || a.localeCompare(b);

/** O que a sugestão quer encaixar: obrigatórias, mínimo da ênfase e eletivas. */
function escolherParaEnfase(e) {
  const obrigatorias = pendentes('ob').map((d) => d.c);
  const daEnfase = [];
  const reserva = [];
  for (const g of progressoEnfase(e).grupos) {
    const livres = g.itens
      .filter((i) => i.estado === 'falta')
      .map((i) => i.alts.map((a) => a.c).find((c) => GRADE.has(c) && alcancavel(c)))
      .filter(Boolean)
      .sort(porPeriodo);
    daEnfase.push(...livres.slice(0, g.falta));
    reserva.push(...livres.slice(g.falta));
  }

  // eletivas que ainda faltam: primeiro o resto da ênfase, depois o que estiver ao alcance
  let falta = contaEletivas().falta
    - daEnfase.reduce((t, c) => t + (GRADE.get(c).t === 'el' ? GRADE.get(c).ca : 0), 0);
  const extras = [];
  const usadas = new Set(daEnfase);
  const outras = pendentes('el').map((d) => d.c).filter((c) => !ESTAGIO.has(c) && alcancavel(c)).sort(porPeriodo);
  for (const c of [...reserva, ...outras]) {
    if (falta <= 0) break;
    if (usadas.has(c) || GRADE.get(c).t !== 'el') continue;
    usadas.add(c);
    extras.push(c);
    falta -= GRADE.get(c).ca;
  }
  return { obrigatorias, daEnfase: [...new Set(daEnfase)], extras };
}

/**
 * Encaixa `siglas` no plano, do primeiro semestre ao último, sem passar do
 * limite de créditos e só onde avaliar() não bloqueia. Cria semestres se faltar.
 * Muda S.plano; devolve o que não coube.
 */
function encaixar(siglas) {
  const resto = [...siglas].sort(porPeriodo);
  let criados = 0;
  for (let idx = 0; resto.length; idx++) {
    if (idx >= S.plano.length) {
      if (criados === SEMESTRES_EXTRAS) break;
      const u = S.plano[S.plano.length - 1];
      S.plano.push({ ...(u.sem === 1 ? { ano: u.ano, sem: 2 } : { ano: u.ano + 1, sem: 1 }), itens: [] });
      criados++;
    }
    const s = S.plano[idx];
    for (let mudou = true; mudou;) {
      mudou = false;
      for (const c of [...resto]) {
        if (creditosDoSemestre(s) + GRADE.get(c).ca > LIMITE_CREDITOS) continue;
        if (avaliar(c, idx).bloqueios.length) continue;
        s.itens.push(c);
        resto.splice(resto.indexOf(c), 1);
        mudou = true;
      }
    }
  }
  // semestres criados que ficaram vazios saem
  while (criados-- > 0 && S.plano.length > 1 && !S.plano[S.plano.length - 1].itens.length) S.plano.pop();
  return resto;
}

/** Simula a sugestão sem mexer no plano: semestre sugerido de cada sigla. */
function sugestao(e) {
  const escolha = escolherParaEnfase(e);
  const antes = copiaPlano(S.plano);
  const dentro = planejadas();
  const naoCoube = encaixar([...escolha.obrigatorias, ...escolha.daEnfase, ...escolha.extras]);
  const onde = new Map();
  S.plano.forEach((s) => s.itens.forEach((c) => { if (!dentro.has(c)) onde.set(c, `${s.ano}/${s.sem}`); }));
  const semestres = S.plano.length;
  S.plano = antes;
  return { ...escolha, onde, naoCoube, semestres };
}

function aplicarSugestao(e) {
  S.planoAntes = copiaPlano(S.plano);
  const { obrigatorias, daEnfase, extras } = escolherParaEnfase(e);
  const naoCoube = encaixar([...obrigatorias, ...daEnfase, ...extras]);
  desenhar();
  if (naoCoube.length) recusar(naoCoube.join(', '), 'não couberam na sugestão; encaixe à mão');
}

function desfazerSugestao() {
  if (!S.planoAntes) return;
  S.plano = S.planoAntes;
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
  if (siglasDaEnfase().has(d.c)) tags.push(['enfase', ENFASE_CURTA[S.enfase] || 'ênfase']);
  bloqueios.forEach((b) => tags.push(['bloqueio', b]));
  avisos.forEach((a) => tags.push(['aviso', a]));

  node.innerHTML = `
    <span class="card-sigla">${d.c}</span>
    <span class="card-cred">${d.ca}+${d.ct} · ${d.ch}h</span>
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
  const e = enfaseAtual();
  if (e) alvo.appendChild(painelEnfase(e));

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
function marcarEnfases() {
  const completas = new Map(enfasesCompletas().map((x) => [x.id, x.situacao]));
  el('enfases').querySelectorAll('.chip').forEach((chip) => {
    const situacao = completas.get(chip.dataset.enfase);
    chip.dataset.completa = situacao || '';
    chip.title = chip.dataset.nome + (situacao === 'concluida' ? ' · concluída'
      : situacao === 'prevista' ? ' · completa com o plano' : '');
  });
}

const ROTULO_SITUACAO = { feita: 'feita', plano: 'no plano', falta: 'a cursar', fora: 'fora da grade' };

/** Painel da ênfase escolhida: itens, situação de cada um e mínimo por grupo. */
function painelEnfase(e) {
  const { grupos, completa } = progressoEnfase(e);
  const sug = sugestao(e);
  const novas = sug.obrigatorias.length + sug.daEnfase.length + sug.extras.length - sug.naoCoube.length;
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
          ${g.itens.map((i) => `
            <li class="enfase-item" data-estado="${i.estado}">
              <span class="enfase-sigla">${i.alts.map((a) => a.c).join(' / ')}</span>
              <span class="enfase-nome">${GRADE.get(i.c)?.n || i.alts[0].n}</span>
              ${sug.onde.has(i.c) && sug.daEnfase.concat(sug.extras).includes(i.c)
                ? `<span class="tag tag-sugestao" title="semestre sugerido">→ ${sug.onde.get(i.c)}</span>`
                : `<span class="tag tag-${i.estado === 'feita' ? 'ok' : i.estado === 'plano' ? 'enfase' : i.estado === 'fora' ? 'bloqueio' : 'neutra'}">${ROTULO_SITUACAO[i.estado]}</span>`}
            </li>`).join('')}
        </ul>
      </div>`).join('')}
    <p class="enfase-fim">${completa ? `<b>${progressoEnfase(e).concluida ? 'Ênfase concluída' : 'Ênfase completa com o plano'}</b>${progressoEnfase(e).concluida ? ' pelo histórico.' : ': depende das disciplinas planejadas.'}` : 'Disciplinas fora da grade não são oferecidas para este currículo.'}</p>
    <div class="enfase-sugestao">
      <p class="enfase-resumo">${novas
        ? `Sugestão: ${[
          sug.obrigatorias.length && `${sug.obrigatorias.length} obrigatória(s)`,
          sug.daEnfase.length && `${sug.daEnfase.length} da ênfase`,
          sug.extras.length && `${sug.extras.length} eletiva(s) para fechar créditos`,
        ].filter(Boolean).join(' + ')} em ${sug.semestres} semestres, até ${LIMITE_CREDITOS} créd.-aula cada.`
        : 'Nada a sugerir: o plano já cobre o que dá para encaixar.'}
        ${sug.naoCoube.length ? `<span class="placar-erro">Não coube: ${sug.naoCoube.join(', ')}.</span>` : ''}</p>
      <div class="enfase-botoes"></div>
    </div>`;

  const botoes = bloco.querySelector('.enfase-botoes');
  if (novas) {
    const aplicar = document.createElement('button');
    aplicar.type = 'button';
    aplicar.className = 'btn btn-primario btn-pequeno';
    aplicar.textContent = 'Aplicar sugestão ao plano';
    aplicar.addEventListener('click', () => aplicarSugestao(e));
    botoes.appendChild(aplicar);
  }
  if (S.planoAntes) {
    const desfazer = document.createElement('button');
    desfazer.type = 'button';
    desfazer.className = 'btn btn-fantasma btn-pequeno';
    desfazer.textContent = 'Desfazer sugestão';
    desfazer.addEventListener('click', desfazerSugestao);
    botoes.appendChild(desfazer);
  }
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
  const obTotal = G.disciplinas.filter((d) => d.t === 'ob').length;
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
      + ` de ${LIMITE_CREDITOS} créditos-aula: semestre${d.sobrecarga.length === 1 ? '' : 's'} mais puxado${d.sobrecarga.length === 1 ? '' : 's'}.</span>`;
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
    el('box-paridade').hidden = false;
    el('btn-recomecar').hidden = false;
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
      S.enfase = S.enfase === e.id ? null : e.id;
      enfases.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip && !!S.enfase)));
      desenhar();
      el('listas').scrollTop = 0;
    });
    enfases.appendChild(chip);
  });

  el('chk-paridade').addEventListener('change', (ev) => {
    S.paridade = ev.target.checked;
    desenhar();
  });
  el('btn-recomecar').addEventListener('click', () => location.reload());
}

ligarEntrada();
ligarControles();

/* assets/pdf.js consome este estado para gerar o plano em PDF. */
export { diagnostico, S, GRADE, G, LIMITE_CREDITOS, creditosDoSemestre };
