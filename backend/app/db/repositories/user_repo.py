from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db.user import User
from app.core.exceptions import NotFoundError


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        nom: str,
        prenom: str,
        email: str,
        hashed_password: str,
        role: str = "AGENT",
        totp_secret: str | None = None,
    ) -> User:
        user = User(
            nom=nom,
            prenom=prenom,
            email=email,
            hashed_password=hashed_password,
            role=role,
            totp_secret=totp_secret,
            active=True,
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def get_by_id(self, user_id: uuid.UUID) -> User:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise NotFoundError("Utilisateur")
        return user

    async def get_by_email(self, email: str) -> User | None:
        result = await self.db.execute(select(User).where(User.email == email.lower()))
        return result.scalar_one_or_none()

    async def list_all(self) -> list[User]:
        result = await self.db.execute(select(User).order_by(User.created_at.desc()))
        return list(result.scalars().all())

    async def update(self, user_id: uuid.UUID, data: dict) -> User:  # type: ignore[type-arg]
        data["updated_at"] = datetime.now(timezone.utc)
        await self.db.execute(update(User).where(User.id == user_id).values(**data))
        return await self.get_by_id(user_id)

    async def record_login(self, user_id: uuid.UUID) -> None:
        await self.db.execute(
            update(User).where(User.id == user_id).values(
                last_login_at=datetime.now(timezone.utc),
                failed_login_attempts=0,
                locked_until=None,
            )
        )

    async def increment_failed_login(self, user_id: uuid.UUID) -> int:
        user = await self.get_by_id(user_id)
        new_count = user.failed_login_attempts + 1
        values: dict = {"failed_login_attempts": new_count}
        if new_count >= 5:
            from datetime import timedelta
            values["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=15)
        await self.db.execute(update(User).where(User.id == user_id).values(**values))
        return new_count