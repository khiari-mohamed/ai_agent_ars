from __future__ import annotations

from fastapi import HTTPException, status


class AppError(Exception):
    """Base application error."""

    def __init__(self, message: str, code: str = "INTERNAL_ERROR") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


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


class DigiHealthError(AppError):
    def __init__(self, message: str = "Service DigiHealth indisponible") -> None:
        super().__init__(message, "DIGIHEALTH_ERROR")


class DigiHealthCircuitOpenError(DigiHealthError):
    def __init__(self) -> None:
        super().__init__("DigiHealth circuit breaker ouvert — service temporairement indisponible")


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