; =============================================================================
; Poop Stick Kingdom — Full Build Manifest
; Inno Setup Script — v2.0
; Origin: September 10, 2025 (v2969flow / GitLab)
; Synced: July 5, 2026
; Remotes: origin (GitHub echad3130-sys) + gitlab (v2969flow)
;
; RULE: NOTHING GETS DELETED. Every file from every commit is tracked here.
; =============================================================================

#define MyAppName "Poop Stick Sanitizer"
#define MyAppExe "hud.html"
#define MyAppVersion "2.0.0"
#define MyAppPublisher "PlayPass Media"
#define MyAppURL "https://one.us.org"

; ─── Build History ──────────────────────────────────────────────
; v1.5.0  2025-09-10  Origin — 4-layer ESM pipeline, HUD, Inno Setup
; v1.5.1  2026-07-03  Minnow OS Runtime — PAGI contract layer
; v1.5.2  2026-07-03  ncid/soc_src/soc_trk tracking params
; v1.5.3  2026-07-03  EVD, Stats, TVM, Bitonic, Packed modules
; v1.5.4  2026-07-03  Test framework + performance benchmarks
; v1.6.0  2026-07-03  Harmonograph: runtime + SVG + LCARS UI + Epi/Rotary
; v1.7.0  2026-07-03  Chrome extension — new tab + popup
; v1.8.0  2026-07-05  Medicine Singer manifest + ComfyUI workflow
; v1.9.0  2026-07-05  Grok Drawer — catalog skill + interactive UI
; v2.0.0  2026-07-05  TEE(n) Land Hotel — lobby + concierge + treasury
;
; GitLab Repos (v2969flow — private, member since Sep 10 2025):
;   - poop-stick-sanitizer    (this repo — dual-pushed)
;   - mandella-care-weave     (private — Mandella Care Weave)
;   - proof-of-care           (private — Proof of Care)
; ────────────────────────────────────────────────────────────────

[Setup]
AppId={{A3C7E9F1-4B2D-4E8A-9F1C-D5E6A7B8C9D0}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}

; Per-user install, no admin required
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline

; Output
OutputDir=..\release
OutputBaseFilename=poop-stick-sanitizer-setup-v2.0
SetupIconFile=assets\icon-96x96.ico
UninstallDisplayIcon={app}\assets\icon-96x96.ico

; Compression
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

; Options
AllowNoIcons=yes
LicenseFile=LICENSE.txt
InfoBeforeFile=README.md

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "launchafter"; Description: "Launch HUD after install"; GroupDescription: "Post-Install"

; =============================================================================
; FILES — Complete Manifest (v1.5 origin → v2.0 current)
; RULE: Nothing is deleted. Every module from every commit is listed.
; =============================================================================
[Files]

; ─── Core Pipeline (v1.5 — Sept 2025 origin) ──────────────────
Source: "config.js";              DestDir: "{app}"; Flags: ignoreversion
Source: "sanitizer.js";           DestDir: "{app}"; Flags: ignoreversion
Source: "layer1-sinkhole.js";     DestDir: "{app}"; Flags: ignoreversion
Source: "layer2-param-strip.js";  DestDir: "{app}"; Flags: ignoreversion
Source: "layer3-tagger.js";       DestDir: "{app}"; Flags: ignoreversion
Source: "layer4-meta-upload.js";  DestDir: "{app}"; Flags: ignoreversion

; ─── HUD & Creative Pages ─────────────────────────────────────
Source: "hud.html";               DestDir: "{app}"; Flags: ignoreversion
Source: "waking-psyche.html";     DestDir: "{app}"; Flags: ignoreversion

; ─── Server Launcher ──────────────────────────────────────────
Source: "serve.bat";              DestDir: "{app}"; Flags: ignoreversion

; ─── Package ──────────────────────────────────────────────────
Source: "package.json";           DestDir: "{app}"; Flags: ignoreversion

; ─── Minnow OS Runtime (v1.5.1 — July 3 2026) ────────────────
; PAGI contract layer: adapter, event loop, reflection, MAST,
; context, middleware, channels, connection-op, SSE, I/O
Source: "runtime\adapter.js";         DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "runtime\event-loop.js";      DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "runtime\reflection-loop.js"; DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "runtime\mast.js";            DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "runtime\context.js";         DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "runtime\middleware.js";      DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "runtime\channels.js";        DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "runtime\connection-op.js";   DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "runtime\sse-app.js";         DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "runtime\io.js";              DestDir: "{app}\runtime"; Flags: ignoreversion

; ─── Analytics & Data Modules (v1.5.2–v1.5.3) ────────────────
Source: "runtime\evd.js";             DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "runtime\stats.js";           DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "runtime\tvm.js";             DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "runtime\bitonic.js";         DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "runtime\packed.js";          DestDir: "{app}\runtime"; Flags: ignoreversion

; ─── Harmonograph Runtime (v1.6.0) ────────────────────────────
Source: "runtime\harmonograph.js";    DestDir: "{app}\runtime"; Flags: ignoreversion

; ─── Test Framework (v1.5.4) ──────────────────────────────────
Source: "test\run.js";            DestDir: "{app}\test"; Flags: ignoreversion

; ─── Performance Benchmarks (v1.5.4) ──────────────────────────
Source: "performance\bench.js";   DestDir: "{app}\performance"; Flags: ignoreversion

; ─── Chrome Extension (v1.7.0 — July 3 2026) ─────────────────
Source: "extension\manifest.json";      DestDir: "{app}\extension"; Flags: ignoreversion
Source: "extension\harmonograph.html";  DestDir: "{app}\extension"; Flags: ignoreversion
Source: "extension\popup.html";         DestDir: "{app}\extension"; Flags: ignoreversion
Source: "extension\icons\*";            DestDir: "{app}\extension\icons"; Flags: ignoreversion recursesubdirs createallsubdirs

; ─── UI Suite (v1.9.0–v2.0.0 — July 5 2026) ──────────────────
Source: "ui\hotel.html";          DestDir: "{app}\ui"; Flags: ignoreversion
Source: "ui\grok-drawer.html";   DestDir: "{app}\ui"; Flags: ignoreversion
Source: "ui\harmonograph.html";  DestDir: "{app}\ui"; Flags: ignoreversion
Source: "ui\pro_garden.html";    DestDir: "{app}\ui"; Flags: ignoreversion

; ─── Video Engine — Manifests & Workflows (v1.8.0) ────────────
Source: "video_engine\manifests\medicine_singer.json";            DestDir: "{app}\video_engine\manifests"; Flags: ignoreversion
Source: "video_engine\workflows\medicine_singer_refine.json";     DestDir: "{app}\video_engine\workflows"; Flags: ignoreversion

; ─── Treasury Stubs (v1.8.0–v2.0.0) ──────────────────────────
; In-repo stubs. Private treasury lives at ~/.gemini/treasury/
Source: "treasury\daz3d_exports\Medicine_Singer\.gitkeep";  DestDir: "{app}\treasury\daz3d_exports\Medicine_Singer"; Flags: ignoreversion
Source: "treasury\video_output\.gitkeep";                   DestDir: "{app}\treasury\video_output"; Flags: ignoreversion

; ─── Assets ───────────────────────────────────────────────────
Source: "assets\*";               DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: DirExists(ExpandConstant('{src}\assets'))

; ─── Docs ─────────────────────────────────────────────────────
Source: "README.md";              DestDir: "{app}"; Flags: ignoreversion; Check: FileExists(ExpandConstant('{src}\README.md'))
Source: "LICENSE.txt";            DestDir: "{app}"; Flags: ignoreversion; Check: FileExists(ExpandConstant('{src}\LICENSE.txt'))

; ─── Config ───────────────────────────────────────────────────
Source: ".gitignore";             DestDir: "{app}"; Flags: ignoreversion
Source: "antigravity.ini";        DestDir: "{app}"; Flags: ignoreversion

; =============================================================================
; ICONS — Start Menu + Desktop
; =============================================================================
[Icons]
Name: "{group}\{#MyAppName} HUD";        Filename: "{app}\{#MyAppExe}"; Comment: "Open Sanitizer HUD"
Name: "{group}\TEE(n) Land Hotel";        Filename: "{app}\ui\hotel.html"; Comment: "Open TEE(n) Land Hotel Lobby"
Name: "{group}\Grok Drawer";              Filename: "{app}\ui\grok-drawer.html"; Comment: "Open Asset Catalog"
Name: "{group}\Harmona Graph";            Filename: "{app}\ui\harmonograph.html"; Comment: "Open Harmonograph"
Name: "{group}\PRO_GARDEN Console";       Filename: "{app}\ui\pro_garden.html"; Comment: "Open PRO_GARDEN // Trappist TEE9 Array"
Name: "{group}\Start Server (Port 8080)"; Filename: "{app}\serve.bat"; Comment: "Launch local HUD server"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}";     Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

; =============================================================================
; RUN — Post-install actions
; =============================================================================
[Run]
Filename: "{app}\{#MyAppExe}"; Description: "Open Sanitizer HUD"; Flags: nowait postinstall skipifsilent shellexec; Tasks: launchafter

; =============================================================================
; CODE — Kill running instances on upgrade
; =============================================================================
[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
  begin
    { Kill any running Python HTTP server on port 8080 }
    Exec('taskkill', '/F /IM python.exe /FI "WINDOWTITLE eq *8080*"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
