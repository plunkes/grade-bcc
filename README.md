# contínuo

Planejador dos semestres que faltam no **Bacharelado em Ciências de Computação (ICMC/USP)**.
Você carrega seu histórico do Júpiter, ele mostra o que falta e você monta o plano arrastando
disciplinas. No fim, baixa o plano em PDF.

## Como rodar

Precisa só de Python (já vem no Linux e no macOS). Na pasta do projeto:

```bash
python3 -m http.server 8000
```

Abra <http://localhost:8000> no navegador. Para parar, `Ctrl+C`.

> O servidor é local e serve apenas os arquivos desta pasta. Ele é necessário porque o
> navegador bloqueia módulos e workers abertos direto por `file://` — nada é enviado para
> a internet.

## Como usar

1. No [Júpiter](https://uspdigital.usp.br/jupiterweb/), emita o **Histórico Escolar completo** em PDF.
2. Arraste o PDF para a página.
3. Arraste as disciplinas da coluna "A cursar" para os semestres.
4. Quando obrigatórias e eletivas fecharem, o botão **Baixar plano em PDF** aparece.

Regras aplicadas ao arrastar:

- **Requisito** não cumprido **bloqueia** o encaixe; **requisito fraco** e **indicação de conjunto** só avisam.
- Disciplina de período ideal ímpar só entra em 1º semestre (e par em 2º). Desligue em
  "Só disciplinas do semestre certo" para planejar fora da paridade.
- Estágio e projetos de graduação exigem 100 créditos-aula aprovados antes.
- AAC e extensão são lidos do histórico: entram no placar e, se faltarem, saem listados no PDF.

## Privacidade

Tudo roda no seu navegador: o PDF é lido localmente, nada é enviado e nada é salvo (sem
`localStorage`, sem cookies, sem servidor remoto). Recarregar a página apaga o plano.
O histórico de exemplo (`document.pdf`) fica fora do Git.

## Atualizar a grade curricular

A grade vem de `Grade Curricular.html` (página do JupiterWeb salva). Para regerar os dados
depois de salvar uma versão nova:

```bash
python3 tools/extract_curriculum.py
```

## Arquivos

| Caminho | O que é |
| --- | --- |
| `index.html` | a página |
| `assets/historico.js` | leitura do histórico em PDF |
| `assets/app.js` | pendências, board, requisitos e placar |
| `assets/pdf.js` | geração do plano em PDF |
| `assets/curriculum.js` | grade curricular gerada (não editar à mão) |
| `tools/extract_curriculum.py` | gerador da grade |
| `tools/cdp-ui.mjs`, `tools/cdp-eval.mjs`, `tools/teste-parser.html` | conferência no Chrome headless |
| `vendor/` | pdf.js e jsPDF locais |

`ppc.md` é o PDF do projeto pedagógico colado como markdown — ilegível como texto e não usado pelo app.
