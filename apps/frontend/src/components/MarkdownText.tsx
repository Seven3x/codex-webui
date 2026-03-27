import { createElement } from "react";
import type { ReactNode } from "react";

type Block =
  | { type: "heading"; depth: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; language: string; code: string };

const isBlank = (line: string): boolean => line.trim().length === 0;
const isFence = (line: string): boolean => line.trim().startsWith("```");
const isHeading = (line: string): boolean => /^#{1,6}\s+/.test(line.trim());
const isUnorderedListItem = (line: string): boolean => /^[-*+]\s+/.test(line.trim());
const isOrderedListItem = (line: string): boolean => /^\d+\.\s+/.test(line.trim());
const isBlockquoteLine = (line: string): boolean => /^>\s?/.test(line.trim());

const renderInline = (text: string, keyPrefix: string): ReactNode[] => {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code key={`${keyPrefix}:code:${index}`}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${keyPrefix}:text:${index}`}>{part}</span>;
  });
};

const parseMarkdownBlocks = (source: string): Block[] => {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (isBlank(line)) {
      index += 1;
      continue;
    }

    if (isFence(line)) {
      const language = line.trim().slice(3).trim();
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !isFence(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length && isFence(lines[index])) {
        index += 1;
      }
      blocks.push({
        type: "code",
        language,
        code: codeLines.join("\n"),
      });
      continue;
    }

    if (isHeading(line)) {
      const match = line.trim().match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        blocks.push({
          type: "heading",
          depth: match[1].length,
          text: match[2],
        });
      }
      index += 1;
      continue;
    }

    if (isBlockquoteLine(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isBlockquoteLine(lines[index])) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "blockquote", lines: quoteLines });
      continue;
    }

    if (isUnorderedListItem(line)) {
      const items: string[] = [];
      while (index < lines.length && isUnorderedListItem(lines[index])) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (isOrderedListItem(line)) {
      const items: string[] = [];
      while (index < lines.length && isOrderedListItem(lines[index])) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      !isBlank(lines[index]) &&
      !isFence(lines[index]) &&
      !isHeading(lines[index]) &&
      !isBlockquoteLine(lines[index]) &&
      !isUnorderedListItem(lines[index]) &&
      !isOrderedListItem(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.join(" "),
    });
  }

  return blocks;
};

export const MarkdownText = ({ text, className = "" }: { text: string; className?: string }) => {
  const blocks = parseMarkdownBlocks(text);

  return (
    <div className={`markdown-text ${className}`.trim()}>
      {blocks.map((block, index) => {
        const key = `${block.type}:${index}`;

        if (block.type === "heading") {
          return createElement(`h${Math.min(block.depth, 3)}`, { key }, renderInline(block.text, key));
        }

        if (block.type === "paragraph") {
          return <p key={key}>{renderInline(block.text, key)}</p>;
        }

        if (block.type === "blockquote") {
          return (
            <blockquote key={key}>
              {block.lines.map((line, lineIndex) => (
                <p key={`${key}:line:${lineIndex}`}>{renderInline(line, `${key}:${lineIndex}`)}</p>
              ))}
            </blockquote>
          );
        }

        if (block.type === "ul") {
          return (
            <ul key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}:item:${itemIndex}`}>{renderInline(item, `${key}:${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "ol") {
          return (
            <ol key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}:item:${itemIndex}`}>{renderInline(item, `${key}:${itemIndex}`)}</li>
              ))}
            </ol>
          );
        }

        return (
          <div key={key} className="markdown-code-block">
            {block.language && <div className="markdown-code-label">{block.language}</div>}
            <pre>
              <code>{block.code}</code>
            </pre>
          </div>
        );
      })}
    </div>
  );
};
