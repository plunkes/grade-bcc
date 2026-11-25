# grade

**Site: <https://plunkes.github.io/grade-bcc/>**

Planejador dos semestres que faltam no **Bacharelado em Ciências de Computação (ICMC/USP)**.
Você carrega seu histórico do Júpiter, ele mostra o que falta e você monta o plano arrastando
disciplinas. No fim, baixa o plano em PDF.

> Mais recursos no branch [`extras`](https://github.com/plunkes/grade-bcc/tree/extras): ênfases com sugestão de semestres e
> tabela de equivalências do ICMC.

## Como rodar

Use o site acima, ou rode local. Nos dois casos o histórico é lido dentro do navegador: o
PDF não é enviado para lugar nenhum (a página do GitHub Pages serve só arquivos estáticos).

Para rodar local, precisa só de Python (já vem no Linux e no macOS). Na pasta do projeto:

```bash
python3 tools/servir.py
```

Abra <http://localhost:8000> no navegador. Para parar, `Ctrl+C`. Esse servidor diz ao navegador
para não guardar cache, então depois de um `git pull` ou de trocar de branch basta recarregar.
(Com `python3 -m http.server` o navegador pode misturar arquivos velhos e novos; se a página
quebrar, recarregue com `Ctrl+Shift+R`.)

> O servidor é local e serve apenas os arquivos desta pasta. Ele é necessário porque o
> navegador bloqueia módulos e workers abertos direto por `file://` — nada é enviado para
> a internet.

## Como usar

1. No [Júpiter](https://uspdigital.usp.br/jupiterweb/), emita o **Histórico Escolar completo** em PDF.
2. Arraste o PDF para a página.
3. Arraste as disciplinas da coluna "A cursar" para os semestres.
4. Quando obrigatórias e eletivas fecharem, o botão **Baixar plano em PDF** aparece.

Regras aplicadas ao arrastar:

- **Requisito** não cumprido **bloqueia** o encaixe — nota não substitui conclusão.
- **Requisito fraco** só libera com a disciplina cumprida (ou planejada antes) ou com **nota ≥ 3,0** nela; sem isso, bloqueia. **Indicação de conjunto** só avisa.
- Disciplina de período ideal ímpar só entra em 1º semestre (e par em 2º). Desligue em
  **Configurações → Só disciplinas do semestre certo** para planejar fora da paridade.
- Estágio e projetos (graduação, intercâmbio, empreendedor) exigem 100 créditos-aula aprovados antes,
  mas valem em qualquer semestre, sem a regra de paridade.
- Estágio Supervisionado, Projeto de Graduação, Projeto em Intercâmbio e Projeto Empreendedor se
  equivalem, I e II inclusive: bastam **2 delas, em qualquer combinação** (ex.: Intercâmbio I + Estágio I).
  As 2 primeiras cursadas ou planejadas contam como obrigatórias; as demais, como eletivas.
- **+** no fim do quadro planeja mais um semestre; **−** remove o último (as disciplinas dele voltam para a lista).
- Semestre acima do limite de créditos-aula (**20** por padrão, ajustável em **Configurações**) é marcado
  como **puxado**, na tela e no PDF. É só aviso, a menos que você desligue **Permitir passar do limite**:
  aí o encaixe que passa é recusado.
- Semestre com menos de **12 créditos-aula** invalida o plano e segura o PDF. Só os **2 últimos** semestres do plano podem ficar abaixo disso.
- AAC e extensão são lidos do histórico: entram no placar e, se faltarem, saem listados no PDF.

## Privacidade

Tudo roda no seu navegador: o PDF é lido localmente, nada é enviado e nada é salvo (sem
`localStorage`, sem cookies, sem servidor remoto). Recarregar a página apaga o plano.
O histórico de exemplo (`document.pdf`) fica fora do Git.

## Publicar

O site sai do branch `main` pelo GitHub Pages. Para atualizar, basta `git push` — o Pages
reconstrói sozinho.

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
| `tools/servir.py` | servidor local sem cache |
| `tools/extract_curriculum.py` | gerador da grade |
| `tools/cdp-ui.mjs`, `tools/cdp-eval.mjs`, `tools/teste-parser.html` | conferência no Chrome headless |
| `vendor/` | pdf.js e jsPDF locais |

`ppc.md` é o PDF do projeto pedagógico colado como markdown — ilegível como texto e não usado pelo app.
