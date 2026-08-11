import { useMemo } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, ListTree } from 'lucide-react';
import { clsx } from 'clsx';
import { DOCS, type DocSlug } from '../docs/content';
import { NEXUS_DOC_LIST, NEXUS_DOCS } from '../docs/nexusContent';

const OAUTH_DOC_LIST: { slug: DocSlug; title: string; blurb: string }[] = [
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
    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-0 mb-5 sm:mb-6 tracking-tight">
      {children}
    </h1>
  ),
  h2: ({ children }) => {
    const id = slugify(flattenChildren(children));
    return (
      <h2
        id={id}
        className="text-lg sm:text-xl font-semibold text-slate-900 mt-10 sm:mt-12 mb-3 pb-2 border-b border-slate-200 scroll-mt-36"
      >
        {children}
      </h2>
    );
  },
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-slate-900 mt-7 mb-2 scroll-mt-36">
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
        className="text-indigo-600 hover:text-indigo-700 underline decoration-indigo-300 hover:decoration-indigo-500 underline-offset-2 transition-colors break-words"
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
    <ul className="list-disc list-outside ml-5 sm:ml-6 my-4 space-y-2 text-[15px] text-slate-700 marker:text-slate-400">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside ml-5 sm:ml-6 my-4 space-y-2 text-[15px] text-slate-700 marker:text-slate-400">
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
    <pre className="bg-slate-900 text-slate-100 rounded-xl p-3 sm:p-4 my-5 overflow-x-auto text-[12px] sm:text-[13px] leading-relaxed font-mono">
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
    <th className="px-3 sm:px-4 py-2.5 text-left font-semibold text-slate-700 text-xs uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 sm:px-4 py-2.5 text-slate-700 align-top">{children}</td>
  ),
};

const REMARK_PLUGINS = [remarkGfm];

export default function DocsPage() {
  const { slug } = useParams<{ slug?: string }>();
  const location = useLocation();
  const isNexus = location.pathname.startsWith('/nexus/docs');
  const docs: Readonly<Record<string, string>> = isNexus ? NEXUS_DOCS : DOCS;
  const docList = isNexus ? NEXUS_DOC_LIST : OAUTH_DOC_LIST;
  const basePath = isNexus ? '/nexus/docs' : '/docs';
  const defaultSlug = isNexus ? 'introduction' : 'overview';
  const sectionLabel = isNexus ? 'Nexus docs' : 'OAuth docs';

  const activeSlug = useMemo(() => {
    if (slug && Object.prototype.hasOwnProperty.call(docs, slug)) return slug;
    return defaultSlug;
  }, [defaultSlug, docs, slug]);

  const content = docs[activeSlug];

  const toc = useMemo(() => {
    const matches = [...content.matchAll(/^## (.+)$/gm)];
    return matches.map((m) => {
      const text = m[1].trim();
      return { text, id: slugify(text) };
    });
  }, [content]);

  const active = docList.find((d) => d.slug === activeSlug);
  const showToc = toc.length > 1;

  if (slug && !Object.prototype.hasOwnProperty.call(docs, slug)) {
    return <Navigate to={`${basePath}/${defaultSlug}`} replace />;
  }

  return (
    <div className="space-y-4 md:space-y-0">
      {/* Mobile-only horizontal tab strip — saves vertical space on phones */}
      <nav className="md:hidden flex items-center gap-2 overflow-x-auto overscroll-x-contain -mx-4 px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
        {docList.map((d) => (
          <Link
            key={d.slug}
            to={`${basePath}/${d.slug}`}
            className={clsx(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0',
              activeSlug === d.slug
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            )}
          >
            {d.title}
          </Link>
        ))}
      </nav>

      <div
        className={clsx(
          'grid gap-6 md:gap-8',
          // 2-col on md, 3-col only when the screen is wide enough for the TOC to actually breathe
          'md:grid-cols-[180px_minmax(0,1fr)]',
          showToc && 'xl:grid-cols-[200px_minmax(0,1fr)_180px]'
        )}
      >
        {/* Sidebar nav — hidden on mobile (replaced by pill strip above) */}
        <aside className="hidden md:block md:sticky md:top-32 md:self-start">
          <div className="flex items-center gap-2 mb-3 px-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {sectionLabel}
            </span>
          </div>
          <nav className="space-y-1">
            {docList.map((d) => (
              <Link
                key={d.slug}
                to={`${basePath}/${d.slug}`}
                className={clsx(
                  'block px-3 py-2 rounded-lg text-sm transition-colors',
                  activeSlug === d.slug
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                {d.title}
                {/* Blurb only at lg+ — md sidebar is too narrow for it */}
                <div className="hidden lg:block text-xs text-slate-400 mt-0.5">{d.blurb}</div>
              </Link>
            ))}
          </nav>
        </aside>

        <article className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl px-5 sm:px-8 lg:px-10 py-6 sm:py-8 min-w-0">
          {active && (
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-2">
              {active.title}
            </div>
          )}
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>
            {content}
          </ReactMarkdown>
        </article>

        {/* TOC — only when there's enough room (xl+) and there's more than one H2 */}
        {showToc && (
          <aside className="hidden xl:block xl:sticky xl:top-32 xl:self-start">
            <div className="flex items-center gap-2 mb-3 px-2">
              <ListTree className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                On this page
              </span>
            </div>
            <nav className="space-y-1 border-l border-slate-200 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
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
    </div>
  );
}
