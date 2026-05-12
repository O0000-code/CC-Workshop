import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

/**
 * Render markdown text using design-language tokens (zinc palette only,
 * documented font-sizes / weights / radii). No external typography plugin
 * is loaded — every element below maps to the exact Tailwind / token set
 * already in use across the marketplace detail panel.
 *
 * GFM (tables / task-lists / strikethrough / autolinks) is enabled via
 * `remark-gfm`. Syntax highlighting is intentionally omitted: skills.sh
 * itself ships nearly no highlighted code blocks, the bundle cost of a
 * Prism / Shiki dep is not justified at this stage, and our monospace
 * code-block style already reads clearly.
 *
 * Renders nothing when `source` is empty or whitespace.
 */
export interface MarkdownBodyProps {
  source: string;
  /** Extra className appended to the outer wrapper. */
  className?: string;
}

const components: Components = {
  h1: ({ node: _node, children, ...props }) => (
    <h1 className="text-base font-semibold text-[#18181B] mt-6 mb-3 first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ node: _node, children, ...props }) => (
    <h2 className="text-sm font-semibold text-[#18181B] mt-5 mb-2.5 first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ node: _node, children, ...props }) => (
    <h3 className="text-[13px] font-semibold text-[#18181B] mt-4 mb-2 first:mt-0" {...props}>
      {children}
    </h3>
  ),
  h4: ({ node: _node, children, ...props }) => (
    <h4 className="text-[13px] font-medium text-[#18181B] mt-3 mb-1.5 first:mt-0" {...props}>
      {children}
    </h4>
  ),
  p: ({ node: _node, children, ...props }) => (
    <p className="text-[13px] text-[#52525B] leading-relaxed mb-3 last:mb-0" {...props}>
      {children}
    </p>
  ),
  ul: ({ node: _node, children, ...props }) => (
    <ul className="list-disc pl-5 text-[13px] text-[#52525B] mb-3 space-y-1.5 last:mb-0" {...props}>
      {children}
    </ul>
  ),
  ol: ({ node: _node, children, ...props }) => (
    <ol
      className="list-decimal pl-5 text-[13px] text-[#52525B] mb-3 space-y-1.5 last:mb-0"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ node: _node, children, ...props }) => (
    <li className="leading-relaxed" {...props}>
      {children}
    </li>
  ),
  a: ({ node: _node, children, href, ...props }) => (
    <a
      className="text-[#18181B] underline decoration-[#D4D4D8] underline-offset-[3px] transition-colors hover:decoration-[#18181B]"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  code: ({ node: _node, className, children, ...props }) => {
    // Block-level code blocks get a `language-*` class via remark/rehype;
    // inline code has no className. Spec source for this distinction:
    // https://github.com/remarkjs/react-markdown#use-custom-components
    const isBlock = typeof className === 'string' && className.startsWith('language-');
    if (isBlock) {
      return (
        <code className={`font-mono text-[12px] text-[#18181B] ${className ?? ''}`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="bg-[#F4F4F5] px-1.5 py-0.5 rounded text-[12px] font-mono text-[#18181B]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ node: _node, children, ...props }) => (
    <pre
      className="bg-[#FAFAFA] border border-[#E5E5E5] rounded-md p-3 my-3 overflow-x-auto"
      {...props}
    >
      {children}
    </pre>
  ),
  blockquote: ({ node: _node, children, ...props }) => (
    <blockquote className="border-l-2 border-[#E4E4E7] pl-3 my-3 text-[#71717A] italic" {...props}>
      {children}
    </blockquote>
  ),
  hr: ({ node: _node, ...props }) => (
    <hr className="border-0 border-t border-[#E5E5E5] my-4" {...props} />
  ),
  table: ({ node: _node, children, ...props }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full text-[12px] border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ node: _node, children, ...props }) => (
    <thead className="bg-[#FAFAFA]" {...props}>
      {children}
    </thead>
  ),
  th: ({ node: _node, children, ...props }) => (
    <th
      className="text-left font-medium text-[#71717A] border-b border-[#E5E5E5] py-2 px-2.5"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ node: _node, children, ...props }) => (
    <td className="text-[#52525B] border-b border-[#F4F4F5] py-2 px-2.5" {...props}>
      {children}
    </td>
  ),
  strong: ({ node: _node, children, ...props }) => (
    <strong className="font-semibold text-[#18181B]" {...props}>
      {children}
    </strong>
  ),
  em: ({ node: _node, children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
  img: ({ node: _node, alt, src, ...props }) => (
    <img
      className="max-w-full rounded-md border border-[#E5E5E5] my-3"
      alt={alt ?? ''}
      src={src}
      {...props}
    />
  ),
};

export function MarkdownBody({ source, className }: MarkdownBodyProps) {
  if (!source || source.trim().length === 0) return null;
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownBody;
