import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CreateMessageRequestParams } from '@modelcontextprotocol/sdk/types.js';
import { CreateMessageResultSchema } from '@modelcontextprotocol/sdk/types.js';

export const name = 'sampling_demo';

export const description = 'Demonstrate sampling/createMessage by requesting a short response from the client.';

export const inputSchema = {
  theme: z.enum(['ocean', 'forest', 'desert', 'city', 'space']).describe('Theme for the generated response'),
  style: z.enum(['haiku', 'headline', 'bullets']).describe('Output style'),
  maxTokens: z.number().min(16).max(256).describe('Maximum tokens to sample (16-256)'),
};

type Args = {
  theme: 'ocean' | 'forest' | 'desert' | 'city' | 'space';
  style: 'haiku' | 'headline' | 'bullets';
  maxTokens: number;
};

type SamplingRequestExtra = {
  sendRequest: (
    request: { method: 'sampling/createMessage'; params: CreateMessageRequestParams },
    resultSchema: typeof CreateMessageResultSchema
  ) => Promise<{ content: { type: string; text?: string } | Array<{ type: string; text?: string }> }>;
};

const styleInstructions: Record<Args['style'], string> = {
  haiku: 'Write a three-line haiku about the theme.',
  headline: 'Write a single-sentence headline about the theme.',
  bullets: 'Write exactly three bullet points about the theme.',
};

export async function handler({ theme, style, maxTokens }: Args, extra: SamplingRequestExtra) {
  const systemPrompt = 'You are generating sample output for an MCP sampling demo.';
  const prompt = `${styleInstructions[style]} Theme: ${theme}.`;

  try {
    const response = await extra.sendRequest(
      {
        method: 'sampling/createMessage',
        params: {
          messages: [
            {
              role: 'user',
              content: { type: 'text', text: prompt },
            },
          ],
          maxTokens,
          systemPrompt,
        },
      },
      CreateMessageResultSchema
    );

    const content = Array.isArray(response.content) ? response.content : [response.content];
    const textBlock = content.find((block: { type: string; text?: string }) => block.type === 'text');
    const sampledText = textBlock?.text ?? 'No text response returned.';

    return {
      content: [{ type: 'text' as const, text: sampledText }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: `Sampling request failed: ${message}` }],
      isError: true,
    };
  }
}

export function register(server: McpServer): void {
  server.registerTool(name, { description, inputSchema }, handler);
}
