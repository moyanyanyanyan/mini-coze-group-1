import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

export function LandingMotion() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const precisePointer = window.matchMedia('(pointer: fine)').matches;
    const page = document.querySelector<HTMLElement>('.landing-page');
    const revealTargets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));

    if (reducedMotion) {
      revealTargets.forEach((target) => target.classList.add('is-revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: '0px 0px -8% 0px' },
    );
    revealTargets.forEach((target) => observer.observe(target));

    const handleScroll = () => {
      if (!page) return;
      const progress = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1.5);
      page.style.setProperty('--landing-scroll-offset', `${progress * -22}px`);
      page.style.setProperty('--landing-product-scroll', `${progress * -18}px`);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    if (!precisePointer) {
      return () => {
        observer.disconnect();
        window.removeEventListener('scroll', handleScroll);
      };
    }

    const canvas = canvasRef.current;
    const cursor = cursorRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !cursor || !context) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    let pointerX = width / 2;
    let pointerY = height / 2;
    let smoothX = pointerX;
    let smoothY = pointerY;
    let previousX = pointerX;
    let previousY = pointerY;
    let pointerVisible = false;
    let animationFrame = 0;
    let lastSpawn = 0;
    const particles: Particle[] = [];

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawnParticle = (speed: number) => {
      if (particles.length >= 76) particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const spread = 5 + Math.random() * 12;
      particles.push({
        x: smoothX + Math.cos(angle) * spread,
        y: smoothY + Math.sin(angle) * spread,
        vx: -((smoothX - previousX) * (0.035 + Math.random() * 0.055)) + (Math.random() - 0.5) * 0.34,
        vy: -((smoothY - previousY) * (0.035 + Math.random() * 0.055)) - 0.05 - Math.random() * 0.22,
        life: 0,
        maxLife: 34 + Math.random() * 34 + Math.min(speed * 0.45, 18),
        size: 0.8 + Math.random() * 2.4,
        hue: Math.random() > 0.42 ? 174 + Math.random() * 18 : 256 + Math.random() * 24,
      });
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerVisible = true;
      cursor.classList.add('is-visible');
      const relativeX = event.clientX / Math.max(width, 1) - 0.5;
      const relativeY = event.clientY / Math.max(height, 1) - 0.5;
      page?.style.setProperty('--landing-glow-x', `${relativeX * 18}%`);
      page?.style.setProperty('--landing-glow-y', `${relativeY * 12}%`);
      page?.style.setProperty('--landing-parallax-x', `${relativeX * -9}px`);
      page?.style.setProperty('--landing-parallax-y', `${relativeY * -7}px`);
    };

    const handlePointerLeave = () => {
      pointerVisible = false;
      cursor.classList.remove('is-visible');
    };

    const render = (time: number) => {
      smoothX += (pointerX - smoothX) * 0.2;
      smoothY += (pointerY - smoothY) * 0.2;
      const dx = smoothX - previousX;
      const dy = smoothY - previousY;
      const speed = Math.hypot(dx, dy);

      cursor.style.transform = `translate3d(${smoothX}px, ${smoothY}px, 0)`;
      cursor.style.setProperty('--cursor-scale', String(0.82 + Math.min(speed / 14, 1) * 0.46));

      if (pointerVisible && time - lastSpawn > Math.max(12, 30 - speed * 1.8)) {
        spawnParticle(speed);
        if (speed > 4.5) spawnParticle(speed);
        lastSpawn = time;
      }

      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.life += 1;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.985;
        particle.vy = particle.vy * 0.986 - 0.002;

        const progress = particle.life / particle.maxLife;
        if (progress >= 1) {
          particles.splice(index, 1);
          continue;
        }

        const alpha = Math.sin(progress * Math.PI) * 0.72;
        const radius = particle.size * (1 - progress * 0.45);
        const gradient = context.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, radius * 4);
        gradient.addColorStop(0, `hsla(${particle.hue}, 92%, 76%, ${alpha})`);
        gradient.addColorStop(0.34, `hsla(${particle.hue}, 88%, 66%, ${alpha * 0.52})`);
        gradient.addColorStop(1, `hsla(${particle.hue}, 85%, 60%, 0)`);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(particle.x, particle.y, radius * 4, 0, Math.PI * 2);
        context.fill();
      }

      context.globalCompositeOperation = 'source-over';
      previousX = smoothX;
      previousY = smoothY;
      animationFrame = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', handlePointerLeave);
    animationFrame = window.requestAnimationFrame(render);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('mouseleave', handlePointerLeave);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="landing-particle-canvas" aria-hidden="true" />
      <div ref={cursorRef} className="landing-cursor-glow" aria-hidden="true"><i /><span /></div>
    </>
  );
}
