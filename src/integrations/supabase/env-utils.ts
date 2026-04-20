export function normalizeSupabaseEnvValue(value: string | undefined) {
  if (!value) {
    return value;
  }

  return value.trim().replace(/^['\"]+|['\"]+$/g, "");
}