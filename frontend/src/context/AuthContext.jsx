import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  // Restore the session on load; also react to a 401 raised anywhere in the app.
  useEffect(() => {
    if (tokenStore.get()) {
      api.me().then(setUser).catch(logout).finally(() => setLoading(false));
    }
    window.addEventListener('auth:expired', logout);
    return () => window.removeEventListener('auth:expired', logout);
  }, [logout]);

  const login = async (email, password) => {
    const { token, user: u } = await api.login(email, password);
    tokenStore.set(token);
    setUser(u);
    return u;
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}
