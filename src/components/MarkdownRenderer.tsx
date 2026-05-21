import React from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopy = (text: string, blockId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(blockId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!content) return null;

  // Split by code blocks to isolate preformatted text
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3 font-serif text-[15.5px] md:text-[16.5px] leading-relaxed text-[#1e1e1d] tracking-normal">
      {parts.map((part, index) => {
        // Code blocks: starts with ```
        if (part.startsWith('```')) {
          const match = part.match(/```(\w*)\n([\s\S]*?)```/);
          const numLines = part.split('\n').length;
          const language = match ? match[1] : 'code';
          const codeContent = match ? match[2] : part.slice(3, -3);
          const blockId = `code-block-${index}`;

          return (
            <div key={index} className="my-4 overflow-hidden rounded-lg border border-[#e8e4dc] bg-[#24211d] shadow-xs">
              <div className="flex items-center justify-between border-b border-white/5 bg-[#1a1714] px-4 py-1.5 text-xs font-mono text-[#b0a89d]">
                <span className="uppercase tracking-wider font-medium">{language || 'plaintext'}</span>
                <button
                  id={`btn-copy-${index}`}
                  onClick={() => handleCopy(codeContent.trim(), blockId)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[#b0a89d] hover:text-white hover:bg-white/5 transition-colors"
                >
                  {copiedId === blockId ? (
                    <>
                      <Check size={13} className="text-amber-500" />
                      <span className="text-amber-500 font-medium">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-xs md:text-sm text-[#e6e2db] leading-relaxed">
                <code>{codeContent.trim()}</code>
              </pre>
            </div>
          );
        }

        // Inline text rendering: Paragraphs, lists, titles
        const lines = part.split('\n');
        return (
          <div key={index} className="space-y-2">
            {lines.map((line, lineIdx) => {
              const trimmedLine = line.trim();
              if (!trimmedLine) {
                return <div key={lineIdx} className="h-2" />;
              }

              // Heading types
              if (trimmedLine.startsWith('# ')) {
                return (
                  <h1 key={lineIdx} className="text-2xl md:text-3xl font-serif font-medium text-[#1e1e1d] mt-6 mb-2 tracking-tight">
                    {parseInlineStyles(trimmedLine.slice(2))}
                  </h1>
                );
              }
              if (trimmedLine.startsWith('## ')) {
                return (
                  <h2 key={lineIdx} className="text-xl md:text-2xl font-serif font-medium text-[#1e1e1d] mt-5 mb-2 tracking-tight">
                    {parseInlineStyles(trimmedLine.slice(3))}
                  </h2>
                );
              }
              if (trimmedLine.startsWith('### ')) {
                return (
                  <h3 key={lineIdx} className="text-lg md:text-xl font-serif font-medium text-[#1e1e1d] mt-4 mb-1.5 tracking-tight">
                    {parseInlineStyles(trimmedLine.slice(4))}
                  </h3>
                );
              }

              // List items
              if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
                return (
                  <ul key={lineIdx} className="list-disc pl-6 space-y-1 my-1">
                    <li className="text-[#1e1e1d] font-serif">
                      {parseInlineStyles(trimmedLine.slice(2))}
                    </li>
                  </ul>
                );
              }

              // Ordered list items
              const matchNumbered = trimmedLine.match(/^(\d+)\.\s(.*)/);
              if (matchNumbered) {
                return (
                  <ol key={lineIdx} className="list-decimal pl-6 space-y-1 my-1">
                    <li className="text-[#1e1e1d] font-serif">
                      {parseInlineStyles(matchNumbered[2])}
                    </li>
                  </ol>
                );
              }

              // Blockquotes
              if (trimmedLine.startsWith('> ')) {
                return (
                  <blockquote key={lineIdx} className="border-l-3 border-[#c2765c] bg-[#f8f5f0] px-4 py-2.5 my-3 italic text-[#5c544d] rounded-r-md">
                    {parseInlineStyles(trimmedLine.slice(2))}
                  </blockquote>
                );
              }

              // Checkbox lists
              if (trimmedLine.startsWith('- [ ] ')) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2 my-1.5">
                    <input type="checkbox" disabled className="mt-1 rounded border-[#cfc8b7] text-[#c2765c]" />
                    <span>{parseInlineStyles(trimmedLine.slice(6))}</span>
                  </div>
                );
              }
              if (trimmedLine.startsWith('- [x] ') || trimmedLine.startsWith('- [X] ')) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2 my-1.5">
                    <input type="checkbox" checked disabled className="mt-1 rounded border-[#cfc8b7] text-[#c2765c]" />
                    <span className="line-through text-slate-400">{parseInlineStyles(trimmedLine.slice(6))}</span>
                  </div>
                );
              }

              // Standard styled paragraph
              return (
                <p key={lineIdx} className="text-[#1e1e1d] leading-relaxed font-serif">
                  {parseInlineStyles(line)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Parses inline bold, italics and code tags safely into HTML JSX
 */
function parseInlineStyles(text: string): React.ReactNode[] {
  if (!text) return [];

  // Parse `code`, **bold**, *italics*
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-950">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={i} className="italic text-slate-900">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-rose-600 font-medium">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
