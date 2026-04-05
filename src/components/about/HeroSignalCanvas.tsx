import { useEffect, useRef } from "react";

const HeroSignalCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;
      ctx.clearRect(0, 0, w, h);

      const lines = 3;
      const colors = [
        "rgba(139,92,246,0.22)",
        "rgba(59,130,246,0.18)",
        "rgba(16,185,129,0.15)",
      ];

      for (let l = 0; l < lines; l++) {
        const baseY = h * (0.3 + l * 0.2);
        const speed = 0.5 + l * 0.12;
        const amp = 50 + l * 20;
        const freq = 0.006 - l * 0.001;

        ctx.beginPath();
        ctx.strokeStyle = colors[l];
        ctx.lineWidth = 2;

        for (let x = 0; x < w; x++) {
          const phase = x * freq + time * speed;
          const sineWave = Math.sin(phase) * amp * 0.5;

          const spikePos = ((x + time * 35 * speed) % 240) / 240;
          let spike = 0;
          if (spikePos > 0.44 && spikePos < 0.47) {
            spike = -amp * 2.5 * ((spikePos - 0.44) / 0.03);
          } else if (spikePos >= 0.47 && spikePos < 0.52) {
            spike = amp * 3.2 * ((spikePos - 0.47) / 0.05) - amp * 2.5;
          } else if (spikePos >= 0.52 && spikePos < 0.57) {
            spike = amp * 0.7 * (1 - (spikePos - 0.52) / 0.05);
          }

          const y = baseY + sineWave + spike;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Scanning dot
      const dotX = ((time * 55) % (w + 40)) - 20;
      const dotPhase = dotX * 0.006 + time * 0.5;
      const dotSine = Math.sin(dotPhase) * 50 * 0.5;
      const dotSpikePos = ((dotX + time * 17.5) % 240) / 240;
      let dotSpike = 0;
      if (dotSpikePos > 0.44 && dotSpikePos < 0.47) {
        dotSpike = -50 * 2.5 * ((dotSpikePos - 0.44) / 0.03);
      } else if (dotSpikePos >= 0.47 && dotSpikePos < 0.52) {
        dotSpike = 50 * 3.2 * ((dotSpikePos - 0.47) / 0.05) - 50 * 2.5;
      } else if (dotSpikePos >= 0.52 && dotSpikePos < 0.57) {
        dotSpike = 50 * 0.7 * (1 - (dotSpikePos - 0.52) / 0.05);
      }
      const dotY = h * 0.3 + dotSine + dotSpike;

      ctx.beginPath();
      ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(139,92,246,0.7)";
      ctx.fill();

      const gradient = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 28);
      gradient.addColorStop(0, "rgba(139,92,246,0.35)");
      gradient.addColorStop(1, "rgba(139,92,246,0)");
      ctx.beginPath();
      ctx.arc(dotX, dotY, 28, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      time += 0.016;
      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.8 }}
    />
  );
};

export default HeroSignalCanvas;
