import { z } from 'zod';
import { llmConfig } from './llm-config';
type Message = { role: 'system' | 'user'; content: string };
export async function requestLLM(
  messages: Message[],
  options: { timeoutMs?: number; temperature?: number } = {},
): Promise<unknown> {
  if (!process.env.LLM_API_KEY?.trim()) throw Error('LLM_API_KEY_MISSING');
  const config = llmConfig();
  const responses = config.api === 'responses';
  const body = responses
    ? {
        model: config.model,
        input: messages,
        stream: false,
        store: false,
        text: { format: { type: 'json_object' } },
      }
    : {
        model: config.model,
        messages,
        stream: false,
        response_format: { type: 'json_object' },
        temperature: options.temperature ?? 0.2,
        ...config.extra,
      };
  const signal = AbortSignal.timeout(options.timeoutMs ?? 120000);
  let response: Response;
  try {
    response = await fetch(`${config.baseURL}/${responses ? 'responses' : 'chat/completions'}`, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw Error(signal.aborted ? 'LLM_TIMEOUT' : 'LLM_NETWORK_ERROR');
  }
  if (!response.ok) throw Error(`LLM_HTTP_${response.status}`);
  try {
    const raw = await response.json();
    let text: string;
    if (responses) {
      const data = z
        .object({
          status: z.literal('completed'),
          error: z.null().optional(),
          output: z.array(z.unknown()),
        })
        .parse(raw);
      const messages = data.output.filter(
        (item) =>
          typeof item === 'object' && item !== null && 'type' in item && item.type === 'message',
      );
      if (messages.length !== 1) throw Error('Expected one completed assistant message');
      const message = z
        .object({
          role: z.literal('assistant'),
          status: z.literal('completed'),
          content: z.array(z.object({ type: z.literal('output_text'), text: z.string() })).min(1),
        })
        .parse(messages[0]);
      text = message.content.map((part) => part.text).join('');
    } else {
      const data = z
        .object({
          choices: z
            .array(
              z.object({
                finish_reason: z.literal('stop').optional(),
                message: z.object({ content: z.string(), refusal: z.null().optional() }),
              }),
            )
            .length(1),
        })
        .parse(raw);
      text = data.choices[0].message.content;
    }
    return JSON.parse(text);
  } catch {
    throw Error(signal.aborted ? 'LLM_TIMEOUT' : 'LLM_INVALID_OR_INCOMPLETE_JSON_RESPONSE');
  }
}
