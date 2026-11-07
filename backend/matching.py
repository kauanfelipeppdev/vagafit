"""Compatibilidade currículo x vaga, calculada de forma determinística (sem IA),
pra que o % seja consistente e explicável. A IA só ajuda a escolher as palavras-chave."""
import re
import unicodedata
from collections import Counter

STOPWORDS = set("""
a o os as um uma uns umas de do da dos das em no na nos nas por para pra com sem sob sobre entre
e ou que se ao aos à às é ser são será sera estar ter tem possuir como mais menos muito muita
seu sua seus suas nosso nossa você voce vocês voces ele ela eles elas isso essa esse esta este
the and or of to in on for with a an is are be will you your we our as at by from this that
experiencia experiência conhecimento conhecimentos vaga empresa trabalho atuar atuação area área
requisitos desejavel desejável diferencial diferenciais responsabilidades atividades buscamos
anos ano nivel nível bom boa forte capacidade habilidade habilidades equipe time
experience knowledge skills years team work job role strong ability requirements
""".split())

# termos com símbolos que o tokenizador normal quebraria
SPECIAL = ["c++", "c#", ".net", "node.js", "next.js", "vue.js", "react native", "power bi",
           "machine learning", "ci/cd", "rest api", "google ads", "meta ads", "pacote office"]


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def resume_to_text(r: dict) -> str:
    parts = [r.get("titulo", ""), r.get("resumo", "")]
    for e in r.get("experiencias", []) or []:
        parts += [e.get("cargo", ""), e.get("empresa", ""), *(e.get("bullets") or [])]
    for f in r.get("formacao", []) or []:
        parts += [f.get("curso", ""), f.get("instituicao", "")]
    for p in r.get("projetos", []) or []:
        parts += [p.get("nome", ""), p.get("descricao", "")]
    parts += r.get("habilidades", []) or []
    parts += r.get("certificacoes", []) or []
    parts += [i.get("idioma", "") for i in r.get("idiomas", []) or []]
    return "\n".join(str(p) for p in parts if p)


def contains_term(haystack_norm: str, term: str) -> bool:
    t = normalize(term).strip()
    if not t:
        return False
    # borda de palavra que funciona com termos tipo "c++" e ".net"
    pattern = r"(?<![a-z0-9])" + re.escape(t) + r"(?![a-z0-9])"
    return re.search(pattern, haystack_norm) is not None


def extract_keywords_fallback(job_text: str, limit: int = 20) -> list[str]:
    """Usado quando a IA não devolve palavras-chave: frequência simples + termos especiais."""
    norm = normalize(job_text)
    found = [s for s in SPECIAL if contains_term(norm, s)]
    tokens = re.findall(r"[a-z][a-z0-9+#.\-]{1,}", norm)
    counts = Counter(t.strip(".-") for t in tokens if t not in STOPWORDS and len(t) > 2)
    for word, _ in counts.most_common(limit * 2):
        if word not in found and not any(word in s for s in found):
            found.append(word)
        if len(found) >= limit:
            break
    return found


def compatibility(resume: dict, keywords: list[str]) -> dict:
    keywords = list(dict.fromkeys(k.strip() for k in keywords if k and k.strip()))
    if not keywords:
        return {"percentual": 0, "encontradas": [], "faltando": []}
    text = normalize(resume_to_text(resume))
    hit = [k for k in keywords if contains_term(text, k)]
    miss = [k for k in keywords if k not in hit]
    return {
        "percentual": round(100 * len(hit) / len(keywords)),
        "encontradas": hit,
        "faltando": miss,
    }


def enforce_facts(original: dict, tailored: dict) -> dict:
    """Garante que a IA não alterou fatos: empresa, cargo, datas e formação vêm do original."""
    out = dict(tailored)
    for key in ("nome", "email", "telefone", "local", "linkedin", "site"):
        out[key] = original.get(key, "")

    orig_exp = original.get("experiencias", []) or []
    new_exp = tailored.get("experiencias", []) or []
    fixed = []
    for i, oe in enumerate(orig_exp):
        ne = new_exp[i] if i < len(new_exp) else {}
        fixed.append({
            **oe,
            "bullets": ne.get("bullets") or oe.get("bullets", []),
        })
    out["experiencias"] = fixed
    out["formacao"] = original.get("formacao", [])
    out["certificacoes"] = original.get("certificacoes", [])
    out["idiomas"] = original.get("idiomas", [])
    return out
