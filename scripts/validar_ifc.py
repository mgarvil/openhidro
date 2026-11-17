"""Valida um arquivo IFC gerado pelo OpenHidro com o IfcOpenShell (pip install ifcopenshell).

    python scripts/validar_ifc.py app/tests/saida/exemplo.ifc
"""
import sys

import ifcopenshell
import ifcopenshell.validate

f = ifcopenshell.open(sys.argv[1])
log = ifcopenshell.validate.json_logger()
ifcopenshell.validate.validate(f, log)
for k in ("IfcBuildingStorey", "IfcPipeSegment", "IfcPipeFitting", "IfcValve", "IfcSanitaryTerminal", "IfcTank", "IfcDistributionSystem"):
    print(f"{k}: {len(f.by_type(k))}")
erros = [s for s in log.statements]
print("erros de validação:", len(erros))
for s in erros[:20]:
    print(" -", s.get("message", s))
try:
    import ifcopenshell.geom
    st = ifcopenshell.geom.settings()
    n = 0
    for el in f.by_type("IfcProduct"):
        if el.Representation:
            ifcopenshell.geom.create_shape(st, el)
            n += 1
    print("geometrias processadas:", n)
except Exception as e:  # noqa: BLE001
    print("geometria:", e)
    sys.exit(1)
sys.exit(1 if erros else 0)
