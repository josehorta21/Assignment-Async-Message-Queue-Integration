### **Objective & Overview**

In enterprise architectures, direct synchronous HTTP calls between microservices create temporal coupling—if a downstream service is slow or crashes, the upstream API stalls and fails. Architects solve this by placing an **asynchronous message queue** (e.g., RabbitMQ, Redis Streams/BullMQ, AWS SQS) between the ingress API and background worker pools.

However, when developers use AI tools to generate asynchronous messaging workflows, LLMs frequently introduce critical anti-patterns:

- Using synchronous in-memory arrays or promises and calling them a "queue."
- Omitting **message acknowledgments (ACK/NACK)**, which causes lost messages during worker crashes.
- Failing to implement **consumer idempotency**, leading to duplicated transactions when messages are redelivered.
- Lacking a **Dead-Letter Queue (DLQ)** to isolate malformed "poison pill" payloads.

In this assignment, you will:

1. **Design and implement a synchronous REST API** that accepts user requests (e.g., order placement, report generation, video encoding, or notification dispatch).
2. **Implement an asynchronous message broker/queue** that decouples request ingestion from background processing.
3. **Use an AI tool** to generate an initial draft of the API producer, message broker integration, and background worker consumer.
4. **Audit and verify** the AI-generated code against distributed messaging standards (ACK/NACK handling, worker retry loops, idempotency, and status polling).
5. **Execute a structured Web Project QA test suite** to prove decoupled processing, crash recovery, and queue draining.
6. **Submit** your GitHub repository, live URL (if applicable), AI prompt log, and a video walkthrough demonstrating functionality and testing.

### **Step-by-Step Instructions**

#### **Step 1: Prompt the AI for an Initial Draft**

Pick an event-driven workflow where processing takes time (e.g., Order Placement -> Background Fulfillment, File Upload -> Background Image Resizing, or User Signup -> Asynchronous Welcome Email Dispatch).

**Sample Initial Prompt for Students to Copy & Adapt:**

Act as a senior distributed systems architect. Build a decoupled, event-driven service demonstrating synchronous REST ingestion and asynchronous message queue processing using [Language/Framework, e.g., Node.js/Express, Python/FastAPI, or Go] and [Broker, e.g., RabbitMQ, Redis/BullMQ, or AWS SQS].

The project must include:

1. Ingress REST API (Producer):

   - POST /api/jobs (or /orders): Validates input, generates a unique Job ID, pushes the payload onto a durable message queue, and IMMEDIATELY returns an HTTP 202 Accepted response with the Job ID.

   - GET /api/jobs/:id: Returns the current job status (e.g., 'queued', 'processing', 'completed', 'failed').

2. Message Broker:

   - A running broker instance (e.g., configured via Docker Compose for RabbitMQ or Redis).

3. Worker Service (Consumer):

   - Continuously listens on the queue.

   - Simulates work (e.g., a 3-5 second processing delay).

   - Updates the job status store upon completion.

   - Implements explicit message acknowledgments (ACK upon success, NACK/requeue on transient failure).

4. A lightweight frontend (or Postman collection / HTML dashboard) showing:

   - A button/form to submit jobs.

   - A live polling status indicator updating from 'queued' to 'processing' to 'completed'.



Provide the API code, worker consumer code, Docker Compose file for the broker, and step-by-step setup commands.



#### **Step 2: Audit & Verify the AI Output (Messaging Reality Check)**

Before running the generated code, inspect the AI's implementation against this **Message Architecture Audit Checklist**:

- **True Asynchronous Decoupling vs. Fake Queues:** Did the AI use an actual external broker (RabbitMQ, Redis, SQS), or did it take a shortcut by using an in-memory JavaScript array or Python background task that vanishes if the process restarts?
- **Immediate Response (202 Accepted):** Does the REST API respond immediately after publishing to the queue, or did the AI accidentally await the worker's processing completion before returning the HTTP response?
- **Acknowledgment Mechanics (ACK / NACK):** Does the worker explicitly acknowledge the message only **after** successful processing? If autoAck: true is configured, messages will be lost forever if the worker crashes mid-task.
- **Worker Crash Recovery & Durability:** Are queues and messages declared as **durable / persistent** so they survive broker restarts?

#### **Step 3: Web Project Testing & Quality Assurance (QA) Checklist**

Run your decoupled application through this QA framework. You will demonstrate these live in your recording:

- [ ] **1. Asynchronous Decoupling Verification:**
  - Submitting a job returns an immediate 202 Accepted response with a unique Job ID (response time <100ms).
  - The frontend/client displays queued or processing state without blocking the UI.
  - After the simulated worker duration (e.g., 3–5 seconds), polling the status endpoint confirms the job transition to completed.
- [ ] **2. Burst Traffic & Queue Buffering Test:**
  - Fire at least 5 jobs in rapid succession.
  - Verify in terminal logs or broker management UI (e.g., RabbitMQ Management / Redis CLI) that jobs sit in the queue buffer and are processed smoothly one-by-one (or in controlled worker concurrency) without crashing the API or worker.
- [ ] **3. Worker Resilience & Crash Recovery (Negative Test):**
  - Stop or kill the worker process while jobs are pending in the queue (Ctrl+C or docker stop worker).
  - Submit 2 new jobs via the REST API to confirm ingestion still functions and enqueues messages.
  - Restart the worker process and verify that it picks up the unacknowledged messages and completes them with zero lost data.
- [ ] **4. Browser Console & Terminal Health:**
  - Browser DevTools Network tab displays clean 202 Accepted and 200 OK status codes during polling.
  - Worker and API terminal logs clearly show publish events, worker consumption, and explicit ACK logs.

### **Video Demonstration Requirements (5 to 7 Minutes)**

Your video must include your **screen and webcam/face** simultaneously (e.g., recorded via Loom, OBS, Zoom, or Panopto):

- **0:00 – 1:30 | Architecture & AI Artifact Audit:**\
  Show a diagram of your decoupled architecture (Client REST API Producer Message Broker Queue Worker Consumer Status Store). Highlight at least **one specific flaw, missing acknowledgment, or fake queue shortcut** you caught in the AI's generated draft and corrected.
- **1:30 – 3:15 | Live Functionality & Asynchronous Flow:**\
  Submit a job via the UI or terminal (curl). Show the immediate 202 Accepted response, demonstrate background processing, and verify the status updating to completed.
- **3:15 – 5:15 | QA Checklist & Worker Crash/Buffering Test:**\
  Walk through the **QA Checklist** live:
  - Submit multiple jobs rapidly to demonstrate queue buffering in the broker.
  - Kill the worker process, enqueue a job, restart the worker, and demonstrate message persistence and recovery.
  - Inspect the browser DevTools Network tab and broker logs on screen.
- **5:15 – 6:30 | Conclusion & Takeaways:**\
  Summarize the trade-offs of asynchronous messaging (burst leveling and failure isolation vs. eventual consistency and operational complexity).

### **Deliverables & Submission Template**

Paste the following into your LMS submission box:



\### Week 06 Hands-On Assignment Submission

\* \*\*Live Demo URL:\*\* https\://your-decoupled-app.app (or "N/A - Local Docker Architecture")

\* \*\*GitHub Repository:\*\* https\://github.com/your-username/week06-async-messaging

\* \*\*Video Demonstration:\*\* https\://youtu.be/your-video-id (Unlisted or Public)



\#### Video Timestamps:

\* 0:00 - Architecture Diagram & AI Messaging Audit

\* 1:30 - Live Asynchronous Job Submission (202 Accepted Flow)

\* 3:15 - QA Testing: Queue Buffering & Worker Kill Simulation

\* 5:15 - Conclusion & Temporal Decoupling Reflections



### **GitHub Repository README.md Requirements**

Your repository's README.md must include:

1. **Architecture Topology & Data Flow:** Clean diagram or ASCII schema illustrating the REST Producer, Message Queue, Worker Consumer, and Status Store.
2. **Prerequisites & Run Guide:** Exact commands to:
   - Start the message broker (e.g., docker compose up -d).
   - Start the API server and worker process.
   - Submit a sample payload and poll for status.
3. **AI Disclosure & Prompt Appendix:**
   - AI tool(s) used (ChatGPT, Claude, Gemini, etc.).
   - The exact prompts submitted.
   - A summary of what the AI produced correctly versus what messaging flaws (e.g., auto-ack bugs, in-memory shortcuts, synchronous blocking) you had to manually patch.
4. **QA Test Summary:** Completed checklist documenting asynchronous decoupling, burst handling, and worker crash recovery.

### **Grading Rubric (Total: 100 Points)**

| **Criteria**                                          | **Exceptional (Full Points)**                                                                                                                                       | **Proficient**                                                                                                                                   | **Needs Revision**                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **REST API Design & Ingestion (20 pts)**              | Idiomatic REST API; returns immediate 202 Accepted with unique Job ID; non-blocking; cleanly decouples ingress from background processing.                          | REST API works, but returns 200 OK without clear job status tracking or has minor payload validation gaps.                                       | Synchronous blocking API; awaits the background worker before returning an HTTP response.                            |
| **Message Queue Decoupling & ACK Mechanics (25 pts)** | Uses a real external broker (RabbitMQ/Redis/SQS); persistent durable queues; explicit consumer acknowledgments (ACK/NACK) implemented after processing.             | Uses a real broker, but relies on insecure defaults (e.g., autoAck: true risking lost messages on failure) or lacks durable queue configuration. | Uses an in-memory array/fake queue in the same process; lacks any real message broker decoupling.                    |
| **AI Audit & README Documentation (15 pts)**          | README.md thoroughly documents setup, includes exact prompts, and provides a clear critique of the AI’s messaging hallucinations and synchronization anti-patterns. | README.md includes setup and prompts, but provides minimal reflection on the AI output or configuration verification.                            | Missing setup instructions, missing prompt logs, or no disclosure of AI usage.                                       |
| **QA Checklist & Live Crash Testing (20 pts)**        | Video clearly proves all checklist points live: immediate non-blocking responses, burst traffic buffering, worker kill/restart recovery, and DevTools inspection.   | Demonstrates basic job submission in the video, but skips burst testing or does not prove worker recovery after a simulated crash.               | Skips live testing demonstration or ignores failed messaging states/unhandled exceptions on screen.                  |
| **Video Presentation & Presence (20 pts)**            | Professional webcam + screen recording; clear audio; active camera eye contact; clean visual pacing landing strictly between 5:00 and 7:00 minutes.                 | Good delivery, but relies heavily on notes, has minor audio issues, or runs slightly under/over the time limit (by 30–60s).                      | No webcam/face visible, unintelligible audio, reads script verbatim, or significant timing violations (>2 mins off). |
