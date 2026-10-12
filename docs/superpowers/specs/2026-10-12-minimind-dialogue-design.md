# MiniMind NPC dialogue

用户已确认：MLP 即时动作、重要事件即时反馈、MiniMind3 后台生成与补充台词；将 MiniMind 放入游戏 Git 仓库。

## Architecture

The browser simulation remains synchronous and deterministic. Existing captions and injury cries respond immediately. A separate dialogue director watches caption revisions and emits optional generated captions after checking journey, caption revision, actor, action, emotional/physical state and weather. It never writes game decisions or resources.

A loopback Python HTTP service loads the existing GGUF/DLL runtime once. One bounded inference slot isolates KV memory between requests, uses fresh sampling seeds, suppresses thinking, caps tokens and wall time, and validates short Chinese output. Vite development and preview proxy `/npc-api` to it; the browser never addresses its own loopback on a remote phone. Service failure leaves the game playable and visible as template mode. Normal busy/rejected/deadline outcomes return HTTP 200 with `source=template` and `outcome=busy/skipped`, avoiding browser resource errors for expected optional work.

The native owner retains the inference slot until decoding and KV cleanup finish, even when the browser aborts or disconnects. Deadlines are checked between decoding steps; no timeout handler frees an in-use context. Generated-caption writes are marked consumed before publishing so they cannot enqueue themselves. Both behaviors have regression coverage.

## Responsiveness

One foreground request at a time, with latest per-NPC queued work and selected-NPC priority. State-specific generated lines are cached in a bounded pool; successful foreground work schedules one low-priority refill, consumed immediately on the next matching event. Memory is bounded recent game events for that NPC. No generic generated sentence is replayed across different decisions or needs. Pause, hidden page, new journey and disposal cancel pending work and clear obsolete revisions. A new critical event supersedes an older response.

## Distribution

Move all 111 existing MiniMind files into `minimind3/`, validating file count and total bytes. Commit Python integration, existing training source and its Apache-2.0 license; ignore GGUF, training checkpoints/datasets and native runtime binaries. Provide pinned download/setup instructions with integrity checks for the tested GGUF and DLL ABI. Static deployments retain the template fallback unless a matching backend proxy is supplied.

## Acceptance

Tests cover pending inference while actions advance, stale and cross-journey responses, pause/death, bounded pools, no repeated/reasoning output, request validation and busy service. Verify actual model short lines, independence across NPCs, timings, health and same-origin proxy; run full Vitest/build and browser regression. Show service mode, generated/cache counts and measured generation time in the camp drawer. Generated captions can use already-enabled local Chinese TTS without queueing backlog.
