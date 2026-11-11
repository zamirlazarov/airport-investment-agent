const DEFAULT_MAX_CHARS = 600;

/** Lines that are layout, not prose: headings, table rows, code fences, horizontal rules. */
function isLayoutLine(line: string): boolean {
  return /^(#{1,6}\s|\||```|~~~|(?:-{3,}|\*{3,}|_{3,})$)/.test(line);
}

/** Turns one Markdown line into the words a person would read aloud. */
function plainText(line: string): string {
  return (
    line
      // List markers and block quotes at the start of the line.
      .replace(/^(?:>\s*)*(?:[-*+]|\d+[.)])\s+/, "")
      .replace(/^(?:>\s*)+/, "")
      // Images and links read as their text.
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Emphasis and code markers. Underscores inside a word (get_unmet_demand) stay.
      .replace(/\*+|`+|~~/g, "")
      .replace(/(?<![A-Za-z0-9])_{1,2}([^_]+?)_{1,2}(?![A-Za-z0-9])/g, "$1")
  );
}

/** The longest prefix that ends on a full sentence, or failing that on a whole word. */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  // A sentence ends at punctuation followed by a space, so "82.3" does not end one.
  let sentenceEnd = 0;
  for (const match of text.matchAll(/[.!?]+(?=\s|$)/g)) {
    const end = match.index + match[0].length;
    if (end > maxChars) break;
    sentenceEnd = end;
  }
  if (sentenceEnd > 0) return text.slice(0, sentenceEnd);

  const lastSpace = text.slice(0, maxChars + 1).lastIndexOf(" ");
  return lastSpace > 0 ? text.slice(0, lastSpace) : text.slice(0, maxChars);
}

/**
 * The part of an assistant reply worth reading aloud: its first prose paragraph, without
 * Markdown, cut to `maxChars`. Tables, headings and the detail that follows stay on screen.
 * Returns "" when the reply has no prose.
 */
export function spokenSummary(markdown: string, maxChars: number = DEFAULT_MAX_CHARS): string {
  const blocks = markdown.replace(/\r\n/g, "\n").split(/\n\s*\n/);

  for (const block of blocks) {
    const prose = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !isLayoutLine(line))
      .map(plainText)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (prose.length > 0) return truncate(prose, maxChars);
  }
  return "";
}

/** The fields of a chat message part this module reads. */
export type TextPartLike = { readonly type: string; readonly text?: string };

/**
 * The answer in an assistant message: the text written after its last tool call. Text
 * before a tool call is the model announcing what it will look up, not the answer. When
 * nothing follows the last tool call, all the text is returned.
 */
export function answerMarkdown(parts: readonly TextPartLike[]): string {
  const textOf = (slice: readonly TextPartLike[]) =>
    slice
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text!.trim())
      .filter((text) => text.length > 0)
      .join("\n\n");

  const lastTool = parts.findLastIndex((part) => part.type === "tool");
  const afterTools = textOf(parts.slice(lastTool + 1));
  return afterTools.length > 0 ? afterTools : textOf(parts);
}
