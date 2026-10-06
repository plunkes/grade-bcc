/* Exportação do plano em PDF, feita no próprio navegador com jsPDF.
   Lista semestre a semestre e fecha com o que ainda fica pendente. */

import { diagnostico, S, GRADE, G, LIMITE_CREDITOS, creditosDoSemestre } from './app.js';

const MARGEM = 42;
const CINZA = [110, 123, 138];
const TINTA = [16, 23, 32];
const ALERTA = [142, 91, 6];

const hoje = () => new Date().toLocaleDateString('pt-BR');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function cabecalho(doc, h) {
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...TINTA);
  doc.text('Plano de curso', MARGEM, 58);

  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...CINZA);
  const linhas = [
    h.curso || G.curso,
    [h.aluno, h.numero].filter(Boolean).join(' · '),
    `Montado em ${hoje()} · gerado localmente pelo contínuo, não é documento oficial da USP`,
  ].filter(Boolean);
  linhas.forEach((t, i) => doc.text(t, MARGEM, 74 + i * 12));
  return 74 + linhas.length * 12 + 10;
}

function tabelaSemestre(doc, y, semestre) {
  const corpo = semestre.itens.map((c) => {
    const d = GRADE.get(c);
    return [d.c, d.n, String(d.ca), String(d.ct), `${d.ch} h`];
  });
  const soma = (campo) => semestre.itens.reduce((t, c) => t + (GRADE.get(c)?.[campo] || 0), 0);
  corpo.push([
    { content: 'Subtotal', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: String(soma('ca')), styles: { fontStyle: 'bold' } },
    { content: String(soma('ct')), styles: { fontStyle: 'bold' } },
    { content: `${soma('ch')} h`, styles: { fontStyle: 'bold' } },
  ]);

  const puxado = creditosDoSemestre(semestre) > LIMITE_CREDITOS;
  const titulo = `${semestre.ano} · ${semestre.sem}º semestre${puxado ? '  —  SEMESTRE PUXADO' : ''}`;

  doc.autoTable({
    startY: y,
    head: [[
      { content: titulo, colSpan: 2 },
      'Créd. aula', 'Créd. trab.', 'CH',
    ]],
    body: corpo,
    theme: 'grid',
    margin: { left: MARGEM, right: MARGEM },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, textColor: TINTA, lineColor: [214, 221, 229] },
    headStyles: { fillColor: puxado ? ALERTA : [35, 69, 127], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 62, font: 'courier' },
      2: { cellWidth: 56, halign: 'right' },
      3: { cellWidth: 56, halign: 'right' },
      4: { cellWidth: 46, halign: 'right' },
    },
  });
  let fim = doc.lastAutoTable.finalY;
  if (puxado) {
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...ALERTA);
    const texto = `Este semestre tem ${creditosDoSemestre(semestre)} créditos-aula e vai ser mais puxado. `
      + 'Para um plano mais leve, espalhe as disciplinas.';
    doc.text(doc.splitTextToSize(texto, doc.internal.pageSize.getWidth() - MARGEM * 2), MARGEM, fim + 12);
    fim += 12;
  }
  return fim + 16;
}

function tabelaSituacao(doc, y, d, h) {
  const linha = (nome, exigido, previsto, ok) => [nome, exigido, previsto, ok ? 'Cumprido' : 'Pendente'];
  doc.autoTable({
    startY: y,
    head: [['Exigência', 'Exigido', 'Previsto com o plano', 'Situação']],
    body: [
      linha('Disciplinas obrigatórias', `${d.obTotal} disciplinas`, `${d.cobertas} disciplinas`, !d.faltaOb.length),
      linha('Optativas eletivas', `${d.eletivas.exigido} créd.-aula`,
        `${d.eletivas.total} créd.-aula (${d.eletivas.el} eletivos + ${d.eletivas.aproveitado} livres)`,
        !d.eletivas.falta),
      linha('Atividades Acadêmicas Complementares', `${h.aacExigido} h`, `${h.aac} h`, h.aac >= h.aacExigido),
      linha('Atividades de extensão', `${G.extensaoHorasExigidas} h`, `${h.ext} h`, h.ext >= G.extensaoHorasExigidas),
    ],
    theme: 'grid',
    margin: { left: MARGEM, right: MARGEM },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, textColor: TINTA, lineColor: [214, 221, 229] },
    headStyles: { fillColor: [35, 69, 127], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 3: { cellWidth: 70 } },
    didParseCell: (dados) => {
      if (dados.section === 'body' && dados.column.index === 3) {
        dados.cell.styles.textColor = dados.cell.raw === 'Cumprido' ? [21, 107, 72] : [160, 42, 33];
        dados.cell.styles.fontStyle = 'bold';
      }
    },
  });
  return doc.lastAutoTable.finalY + 16;
}

function pendencias(doc, y, d) {
  if (!d.pendenciasPdf.length) {
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(21, 107, 72);
    doc.text('Nada pendente: o plano cobre todas as exigências da grade.', MARGEM, y + 4);
    return y + 20;
  }
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...TINTA);
  doc.text('Ainda pendente', MARGEM, y + 4);
  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...CINZA);
  d.pendenciasPdf.forEach((p, i) => doc.text(`•  ${p}`, MARGEM, y + 20 + i * 13));
  return y + 24 + d.pendenciasPdf.length * 13;
}

function rodape(doc) {
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...CINZA);
    doc.text(
      `contínuo · plano montado pelo próprio estudante · página ${p} de ${total}`,
      MARGEM,
      doc.internal.pageSize.getHeight() - 24,
    );
  }
}

/** Monta o documento e devolve a instância jsPDF. */
export function gerarPdf() {
  const d = diagnostico();
  const h = S.hist;
  const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
  const limite = doc.internal.pageSize.getHeight() - 70;

  let y = cabecalho(doc, h);

  const cheios = S.plano.filter((s) => s.itens.length);
  if (!cheios.length) {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...CINZA);
    doc.text('Nenhuma disciplina planejada.', MARGEM, y + 4);
    y += 24;
  }
  for (const semestre of cheios) {
    if (y > limite - 80) { doc.addPage(); y = MARGEM + 16; }
    y = tabelaSemestre(doc, y, semestre);
  }

  if (y > limite - 120) { doc.addPage(); y = MARGEM + 16; }
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...TINTA);
  doc.text('Fechamento do curso', MARGEM, y + 4);
  y = tabelaSituacao(doc, y + 14, d, h);
  y = pendencias(doc, y, d);

  const puxados = cheios.filter((s) => creditosDoSemestre(s) > LIMITE_CREDITOS);
  if (puxados.length) {
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...ALERTA);
    const quais = puxados.map((s) => `${s.ano}/${s.sem}`).join(', ');
    doc.text(
      `Semestre${puxados.length === 1 ? '' : 's'} puxado${puxados.length === 1 ? '' : 's'}: ${quais} `
      + `(acima de ${LIMITE_CREDITOS} créditos-aula).`,
      MARGEM, y + 6,
    );
    y += 18;
  }

  const planejadas = cheios.reduce((t, s) => t + s.itens.length, 0);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...CINZA);
  doc.text(
    `${plural(cheios.length, 'semestre planejado', 'semestres planejados')} · `
    + `${plural(planejadas, 'disciplina', 'disciplinas')} · `
    + 'confira a oferta real no Júpiter antes da matrícula.',
    MARGEM, y + 10,
  );

  rodape(doc);
  return doc;
}

export function exportarPdf() {
  const primeiro = S.plano.find((s) => s.itens.length) || S.plano[0];
  gerarPdf().save(`plano-de-curso-${primeiro.ano}-${primeiro.sem}.pdf`);
}

document.getElementById('btn-pdf').addEventListener('click', exportarPdf);
window.__gerarPdf = gerarPdf; // usado pelo harness de teste
