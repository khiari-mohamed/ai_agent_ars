from __future__ import annotations

import uuid

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.exceptions import NotFoundError
from app.core.security import hash_password
from app.db.repositories.audit_repo import AuditRepository
from app.db.repositories.user_repo import UserRepository
from app.db.session import get_db
from app.models.db.user import User
from app.models.schemas.user import (
    UserCreatedSchema,
    UserCreateSchema,
    UserSchema,
    UserUpdateSchema,
)
from app.routers.dependencies import get_current_user, require_role

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


@router.get("", response_model=list[UserSchema])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[UserSchema]:
    users = await UserRepository(db).list_all()
    return [UserSchema.model_validate(u) for u in users]


@router.post("", response_model=UserCreatedSchema, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreateSchema,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN")),
) -> UserCreatedSchema:
    repo = UserRepository(db)
    if await repo.get_by_email(payload.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "EMAIL_ALREADY_EXISTS", "message": "Cet email est déjà utilisé"},
        )

    totp_secret = pyotp.random_base32()
    user = await repo.create(
        nom=payload.nom,
        prenom=payload.prenom,
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        role=payload.role,
        totp_secret=totp_secret,
    )
    await AuditRepository(db).write(audit.build_event(
        event_type="USER_CREATED",
        actor_type="AGENT_HUMAIN",
        actor_id=str(current_user.id),
        action="create_user",
        resource=f"user:{user.id}",
        result="SUCCESS",
        ip_address=_client_ip(request),
        details={"email": user.email, "role": user.role},
    ))

    totp_uri = pyotp.TOTP(totp_secret).provisioning_uri(name=user.email, issuer_name="ARS Tunisie")
    return UserCreatedSchema.model_validate({
        **UserSchema.model_validate(user).model_dump(),
        "totp_secret": totp_secret,
        "totp_uri": totp_uri,
    })


@router.patch("/{user_id}", response_model=UserSchema)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateSchema,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN")),
) -> UserSchema:
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST)
    try:
        user = await UserRepository(db).update(user_id, update_data)
    except NotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    await AuditRepository(db).write(audit.build_event(
        event_type="USER_UPDATED",
        actor_type="AGENT_HUMAIN",
        actor_id=str(current_user.id),
        action="update_user",
        resource=f"user:{user_id}",
        result="SUCCESS",
        ip_address=_client_ip(request),
        details={"fields": sorted(update_data.keys())},
    ))
    return UserSchema.model_validate(user)