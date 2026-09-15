# Epic 2 Context: Patreon Member Authentication & Access Paywall

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Authenticate studio patrons and enforce commercial access controls through Patreon OAuth 2.0 with PKCE and server-side session persistence in Cloudflare D1. This epic verifies active supporter memberships across five approved pledge tiers ($5 to $50) to unlock the playable web client, implements persistent administrative and complimentary bypass overrides with automatic initial admin bootstrapping, ensures zero client exposure of sensitive OAuth tokens, provides transactional revocation checks, and delivers a respectful, brand-aligned paywall interstitial for unpledged or lapsed visitors without ever disrupting active gameplay sessions mid-game.

## Stories

- Story 2.1: Cloudflare D1 Sessions & Overrides Schema Migration
- Story 2.2: Patreon OAuth 2.0 PKCE Authorization & Admin Secret Bootstrap
- Story 2.3: Active Tier Verification ($5+ Threshold) & Override Short-Circuit Evaluation
- Story 2.4: Paywall Interstitial & Transactional Override Revocation

## Requirements & Constraints

- **Patreon OAuth 2.0 with PKCE:** Secure authentication must use an OAuth 2.0 authorization code flow with PKCE (`code_verifier` and `code_challenge`), requesting `identity` and `campaigns.members` scopes. State parameters and temporary PKCE verifiers must be verified on callback to prevent CSRF and replay attacks.
- **Active Tier Verification ($5+ Threshold):** Query the Patreon API v2 (`/campaigns/{campaign_id}/members`) to verify an active monthly pledge meeting or exceeding $5.00 across five eligible tiers: Ork Patron ($5), Ogre Pimp ($10), Elf Sybarite ($15), Horseman Aesthete ($25), or Mind Fucker Avatar ($50). In v1, all five tiers receive uniform access without tier-based feature fragmentation.
- **Persistent Overrides & Fast Path:** Support persistent access overrides in `patron_overrides` for `admin` (studio staff) and `comp` (complimentary testers). When an override exists, the system bypasses external Patreon campaign API calls entirely, creating the session with the override role and zero pledge amount.
- **Initial Admin Secret Bootstrap:** When a user authorizes via Patreon, compare their `patron_id` against the `INITIAL_ADMIN_PATREON_IDS` environment secret (parsed as an exact trimmed Set). If matched, automatically upsert an `admin` record in `patron_overrides` with `granted_by = 'system_bootstrap'`, granting immediate access without manual database seeding.
- **Token Security & Client Isolation:** Raw Patreon access and refresh tokens must never reach client-side JavaScript. Tokens must be encrypted at rest (AES-256-GCM) and stored server-side in Cloudflare D1. The client receives only an opaque, signed, HTTP-only, `SameSite=Lax`, `Secure` session cookie (`ropoductions_session`).
- **Paywall Interstitial for Protected Routes:** Visitors or unpledged users attempting to access `/play` without an active, authorized session must be redirected to an informative paywall interstitial highlighting the five supporter tiers and a direct link to pledge or log in.
- **Graceful Session Re-check (No Mid-Game Disconnections):** Patron subscription status is re-evaluated on route navigation, page loads, and game entry. Active gameplay sessions in open tabs must never be abruptly terminated due to token expiry or lapsed status (zero in-game kicks).
- **Transactional Override Revocation:** When an admin or comp user navigates the portal, perform a point lookup against `patron_overrides`. If the override row has been deleted, immediately mark the session as revoked (`revoked = 1`), clear the `ropoductions_session` cookie (`Max-Age: 0`), and redirect to the home paywall with a revocation notice.
- **Reliability & Resilience:** First-time authentication flow from "Login with Patreon" to game title screen must complete in under 30 seconds. Temporary Patreon API outages must not interrupt returning players who hold valid, unexpired sessions in D1.

## Technical Decisions

- **Cloudflare D1 SQLite & Schema Design:**
  - `sessions` table (`migrations/0001_initial_sessions.sql`): `id TEXT PRIMARY KEY` (UUIDv4), `patron_id TEXT NOT NULL`, `email TEXT`, `role TEXT DEFAULT 'patron' NOT NULL CHECK(role IN ('admin', 'comp', 'patron'))`, `tier_id TEXT NOT NULL`, `tier_name TEXT NOT NULL`, `pledge_cents INTEGER NOT NULL`, `encrypted_access_token TEXT NOT NULL`, `encrypted_refresh_token TEXT NOT NULL`, `token_expires_at_sec INTEGER NOT NULL`, `expires_at_sec INTEGER NOT NULL`, `revoked INTEGER DEFAULT 0 NOT NULL`, `created_at_sec INTEGER NOT NULL`, `last_verified_at_sec INTEGER NOT NULL`.
  - Indexes on `sessions`: `idx_sessions_patron_id`, `idx_sessions_role`, `idx_sessions_expires_at_sec`, and `idx_sessions_revoked`.
  - `patron_overrides` table (`migrations/0002_patron_overrides.sql`): `patron_id TEXT PRIMARY KEY`, `role TEXT NOT NULL CHECK(role IN ('admin', 'comp'))`, `notes TEXT`, `granted_by TEXT NOT NULL`, `created_at_sec INTEGER NOT NULL`, `updated_at_sec INTEGER NOT NULL`. Index on `role`: `idx_patron_overrides_role`.
  - Parameterized Prepared Statements: All D1 queries must execute via `db.prepare().bind(...)`. Raw SQL string concatenation is strictly prohibited.
- **Cryptographic Cookie & Session Token Separation:**
  - Client cookie name: `ropoductions_session`.
  - Attributes: `HttpOnly; Secure; SameSite=Lax; Path=/`.
  - Content: Signed UUIDv4 session identifier. Verification and revocation lookups occur server-side against D1.
- **Token Encryption at Rest:**
  - OAuth access and refresh tokens stored in D1 are encrypted using AES-256-GCM using a server secret key (`TOKEN_ENCRYPTION_KEY`). Plaintext token persistence is prohibited.
- **Patreon API v2 Integration Architecture:**
  - `/api/auth/patreon`: Generates cryptographically random `state` and PKCE `code_verifier`/`code_challenge`, sets a short-lived secure cookie for verification, and redirects to Patreon OAuth.
  - `/api/auth/callback`: Validates `state` and PKCE verifier, exchanges code for access/refresh tokens, retrieves user identity via `/api/oauth2/v2/identity`, evaluates `INITIAL_ADMIN_PATREON_IDS` for admin bootstrapping, checks `patron_overrides`, verifies tier membership via `/api/oauth2/v2/campaigns/{campaign_id}/members`, persists the session in D1, issues the `ropoductions_session` cookie, and redirects to `/play`.
  - `/api/auth/logout`: Marks session `revoked = 1` in D1, clears `ropoductions_session` cookie (`Max-Age: 0`), and redirects to home.
- **Centralized Policy Evaluation:**
  - Pure function `isAccessAuthorized(session)` centralizes authorization rules: passes unconditionally if `role IN ('admin', 'comp')`; otherwise checks `revoked === 0`, `expires_at_sec > now`, and `pledge_cents >= 500` against the 5 allowed tiers.
- **Environment Configuration:**
  - Required secrets and environment variables: `PATREON_CLIENT_ID`, `PATREON_CLIENT_SECRET`, `PATREON_CAMPAIGN_ID`, `PATREON_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`, and `INITIAL_ADMIN_PATREON_IDS` (comma-separated list of numeric Patreon user IDs).
- **Module Structure:**
  - Routes: `src/app/api/auth/patreon/route.ts`, `src/app/api/auth/callback/route.ts`, `src/app/api/auth/logout/route.ts`.
  - Libraries: `src/lib/patreon.ts` (Patreon API v2 client), `src/lib/crypto.ts` (AES-256-GCM encryption, PKCE generation, HMAC cookie signing), `src/lib/auth.ts` (D1 session lookup, policy evaluation), `src/lib/cloudflare.ts` (D1 binding access helper).
  - Components: `src/components/patreon-paywall-card.tsx`.

## UX & Interaction Patterns

- **Patreon Login Flow:**
  - Unauthenticated visitors on the landing page see a prominent "Login with Patreon" CTA on the hero banner and header.
  - Clicking triggers an instant redirect to Patreon's OAuth authorization screen.
  - After successful authorization and tier validation, the user is redirected directly to `/play` with an active patron session.
- **Logged-In Patron Identity:**
  - Returning active patrons visiting the landing page (`/`) see their tier name highlighted in Patron Gold (`#FBBF24`) in the header (e.g., *"Elf Sybarite"*), and the primary hero CTA becomes *"Enter Game"*.
- **Patreon Paywall Interstitial (`patreon-paywall-card.tsx`):**
  - Rendered when an unauthenticated or non-pledged user visits `/play`.
  - Visual layout: Centered elevated card (`bg-card` `#121522`, `border-border` `#23283E`) featuring the glowing studio crystal leaf emblem, a gold lock badge, a breakdown of the 5 eligible tiers ($5 Ork Patron to $50 Mind Fucker Avatar), and a prominent "Login with Patreon" button styled in Patreon brand red (`#FF424D`).
  - Mobile touch targets must meet the 44x44px accessibility minimum, and layouts must adapt down to 320px viewports without horizontal overflow.
- **Lapsed & Revoked Pledge Handling:**
  - Lapsed subscription: Users navigating to `/play` whose pledge has expired or failed payment collection are gently redirected to `/` with a polite, dismissible notification banner: *"Your Patreon subscription is currently paused or inactive. Please update your pledge on Patreon to resume playing."*
  - Revoked override: Navigating to `/play` after an override is deleted redirects to `/?paywall=revoked` with a clear message that temporary access has expired.
  - Abrasive or insulting copy ("Access Denied", "403 Forbidden") is strictly prohibited; the voice remains dignified, appreciative, and clear.

## Cross-Story Dependencies

- **Story 2.1 precedes Stories 2.2, 2.3, and 2.4:** The D1 schema migrations for `sessions` and `patron_overrides` must be applied before token exchange, tier verification, or session lookups can be implemented.
- **Story 2.2 precedes Story 2.3:** The OAuth 2.0 PKCE initiator, callback route, and admin bootstrap logic must be functional before tier verification, override bypass logic, and session cookie issuance can complete.
- **Story 2.3 precedes Story 2.4:** The session issuance, D1 query helpers, and `isAccessAuthorized` policy function must be in place before constructing the route protection middleware, paywall interstitial card, and transactional revocation checks.
- **Upstream Foundation (Epic 1):** Relies on the Next.js App Router on Cloudflare Workers, 21+ Age Gate, cookie helpers (`src/lib/cookies.ts`), and design tokens established in Epic 1.
- **Downstream Enablers (Epics 3 & 5):**
  - **Epic 3:** The `/play` page and edge asset streaming proxy (`/api/game/[...asset]`) depend directly on the `ropoductions_session` cookie and D1 session verification built in this epic.
  - **Epic 5:** The admin overrides dashboard (`/admin/overrides`) manages records in the `patron_overrides` table and relies on the `admin` role assigned during authentication.
