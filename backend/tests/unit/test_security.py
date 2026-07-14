from __future__ import annotations

import pytest
from jose import jwt

from app.core.security import (
    create_access_token, decode_access_token,
    generate_otp, hash_password, sign_audit_event,
    verify_audit_signature, verify_password,
)
from app.core.exceptions import AuthenticationError
from app.core.config import settings


def test_hash_and_verify_password() -> None:
    password = "SecurePass123!"
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("wrong", hashed)


def test_create_and_decode_jwt() -> None:
    import uuid
    user_id = str(uuid.uuid4())
    token = create_access_token(subject=user_id, role="ADMIN")
    payload = decode_access_token(token)
    assert payload["sub"] == user_id
    assert payload["role"] == "ADMIN"
    assert "jti" in payload


def test_decode_invalid_jwt_raises() -> None:
    with pytest.raises(AuthenticationError):
        decode_access_token("invalid.token.here")


def test_decode_expired_jwt_raises() -> None:
    from datetime import timedelta
    token = create_access_token(subject="user-id", role="AGENT")
    # Tamper with expiry by decoding without verification
    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    payload["exp"] = 0  # Force expiry
    expired_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    with pytest.raises(AuthenticationError):
        decode_access_token(expired_token)


def test_generate_otp_format() -> None:
    for _ in range(100):
        otp = generate_otp()
        assert len(otp) == 6
        assert otp.isdigit()


def test_audit_hmac_sign_and_verify() -> None:
    sig = sign_audit_event("id-1", "2026-01-01T00:00:00Z", "AUTH_SUCCESS", '{"key": "val"}')
    assert isinstance(sig, str)
    assert len(sig) == 64
    assert verify_audit_signature("id-1", "2026-01-01T00:00:00Z", "AUTH_SUCCESS", '{"key": "val"}', sig)
    assert not verify_audit_signature("id-2", "2026-01-01T00:00:00Z", "AUTH_SUCCESS", '{"key": "val"}', sig)