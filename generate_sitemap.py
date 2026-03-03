import csv
from datetime import datetime
from pathlib import Path

BASE_URL = "https://streamsflix.net"  # change if your live domain differs
CSV_PATH = Path("streamflix-catalog-urls.csv")
SITEMAP_PATH = Path("sitemap.xml")
CATALOG_PATH = Path("catalog.html")


def read_urls():
  urls = []
  if not CSV_PATH.exists():
    raise SystemExit(f"CSV not found: {CSV_PATH}")
  with CSV_PATH.open(newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
      url = (row.get("url") or "").strip()
      if url:
        urls.append(url)
  # de-duplicate and sort
  return sorted(set(urls))


def generate_sitemap(urls):
  now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
  lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ]

  # Home page
  lines.append("  <url>")
  lines.append(f"    <loc>{BASE_URL}/</loc>")
  lines.append(f"    <lastmod>{now}</lastmod>")
  lines.append("    <changefreq>daily</changefreq>")
  lines.append("    <priority>1.0</priority>")
  lines.append("  </url>")

  for u in urls:
    lines.append("  <url>")
    lines.append(f"    <loc>{u}</loc>")
    lines.append(f"    <lastmod>{now}</lastmod>")
    lines.append("    <changefreq>weekly</changefreq>")
    lines.append("    <priority>0.8</priority>")
    lines.append("  </url>")

  lines.append("</urlset>")
  SITEMAP_PATH.write_text("\n".join(lines), encoding="utf-8")
  print(f"Wrote {SITEMAP_PATH} ({len(urls)} URLs)")


def generate_catalog_html(urls):
  items = []
  for u in urls:
    label = u.replace(BASE_URL, "").lstrip("/") or "/"
    items.append(f'      <li><a href="{u}">{label}</a></li>')

  html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>StreamFlix Catalog - All Watch URLs</title>
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="{BASE_URL}/catalog.html">
</head>
<body>
  <h1>StreamFlix Catalog</h1>
  <p>All known watch URLs (movies and TV shows) on StreamFlix.</p>
  <ul>
{chr(10).join(items)}
  </ul>
</body>
</html>
"""
  CATALOG_PATH.write_text(html, encoding="utf-8")
  print(f"Wrote {CATALOG_PATH} ({len(urls)} links)")


def main():
  urls = read_urls()
  if not urls:
    raise SystemExit("No URLs found in CSV")
  generate_sitemap(urls)
  generate_catalog_html(urls)


if __name__ == "__main__":
  main()

