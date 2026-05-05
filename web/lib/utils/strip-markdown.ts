/** Strip inline course markers and Markdown formatting to plain text. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\{\{term:[^}]+\}\}/g, (m) => m.slice(7, -2))
    .replace(/\{\{cite:[^}]+\}\}/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,4}\s+/gm, '')
    .trim();
}
