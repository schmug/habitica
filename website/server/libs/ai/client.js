import nconf from 'nconf';
import Anthropic from '@anthropic-ai/sdk';

// Shared Claude API client for the AI-native features.
// AI is only available when AI_ENABLED is 'true' and an API key is configured,
// so the server keeps working normally without any AI configuration.

const DEFAULT_MODEL = 'claude-haiku-5-5';

let client = null;

export function isAiEnabled () {
  return nconf.get('AI_ENABLED') === 'true' && Boolean(nconf.get('ANTHROPIC_API_KEY'));
}

export function getAiModel () {
  return nconf.get('AI_MODEL') || DEFAULT_MODEL;
}

export function getAiClient () {
  if (!client) {
    client = new Anthropic({
      apiKey: nconf.get('ANTHROPIC_API_KEY'),
      timeout: 60 * 1000,
      maxRetries: 2,
    });
  }
  return client;
}

// Allows tests to inject a fake client
export function setAiClient (newClient) {
  client = newClient;
}

export class AiResponseError extends Error {
  constructor (message, reason) {
    super(message);
    this.name = 'AiResponseError';
    this.reason = reason;
  }
}

// Sends a request that must come back as JSON matching `schema`
// (structured outputs) and returns the parsed object.
export async function requestStructured ({
  system, messages, schema, effort = 'low', maxTokens = 4000,
}) {
  const response = await getAiClient().messages.create({
    model: getAiModel(),
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: {
      effort,
      format: { type: 'json_schema', schema },
    },
    system,
    messages,
  });

  // Always check stop_reason before reading content
  if (response.stop_reason === 'refusal') {
    throw new AiResponseError('The AI declined this request.', 'refusal');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AiResponseError('The AI response was cut off.', 'max_tokens');
  }

  const textBlock = response.content.find(block => block.type === 'text');
  if (!textBlock) throw new AiResponseError('The AI returned no answer.', 'empty');

  try {
    return { data: JSON.parse(textBlock.text), usage: response.usage };
  } catch (err) {
    throw new AiResponseError('The AI returned an invalid answer.', 'invalid_json');
  }
}
