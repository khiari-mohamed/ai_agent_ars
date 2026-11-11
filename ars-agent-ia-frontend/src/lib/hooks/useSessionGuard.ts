import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { setUnauthorizedHandler } from '@/lib/api';
import { jwtExpiryMs } from '@/lib/jwt';

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/** Logs out when the admin JWT expires or any authenticated call returns 401. */
export function useSessionGuard(): void {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.user?.token);

  useEffect(() => {
    const expire = () => {
      if (!useAuthStore.getState().isAuthenticated) return;
      useAuthStore.getState().logout();
      toast.error('Votre session a expiré. Veuillez vous reconnecter.', { id: 'session-expired' });
      if (window.location.pathname.startsWith('/admin')) navigate('/admin/login', { replace: true });
    };

    setUnauthorizedHandler(expire);

    let timer: number | null = null;
    if (token) {
      const expiresAt = jwtExpiryMs(token);
      if (expiresAt !== null) {
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) expire();
        else timer = window.setTimeout(expire, Math.min(remaining, MAX_TIMEOUT_MS));
      }
    }

    return () => {
      setUnauthorizedHandler(null);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [token, navigate]);
}