"""Servidor MCP que liga o Claude ao aplicativo OpenHidro aberto no computador.

O aplicativo (Tauri) abre uma ponte local em 127.0.0.1 e grava a porta e uma chave em
``<dados do app>/mcp.json``. Este servidor lê esse arquivo e repassa cada ferramenta para a
ponte, que executa os mesmos comandos dos botões do programa (tudo entra no Ctrl+Z).

Configuração no Claude Desktop (``claude_desktop_config.json``, em ``mcpServers``)::

    "openhidro-app": { "command": "python", "args": ["-m", "openhidro.app_mcp"] }

No Claude Code::

    claude mcp add openhidro-app -- python -m openhidro.app_mcp
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

try:  # mcp >= 2
    from mcp.server.mcpserver import MCPServer as _Server
except ImportError:  # mcp 1.x
    from mcp.server.fastmcp import FastMCP as _Server

try:
    from mcp.server.fastmcp import Image as _Image
except ImportError:  # pragma: no cover
    _Image = None

IDENT = "br.com.mgarvil.openhidro"

INSTRUCOES = """Você controla o aplicativo OpenHidro aberto na tela do usuário (projeto hidrossanitário,
NBR 5626 água fria e NBR 8160 esgoto). Fluxo recomendado:
1. openhidro_estado para ver pavimentos, unidade do desenho (escalaMetro = metros por unidade),
   elementos e a janela visível; openhidro_tela para VER a planta.
2. Localize ambientes com openhidro_executar("buscarTextos", {"filtro": "BWC"}) e a geometria com
   "geometriaPlanta" {xmin,ymin,xmax,ymax}. Coordenadas x/y são as do desenho (mesma unidade da planta).
3. Lance com os comandos (openhidro_comandos lista todos): água fria — inserirReservatorio,
   inserirTubo {x1,y1,x2,y2,altura m}, inserirAparelho {chave,x,y}, inserirRegistro, inserirColuna;
   esgoto — inserirSaidaEsgoto, inserirTuboEsgoto (no sentido do escoamento), inserirPontoEsgoto,
   inserirCaixa, inserirTuboQueda. Pontos e tubos se ligam pelas coordenadas exatas: um tubo deve
   terminar exatamente no x,y do ponto, ou passar por ele.
4. calcular → confira pendências; ajuste; depois materiais, prancha {direto:true}, exportarIfc.
Boas práticas de lançamento (correções do engenheiro — siga sempre):
- Água fria embutida na PAREDE: passe os tubos no eixo das paredes (use geometriaPlanta para achar as
  duas faces e use o meio), nunca soltos no ambiente. Desça pela parede: um tubo na altura do forro e
  outro na altura do ramal da parede, com as pontas no mesmo x,y, viram descida automaticamente.
  Ramal na parede: ~1,20 m para mictórios, ~0,90 m para lavatórios, ~0,60 m para bacias com caixa,
  ou ramal baixo (~0,30 m) subindo a cada ponto, como nos projetos de referência do escritório.
- Antes de lançar, confira a unidade da planta (estado → escalaMetro): espessura de parede deve dar
  0,10–0,25 m. Se não der, corrija com configurar {escalaMetro: 0.01 (cm) | 0.001 (mm) | 1 (m)}.
- Ducha higiênica: inserirAparelho {chave: "ducha_higienica"} (sigla DH, 0,45 m).
- Pontos alinhados: use o mesmo x ou y exato, ou o comando alinhar {ids, eixo}.
- Alturas dos pontos: use as do projeto (inserirAparelho sem altura aplica a tabela do escritório:
  CH 2,10; LV 0,60; VS 0,30; VD 1,00; pia/tanque/mictório 1,10; TJ 0,60; bebedouro 0,88).
- Registro de gaveta por ambiente, na descida a 1,80 m; registro de pressão do chuveiro a 1,00 m, na
  subida do chuveiro (inserirRegistro com altura, na ponta do tubo).
- Não crie "tê de canto" (três saídas sem par alinhado, ex.: coluna descendo com dois tubos a 90° no
  mesmo ponto): essa peça não existe. Faça a coluna atravessar (tê com passagem vertical) e derive
  em alturas diferentes, ou afaste a derivação.
- Esgoto horizontal: ramal secundário entra no primário por junção a 45° (o inserirTuboEsgoto faz a
  chegada a 45° sozinho quando o tubo termina no meio de outro). Desenhe sempre no sentido do escoamento.
- Calcule e corrija as pendências antes de gerar prancha e IFC.
Mostre ao usuário o que vai lançar antes de lançar muitos elementos. Use desfazer se errar.
Os resultados são preliminares: a responsabilidade técnica é do engenheiro."""

mcp = _Server("openhidro-app", instructions=INSTRUCOES)


def _arquivo_info() -> Path:
    if os.environ.get("OPENHIDRO_APP_INFO"):
        return Path(os.environ["OPENHIDRO_APP_INFO"])
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / IDENT / "mcp.json"


def _chamar(comando: str, args: dict | None = None) -> object:
    arq = _arquivo_info()
    if not arq.exists():
        raise RuntimeError("O OpenHidro não está aberto (não encontrei a ponte local). Abra o aplicativo e tente de novo.")
    info = json.loads(arq.read_text(encoding="utf-8"))
    req = urllib.request.Request(
        f"http://127.0.0.1:{info['porta']}/", method="POST",
        data=json.dumps({"comando": comando, "args": args}).encode("utf-8"),
        headers={"Authorization": f"Bearer {info['chave']}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=200) as r:
            resp = json.loads(r.read().decode("utf-8"))
    except urllib.error.URLError as e:
        raise RuntimeError(f"Não consegui falar com o OpenHidro ({e}). O aplicativo está aberto?") from e
    if not resp.get("ok"):
        raise RuntimeError(resp.get("erro", "erro desconhecido"))
    return resp.get("resultado")


@mcp.tool()
def openhidro_estado() -> dict:
    """Resumo do projeto aberto: pavimentos, unidade do desenho, elementos, vista e cálculo."""
    return _chamar("estado")


@mcp.tool()
def openhidro_comandos() -> list:
    """Lista os comandos do OpenHidro (nome e descrição com os argumentos)."""
    return _chamar("listarComandos")


@mcp.tool()
def openhidro_executar(comando: str, args: dict | None = None) -> object:
    """Executa um comando do OpenHidro (os mesmos dos botões). Ex.: comando="inserirTubo",
    args={"x1": 44, "y1": 75, "x2": 44, "y2": 73.4, "altura": 2.6}."""
    return _chamar(comando, args)


@mcp.tool()
def openhidro_lote(comandos: list[dict]) -> list:
    """Executa vários comandos em sequência: [{"comando": "...", "args": {...}}, ...].
    Para no primeiro erro e devolve os resultados até ali."""
    out = []
    for c in comandos:
        try:
            out.append({"comando": c.get("comando"), "ok": True, "resultado": _chamar(c["comando"], c.get("args"))})
        except Exception as e:  # noqa: BLE001
            out.append({"comando": c.get("comando"), "ok": False, "erro": str(e)})
            break
    return out


@mcp.tool()
def openhidro_tela():
    """Imagem da vista atual do OpenHidro (planta com os elementos, ou o 3D)."""
    r = _chamar("capturarTela")
    import base64
    dados = base64.b64decode(r["base64"])
    if _Image is not None:
        return _Image(data=dados, format="png")
    return {"png_base64": r["base64"]}


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
