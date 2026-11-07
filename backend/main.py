"""VagaFit — API. Rode com:  uvicorn backend.main:app --reload"""
import io
import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pypdf import PdfReader

load_dotenv()

from . import db, matching, pdf, prompts, scoring  # noqa: E402
from .llm import LLMError, ask_json  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
app = FastAPI(title="VagaFit")
db.init()

MAX_UPLOAD = 5 * 1024 * 1024


@app.exception_handler(LLMError)
async def llm_error(_req: Request, exc: LLMError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(pdf.PdfError)
async def pdf_error(_req: Request, exc: pdf.PdfError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


# ---------- modelos ----------
class ResumeIn(BaseModel):
    curriculo: dict
    refazer: bool = False  # ignora o cache e pede outra resposta à IA


class TailorIn(BaseModel):
    curriculo: dict
    vaga: str
    pais: str = "br"
    palavras_chave: list[str] | None = None  # recalcular % com as palavras que a IA já extraiu
    refazer: bool = False


class PdfIn(BaseModel):
    html: str
    classe: str = "paper"
    estilo: str = ""
    titulo: str = "curriculo"


class CoverIn(BaseModel):
    curriculo: dict
    vaga: str
    empresa: str = ""
    tom: str = "profissional"


class TextIn(BaseModel):
    texto: str


# ---------- currículo ----------
def pdf_to_text(data: bytes) -> tuple[str, str]:
    """Texto do PDF + o programa que gerou (para explicar PDFs sem texto)."""
    reader = PdfReader(io.BytesIO(data))
    producer = str((reader.metadata or {}).get("/Producer", ""))
    return "\n".join((p.extract_text() or "") for p in reader.pages).strip(), producer


@app.post("/api/curriculo/importar")
async def importar(arquivo: UploadFile = File(...)):
    """Recebe PDF ou TXT e devolve o currículo estruturado."""
    data = await arquivo.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Arquivo maior que 5 MB")
    name = (arquivo.filename or "").lower()
    producer = ""
    if name.endswith(".pdf"):
        texto, producer = pdf_to_text(data)
    elif name.endswith(".txt"):
        texto = data.decode("utf-8", errors="ignore")
    else:
        raise HTTPException(415, "Envie PDF ou TXT")
    if len(texto) < 50:
        if "print to pdf" in producer.lower():
            raise HTTPException(422, "Este PDF foi gerado pela impressora “Microsoft Print to PDF”, que transforma o texto "
                                     "em desenho: nenhum sistema consegue ler (nem o ATS das empresas). Gere de novo "
                                     "escolhendo o destino “Salvar como PDF” no diálogo de impressão, ou use “Colar texto”.")
        raise HTTPException(422, "Não consegui ler texto do PDF (é imagem escaneada?). Cole o texto manualmente.")
    return await ask_json(prompts.PARSE_SYSTEM, texto[:15000], temperature=0)


@app.post("/api/curriculo/importar-texto")
async def importar_texto(body: TextIn):
    if len(body.texto.strip()) < 50:
        raise HTTPException(422, "Texto muito curto")
    return await ask_json(prompts.PARSE_SYSTEM, body.texto[:15000], temperature=0)


@app.post("/api/curriculo/nota")
async def nota(body: ResumeIn):
    """Nota 0–100 = média dos critérios da IA menos penalidades determinísticas."""
    r = body.curriculo
    issues = scoring.checks(r)
    user = (
        f"CURRÍCULO (JSON):\n{json.dumps(r, ensure_ascii=False)}\n\n"
        f"CAMPOS EDITÁVEIS (caminho: texto atual):\n{scoring.editable_view(r)}\n\n"
        "PROBLEMAS JÁ DETECTADOS AUTOMATICAMENTE (não repita, vá além):\n"
        + ("\n".join(f"- {i['secao']}: {i['problema']}" for i in issues) or "- nenhum")
    )
    ai = await ask_json(prompts.SCORE_SYSTEM, user, temperature=0.2, refresh=body.refazer)
    criterios = ai.get("criterios") if isinstance(ai.get("criterios"), dict) else {}
    criterios = {k: criterios.get(k) for k in scoring.WEIGHTS}
    return {
        "nota": scoring.final_score(criterios, issues),
        "criterios": criterios,
        "veredito": ai.get("veredito", ""),
        "primeira_impressao": ai.get("primeira_impressao", ""),
        "pontos_fortes": ai.get("pontos_fortes") or [],
        "alertas": ai.get("alertas") or [],
        "secoes": scoring.clean_sections(r, ai.get("secoes")),
        "checagens": issues,
    }


# ---------- adaptação à vaga ----------
@app.post("/api/adaptar")
async def adaptar(body: TailorIn):
    if len(body.vaga.strip()) < 80:
        raise HTTPException(422, "Cole a descrição completa da vaga")
    pais = prompts.COUNTRY_HINTS.get(body.pais, prompts.COUNTRY_HINTS["br"])
    user = (
        f"PADRÃO DO PAÍS: {pais}\n\n"
        f"VAGA:\n{body.vaga[:8000]}\n\n"
        f"CURRÍCULO (JSON):\n{json.dumps(body.curriculo, ensure_ascii=False)}"
    )
    ai = await ask_json(prompts.TAILOR_SYSTEM, user, temperature=0.4, refresh=body.refazer)

    keywords = ai.get("palavras_chave_vaga") or matching.extract_keywords_fallback(body.vaga)
    adaptado = matching.enforce_facts(body.curriculo, ai.get("curriculo") or body.curriculo)
    return {
        "curriculo": adaptado,
        "palavras_chave": keywords,
        "antes": matching.compatibility(body.curriculo, keywords),
        "depois": matching.compatibility(adaptado, keywords),
        "mudancas": ai.get("mudancas", []),
        "lacunas": ai.get("lacunas", []),
    }


@app.post("/api/compatibilidade")
async def compatibilidade(body: TailorIn):
    """Só calcula o % (sem IA) — útil pra mostrar ao vivo enquanto a pessoa cola a vaga."""
    kws = body.palavras_chave or matching.extract_keywords_fallback(body.vaga)
    return {"palavras_chave": kws, **matching.compatibility(body.curriculo, kws)}


@app.post("/api/carta")
async def carta(body: CoverIn):
    user = (
        f"TOM: {body.tom}\nEMPRESA: {body.empresa or '(ver vaga)'}\n\n"
        f"VAGA:\n{body.vaga[:8000]}\n\nCURRÍCULO:\n{json.dumps(body.curriculo, ensure_ascii=False)}"
    )
    return await ask_json(prompts.COVER_SYSTEM, user, temperature=0.6, cache=False)


# ---------- PDF ----------
@app.post("/api/pdf")
async def gerar_pdf(body: PdfIn):
    """Recebe o HTML do papel (já renderizado no front) e devolve um PDF A4 com texto selecionável."""
    if len(body.html) > 500_000:
        raise HTTPException(413, "Documento grande demais")
    data = await pdf.html_to_pdf(pdf.build_document(body.html, body.classe, body.estilo, body.titulo))
    return Response(data, media_type="application/pdf")


# ---------- candidaturas ----------
@app.get("/api/candidaturas")
def listar():
    return db.list_all()


@app.post("/api/candidaturas")
def criar(data: dict):
    if not data.get("empresa") or not data.get("cargo"):
        raise HTTPException(422, "empresa e cargo são obrigatórios")
    return db.create(data)


@app.patch("/api/candidaturas/{id_}")
def atualizar(id_: int, data: dict):
    try:
        row = db.update(id_, data)
    except ValueError as e:
        raise HTTPException(422, str(e))
    if not row:
        raise HTTPException(404)
    return row


@app.delete("/api/candidaturas/{id_}")
def remover(id_: int):
    if not db.delete(id_):
        raise HTTPException(404)
    return {"ok": True}


# ---------- front ----------
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")
