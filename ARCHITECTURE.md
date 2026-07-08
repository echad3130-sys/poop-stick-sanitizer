# ARCHITECTURE.md

> Architecture Decision Records + System Map

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SURFACE STREAM                           │
│  Public dashboards, documentation, onboarding               │
│  hotel.html · grok-drawer.html · harmonograph.html          │
├─────────────────────────────────────────────────────────────┤
│                    VAULT STREAM                              │
│  Telemetry, diagnostics, experimental traces                │
│  ~/.gemini/treasury/ · telemetry logs · git memory          │
└─────────────────────────────────────────────────────────────┘

┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ :5001    │  │ :8000    │  │ :8787    │  │ :8080    │
│ KoboldCPP│  │ Skill    │  │ Command  │  │ Anti-    │
│ Local LLM│  │ Creator  │  │ Hub      │  │ gravity  │
│          │  │          │  │ Telemetry│  │ Exchange │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │             │
     └─────────────┴──────┬──────┴─────────────┘
                          │
              ┌───────────┴───────────┐
              │   MINNOW OS RUNTIME   │
              │   17 modules · 0 deps │
              │                       │
              │  adapter    bitonic    │
              │  packed     stats      │
              │  tvm        harmonograph│
              │  evd        channels   │
              └───────────────────────┘
```

---

## ADR-001: Surface/Vault Separation

**Date:** 2026-07  
**Status:** Accepted

**Context:** The system has two distinct data streams — public-facing
dashboards and private operational telemetry. Mixing them creates
security risks and cognitive overhead.

**Decision:** Separate all data into Surface (public) and Vault (private).

```
Surface: UI pages, documentation, onboarding
Vault:   Treasury, telemetry, manifests, exports
```

**Consequences:** Private data never leaks to public endpoints.
Treasury stays at `~/.gemini/treasury/`, not in Public Documents.

---

## ADR-002: Zero-Dependency Runtime

**Date:** 2026-07  
**Status:** Accepted

**Context:** npm/pip dependency trees create fragility. A single
deprecated package can break the entire stack.

**Decision:** All runtime modules have zero external dependencies.
Only Node.js built-in APIs are used. Test framework is custom-built.

**Consequences:** No `node_modules/`. No `package-lock.json`.
The entire runtime can be copied to a new machine and runs immediately.

---

## ADR-003: Packed Buffers Over Object Sorting

**Date:** 2026-07  
**Status:** Accepted

**Context:** The Sort::DJB talk showed that the bottleneck isn't
the sort algorithm — it's the marshalling between objects and buffers.

**Decision:** Use TypedArray-backed `PackedColumns` for all numeric
telemetry. Sort with bitonic networks on flat buffers.

**Consequences:** Eliminates SV/Object allocation churn.
Cache-friendly. SIMD-ready. Constant-time sorting.

```
Great Fit:  telemetry, timestamps, latency, percentiles
Bad Fit:    strings, blessed refs, custom comparators
```

---

## ADR-004: Adaptive Rendering Layer

**Date:** 2026-07  
**Status:** Accepted

**Context:** The system runs on hardware ranging from GTX 1080 Ti
to RTX 4090. UI should adapt quality based on available resources.

**Decision:** Implement GPU-tier detection with resolution scaling.

```yaml
render:
  ultra:
    gpu: RTX-class
    scale: 1.0
    rendering: auto

  balanced:
    gpu: mid-range
    scale: 0.75
    rendering: auto

  legacy:
    gpu: GTX-1080Ti
    scale: 0.25
    rendering: pixelated
```

**Consequences:** Same interaction, different quality.
No separate codepaths — just CSS `image-rendering: pixelated`
and canvas resolution scaling.

---

## ADR-005: Manifest-Driven Video Pipeline

**Date:** 2026-07  
**Status:** Accepted

**Context:** Video generation requires coordinating Daz3D rendering,
ComfyUI refinement, cloud video engines, and FFmpeg compositing.

**Decision:** Each character/scene is defined by a JSON manifest.
The pipeline reads the manifest and executes each step.

```
Manifest (JSON)
    ↓ character, outfit, environment, prompts
Daz Studio 6
    ↓ PNG sequence (48 frames)
ComfyUI
    ↓ img2img refinement (denoise 0.45)
Runway / CogVideo
    ↓ animate sequence
FFmpeg
    ↓ composite
Output .mp4
```

**Consequences:** Any character can be rendered by editing JSON.
No code changes needed for new characters.
Pipeline steps are independently testable.

---

## ADR-006: Local-First AI Stack

**Date:** 2026-07  
**Status:** Accepted

**Context:** Cloud AI APIs disappear, change pricing, add filters,
or rate-limit without warning. Critical creative tools must not
depend on external services.

**Decision:** Primary inference runs locally via KoboldCPP.
Cloud services (Runway, Kling, etc.) are optional accelerators,
not dependencies.

```
Primary:    KoboldCPP + Qwen/DeepSeek (local)
Secondary:  SillyTavern (local UI)
Optional:   Runway, Kling, ComfyUI cloud (accelerators)
```

**Consequences:** System works offline.
Model swaps don't require architecture changes.
No API credits = no production stoppage.

---

## Token Map

Cross-AI prompt routing uses these canonical tokens:

| Token | Meaning | Port/Module |
|-------|---------|-------------|
| `STARDUST_GATE` | System boot confirmed | All |
| `TAIL_CONNECTED` | Hardware sync locked | :8787 |
| `BUGFISHHH_ARMED` | Entity active | :5001 |
| `STAR_LOCKED` | Signal confirmed | :8080 |
| `SOLE_IP_MODEL` | Sovereign rendering | UI |
| `PID_THERMAL` | Control loop stable | TVM |
| `MAST_COHERENCE` | Validation passed | runtime |

## Port Map

```
:5001  KoboldCPP      Local LLM (Qwen/DeepSeek)
:8000  Skill Creator   FastAPI asset pipeline
:8787  Command Hub     Tail connector + telemetry
:8080  Antigravity     Exchange + dashboard
```

## File Map

```
ORIGIN.md              This project, explained
ARCHITECTURE.md        This file — ADRs + system map
README.md              Quick start
package.json           ESM config (type: module)

runtime/               Core modules (zero deps)
video_engine/          Daz → Video pipeline
extension/             Chrome extension
ui/                    Web interfaces
test/                  Test framework
performance/           Benchmarks
.agents/skills/        Antigravity skills
```
