# Patron Tier Matrix & Session Policy

## 1. Supported Campaign Tiers
The portal integrates with Patreon API v2 to evaluate active memberships against studio campaign tiers:

| Tier Name | Monthly Pledge | v1 Web Game Access | Intended Future Perks (v2+) |
|---|---|---|---|
| **Ork Patron** | $5.00 | Full Access | Baseline access |
| **Ogre Pimp** | $10.00 | Full Access | Discord role, monthly wallpaper pack |
| **Elf Sybarite** | $15.00 | Full Access | Experimental beta branches |
| **Horseman Aesthete** | $25.00 | Full Access | High-resolution artbook, developer commentary |
| **Mind Fucker Avatar** | $50.00 | Full Access | Custom in-game NPC mention, executive credits |

*v1 Uniformity Rule:* In version 1, all active patrons from Tier 1 ($5) through Tier 5 ($50) receive identical web player access. Differentiated tier features are parked for subsequent releases.

## 2. Session & Verification Lifecycle
* **Authentication:** User initiates login via "Login with Patreon" (OAuth 2.0 Authorization Code flow with PKCE or state token).
* **Token Handling:** Access and refresh tokens are securely stored server-side / in encrypted HTTP-only session cookies.
* **Status Re-Verification:**
  * Active pledge validation is performed on navigation to restricted routes (e.g. entering `/play`).
  * If a user's pledge is cancelled or fails payment during an active gameplay session, the current in-browser session is **not** abruptly terminated.
  * Re-verification triggers upon the next user route transition or restricted API call.
  * If the verification check fails, the user is redirected to the home landing page with a clear modal/banner offering an immediate Patreon renewal or re-authorization flow.
