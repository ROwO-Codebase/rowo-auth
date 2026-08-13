import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, UserCheck, Info, HelpCircle, Github, LogIn, UserPlus, User as UserIcon, LogOut, ChevronDown, TriangleAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { useSession } from '../contexts/SessionContext';
import { isPreviewDeployment } from '../environment';

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
    { path: '/', label: 'Query', icon: ShieldCheck },
    { path: '/verify', label: 'Verify Identity', icon: UserCheck },
    { path: '/faq', label: 'FAQ', icon: HelpCircle },
    { path: '/about', label: 'About', icon: Info },
  ];

  const handleSignOut = () => {
    setMenuOpen(false);
    signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        {isPreviewDeployment && (
          <div className="border-b border-amber-300 bg-amber-100 text-amber-950" role="status">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm font-medium">
              <TriangleAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>You are viewing the preview version of ROwO Auth. Features and data may change.</span>
              <a
                href="https://rowo.link/"
                className="font-semibold underline underline-offset-2 hover:text-amber-700 transition-colors"
              >
                Go to the production site
              </a>
            </div>
          </div>
        )}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={__ICON_URL__} alt="ROwO Auth Logo" className="w-8 h-8 rounded-xl" referrerPolicy="no-referrer" />
            <span className="font-semibold text-lg tracking-tight text-slate-800">
              ROwO <span className="text-indigo-600">Auth</span>
            </span>
          </div>
          <nav className="flex gap-1 items-center">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
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
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      location.pathname === '/center'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    )}
                  >
                    <UserIcon className="w-4 h-4" />
                    <span className="hidden sm:inline max-w-[10ch] truncate">{user.username}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      {user.role !== 'user' && (
                        <Link
                          to="/admin"
                          onClick={() => setMenuOpen(false)}
                          className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100"
                        >
                          Management Panel
                        </Link>
                      )}
                      <Link
                        to="/center"
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        User Center
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1 ml-1">
                  <Link
                    to="/login"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <LogIn className="w-4 h-4" />
                    <span className="hidden sm:inline">Sign in</span>
                  </Link>
                  <Link
                    to="/signup"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span className="hidden sm:inline">Sign up</span>
                  </Link>
                </div>
              )
            )}

            <a
              href="https://github.com/ROwO-Codebase/rowo-auth"
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
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <div>
            &copy; {new Date().getFullYear()} PiTrick Technology. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-slate-900 transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
