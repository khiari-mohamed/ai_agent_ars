from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.repositories.user_repo import UserRepository
from app.db.session import get_db
from app.models.schemas.user import UserCreateSchema, UserSchema, UserUpdateSchema
from app.routers.dependencies import get_current_user, require_role
from app.models.db.user import User
from app.core.exceptions import NotFoundError

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


@router.get("", response_model=list[UserSchema])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[UserSchema]:
    repo = UserRepository(db)
    users = await repo.list_all()
    return [UserSchema.model_validate(u) for u in users]


@router.post("", response_model=UserSchema, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN")),
) -> UserSchema:
    repo = UserRepository(db)
    existing = await repo.get_by_email(payload.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "EMAIL_ALREADY_EXISTS", "message": "Cet email est déjà utilisé"},
        )
    import pyotp
    totp_secret = pyotp.random_base32()
    user = await repo.create(
        nom=payload.nom,
        prenom=payload.prenom,
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        role=payload.role,
        totp_secret=totp_secret,
    )
    return UserSchema.model_validate(user)


@router.patch("/{user_id}", response_model=UserSchema)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateSchema,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("ADMIN")),
) -> UserSchema:
    repo = UserRepository(db)
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST)
    try:
        user = await repo.update(user_id, update_data)
    except NotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return UserSchema.model_validate(user)