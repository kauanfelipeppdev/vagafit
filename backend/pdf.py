"""PDF no servidor com Chrome/Edge em modo headless: A4 exato e texto selecionável (bom para ATS),
sem depender do diálogo de impressão (onde dá para escolher "Microsoft Print to PDF" sem querer)."""
import asyncio
import html
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

STATIC = Path(__file__).resolve().parent.parent / "static"
FONTS = ("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:wght@400;600"
         "&family=IBM+Plex+Sans:wght@400;500;600&family=Lato:wght@400;700&family=Roboto:wght@400;500;700"
         "&family=Merriweather:wght@400;700&display=swap")
# sem scripts e sem rede além das fontes
CSP = ("default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; img-src data:")

BROWSERS = [
    os.getenv("CHROME_PATH", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


class PdfError(Exception):
    pass


def find_browser() -> str | None:
    for b in BROWSERS:
        if b and Path(b).exists():
            return b
    for name in ("google-chrome", "chromium", "chromium-browser", "chrome", "msedge"):
        if found := shutil.which(name):
            return found
    return None


def build_document(body_html: str, css_class: str, style: str, title: str) -> str:
    css = (STATIC / "templates.css").read_text(encoding="utf-8")
    return f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<title>{html.escape(title)}</title>
<link rel="stylesheet" href="{FONTS}">
<style>{css}
body {{ margin: 0; }} .paper {{ box-shadow: none; margin: 0; }}
mark.r-ph {{ background: none; color: inherit; }}</style></head>
<body><div class="{html.escape(css_class)}" style="{html.escape(style)}">{body_html}</div></body></html>"""


def _render(document: str) -> bytes:
    exe = find_browser()
    if not exe:
        raise PdfError("Chrome ou Edge não encontrado no servidor (defina CHROME_PATH no .env).")
    with tempfile.TemporaryDirectory(prefix="vagafit-pdf-", ignore_cleanup_errors=True) as tmp:
        tmp = Path(tmp)
        src, out = tmp / "doc.html", tmp / "doc.pdf"
        src.write_text(document, encoding="utf-8")
        try:
            subprocess.run(
                [exe, "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                 "--disable-extensions", f"--user-data-dir={tmp / 'perfil'}", "--no-pdf-header-footer",
                 "--virtual-time-budget=5000",  # dá tempo das fontes carregarem
                 f"--print-to-pdf={out}", src.as_uri()],
                capture_output=True, timeout=60,
            )
        except subprocess.TimeoutExpired as e:
            raise PdfError("O navegador demorou demais para gerar o PDF.") from e
        if not out.exists() or out.stat().st_size == 0:
            raise PdfError("O navegador não gerou o PDF.")
        return out.read_bytes()


async def html_to_pdf(document: str) -> bytes:
    return await asyncio.to_thread(_render, document)
