export async function checkForUpdate(
  currentVersion: string,
  packageName: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/${packageName}/latest`,
      { signal: AbortSignal.timeout(1500) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { version: string };
    return data.version !== currentVersion ? data.version : null;
  } catch {
    return null;
  }
}
