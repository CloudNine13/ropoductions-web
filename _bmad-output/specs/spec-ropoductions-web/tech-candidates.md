# Architecture, Tech Stack & Tooling Exploration Candidates

*Status: Open evaluation space. To be brainstormed, benchmarked, and decided during the Architecture phase.*

## 1. Frontend Framework Candidates

| Candidate | Strengths | Trade-offs / Risks |
|---|---|---|
| **Next.js (App Router)** | Full-stack standard, built-in Route Handlers for OAuth, React Server Components for SEO-friendly landing page, deep ecosystem. | Heavier runtime footprint; edge compatibility requires OpenNext or `@cloudflare/next-on-pages`. |
| **Astro (SSR Mode)** | Ultra-fast landing page load times (near-zero JS), excellent image pipeline, islands architecture for HUD and game shell. | Smaller auth library ecosystem compared to Next.js; slightly less integrated full-stack server mutations. |
| **SvelteKit** | Extremely lightweight client footprint, minimal reactivity overhead for game HUD controls, fast server endpoints. | Smaller developer talent pool and fewer plug-and-play third-party UI component libraries. |

## 2. Edge / Hosting / Backend Candidates

| Candidate | Strengths | Trade-offs / Risks |
|---|---|---|
| **Cloudflare Serverless Ecosystem** | Workers / Pages for edge OAuth, R2 for zero-egress encrypted asset storage, D1 / KV for fast session cache. Global low latency. | Worker CPU execution limits; local development emulation quirks (`wrangler`). |
| **Node.js / VPS / Docker Container** | Fastify or Hono server on a standard Linux container. Simple local filesystem asset hosting, straightforward Redis session storage. | Requires infrastructure maintenance, patching, SSL management, manual multi-region CDN configuration. |
| **Vercel + Supabase** | Instant deployment, turnkey edge functions, managed Postgres and Auth via Supabase. | Egress and storage bandwidth pricing scales quickly for 30MB game assets compared to Cloudflare R2. |

## 3. UI, Styling & Motion Tooling Candidates
* **Styling Foundation:** Tailwind CSS for rapid utility-first theming.
* **Component Primitives:** Radix UI / Shadcn UI for fully accessible, unstyled dialogs (21+ age modal, save import dialog) styled to match studio prestige aesthetics.
* **Atmospheric Motion:** Framer Motion or Motion One for hero visual reveals and ambient studio atmosphere.
* **Responsive Canvas Container:** Custom aspect-ratio locked CSS container with CSS viewport units (`100dvh`, `100dvw`) to prevent mobile browser chrome shifts.

## 4. MCPs & Agentic Skills Candidates
* **Context7 MCP (`xd://mcp__context_query_docs`):** Fetch real-time API reference for Patreon API v2, Next.js route handlers, and Cloudflare Worker runtime APIs.
* **GitHub MCP:** Automate repository scaffolding, issue tracking, and deployment branch workflows.
* **BMad Multi-Agent Collaborators:**
  * Winston (`bmad-agent-architect`): Evaluates trade-offs between Next.js on Cloudflare vs standalone VPS.
  * Sally (`bmad-agent-ux-designer`): Wireframes the landing, age gate, and in-game HUD overlay.
