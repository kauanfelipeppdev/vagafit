# VagaFit — MVP inspirado no JobStep

Adapta seu currículo para cada vaga usando IA (Groq), dá nota ao currículo, gera carta de apresentação e organiza candidaturas num kanban.

## Rodando

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # coloque sua GROQ_API_KEY (console.groq.com)
uvicorn backend.main:app --reload
```

Abra http://localhost:8000. Sem currículo à mão, clique em **Usar exemplo**.

## O que tem

| Funcionalidade | Como funciona |
|---|---|
| Importar currículo | PDF/TXT → `pypdf` extrai o texto → IA converte para JSON estruturado |
| Editor + 3 modelos | Clássico, Moderno e Compacto, todos em coluna única (amigável para ATS). Preview ao vivo |
| Aparência | Cor, fonte, tamanho, margens, separadores (inclusive quebra de linha), marcador, ordem/nome/visibilidade das seções |
| Nota do currículo | Avaliação crítica (impacto, relevância, clareza, ATS) **menos** penalidades determinísticas. Sugestões com Antes/Depois e botão Aplicar/Desfazer; o backend descarta edições que inventam fatos |
| Adaptar à vaga | IA extrai palavras-chave e reescreve resumo/bullets/habilidades. Cada mudança pode ser aceita ou recusada; as suspeitas (título trocado, ferramenta ou número que não está no currículo, participação inflada) vêm marcadas e recusadas. O **% de compatibilidade é calculado em código** |
| Anti-invenção | `matching.enforce_facts()` restaura empresa, cargo, datas, formação, idiomas e certificações do original — a IA só consegue mexer no texto |
| Padrão por país | BR, PT, EUA, Alemanha, Suíça (instruções no prompt) |
| Carta de apresentação | Gerada a partir da versão adaptada, editável direto no papel |
| Candidaturas | Kanban (SQLite) com data de envio, aviso de follow-up após 7 dias, notas, resumo de taxa de entrevista |
| Entrevista | Perguntas prováveis da vaga com resposta de exemplo (STAR) usando só fatos do currículo; números não comprovados viram [X] |
| PDF e Word | PDF gerado no servidor com Chrome/Edge headless (A4, texto selecionável). Word (.docx) montado a partir dos dados. Avisa se ainda há campos [X] para preencher |
| Backup | Exporta/importa tudo (currículo, aparência, candidaturas) em JSON |
| Cache da IA | Mesma entrada reaproveita a resposta por 14 dias (SQLite), economizando o limite da Groq |

## Estrutura

```
backend/
  main.py       rotas FastAPI
  llm.py        cliente Groq (JSON mode)
  prompts.py    prompts + schema do currículo
  matching.py   palavras-chave, % de compatibilidade, enforce_facts
  scoring.py    checagens determinísticas da nota
  db.py         SQLite das candidaturas + cache da IA
  pdf.py        PDF via Chrome/Edge headless
  docx_export.py  currículo e carta em Word
static/
  index.html  styles.css  templates.css  app.js
```

## Endpoints

- `POST /api/curriculo/importar` (multipart `arquivo`) · `POST /api/curriculo/importar-texto`
- `POST /api/curriculo/nota`
- `POST /api/adaptar` · `POST /api/compatibilidade` (sem IA, usado ao vivo)
- `POST /api/carta`
- `GET/POST /api/candidaturas` · `PATCH/DELETE /api/candidaturas/{id}`

## Próximos passos (v2)

1. **Login + multiusuário**: hoje é single-user (currículo no localStorage, candidaturas num SQLite local). Supabase Auth ou JWT próprio; mover tudo para Postgres com `user_id`.
2. **Planos e pagamento**: Stripe Checkout + webhook; limitar `/api/adaptar` e `/api/carta` no plano grátis (contador por usuário/mês).
3. **Busca de vagas**: APIs como Adzuna, Jooble ou Remotive (evite scraping de LinkedIn); job semanal que roda `compatibility()` e envia as melhores.
5. **Rate limit** (slowapi) e limite de tamanho nos textos antes de abrir publicamente — cada chamada gasta tokens.
6. Importar **DOCX** (`python-docx`) e PDFs escaneados (OCR).
