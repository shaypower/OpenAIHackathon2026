"""Machine-readable errors without exposing dependency paths or tracebacks."""

from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from backend.api.models import ErrorDetail, ErrorResponse
from backend.orchestration.errors import WorkflowError


class APIError(WorkflowError):
    pass


async def api_error_handler(request: Request, exc: WorkflowError) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(
        code=exc.code,
        message=exc.message,
        request_id=str(uuid4()),
        retryable=exc.retryable,
        details=exc.details,
    ))
    return JSONResponse(status_code=exc.status_code, content=body.model_dump(mode="json"))


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(WorkflowError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(HTTPException, http_error_handler)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Pydantic errors may contain input values/exception context: return only locations and codes.
    issues = [{"location": list(error["loc"]), "code": error["type"]} for error in exc.errors()]
    return await api_error_handler(request, WorkflowError(
        422, "invalid_request", "Request validation failed.", details={"issues": issues},
    ))


async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
    code = "not_found" if exc.status_code == 404 else "http_error"
    message = "Requested endpoint was not found." if exc.status_code == 404 else "HTTP request could not be completed."
    response = await api_error_handler(request, WorkflowError(exc.status_code, code, message))
    if exc.headers:
        response.headers.update(exc.headers)
    return response
