#!/usr/bin/env python3
"""
Build the classification prompt mirroring src-tauri/src/commands/classify.rs
build_classification_prompt verbatim. Output stdout = the prompt text.

Usage:
  build_prompt.py <strategy: A|B|C|D> > prompt.txt

The 4 strategies differ only in the `instructions` field of each item:
  A: omit `instructions` entirely
  B: first 500 chars of body
  C: first 1500 chars of body
  D: full body
"""
import sys
import json
from pathlib import Path

HERE = Path(__file__).parent
SKILLS_DIR = Path.home() / ".claude" / "skills"

# Same icon list as a reasonable subset for the test
AVAILABLE_ICONS = [
    "Code", "Database", "Globe", "Server", "Sparkles",
    "Search", "FileText", "Image", "Settings", "Wrench",
    "Brain", "Palette", "Box", "MessageCircle", "Mic",
]

def load_sample():
    with open(HERE / "sample_ids.json") as f:
        return json.load(f)


def parse_skill_md(path: Path):
    """Inline copy of extract.py parser (avoid subprocess)."""
    import re
    text = path.read_text(encoding="utf-8", errors="replace")
    if not text.startswith("---\n"):
        return {"name": path.parent.name, "description": "", "body": text}
    rest = text[4:]
    end_idx = rest.find("\n---\n")
    if end_idx == -1:
        return {"name": path.parent.name, "description": "", "body": text}
    fm = rest[:end_idx]
    body = rest[end_idx + 5:]
    name = path.parent.name
    description = ""
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
                block = []
                i += 1
                while i < len(lines):
                    nxt = lines[i]
                    if nxt.startswith(" ") or nxt.startswith("\t") or nxt == "":
                        if nxt.strip() == "" and not block:
                            i += 1
                            continue
                        block.append(nxt.strip())
                        i += 1
                    else:
                        break
                description = " ".join(b for b in block if b).strip()
                continue
            else:
                description = v.strip('"').strip("'")
                i += 1
                continue
        i += 1
    return {"name": name, "description": description, "body": body.strip()}


def build_item(sid: str, strategy: str):
    """Build one ClassifyItem dict matching Rust struct fields."""
    parsed = parse_skill_md(SKILLS_DIR / sid / "SKILL.md")
    item = {
        "id": sid,
        "name": parsed["name"],
        "description": parsed["description"],
    }
    if strategy == "A":
        pass  # omit instructions
    elif strategy == "B":
        item["instructions"] = parsed["body"][:500]
    elif strategy == "C":
        item["instructions"] = parsed["body"][:1500]
    elif strategy == "D":
        item["instructions"] = parsed["body"]
    else:
        raise ValueError(f"unknown strategy: {strategy}")
    return item


# Mirror the prompt exactly. classify.rs:89-189
PROMPT_TEMPLATE = """You are an expert classifier for Claude Code tools (Skills and MCP Servers).

## Philosophy
**Primary Goal**: ENTROPY REDUCTION - fewer, meaningful categories and tags that are consistently reused.
**Secondary Goal**: SEMANTIC ACCURACY - classifications must accurately represent the tool's function.

---

## CATEGORY DECISION FRAMEWORK

### Step 1: Evaluate Quality of Existing Categories
Before using any existing category, check if it's VALID:

**INVALID categories (never use these):**
- Repeated characters: "aaa", "111", "xxx", "bbb"
- Keyboard patterns: "asdf", "qwerty", "zxcv"
- Placeholders: "test", "temp", "todo", "foo", "bar", "misc", "stuff", "sample"
- Pure numbers: "123", "2024", "456"
- Single characters: "a", "x", "1"
- Meaningless: any string that doesn't describe a functional domain

**VALID categories have:**
- Meaningful name describing a functional domain
- Proper capitalization (Title Case)
- 1-3 words maximum

### Step 2: Match or Create

| Situation | Action |
|-----------|--------|
| A VALID existing category fits well | USE IT |
| A VALID existing category is close enough | USE IT (prefer consistency) |
| Only INVALID categories exist | CREATE a new meaningful one |
| No category covers this domain | CREATE a new one |

### Step 3: Consider Sub-categories (Optional)
When a root category is broad enough that splitting by sub-domain genuinely helps users find things (e.g. `category: "Frontend"`, `parent_category: "Development"`), set `parent_category` to the root name. Otherwise leave `parent_category` unset and the category stays at root. Only one level of nesting is supported (root → child); never use an existing sub-category as `parent_category`.

### Standard Categories (use these when applicable)
- **Development**: coding tools, git, testing, debugging, code generation
- **Database**: SQL, NoSQL, data storage, queries
- **Web**: HTTP, APIs, web scraping, browsers
- **DevOps**: deployment, CI/CD, containers, infrastructure
- **AI**: machine learning, LLMs, embeddings, RAG
- **Research**: search, analysis, information gathering
- **Writing**: documentation, content, markdown
- **Design**: UI/UX, graphics, styling
- **Communication**: messaging, email, notifications
- **Productivity**: automation, workflow, organization

### Existing Categories to Evaluate
{categories_list}

---

## TAG DECISION FRAMEWORK

### Tag Quality Rules
A VALID tag is:
- Single lowercase English word (e.g., `python`, `api`, `testing`)
- Specific enough to filter (not `tool`, `code`, `utility`)
- General enough to reuse (not `reactusestate`, `gitrebase`)

**INVALID tags (never use):**
- Hyphenated: `api-testing`, `code-review`
- Multi-word: `machine learning`
- Too broad: `tool`, `code`, `utility`, `helper`, `stuff`
- Too narrow: `reacthooks`, `flaskrouting`, `gitrebase`
- Non-words: `xyz`, `aaa`, `test123`, `asdf`

### Tag Assignment Rules
- **Quantity**: 1-2 tags only (prefer 1 if it captures the essence)
- **First tag**: Primary technology or function (git, python, sql, testing)
- **Second tag**: Only if it adds distinct value not covered by first
- **Reuse**: If a VALID existing tag fits, USE IT instead of creating synonym

### Existing Tags to Evaluate
{tags_list}

---

## ICON SELECTION

Choose from: {icons_list}

Select the icon that best represents the PRIMARY function.

---

## Items to Classify

{items_json}

---

Return ONLY valid JSON with classifications."""


def build_prompt(items_json: str, categories_list: str, tags_list: str, icons_list: str) -> str:
    return PROMPT_TEMPLATE.format(
        categories_list=categories_list,
        tags_list=tags_list,
        icons_list=icons_list,
        items_json=items_json,
    )


def main():
    if len(sys.argv) < 2:
        print("Usage: build_prompt.py <A|B|C|D> [--first N]", file=sys.stderr)
        sys.exit(1)
    strategy = sys.argv[1]
    first_n = None
    if len(sys.argv) >= 4 and sys.argv[2] == "--first":
        first_n = int(sys.argv[3])
    sample = load_sample()
    if first_n is not None:
        sample = sample[:first_n]
    items = [build_item(sid, strategy) for sid in sample]
    items_json = json.dumps(items, ensure_ascii=False, indent=2)
    prompt = build_prompt(
        items_json=items_json,
        categories_list="(No existing categories)",
        tags_list="(No existing tags)",
        icons_list=", ".join(AVAILABLE_ICONS),
    )
    print(prompt)


if __name__ == "__main__":
    main()
