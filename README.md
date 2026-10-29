# contínuo

**Site: <https://plunkes.github.io/continuo-bcc/>**

Planejador dos semestres que faltam no **Bacharelado em Ciências de Computação (ICMC/USP)**.
Você carrega seu histórico do Júpiter, ele mostra o que falta e você monta o plano arrastando
disciplinas. No fim, baixa o plano em PDF.

> Mais recursos no branch [`extras`](https://github.com/plunkes/continuo-bcc/tree/extras): ênfases com sugestão de semestres e
> tabela de equivalências do ICMC.

## Como rodar

Use o site acima, ou rode local. Nos dois casos o histórico é lido dentro do navegador: o
PDF não é enviado para lugar nenhum (a página do GitHub Pages serve só arquivos estáticos).

Para rodar local, precisa só de Python (já vem no Linux e no macOS). Na pasta do projeto:

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

### Ênfases

Os chips em **Ênfase** mostram os certificados de estudos especiais da grade (IA, Engenharia
de Software, Ciência de Dados…). Dá para escolher **várias**. Cada uma abre um painel com as
disciplinas dela, o que já foi feito e o mínimo exigido; no topo, o painel **Melhor caminho**
mostra a combinação de disciplinas que fecha todas as ênfases escolhidas e o semestre de cada.

A combinação é otimizada:

- **Menos créditos-aula no total** (desempate: menos créditos-trabalho). Disciplina que conta
  para mais de uma ênfase entra uma vez só; requisito eletivo que ela puxa entra no custo.
- **O que você já cursou e o que já pôs no plano conta de graça.** Para preferir uma
  disciplina, arraste-a para um semestre: a otimização passa a contar com ela.
- A busca é exata (branch and bound) e para em 250 ms; se parar antes, o painel avisa que é a
  melhor solução encontrada.

**Aplicar ao plano** encaixa as obrigatórias pendentes, as disciplinas escolhidas e, se ainda
faltarem créditos eletivos, mais optativas. A distribuição usa o menor número de semestres em
que tudo cabe e **equilibra a carga** entre eles (respeitando requisitos, paridade, estágio e o
limite de 20 créditos-aula), sem mexer no que você já tinha posto. **Desfazer** volta o plano. **Limpar** (ao lado dos chips ou no painel) tira todas as ênfases da otimização sem mexer no plano.
Disciplinas citadas na ênfase mas fora da grade aparecem marcadas e nunca são sugeridas.

Ênfase completa ganha **✓** no chip (concluída pelo histórico) ou **◐** (completa contando o
plano), aparece no medidor **Ênfases** do placar e sai numa tabela própria no PDF.

Regras aplicadas ao arrastar:

- **Requisito** não cumprido **bloqueia** o encaixe — nota não substitui conclusão.
- **Requisito fraco** só libera com a disciplina cumprida (ou planejada antes) ou com **nota ≥ 3,0** nela; sem isso, bloqueia. **Indicação de conjunto** só avisa.
- Disciplina de período ideal ímpar só entra em 1º semestre (e par em 2º). Desligue em
  "Só disciplinas do semestre certo" para planejar fora da paridade.
- Estágio e projetos (graduação, intercâmbio, empreendedor) exigem 100 créditos-aula aprovados antes,
  mas valem em qualquer semestre, sem a regra de paridade.
- Estágio Supervisionado, Projeto de Graduação, Projeto em Intercâmbio e Projeto Empreendedor se
  equivalem, I e II inclusive: bastam **2 delas, em qualquer combinação** (ex.: Intercâmbio I + Estágio I).
  As 2 primeiras cursadas ou planejadas contam como obrigatórias; as demais, como eletivas.
- **+** no fim do quadro planeja mais um semestre; **−** remove o último (as disciplinas dele voltam para a lista).
- Semestre acima de 20 créditos-aula é marcado como **puxado**, na tela e no PDF. É só aviso: o encaixe continua valendo.
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
| `tools/extract_curriculum.py` | gerador da grade |
| `tools/cdp-ui.mjs`, `tools/cdp-eval.mjs`, `tools/teste-parser.html` | conferência no Chrome headless |
| `vendor/` | pdf.js e jsPDF locais |

`ppc.md` é o PDF do projeto pedagógico colado como markdown — ilegível como texto e não usado pelo app.
