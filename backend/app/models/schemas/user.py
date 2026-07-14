from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

UserRole = Literal["AGENT", "SUPERVISEUR", "ADMIN"]


class UserSchema(BaseModel):
    id: UUID
    nom: str
    prenom: str
    email: EmailStr
    role: UserRole
    active: bool
    last_login_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreateSchema(BaseModel):
    nom: str = Field(min_length=1, max_length=100)
    prenom: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=12)
    role: UserRole = "AGENT"
    active: bool = True

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        if not any(c in "!@#$%^&*()_+-=[]{}|;':\",./<>?" for c in v):
            raise ValueError("Password must contain at least one special character")
        return v


class UserUpdateSchema(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    prenom: str | None = Field(default=None, min_length=1, max_length=100)
    role: UserRole | None = None
    active: bool | None = None


class AdminLoginSchema(BaseModel):
    email: EmailStr
    password: str
    totp_code: str = Field(pattern=r"^\d{6}$")


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserSchema