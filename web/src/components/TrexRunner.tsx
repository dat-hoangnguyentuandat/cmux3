import { useEffect, useRef } from "react";

// Lightweight T-Rex runner easter egg (port of the desktop sidebar game).
// Jump with Space / ArrowUp / click; avoid cacti; score climbs with distance.
export function TrexRunner({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height, GROUND = H - 20;

    let raf = 0;
    let last = performance.now();
    let speed = 240;
    let score = 0;
    let best = Number(localStorage.getItem("trex-best") ?? 0);
    let gameOver = false;

    const dino = { x: 40, y: GROUND, vy: 0, w: 22, h: 26, onGround: true };
    const GRAVITY = 1800, JUMP = -560;
    let obstacles: { x: number; w: number; h: number }[] = [];
    let spawnTimer = 0;

    const jump = () => {
      if (gameOver) { reset(); return; }
      if (dino.onGround) { dino.vy = JUMP; dino.onGround = false; }
    };
    const reset = () => {
      obstacles = []; speed = 240; score = 0; gameOver = false;
      dino.y = GROUND; dino.vy = 0; dino.onGround = true; spawnTimer = 0; last = performance.now();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); jump(); }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    canvas.addEventListener("mousedown", jump);

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!gameOver) {
        score += dt * speed * 0.1;
        speed += dt * 6;
        dino.vy += GRAVITY * dt;
        dino.y += dino.vy * dt;
        if (dino.y >= GROUND) { dino.y = GROUND; dino.vy = 0; dino.onGround = true; }

        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawnTimer = 0.8 + Math.random() * 0.9;
          const big = Math.random() > 0.5;
          obstacles.push({ x: W + 10, w: big ? 22 : 14, h: big ? 40 : 26 });
        }
        for (const o of obstacles) o.x -= speed * dt;
        obstacles = obstacles.filter((o) => o.x + o.w > 0);

        for (const o of obstacles) {
          if (dino.x + dino.w > o.x && dino.x < o.x + o.w && dino.y > GROUND - o.h) {
            gameOver = true;
            best = Math.max(best, Math.floor(score));
            localStorage.setItem("trex-best", String(best));
          }
        }
      }

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#888"; ctx.fillRect(0, GROUND + 2, W, 2);
      ctx.fillStyle = "#e5e5ee"; ctx.fillRect(dino.x, dino.y - dino.h, dino.w, dino.h);
      ctx.fillStyle = "#6dbf6d";
      for (const o of obstacles) ctx.fillRect(o.x, GROUND - o.h, o.w, o.h);
      ctx.fillStyle = "#aaa"; ctx.font = "12px monospace";
      ctx.fillText(`HI ${best}  ${Math.floor(score)}`, W - 120, 16);
      if (gameOver) { ctx.fillStyle = "#f7768e"; ctx.fillText("GAME OVER — Space to restart", W / 2 - 90, H / 2); }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("mousedown", jump);
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="panel" onMouseDown={(e) => e.stopPropagation()} style={{ width: 640 }}>
        <div className="panel-head">
          <h2>T-Rex Runner</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="panel-body" style={{ display: "grid", placeItems: "center" }}>
          <canvas ref={canvasRef} width={600} height={160} className="trex-canvas" />
          <p className="dim">Space / ↑ / click to jump · Esc to close</p>
        </div>
      </div>
    </div>
  );
}
