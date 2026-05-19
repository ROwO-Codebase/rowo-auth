import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Key, BookOpen, FlaskConical, KeyRound, LogIn, User as UserIcon,
  LogOut, ChevronDown, Github, ExternalLink,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSession } from '../contexts/SessionContext';
import { MAIN_SITE_ORIGIN, startSsoLogin } from '../lib/mainSiteUrl';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const navItems = [
    { path: '/clients', label: 'Clients', icon: Key },
    { path: '/docs', label: 'Docs', icon: BookOpen },
    { path: '/playground', label: 'Playground', icon: FlaskConical },
    { path: '/tokens', label: 'Tokens', icon: KeyRound },
  ];

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
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={__ICON_URL__} alt="ROwO" className="w-8 h-8 rounded-xl" referrerPolicy="no-referrer" />
            <span className="font-semibold text-lg tracking-tight text-slate-800">
              ROwO <span className="text-indigo-600">for Developers</span>
            </span>
          </Link>
          <nav className="flex gap-1 items-center">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}

            {!loading && (
              user ? (
                <div className="relative ml-1" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <UserIcon className="w-4 h-4" />
                    <span className="hidden sm:inline max-w-[10ch] truncate">{user.username}</span>
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
                  onClick={handleSignIn}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors ml-1"
                >
                  <LogIn className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign in with ROwO</span>
                </button>
              )
            )}

            <a
              href="https://github.com/Pitrick3141/rowo-auth"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              className="flex items-center p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors ml-1"
            >
              <Github className="w-4 h-4" />
            </a>
          </nav>
        </div>
      </header>
      <main
        className={clsx(
          'flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-8',
          location.pathname.startsWith('/docs')
            ? 'max-w-7xl 2xl:max-w-[88rem]'
            : 'max-w-6xl'
        )}
      >
        {children}
      </main>
      <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <div>&copy; {new Date().getFullYear()} PiTrick Technology. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <a href={`${MAIN_SITE_ORIGIN}/privacy`} className="hover:text-slate-900 transition-colors">
              Privacy Policy
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
