"""Reference Python client for the specialists-service HTTP API.

This is the canonical adapter referenced by docs/darth-feedor-migration.md
Phase 1 step 1. Drop it into your project (e.g. shared/specialists_client.py)
and tweak the imports — the public API matches the migration contract.

Service contract: see docs/specialists-service.md and docs/specialists-service.md
section "CLI peer (sp script)" for the error_type taxonomy and exit codes.

Stdlib-only — no external dependencies. Tested on Python 3.10+.

Example:
    client = SpecialistsClient(base_url="http://localhost:8000")
    result = client.run("mercury-atomic-summarizer",
                        variables={"title": article.title, "content": article.body})
    if result.success:
        write_summary(article.id, result.parsed_json)
    else:
        log.warning("specialist failed: %s (%s) trace=%s",
                    result.error, result.error_type, result.meta.get("trace_id"))
"""
from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class SpecialistErrorType(str, Enum):
    """Mirror of the closed error_type union returned by /v1/generate.

    Maps 1:1 to sp script exit codes (see docs/specialists-service.md
    "CLI peer (sp script)" section). Use this in caller code instead of
    matching raw strings — it's a stable surface.
    """

    SPECIALIST_NOT_FOUND = "specialist_not_found"
    SPECIALIST_LOAD_ERROR = "specialist_load_error"
    TEMPLATE_VARIABLE_MISSING = "template_variable_missing"
    AUTH = "auth"
    QUOTA = "quota"
    TIMEOUT = "timeout"
    NETWORK = "network"
    INVALID_JSON = "invalid_json"
    OUTPUT_TOO_LARGE = "output_too_large"
    INTERNAL = "internal"
    # Caller-side: HTTP transport failed before the service responded.
    TRANSPORT = "transport"


@dataclass
class SpecialistResult:
    """Service-shaped result. `meta.trace_id` propagates into service logs.

    Mirrors the legacy qwen_client return shape (success/output/error/error_type/attempts)
    plus parsed_json and meta for service-specific metadata.
    """

    success: bool
    output: str | None = None
    parsed_json: dict[str, Any] | None = None
    error: str | None = None
    error_type: SpecialistErrorType | None = None
    attempts: int = 1
    meta: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_response_body(cls, body: dict[str, Any], attempts: int = 1) -> SpecialistResult:
        raw_error_type = body.get("error_type")
        try:
            error_type = SpecialistErrorType(raw_error_type) if raw_error_type else None
        except ValueError:
            # Forwards-compatible: unknown error_type from a newer service.
            error_type = SpecialistErrorType.INTERNAL
        return cls(
            success=bool(body.get("success")),
            output=body.get("output"),
            parsed_json=body.get("parsed_json"),
            error=body.get("error"),
            error_type=error_type,
            attempts=attempts,
            meta=body.get("meta") or {},
        )


class SpecialistsClient:
    """HTTP client for specialists-service POST /v1/generate.

    Service-shaped public API — call sites change in a minimal way from
    the legacy qwen_client / SpecialistLoader path. No retries: caller owns
    retry policy (the service intentionally does not retry).
    """

    def __init__(self, base_url: str = "http://localhost:8000", default_timeout_ms: int = 60_000) -> None:
        self.base_url = base_url.rstrip("/")
        self.default_timeout_ms = default_timeout_ms

    def run(
        self,
        name: str,
        variables: dict[str, str] | None = None,
        template: str | None = None,
        timeout_ms: int | None = None,
        model_override: str | None = None,
    ) -> SpecialistResult:
        """Invoke a script-class specialist and return a service-shaped result.

        Default behavior: the spec's `prompt.task_template` is rendered with
        `$varname` substitution from `variables`. To use a multi-stage
        specialist (e.g. analyst initial + normalize pass), ship two specs
        and call each by name — there is no in-spec alternate-template
        lookup.

        `template` overrides the rendered template text directly for this
        call only. Most callers leave it None and rely on the spec.

        `timeout_ms` overrides the service-side timeout for this call only.
        Caller-side socket timeout is set to `timeout_ms + 5_000` so the
        service has room to return a structured timeout error before we
        give up on the socket.
        """
        effective_timeout_ms = timeout_ms if timeout_ms is not None else self.default_timeout_ms
        payload: dict[str, Any] = {"specialist": name, "variables": variables or {}}
        if template is not None:
            payload["template"] = template
        if timeout_ms is not None:
            payload["timeout_ms"] = timeout_ms
        if model_override is not None:
            payload["model_override"] = model_override

        body_bytes = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url=f"{self.base_url}/v1/generate",
            data=body_bytes,
            method="POST",
            headers={"content-type": "application/json", "accept": "application/json"},
        )
        socket_timeout_seconds = (effective_timeout_ms + 5_000) / 1000.0

        try:
            with urllib.request.urlopen(request, timeout=socket_timeout_seconds) as response:
                response_body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            # Service responded with non-2xx but still produced a JSON body.
            try:
                response_body = json.loads(exc.read().decode("utf-8"))
                return SpecialistResult.from_response_body(response_body)
            except (ValueError, OSError):
                return _transport_failure(f"HTTP {exc.code}: {exc.reason}")
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError) as exc:
            return _transport_failure(f"transport: {type(exc).__name__}: {exc}")
        except (ValueError, OSError) as exc:
            return _transport_failure(f"transport: malformed response: {exc}")

        return SpecialistResult.from_response_body(response_body)

    def healthz(self) -> bool:
        """Liveness check — returns True if /healthz responds 200 with ok=true."""
        try:
            with urllib.request.urlopen(f"{self.base_url}/healthz", timeout=5.0) as response:
                body = json.loads(response.read().decode("utf-8"))
                return bool(body.get("ok"))
        except Exception:
            return False


def _transport_failure(message: str) -> SpecialistResult:
    return SpecialistResult(
        success=False,
        error=message,
        error_type=SpecialistErrorType.TRANSPORT,
        meta={},
    )
