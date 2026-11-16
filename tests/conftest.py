import importlib.util
import sys
from pathlib import Path

# permite importar exemplos/gerar_dxf_exemplo.py como "exemplos_gerar"
_p = Path(__file__).parent.parent / "exemplos" / "gerar_dxf_exemplo.py"
_spec = importlib.util.spec_from_file_location("exemplos_gerar", _p)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
sys.modules["exemplos_gerar"] = _mod
