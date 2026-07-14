from __future__ import annotations

import pyotp
from datetime import datetime, timezone

from app.core.config import settings
from app.core.exceptions import AuthenticationError, AuthLockoutError
from app.core.logging import get_logger
from app.core.metrics import auth_attempts
from app.core.security import create_access_token, verify_password
from app.db.repositories.user_repo import UserRepository
from app.models.db.user import User
from app.models.schemas.user import AdminTokenResponse, UserSchema

logger = get_logger(__name__)


class AuthService:
    def __init__(self, user_repo: UserRepository) -> None:
        self.repo = user_repo

    async def login(self, email: str, password: str, totp_code: str, ip: str) -> AdminTokenResponse:
        user = await self.repo.get_by_email(email.lower())

        if user is None:
            auth_attempts.labels(result="failure").inc()
            # Timing-safe: still verify a dummy password to prevent user enumeration
            verify_password("dummy", "$2b$12$dummy_hash_that_never_matches_any_password")
            raise AuthenticationError("Identifiants invalides")

        # Check lockout
        if user.locked_until and user.locked_until > datetime.now(timezone.utc):
            remaining = int((user.locked_until - datetime.now(timezone.utc)).total_seconds())
            auth_attempts.labels(result="lockout").inc()
            raise AuthLockoutError(remaining)

        if not user.active:
            raise AuthenticationError("Compte désactivé")

        if not verify_password(password, user.hashed_password):
            failed = await self.repo.increment_failed_login(user.id)
            auth_attempts.labels(result="failure").inc()
            logger.warning("admin_login_failed", email=email, attempts=failed, ip=ip)
            raise AuthenticationError("Identifiants invalides")

        # Verify TOTP
        if not self._verify_totp(user, totp_code):
            failed = await self.repo.increment_failed_login(user.id)
            auth_attempts.labels(result="failure").inc()
            raise AuthenticationError("Code TOTP invalide")

        # Success
        await self.repo.record_login(user.id)
        auth_attempts.labels(result="success").inc()
        logger.info("admin_login_success", email=email, role=user.role, ip=ip)

        token = create_access_token(subject=user.id, role=user.role)
        return AdminTokenResponse(
            access_token=token,
            user=UserSchema.model_validate(user),
        )

    @staticmethod
    def _verify_totp(user: User, code: str) -> bool:
        if not user.totp_secret:
            # Dev mode: accept any 6-digit code
            return len(code) == 6 and code.isdigit()
        totp = pyotp.TOTP(user.totp_secret, issuer=settings.TOTP_ISSUER)
        return totp.verify(code, valid_window=1)