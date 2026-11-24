#!/usr/bin/env python3
"""Gera assets/equivalencias.js a partir da tabela de equivalências do ICMC (.xlsx).

Cada linha da tabela diz: cursar a(s) disciplina(s) da coluna A conta como a(s)
disciplina(s) da coluna B. Só entram as regras que cobrem alguma disciplina da
grade do BCC (assets/curriculum.js).

Créditos, período ideal e requisitos das disciplinas de outros cursos vêm do
Júpiter (uspdigital.usp.br/jupiterweb) e ficam em cache em tools/jupiter.json;
apague uma entrada (ou o arquivo) para buscar de novo.

Uso: uv run --with openpyxl python3 tools/extract_equivalencias.py
Saida: assets/equivalencias.js  (window.EQUIVALENCIAS = {...})
"""
import html
import json
import os
import re
import time
import urllib.request

import openpyxl

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "Tabela de equivalências 2026_ATUALIZADA 13_04_2026.xlsx")
GRADE = os.path.join(BASE, "assets", "curriculum.js")
OUT = os.path.join(BASE, "assets", "equivalencias.js")
CACHE = os.path.join(BASE, "tools", "jupiter.json")
JUPITER = "https://uspdigital.usp.br/jupiterweb/"
BCC = "55041"
TIPOS = {"Requisito": "forte", "Requisito fraco": "fraca", "Indicação de Conjunto": "conjunto"}

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


def pagina(caminho):
    with urllib.request.urlopen(JUPITER + caminho, timeout=30) as resp:
        t = resp.read().decode("latin-1")
    t = re.sub(r"(?s)<(script|style).*?</\1>|<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", html.unescape(t))


def jupiter(codigo):
    """{ca, ct, p, r} de uma disciplina, ou None se o Júpiter não a tem.
    Requisitos e período ideal: os do BCC, se ela tiver; senão os do primeiro curso listado."""
    t = pagina(f"obterDisciplina?sgldis={codigo}")
    ca = re.search(r"Créditos Aula: (\d+)", t)
    if not ca:
        return None
    ct = re.search(r"Créditos Trabalho: (\d+)", t)
    cursos = pagina(f"listarCursosRequisitos?coddis={codigo}").split("Curso: ")[1:]
    cursos = [c.split(" Créditos | Fale conosco")[0] for c in cursos]
    curso = next((c for c in cursos if c.startswith(BCC)), cursos[0] if cursos else "")
    periodo = re.search(r"Período ideal: (\d+)", curso)
    req = re.findall(r"([A-Z]{3}\d{4}|\d{7}) - .+? (Requisito fraco|Requisito|Indicação de Conjunto)", curso)
    return {
        "ca": int(ca.group(1)),
        "ct": int(ct.group(1)) if ct else 0,
        "p": int(periodo.group(1)) if periodo else 0,
        "r": [[{"c": c, "k": TIPOS[k]}] for c, k in req],
    }


def buscar_externas(codigos):
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    for c in sorted(codigos):
        if c in cache:
            continue
        try:
            cache[c] = jupiter(c)
        except OSError as e:
            print(f"  {c}: {e}")  # fica fora do cache para tentar de novo
            continue
        time.sleep(0.3)  # sem pressa com o servidor da USP
    with open(CACHE, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=1, sort_keys=True)
    return {c: cache[c] for c in codigos if cache.get(c)}


def main():
    raw = open(GRADE, encoding="utf-8").read()
    grade = set(re.findall(r'"c":"([A-Z0-9]+)","n"', raw))

    livro = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    regras = []
    vistos = set()
    todos_nomes = {}
    pares = set()
    for folha in livro.worksheets:
        for linha in folha.iter_rows(min_row=2, max_col=2, values_only=True):
            de, para = (str(v or "").replace("\n", " ").strip() for v in linha)
            alvo = [c for c in siglas(para) if c in grade]
            origem = partes(de)
            # uma por uma, de qualquer curso: serve para cumprir requisito de outro curso
            if len(origem) == 1 and len(siglas(para)) == 1:
                pares.update(tuple(sorted((a, siglas(para)[0]))) for a in origem[0] if a != siglas(para)[0])
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
                "folha": folha.title,
            })

    externas = buscar_externas({c for r in regras for p in r["de"] for c in p if c not in grade})
    dados = {
        "fonte": os.path.basename(SRC),
        "regras": regras,
        "externas": externas,
        "pares": sorted(pares),
        "nomes": {c: n for c, n in sorted(todos_nomes.items())},
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("// GERADO por tools/extract_equivalencias.py — nao editar a mao.\n")
        fh.write("window.EQUIVALENCIAS = ")
        json.dump(dados, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")

    cobertas = {c for r in regras for c in r["para"]}
    print(f"{len(regras)} regras cobrindo {len(cobertas)} disciplinas da grade, "
          f"{len(externas)} disciplinas de outros cursos no Júpiter, {len(pares)} pares -> {OUT}")


if __name__ == "__main__":
    main()
