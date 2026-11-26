import { useEffect, useRef } from 'react';
import { useAppearance } from '../../shared/theme/theme-store';

/** 把 --violet-500 这类 CSS 变量解析成 canvas 能用的 rgba 分量 */
function parseColor(raw: string): { r: number; g: number; b: number } {
  const value = raw.trim();
  const hex = value.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }
  const rgb = value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }
  return { r: 111, g: 86, b: 217 };
}

/**
 * 极简粒子背景：只做氛围，不拦截点击。
 * 页面不可见时暂停；减少动态效果时完全不启动。
 */
export function ProfileParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { accent, theme } = useAppearance();

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 粒子跟随强调色，但保持低透明度
    const tone = parseColor(getComputedStyle(canvas).getPropertyValue('--violet-500'));
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const particles = Array.from({ length: 46 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.8 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.00006,
      vy: (Math.random() - 0.5) * 0.00006,
      alpha: 0.1 + Math.random() * 0.16,
    }));

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);
      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < 0) particle.x = 1;
        if (particle.x > 1) particle.x = 0;
        if (particle.y < 0) particle.y = 1;
        if (particle.y > 1) particle.y = 0;

        ctx.beginPath();
        ctx.arc(particle.x * width, particle.y * height, particle.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tone.r}, ${tone.g}, ${tone.b}, ${particle.alpha})`;
        ctx.fill();
      }
      frame = window.requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        window.cancelAnimationFrame(frame);
      } else if (!running) {
        running = true;
        frame = window.requestAnimationFrame(draw);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    frame = window.requestAnimationFrame(draw);

    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [accent, theme]);

  return <canvas ref={canvasRef} className="profile-particles" aria-hidden="true" />;
}
