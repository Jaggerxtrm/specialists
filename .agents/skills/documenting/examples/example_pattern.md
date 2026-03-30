---
title: Circuit Breaker Pattern
version: 1.1.0
updated: 2026-01-20T10:00:00Z
scope: pattern-circuit-breaker
category: pattern
subcategory: reliability
domain: [infra, reliability, resiliency]
changelog:
  - 1.1.0 (2026-01-20): Added exponential backoff configuration.
  - 1.0.0 (2025-12-01): Initial pattern definition.
---

## Purpose
Standardize the implementation of the Circuit Breaker pattern to prevent cascading failures when external services are unavailable.

## Pattern Description
Wrap calls to external services (CME API, Database, Redis) in a circuit breaker that tracks failure rates. When failures exceed a threshold, the breaker "trips" (opens) and immediately fails subsequent calls for a cooldown period, allowing the downstream system to recover.

## When to Apply
- Any HTTP call to external APIs
- Database connections
- RPC calls between internal microservices

## Implementation

### Standard Configuration
We use `pybreaker` or the internal `ResiliencyClient` wrapper.

**Default Thresholds:**
- `fail_max`: 5 failures
- `reset_timeout`: 60 seconds

### Example

```python
import pybreaker
from mercury.core.resiliency import circuit_breaker

# Define breaker
api_breaker = pybreaker.CircuitBreaker(
    fail_max=5,
    reset_timeout=60
)

@api_breaker
def call_external_api():
    # ... implementation ...
    pass

# Or using our wrapper
@circuit_breaker(service="market_data")
def fetch_quotes():
    pass
```

## Trade-offs

### Benefits
- Prevents resource exhaustion (thread pools, connections)
- Fails fast, improving user experience during outages
- Allows self-healing of downstream systems

### Costs
- Adds complexity to testing (need to mock failures)
- Can mask intermittent network blips if calibrated too sensitively

## Related Patterns
- `pattern_retry_logic_2025-11.md` - Use Retries with Circuit Breaker, not instead of.
- `pattern_bulkhead_2025-12.md` - Isolating failure domains.
