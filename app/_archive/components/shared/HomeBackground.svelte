<div class="cosmos" aria-hidden="true">
  <div class="stars"></div>
  <div class="nebula nebula-pink"></div>
  <div class="nebula nebula-green"></div>
  <div class="planet planet-main"></div>
  <div class="planet-ring"></div>
  <div class="signal-sweep"></div>
  <div class="signal-grid"></div>
  <div class="scan-haze"></div>
  <div class="crt-overlay"></div>
</div>

<style>
  .cosmos {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
  }

  .stars {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(1px 1px at 6% 16%, rgba(255,255,255,0.62) 50%, transparent 51%),
      radial-gradient(1px 1px at 17% 58%, rgba(255,217,122,0.56) 50%, transparent 51%),
      radial-gradient(1px 1px at 22% 29%, rgba(255,255,255,0.44) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 31% 12%, rgba(255,118,181,0.34) 50%, transparent 51%),
      radial-gradient(1px 1px at 47% 37%, rgba(255,255,255,0.64) 50%, transparent 51%),
      radial-gradient(1px 1px at 62% 18%, rgba(186,240,106,0.34) 50%, transparent 51%),
      radial-gradient(1px 1px at 74% 29%, rgba(255,255,255,0.5) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 85% 20%, rgba(255,118,181,0.28) 50%, transparent 51%),
      radial-gradient(1px 1px at 92% 48%, rgba(255,255,255,0.62) 50%, transparent 51%),
      radial-gradient(1px 1px at 78% 74%, rgba(186,240,106,0.28) 50%, transparent 51%),
      radial-gradient(1px 1px at 57% 84%, rgba(255,217,122,0.3) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 14% 80%, rgba(255,255,255,0.42) 50%, transparent 51%);
    background-size: 420px 420px;
    animation: twinkle 8s ease-in-out infinite alternate;
  }

  .nebula,
  .planet,
  .planet-ring,
  .signal-sweep,
  .signal-grid,
  .scan-haze,
  .crt-overlay {
    position: absolute;
    inset: 0;
  }

  .nebula {
    filter: blur(88px);
    opacity: 0.18;
  }

  .nebula-pink {
    background: radial-gradient(circle at 18% 24%, rgba(255, 127, 186, 0.88), transparent 26%);
    transform: translate3d(-4%, -3%, 0);
  }

  .nebula-green {
    background: radial-gradient(circle at 85% 32%, rgba(183, 239, 122, 0.82), transparent 24%);
    transform: translate3d(2%, 0, 0);
  }

  .planet-main {
    inset: auto auto 18% 70%;
    width: 240px;
    height: 240px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 32% 30%, rgba(255, 240, 213, 0.82), rgba(255, 118, 181, 0.74) 38%, rgba(54, 28, 77, 0.82) 72%, rgba(9, 12, 18, 0) 74%);
    opacity: 0.14;
    box-shadow: 0 0 80px rgba(255, 118, 181, 0.1);
  }

  .planet-ring {
    inset: auto auto 24% 64%;
    width: 340px;
    height: 114px;
    border-radius: 50%;
    border: 2px solid rgba(255, 217, 122, 0.18);
    transform: rotate(-16deg);
    opacity: 0.22;
    box-shadow: 0 0 0 12px rgba(255, 118, 181, 0.02);
  }

  .signal-sweep {
    inset: 8% auto auto 52%;
    width: 46vw;
    height: 46vw;
    border-radius: 50%;
    background:
      conic-gradient(
        from 220deg,
        transparent 0deg 280deg,
        rgba(186, 240, 106, 0.14) 308deg,
        rgba(255, 118, 181, 0.08) 324deg,
        transparent 342deg 360deg
      );
    filter: blur(2px);
    opacity: 0.34;
    animation: sweep 18s linear infinite;
  }

  .signal-grid {
    inset: 56% -8% -18% -8%;
    background:
      linear-gradient(90deg, rgba(186, 240, 106, 0.1) 1px, transparent 1px),
      linear-gradient(0deg, rgba(255, 118, 181, 0.08) 1px, transparent 1px);
    background-size: 62px 62px;
    transform: perspective(840px) rotateX(79deg);
    transform-origin: center top;
    opacity: 0.16;
  }

  .scan-haze {
    background:
      linear-gradient(180deg, rgba(255, 118, 181, 0.05), transparent 24%, transparent 70%, rgba(186, 240, 106, 0.06)),
      radial-gradient(circle at 50% 70%, rgba(255, 217, 122, 0.04), transparent 18%);
    opacity: 0.54;
  }

  .crt-overlay {
    background:
      linear-gradient(180deg, rgba(255,118,181,0.02), transparent 18%, transparent 82%, rgba(186,240,106,0.024)),
      repeating-linear-gradient(
        0deg,
        transparent 0 3px,
        rgba(0, 0, 0, 0.06) 3px 4px
      );
    opacity: 0.38;
  }

  @keyframes twinkle {
    0% { opacity: 0.58; }
    100% { opacity: 1; }
  }

  @keyframes sweep {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .stars {
      animation: none !important;
    }
  }

  @media (max-width: 768px) {
    .planet-main {
      width: 172px;
      height: 172px;
      inset: auto auto 18% 58%;
    }

    .planet-ring {
      width: 244px;
      height: 84px;
      inset: auto auto 24% 54%;
    }

    .signal-sweep {
      width: 64vw;
      height: 64vw;
      inset: 14% auto auto 44%;
    }
  }
</style>
