#!/usr/bin/env python3
"""
Extract frontmatter + body from a SKILL.md file.
Returns:
  name: str
  description: str (cleaned, single-line)
  body: str (everything after the closing --- of frontmatter)
"""
import sys
import os
import re
import json
from pathlib import Path

SKILLS_DIR = Path.home() / ".claude" / "skills"

def parse_skill_md(path: Path):
    text = path.read_text(encoding="utf-8", errors="replace")
    # Frontmatter: starts at line 1 with `---\n`, ends at next `\n---\n`
    if not text.startswith("---\n"):
        return {"name": path.parent.name, "description": "", "body": text}
    rest = text[4:]
    end_idx = rest.find("\n---\n")
    if end_idx == -1:
        return {"name": path.parent.name, "description": "", "body": text}
    fm = rest[:end_idx]
    body = rest[end_idx + 5:]  # skip past \n---\n
    # Extract name + description from frontmatter
    name = path.parent.name
    description = ""
    # Try YAML-ish parse: handle `name:` and `description:` (incl. > and | block scalars)
    lines = fm.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^name:\s*(.*)$", line)
        if m:
            name = m.group(1).strip().strip('"').strip("'")
            i += 1
            continue
        m = re.match(r"^description:\s*(.*)$", line)
        if m:
            v = m.group(1).strip()
            if v in (">", ">-", "|", "|-"):
                # Block scalar: gather indented lines
                block = []
                i += 1
                while i < len(lines):
                    nxt = lines[i]
                    if nxt.startswith(" ") or nxt.startswith("\t") or nxt == "":
                        # Indented content (treat as part of block)
                        if nxt.strip() == "" and not block:
                            i += 1
                            continue
                        block.append(nxt.strip())
                        i += 1
                    else:
                        # Top-level key — end of block
                        break
                description = " ".join(b for b in block if b).strip()
                continue
            else:
                # Inline value (may be quoted)
                description = v.strip('"').strip("'")
                i += 1
                continue
        i += 1
    # Strip surrounding whitespace from body
    body = body.strip()
    return {"name": name, "description": description, "body": body}


def main():
    if len(sys.argv) < 2:
        print("Usage: extract.py <skill-id> [<skill-id> ...] | --all-stats", file=sys.stderr)
        sys.exit(1)
    if sys.argv[1] == "--all-stats":
        out = []
        for d in sorted(SKILLS_DIR.iterdir()):
            if not d.is_dir():
                continue
            sm = d / "SKILL.md"
            if not sm.exists():
                continue
            parsed = parse_skill_md(sm)
            sz = sm.stat().st_size
            out.append({
                "id": d.name,
                "size_bytes": sz,
                "description_chars": len(parsed["description"]),
                "body_chars": len(parsed["body"]),
            })
        print(json.dumps(out, indent=2))
        return
    out = {}
    for sid in sys.argv[1:]:
        path = SKILLS_DIR / sid / "SKILL.md"
        if not path.exists():
            print(f"missing: {path}", file=sys.stderr)
            continue
        out[sid] = parse_skill_md(path)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
