// src/components/ui/Markdown.tsx
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { Button } from './button';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface MarkdownProps {
  children: string;
  maxLength?: number;
}

const Markdown = ({ children, maxLength = 8000 }: MarkdownProps) => {
  let cleaned = children ?? '';
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Determine if content should be collapsed
  const shouldCollapse = cleaned.length > maxLength;
  const displayContent = shouldCollapse && !isExpanded 
    ? cleaned.substring(0, maxLength) + '...'
    : cleaned;
  
  // Clean up common artifacts
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
    <div className="prose prose-zinc dark:prose-invert max-w-none text-[15px] leading-[1.7] font-inter
                    prose-p:my-2 prose-ul:my-2 prose-li:my-1 prose-strong:font-semibold
                    prose-h1:text-lg prose-h2:text-lg prose-h3:text-base 
                    prose-h1:font-semibold prose-h2:font-semibold prose-h3:font-semibold
                    prose-h1:mt-4 prose-h2:mt-4 prose-h3:mt-3
                    prose-h1:mb-2 prose-h2:mb-2 prose-h3:mb-2
                    prose-ul:list-disc prose-ul:pl-5
                    prose-code:text-[13px] prose-code:bg-gray-100 dark:prose-code:bg-gray-800
                    prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]} 
        rehypePlugins={[rehypeSanitize]} 
        skipHtml
      >
        {displayContent}
      </ReactMarkdown>
      
      {shouldCollapse && (
        <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 p-0 h-auto font-normal"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4 mr-1" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-1" />
                Show more ({((cleaned.length - maxLength) / 1000).toFixed(1)}k more characters)
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default Markdown;