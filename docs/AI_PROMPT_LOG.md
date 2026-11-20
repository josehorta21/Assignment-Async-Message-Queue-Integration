# AI-Assisted Development Record & Messaging Audit

## AI disclosure

**AI assistant:** OpenAI ChatGPT (GPT-6). The user supplied the course assignment in ChatGPT as a pasted Markdown file. The exact supplied text is preserved without modifications in [`assignment_prompt_original.md`](assignment_prompt_original.md). No other user-authored generation prompt was supplied in this exchange.

**Project generated:** AsyncFlow, a demonstration of HTTP-based ingestion, RabbitMQ asynchronous processing, Redis job-status persistence, manual ACK/NACK, DLQ routing, and worker recovery.

## Source prompt (exact)

The complete, exact user-provided assignment appears in [`assignment_prompt_original.md`](assignment_prompt_original.md). It explicitly instructs ChatGPT to develop:

- A REST endpoint returning HTTP 202 with a unique job ID.
- A real external message broker rather than an in-memory queue.
- A background worker with 3–5 second simulated work.
- Durable messages and explicit ACK/NACK handling.
- Idempotent processing, status polling, burst buffering, and negative crash tests.

The course document also contains a sample prompt. It is reproduced in the original file; it was not separately submitted as a second user prompt.

## AI-generated audit baseline

[`ai-draft-unsafe.js`](ai-draft-unsafe.js) is an **intentionally simplified, unsafe AI-created baseline retained to support the audit exercise**. It illustrates the shortcuts the assignment warns about. It is not represented as a previously deployed system or as a bug that an independent model accidentally produced. Only the corrected `src/` implementation is executed.

| Audit finding | Unsafe baseline | Corrected implementation |
|---|---|---|
| Fake queue | `const jobs = []` disappears at restart | RabbitMQ container, durable `asyncflow.jobs` queue, persistent messages |
| Blocking request | `await setTimeout(4000)` inside POST | API returns HTTP 202 after RabbitMQ publisher confirm; worker runs independently |
| Acknowledgment | No explicit ACK; impossible to recover safely | Worker uses `noAck: false`, ACK only after completed status is persisted |
| Crash recovery | In-memory status and work both lost | RabbitMQ preserves unacknowledged deliveries; Redis AOF stores job history |
| Duplicate delivery | No duplicate detection | Worker ACKs already-completed job IDs without executing again |
| Poison messages | No failure isolation | `nack(message, false, false)` and RabbitMQ dead-letter exchange |
| Transient errors | No recovery procedure | `nack(message, false, true)` for simulated transient failure, with stored attempt count |
| Contract / observability | HTTP 200, no status URL | HTTP 202, `Location` header, `GET /api/jobs/:id`, metrics and logs |

## Important limitations / production notes

1. **Dual-write window.** Saving Redis state and publishing to RabbitMQ cannot be atomic across both systems. Publisher confirms mitigate uncertainty but do not eliminate it. For production use, a transactional outbox in a transactional database would be preferable.
2. **Delivery guarantees.** `persistent: true` and a durable queue help with broker restarts. At-least-once behavior still permits redelivery. A consumer must use idempotent state or business logic.
3. **Workload simulation.** The job has no external side effects. The idempotency guard covers repeat completion of the job status, not exactly-once payments or external calls.
4. **Local security.** The demonstration credentials are local-only and RabbitMQ ports bind to `127.0.0.1`; a public deployment needs secrets, TLS, authentication and proper networking.
5. **QA evidence.** Static inspection and unit tests were run in the authoring environment. Docker-backed broker, failover, queue drain and p99 response-time checks require running the supplied QA suite on a Docker-capable host. Do not report them as passed until they have been executed.

## Review checklist

- [x] Code uses RabbitMQ, not a fake in-memory queue.
- [x] Producer returns 202 without waiting for simulated worker processing.
- [x] Source contains manual consumer ACK/NACK, publisher confirms and durable queue declarations.
- [x] Source contains idempotency guard, bounded transient retry and DLQ configuration.
- [x] Pure logic validated by the bundled six unit tests.
- [ ] Local Docker execution and full crash-recovery QA (run the integration suite and save evidence).
