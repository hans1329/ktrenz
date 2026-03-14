import { useEffect, useRef } from "react";

interface BoxParticlesProps {
  count?: number;
  color?: string;
  /** 0~1, higher = faster particles */
  speed?: number;
  /** 0~1, higher = larger/brighter particles */
  density?: number;
  /** Particle shape: "circle" (default) or "star" */
  shape?: "circle" | "star";
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  rotation: number;
  rotationSpeed: number;
}

const BoxParticles = ({
  count = 20,
  color = "hsl(11, 100%, 46%)",
  speed = 0.5,
  density = 0.5,
  shape = "circle",
}: BoxParticlesProps) => {
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

    const velBase = 0.1 + speed * 1.7;
    const sizeBase = 0.5 + density * 1.5;
    const opacityBase = 0.1 + density * 0.4;

    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 2 * velBase,
      vy: (Math.random() - 0.5) * 2 * velBase,
      size: Math.random() * sizeBase + 0.8,
      opacity: Math.random() * opacityBase + 0.1,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
    }));

    const drawStar = (cx: number, cy: number, r: number, spikes: number) => {
      const outerR = r;
      const innerR = r * 0.4;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI * i) / spikes - Math.PI / 2;
        const sx = cx + Math.cos(angle) * radius;
        const sy = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = color;
        if (shape === "star") {
          p.rotation += p.rotationSpeed;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          drawStar(0, 0, p.size * 3.5, 5);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
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
  }, [count, color, speed, density, shape]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0"
      style={{ borderRadius: "inherit" }}
    />
  );
};

export default BoxParticles;
