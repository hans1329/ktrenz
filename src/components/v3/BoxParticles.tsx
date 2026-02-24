import { useEffect, useRef } from "react";

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

const BoxParticles = ({
  count = 20,
  color = "hsl(11, 100%, 46%)",
  speed = 0.5,
  density = 0.5,
}: BoxParticlesProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

    // speed → velocity magnitude (0.2 ~ 2.5)
    const velBase = 0.2 + speed * 2.3;
    // density → particle size (1 ~ 4) and opacity (0.15 ~ 0.7)
    const sizeBase = 1 + density * 3;
    const opacityBase = 0.15 + density * 0.55;

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
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0"
      style={{ borderRadius: "inherit" }}
    />
  );
};

export default BoxParticles;
