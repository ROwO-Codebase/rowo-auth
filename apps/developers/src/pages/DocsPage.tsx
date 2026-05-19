import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, ListTree } from 'lucide-react';
import { clsx } from 'clsx';
import { DOCS, type DocSlug } from '../docs/content';

const DOC_LIST: { slug: DocSlug; title: string; blurb: string }[] = [
  { slug: 'overview', title: 'Overview', blurb: 'What you can build with ROwO identity.' },
  { slug: 'oauth-flow', title: 'OAuth code flow', blurb: 'End-to-end walkthrough of the authorization-code grant.' },
  { slug: 'api-reference', title: 'API reference', blurb: 'Every endpoint your app might call, with request/response shapes.' },
];

function slugify(input: unknown): string {
  return String(input ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

function flattenChildren(children: React.ReactNode): string {
  if (children == null) return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(flattenChildren).join('');
  if (typeof children === 'object' && 'props' in (children as object)) {
    return flattenChildren((children as { props: { children: React.ReactNode } }).props.children);
  }
  return '';
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-3xl font-bold text-slate-900 mt-0 mb-6 tracking-tight">
      {children}
    </h1>
  ),
  h2: ({ children }) => {
    const id = slugify(flattenChildren(children));
    return (
      <h2
        id={id}
        className="text-xl font-semibold text-slate-900 mt-12 mb-3 pb-2 border-b border-slate-200 scroll-mt-24"
      >
        {children}
      </h2>
    );
  },
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-slate-900 mt-7 mb-2 scroll-mt-24">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-[15px] text-slate-700 leading-7 my-4">{children}</p>
  ),
  a: ({ children, href }) => {
    const isExternal = typeof href === 'string' && /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        className="text-indigo-600 hover:text-indigo-700 underline decoration-indigo-300 hover:decoration-indigo-500 underline-offset-2 transition-colors"
      >
        {children}
      </a>
    );
  },
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="list-disc list-outside ml-6 my-4 space-y-2 text-[15px] text-slate-700 marker:text-slate-400">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside ml-6 my-4 space-y-2 text-[15px] text-slate-700 marker:text-slate-400">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-7 pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-indigo-200 bg-indigo-50/40 pl-4 pr-4 py-2 my-5 text-slate-700 rounded-r-lg">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-10 border-slate-200" />,
  code: ({ className, children }) => {
    const text = String(children ?? '');
    const isBlock = text.includes('\n') || /language-/.test(className || '');
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="bg-slate-100 text-slate-900 px-1.5 py-0.5 rounded text-[0.9em] font-mono break-words">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 my-5 overflow-x-auto text-[13px] leading-relaxed font-mono">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-slate-200">{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left font-semibold text-slate-700 text-xs uppercase tracking-wide">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 text-slate-700 align-top">{children}</td>
  ),
};

const REMARK_PLUGINS = [remarkGfm];

export default function DocsPage() {
  const { slug } = useParams<{ slug?: string }>();
  const activeSlug: DocSlug = useMemo(() => {
    if (slug && slug in DOCS) return slug as DocSlug;
    return 'overview';
  }, [slug]);

  const content = DOCS[activeSlug];

  const toc = useMemo(() => {
    const matches = [...content.matchAll(/^## (.+)$/gm)];
    return matches.map((m) => {
      const text = m[1].trim();
      return { text, id: slugify(text) };
    });
  }, [content]);

  const active = DOC_LIST.find((d) => d.slug === activeSlug);

  return (
    <div className="grid lg:grid-cols-[200px_minmax(0,1fr)_180px] md:grid-cols-[200px_minmax(0,1fr)] gap-8">
      <aside className="md:sticky md:top-20 md:self-start">
        <div className="flex items-center gap-2 mb-3 px-2">
          <BookOpen className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Docs</span>
        </div>
        <nav className="space-y-1">
          {DOC_LIST.map((d) => (
            <Link
              key={d.slug}
              to={`/docs/${d.slug}`}
              className={clsx(
                'block px-3 py-2 rounded-lg text-sm transition-colors',
                activeSlug === d.slug
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              {d.title}
              <div className="text-xs text-slate-400 mt-0.5">{d.blurb}</div>
            </Link>
          ))}
        </nav>
      </aside>

      <article className="bg-white border border-slate-200 rounded-3xl px-6 sm:px-10 py-8 min-w-0">
        {active && (
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-2">
            {active.title}
          </div>
        )}
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </article>

      {toc.length > 1 && (
        <aside className="hidden lg:block lg:sticky lg:top-20 lg:self-start">
          <div className="flex items-center gap-2 mb-3 px-2">
            <ListTree className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              On this page
            </span>
          </div>
          <nav className="space-y-1 border-l border-slate-200">
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block pl-4 pr-2 py-1.5 -ml-px border-l border-transparent text-xs text-slate-500 hover:text-indigo-700 hover:border-indigo-300 transition-colors leading-snug"
              >
                {item.text}
              </a>
            ))}
          </nav>
        </aside>
      )}
    </div>
  );
}
