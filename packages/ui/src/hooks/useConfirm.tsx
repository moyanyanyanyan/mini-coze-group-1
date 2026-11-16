import { useEffect, useRef, useState } from 'react';

export function useConfirm() {
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<((answer: boolean) => void) | null>(null);
  useEffect(() => {
    if (message) dialog.current?.showModal();
  }, [message]);
  useEffect(() => () => pending.current?.(false), []);
  const finish = (answer: boolean) => {
    dialog.current?.close();
    pending.current?.(answer);
    pending.current = null;
    setMessage('');
  };
  const confirm = (text: string) => new Promise<boolean>((resolve) => {
    pending.current?.(false);
    pending.current = resolve;
    setMessage(text);
  });
  const confirmation = <dialog ref={dialog} className="ui-confirm" aria-label="确认操作" onCancel={(event) => { event.preventDefault(); finish(false); }}>
    <h2>确认操作</h2><p>{message}</p>
    <div className="ui-confirm-actions"><button autoFocus onClick={() => finish(false)}>取消</button><button className="ui-danger" onClick={() => finish(true)}>确认</button></div>
  </dialog>;
  return { confirm, confirmation };
}
