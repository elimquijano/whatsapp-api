import { useEffect, useRef } from 'react';

// Poll only while the page can actually be seen. setTimeout (rather than
// setInterval) also guarantees that slow requests never overlap.
const useSmartPolling = (callback, delay, { runImmediately = true } = {}) => {
  const callbackRef = useRef(callback);

  useEffect(() => { callbackRef.current = callback; }, [callback]);

  useEffect(() => {
    let active = true;
    let timer;

    const schedule = () => {
      window.clearTimeout(timer);
      if (active && document.visibilityState === 'visible') timer = window.setTimeout(run, delay);
    };
    const run = async () => {
      if (!active || document.visibilityState !== 'visible') return;
      try {
        await callbackRef.current();
      } finally {
        schedule();
      }
    };
    const onVisibilityChange = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'visible') run();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    if (runImmediately) run(); else schedule();
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [delay, runImmediately]);
};

export default useSmartPolling;
