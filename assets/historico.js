/* Leitura do histórico escolar do Júpiter (USP) em PDF, no navegador.
   Puro: recebe um File, devolve dados. Nenhum byte sai da máquina. */

import * as pdfjs from '../vendor/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

export const CONCLUIDO = new Set(['A', 'DI', 'DS', 'AE']);
export const CURSANDO = new Set(['MA', 'I', 'IR', 'IT', 'IP', 'IL']);

const STATUS = /\b(A|MA|RN|RA|RF|T|DI|DS|AE|I|IR|IT|IP|P|IL)$/;
const SIGLA = /^([A-Z]{3}\d{4}|\d{7})\b/;

/* --------------------------------------------- leitura do histórico (PDF) */

export async function lerHistorico(arquivo, padroes) {
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: dados }).promise;
  const linhas = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const conteudo = await pagina.getTextContent();
    const porLinha = new Map();

    for (const item of conteudo.items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      let chave = y;
      for (const k of porLinha.keys()) {
        if (Math.abs(k - y) <= 2) { chave = k; break; }
      }
      if (!porLinha.has(chave)) porLinha.set(chave, []);
      porLinha.get(chave).push(item);
    }

    [...porLinha.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, itens]) => {
        itens.sort((a, b) => a.transform[4] - b.transform[4]);
        const texto = itens.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
        if (texto) linhas.push(texto);
      });
  }
  return interpretar(linhas, padroes);
}

/** Converte as linhas do histórico em dados estruturados. */
export function interpretar(linhas, padroes = { aacHorasExigidas: 30 }) {
  const h = {
    aluno: '', numero: '', curso: '',
    semestres: [], registros: new Map(), dispensas: [],
    totais: { ob: { a: 0, t: 0 }, el: { a: 0, t: 0 }, li: { a: 0, t: 0 } },
    aac: 0, aacExigido: padroes.aacHorasExigidas, ext: 0, chTotal: 0,
  };
  let semestre = null;
  let emDispensa = false;
  const peso = (st) => (CONCLUIDO.has(st) ? 3 : CURSANDO.has(st) ? 2 : 1);

  for (const linha of linhas) {
    let m;

    if ((m = linha.match(/^Aluno:\s*([\d/]+)\s*-\s*(.+)$/))) {
      h.numero = m[1]; h.aluno = m[2].trim(); continue;
    }
    if ((m = linha.match(/^Curso:\s*[\d/]+\s*-\s*(.+)$/))) { h.curso = m[1].trim(); continue; }
    if ((m = linha.match(/(\d{4})\s*([12])\s*º?\.?\s*Semestre/))) {
      // os mesmos cabeçalhos reaparecem nas tabelas de AAC e extensão
      const chave = `${m[1]}/${m[2]}`;
      semestre = h.semestres.find((s) => `${s.ano}/${s.sem}` === chave);
      if (!semestre) {
        semestre = { ano: +m[1], sem: +m[2], itens: [] };
        h.semestres.push(semestre);
      }
      emDispensa = false;
      continue;
    }
    if (/^Dispensa\(s\)/.test(linha)) { emDispensa = true; continue; }
    if (/^(Observa|Registro das|Legenda)/.test(linha)) { emDispensa = false; continue; }

    if ((m = linha.match(/^(Obrigat[óo]rias|Opt\.?\s*Eletivas|Opt\.?\s*Livres)\D*(\d+)\s+(\d+)\b/))) {
      const chave = /Obrigat/.test(m[1]) ? 'ob' : /Eletivas/.test(m[1]) ? 'el' : 'li';
      h.totais[chave] = { a: +m[2], t: +m[3] };
      continue;
    }
    if ((m = linha.match(/Carga Hor[áa]ria em AAC:\s*(\d+)/))) { h.aac = +m[1]; continue; }
    if ((m = linha.match(/^Total exigido\s+(\d+)/))) { h.aacExigido = +m[1]; continue; }
    if ((m = linha.match(/Carga hor[áa]ria total de EXT:\s*(\d+)/))) { h.ext = +m[1]; continue; }
    if ((m = linha.match(/Carga Hor[áa]ria Total:\s*(\d+)/))) { h.chTotal = +m[1]; continue; }

    const sig = linha.match(SIGLA);
    if (!sig) continue;
    const codigo = sig[1];
    if (codigo.startsWith('AEX')) continue; // atividade extensionista, não disciplina

    if (emDispensa) {
      h.dispensas.push(codigo);
      if (peso('DI') >= peso(h.registros.get(codigo) || '')) h.registros.set(codigo, 'DI');
      continue;
    }

    const st = linha.match(STATUS);
    if (!st) continue;
    const atual = h.registros.get(codigo);
    if (!atual || peso(st[1]) > peso(atual)) h.registros.set(codigo, st[1]);
    if (semestre) semestre.itens.push({ c: codigo, status: st[1] });
  }
  return h;
}
