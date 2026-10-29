#!/usr/bin/env python3
"""Gera assets/curriculum.js a partir de 'Grade Curricular.html' (JupiterWeb/USP).

Uso: python3 tools/extract_curriculum.py
Saida: assets/curriculum.js  (window.CURRICULO = {...})
"""
import html
import json
import os
import re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "Grade Curricular.html")
OUT = os.path.join(BASE, "assets", "curriculum.js")

TIPOS = {
    "Disciplinas Obrigatórias": "ob",
    "Disciplinas Optativas Eletivas": "el",
    "Disciplinas Optativas Livres": "li",
}
# Período ideal que mudou depois da grade salva: sigla -> período (a paridade
# decide se a disciplina é de 1º ou 2º semestre).
PERIODO_CORRIGIDO = {
    "SCC0245": 8,  # Processamento Analítico de Dados passou para os semestres pares
}

KINDS = {
    "requisito fraco": "fraca",
    "indicação de conjunto": "conjunto",
    "requisito": "forte",
}


def texto(fragmento):
    t = re.sub(r"<[^>]+>", " ", fragmento)
    t = html.unescape(t).replace("\xa0", " ")
    return re.sub(r"\s+", " ", t).strip()


def celulas(linha):
    return [texto(c) for c in re.findall(r"<td\b[^>]*>(.*?)</td>", linha, re.S | re.I)]


def num(valor):
    return int(valor) if re.fullmatch(r"\d+", valor or "") else 0


def main():
    raw = open(SRC, encoding="cp1252", errors="replace").read()
    linhas = re.findall(r"<tr\b[^>]*>.*?</tr>", raw, re.S | re.I)

    disciplinas = {}
    ordem = []
    tipo = periodo = None
    atual = None  # ultima disciplina, recebe os requisitos das linhas seguintes
    pendente_ou = False

    for linha in linhas:
        plano = texto(linha)

        if plano in TIPOS:
            tipo, atual = TIPOS[plano], None
            continue

        cab = re.match(r"^(\d+)º Período Ideal\b", plano)
        if cab:
            periodo, atual = int(cab.group(1)), None
            continue

        if plano == "ou":
            pendente_ou = True
            continue

        link = re.search(r"sgldis=([A-Z0-9]+)", linha)
        if link and tipo:
            cs = celulas(linha)
            codigo = link.group(1)
            atual = {
                "c": codigo,
                "n": cs[1] if len(cs) > 1 else "",
                "ca": num(cs[2] if len(cs) > 2 else ""),
                "ct": num(cs[3] if len(cs) > 3 else ""),
                "ch": num(cs[4] if len(cs) > 4 else ""),
                "ce": num(cs[5] if len(cs) > 5 else ""),
                "cp": num(cs[6] if len(cs) > 6 else ""),
                "atpa": num(cs[7] if len(cs) > 7 else ""),
                "ext": num(cs[8] if len(cs) > 8 else ""),
                "p": periodo,
                "t": tipo,
                "r": [],
            }
            # a mesma sigla pode aparecer em mais de uma secao; obrigatoria vence
            anterior = disciplinas.get(codigo)
            if anterior is None:
                disciplinas[codigo] = atual
                ordem.append(codigo)
            elif anterior["t"] != "ob" and tipo == "ob":
                atual["r"] = anterior["r"]
                disciplinas[codigo] = atual
            else:
                atual = anterior
            pendente_ou = False
            continue

        req = re.match(r"^([A-Z]{3}\d{4}|\d{7}) - (.+)$", plano)
        if req and atual is not None:
            resto = req.group(2)
            kind = None
            for rotulo, valor in KINDS.items():
                if resto.lower().endswith(rotulo):
                    kind = valor
                    resto = resto[: -len(rotulo)].strip()
                    break
            if kind is None:
                continue
            item = {"c": req.group(1), "n": resto, "k": kind}
            if pendente_ou and atual["r"]:
                atual["r"][-1].append(item)
            else:
                atual["r"].append([item])
            pendente_ou = False

    for codigo, periodo in PERIODO_CORRIGIDO.items():
        if codigo in disciplinas:
            disciplinas[codigo]["p"] = periodo

    obrig = [c for c in ordem if disciplinas[c]["t"] == "ob"]
    dados = {
        "curso": "Bacharelado em Ciências de Computação — ICMC/USP",
        "codigo": "55041/0",
        "inicio": "2027",
        "semestresIdeal": 10,
        "creditosEletivosExigidos": 24,   # 360 h-aula / 15 h por credito-aula
        "chTotalGrade": 4515,             # disciplinas da grade + AAC
        "extensaoHorasExigidas": 452,     # 10% da carga horaria curricular
        "creditosLivresAproveitaveis": 4, # limite de livres contado como eletivo
        "aacHorasExigidas": 30,
        "creditosParaEstagio": 100,
        "disciplinasEstagioProjeto": [
            "SCC0291", "SCC0292", "SCC0289", "SCC0290", "SCC0293", "SCC0294",
            "SCC0300", "SCC0302",
        ],
        "disciplinas": [disciplinas[c] for c in ordem],
    }

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("// GERADO por tools/extract_curriculum.py — nao editar a mao.\n")
        fh.write("window.CURRICULO = ")
        json.dump(dados, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")

    print(f"{len(ordem)} disciplinas ({len(obrig)} obrigatorias) -> {OUT}")


if __name__ == "__main__":
    main()
