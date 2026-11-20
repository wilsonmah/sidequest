"""Build the static GitHub Pages demo: python scripts/build_demo.py [output_dir]

The landing page becomes index.html and the app becomes app.html, backed by demo/demo-api.js,
which answers the app's /api/ calls in the browser. Links are made relative so the site works
under a project path such as https://<user>.github.io/sidequest/.
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST, DEMO = ROOT / "dist", ROOT / "demo"
LINKS = {'href="/signup?plan=pro"': 'href="app.html"', 'href="/signup"': 'href="app.html"', 'href="/login"': 'href="app.html"',
         'href="/privacy"': 'href="privacy.html"', 'href="/terms"': 'href="terms.html"', 'href="/"': 'href="./"'}


def page(source, target, extra=()):
    html = (DIST / source).read_text(encoding="utf-8")
    for old, new in [*LINKS.items(), *extra]:
        html = html.replace(old, new)
    leftover = [part.split('"')[0] for part in html.split('href="/')[1:]]
    if leftover:
        raise SystemExit(f"{source}: absolute links left after rewriting: {leftover}")
    (OUT / target).write_text(html, encoding="utf-8")


OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "_site").resolve()
# The output folder is deleted and rebuilt, so it must be a subfolder of the repository.
if ROOT not in OUT.parents:
    raise SystemExit(f"Refusing to build into {OUT}: choose a folder inside {ROOT}")
shutil.rmtree(OUT, ignore_errors=True)
OUT.mkdir(parents=True)
for name in ("style.css", "site.css", "app.js", "auth.js", "robots.txt"):
    shutil.copy2(DIST / name, OUT / name)
for name in ("demo-api.js", "demo.css"):
    shutil.copy2(DEMO / name, OUT / name)

page("landing.html", "index.html", [("<title>SideQuest — ", "<title>SideQuest demo — ")])
page("index.html", "app.html", [('<script src="app.js" defer></script>',
                                 '<link rel="stylesheet" href="demo.css"><script src="demo-api.js" defer></script><script src="app.js" defer></script>')])
page("privacy.html", "privacy.html")
page("terms.html", "terms.html")
(OUT / ".nojekyll").write_text("", encoding="utf-8")
print(f"Demo built in {OUT}")
