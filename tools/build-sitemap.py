#!/usr/bin/env python3
"""
Rebuild honorelevate.com/sitemap.xml from what is actually on disk.

Why this exists (2026-09-05): the hand-maintained sitemap listed 12 URLs while
91 blog posts existed in blog/. Roughly 79 posts were reachable only by clicking
through the blog index. Hand-editing a sitemap alongside a growing blog drifts
every single time, so the sitemap is now generated from the filesystem.

URL shapes are chosen to match what Netlify actually serves, which is also what
each post's canonical declares:

  blog/<slug>/index.html  ->  /blog/<slug>/     (trailing slash 200; bare 301s to it)
  blog/<slug>.html        ->  /blog/<slug>      (bare 200; trailing slash 301s to it)

lastmod comes from each post's own JSON-LD dateModified, falling back to
datePublished, falling back to the file mtime.

Run from the repo root:  python tools/build-sitemap.py
Then verify:             python tools/build-sitemap.py --check
"""

import datetime as dt
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://honorelevate.com"

# Top-level pages, in the order they should appear. (path, priority, changefreq)
STATIC_PAGES = [
    ("/", "1.0", "weekly"),
    ("/blog/", "0.9", "daily"),
    ("/privacy-policy", "0.3", "yearly"),
    ("/terms-of-service", "0.3", "yearly"),
]

DATE_RE = re.compile(r'"date(?:Modified|Published)"\s*:\s*"(\d{4}-\d{2}-\d{2})')


def post_date(path: pathlib.Path) -> str:
    """dateModified wins, then datePublished, then file mtime."""
    try:
        html = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        html = ""
    modified = re.search(r'"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})', html)
    if modified:
        return modified.group(1)
    published = re.search(r'"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})', html)
    if published:
        return published.group(1)
    return dt.date.fromtimestamp(path.stat().st_mtime).isoformat()


def collect_posts():
    """Every blog post on disk, as (url, lastmod), newest first."""
    blog = ROOT / "blog"
    posts = []

    for d in sorted(blog.iterdir()):
        if d.is_dir() and (d / "index.html").exists():
            posts.append((f"{BASE}/blog/{d.name}/", post_date(d / "index.html")))

    for f in sorted(blog.glob("*.html")):
        if f.name == "index.html":
            continue
        # A .html twin of an existing directory would be a duplicate URL.
        if (blog / f.stem).is_dir():
            print(f"  SKIP (directory twin exists): blog/{f.name}", file=sys.stderr)
            continue
        posts.append((f"{BASE}/blog/{f.stem}", post_date(f)))

    posts.sort(key=lambda p: p[1], reverse=True)
    return posts


def build_xml(posts):
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    today = dt.date.today().isoformat()

    for path, priority, freq in STATIC_PAGES:
        out += [
            "  <url>",
            f"    <loc>{BASE}{path}</loc>",
            f"    <lastmod>{today}</lastmod>",
            f"    <changefreq>{freq}</changefreq>",
            f"    <priority>{priority}</priority>",
            "  </url>",
        ]

    for url, lastmod in posts:
        out += [
            "  <url>",
            f"    <loc>{url}</loc>",
            f"    <lastmod>{lastmod}</lastmod>",
            "    <changefreq>monthly</changefreq>",
            "    <priority>0.7</priority>",
            "  </url>",
        ]

    out.append("</urlset>")
    return "\n".join(out) + "\n"


def main():
    check_only = "--check" in sys.argv
    posts = collect_posts()
    xml = build_xml(posts)
    target = ROOT / "sitemap.xml"

    if check_only:
        current = target.read_text(encoding="utf-8") if target.exists() else ""
        if current == xml:
            print(f"sitemap.xml is current: {len(posts)} posts + {len(STATIC_PAGES)} pages")
            return 0
        print("sitemap.xml is STALE. Run: python tools/build-sitemap.py", file=sys.stderr)
        return 1

    target.write_text(xml, encoding="utf-8", newline="\n")
    print(f"Wrote sitemap.xml: {len(posts)} blog posts + {len(STATIC_PAGES)} pages "
          f"= {len(posts) + len(STATIC_PAGES)} URLs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
