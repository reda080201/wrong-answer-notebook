import copy

import pytest

from tools.diagram_pipeline.pipeline import generation_input_hash, render, verify
from tools.diagram_pipeline.security import PipelineError, json_bytes, load_json


def test_changed_manifest_cannot_relabel_old_crop(reviewed, tmp_path):
    path, _ = reviewed
    render(path, tmp_path / "rendered")
    generated = tmp_path / "rendered/manifest.json"
    manifest = load_json(generated)
    altered = copy.deepcopy(manifest)
    altered["figures"][0]["crop"]["width"] = .75
    changed = generated.with_name("altered.json")
    changed.write_bytes(json_bytes(altered))
    with pytest.raises(PipelineError, match="Generation inputs changed"):
        verify(changed)
    # Even a rewritten declaration cannot make pixels from the wrong source ROI pass.
    altered["figures"][0]["result"]["generationInputHash"] = generation_input_hash(altered["sources"][0], altered["figures"][0])
    changed.write_bytes(json_bytes(altered))
    with pytest.raises(PipelineError, match="source region"):
        verify(changed)
