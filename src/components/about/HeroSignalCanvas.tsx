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

      // Scanning dots on each line
      const dots = [
        { lineIdx: 0, speed: 55, color: "139,92,246", baseY: h * 0.3, amp: 50, freq: 0.006, lineSpeed: 0.5 },
        { lineIdx: 1, speed: 42, color: "59,130,246", baseY: h * 0.5, amp: 70, freq: 0.005, lineSpeed: 0.62 },
        { lineIdx: 2, speed: 35, color: "16,185,129", baseY: h * 0.7, amp: 90, freq: 0.004, lineSpeed: 0.74 },
      ];

      for (const dot of dots) {
        const dx = ((time * dot.speed) % (w + 40)) - 20;
        const dPhase = dx * dot.freq + time * dot.lineSpeed;
        const dSine = Math.sin(dPhase) * dot.amp * 0.5;
        const dSpikePos = ((dx + time * 35 * dot.lineSpeed) % 240) / 240;
        let dSpike = 0;
        if (dSpikePos > 0.44 && dSpikePos < 0.47) {
          dSpike = -dot.amp * 2.5 * ((dSpikePos - 0.44) / 0.03);
        } else if (dSpikePos >= 0.47 && dSpikePos < 0.52) {
          dSpike = dot.amp * 3.2 * ((dSpikePos - 0.47) / 0.05) - dot.amp * 2.5;
        } else if (dSpikePos >= 0.52 && dSpikePos < 0.57) {
          dSpike = dot.amp * 0.7 * (1 - (dSpikePos - 0.52) / 0.05);
        }
        const dy = dot.baseY + dSine + dSpike;

        ctx.beginPath();
        ctx.arc(dx, dy, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${dot.color},0.7)`;
        ctx.fill();

        const grd = ctx.createRadialGradient(dx, dy, 0, dx, dy, 28);
        grd.addColorStop(0, `rgba(${dot.color},0.35)`);
        grd.addColorStop(1, `rgba(${dot.color},0)`);
        ctx.beginPath();
        ctx.arc(dx, dy, 28, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      }

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
