# Release specialists-service image

Build and publish flow for maintainers.

## Build

```bash
docker build -t ghcr.io/<org>/specialists-service:<tag> .
```

## Push

```bash
docker push ghcr.io/<org>/specialists-service:<tag>
```

## Notes

- Keep `Dockerfile` root-level and reproducible.
- Publish tags from package semver.
- Pair release notes with `docs/specialists-service-install.md` for consumer setup.
- Future work: multi-arch buildx, cosign, SBOM.
