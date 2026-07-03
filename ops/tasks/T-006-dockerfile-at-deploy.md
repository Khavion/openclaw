---
id: T-006
owner: claude-code
state: NEW
gate: G3
due: none
---
docker-compose.yml references product/Dockerfile which is intentionally not
authored yet (nothing local depends on Docker). Author the Dockerfile, a
Caddyfile, and the VPS deploy runbook when Stage 0 passes and the founder
approves the VPS spend (G5) and first deploy (G3).
Acceptance: compose stack boots on the VPS with tests green in CI first.
