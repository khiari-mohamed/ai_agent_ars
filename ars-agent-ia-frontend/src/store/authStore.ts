import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AdminAuthUser } from '@/types/auth';

interface AuthStore {
  user: AdminAuthUser | null;
  isAuthenticated: boolean;
  login: (user: AdminAuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (user) => set({ user, isAuthenticated: true }),
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'ars-admin-auth',
      // sessionStorage so token clears on tab close
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);