from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, AuthLockoutError
from app.db.repositories.user_repo import UserRepository
from app.db.repositories.audit_repo import AuditRepository
from app.db.session import get_db
from app.core.audit import audit
from app.models.schemas.user import AdminLoginSchema, AdminTokenResponse
from app.services.auth_service import AuthService
from fastapi import HTTPException, status

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])


@router.post("/login", response_model=AdminTokenResponse)
async def login(
    payload: AdminLoginSchema,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminTokenResponse:
    ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0")
    user_repo = UserRepository(db)
    audit_repo = AuditRepository(db)
    service = AuthService(user_repo)

    try:
        result = await service.login(payload.email, payload.password, payload.totp_code, ip)
        await audit_repo.write(audit.build_event(
            event_type="ADMIN_LOGIN",
            actor_type="AGENT_HUMAIN",
            actor_id=str(result.user.id),
            action="admin_login",
            resource="admin_auth",
            result="SUCCESS",
            ip_address=ip,
        ))
        return result
    except AuthLockoutError as exc:
        await audit_repo.write(audit.build_event(
            event_type="AUTH_LOCKOUT",
            actor_type="AGENT_HUMAIN",
            actor_id=payload.email,
            action="admin_login",
            resource="admin_auth",
            result="FAILURE",
            ip_address=ip,
        ))
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={"code": "AUTH_LOCKOUT", "message": exc.message},
        ) from exc
    except AuthenticationError as exc:
        await audit_repo.write(audit.build_event(
            event_type="AUTH_FAILURE",
            actor_type="AGENT_HUMAIN",
            actor_id=payload.email,
            action="admin_login",
            resource="admin_auth",
            result="FAILURE",
            ip_address=ip,
        ))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_ERROR", "message": exc.message},
        ) from exc