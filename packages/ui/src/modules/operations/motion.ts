import { flushSync } from 'react-dom';

let activeTransition: ViewTransition | undefined;
let activeRegion: HTMLElement | null = null;

/** 只为当前操作的内容区拍摄快照，避免分页时整个工作台闪动。 */
export function animateOperationsChange(update: () => void) {
  if (typeof document === 'undefined' || !document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  activeTransition?.skipTransition();
  activeRegion?.style.removeProperty('view-transition-name');
  const region = document.activeElement?.closest<HTMLElement>('.om-panel, .om-k-cards, .om-k-history');
  if (!region) {
    update();
    return;
  }
  activeRegion = region;
  region.style.viewTransitionName = 'operations-region';
  const transition = document.startViewTransition(() => { flushSync(update); });
  activeTransition = transition;
  void transition.finished.finally(() => {
    if (activeTransition === transition) {
      region.style.removeProperty('view-transition-name');
      activeTransition = undefined;
      activeRegion = null;
    }
  });
}
