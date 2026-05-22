import { useState, useEffect, useCallback } from 'react';
import { isNative, apiUrl } from '@/lib/platform';
import { getToken, setToken, clearToken } from '@/lib/authStorage';
import { initRevenueCat, logoutRevenueCat } from '@/lib/revenuecat';
import { setSentryUser, addSentryBreadcrumb } from '@/lib/sentry';

interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
  groupId: number | null;
  avatarUrl: string | null;
  approved: boolean;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  if (isNative()) {
    headers.set('X-Client', 'capacitor');
    const token = await getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: isNative() ? 'omit' : 'include',
  });
}

/**
 * Hook de autenticação JWT.
 * Web: cookie httpOnly via /api/auth/me.
 * Mobile (Capacitor): Bearer token salvo em Preferences.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
    isAuthenticated: false,
  });

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await authFetch('/api/auth/me');

      if (res.ok) {
        const data = await res.json();
        setState({
          user: data.user,
          loading: false,
          error: null,
          isAuthenticated: true,
        });
        // Sentry: identifica o user (só ID — sem PII como email)
        // Útil pra ver "este crash afetou X users distintos" no dashboard.
        if (data.user?.id) {
          setSentryUser(data.user.id);
          addSentryBreadcrumb("user authenticated", { userId: data.user.id, native: isNative() });
        }
        if (isNative() && data.user?.id) {
          initRevenueCat(data.user.id).catch(() => {});
        }
      } else {
        // Token inválido no mobile — limpa storage
        if (isNative() && res.status === 401) {
          await clearToken();
        }
        setState({
          user: null,
          loading: false,
          error: null,
          isAuthenticated: false,
        });
      }
    } catch (_err) {
      setState({
        user: null,
        loading: false,
        error: 'Erro ao verificar autenticação',
        isAuthenticated: false,
      });
    }
  }, []);

  const logout = useCallback(async () => {
    addSentryBreadcrumb("user logout initiated");
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      await clearToken();
      await logoutRevenueCat();
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
        }
      } catch { /* ignora — limpeza best-effort */ }

      // Sentry: limpa user — erros subsequentes não ficam atribuídos a ele
      setSentryUser(null);

      setState({
        user: null,
        loading: false,
        error: null,
        isAuthenticated: false,
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
    logout,
  };
}

/**
 * Salva o token retornado por endpoints de login/register quando rodando em
 * Capacitor. No web, ignora (auth segue via cookie httpOnly).
 */
export async function persistAuthToken(token: string | undefined | null): Promise<void> {
  if (!token || !isNative()) return;
  await setToken(token);
}
