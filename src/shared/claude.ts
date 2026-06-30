import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

export function getClaudeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  if (!client) {
    client = new Anthropic({ apiKey });
  }

  return client;
}

export function extractTextFromClaudeResponse(response: { content?: Array<{ type: string; text?: string }> }): string {
  return (
    response.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("") ?? ""
  );
}
