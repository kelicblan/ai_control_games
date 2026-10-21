"""Preserve and audit user-supplied references; no model generation or source-file edits."""
import hashlib
import json
import shutil
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "模型" / "新地图原型"
PACK = SOURCE / "world_art_pack"
DEST = ROOT / "native" / "ArtSource" / "new-world-20261017"
DOC = "一寨之主_地图风格与三维世界构建说明.docx"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def preserve(source, destination):
    data = source.read_bytes()
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if sha(destination.read_bytes()) != sha(data):
            raise ValueError(f"Refusing to overwrite changed reference: {destination}")
    else:
        shutil.copyfile(source, destination)
    if sha(destination.read_bytes()) != sha(data):
        raise ValueError(f"Copy verification failed: {destination}")
    return {"source": str(source), "file": destination.relative_to(DEST).as_posix(), "sha256": sha(data), "bytes": len(data)}


def main():
    if Path.cwd().resolve() != ROOT:
        raise ValueError("Run from the current Unity checkout")
    manifest = json.loads((PACK / "asset_manifest.json").read_text(encoding="utf-8"))
    images = []
    for entry in manifest["assets"]:
        source = (PACK / entry["relative_path"]).resolve()
        if not source.is_relative_to(PACK.resolve()):
            raise ValueError("Reference escapes source pack")
        data = source.read_bytes()
        if sha(data) != entry["sha256"] or len(data) != entry["bytes"]:
            raise ValueError(f"Source manifest mismatch: {entry['relative_path']}")
        images.append({**entry, "preserved": preserve(source, DEST / "reference-pack" / entry["relative_path"])})
    if len(images) != 23:
        raise ValueError("Expected the full set of 23 supplied images")
    preserve(PACK / "README.md", DEST / "reference-pack" / "README.md")
    preserve(PACK / "asset_manifest.json", DEST / "reference-pack" / "asset_manifest.json")
    for item in manifest["documents"]:
        preserve(PACK / item["relative_path"], DEST / "reference-pack" / item["relative_path"])
    doc = preserve(SOURCE / DOC, DEST / DOC)
    if doc["sha256"] != sha((PACK / "05_documents" / DOC).read_bytes()):
        raise ValueError("Root document and packaged document differ")
    selected = preserve(SOURCE / "一寨之主初始地图.png", DEST / "selected-world-map.png")
    matches = [a for a in images if a["sha256"] == selected["sha256"]]
    if len(matches) != 1:
        raise ValueError("Selected map does not uniquely match supplied image set")
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    text = []
    with zipfile.ZipFile(SOURCE / DOC) as archive:
        for part in archive.namelist():
            if part != "word/document.xml" and not (part.startswith(("word/header", "word/footer", "word/footnotes", "word/endnotes", "word/comments")) and part.endswith(".xml")):
                continue
            text.append("PART: " + part)
            tree = ET.fromstring(archive.read(part))
            for number, p in enumerate(tree.findall(".//w:p", ns), 1):
                value = "".join(t.text or "" for t in p.findall(".//w:t", ns))
                if value.strip():
                    text.append(f"{number:03d} {value}")
        media = [name for name in archive.namelist() if name.startswith("word/media/")]
        for name in media:
            target = DEST / "document-media" / Path(name).name
            target.parent.mkdir(parents=True, exist_ok=True)
            data = archive.read(name)
            if target.exists() and sha(target.read_bytes()) != sha(data):
                raise ValueError("Embedded media changed")
            target.write_bytes(data)
    (DEST / "document-full-text.txt").write_text("\n".join(text) + "\n", encoding="utf-8")
    result = {
        "schema": "campmind-new-world-reference-intake-v1",
        "selectedMap": selected,
        "selectedMapPackPath": matches[0]["relative_path"],
        "selectedBy": "User explicitly identifies the attached image as the new world map; attachment SHA256 was verified against the source initial-map file.",
        "originalPackMaster": manifest["master_reference"],
        "priorityConflictResolution": "User-selected painterly-v1 is the final visual authority. Preserve original package labels as provenance only; P1 detail shapes remain subordinate to this selected map.",
        "document": doc,
        "documentTextLines": len(text),
        "embeddedMediaCount": len(media),
        "images": images,
        "imageCount": len(images),
        "engine": "Existing Unity desktop project; Three.js examples are explanatory source material, not an instruction to migrate engines.",
        "oldCharacters": "Retain the 10 existing rigged characters and animations from the verified retained asset pack.",
        "oldEnvironmentPolicy": "No old placement coordinates or terrain; assess old non-character assets against new references and replace unsuitable assets.",
        "newPaidGeneration": False,
        "visualAccepted": False,
    }
    (DEST / "intake.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"directory": str(DEST), "verifiedImages": len(images), "selectedMap": matches[0]["relative_path"], "documentTextLines": len(text), "embeddedMedia": len(media), "newPaidGeneration": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
