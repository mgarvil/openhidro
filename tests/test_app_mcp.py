"""Servidor MCP do aplicativo: repassa comandos para a ponte HTTP local (simulada aqui)."""
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

pytest.importorskip("mcp")
from openhidro import app_mcp  # noqa: E402


class _Ponte(BaseHTTPRequestHandler):
    recebidos: list = []

    def do_POST(self):  # noqa: N802
        corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        ok = self.headers.get("Authorization") == "Bearer segredo"
        _Ponte.recebidos.append(corpo)
        resp = {"ok": True, "resultado": {"eco": corpo["comando"], "args": corpo["args"]}} if ok else {"ok": False, "erro": "chave"}
        dados = json.dumps(resp).encode()
        self.send_response(200 if ok else 401)
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def log_message(self, *a):
        pass


def test_repassa_comandos(tmp_path, monkeypatch):
    srv = HTTPServer(("127.0.0.1", 0), _Ponte)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    info = tmp_path / "mcp.json"
    info.write_text(json.dumps({"porta": srv.server_address[1], "chave": "segredo"}))
    monkeypatch.setenv("OPENHIDRO_APP_INFO", str(info))
    assert app_mcp._chamar("inserirTubo", {"x1": 0}) == {"eco": "inserirTubo", "args": {"x1": 0}}
    r = app_mcp.openhidro_lote([{"comando": "a"}, {"comando": "b", "args": {"k": 1}}])
    assert [x["ok"] for x in r] == [True, True]
    srv.shutdown()


def test_app_fechado(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENHIDRO_APP_INFO", str(tmp_path / "nao_existe.json"))
    with pytest.raises(RuntimeError, match="não está aberto"):
        app_mcp._chamar("estado")
