import { useCallback, useEffect, useRef, useState } from 'react';

export type NoticeType = 'success' | 'error';

export interface Notice {
  id: number;
  type: NoticeType;
  message: string;
}

export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<number | null>(null);
  const nextId = useRef(0);

  const showNotice = useCallback((type: NoticeType, message: string) => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
    }

    setNotice({ id: ++nextId.current, type, message });
    timer.current = window.setTimeout(() => {
      setNotice(null);
      timer.current = null;
    }, 2000);
  }, []);

  useEffect(() => () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
    }
  }, []);

  return { notice, showNotice };
}
