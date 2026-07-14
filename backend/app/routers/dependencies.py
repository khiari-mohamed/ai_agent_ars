from __future__ import annotations

from fastapi import Depends, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import http_401, http_403
from app.core.security import decode_access_token
from app.db.repositories.user_repo import UserRepository
from app.db.session import get_db
from app.models.db.user import User

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise http_401()
    try:
        payload = decode_access_token(credentials.credentials)
    except Exception:
        raise http_401()

    import uuid
    user_repo = UserRepository(db)
    try:
        user = await user_repo.get_by_id(uuid.UUID(payload["sub"]))
    except Exception:
        raise http_401()

    if not user.active:
        raise http_401()
    return user


def require_role(*roles: str):  # type: ignore[no-untyped-def]
    async def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise http_403()
        return user
    return _check


AdminUser = Depends(get_current_user)
SupervisorOrAdmin = Depends(require_role("SUPERVISEUR", "ADMIN"))
AdminOnly = Depends(require_role("ADMIN"))