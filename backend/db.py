"""SQLite simples para o painel de candidaturas."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "vagafit.db"
STATUSES = ["preparacao", "enviada", "entrevista", "oferta", "recusada"]


@contextmanager
def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init():
    with conn() as c:
        c.execute("""
        CREATE TABLE IF NOT EXISTS candidaturas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa TEXT NOT NULL,
            cargo TEXT NOT NULL,
            link TEXT DEFAULT '',
            status TEXT DEFAULT 'preparacao',
            vaga TEXT DEFAULT '',
            curriculo TEXT DEFAULT '',
            carta TEXT DEFAULT '',
            compatibilidade INTEGER,
            notas TEXT DEFAULT '',
            criado_em TEXT,
            atualizado_em TEXT
        )""")


def _row(r: sqlite3.Row) -> dict:
    d = dict(r)
    for k in ("curriculo", "carta"):
        try:
            d[k] = json.loads(d[k]) if d[k] else None
        except json.JSONDecodeError:
            pass
    return d


def list_all() -> list[dict]:
    with conn() as c:
        rows = c.execute("SELECT * FROM candidaturas ORDER BY atualizado_em DESC").fetchall()
    return [_row(r) for r in rows]


def create(data: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    with conn() as c:
        cur = c.execute(
            """INSERT INTO candidaturas
               (empresa, cargo, link, status, vaga, curriculo, carta, compatibilidade, notas, criado_em, atualizado_em)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (data["empresa"], data["cargo"], data.get("link", ""), data.get("status") if data.get("status") in STATUSES else "preparacao",
             data.get("vaga", ""), json.dumps(data.get("curriculo")) if data.get("curriculo") else "",
             json.dumps(data.get("carta")) if data.get("carta") else "",
             data.get("compatibilidade"), data.get("notas", ""), now, now),
        )
        row = c.execute("SELECT * FROM candidaturas WHERE id=?", (cur.lastrowid,)).fetchone()
    return _row(row)


def update(id_: int, data: dict) -> dict | None:
    allowed = {"empresa", "cargo", "link", "status", "vaga", "notas", "compatibilidade", "curriculo", "carta"}
    fields = {k: v for k, v in data.items() if k in allowed}
    if "status" in fields and fields["status"] not in STATUSES:
        raise ValueError("status inválido")
    for k in ("curriculo", "carta"):
        if k in fields and not isinstance(fields[k], str):
            fields[k] = json.dumps(fields[k])
    fields["atualizado_em"] = datetime.now(timezone.utc).isoformat()
    sets = ", ".join(f"{k}=?" for k in fields)
    with conn() as c:
        c.execute(f"UPDATE candidaturas SET {sets} WHERE id=?", (*fields.values(), id_))
        row = c.execute("SELECT * FROM candidaturas WHERE id=?", (id_,)).fetchone()
    return _row(row) if row else None


def delete(id_: int) -> bool:
    with conn() as c:
        cur = c.execute("DELETE FROM candidaturas WHERE id=?", (id_,))
    return cur.rowcount > 0
