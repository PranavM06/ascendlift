# ascendlift
AscendLift: an iOS lifting and macro tracker with daily AI insights based on your goals. Built with React Native (Expo), FastAPI, Postgres, and the Claude API.

The design is in [docs/AscendLift MVP Design Doc.md](docs/AscendLift%20MVP%20Design%20Doc.md).

## Layout

| Path | What |
| --- | --- |
| `backend/` | FastAPI service (Python 3.12, SQLAlchemy, Postgres) |
| `docker-compose.yml` | Local Postgres |
| `docs/` | Design doc |

## Running the backend

Needs [uv](https://docs.astral.sh/uv/) and Docker Desktop.

```bash
docker compose up -d            # Postgres on localhost:5432
cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head     # create or update the tables
uv run uvicorn app.main:app --reload
```

`GET http://localhost:8000/health` returns `{"success": true, "data": {"status": "ok", "database": "ok"}, "error": null}`. Interactive API docs are at `/docs`.

## Changing the schema

Models live in `backend/app/models/`. After editing them:

```bash
uv run alembic revision --autogenerate -m "describe the change"
uv run alembic upgrade head
```

Read the generated file in `backend/migrations/versions/` before committing it. For enum-like columns Alembic emits the CHECK constraint more than once; keep only the one named `ck_<table>_<name>`, as in `0001_initial_schema.py`.

## Checks

Run from `backend/`; CI runs the same on every pull request.

```bash
uv run ruff check .
uv run ruff format --check .
uv run mypy
uv run pytest --cov             # needs Postgres running
uv run pytest -m "not integration"   # without Postgres
```
