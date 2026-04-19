import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadDonationOverlayBySlug } from "@/lib/monetization-data";
import type { DonationOverlayVariant } from "@/lib/mock-platform";

const searchSchema = z.object({
  username: z.string().optional(),
  amount: z.string().optional(),
  currency: z.string().optional(),
  message: z.string().optional(),
});

type OverlayPayload = {
  username: string;
  amount: string;
  currency: string;
  message: string;
};

declare global {
  interface Window {
    triggerNovaBoost?: () => void;
    NovaBoostOverlay?: {
      showDonation: (payload: Partial<OverlayPayload>) => void;
    };
  }
}

export const Route = createFileRoute("/overlay/donation/$slug")({
  validateSearch: searchSchema,
  component: DonationOverlayRoute,
});

function DonationOverlayRoute() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [variant, setVariant] = useState<DonationOverlayVariant>("supernova");
  const [gifUrl, setGifUrl] = useState("");
  const [soundUrl, setSoundUrl] = useState("");
  const [triggerKey, setTriggerKey] = useState(0);
  const [payload, setPayload] = useState<OverlayPayload>({
    username: search.username || "MrJin",
    amount: search.amount || "25",
    currency: search.currency || "USD",
    message: search.message || "Ты зажёг новую звезду на стриме!",
  });

  useEffect(() => {
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.background = "";
      document.documentElement.style.background = "";
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    let active = true;

    void loadDonationOverlayBySlug(slug)
      .then((data) => {
        if (!active || !data) {
          return;
        }

        setVariant(data.overlay.variant);
        setGifUrl(data.overlay.gifUrl);
        setSoundUrl(data.overlay.soundUrl);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    const showDonation = (nextPayload: Partial<OverlayPayload>) => {
      setPayload((current) => ({
        username: nextPayload.username || current.username,
        amount: nextPayload.amount || current.amount,
        currency: nextPayload.currency || current.currency,
        message: nextPayload.message || current.message,
      }));
      setTriggerKey((current) => current + 1);
    };

    window.NovaBoostOverlay = { showDonation };
    window.triggerNovaBoost = () => showDonation({});

    const timer = window.setTimeout(() => showDonation({}), 300);

    return () => {
      window.clearTimeout(timer);
      delete window.NovaBoostOverlay;
      delete window.triggerNovaBoost;
    };
  }, []);

  useEffect(() => {
    if (!soundUrl || !audioRef.current || triggerKey === 0) {
      return;
    }

    audioRef.current.currentTime = 0;
    void audioRef.current.play().catch(() => undefined);
  }, [soundUrl, triggerKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let frame = 0;
    const particles = Array.from({ length: variant === "supernova" ? 180 : variant === "epic-burst" ? 64 : 110 }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0,
      speed: Math.random() * (variant === "supernova" ? 8 : 5) + 2,
      life: Math.random() * 90 + 70,
      size: Math.random() * 5 + 2,
    }));

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      frame += 1;
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;

      if (variant !== "epic-burst") {
        const waveRadius = frame * (variant === "supernova" ? 6.8 : 5.2);
        ctx.beginPath();
        ctx.arc(cx, cy, waveRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(125,249,255, ${Math.max(0, 1 - waveRadius / 700)})`;
        ctx.lineWidth = variant === "supernova" ? 10 : 4;
        ctx.stroke();
      }

      particles.forEach((particle) => {
        particle.radius += particle.speed;
        particle.life -= 1;
        const x = cx + Math.cos(particle.angle) * particle.radius;
        const y = cy + Math.sin(particle.angle) * particle.radius;
        const alpha = Math.max(0, particle.life / 120);

        ctx.beginPath();
        ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = variant === "epic-burst"
          ? `rgba(255, 0, 200, ${alpha})`
          : variant === "nova-ring"
            ? `rgba(255,255,255, ${alpha})`
            : `rgba(0, 240, 255, ${alpha})`;
        ctx.fill();
      });

      if (frame < 130) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, [triggerKey, variant]);

  const variantClass = useMemo(() => {
    switch (variant) {
      case "epic-burst":
        return {
          title: "bg-[linear-gradient(90deg,#00f5ff,#ff00c8)] bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(0,245,255,0.65)]",
          amount: "text-white drop-shadow-[0_0_20px_rgba(255,0,200,0.7)]",
          message: "text-cyan-300 drop-shadow-[0_0_16px_rgba(0,245,255,0.55)]",
          badge: "text-cyan-200",
        };
      case "nova-ring":
        return {
          title: "bg-[linear-gradient(90deg,#ffffff,#7df9ff,#ff00c8)] bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(255,255,255,0.75)]",
          amount: "text-white drop-shadow-[0_0_18px_rgba(255,0,200,0.7)]",
          message: "text-cyan-200 drop-shadow-[0_0_12px_rgba(125,249,255,0.55)]",
          badge: "text-white/90",
        };
      default:
        return {
          title: "text-cyan-300 drop-shadow-[0_0_30px_rgba(0,240,255,0.7)]",
          amount: "text-white drop-shadow-[0_0_42px_rgba(0,240,255,0.7)]",
          message: "text-white/90 drop-shadow-[0_0_16px_rgba(0,240,255,0.45)]",
          badge: "text-cyan-300",
        };
    }
  }, [variant]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-transparent">
      <style>{`
        @keyframes nb-pop-in { 0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; } 65% { transform: translate(-50%, -50%) scale(1.08); opacity: 1; } 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; } }
        @keyframes nb-pulse-glow { from { filter: drop-shadow(0 0 16px rgba(0,240,255,.4)); } to { filter: drop-shadow(0 0 34px rgba(255,0,200,.6)); } }
      `}</style>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      {soundUrl && <audio ref={audioRef} src={soundUrl} preload="auto" />}
      {gifUrl && <img src={gifUrl} alt="overlay gif" className="pointer-events-none absolute right-[8%] top-[8%] max-h-56 max-w-[28vw] object-contain opacity-90" />}

      <div className="pointer-events-none absolute left-1/2 top-1/2 min-w-105 max-w-[82vw] -translate-x-1/2 -translate-y-1/2 text-center" style={{ animation: `nb-pop-in 820ms ease forwards, nb-pulse-glow 2s ease-in-out infinite alternate` }}>
        <div className={`font-display text-sm uppercase tracking-[0.5em] ${variantClass.badge}`}>NOVA BOOST</div>
        <div className={`mt-3 font-display text-5xl font-bold md:text-6xl ${variantClass.title}`}>{payload.username}</div>
        <div className={`mt-4 font-display text-7xl font-bold md:text-8xl ${variantClass.amount}`}>{payload.amount} <span className="text-4xl align-top text-amber-300 md:text-5xl">{payload.currency}</span></div>
        {payload.message ? <div className={`mx-auto mt-6 max-w-4xl text-xl leading-8 md:text-3xl ${variantClass.message}`}>{payload.message}</div> : null}
      </div>
    </div>
  );
}