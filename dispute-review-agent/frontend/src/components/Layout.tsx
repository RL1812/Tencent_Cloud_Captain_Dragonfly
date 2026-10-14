/**
 * Layout — Sidebar navigation + main content area
 */

import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FilePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { to: '/', label: 'Case dashboard', icon: LayoutDashboard },
  { to: '/submit', label: 'Submit a case', icon: FilePlus },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="relative isolate overflow-hidden w-14 md:w-52 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
        {/* Logo */}
        <div className="px-2 md:px-4 pt-5 pb-4">
          <img src="/ryde-logo.png" alt="Ryde" className="h-6 md:h-8 w-auto mx-auto md:mx-0 object-contain object-left" />
        </div>

        {/* Navigation: icon tiles make two items read as a deliberate menu */}
        <nav className="relative z-10 px-1.5 md:px-3 py-3 space-y-1.5">
          {navItems.map((item) => {
            const isActive =
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'group flex items-center justify-center md:justify-start gap-3 rounded-xl p-1.5 md:pr-3 text-sm font-semibold transition-all',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-xs ring-1 ring-primary/15'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-primary/30'
                      : 'bg-muted text-sidebar-foreground/70 group-hover:bg-card'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Decorative base: a blush glow with soft rings, no text */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-64 -z-10">
          <div className="absolute inset-0 bg-gradient-to-t from-primary/15 via-primary/5 to-transparent" />
          <div className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full border border-primary/20" />
          <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full border border-primary/15" />
          <div className="absolute -bottom-40 -left-32 h-88 w-88 rounded-full border border-primary/10" />
          <div className="absolute -bottom-10 -right-10 h-28 w-28 rounded-full bg-primary/10 blur-xl" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="app-bg flex-1 overflow-auto">{children}</main>
    </div>
  );
}
