# Distributed Messaging QA Test Plan

## Scope

Validate the behavior of the API producer, RabbitMQ broker, independent consumer, Redis job-status persistence and frontend polling under normal, burst, retry, poison-message and worker-failure conditions.

All acceptance criteria are evaluated against **observed runtime results**; no passing integration outcomes are assumed before execution. The automated runner writes observations to `qa-run-results.json`.

| ID | Scenario | Execution | Expected result | Evidence |
|---|---|---|---|---|
| QA-01 | Non-blocking REST submission | `POST /api/jobs` with valid JSON | HTTP `202`, unique UUID, status URL; observed HTTP round-trip below 100 ms | Browser Network timings / test JSON |
| QA-02 | Status polling | Poll the returned status URL | `queued` or `processing` initially; `completed` after ~4 seconds | Browser polling responses / Redis record |
| QA-03 | Buffering under load | Publish five jobs concurrently | Broker queue temporarily holds ready messages; worker processes them with prefetch 1 | Management UI + logs |
| QA-04 | Offline worker recovery | Stop worker, publish two jobs, restart | API still accepts; two jobs remain queued and later complete | Queue depth and job states |
| QA-05 | Hard worker crash | SIGKILL worker while a delivery is unacknowledged | Broker requeues message; restarted worker can finish; attempt count increments | Worker logs + job attempts |
| QA-06 | Transient processing error | Submit `kind=flaky` | First delivery NACK/requeued, subsequent delivery ACKed | `job_nack_requeue` and `job_ack` logs |
| QA-07 | Poison payload | Submit `kind=poison` | Failed status, NACK without requeue, DLQ count increases | Management UI DLQ + logs |
| QA-08 | Duplicate completion | Redeliver a job already marked completed | Job is not processed twice; duplicate delivery is ACKed | `duplicate_ignored` log (code-level/controlled replay) |
| QA-09 | HTTP / terminal health | Inspect browser DevTools and service logs | No JavaScript errors; clean 202 and 200 status codes; expected structured events | Screenshots and logs |

## Static verification already performed

- `node --test tests/*.test.js` — 6 tests passed.
- `node --check` on all application, browser and test-runner JavaScript files — no syntax errors.

## Runtime verification required

Run the application on a host with Docker Desktop. Execute `npm run test:integration` and `RUN_DESTRUCTIVE_QA=1 npm run test:integration`, observe the management UI, and collect actual screenshots. Mark individual tests **passed** only after successful evidence collection. A failing timing measurement should be reported as measured, not overwritten.

## Architecture caveat

The Redis write and RabbitMQ publish are not one atomic transaction; a production-grade transactional outbox would close the cross-service dual-write gap. Status persistence and broker durability also depend on the specific production storage policy and deployment configuration.
