"""Checagens determinísticas que complementam a nota da IA (rápidas e sempre iguais)."""
import json
import re

ACTION_VERBS = {
    "desenvolvi", "desenvolveu", "liderei", "criei", "implementei", "reduzi", "aumentei", "gerenciei",
    "otimizei", "automatizei", "coordenei", "projetei", "entreguei", "migrei", "construí", "construi",
    "conduzi", "estruturei", "lancei", "negociei", "treinei", "analisei", "elaborei", "atuei",
    "desenvolvimento", "implementação", "implementacao", "criação", "criacao", "gestão", "gestao",
    "developed", "led", "built", "created", "implemented", "reduced", "increased", "managed",
    "designed", "delivered", "launched", "automated", "optimized", "improved", "migrated",
}


def is_action(bullet: str) -> bool:
    w = bullet.split()[0].lower().strip(",.;:-•") if bullet.split() else ""
    # 1ª pessoa do pretérito (integrei, desenvolvi, construí), substantivos de ação (-ção) e inglês (-ed)
    return w in ACTION_VERBS or (len(w) > 4 and w.endswith(("ei", "i", "í", "ção", "cao", "ed")))


def checks(r: dict) -> list[dict]:
    issues = []

    def add(secao, msg, peso):
        issues.append({"secao": secao, "problema": msg, "peso": peso})

    if not r.get("email"):
        add("contato", "Sem e-mail de contato.", 15)
    if not r.get("telefone"):
        add("contato", "Sem telefone.", 5)
    if not r.get("linkedin"):
        add("contato", "Sem LinkedIn — recrutadores quase sempre olham.", 5)

    resumo = r.get("resumo", "") or ""
    words = len(resumo.split())
    if words == 0:
        add("resumo", "Sem resumo profissional.", 10)
    elif words > 90:
        add("resumo", f"Resumo longo ({words} palavras). Ideal: 40–80.", 4)

    exps = r.get("experiencias", []) or []
    bullets = [b for e in exps for b in (e.get("bullets") or []) if b.strip()]
    if not exps:
        add("experiencias", "Nenhuma experiência listada (inclua estágios, freelas ou projetos).", 15)
    elif bullets:
        with_numbers = sum(1 for b in bullets if re.search(r"\d", b))
        if with_numbers / len(bullets) < 0.3:
            add("experiencias",
                f"Só {with_numbers} de {len(bullets)} bullets têm números. Quantifique resultados.", 8)
        weak = [b for b in bullets if not is_action(b)]
        if len(weak) / len(bullets) > 0.5:
            add("experiencias", "Mais da metade dos bullets não começa com verbo de ação.", 5)
        firstp = [b for b in bullets if re.search(r"\b(eu|meu|minha|I|my)\b", b)]
        if firstp:
            add("experiencias", "Evite 1ª pessoa (\"eu\", \"meu\") nos bullets.", 3)
    for e in exps:
        if not e.get("inicio"):
            add("experiencias", f"Sem data em \"{e.get('cargo', '?')}\".", 3)

    skills = r.get("habilidades", []) or []
    if len(skills) < 5:
        add("habilidades", "Liste ao menos 5 habilidades técnicas — o ATS busca por elas.", 8)
    elif len(skills) > 25:
        add("habilidades", f"{len(skills)} habilidades é demais; mantenha as ~15 mais relevantes.", 3)

    if not (r.get("formacao") or []):
        add("formacao", "Sem formação acadêmica.", 6)
    return issues


WEIGHTS = {"impacto": 0.35, "relevancia": 0.25, "clareza": 0.2, "estrutura_ats": 0.2}


def final_score(criterios: dict, issues: list[dict]) -> int:
    parts = {k: v for k, v in criterios.items() if k in WEIGHTS and isinstance(v, (int, float))}
    base = sum(v * WEIGHTS[k] for k, v in parts.items()) / sum(WEIGHTS[k] for k in parts) if parts else 60
    penalty = sum(i["peso"] for i in issues) * 0.5  # IA já pega parte disso, então meio peso
    return max(0, min(100, round(base - penalty)))


# ---------- sugestões aplicáveis ----------
# Só texto "de estilo" pode ser editado; fatos (cargo, empresa, datas, formação...) ficam de fora.
EDITABLE = re.compile(r"^(resumo|titulo|habilidades(\.\d+)?|experiencias\.\d+\.bullets(\.\d+)?|projetos\.\d+\.descricao)$")


def editable_view(r: dict) -> str:
    """Lista os caminhos editáveis com o texto atual, para a IA referenciar sem errar índice."""
    lines = [f'titulo: "{r.get("titulo", "")}"', f'resumo: "{r.get("resumo", "")}"']
    for i, s in enumerate(r.get("habilidades") or []):
        lines.append(f'habilidades.{i}: "{s}"')
    for i, e in enumerate(r.get("experiencias") or []):
        lines.append(f"experiencias.{i}.bullets  ({e.get('cargo', '')} @ {e.get('empresa', '')}, "
                     f"{e.get('inicio', '')}–{e.get('fim', '')})")
        for j, b in enumerate(e.get("bullets") or []):
            lines.append(f'  experiencias.{i}.bullets.{j}: "{b}"')
    for i, p in enumerate(r.get("projetos") or []):
        lines.append(f'projetos.{i}.descricao  ({p.get("nome", "")}): "{p.get("descricao", "")}"')
    return "\n".join(lines)


def _norm(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip().rstrip(".;,").lower()


def _get(r, path: str):
    cur = r
    for k in path.split("."):
        if isinstance(cur, list) and k.isdigit() and int(k) < len(cur):
            cur = cur[int(k)]
        elif isinstance(cur, dict) and k in cur:
            cur = cur[k]
        else:
            return None
    return cur


def _check_action(r: dict, a, known_numbers: set[str]):
    """Devolve a ação corrigida (índice ajustado pelo texto) ou None se não for segura de aplicar."""
    if not isinstance(a, dict):
        return None
    tipo, campo = a.get("tipo"), str(a.get("campo") or "")
    de, para = a.get("de"), (a.get("para") or "").strip() if isinstance(a.get("para"), str) else ""
    if tipo not in ("substituir", "adicionar", "remover") or not EDITABLE.match(campo):
        return None
    if tipo != "remover":
        if not para:
            return None
        # número novo que não existe no currículo = possível invenção
        if set(re.findall(r"\d+(?:[.,]\d+)?", para)) - known_numbers:
            return None
    if tipo == "adicionar":
        lst = _get(r, campo)
        if not isinstance(lst, list) or any(_norm(x) == _norm(para) for x in lst):
            return None
        # habilidade nova precisa estar comprovada em outro lugar do currículo
        if campo == "habilidades":
            if "," in para:  # uma habilidade por ação
                return None
            rest = _norm(json.dumps({k: v for k, v in r.items() if k != "habilidades"}, ensure_ascii=False))
            if _norm(para) not in rest:
                return None
        return {"tipo": tipo, "campo": campo, "de": None, "para": para}

    if not _norm(de):
        return None
    cur = _get(r, campo)
    if isinstance(cur, str) and _norm(cur) == _norm(de):
        pass
    else:
        # a IA errou o índice: procura o mesmo texto na lista-mãe
        parent_path, _, idx = campo.rpartition(".")
        parent = _get(r, parent_path) if idx.isdigit() else None
        hit = next((i for i, x in enumerate(parent or []) if _norm(x) == _norm(de)), None)
        if hit is None:
            return None
        campo, cur = f"{parent_path}.{hit}", parent[hit]
    if tipo == "remover" and not campo.rpartition(".")[2].isdigit():
        return None
    if tipo == "substituir" and _norm(cur) == _norm(para):
        return None
    return {"tipo": tipo, "campo": campo, "de": cur, "para": para if tipo == "substituir" else None}


def clean_sections(r: dict, secoes) -> list[dict]:
    known = set(re.findall(r"\d+(?:[.,]\d+)?", str(r)))
    out = []
    for s in secoes if isinstance(secoes, list) else []:
        if not isinstance(s, dict):
            continue
        sugs = []
        for g in s.get("sugestoes") or []:
            if isinstance(g, str):  # formato antigo / modelo preguiçoso
                g = {"problema": g}
            if not isinstance(g, dict) or not g.get("problema"):
                continue
            prio = g.get("prioridade") if g.get("prioridade") in ("alta", "media", "baixa") else "media"
            sugs.append({"problema": g["problema"], "por_que": g.get("por_que", ""), "prioridade": prio,
                         "acao": _check_action(r, g.get("acao"), known)})
        order = {"alta": 0, "media": 1, "baixa": 2}
        sugs.sort(key=lambda g: order[g["prioridade"]])
        out.append({"secao": s.get("secao", ""), "nota": s.get("nota"), "diagnostico": s.get("diagnostico", ""),
                    "sugestoes": sugs})
    return out


# ---------- respostas de entrevista ----------
NUM = re.compile(r"\d+(?:[.,]\d+)?")
# nome próprio/ferramenta: maiúscula no meio da frase, ou com número/símbolo (FastAPI, K8s, C#, Node.js)
TERM = re.compile(r"(?<![.!?:]\s)(?<!^)\b([A-Z][\w+#.]*[A-Za-z0-9+#](?:[ ][A-Z][\w+#.]*[A-Za-z0-9+#])*)")
STAR_WORDS = {"Situação", "Tarefa", "Ação", "Resultado", "Situation", "Task", "Action", "Result", "Eu", "I", "Na", "No",
              "Em", "Com", "Para", "Depois", "Durante", "Quando", "Como", "Também", "Além", "Isso", "Assim"}


def guard_answer(text: str, resume_text: str, extra_known: str = "") -> tuple[str, list[str]]:
    """Troca números que não estão no currículo por [X] e lista nomes próprios/ferramentas desconhecidos."""
    known_nums = set(NUM.findall(resume_text))
    text = NUM.sub(lambda m: m.group(0) if m.group(0) in known_nums else "[X]", text)
    known = (resume_text + " " + extra_known).lower()
    unknown = []
    for t in TERM.findall(text):
        t = t.rstrip(".")
        if t in STAR_WORDS or t.lower() in known or t in unknown:
            continue
        unknown.append(t)
    return text, unknown
