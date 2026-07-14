from __future__ import annotations

import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch

from app.core.security import hash_password, create_access_token


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient) -> None:
    with patch("app.routers.admin_auth.UserRepository") as MockRepo:
        instance = MockRepo.return_value
        instance.get_by_email = AsyncMock(return_value=None)
        resp = await client.post(
            "/api/admin/auth/login",
            json={"email": "wrong@ars.tn", "password": "WrongPass1!", "totp_code": "000000"},
        )
    assert resp.status_code == 401
    assert resp.json()["code"] == "AUTH_ERROR"


@pytest.mark.asyncio
async def test_protected_route_without_token(client: AsyncClient) -> None:
    resp = await client.get("/api/admin/conversations")
    assert resp.status_code == 403  # HTTPBearer returns 403 when missing


@pytest.mark.asyncio
async def test_protected_route_with_valid_token(client: AsyncClient, auth_headers: dict) -> None:
    with patch("app.routers.dependencies.UserRepository") as MockRepo:
        import uuid
        from unittest.mock import MagicMock
        mock_user = MagicMock()
        mock_user.active = True
        mock_user.role = "ADMIN"
        mock_user.id = uuid.uuid4()
        instance = MockRepo.return_value
        instance.get_by_id = AsyncMock(return_value=mock_user)
        with patch("app.routers.admin_conversations.ConversationRepository") as MockConvRepo:
            instance2 = MockConvRepo.return_value
            instance2.list_paginated = AsyncMock(return_value=([], 0))
            resp = await client.get("/api/admin/conversations", headers=auth_headers)
    assert resp.status_code == 200