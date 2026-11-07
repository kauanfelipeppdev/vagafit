"""Currículo e carta em Word (.docx), montados a partir do JSON — texto puro, coluna única, bom para ATS.
Segue a mesma personalização da aba "Aparência" (modelo, cor, fonte, tamanho, separadores, seções...)."""
import io
from datetime import date

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

SECTIONS = [("resumo", "Resumo"), ("experiencias", "Experiência"), ("formacao", "Formação"), ("habilidades", "Habilidades"),
            ("projetos", "Projetos"), ("idiomas", "Idiomas"), ("certificacoes", "Certificações")]
# espelha TPL_DEFAULTS e templates.css do front
TEMPLATES = {
    "classico": {"size": 10.5, "font": "Georgia", "accent": "1f2328", "center": True, "margin": 17,
                 "contato": "•", "habilidades": "·", "lista": "·", "rule": True},
    "moderno": {"size": 10, "font": "Calibri", "accent": "4338ca", "center": False, "margin": 17,
                "contato": "•", "habilidades": "·", "lista": "·", "rule": False},
    "compacto": {"size": 9, "font": "Calibri", "accent": "111111", "center": False, "margin": 13,
                 "contato": "|", "habilidades": "·", "lista": "·", "rule": True},
}
MARGINS = {"estreita": 11, "larga": 23}
# fontes da web viram equivalentes que existem em qualquer Word
FONT_MAP = {"inter": "Calibri", "ibm plex sans": "Calibri", "lato": "Calibri", "roboto": "Calibri", "arial": "Arial",
            "source serif 4": "Georgia", "merriweather": "Georgia", "georgia": "Georgia"}
LANG_FMT = {"parenteses": "{i} ({n})", "traco": "{i} — {n}", "dois-pontos": "{i}: {n}"}


def _font(css_stack: str, default: str) -> str:
    first = (css_stack or "").split(",")[0].strip().strip("'\"").lower()
    return FONT_MAP.get(first, default)


def _rgb(hex_color: str) -> RGBColor:
    h = (hex_color or "").lstrip("#")
    return RGBColor.from_string(h.upper()) if len(h) == 6 else RGBColor(0x1F, 0x23, 0x28)


def _bottom_border(paragraph, color: str):
    p_pr = paragraph._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    for k, v in {"w:val": "single", "w:sz": "6", "w:space": "1", "w:color": color}.items():
        bottom.set(qn(k), v)
    borders.append(bottom)
    p_pr.append(borders)


class _Writer:
    def __init__(self, tpl: str, c: dict):
        self.t = TEMPLATES.get(tpl, TEMPLATES["classico"])
        self.c = c
        self.doc = Document()
        self.size = self.t["size"] * (float(c.get("escala") or 100) / 100)
        self.accent = (c.get("cor") or "").lstrip("#") or self.t["accent"]
        self.font = _font(c.get("fonte", ""), self.t["font"])
        self.line = float(c.get("entrelinha") or 0) or (1.0 if tpl == "compacto" else 1.1)

        sec = self.doc.sections[0]
        sec.page_width, sec.page_height = Mm(210), Mm(297)
        m = Mm(MARGINS.get(c.get("margem"), self.t["margin"]))
        sec.left_margin = sec.right_margin = m
        sec.top_margin = sec.bottom_margin = Mm(MARGINS.get(c.get("margem"), self.t["margin"]) - 2)
        self.text_width = sec.page_width - sec.left_margin - sec.right_margin

        normal = self.doc.styles["Normal"]
        normal.font.name, normal.font.size = self.font, Pt(self.size)
        normal.element.rPr.rFonts.set(qn("w:eastAsia"), self.font)
        normal.paragraph_format.space_after = Pt(0)
        normal.paragraph_format.line_spacing = self.line

    def para(self, text="", *, size=None, bold=False, italic=False, color=None, align=None, after=0, before=0):
        p = self.doc.add_paragraph()
        if text:
            self.run(p, text, size=size, bold=bold, italic=italic, color=color)
        if align is not None:
            p.alignment = align
        p.paragraph_format.space_after, p.paragraph_format.space_before = Pt(after), Pt(before)
        return p

    def run(self, p, text, *, size=None, bold=False, italic=False, color=None):
        r = p.add_run(text)
        r.bold, r.italic = bold, italic
        if size:
            r.font.size = Pt(size)
        if color:
            r.font.color.rgb = _rgb(color)
        return r

    def joined(self, items: list[str], sep: str, align=None):
        """Lista com separador; "linha" = um item por linha."""
        if not items:
            return
        if sep == "linha":
            for it in items:
                self.para(it, align=align)
        else:
            glue = ", " if sep == "," else f" {sep if sep != 'tags' else '·'} "
            self.para(glue.join(items), align=align)

    def pick(self, key: str, default_key: str) -> str:
        v = self.c.get(key, "auto")
        return self.t[default_key] if v in (None, "", "auto") else v

    def heading(self, title: str):
        text = title.upper() if self.c.get("titulos", "maiusculas") != "normal" else title
        p = self.para(text, size=self.size * 1.05, bold=True, color=self.accent, before=self.size * 1.1, after=3)
        if self.t["rule"]:
            _bottom_border(p, "BBBBBB" if self.t is TEMPLATES["classico"] else self.accent)

    def bullet(self, text: str):
        marker = self.c.get("marcador", "•")
        p = self.para()
        if marker != "nenhum":
            p.paragraph_format.left_indent = Pt(self.size * 1.2)
            p.paragraph_format.first_line_indent = Pt(-self.size * 1.2)
            self.run(p, f"{marker}\t", color=self.accent)
            p.paragraph_format.tab_stops.add_tab_stop(Pt(self.size * 1.2))
        self.run(p, text)

    def item_head(self, left: str, dates: str):
        p = self.para(before=4)
        self.run(p, left, bold=True)
        if dates:
            p.paragraph_format.tab_stops.add_tab_stop(self.text_width, WD_TAB_ALIGNMENT.RIGHT)
            self.run(p, f"\t{dates}", size=self.size * 0.9, color="666666")


def resume_docx(r: dict, tpl: str = "classico", custom: dict | None = None) -> bytes:
    c = custom or {}
    w = _Writer(tpl, c)
    hdr = c.get("cabecalho", "auto")
    center = w.t["center"] if hdr == "auto" else hdr == "center"
    align = WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.LEFT

    w.para(r.get("nome") or "Seu nome", size=w.size * 2.1, bold=True, color=w.accent, align=align)
    if r.get("titulo"):
        w.para(r["titulo"], size=w.size * 1.15, align=align, after=2)
    contact = [r.get(k) for k in ("email", "telefone", "local", "linkedin", "site") if r.get(k)]
    w.joined(contact, w.pick("sepContato", "contato"), align=align)
    if w.t["rule"]:
        _bottom_border(w.doc.paragraphs[-1], w.accent)

    sep_dates = f" {c.get('sepDatas', '–')} "
    dates = lambda a, b: sep_dates.join(x for x in (a, b) if x)  # noqa: E731
    lang_fmt = LANG_FMT.get(c.get("idiomaFormato"), LANG_FMT["parenteses"])
    order = c.get("secoes") or [{"key": k, "titulo": t, "mostrar": True} for k, t in SECTIONS]
    default_title = dict(SECTIONS)

    for s in order:
        key = s.get("key")
        if not s.get("mostrar", True) or key not in default_title:
            continue
        title = (s.get("titulo") or "").strip() or default_title[key]
        if key == "resumo" and r.get("resumo"):
            w.heading(title)
            w.para(r["resumo"])
        elif key == "experiencias" and r.get("experiencias"):
            w.heading(title)
            for e in r["experiencias"]:
                w.item_head(" · ".join(x for x in (e.get("cargo"), e.get("empresa")) if x), dates(e.get("inicio"), e.get("fim")))
                if e.get("local"):
                    w.para(e["local"], italic=True, color="444444")
                for b in e.get("bullets") or []:
                    if b.strip():
                        w.bullet(b)
        elif key == "formacao" and r.get("formacao"):
            w.heading(title)
            for f in r["formacao"]:
                w.item_head(f.get("curso", ""), dates(f.get("inicio"), f.get("fim")))
                if f.get("instituicao"):
                    w.para(f["instituicao"], italic=True, color="444444")
        elif key == "habilidades" and r.get("habilidades"):
            w.heading(title)
            w.joined([x for x in r["habilidades"] if x], w.pick("sepHabilidades", "habilidades"))
        elif key == "projetos" and r.get("projetos"):
            w.heading(title)
            for p in r["projetos"]:
                para = w.para(after=2)
                w.run(para, p.get("nome", ""), bold=True)
                if p.get("descricao"):
                    w.run(para, f" — {p['descricao']}")
        elif key == "idiomas" and r.get("idiomas"):
            items = [lang_fmt.format(i=i["idioma"], n=i["nivel"]) if i.get("nivel") else i["idioma"]
                     for i in r["idiomas"] if i.get("idioma")]
            if items:
                w.heading(title)
                w.joined(items, w.pick("sepIdiomas", "lista"))
        elif key == "certificacoes" and r.get("certificacoes"):
            w.heading(title)
            w.joined([x for x in r["certificacoes"] if x], w.pick("sepCertificacoes", "lista"))
    return _save(w.doc)


def cover_docx(r: dict, carta: dict) -> bytes:
    w = _Writer("classico", {})
    w.doc.styles["Normal"].font.size = Pt(11)
    w.doc.styles["Normal"].paragraph_format.line_spacing = 1.3
    w.para(r.get("nome", ""), size=18, bold=True)
    w.para("  •  ".join(x for x in (r.get("email"), r.get("telefone"), r.get("local")) if x), size=9, color="555555", after=20)
    months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro",
              "novembro", "dezembro"]
    d = date.today()
    w.para(f"{d.day} de {months[d.month - 1]} de {d.year}", after=12)
    for text in [carta.get("saudacao", ""), *(carta.get("paragrafos") or []), carta.get("despedida", "")]:
        if text:
            w.para(text, after=10)
    w.para(r.get("nome", ""), bold=True)
    return _save(w.doc)


def _save(doc) -> bytes:
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
