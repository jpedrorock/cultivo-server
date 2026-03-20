import { useState, useEffect, useCallback } from 'react';

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

/**
 * Hook de autenticação JWT
 * Verifica a sessão atual via GET /api/auth/me
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
      const res = await fetch('/api/auth/me', {
        credentials: 'include', // Enviar cookie auth_token
      });

      if (res.ok) {
        const data = await res.json();
        setState({
          user: data.user,
          loading: false,
          error: null,
          isAuthenticated: true,
        });
      } else {
        setState({
          user: null,
          loading: false,
          error: null,
          isAuthenticated: false,
        });
      }
    } catch (err) {
      setState({
        user: null,
        loading: false,
        error: 'Erro ao verificar autenticação',
        isAuthenticated: false,
      });
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
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
