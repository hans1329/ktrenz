import { forwardRef, useEffect, useRef } from "react";

interface BoxParticlesProps {
  count?: number;
  color?: string;
  /** 0~1, higher = faster particles */
  speed?: number;
  /** 0~1, higher = larger/brighter particles */
  density?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
}

const BoxParticles = forwardRef<HTMLCanvasElement, BoxParticlesProps>(({
  count = 20,
  color = "hsl(11, 100%, 46%)",
  speed = 0.5,
  density = 0.5,
}, forwardedRef) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resize();

    // speed → velocity magnitude (0.1 ~ 1.8)
    const velBase = 0.1 + speed * 1.7;
    // density → particle size (0.5 ~ 2) and opacity (0.1 ~ 0.5)
    const sizeBase = 0.5 + density * 1.5;
    const opacityBase = 0.1 + density * 0.4;

    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 2 * velBase,
      vy: (Math.random() - 0.5) * 2 * velBase,
      size: Math.random() * sizeBase + 0.8,
      opacity: Math.random() * opacityBase + 0.1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.globalAlpha = p.opacity;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [count, color, speed, density]);

  return (
    <canvas
      ref={(node) => {
        canvasRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      }}
      className="absolute inset-0 pointer-events-none z-0"
      style={{ borderRadius: "inherit" }}
    />
  );
});

BoxParticles.displayName = "BoxParticles";

export default BoxParticles;
