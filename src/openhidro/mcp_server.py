"""Servidor MCP do OpenHidro — permite que o Claude (Claude Code, Claude Desktop
ou qualquer cliente MCP) dimensione redes hidrossanitárias.

Configuração no Claude Code::

    claude mcp add openhidro -- openhidro-mcp

Ferramentas expostas:
* listar_aparelhos — chaves aceitas, pesos e UHC
* dimensionar_rede — recebe a rede em JSON e devolve resultado + memorial
* dimensionar_dxf — lê um DXF + configuração, dimensiona e grava DXF anotado
* calcular_reservatorio — volume de reservação por ocupação
"""
from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

try:  # mcp >= 2
    from mcp.server.mcpserver import MCPServer as _Server
except ImportError:  # mcp 1.x
    from mcp.server.fastmcp import FastMCP as _Server

from .calculo import dimensionar_agua_fria, dimensionar_esgoto
from .io import relatorio as R
from .modelo import Rede
from .normas import nbr5626 as N
from .normas import nbr8160 as E
from .normas.consumo import CONSUMO_PER_CAPITA, dimensionar_reservatorio

INSTRUCOES = """OpenHidro dimensiona instalações prediais de água fria (NBR 5626, soma dos pesos) e
esgoto sanitário (NBR 8160, UHC). Monte a rede como árvore: água fria parte de um único nó
'reservatorio' e os trechos vão de montante para jusante; no esgoto os trechos seguem o sentido
do escoamento até um único nó final. Coordenadas em metros. Use listar_aparelhos para as chaves.
Os resultados são preliminares: a responsabilidade técnica é do engenheiro."""

mcp = _Server("openhidro", instructions=INSTRUCOES)


def _rodar(rede: Rede) -> dict:
    if rede.sistema == "agua_fria":
        res = dimensionar_agua_fria(rede)
        mem = R.memorial_agua_fria(res)
    else:
        res = dimensionar_esgoto(rede)
        mem = R.memorial_esgoto(res)
    return {"ok": res.ok, "resultado": asdict(res), "memorial_markdown": mem}


@mcp.tool()
def listar_aparelhos() -> dict:
    """Lista as chaves de aparelhos aceitas em água fria (peso, vazão) e esgoto (UHC, DN mínimo)."""
    return {
        "agua_fria": {k: {"descricao": a.descricao, "peso": a.peso, "vazao_ls": a.vazao_ls}
                      for k, a in N.APARELHOS_AF.items()},
        "esgoto": {k: {"descricao": a.descricao, "uhc": a.uhc, "dn_min_ramal": a.dn_min_ramal_descarga}
                   for k, a in E.APARELHOS_ES.items()},
        "conexoes_agua_fria": sorted(N.LEQ_PVC),
    }


@mcp.tool()
def dimensionar_rede(rede: dict) -> dict:
    """Dimensiona uma rede de água fria ou esgoto.

    rede = {"sistema": "agua_fria"|"esgoto", "nome": str, "parametros": {...},
            "nos": [{"id","x","y","z","tipo","aparelho","quantidade"}],
            "trechos": [{"id","de","para","comprimento"?,"conexoes"?:{peça: qtd},"dn"?,"tipo"?,"declividade"?}]}
    Tipos de nó: reservatorio, ponto, juncao, caixa_sifonada, caixa_inspecao, saida.
    Parâmetros úteis: nivel_agua_m, velocidade_max_ms, pressao_min_ponto_kpa, acrescimo_localizadas
    (água fria); pavimentos, declividade_padrao (esgoto).
    """
    return _rodar(Rede.from_dict(rede))


@mcp.tool()
def dimensionar_dxf(caminho_dxf: str, config: dict, pasta_saida: str) -> dict:
    """Lê a tubulação de um DXF (linhas em camadas + blocos de aparelhos), dimensiona e grava
    memorial (.md), tabela (.csv) e DXF anotado na pasta de saída. Veja a docstring de
    openhidro.io.dxf para o formato de 'config'."""
    from .io.dxf import anotar_dxf, ler_rede_dxf

    rede = ler_rede_dxf(caminho_dxf, config)
    out = _rodar(rede)
    pasta = Path(pasta_saida)
    pasta.mkdir(parents=True, exist_ok=True)
    base = Path(caminho_dxf).stem
    (pasta / f"{base}_memorial.md").write_text(out["memorial_markdown"], encoding="utf-8")
    rede.salvar(pasta / f"{base}_rede.json")
    res = dimensionar_agua_fria(rede) if rede.sistema == "agua_fria" else dimensionar_esgoto(rede)
    (pasta / f"{base}_trechos.csv").write_text(R.csv_trechos(res), encoding="utf-8-sig")
    dxf_out = anotar_dxf(caminho_dxf, pasta / f"{base}_dimensionado.dxf", rede, res,
                         float(config.get("escala_para_m", 1.0)))
    out["arquivos"] = [str(p) for p in pasta.iterdir()]
    out["dxf_anotado"] = str(dxf_out)
    out["rede"] = rede.to_dict()
    return out


@mcp.tool()
def calcular_reservatorio(ocupacoes: dict[str, float], dias_reserva: float = 2.0,
                          reserva_incendio_l: float = 0.0, fracao_superior: float = 0.4) -> dict:
    """Volume de reservação. ocupacoes = {"escritorio": 120, "apartamento": 64, ...}.
    Tipos aceitos: apartamento, residencia, residencia_alto_padrao, residencia_popular, escritorio,
    escola_externato, escola_semi_internato, escola_internato, hospital, hotel_sem_cozinha,
    hotel_com_cozinha, restaurante, quartel, industria_uso_pessoal, cinema_teatro, templo, garagem,
    lavanderia, mercado, jardim."""
    desconhecidos = set(ocupacoes) - set(CONSUMO_PER_CAPITA)
    if desconhecidos:
        raise ValueError(f"Ocupações desconhecidas: {sorted(desconhecidos)}")
    res = dimensionar_reservatorio(list(ocupacoes.items()), dias_reserva, reserva_incendio_l, fracao_superior)
    return asdict(res)


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
