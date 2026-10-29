from pathlib import Path

from PIL import Image

from asana_guide_generator import Capture, annotate_screenshot, build_pdf

out = Path("smoke_output")
out.mkdir(exist_ok=True)
raw = out / "raw.png"
annotated = out / "annotated.png"
pdf = out / "smoke_guide.pdf"

Image.new("RGB", (1920, 1080), "#F7F8FA").save(raw)
annotate_screenshot(
    raw,
    annotated,
    [{"box": [820, 320, 240, 64], "label": "Choose Project"}],
)
build_pdf(
    [Capture(1, "Choose a project", "Select Project to create a shared place for related work.", annotated)],
    pdf,
    "Asana guide smoke test",
)
assert annotated.exists() and annotated.stat().st_size > 0
assert pdf.exists() and pdf.stat().st_size > 0
print(f"annotation={annotated.stat().st_size} bytes")
print(f"pdf={pdf.stat().st_size} bytes")
