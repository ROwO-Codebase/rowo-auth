import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { BookOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { DOCS, type DocSlug } from '../docs/content';

const DOC_LIST: { slug: DocSlug; title: string; blurb: string }[] = [
  { slug: 'overview', title: 'Overview', blurb: 'What you can build with ROwO identity.' },
  { slug: 'oauth-flow', title: 'OAuth code flow', blurb: 'End-to-end walkthrough of the authorization-code grant.' },
  { slug: 'api-reference', title: 'API reference', blurb: 'Every endpoint your app might call, with request/response shapes.' },
];

export default function DocsPage() {
  const { slug } = useParams<{ slug?: string }>();
  const activeSlug: DocSlug = useMemo(() => {
    if (slug && slug in DOCS) return slug as DocSlug;
    return 'overview';
  }, [slug]);

  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-8">
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

      <article className="bg-white border border-slate-200 rounded-3xl p-8 prose prose-slate max-w-none prose-headings:scroll-mt-24 prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-code:before:hidden prose-code:after:hidden">
        <ReactMarkdown>{DOCS[activeSlug]}</ReactMarkdown>
      </article>
    </div>
  );
}
