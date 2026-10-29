#!/usr/bin/env python3
"""Gera assets/curriculum.js a partir de 'Grade Curricular.html' (JupiterWeb/USP).

Uso: python3 tools/extract_curriculum.py
Saida: assets/curriculum.js  (window.CURRICULO = {...})
"""
import html
import json
import os
import re
import unicodedata

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "Grade Curricular.html")
OUT = os.path.join(BASE, "assets", "curriculum.js")

TIPOS = {
    "Disciplinas Obrigatórias": "ob",
    "Disciplinas Optativas Eletivas": "el",
    "Disciplinas Optativas Livres": "li",
}
# Sigla citada numa ênfase que saiu da grade, com a substituta de mesmo nome.
EQUIVALENTES = {"SSC0721": "SSC0959"}  # Teste e Inspeção de Software

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


def enfases(raw):
    """Certificados de estudos especiais (ênfases) do texto da grade.

    Cada ênfase tem grupos; cada grupo tem um mínimo de disciplinas e itens.
    Um item é uma lista de siglas alternativas ("SSC0128 ... ou SEP0172 ...").
    """
    ini = raw.find("certificados de estudos especiais")
    fim = raw.find("Além dos créditos", ini)
    if ini < 0 or fim < 0:
        return []
    lista = []
    atual = None
    for bloco in re.findall(r"<p\b[^>]*>(.*?)</p>", raw[ini:fim], re.S | re.I):
        titulo = re.search(r"<strong>(.*?)</strong>", bloco, re.S | re.I)
        if titulo:
            nome = re.sub(r"^Ênfase\s+|\s+para os cursos do ICMC$", "", texto(titulo.group(1)))
            ascii_ = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
            atual = {"id": re.sub(r"[^a-z]+", "-", ascii_.lower()).strip("-"), "nome": nome, "grupos": []}
            lista.append(atual)
        if atual is None:
            continue
        for linha in re.split(r"<br\s*/?>", bloco, flags=re.I):
            t = texto(linha)
            grupo = re.match(r"^Grupo (\d+):", t)
            if grupo:
                atual["grupos"].append({"nome": f"Grupo {grupo.group(1)}", "minimo": 0, "itens": []})
                t = t[grupo.end():].strip()
            minimo = re.search(r"mínimo de (\d+) disciplinas", t)
            if minimo:
                atual["grupos"][-1]["minimo"] = int(minimo.group(1))
                continue
            for qtd, g in re.findall(r"(\d+) disciplinas do Grupo (\d+)", t):
                atual["grupos"][int(g) - 1]["minimo"] = int(qtd)
            if not re.match(r"^[A-Z]{3}\d{4}\b", t):
                continue
            if not atual["grupos"]:
                atual["grupos"].append({"nome": None, "minimo": 0, "itens": []})
            alternativas = []
            for parte in re.split(r"\s+ou\s+(?=[A-Z]{3}\d{4})", t):
                m = re.match(r"^([A-Z]{3}\d{4})\s*-?\s*(.*)$", parte)
                alternativas.append({"c": m.group(1), "n": m.group(2).strip()})
            for a in list(alternativas):
                eq = EQUIVALENTES.get(a["c"])
                if eq and all(x["c"] != eq for x in alternativas):
                    alternativas.append({"c": eq, "n": a["n"]})
            atual["grupos"][-1]["itens"].append(alternativas)
    return [e for e in lista if any(g["itens"] for g in e["grupos"])]


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
        "enfases": enfases(raw),
    }

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("// GERADO por tools/extract_curriculum.py — nao editar a mao.\n")
        fh.write("window.CURRICULO = ")
        json.dump(dados, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")

    print(f"{len(ordem)} disciplinas ({len(obrig)} obrigatorias), "
          f"{len(dados['enfases'])} enfases -> {OUT}")


if __name__ == "__main__":
    main()
