"""Prints the graph the OKF reference generator builds for a bundle, as JSON.

Usage: python -I reference-graph.py <path to the OKF repository's src/> <bundle dir>

Called by vendor-okf-fixtures.mjs. It needs PyYAML. Only the reference's
viewer generator and document parser are loaded: the packages around them
import an agent framework this has no use for, so they are stood in for by
empty modules that only say where their files are.
"""

import importlib
import json
import sys
import types
from pathlib import Path

src = Path(sys.argv[1]).resolve()
bundle = Path(sys.argv[2]).resolve()

for name in ("reference_agent", "reference_agent.bundle", "reference_agent.viewer"):
    module = types.ModuleType(name)
    module.__path__ = [str(src.joinpath(*name.split(".")))]
    sys.modules[name] = module

sys.path.insert(0, str(src))
generator = importlib.import_module("reference_agent.viewer.generator")

graph = generator._build_graph(generator._walk_concepts(bundle))
json.dump(graph, sys.stdout, default=str)
