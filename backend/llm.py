"""Cliente mínimo para a API da Groq (compatível com OpenAI), sempre pedindo JSON."""
import asyncio
import json
import os
import re

import httpx

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"


class LLMError(Exception):
    pass


async def ask_json(system: str, user: str, temperature: float = 0.3) -> dict:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise LLMError("GROQ_API_KEY não configurada (veja .env.example)")

    payload = {
        "model": os.getenv("GROQ_MODEL") or DEFAULT_MODEL,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    async with httpx.AsyncClient(timeout=90) as client:
        for attempt in range(3):
            r = await client.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
            if r.status_code != 429 or attempt == 2:
                break
            # limite de tokens por minuto do plano gratuito: espera o tempo que a Groq pedir
            m = re.search(r"try again in ([\d.]+)s", r.text)
            wait = float(m.group(1)) if m else float(r.headers.get("retry-after", 5))
            if wait > 30:
                break
            await asyncio.sleep(wait + 0.5)
    if r.status_code == 429:
        raise LLMError("Limite de uso da Groq atingido (plano gratuito). Espere um minuto e tente de novo.")
    if r.status_code != 200:
        raise LLMError(f"Groq retornou {r.status_code}: {r.text[:300]}")

    content = r.json()["choices"][0]["message"]["content"]
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        raise LLMError(f"Resposta da IA não é JSON válido: {e}") from e
