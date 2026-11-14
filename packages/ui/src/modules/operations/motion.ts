import { flushSync } from 'react-dom';

let activeTransition: ViewTransition | undefined;

/** 切换快照前同步提交界面，连续操作时跳过旧动画；不延迟用户输入。 */
export function animateOperationsChange(update: () => void) {
  if (typeof document === 'undefined' || !document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  activeTransition?.skipTransition();
  activeTransition = document.startViewTransition(() => { flushSync(update); });
}
