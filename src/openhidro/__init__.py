"""OpenHidro — software livre de projeto hidrossanitário (NBR 5626 / NBR 8160)."""
from .calculo import dimensionar_agua_fria, dimensionar_esgoto  # noqa: F401
from .modelo import No, Rede, Trecho  # noqa: F401

__version__ = "0.9.1"
