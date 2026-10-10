from pydantic import BaseModel


class ApiResponse[T](BaseModel):
    success: bool
    data: T | None = None
    error: str | None = None


# The largest `offset` a paged endpoint accepts: far past the end of any real
# list, and safely inside a database integer.
MAX_OFFSET = 100_000


class Page[T](BaseModel):
    """One page of a longer list, sent as the `data` of a response."""

    items: list[T]
    # How many items match in all, across every page.
    total: int
    limit: int
    offset: int


def ok[T](data: T) -> ApiResponse[T]:
    return ApiResponse[T](success=True, data=data)


def fail(message: str) -> ApiResponse[None]:
    return ApiResponse[None](success=False, error=message)
