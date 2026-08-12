import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  Fingerprint,
  FlaskConical,
  Github,
  Key,
  KeyRound,
  LogIn,
  LogOut,
  User as UserIcon,
  WalletCards,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSession } from '../contexts/SessionContext';
import { MAIN_SITE_ORIGIN, startSsoLogin } from '../lib/mainSiteUrl';

interface SectionLink {
  path: string;
  label: string;
  icon: typeof Key;
  exact?: boolean;
  external?: boolean;
}

const OAUTH_LINKS: SectionLink[] = [
  { path: '/clients', label: 'Clients', icon: Key },
  { path: '/docs', label: 'Documentation', icon: BookOpen },
  { path: '/playground', label: 'API playground', icon: FlaskConical },
  { path: '/tokens', label: 'Token helper', icon: KeyRound },
];

const NEXUS_LINKS: SectionLink[] = [
  { path: '/nexus', label: 'Introduction', icon: Fingerprint, exact: true },
  { path: '/nexus/docs', label: 'Documentation', icon: BookOpen },
  { path: '/nexus/playground', label: 'Playground', icon: FlaskConical },
  {
    path: 'https://wallet.rowo.link',
    label: 'Wallet',
    icon: WalletCards,
    external: true,
  },
];

function startsWithRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isNexus = startsWithRoute(location.pathname, '/nexus');
  const isOAuth = ['/clients', '/docs', '/playground', '/tokens'].some((route) =>
    startsWithRoute(location.pathname, route),
  );
  const sectionLinks = isNexus ? NEXUS_LINKS : isOAuth ? OAUTH_LINKS : [];
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const handleSignOut = () => {
    setMenuOpen(false);
    signOut();
    navigate('/');
  };

  const handleSignIn = () => {
    startSsoLogin(location.pathname + location.search);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 min-w-0" aria-label="ROwO developer portal home">
            <img
              src={__ICON_URL__}
              alt="ROwO"
              className="w-8 h-8 rounded-xl shrink-0"
              referrerPolicy="no-referrer"
            />
            <span className="hidden md:block font-semibold text-lg tracking-tight text-slate-800 whitespace-nowrap">
              ROwO <span className="text-indigo-600">for Developers</span>
            </span>
          </Link>

          <nav className="flex gap-1 items-center" aria-label="Developer products and account">
            <ProductLink
              to="/docs"
              label="OAuth"
              icon={Key}
              active={isOAuth}
            />
            <ProductLink
              to="/nexus"
              label="Nexus"
              icon={Fingerprint}
              active={isNexus}
            />

            <div className="w-px h-6 bg-slate-200 mx-1" aria-hidden="true" />

            {!loading &&
              (user ? (
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen((value) => !value)}
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    aria-label={`Account menu for ${user.username}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <UserIcon className="w-4 h-4" />
                    <span className="hidden lg:inline max-w-[10ch] truncate">{user.username}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      <a
                        href={MAIN_SITE_ORIGIN}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Back to ROwO
                      </a>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-t border-slate-100"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSignIn}
                  aria-label="Sign in with ROwO"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  <span className="hidden lg:inline">Sign in</span>
                </button>
              ))}

            <a
              href="https://github.com/ROwO-Codebase/rowo-auth"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              className="hidden sm:flex items-center p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Github className="w-4 h-4" />
            </a>
          </nav>
        </div>

        {sectionLinks.length > 0 && (
          <div className="border-t border-slate-100">
            <nav
              className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-11 flex items-center gap-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label={isNexus ? 'Nexus navigation' : 'OAuth navigation'}
            >
              <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mr-2 shrink-0">
                {isNexus ? 'Nexus' : 'OAuth'}
              </span>
              {sectionLinks.map((item) => {
                const Icon = item.icon;
                const active = item.external
                  ? false
                  : item.exact
                    ? location.pathname === item.path
                    : startsWithRoute(location.pathname, item.path);
                const className = clsx(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0',
                  active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                );

                return item.external ? (
                  <a
                    key={item.path}
                    href={item.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={className}
                  >
                    <Icon className="w-3.5 h-3.5" /> {item.label}
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>
                ) : (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={className}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon className="w-3.5 h-3.5" /> {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <div>&copy; {new Date().getFullYear()} PiTrick Technology. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <a href={`${MAIN_SITE_ORIGIN}/privacy`} className="hover:text-slate-900 transition-colors">
              Privacy Policy
            </a>
            <a
              href="https://github.com/ROwO-Codebase/rowo-nexus"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 transition-colors"
            >
              Nexus source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ProductLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: typeof Key;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        active
          ? 'bg-indigo-50 text-indigo-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </Link>
  );
}
