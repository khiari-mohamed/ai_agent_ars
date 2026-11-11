from __future__ import annotations

from fastapi import HTTPException, status

# Single source of truth for code → HTTP status (used by the global handler in main.py).
_CODE_TO_STATUS: dict[str, int] = {
    "AUTHENTICATION_ERROR": 401,
    "AUTHORIZATION_ERROR": 403,
    "NOT_FOUND": 404,
    "VALIDATION_ERROR": 422,
    "AUTH_LOCKOUT": 423,
    "RATE_LIMIT_EXCEEDED": 429,
    "DIGIHEALTH_ERROR": 502,
    "CRM_ERROR": 502,
    "CIRCUIT_OPEN": 503,
    "EMBEDDING_ERROR": 503,
    "LLM_ERROR": 503,
    "STT_ERROR": 503,
    "TTS_ERROR": 503,
}


class AppError(Exception):
    """Base application error. `status_code` is derived from `code` unless given."""

    status_code: int = 500

    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_ERROR",
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = (
            status_code
            if status_code is not None
            else _CODE_TO_STATUS.get(code, type(self).status_code)
        )


class AuthenticationError(AppError):
    def __init__(self, message: str = "Non authentifié") -> None:
        super().__init__(message, "AUTHENTICATION_ERROR")


class AuthorizationError(AppError):
    def __init__(self, message: str = "Accès refusé") -> None:
        super().__init__(message, "AUTHORIZATION_ERROR")


class NotFoundError(AppError):
    def __init__(self, resource: str = "Ressource") -> None:
        super().__init__(f"{resource} introuvable", "NOT_FOUND")


class ValidationError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(message, "VALIDATION_ERROR")


class EmbeddingError(AppError):
    def __init__(self, message: str = "Service d'embedding indisponible") -> None:
        super().__init__(message, "EMBEDDING_ERROR")


class LLMError(AppError):
    def __init__(self, message: str = "Service LLM indisponible") -> None:
        super().__init__(message, "LLM_ERROR")


class STTError(AppError):
    def __init__(self, message: str = "Service de transcription indisponible") -> None:
        super().__init__(message, "STT_ERROR")


class TTSError(AppError):
    def __init__(self, message: str = "Service de synthèse vocale indisponible") -> None:
        super().__init__(message, "TTS_ERROR")


class CircuitOpenError(AppError):
    """Raised by a circuit breaker while it is open. Works for any service."""

    def __init__(self, service: str) -> None:
        AppError.__init__(
            self,
            f"Service '{service}' temporairement indisponible (circuit ouvert)",
            "CIRCUIT_OPEN",
        )
        self.service = service


class DigiHealthError(AppError):
    def __init__(self, message: str = "Service DigiHealth indisponible") -> None:
        super().__init__(message, "DIGIHEALTH_ERROR")


class DigiHealthCircuitOpenError(CircuitOpenError, DigiHealthError):
    """Kept until DigiHealth is removed (step 4)."""

    def __init__(self) -> None:
        CircuitOpenError.__init__(self, "digihealth")


class CRMError(AppError):
    def __init__(self, message: str = "Service CRM indisponible") -> None:
        super().__init__(message, "CRM_ERROR")


class RateLimitError(AppError):
    def __init__(self) -> None:
        super().__init__("Trop de requêtes", "RATE_LIMIT_EXCEEDED")


class AuthLockoutError(AppError):
    def __init__(self, remaining_seconds: int) -> None:
        super().__init__(
            f"Compte verrouillé. Réessayez dans {remaining_seconds // 60} minutes.",
            "AUTH_LOCKOUT",
        )
        self.remaining_seconds = remaining_seconds


# HTTP exception helpers
def http_401() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "AUTHENTICATION_ERROR", "message": "Non authentifié"},
        headers={"WWW-Authenticate": "Bearer"},
    )


def http_403() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"code": "AUTHORIZATION_ERROR", "message": "Accès refusé"},
    )


def http_404(resource: str = "Ressource") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "NOT_FOUND", "message": f"{resource} introuvable"},
    )