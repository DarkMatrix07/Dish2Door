export async function readApiJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(response.status >= 500 ? "The service is temporarily unavailable. Please try again in a moment." : fallbackMessage);
  }

  try {
    return await response.json() as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}
