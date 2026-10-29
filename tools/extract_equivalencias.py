#!/usr/bin/env python3
"""Gera assets/equivalencias.js a partir de 'Tabela de equivalências ATUALIZADA.xls' (ICMC).

Cada linha da tabela diz: cursar a(s) disciplina(s) da coluna A conta como a(s)
disciplina(s) da coluna B. Só entram as regras que cobrem alguma disciplina da
grade do BCC (assets/curriculum.js).

Uso: uv run --with xlrd python3 tools/extract_equivalencias.py
Saida: assets/equivalencias.js  (window.EQUIVALENCIAS = {...})
"""
import json
import os
import re

import xlrd

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "Tabela de equivalências ATUALIZADA.xls")
GRADE = os.path.join(BASE, "assets", "curriculum.js")
OUT = os.path.join(BASE, "assets", "equivalencias.js")

# sigla como aparece na planilha: SCC0240, SME-818, SMA186, 7600105
SIGLA = re.compile(r"\b([A-Z]{3})[-\s]?(\d{3,4})\b|\b(\d{7})\b")


def siglas(texto):
    out = []
    for m in SIGLA.finditer(texto):
        c = m.group(3) or f"{m.group(1)}{m.group(2).zfill(4)}"
        if c not in out:
            out.append(c)
    return out


def partes(texto):
    """Lado 'cursada': '+' separa disciplinas exigidas juntas; dentro de cada
    parte, 'ou' (ou siglas entre parênteses) são alternativas. Sem 'ou', cada
    sigla da parte é exigida."""
    lista = []
    for parte in texto.split("+"):
        cs = siglas(parte)
        if not cs:
            continue
        if re.search(r"\bou\b", parte):
            lista.append(cs)
        else:
            lista.extend([c] for c in cs)
    return lista


def nomes(texto, destino):
    """Nome de cada sigla: o trecho logo depois dela, até a próxima sigla ou '+'."""
    for m in SIGLA.finditer(texto):
        c = m.group(3) or f"{m.group(1)}{m.group(2).zfill(4)}"
        resto = texto[m.end():]
        resto = re.split(r"\+|\bou\b|" + SIGLA.pattern, resto)[0]
        nome = re.sub(r"^[\s\-–:(]+|[\s(]+$", "", resto)
        if nome and c not in destino:
            destino[c] = re.sub(r"\s+", " ", nome)


def main():
    raw = open(GRADE, encoding="utf-8").read()
    grade = set(re.findall(r'"c":"([A-Z0-9]+)","n"', raw))

    livro = xlrd.open_workbook(SRC)
    regras = []
    vistos = set()
    todos_nomes = {}
    for folha in livro.sheets():
        for r in range(1, folha.nrows):
            de, para = (str(v).replace("\n", " ").strip() for v in folha.row_values(r)[:2])
            alvo = [c for c in siglas(para) if c in grade]
            origem = partes(de)
            if not alvo or not origem:
                continue
            if all(len(p) == 1 and p[0] in alvo for p in origem):
                continue  # a disciplina equivalendo a ela mesma
            chave = json.dumps([origem, alvo])
            if chave in vistos:
                continue
            vistos.add(chave)
            nomes(de, todos_nomes)
            regras.append({
                "de": origem,
                "para": alvo,
                "texto": re.sub(r"\s+", " ", de),
                "folha": folha.name,
            })

    dados = {
        "fonte": os.path.basename(SRC),
        "regras": regras,
        "nomes": {c: n for c, n in sorted(todos_nomes.items())},
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("// GERADO por tools/extract_equivalencias.py — nao editar a mao.\n")
        fh.write("window.EQUIVALENCIAS = ")
        json.dump(dados, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")

    cobertas = {c for r in regras for c in r["para"]}
    print(f"{len(regras)} regras cobrindo {len(cobertas)} disciplinas da grade -> {OUT}")


if __name__ == "__main__":
    main()
