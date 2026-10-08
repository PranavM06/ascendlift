from pydantic import BaseModel


class ApiResponse[T](BaseModel):
    success: bool
    data: T | None = None
    error: str | None = None


def ok[T](data: T) -> ApiResponse[T]:
    return ApiResponse[T](success=True, data=data)


def fail(message: str) -> ApiResponse[None]:
    return ApiResponse[None](success=False, error=message)
