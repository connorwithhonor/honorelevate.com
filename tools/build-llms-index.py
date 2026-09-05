#!/usr/bin/env python3
"""
Refresh the generated article index inside llms.txt from the posts on disk.

Why this exists (2026-09-05): llms.txt is what answer engines read to understand
what this site covers. It listed zero of the 91 published posts, so every one of
them was invisible to anything reading llms.txt instead of crawling the sitemap.

The blog uses 47 distinct category labels, most of them one-offs, so grouping by
category would fragment the index rather than organise it. A flat reverse-chron
list with the category on each line reads better and stays accurate.

Only the block between the two INDEX markers is rewritten. The hand-written
positioning prose is left alone.

Run from the repo root:  python tools/build-llms-index.py
Dry run:                 python tools/build-llms-index.py --dry-run
"""

import datetime as dt
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LLMS = ROOT / "llms.txt"
BLOG = ROOT / "blog"
BASE = "https://honorelevate.com"

START = "<!-- BEGIN GENERATED ARTICLE INDEX -->"
END = "<!-- END GENERATED ARTICLE INDEX -->"


def unescape(s: str) -> str:
    for a, b in (("&amp;", "&"), ("&mdash;", "—"), ("&ndash;", "–"),
                 ("&rsquo;", "'"), ("&#x27;", "'"), ("&quot;", '"'),
                 ("&trade;", "™"), ("&nbsp;", " "), ("&#8594;", "->")):
        s = s.replace(a, b)
    return s


def categories_from_index():
    """slug -> visible category label, taken from the cards already on the index."""
    src = (BLOG / "index.html").read_text(encoding="utf-8")
    out = {}
    for m in re.finditer(
        r"""href=['"]/blog/([^'"]+?)/?['"][^>]*>.*?<span class="blog-cat">([^<]*)</span>""",
        src, re.S,
    ):
        out[m.group(1)] = unescape(m.group(2).strip())
    return out


def post_meta(path: pathlib.Path, url: str, cat: str):
    s = path.read_text(encoding="utf-8", errors="ignore")
    m = re.search(r"<title>(.*?)</title>", s, re.S | re.I)
    if not m:
        return None
    title = unescape(re.sub(r"\s+", " ", m.group(1)).strip())
    title = re.split(r"\s*[|–]\s*HonorElevate", title)[0].strip()
    d = (re.search(r'"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})', s)
         or re.search(r'"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})', s))
    return {"title": title, "url": url, "date": d.group(1) if d else "", "cat": cat}


def collect():
    cats = categories_from_index()
    posts = []
    for d in sorted(BLOG.iterdir()):
        if d.is_dir() and (d / "index.html").exists():
            meta = post_meta(d / "index.html", f"{BASE}/blog/{d.name}/",
                             cats.get(d.name, ""))
            if meta:
                posts.append(meta)
    for f in sorted(BLOG.glob("*.html")):
        if f.name == "index.html" or (BLOG / f.stem).is_dir():
            continue
        meta = post_meta(f, f"{BASE}/blog/{f.stem}", cats.get(f.stem, ""))
        if meta:
            posts.append(meta)
    posts.sort(key=lambda p: p["date"] or "0000-00-00", reverse=True)
    return posts


def build_block(posts):
    lines = [
        START, "",
        "## Complete article index", "",
        f"Every published article on this site, {len(posts)} in total, newest "
        "first. Generated from the site itself, so it does not drift from what "
        "is actually live.", "",
    ]
    for p in posts:
        bits = " · ".join(x for x in (p["cat"], p["date"]) if x)
        suffix = f" ({bits})" if bits else ""
        lines.append(f"- [{p['title']}]({p['url']}){suffix}")
    lines += ["", END]
    return "\n".join(lines)


def main():
    dry = "--dry-run" in sys.argv
    posts = collect()
    block = build_block(posts)
    src = LLMS.read_text(encoding="utf-8")

    if START in src and END in src:
        out = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: block,
                     src, flags=re.S)
    else:
        anchor = "## Last updated"
        if anchor not in src:
            print("No '## Last updated' anchor; refusing to guess.", file=sys.stderr)
            return 1
        out = src.replace(anchor, block + "\n\n" + anchor, 1)

    out = re.sub(r"(## Last updated\s*\n\s*\n)\d{4}-\d{2}-\d{2}",
                 lambda m: m.group(1) + dt.date.today().isoformat(), out)

    uncategorised = sum(1 for p in posts if not p["cat"])
    print(f"indexed {len(posts)} posts ({uncategorised} with no category label)")
    if dry:
        print("dry run, nothing written")
        return 0
    LLMS.write_text(out, encoding="utf-8", newline="\n")
    print(f"wrote llms.txt ({len(out):,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
