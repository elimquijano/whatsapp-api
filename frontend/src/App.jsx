import React, { useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import PublicDocumentation from './pages/PublicDocumentation';
import Landing from './pages/Landing';
import createAppTheme from './theme';
import { ColorModeProvider, useColorMode } from './context/ColorModeContext';

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" />; 
  return children;
};

const ThemedApplication = () => {
  const { mode } = useColorMode();
  const location = useLocation();
  const effectiveMode = location.pathname.startsWith('/dashboard') ? mode : 'light';
  const theme = useMemo(() => createAppTheme(effectiveMode), [effectiveMode]);

  useEffect(() => {
    document.documentElement.style.colorScheme = effectiveMode;
    document.documentElement.dataset.theme = effectiveMode;
    document.documentElement.style.background = effectiveMode === 'dark' ? '#080c14' : '#f4f7fb';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effectiveMode === 'dark' ? '#080c14' : '#0f172a');
  }, [effectiveMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/docs" element={<PublicDocumentation />} />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
};

function App() {
  return (
    <ColorModeProvider>
      <BrowserRouter>
        <ThemedApplication />
      </BrowserRouter>
    </ColorModeProvider>
  );
}

export default App;
