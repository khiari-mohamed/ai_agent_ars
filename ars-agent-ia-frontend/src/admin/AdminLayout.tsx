import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Ticket, BookOpen,
  Shield, Users, Settings, LogOut, ChevronRight, ChevronLeft,
  Menu, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { to: '/admin/dashboard',    label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/admin/conversations',label: 'Conversations',   icon: MessageSquare   },
  { to: '/admin/tickets',      label: 'Tickets',         icon: Ticket          },
  { to: '/admin/knowledge',    label: 'Base de savoirs', icon: BookOpen        },
  { to: '/admin/audit',        label: 'Journaux',        icon: Shield          },
  { to: '/admin/users',        label: 'Utilisateurs',    icon: Users           },
  { to: '/admin/settings',     label: 'Paramètres',      icon: Settings        },
];

const SIDEBAR_COLLAPSE_KEY = 'ars-admin-sidebar-collapsed';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950';

export default function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
  });

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Close the mobile drawer on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mobileOpen]);

  // Lock background scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const handleLogout = () => {
    logout();
    toast.success('Déconnexion réussie');
    navigate('/admin/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface-raised">
      {/* Mobile backdrop */}
      <div
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-40 bg-ink-950/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/* Sidebar */}
      <aside
        id="admin-sidebar"
        aria-label="Barre latérale"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-shrink-0 flex-col bg-ink-950 shadow-2xl transition-all duration-300 ease-spring lg:border-r lg:border-ink-800 lg:shadow-none',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
          collapsed && 'lg:w-20',
        )}
      >
        {/* Logo / header */}
        <div className="flex items-center justify-between gap-2 border-b border-ink-800 px-5 py-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/Image1.png" alt="ARS Tunisie" className="h-8 w-8 flex-shrink-0 object-contain" />
            <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
              <p className="truncate text-sm font-semibold leading-tight text-white">ARS Tunisie</p>
              <p className="truncate text-xs text-ink-400">Agent IA — Admin</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
            className={cn(
              'flex-shrink-0 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-800 hover:text-white lg:hidden',
              FOCUS_RING,
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav
          aria-label="Navigation principale"
          className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4 scrollbar-hidden"
        >
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? label : undefined}
              aria-label={label}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                  collapsed && 'lg:justify-center',
                  isActive
                    ? 'bg-navy-500 text-white'
                    : 'text-ink-300 hover:bg-navy-600 hover:text-white',
                  FOCUS_RING,
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className={cn('flex-1 truncate', collapsed && 'lg:hidden')}>{label}</span>
                  {isActive && (
                    <ChevronRight className={cn('h-3 w-3 opacity-60', collapsed && 'lg:hidden')} />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User + controls */}
        <div className="border-t border-ink-800 px-3 py-4">
          <div className={cn('mb-2 flex items-center gap-2.5 px-2', collapsed && 'lg:justify-center lg:px-0')}>
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-navy-500">
              <span className="text-sm font-semibold text-white">
                {user?.prenom?.[0]}{user?.nom?.[0]}
              </span>
            </div>
            <div className={cn('min-w-0 flex-1', collapsed && 'lg:hidden')}>
              <p className="truncate text-xs font-medium text-white">{user?.prenom} {user?.nom}</p>
              <p className="truncate text-2xs capitalize text-ink-400">{user?.role?.toLowerCase()}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-controls="admin-sidebar"
            aria-label={collapsed ? 'Développer le menu' : 'Réduire le menu'}
            title={collapsed ? 'Développer le menu' : 'Réduire le menu'}
            className={cn(
              'mb-1 hidden w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-400 transition-colors hover:bg-ink-800 hover:text-white lg:flex',
              collapsed && 'lg:justify-center',
              FOCUS_RING,
            )}
          >
            <ChevronLeft
              className={cn(
                'h-4 w-4 flex-shrink-0 transition-transform duration-300 ease-spring',
                collapsed && 'rotate-180',
              )}
            />
            <span className={cn(collapsed && 'lg:hidden')}>Réduire</span>
          </button>

          <button
            onClick={handleLogout}
            title={collapsed ? 'Déconnexion' : undefined}
            aria-label="Déconnexion"
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-400 transition-colors hover:bg-navy-600 hover:text-white',
              collapsed && 'lg:justify-center',
              FOCUS_RING,
            )}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            <span className={cn(collapsed && 'lg:hidden')}>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Content column */}
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col overflow-hidden',
          collapsed ? 'lg:pl-20' : 'lg:pl-60',
        )}
      >
        {/* Mobile topbar */}
        <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-950 px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={mobileOpen}
            aria-controls="admin-sidebar"
            className={cn(
              'rounded-lg p-1.5 text-ink-300 transition-colors hover:bg-ink-800 hover:text-white',
              FOCUS_RING,
            )}
          >
            <Menu className="h-5 w-5" />
          </button>
          <img src="/Image1.png" alt="ARS Tunisie" className="h-6 w-auto object-contain" />
          <p className="text-sm font-semibold text-white">ARS Tunisie</p>
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}