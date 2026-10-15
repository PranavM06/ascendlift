import uuid
from dataclasses import asdict
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.foods.usda import FoodSource, FoodSourceError, SourceFood
from app.models import Food, FoodLogEntry, FoodSearch

SERVICE_UNAVAILABLE = 503
SEARCH_UNAVAILABLE_MESSAGE = "Food search is unavailable right now. Try again shortly."
# USDA's data changes a few times a year, so a month-old answer is still good.
SEARCH_CACHE_TTL = timedelta(days=30)
MAX_RECENT_FOODS = 20
# What the food_searches.query column holds.
MAX_QUERY_LENGTH = 100
# What a repeated search refreshes on a food that is already stored.
REFRESHED_COLUMNS = (
    "name",
    "brand",
    "serving_size",
    "serving_unit",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
)


def normalize_query(search: str) -> str:
    """Lower case with single spaces, so near-identical searches share a cache row."""
    # Cut after lower-casing, which makes a few letters such as "İ" longer.
    return " ".join(search.lower().split())[:MAX_QUERY_LENGTH].rstrip()


def _foods_in_order(db: Session, food_ids: list[uuid.UUID]) -> list[Food]:
    foods = db.scalars(
        select(Food)
        .where(Food.id.in_(food_ids))
        .execution_options(populate_existing=True)
    )
    by_id = {food.id: food for food in foods}
    return [by_id[food_id] for food_id in food_ids if food_id in by_id]


def _store_foods(db: Session, found: list[SourceFood]) -> list[uuid.UUID]:
    """Save the foods, updating any already stored, and return their ids in order."""
    if not found:
        return []
    # Sorted so two searches saving the same foods lock them in the same order.
    rows = [asdict(food) for food in sorted(found, key=lambda food: food.source_id)]
    insert = pg_insert(Food).values(rows)
    saved = db.execute(
        insert.on_conflict_do_update(
            index_elements=[Food.source_id],
            set_={column: insert.excluded[column] for column in REFRESHED_COLUMNS},
        ).returning(Food.source_id, Food.id)
    )
    id_by_source = {row.source_id: row.id for row in saved}
    return [id_by_source[food.source_id] for food in found]


def _remember_search(
    db: Session, query: str, food_ids: list[uuid.UUID], now: datetime
) -> None:
    insert = pg_insert(FoodSearch).values(
        query=query, food_ids=food_ids, fetched_at=now
    )
    db.execute(
        insert.on_conflict_do_update(
            index_elements=[FoodSearch.query],
            set_={
                "food_ids": insert.excluded.food_ids,
                "fetched_at": insert.excluded.fetched_at,
            },
        )
    )


def search_foods(
    db: Session, source: FoodSource, search: str, now: datetime
) -> list[Food]:
    """The best matches for a search, from the cache when it has a fresh answer."""
    query = normalize_query(search)
    cached = db.execute(
        select(FoodSearch.food_ids, FoodSearch.fetched_at).where(
            FoodSearch.query == query
        )
    ).one_or_none()
    if cached is not None and now - cached.fetched_at < SEARCH_CACHE_TTL:
        return _foods_in_order(db, cached.food_ids)

    # Hands the database connection back while waiting on the network.
    db.commit()
    try:
        found = source.search(query)
    except FoodSourceError as exc:
        if cached is not None:
            # An out-of-date answer is more use than none.
            return _foods_in_order(db, cached.food_ids)
        raise AppError(
            status_code=SERVICE_UNAVAILABLE, message=SEARCH_UNAVAILABLE_MESSAGE
        ) from exc

    food_ids = _store_foods(db, found)
    _remember_search(db, query, food_ids, now)
    db.commit()
    return _foods_in_order(db, food_ids)


def recent_foods(db: Session, user_id: uuid.UUID) -> list[Food]:
    """The foods the user logged most recently, each once, latest first."""
    last_logged = (
        select(
            FoodLogEntry.food_id,
            func.max(FoodLogEntry.created_at).label("last_logged_at"),
        )
        .where(FoodLogEntry.user_id == user_id)
        .group_by(FoodLogEntry.food_id)
        .subquery()
    )
    foods = db.scalars(
        select(Food)
        .join(last_logged, last_logged.c.food_id == Food.id)
        .order_by(last_logged.c.last_logged_at.desc(), Food.id)
        .limit(MAX_RECENT_FOODS)
        .execution_options(populate_existing=True)
    )
    return list(foods)
