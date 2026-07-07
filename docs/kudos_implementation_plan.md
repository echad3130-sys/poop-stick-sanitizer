# Kudos Struct Tracking — APPROVED & IMPLEMENTED

**Status:** Live in `Documents/Phantom/echad-system` (July 2026)

## Decisions (locked)

| Question | Answer |
|----------|--------|
| **Storage** | Primary: `~/.echad_secrets/kudos.json` (vault tier). Pass-back mirror: `outputs/kudos-struct.json` |
| **Economy** | `1.0 kudos per 1k tokens` (prompt + completion) |
| **SQLite** | Retired — struct pass-back only (dbzer0 / AI Horde style) |

## Implemented files

- `agent/kudos_tracker.py` — `KudosStruct` dataclass, `load_state()`, `save_state()`, `deduct()`
- `agent/kudos_ledger.py` — thin facade (stable imports for boot + grok_client)
- `agent/grok_client.py` — deducts on every `chat_completions` via `usage`
- `agent/echad_antigravity/router.py` — envelope includes `usage`, `kudos`, `vault_pull`
- `boot_echad_orchestrator.py` — `--diag` and `--kudos` print vault balances

## Verification

```powershell
cd C:\Users\playp\Documents\Phantom\echad-system
.\.venv\Scripts\python.exe boot_echad_orchestrator.py --kudos
.\.venv\Scripts\python.exe boot_echad_orchestrator.py --diag
# after --ping with Grok key set:
# inspect ~/.echad_secrets/kudos.json
```

## Care Treasury note

The v2969flow link is ours. Alice is team. Vault state stays elevated — never committed to git.