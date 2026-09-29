"""Punto de entrada de la aplicación Songweft."""

import runpy
import sys
from pathlib import Path


SOURCE_DIR = Path(__file__).resolve().parent / "src"
sys.path.insert(0, str(SOURCE_DIR))

runpy.run_path(
    str(SOURCE_DIR / "dashboard.py"),
    run_name="__main__",
)
