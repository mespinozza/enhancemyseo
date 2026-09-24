import type Anthropic from '@anthropic-ai/sdk';

/**
 * The text of a Claude reply.
 *
 * Reading `content[0]` is not safe. On anything substantial claude-sonnet-5 returns a
 * thinking block first and the prose second, so indexing the first block yields an empty
 * string while every surrounding success check still passes — the request is a 200, the
 * article is blank, and nothing reports an error. Joining the text blocks is correct
 * whatever precedes them.
 */
export function textFromMessage(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
