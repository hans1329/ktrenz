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
        "rgba(139,92,246,0.18)",  // violet
        "rgba(59,130,246,0.14)",  // blue
        "rgba(16,185,129,0.12)", // emerald
      ];

      for (let l = 0; l < lines; l++) {
        const baseY = h * (0.35 + l * 0.15);
        const speed = 0.6 + l * 0.15;
        const amp = 18 + l * 8;
        const freq = 0.008 - l * 0.001;

        ctx.beginPath();
        ctx.strokeStyle = colors[l];
        ctx.lineWidth = 1.5;

        for (let x = 0; x < w; x++) {
          // ECG-like waveform: smooth sine + sharp spike
          const phase = x * freq + time * speed;
          const sineWave = Math.sin(phase) * amp * 0.4;

          // Sharp spike every ~200px
          const spikePos = ((x + time * 40 * speed) % 200) / 200;
          let spike = 0;
          if (spikePos > 0.45 && spikePos < 0.48) {
            spike = -amp * 1.8 * ((spikePos - 0.45) / 0.03);
          } else if (spikePos >= 0.48 && spikePos < 0.52) {
            spike = amp * 2.2 * ((spikePos - 0.48) / 0.04) - amp * 1.8;
          } else if (spikePos >= 0.52 && spikePos < 0.56) {
            spike = amp * 0.4 * (1 - (spikePos - 0.52) / 0.04);
          }

          const y = baseY + sineWave + spike;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Scanning dot on first line
      const dotX = ((time * 60) % (w + 40)) - 20;
      const dotPhase = dotX * 0.008 + time * 0.6;
      const dotSine = Math.sin(dotPhase) * 18 * 0.4;
      const dotSpikePos = ((dotX + time * 24) % 200) / 200;
      let dotSpike = 0;
      if (dotSpikePos > 0.45 && dotSpikePos < 0.48) {
        dotSpike = -18 * 1.8 * ((dotSpikePos - 0.45) / 0.03);
      } else if (dotSpikePos >= 0.48 && dotSpikePos < 0.52) {
        dotSpike = 18 * 2.2 * ((dotSpikePos - 0.48) / 0.04) - 18 * 1.8;
      } else if (dotSpikePos >= 0.52 && dotSpikePos < 0.56) {
        dotSpike = 18 * 0.4 * (1 - (dotSpikePos - 0.52) / 0.04);
      }
      const dotY = h * 0.35 + dotSine + dotSpike;

      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(139,92,246,0.6)";
      ctx.fill();

      // Glow trail
      const gradient = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 20);
      gradient.addColorStop(0, "rgba(139,92,246,0.3)");
      gradient.addColorStop(1, "rgba(139,92,246,0)");
      ctx.beginPath();
      ctx.arc(dotX, dotY, 20, 0, Math.PI * 2);
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
      style={{ opacity: 0.7 }}
    />
  );
};

export default HeroSignalCanvas;
