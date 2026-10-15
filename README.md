# ascendlift
AscendLift: an iOS lifting and macro tracker with daily AI insights based on your goals. Built with React Native (Expo), FastAPI, Postgres, and the Claude API.

The design is in [docs/AscendLift MVP Design Doc.md](docs/AscendLift%20MVP%20Design%20Doc.md).

## Layout

| Path | What |
| --- | --- |
| `backend/` | FastAPI service (Python 3.12, SQLAlchemy, Postgres) |
| `mobile/` | iOS app (Expo, React Native, TypeScript) |
| `docker-compose.yml` | Local Postgres |
| `docs/` | Design doc |

## Running the backend

Needs [uv](https://docs.astral.sh/uv/) and Docker Desktop.

```bash
docker compose up -d            # Postgres on localhost:5432
cd backend
cp .env.example .env            # then set ASCENDLIFT_JWT_SECRET (see the file)
uv sync
uv run alembic upgrade head     # create or update the tables
uv run uvicorn app.main:app --reload
```

Food search works out of the box with USDA's shared `DEMO_KEY`, which allows only a few dozen searches an hour. For daily use, get a free key at <https://fdc.nal.usda.gov/api-key-signup> and set `ASCENDLIFT_USDA_API_KEY` in `.env`; production refuses to start with the demo key.

`GET http://localhost:8000/health` returns `{"success": true, "data": {"status": "ok", "database": "ok"}, "error": null}`. Interactive API docs are at `/docs`.

## Running the app on an iPhone

Needs Node and the Expo Go app on the phone, with the phone and this Mac on the same Wi-Fi.

```bash
# Terminal 1: backend, listening on the network so the phone can reach it
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 2: app
cd mobile
cp .env.example .env            # then set EXPO_PUBLIC_API_URL to this Mac's Wi-Fi address
npm install
npx expo start                  # scan the QR code with the iPhone camera
```

Sign in with Apple works in the App Store's Expo Go because the backend accepts Expo Go's audience (`host.exp.Exponent`) in development. When the App Store's Expo Go is older than this project's Expo SDK, or was built with `eas go`, it has no Sign in with Apple and the sign-in screen says so; use a development build instead.

### Development build

A development build is the AscendLift app itself, with a menu for loading code from this Mac. It needs an Apple Developer account and an [Expo account](https://expo.dev/signup).

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest device:create                                   # once per iPhone: open the link on the phone and install the profile
npx eas-cli@latest build --profile development --platform ios      # about 15 minutes, in the cloud
```

When the build finishes, scan its QR code with the iPhone camera to install it, turn on Developer Mode (Settings > Privacy & Security) if iOS asks, then run `npx expo start` and open AscendLift on the phone.

The backend must trust the app's bundle id, so `backend/.env` needs it in the list, followed by a backend restart:

```
ASCENDLIFT_APPLE_AUDIENCES=["host.exp.Exponent", "com.pranavmeka.ascendlift"]
```

A new build is only needed after adding a library with native code or changing `app.json`; everyday code changes load from `npx expo start`.

App checks, run from `mobile/`:

```bash
npx tsc --noEmit
npx expo lint
npm test
```

## API

Every response has the shape `{"success": bool, "data": ..., "error": string | null}`.

| Method and path | Auth | What it does |
| --- | --- | --- |
| `GET /health` | none | Checks the service and its database |
| `POST /auth/apple` | none | Body `{identity_token, nonce, name?}`. Verifies the Apple identity token, creates the user on first sign-in, returns `{access_token, refresh_token, token_type, expires_in}` |
| `POST /auth/refresh` | none | Body `{refresh_token}`. Returns a new pair; the old refresh token stops working |
| `POST /auth/logout` | none | Body `{refresh_token}`. Revokes it |
| `GET /users/me` | bearer | The signed-in user's profile: `{id, name, email, timezone, unit_preference, onboarded_at, created_at}`. `onboarded_at` is null until onboarding is finished |
| `PATCH /users/me` | bearer | Body `{name?, timezone?, unit_preference?}`. Changes only the fields sent |
| `POST /onboarding` | bearer | Body `{unit_preference, timezone, training_style, phase, targets: {calories, protein_g, carbs_g, fat_g}, bodyweight_kg}`. Saves the units, time zone, goal, targets and starting bodyweight together and returns the profile with `onboarded_at` set. `training_style` is `powerlifting`, `bodybuilding` or `general_strength`; `phase` is `cut`, `maintain` or `bulk`. Calories run from 500 to 10,000, each macro from 0 to 1,000 g, and bodyweight from 20 to 400 kg. The targets and weigh-in are dated today in the given time zone. Sending it again replaces that day's answers and keeps the first `onboarded_at` |
| `GET /targets?on_date=` | bearer | The targets in effect on a day, the latest set on or before it: `{calories, protein_g, carbs_g, fat_g, effective_date}`, or `null` if none had been set by then |
| `GET /exercises` | bearer | The shared exercise library plus the user's own exercises, by name. Query `search?`, `muscle_group?`, `equipment?`, `limit?` (default 50, at most 100), `offset?`. Returns `{items, total, limit, offset}` |
| `POST /exercises` | bearer | Body `{name, muscle_groups, equipment?}`. Adds an exercise only this user can see; 409 if they already have one with that name, or already have 500 |
| `GET /templates` | bearer | The user's routine templates by name, each `{id, name, notes, exercises}`. An exercise entry is `{id, exercise: {id, name}, position, target_sets, rep_min, rep_max, target_weight_kg, target_rpe}` |
| `POST /templates` | bearer | Body `{name, notes?, exercises}`, with exercises in performing order as `{exercise_id, target_sets, rep_min, rep_max, target_weight_kg?, target_rpe?}`. At most 100 templates per user |
| `GET /templates/{id}` | bearer | One template |
| `PUT /templates/{id}` | bearer | Same body as creating; replaces the name, notes and exercises |
| `DELETE /templates/{id}` | bearer | Deletes the template. Workouts started from it are kept and lose the link |
| `POST /workouts` | bearer | Starts a workout; 409 if one is already in progress. Optional body `{template_id}` starts it from a template. Returns `{id, started_at, ended_at, template_id, sets}` |
| `GET /workouts` | bearer | Finished workouts, newest first. Query `limit?` (default 20, at most 50), `offset?`. Returns a page of `{id, started_at, ended_at, template_id, set_count, exercise_names, volume_kg}` |
| `GET /workouts/records?exercise_id=` | bearer | The user's records for an exercise across finished workouts: `{heaviest, best_estimated_1rm}`, each `{workout_id, achieved_at, reps, weight_kg, estimated_1rm_kg}` or `null`. The estimate is Epley's formula and is left out above 12 reps |
| `GET /workouts/active` | bearer | The workout in progress with its sets, or `null` |
| `GET /workouts/last-sets?exercise_id=` | bearer | The exercise's sets from the latest finished workout that included it, as `{workout_id, started_at, sets}`, or `null` |
| `GET /workouts/{id}` | bearer | One workout with its sets |
| `POST /workouts/{id}/finish` | bearer | Ends the workout. Calling it again keeps the first end time |
| `DELETE /workouts/{id}` | bearer | Deletes the workout and its sets |
| `POST /workouts/{id}/sets` | bearer | Body `{exercise_id, reps, weight_kg, rpe?}`. Appends a set and returns `{id, exercise: {id, name}, position, reps, weight_kg, rpe}` |
| `PATCH /workouts/{id}/sets/{set_id}` | bearer | Body `{reps?, weight_kg?, rpe?}`. Changes only the fields sent; `rpe: null` clears it |
| `DELETE /workouts/{id}/sets/{set_id}` | bearer | Removes the set |
| `GET /foods?search=` | bearer | Up to 25 foods matching the search (at least 2 characters), best match first, each `{id, name, brand, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g}`. Nutrients are for one serving: the label's serving for packaged foods, 100 g for generic ones. 503 if USDA cannot be reached and the search is not cached |
| `GET /foods/recent` | bearer | The 20 foods the user logged most recently, each once, latest first |
| `GET /food-log?entry_date=` | bearer | One day of the user's food log: `{entry_date, totals, entries}`. `totals` is `{calories, protein_g, carbs_g, fat_g}`; an entry is `{id, food, servings, meal, entry_date, calories, protein_g, carbs_g, fat_g}` with nutrients for the servings logged |
| `POST /food-log` | bearer | Body `{food_id, servings, meal, entry_date}`. `meal` is `breakfast`, `lunch`, `dinner` or `snack`; `servings` is above 0, at most 100, with up to two decimal places. At most 200 entries a day |
| `PATCH /food-log/{id}` | bearer | Body `{servings?, meal?}`. Changes only the fields sent |
| `DELETE /food-log/{id}` | bearer | Removes the entry |

Weights are always kilograms: at most four decimal places going in, and a string such as `"102.0583"` coming out so no precision is lost. RPE runs from 1 to 10 in half steps. Endpoints that write allow 120 requests a minute per client address.

Food data comes from [USDA FoodData Central](https://fdc.nal.usda.gov/). The backend keeps every food it has seen and remembers each search for 30 days, so a repeated search does not reach USDA at all. Food search allows 60 requests a minute per client address. Dates such as `entry_date` are the user's own calendar day, as `YYYY-MM-DD`.

Sign-in works like this:

- The app makes a random nonce, gives Apple its SHA-256 hex digest, and sends the raw nonce to `/auth/apple` with the token Apple returns.
- Access tokens last 15 minutes. Send them as `Authorization: Bearer <token>`.
- Refresh tokens last 30 days and work once. Presenting one that was already used signs out every session descended from that sign-in, since it may have been stolen.
- The `/auth/*` endpoints allow 10 requests a minute per client address.

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
