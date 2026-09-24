/** Only deliberately authored domain errors may cross the HTTP boundary. */
export class PublicError extends Error {}

export function publicErrorMessage(error: unknown, fallback: string): string {
  return error instanceof PublicError ? error.message : fallback;
}
