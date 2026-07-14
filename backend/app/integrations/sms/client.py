from __future__ import annotations

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class SMSClient:
    async def send_otp(self, phone_number: str, otp: str) -> bool:
        """Send OTP via SMS gateway. Returns True on success."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    settings.SMS_GATEWAY_URL,
                    json={
                        "to": phone_number,
                        "message": f"Votre code de vérification ARS Tunisie : {otp}. Valable 5 minutes.",
                        "sender": "ARS-TN",
                    },
                    headers={"Authorization": f"Bearer {settings.SMS_GATEWAY_API_KEY}"},
                )
                resp.raise_for_status()
                logger.info("sms_otp_sent", phone=phone_number[-4:].rjust(len(phone_number), "*"))
                return True
        except Exception as exc:
            logger.error("sms_send_failed", error=str(exc))
            return False

    async def send_notification(self, phone_number: str, message: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    settings.SMS_GATEWAY_URL,
                    json={"to": phone_number, "message": message, "sender": "ARS-TN"},
                    headers={"Authorization": f"Bearer {settings.SMS_GATEWAY_API_KEY}"},
                )
                resp.raise_for_status()
                return True
        except Exception as exc:
            logger.error("sms_notification_failed", error=str(exc))
            return False


class SMSMockClient(SMSClient):
    async def send_otp(self, phone_number: str, otp: str) -> bool:
        logger.info("sms_mock_otp", phone=phone_number[-4:].rjust(len(phone_number), "*"), otp=otp)
        return True

    async def send_notification(self, phone_number: str, message: str) -> bool:
        logger.info("sms_mock_notification", phone=phone_number[-4:].rjust(len(phone_number), "*"))
        return True


def get_sms_client() -> SMSClient:
    if settings.SMS_GATEWAY_API_KEY:
        return SMSClient()
    return SMSMockClient()