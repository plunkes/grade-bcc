#!/usr/bin/env python3
"""Servidor local sem cache: o navegador sempre busca a versão atual dos arquivos.

Com `python3 -m http.server`, o navegador pode guardar o app.js antigo e misturar com o
index.html novo depois de um `git pull` ou troca de branch, e a página quebra.

Uso: python3 tools/servir.py [porta]   (padrão 8000)
"""
import functools
import http.server
import os
import sys


class SemCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(SemCache, directory=raiz)
    print(f"Servindo {raiz} em http://localhost:{porta} (Ctrl+C para parar)")
    http.server.ThreadingHTTPServer(("127.0.0.1", porta), handler).serve_forever()
