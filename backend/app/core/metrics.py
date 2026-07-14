from __future__ import annotations

from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST

REGISTRY = CollectorRegistry()

# Conversations
conversations_total = Counter(
    "ars_conversations_total",
    "Total conversations started",
    ["channel"],
    registry=REGISTRY,
)
conversations_active = Gauge(
    "ars_conversations_active",
    "Currently active conversations",
    registry=REGISTRY,
)
conversations_resolved = Counter(
    "ars_conversations_resolved_total",
    "Conversations resolved without escalation",
    registry=REGISTRY,
)
conversations_escalated = Counter(
    "ars_conversations_escalated_total",
    "Conversations escalated to human agents",
    ["reason"],
    registry=REGISTRY,
)

# LLM
llm_request_duration = Histogram(
    "ars_llm_request_duration_seconds",
    "LLM API call duration",
    ["provider", "model"],
    buckets=[0.5, 1.0, 2.0, 3.0, 5.0, 10.0, 30.0],
    registry=REGISTRY,
)
llm_tokens_used = Counter(
    "ars_llm_tokens_total",
    "Total tokens consumed",
    ["provider", "type"],  # type: input|output
    registry=REGISTRY,
)
llm_errors = Counter(
    "ars_llm_errors_total",
    "LLM API errors",
    ["provider", "error_type"],
    registry=REGISTRY,
)

# DigiHealth
digihealth_request_duration = Histogram(
    "ars_digihealth_duration_seconds",
    "DigiHealth API call duration",
    ["endpoint"],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
    registry=REGISTRY,
)
digihealth_errors = Counter(
    "ars_digihealth_errors_total",
    "DigiHealth API errors",
    ["status_code"],
    registry=REGISTRY,
)
digihealth_circuit_open = Gauge(
    "ars_digihealth_circuit_open",
    "DigiHealth circuit breaker state (1=open)",
    registry=REGISTRY,
)

# Auth
auth_attempts = Counter(
    "ars_auth_attempts_total",
    "Authentication attempts",
    ["result"],  # success|failure|lockout
    registry=REGISTRY,
)

# STT / TTS
stt_duration = Histogram(
    "ars_stt_duration_seconds",
    "STT transcription duration",
    ["provider"],
    registry=REGISTRY,
)
tts_duration = Histogram(
    "ars_tts_duration_seconds",
    "TTS synthesis duration",
    ["provider"],
    registry=REGISTRY,
)