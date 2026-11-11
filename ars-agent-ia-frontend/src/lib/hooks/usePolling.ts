import { useEffect, useRef } from 'react';

/** Calls `task` every `intervalMs` while the tab is visible, and once when it becomes visible again. */
export function usePolling(task: () => void, intervalMs: number): void {
  const taskRef = useRef(task);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) taskRef.current();
    };
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
}