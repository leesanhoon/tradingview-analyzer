export type VerifyProvider = "claude" | "gemini";

export function getVerifyProvider(): VerifyProvider {
  const value = process.env.VERIFY_PROVIDER?.trim().toLowerCase();
  return value === "claude" ? "claude" : "gemini";
}

export function getVerifyProviderLabel(provider: VerifyProvider = getVerifyProvider()): string {
  return provider === "claude" ? "Claude Sonnet 4.6" : "Gemini 3.5 Flash";
}
