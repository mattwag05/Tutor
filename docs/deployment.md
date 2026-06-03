# Tutor Deployment

Tutor's production deployment runs on Pironman behind the existing
`caddy-tailscale` proxy.

## Published Image

The durable production image is:

```bash
ghcr.io/mattwag05/tutor
```

The Docker Release workflow publishes `latest`, `main`, semantic release tags,
and `sha-<short>` tags. Prefer a pinned `sha-<short>` tag for rollback-sensitive
deployments and `latest` for normal default-branch deploys.

## Pironman Deploy

Use the deploy script from the repository root:

```bash
scripts/deploy_pironman.sh
```

To deploy a specific image tag:

```bash
TUTOR_IMAGE=ghcr.io/mattwag05/tutor:sha-f03ba2b scripts/deploy_pironman.sh
```

The script:

1. writes a temporary compose override,
2. validates the merged compose config,
3. pulls the requested image before touching the running service,
4. starts the `deeptutor` compatibility service with the published image,
5. waits for container health, and
6. checks `https://tutor.tail6e035b.ts.net/course` plus backend system status.

If GHCR is unavailable, make the fallback explicit:

```bash
TUTOR_ALLOW_LOCAL_BUILD_FALLBACK=1 scripts/deploy_pironman.sh
```

With the fallback enabled, the script still validates the published-image
compose config first. If the pull fails, it builds the current Pironman checkout
at `/home/matthewwagner/Projects/Tutor`, deploys that local image with
`pull_policy: never`, and runs the same health and public-route checks. The
fallback refuses to build if the remote checkout has local changes.

## GHCR Visibility

Unauthenticated `docker pull ghcr.io/mattwag05/tutor:latest` must work before
Pironman can rely only on published images. If `docker manifest inspect` returns
`unauthorized`, make the package public in GitHub Packages or authenticate
Pironman's Docker client to GHCR.

## Emergency Local Build

Prefer the scripted fallback above. If the script is unavailable, build locally
on Pironman and use a temporary override:

```bash
ssh pironman
cd /home/matthewwagner/Projects/Tutor
docker build --target production --build-arg BACKEND_PORT=8001 --build-arg APP_VERSION="$(git rev-parse --short HEAD)" -t "tutor:$(git rev-parse --short HEAD)" .
```

Then use a temporary compose override under
`/home/matthewwagner/homelab/docker/compose/deeptutor/`. Remove that override
once the published GHCR image is pullable again.
