---
name: deploy-check
description: Pre-release verification runbook — multi-arch image build, kind smoke test with mounted kubeconfig, guardrail checks, STATUS.md report.
---

# Deploy check

Run before tagging any release, and after changes to the Dockerfile, auth, streaming, or guardrail paths.

## 1. Build the multi-arch image

```sh
make docker-build                                   # local-arch image via build/Dockerfile
docker buildx build --platform linux/amd64,linux/arm64 -f build/Dockerfile .
```

- [ ] Both `amd64` and `arm64` build clean (buildx cannot `--load` multi-platform; local smoke uses the native-arch image).

## 2. Create the kind cluster

```sh
make kind-up
```

- [ ] `kubectl get nodes` works from the host against the kind context.
- [ ] Apply a sample CRD + one instance so step 4 can verify CRD browsing.
- [ ] Create a sample Secret in the default namespace for the masking check.
- [ ] Seed the scratch workload for step 4: `kubectl create ns kubescope-smoke` and a small Deployment in it
      (e.g. `registry.k8s.io/pause`). Seed it with `kubectl`, not through Kubescope — see "No create endpoint" below.

## 3. Run the container with the mounted kubeconfig

```sh
docker run --rm -p 8080:8080 -v ~/.kube/config:/kubeconfig:ro ghcr.io/sujaykumarsuman/kubescope:latest
```

**kind-in-docker caveat (ADR-0004, `docs/adr/0004-cluster-auth-and-kubeconfig-in-docker.md`):** kind's API server address in the kubeconfig is `127.0.0.1:<port>`, which inside the container is the container itself.

- Linux: add `--network host`.
- Mac/Win: mount a kubeconfig copy with the server rewritten to `https://host.docker.internal:<port>` (TLS name caveats per ADR-0004).

## 4. Smoke checklist

| # | Check | Pass condition |
|---|---|---|
| 1 | Health | `curl localhost:8080/healthz` returns 200 |
| 2 | Contexts | All kubeconfig contexts listed in the UI |
| 3 | Context switch | Switch to the kind context; cluster overview loads |
| 4 | Generic list | Core resource types list; the sample CRD type lists too |
| 5 | Workload detail + logs | Pod detail renders; logs stream live |
| 6 | Mutation (scratch ns) | On the Deployment seeded in `kubescope-smoke`, via the UI: edit + apply its YAML, scale up and back down, rollout-restart it, then delete it — all succeed. Also cordon and uncordon the node. Then delete the ns |
| 7 | Read-only mode | Restart the container with `-e KUBESCOPE_READ_ONLY=true`; **every** mutating route — apply, scale, rollout-restart, delete, cordon/uncordon **and drain** — is rejected **403 server-side**, verified by `curl` bypassing the UI, with the cluster left unchanged; the UI also disables write controls. Drain is covered here even though check 6 does not exercise it (see below) |
| 8 | Secret masking | Secret values masked by default, reveal-on-click works, values absent from container logs |

**No create endpoint.** Kubescope writes only to objects that already exist. Sprint 5 Story 5.1 scopes the YAML
editor to "edit + apply" on the generic *detail* view, and the mutating routes are exactly apply
(`PUT`, which 404s on a missing object), delete, scale, rollout-restart and cordon/uncordon/drain. So scratch
fixtures are seeded with `kubectl` in step 2 rather than through the UI. An earlier revision of check 6 said to
"create a Deployment" through the UI, which was never possible (FB-24).

**Why check 6 skips drain.** Draining the only node of a single-node kind cluster evicts the control-plane
workload and leaves nothing to drain onto, so it is not run in the positive direction. Read-only must still
reject it, which is why check 7 covers drain regardless — Sprint 5 requires a test enumerating *every* mutating
route. The eviction path itself (PDB handling, DaemonSet skip) is covered by envtest, not by this runbook.

Cleanup: delete `kubescope-smoke`, remove the sample CRD, `make kind-down` (or leave the cluster for dev).

## 5. Report into STATUS.md

- **All pass:** note `deploy-check PASS <date>, image <tag>` in the STATUS.md Summary for the session.
- **Any fail:** log each failure as `FB-N: <check #, symptom> (source: deploy-check, priority: hi)` under "Feedback / Review Tasks" — guardrail failures (checks 7–8) are always `hi`. Set "Next expected" to the top failure.
- Do not tag or publish a release until a fully clean run is recorded. Update rules: `.claude/skills/update-status/SKILL.md`.
