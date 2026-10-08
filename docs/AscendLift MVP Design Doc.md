# AscendLift — MVP Design Doc

Last updated Oct 8, 2026 · Live version: https://claude.ai/code/artifact/3a7555ac-5e4b-4b27-b985-c132be26383e

## Overview

AscendLift is an iOS lifting and diet tracker that gives each user a daily AI summary based on their goals. The MVP is a portfolio piece built to be usable day to day, with a public launch planned later.

The app has three tabs:

- **Home:** progress at a glance plus the daily Claude insight
- **Training:** lifting only, with saved routines and templates
- **Diet:** calories and macros, logged by manual food search

**In scope for the MVP:** lifting logs, routines and templates, calorie and macro logging, user-set targets, goal-based daily insights shown in the app, and a lbs/kg setting.

**Out of scope for now:** cardio and other training types, micronutrients, barcode and photo logging, Apple Watch and HealthKit, push notifications, multi-week programs, and Android.

## Tech stack

The app is React Native with Expo, backed by a FastAPI service and Postgres. The Claude API is called only from the backend, so the API key never ships in the app.

| Layer | Choice | Why |
| --- | --- | --- |
| App | React Native + Expo (TypeScript), Expo Router tabs | Fast iteration; keeps Android open for a public launch |
| Backend | FastAPI + Pydantic | Python, builds on existing Flask and REST experience |
| Database | Postgres, SQLAlchemy 2.0, Alembic migrations | Relational data fits workouts and logs; migrations matter while the design changes |
| Auth | Sign in with Apple, JWTs issued by FastAPI | Apple requires it when other social logins are offered |
| Daily jobs | APScheduler inside FastAPI | One nightly job per user; no task queue needed yet |
| Food data | USDA FoodData Central, proxied and cached by the backend | Free; caching makes search fast and avoids rate limits |
| AI | Claude API (Haiku 4.5), backend only | Key stays secret; structured JSON output |
| App state | TanStack Query (server data), Zustand (local state) | Simple, well-supported |
| Charts | Victory Native or react-native-gifted-charts | Native charts for the Home tab |
| Offline logging | Expo SQLite | Logging works with poor gym signal, syncs later |
| Hosting | Railway, Render, or Fly.io; Neon or Supabase for Postgres | Cheap or free tiers, little ops work |

Alternative considered: SwiftUI. Decided against it to keep Android open for a public launch.

## Data model

All weights are stored in kg, and a user's goal is two separate choices: a training style and a body-composition phase.

| Table | Key fields | Notes |
| --- | --- | --- |
| User | id, name, timezone, unit preference (lbs or kg) | Timezone drives when the nightly insight runs |
| BodyweightEntry | user, date, weight (kg) | Feeds the bodyweight trend and cut/bulk insights |
| Goal | user, training style, phase | Style: powerlifting, bodybuilding, or general strength. Phase: cut, bulk, or maintain |
| TargetHistory | user, calories, protein, carbs, fat, effective date | User-entered; history lets insights tell a miss from a target change |
| Exercise | name, muscle groups, equipment, owner | Seeded from an open dataset; users can add their own |
| RoutineTemplate | user, name, notes | e.g. "Push Day" |
| TemplateExercise | template, exercise, order, target sets, rep range, target weight or RPE | Pre-fills a workout started from the template |
| WorkoutSession | user, start and end time, template (optional) | Template link lets insights compare work to plan |
| WorkoutSet | session, exercise, order, reps, weight (kg), RPE (optional) | Core training record |
| Food | source id, name, serving size, calories, protein, carbs, fat | Cached from USDA |
| FoodLogEntry | user, food, servings, meal, date | Core diet record |
| DailyInsight | user, date, insight JSON, stats snapshot, status | Snapshot shows exactly what Claude was given |

## Daily insight pipeline

Python does the math and Claude does the interpreting, which keeps insights accurate, cheap, and easy to debug.

Pipeline steps:

1. **Trigger:** nightly, in the user's local time, or on app open if today's insight is missing
2. **Compute stats (Python):** volume, e1RM trends, PRs, macro adherence, bodyweight trend
3. **Claude API (Haiku 4.5):** receives the goal plus the stats summary, returns structured JSON
4. **Guardrails (Python):** checks target suggestions (calorie floor, step-size cap)
5. **Save DailyInsight:** insight JSON plus the stats snapshot Claude saw
6. **Home tab:** shows the insight card; user can accept or dismiss target suggestions

Claude never sees raw logs, only the user's goal and a compact stats summary of the last 7 days plus a 4-week trend, and that summary is saved with each insight so any odd output can be traced back to its input.

## Screens per tab

Each tab opens on what the user needs today, with history one tap away.

| Tab | Main screen | Other screens |
| --- | --- | --- |
| Home | Today's insight card, macro rings, weekly training volume, strength trend for key lifts, bodyweight trend | Insight history, suggested target change (accept or dismiss), settings (units, goal, targets) |
| Training | Start a blank workout or start from a template | Active workout logger (sets pre-filled from last time, optional RPE, rest timer), template editor, workout history, PRs per exercise, exercise library |
| Diet | Today's calories and macros vs. targets, meals list | Food search, serving adjuster, recent foods for quick re-logging, past days |

Onboarding (first launch): Sign in with Apple, units, training style, phase, calorie and macro targets, starting bodyweight.

## Key design decisions

### Units

- Store every weight in kg at full precision; convert only for display.
- The lbs/kg setting changes display only, never stored data.
- Round displayed weights to real plate steps: 2.5 lb in lbs mode, 1.25 kg in kg mode.
- Bodyweight follows the same setting.

### Targets

- Users enter their own calorie and macro targets and can edit them anytime.
- Every change is saved in TargetHistory with its effective date.
- Claude may suggest an adjustment with a short reason. It appears as a card with Accept and Dismiss, and is never applied automatically.
- Python guardrails check suggestions before they are shown: a minimum calorie floor and a cap on the size of a single change.

### Routines and templates

- A workout can start blank or from a template; templates pre-fill exercises and show last session's weights.
- Rep ranges in templates let insights flag when it's time to add weight.
- Multi-week programs (like 5/3/1) come after the MVP; the template model can grow into them.

### Insights

- Shown in the app only for now; push notifications later.
- If today's insight is missing when the app opens (new user or failed job), generate it on demand.

## Build order and roadmap

Training logging comes first because it is the core of the app; insights come last because they depend on everything else.

**MVP**

1. FastAPI skeleton, database models, migrations, Sign in with Apple
2. Training: exercise library, workout logging, templates, history and PRs
3. Diet: USDA food search with caching, food logging, daily totals
4. Onboarding: units, goal, targets, starting bodyweight
5. Stats computation in Python and Home tab charts
6. Daily Claude insights, on-demand fallback, suggested target changes with guardrails
7. Polish and TestFlight for real daily use

**After the MVP**

- Apple Watch and HealthKit
- Push notifications for the morning insight
- Multi-week programs
- Barcode scanning and photo logging
- Cardio and other training types
- Android and a public App Store launch (check the AscendLift trademark first)

## Process

AscendLift is built with a solo-friendly agile process: a Kanban board with 1–2 week sprints, each ending in a build that runs on a phone.

**Backlog and board**

- Every feature, bug, and idea is a card, written as a user story: "As a lifter, I can start a workout from a template so I don't re-enter exercises."
- Board columns: Backlog, To Do (this sprint), In Progress, Review, Done.
- At most two cards in progress at once, so work gets finished.

**Sprints**

- Length: 1–2 weeks. Each step in the MVP build order above is roughly one sprint, with step 2 split into exercise logging and templates/history/PRs.
- Each sprint ends with a TestFlight build used in real workouts and meals.
- Review and retro (about 15 minutes): use the build, note what felt wrong, and reorder the backlog.

**Workflow**

- One branch and pull request per card, even solo.
- Claude Code writes code against a card; every PR is reviewed before merging.
- Backend tests and linting run on every PR.

**Tools**

| Purpose | Tool |
| --- | --- |
| Board and issues | GitHub Projects (Linear as an alternative) |
| CI | GitHub Actions |
| iOS builds and TestFlight | Expo EAS Build and EAS Submit |

## Decisions and open questions

| Question | Decision |
| --- | --- |
| App framework | React Native + Expo |
| Insight model | Claude Haiku 4.5; can switch to Sonnet later |
| Exercise library | Seeded from an open dataset; users can add their own |
| RPE | Optional on each set |
| Insight history | Last 7 days plus a 4-week trend |
| App Store name | "AscendLift: Workouts & Macros" is available |

**Still open: monthly Claude API budget**

Starting point: use Claude Haiku 4.5 for daily insights and run the nightly job through the Batch API, which is half price. At an assumed 4,000 input and 600 output tokens per insight, that is roughly $0.10–0.20 per user per month. Claude Sonnet 5 would be about three times that.

- [ ] Set a $5/month spend limit in the Claude Console during development
- [ ] Measure real token counts per insight, then set the budget
- [ ] Later: compare Haiku and Sonnet insight quality on real data before switching

Prices as of October 2026: Haiku 4.5 $1/$5 and Sonnet 5 $3/$15 per million input/output tokens ([pricing](https://docs.claude.com/en/docs/about-claude/pricing), [overview](https://benchlm.ai/anthropic/api-pricing)).
