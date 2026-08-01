import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'wa-api-color-mode';
const ColorModeContext = createContext({ mode: 'light', toggleMode: () => {}, setMode: () => {} });

const preferredMode = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (_) {
    // Some privacy modes disable storage; the system preference is still usable.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const ColorModeProvider = ({ children }) => {
  const [mode, setModeState] = useState(preferredMode);
  const setMode = (nextMode) => setModeState(nextMode === 'dark' ? 'dark' : 'light');
  const toggleMode = () => setModeState((current) => current === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (_) {
      // Keep the selected mode for this tab even when persistence is unavailable.
    }
  }, [mode]);

  const value = useMemo(() => ({ mode, setMode, toggleMode }), [mode]);
  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
};

export const useColorMode = () => useContext(ColorModeContext);

export default ColorModeContext;
