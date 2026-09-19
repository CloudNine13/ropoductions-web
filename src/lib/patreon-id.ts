/**
 * Shared, dependency-free Patreon ID validation constant.
 * Consumed by both the server action (validation) and the client form
 * (`pattern` attribute) so they can never drift. Leading zeros rejected to
 * avoid alias/dead rows (retro finding F15).
 */
export const PATREON_ID_PATTERN = "^[1-9]\\d{0,19}$";

export const PATREON_ID_REGEX = new RegExp(PATREON_ID_PATTERN);

export function validatePatreonId(patronId: string): boolean {
  return PATREON_ID_REGEX.test(patronId);
}