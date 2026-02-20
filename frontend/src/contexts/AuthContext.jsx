import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(newUser));
  };

  const logout = () => {
    // If impersonating, restore original session
    const originalToken = sessionStorage.getItem('original_auth_token');
    const originalUser = sessionStorage.getItem('original_auth_user');
    if (originalToken && originalUser) {
      setToken(originalToken);
      setUser(JSON.parse(originalUser));
      localStorage.setItem('auth_token', originalToken);
      localStorage.setItem('auth_user', originalUser);
      sessionStorage.removeItem('original_auth_token');
      sessionStorage.removeItem('original_auth_user');
      return;
    }

    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  };

  const startImpersonation = (newToken, newUser) => {
    // Save current session before switching
    sessionStorage.setItem('original_auth_token', token);
    sessionStorage.setItem('original_auth_user', JSON.stringify(user));
    login(newToken, newUser);
  };

  const exitImpersonation = () => {
    const originalToken = sessionStorage.getItem('original_auth_token');
    const originalUser = sessionStorage.getItem('original_auth_user');
    if (originalToken && originalUser) {
      setToken(originalToken);
      setUser(JSON.parse(originalUser));
      localStorage.setItem('auth_token', originalToken);
      localStorage.setItem('auth_user', originalUser);
      sessionStorage.removeItem('original_auth_token');
      sessionStorage.removeItem('original_auth_user');
    }
  };

  const isImpersonating = !!sessionStorage.getItem('original_auth_token');
  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAuthenticated, startImpersonation, exitImpersonation, isImpersonating }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
