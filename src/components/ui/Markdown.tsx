// src/components/ui/Markdown.tsx
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export default function Markdown({ children }: { children: string }) {
  let cleaned = children ?? "";
  cleaned = cleaned
    .replace(/^(?:\s*start\s*)/im, "")
    .replace(/^\s*start\s*(#+)/im, "$1")
    .replace(/\s*(?:\[?DONE\]?)\s*$/gi, "")
    .replace(/\uFFFD/g, "")
    .replace(/[\u200B-\u200D\uFE0E\uFE0F]/g, "")
    .replace(/^(?:analy[sz]ing[^\n]*\n+)+/i, "");
  cleaned = cleaned.replace(/^(\s{0,3}#{1,6}\s*)([^\w#\d\s-]{1,3}\s*)/gm, "$1");
  cleaned = cleaned.replace(
    /^(\s*[-+*]\s*)(?:[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*)/gmu,
    "$1"
  );

  return (
    <div className="chat-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        skipHtml
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}