---
title: Analytics Volatility SSOT
version: 1.0.0
updated: 2026-01-20T12:00:00Z
scope: analytics-volatility
category: ssot
subcategory: volatility
domain: [analytics, options, math]
applicability: core-pricing-engine
changelog:
  - 1.0.0 (2026-01-20): Initial baseline creation.
---

## Purpose
Define the Single Source of Truth for the Volatility Analytics component, including surface construction, interpolation methods, and smile dynamics.

## Overview
The Volatility component is responsible for constructing implied volatility surfaces from market data (CME options) and providing interpolation services for the pricing engine.

## Architecture

### Data Flow
1. **Ingestion**: Raw option ticks -> `ingestion_tick`
2. **Processing**: Strike alignment and filtering -> `VolatilityProcessor`
3. **Construction**: Spline fitting -> `SurfaceBuilder`
4. **Storage**: Coefficients stored in Postgres -> `volatility_surfaces` table

### Key Classes
- `VolatilitySurface`: Main interface for querying vol at (expiry, strike)
- `SABRModel`: Implementation of the SABR stochastic volatility model
- `CubicSplineInterpolator`: Fallback interpolation method

## Current State

### What Works
- Real-time surface updates for major expirations (Quarterly)
- SABR calibration for liquid strikes
- Persistence to database

### Known Limitations
- Weekly options often have insufficient liquidity for stable calibration
- Wings (deep OTM) extrapolation can be unstable in high vol environments
- No support for negative strikes (required for some rates products)

## Configuration

### Environment Variables
```bash
VOL_SURFACE_UPDATE_FREQ=60  # seconds
VOL_MODEL_TYPE=sabr         # or 'spline'
```

## Related SSOTs
- `ssot_data_ingestion_tick_2026-01-14.md` - Upstream data source
- `ssot_analytics_pricing_2025-12-10.md` - Downstream consumer

## Next Steps
- [ ] Implement wing dampening for deep OTM strikes
- [ ] Add support for negative strikes (Shifted Lognormal)
- [ ] Optimize recalibration trigger to ignore noise

## References
- [Hagan et al. (2002) Managing Smile Risk](https://link-to-paper)
- `reference_volatility_math.md` (Internal Math Spec)
