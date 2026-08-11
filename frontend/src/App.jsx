import React, { lazy, Suspense, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import createAppTheme from './theme';
import { ColorModeProvider, useColorMode } from './context/ColorModeContext';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PublicDocumentation = lazy(() => import('./pages/PublicDocumentation'));
const Landing = lazy(() => import('./pages/Landing'));

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
        <Suspense fallback={<div role="progressbar" aria-label="Cargando" />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/docs" element={<PublicDocumentation />} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/dashboard/*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          </Routes>
        </Suspense>
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
