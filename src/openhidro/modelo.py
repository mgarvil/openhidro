"""Modelo de dados: rede em árvore formada por nós e trechos.

Convenções
----------
* Unidades: metros (coordenadas, comprimentos), mm (diâmetros), L/s, kPa.
* Água fria: o trecho vai de montante (``de``, lado do reservatório) para
  jusante (``para``, lado dos pontos de utilização).
* Esgoto: o trecho vai no sentido do escoamento — ``de`` é o lado do aparelho,
  ``para`` é o lado do coletor/saída.
"""
from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class No:
    id: str
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    tipo: str = "juncao"           # reservatorio | ponto | juncao | caixa_sifonada | caixa_inspecao | saida
    aparelho: str | None = None    # chave da tabela de aparelhos (AF ou ES)
    quantidade: float = 1.0        # nº de aparelhos iguais neste nó (ou metros de mictório calha)
    rotulo: str = ""


@dataclass
class Trecho:
    id: str
    de: str
    para: str
    comprimento: float | None = None        # m; None = calcular pelas coordenadas
    conexoes: dict[str, int] = field(default_factory=dict)  # peça -> quantidade
    dn: int | None = None                   # DN imposto pelo projetista
    tipo: str | None = None                 # esgoto: ramal_descarga | ramal_esgoto | tubo_queda | subcoletor | coletor
    declividade: float | None = None        # esgoto (m/m); None = calcular por z
    rotulo: str = ""


@dataclass
class Rede:
    sistema: str                     # "agua_fria" | "esgoto"
    nos: dict[str, No] = field(default_factory=dict)
    trechos: dict[str, Trecho] = field(default_factory=dict)
    nome: str = ""
    parametros: dict[str, Any] = field(default_factory=dict)

    # ------------------------------------------------------------------ build
    def add_no(self, no: No) -> No:
        if no.id in self.nos:
            raise ValueError(f"Nó duplicado: {no.id}")
        self.nos[no.id] = no
        return no

    def add_trecho(self, t: Trecho) -> Trecho:
        if t.id in self.trechos:
            raise ValueError(f"Trecho duplicado: {t.id}")
        for n in (t.de, t.para):
            if n not in self.nos:
                raise ValueError(f"Trecho {t.id}: nó inexistente '{n}'")
        self.trechos[t.id] = t
        return t

    # -------------------------------------------------------------- geometry
    def comprimento(self, t: Trecho) -> float:
        """Comprimento do trecho. Sem valor informado: projeção horizontal +
        desnível (tubulação predial corre em planos horizontais e verticais)."""
        if t.comprimento is not None:
            return t.comprimento
        a, b = self.nos[t.de], self.nos[t.para]
        return math.hypot(b.x - a.x, b.y - a.y) + abs(b.z - a.z)

    # -------------------------------------------------------------- topology
    def filhos(self) -> dict[str, list[Trecho]]:
        """nó -> trechos que saem dele (de -> para)."""
        m: dict[str, list[Trecho]] = {n: [] for n in self.nos}
        for t in self.trechos.values():
            m[t.de].append(t)
        return m

    def entrada(self) -> dict[str, Trecho]:
        """nó -> único trecho que chega nele."""
        m: dict[str, Trecho] = {}
        for t in self.trechos.values():
            if t.para in m:
                raise ValueError(
                    f"O nó '{t.para}' recebe mais de um trecho ({m[t.para].id}, {t.id}); "
                    "a rede precisa ser uma árvore")
            m[t.para] = t
        return m

    # ------------------------------------------------------------------- I/O
    def to_dict(self) -> dict:
        return {
            "sistema": self.sistema,
            "nome": self.nome,
            "parametros": self.parametros,
            "nos": [asdict(n) for n in self.nos.values()],
            "trechos": [asdict(t) for t in self.trechos.values()],
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Rede":
        r = cls(sistema=d["sistema"], nome=d.get("nome", ""), parametros=d.get("parametros", {}))
        for n in d["nos"]:
            r.add_no(No(**n))
        for i, t in enumerate(d["trechos"]):
            t = dict(t)
            t.setdefault("id", f"T{i + 1}")
            r.add_trecho(Trecho(**t))
        return r

    def salvar(self, caminho: str | Path) -> None:
        Path(caminho).write_text(json.dumps(self.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")

    @classmethod
    def carregar(cls, caminho: str | Path) -> "Rede":
        return cls.from_dict(json.loads(Path(caminho).read_text(encoding="utf-8")))
