# ORIGIN.md — Who Are We?

> **Echad3130** — One system. Local-first. Sovereign.

---

## Mission

Build a self-hosted creative production pipeline that:
- Runs on hardware we own
- Doesn't depend on API credits disappearing
- Produces real output (video, art, commerce)
- Stays operational when any single AI platform goes down

## Core Principle

```
Own the hardware.
Own the data.
Own the pipeline.
Swap the models.
```

## Stack (v1.0)

| Port | Service | Runtime | Purpose |
|------|---------|---------|---------|
| `:5001` | KoboldCPP | Qwen / DeepSeek | Local LLM inference |
| `:8000` | Skill Creator | FastAPI + Python | Skill/asset pipeline |
| `:8787` | Command Hub | Node / HTML | Task routing + telemetry |
| `:8080` | Antigravity | HTML / JS | Dashboard + exchange |

## Operator Anchors

```
Carlie (CMACON): Primary operator
Elisha:          Secondary operator
Echad3130:       System architect
```

## Treasury (Private Path)

```
C:\Users\playp\.gemini\treasury\
├── daz3d_exports/     PNG sequences from Daz Studio
├── video_output/      Final rendered .mp4s
├── manifests/         Character manifests (JSON)
└── comfyui_cache/     Refinement intermediates
```

**Not** in `C:\Users\Public\Documents\`.  
**Not** in cloud storage.  
Private. Local. Sovereign.

## Repository

```
github.com/echad3130-sys/poop-stick-sanitizer

├── runtime/           Minnow OS modules (17 modules, 0 deps)
│   ├── adapter.js     PAGI contract
│   ├── bitonic.js     Sort::DJB choreography
│   ├── packed.js      TypedArray column store
│   ├── stats.js       R-style analysis
│   ├── tvm.js         Token Velocity Matrix
│   ├── harmonograph.js  Math → beauty
│   └── ...
├── video_engine/      Daz3D → ComfyUI → Runway pipeline
│   ├── manifests/     Character definitions
│   └── workflows/     ComfyUI workflow JSON
├── extension/         Chrome extension (Harmona Graph)
├── ui/                Web interfaces
│   ├── hotel.html     TEE(n) Land lobby
│   ├── grok-drawer.html  Asset catalog
│   └── harmonograph.html  Frequency → Shape
├── test/              Zero-dep test framework
└── performance/       Benchmark suite
```

## Design Philosophy

```
Data → Constraint → Choreography → Shape
```

From Sort::DJB (bitonic sorting networks) to harmonographs (Lissajous curves)
to MAST (coherence validation) — the same pattern applies:

```
Simple Rule
    ↓
Repeated Motion
    ↓
Beautiful Structure
```

"Use the right representation for the right problem."
— The Sort::DJB lesson

## What We Don't Do

- No Docker (runs native on Windows + Ubuntu)
- No npm/pip dependency trees deeper than 1
- No API-key-gated critical paths
- No localStorage pollution
- No affiliate link tracking
