# FakeRadio Design

## Goal

FakeRadio is a local-first, LLM-driven personal music radio. It follows the reference architecture: a PWA player talks to a local Node.js server, and the server coordinates user taste files, music search/playback, speech synthesis, environment inputs, schedule hooks, persistent state, and an LLM brain that behaves like a personal DJ.

This design creates the architecture-complete project skeleton first. Real provider integrations can be implemented later behind stable adapter interfaces.

## Success Criteria

- `/Users/tt/projects/FakeRadio` is an independent git repository.
- The project structure clearly reproduces the reference flow: PWA player, local server, user context, LLM brain, music adapter, voice/I/O adapters, state, scheduler, and HTTP/WebSocket contract.
- The first scaffold contains directory boundaries, TypeScript package layout, API contracts, config samples, prompt/user files, and documentation.
- External services are represented by replaceable adapters, not hard-coded product logic.
- A future worker can continue from the docs without reverse-engineering the intended architecture.

## Assumptions

- Package manager: pnpm.
- Language: TypeScript.
- Frontend: Next.js PWA.
- Local server: Node.js with Fastify.
- Repo style: monorepo with apps, server, packages, docs, prompts, and user files.
- State design: SQLite for durable event/state storage, plus markdown/JSON files for editable user taste and routines.
- First implementation does not call real Netease, FishAudio, Feishu, Weather, UPnP, or LLM APIs. It defines adapters and mock-capable contracts.

## Reference Flow Verification

The second reference image can be reproduced as a four-layer system.

### Layer 1: External Context

Reference items:

- `USER/`: `taste.md`, `routines.md`, `playlists.json`, `mood-rules.md`.
- `BRAIN`: Claude Code style model process returning JSON.
- `MUSIC`: NeteaseCloudMusicApi capabilities such as search, song URL, lyric, recommend.
- `VOICE + I/O`: Fish TTS, Feishu/Lark, weather, UPnP.

FakeRadio mapping:

- `user/taste.md`: long-term taste, disliked patterns, preferred radio tone.
- `user/routines.md`: day rhythm, time blocks, calendar expectations.
- `user/playlists.json`: curated seeds and playlist metadata.
- `user/mood-rules.md`: rules that translate weather, time, user input, and recent playback into mood hints.
- `server/src/adapters/llm/`: model adapter interface and provider-specific implementations.
- `server/src/adapters/music/`: search, resolve stream URL, lyrics, recommendations.
- `server/src/adapters/tts/`: DJ speech synthesis to cached audio files.
- `server/src/adapters/io/`: weather, calendar, Feishu/Lark, UPnP, and other outside signals.

This layer is reproducible because each outside dependency has a named file boundary and a stable TypeScript interface.

### Layer 2: Local Brain

Reference items:

- `router.js`: intent routing.
- `context.js`: prompt assembly from taste, routines, environment, history, and system prompt.
- `claude.js`: LLM adapter that parses `{ say, play, reason, segue }`.
- `scheduler.js`: rhythm scheduling.
- `tts.js`: speech synthesis cache.
- `state.db`: messages, plays, plan, prefs, long-term memory.

FakeRadio mapping:

- `server/src/router/intent-router.ts`: routes chat, next-track, planned-radio, and natural-language commands.
- `server/src/context/context-builder.ts`: builds the context window from six fragments.
- `server/src/brain/dj-brain.ts`: calls the LLM adapter and validates structured DJ decisions.
- `server/src/scheduler/radio-scheduler.ts`: generates time-aware radio plans and hooks.
- `server/src/tts/tts-cache.ts`: converts DJ speech to cached audio paths.
- `server/src/state/`: database schema, repositories, and file-backed preference loaders.

This layer is reproducible because the reference script names become focused modules with explicit responsibilities.

### Layer 3: Runtime Context Window

Reference fragments:

- System prompt.
- User taste.
- Environment injection.
- Stored memory.
- User input and tool results.
- Execution track.

FakeRadio mapping:

- `prompts/dj-persona.md`: DJ identity, behavior, and output style.
- `user/*.md` and `user/playlists.json`: editable personal context.
- `server/src/context/environment-fragment.ts`: now, weather, calendar, device availability.
- `server/src/state/memory-repository.ts`: recent messages, plays, plans, and learned preferences.
- `server/src/context/request-fragment.ts`: `/api/chat`, `/api/next`, and music search/tool outputs.
- `server/src/context/execution-fragment.ts`: scheduler state, current queue, current playback, TTS cache status.

The model output contract is:

```ts
type DjDecision = {
  say: string;
  play: {
    query?: string;
    trackId?: string;
    reason: string;
  };
  reason: string;
  segue: string;
};
```

This reproduces the reference model step: `compute(fragments) -> { say, play, reason, segue }`, followed by queue resolution, TTS synthesis, and now-playing broadcast.

### Layer 4: Interaction Layer

Reference items:

- PWA on localhost.
- Player, Profile, Settings views.
- Single audio element.
- WebSocket chat/stream.
- Service worker cache and prefetch.
- HTTP contract: `POST /api/chat`, `GET /api/now`, `GET /api/next`, `GET /api/taste`, `GET /api/plan/today`, `WS /stream`.

FakeRadio mapping:

- `apps/web/`: Next.js PWA with Player, Profile, Settings, and a single audio pipeline.
- `packages/shared/src/contracts/`: shared request/response types used by both web and server.
- `server/src/http/routes/`: Fastify routes for the HTTP contract.
- `server/src/realtime/stream.ts`: WebSocket events for now-playing, queue updates, DJ speech, and diagnostics.
- `apps/web/src/lib/api-client.ts`: client wrapper for the local server contract.

This layer is reproducible because the same endpoints from the reference image are retained as the first public contract.

## Architecture

```text
apps/web
  Next.js PWA player
  Profile and Settings views
  HTTP client and WebSocket stream client

server
  Fastify local API server
  intent router
  context builder
  DJ brain
  scheduler
  adapters
  state

packages/shared
  API contracts
  shared schemas
  event types
  common utilities

user
  editable personal taste and routine files

prompts
  model prompts and context templates

docs
  architecture, setup, API contract, adapter guide
```

The frontend never calls outside services directly. It talks only to the local server. The server owns orchestration, provider credentials, state, and long-running decisions.

## Proposed File Structure

```text
FakeRadio/
  AGENTS.md
  README.md
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  .gitignore
  .env.example
  apps/
    web/
      package.json
      next.config.ts
      public/
        manifest.webmanifest
      src/
        app/
        components/
        features/player/
        features/profile/
        features/settings/
        lib/api-client.ts
  server/
    package.json
    tsconfig.json
    src/
      index.ts
      config/
      http/
      realtime/
      router/
      context/
      brain/
      scheduler/
      adapters/
        llm/
        music/
        tts/
        io/
      state/
      types/
  packages/
    shared/
      package.json
      tsconfig.json
      src/
        contracts/
        schemas/
        events/
        index.ts
  user/
    taste.md
    routines.md
    playlists.json
    mood-rules.md
  prompts/
    dj-persona.md
    context-window.md
  docs/
    architecture.md
    api-contract.md
    adapters.md
    local-runbook.md
    superpowers/
      specs/
```

## HTTP and WebSocket Contract

Initial routes:

- `GET /api/health`: local server health and adapter readiness.
- `GET /api/now`: current track, DJ speech, playback state, and queue preview.
- `GET /api/next`: ask the server to compute or fetch the next playable item.
- `POST /api/chat`: user message or command to the DJ brain.
- `GET /api/taste`: normalized view of user taste files.
- `GET /api/plan/today`: scheduler plan for the current day.
- `WS /stream`: now-playing, queue, DJ speech, chat, and diagnostic events.

The route list intentionally matches the reference image and adds only `GET /api/health` for local diagnostics.

## Adapter Boundaries

Each adapter has a port interface and at least one mock implementation in the first scaffold.

- LLM adapter: receives context fragments, returns a validated `DjDecision`.
- Music adapter: searches, recommends, resolves stream URLs, fetches lyrics.
- TTS adapter: receives text and voice settings, returns a cached audio file URL/path.
- Weather adapter: returns current weather and coarse mood hints.
- Calendar adapter: returns near-term schedule context.
- UPnP adapter: discovers and pushes playback to local devices.

Real providers are implementation details. The rest of the system depends on interfaces.

## State Model

Durable state is split into human-editable files and application state.

- Human-editable files live in `user/`.
- Application state lives under `server/src/state/` and is planned for SQLite.
- TTS audio cache lives under `server/cache/tts/`.
- Music cache and temporary provider responses live under `server/cache/music/`.

The first scaffold includes schema documentation and repository interfaces. Real SQLite persistence comes after the mock flow and contract tests exist.

## Testing Strategy

The first scaffold provides test entry points for the architecture contracts, not complete provider behavior.

- Shared contracts: schema validation tests.
- Context builder: deterministic fragment ordering tests.
- DJ brain: mock LLM output validation tests.
- HTTP routes: health and contract shape tests.
- Web app: smoke test for Player/Profile/Settings route rendering once UI is implemented.

## Out of Scope for First Scaffold

- Real Netease login or streaming implementation.
- Real FishAudio synthesis.
- Real Feishu/Lark calendar integration.
- Real UPnP playback.
- Production deployment.
- Multi-user accounts.
- Recommendation quality tuning.
- Full visual design polish.

## Implementation Defaults

- LLM provider: mock adapter first, real provider later behind `server/src/adapters/llm/`.
- Local development: web app and server run on separate ports, with a root script to start both.
- Persistence: repository interfaces and schema notes first; SQLite implementation after the mock flow is running.
- Provider integrations: all external services are mocked until the shared contracts and local API routes are verified.
