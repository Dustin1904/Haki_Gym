const API_OFFLINE_HINT =
  "No hay conexión con la API (puerto 3001). En la carpeta Gym ejecuta: npm run dev (o npm --prefix server run dev en otra terminal).";

export async function readJsonResponse<T extends { error?: string }>(
  response: Response
): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(API_OFFLINE_HINT);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(API_OFFLINE_HINT);
  }
}

export function apiErrorMessage(err: unknown, fallback: string) {
  if (err instanceof TypeError && /fetch|network/i.test(String(err.message))) {
    return API_OFFLINE_HINT;
  }
  return err instanceof Error ? err.message : fallback;
}