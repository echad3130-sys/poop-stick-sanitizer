# Kudos Struct Tracking & Grok Review

This plan details the implementation of a machine-learning model struct for tracking tokens (kudos), passing it back and forth as a JSON state rather than relying on a heavy SQLite database, just like dbzer0's AI Horde implementation. We also review Grok's recent router integration.

## User Review Required

> [!IMPORTANT]  
> **Kudos Storage**: I am proposing we store the `kudos.json` struct inside your secure vault `C:\Users\playp\.echad_secrets\` alongside `.env` so it isn't accidentally committed. Is this acceptable, or would you prefer it live directly in `echad-system/outputs/`?
>
> **Kudos Economy**: We will track `prompt_tokens` and `completion_tokens`. Should we implement a simple 1:1 deduction from a starting pool, or do you want a specific token-to-kudos multiplier?

## Grok's Work Review
Grok successfully implemented the `grok_client.py` and updated `router.py` to intercept requests for `GROK` and `GROK_V2969` backends! The code gracefully maps the `GrokResponse` back into our `TeeRender` envelope. Excellent work by the rare bugfish.

## Proposed Changes

### Kudos Tracker Module

#### [NEW] `C:\Users\playp\Documents\Phantom\echad-system\agent\kudos_tracker.py`
We will create a lightweight Python module defining a `dataclass` (struct) for Kudos tracking.
- Uses `dataclasses.asdict` to effortlessly serialize/deserialize to JSON.
- Loads state on boot, processes token usage, and dumps state back to disk.

### Grok Client Integration

#### [MODIFY] `C:\Users\playp\Documents\Phantom\echad-system\agent\grok_client.py`
Update `chat_completions` and `complete_prompt` to intercept the `usage` dictionary returned by the Grok API (which contains `prompt_tokens` and `completion_tokens`).
- Pass the token counts into the `KudosTracker.deduct()` method.

### Orchestrator / UI

#### [MODIFY] `C:\Users\playp\Documents\Phantom\echad-system\boot_echad_orchestrator.py`
Update the diagnostic output (`--diag`) to read the `KudosStruct` and print the current token balance and lifetime usage to the console.

## Verification Plan

### Automated Tests
- Run `python boot_echad_orchestrator.py --diag` and verify that the Kudos balance is printed alongside the Grok API status.

### Manual Verification
- Execute a test prompt using the `GROK` backend.
- Inspect `kudos.json` to verify that the tokens were properly deducted and the file was cleanly written to disk.
