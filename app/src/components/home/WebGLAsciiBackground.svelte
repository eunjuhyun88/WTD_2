<script lang="ts">
  import { onMount } from 'svelte';
  import { viewportTier } from '$lib/stores/viewportTier';
  import {
    createFullscreenTriangle,
    createPingPong,
    linkProgram,
    loadTexture,
  } from '$lib/webgl/webgl-utils';
  import {
    COMPOSITE_FRAG,
    FULLSCREEN_VERT,
    TRAIL_GROW_FRAG,
    TRAIL_PAINT_FRAG,
  } from '$lib/webgl/ascii-trail-shaders';

  interface Props {
    mouseX?: number;
    mouseY?: number;
    quality?: 'full' | 'lite';
  }

  const { mouseX = 50, mouseY = 50, quality = 'full' }: Props = $props();

  const MOBILE_BP = 768;
  const LOGO_PATH = '/cogochi/logo-filled.png';
  const DRIFT_AMP_X = 20;
  const DRIFT_AMP_Y = 14;

  let canvas: HTMLCanvasElement | undefined = $state(undefined);
  let isMobile = $state(false);

  onMount(() => {
    if (!canvas) return;
    const targetCanvas = canvas;
    const isLite = quality === 'lite';
    const trailScaleDesktop = isLite ? 0.66 : 0.72;
    const trailScaleMobile = isLite ? 0.34 : 0.36;
    const minTrailScaleDesktop = Math.max(0.58, trailScaleDesktop - 0.1);
    const minTrailScaleMobile = Math.max(0.3, trailScaleMobile - 0.06);
    const dprCapDesktop = isLite ? 1.35 : 1.6;
    const dprCapMobile = isLite ? 0.9 : 0.95;
    const targetFpsMobile = 30;
    const logoCoverDesktop = 0.92;
    const logoCoverMobile = 0.5;
    const logoMaxTexture = isLite ? 1440 : 1664;

    const maybeGl = targetCanvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!maybeGl) return;
    const gl: WebGL2RenderingContext = maybeGl;

    const useFloat = !!gl.getExtension('EXT_color_buffer_float');
    let destroyed = false;
    let animId = 0;

    const quad = createFullscreenTriangle(gl);
    const paintProg = linkProgram(gl, FULLSCREEN_VERT, TRAIL_PAINT_FRAG);
    const growProg = linkProgram(gl, FULLSCREEN_VERT, TRAIL_GROW_FRAG);
    const compProg = linkProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    const uPaint = {
      prev: gl.getUniformLocation(paintProg, 'uPrev'),
      mouse: gl.getUniformLocation(paintProg, 'uMouse'),
      mousePrev: gl.getUniformLocation(paintProg, 'uMousePrev'),
      res: gl.getUniformLocation(paintProg, 'uRes'),
      size: gl.getUniformLocation(paintProg, 'uSize'),
      time: gl.getUniformLocation(paintProg, 'uTime'),
    };
    const uGrow = {
      prev: gl.getUniformLocation(growProg, 'uPrev'),
      res: gl.getUniformLocation(growProg, 'uRes'),
      time: gl.getUniformLocation(growProg, 'uTime'),
    };
    const uComp = {
      trail: gl.getUniformLocation(compProg, 'uTrail'),
      logo: gl.getUniformLocation(compProg, 'uLogo'),
      res: gl.getUniformLocation(compProg, 'uRes'),
      mouse: gl.getUniformLocation(compProg, 'uMouse'),
      logoRect: gl.getUniformLocation(compProg, 'uLogoRect'),
      time: gl.getUniformLocation(compProg, 'uTime'),
    };

    let w = window.innerWidth;
    let h = window.innerHeight;
    let scale = w < MOBILE_BP ? trailScaleMobile : trailScaleDesktop;
    let tw = Math.ceil(w * scale);
    let th = Math.ceil(h * scale);
    let trail = createPingPong(gl, tw, th, useFloat);
    trail.clear();

    let logoTex: WebGLTexture | null = null;
    loadTexture(gl, LOGO_PATH, { maxSize: logoMaxTexture })
      .then((tex) => {
        if (!destroyed) logoTex = tex;
      })
      .catch(() => {});

    const blankTex = gl.createTexture();
    if (!blankTex) return;
    gl.bindTexture(gl.TEXTURE_2D, blankTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );

    let prevMx = mouseX / 100;
    let prevMy = 1 - mouseY / 100;
    let smoothedSize = 0;
    let isVisible = typeof document === 'undefined' ? true : !document.hidden;
    let avgFrameMs = 1000 / 60;
    let lastScaleAdjustAt = 0;

    function getBaseTrailScale() {
      return isMobile ? trailScaleMobile : trailScaleDesktop;
    }

    function getMinTrailScale() {
      return isMobile ? minTrailScaleMobile : minTrailScaleDesktop;
    }

    function resizeTrailBuffers(nextScale: number) {
      scale = Math.max(getMinTrailScale(), Math.min(nextScale, getBaseTrailScale()));
      tw = Math.ceil(w * scale);
      th = Math.ceil(h * scale);
      trail.resize(tw, th);
    }

    function resize() {
      if (destroyed) return;
      w = window.innerWidth;
      h = window.innerHeight;
      isMobile = w < MOBILE_BP;
      const dprCap = isMobile ? dprCapMobile : dprCapDesktop;
      const dpr = Math.min(window.devicePixelRatio, dprCap);
      targetCanvas.width = Math.max(1, Math.round(w * dpr));
      targetCanvas.height = Math.max(1, Math.round(h * dpr));
      targetCanvas.style.width = `${w}px`;
      targetCanvas.style.height = `${h}px`;
      resizeTrailBuffers(scale || getBaseTrailScale());
    }

    resize();

    let resizeTimer: number | undefined;
    let lastW = window.innerWidth;
    let lastH = window.innerHeight;
    const RESIZE_DEBOUNCE_MS = 180;
    const H_IGNORE_PX = 120;

    function onResize() {
      const nw = window.innerWidth;
      const nh = window.innerHeight;
      if (nw === lastW && Math.abs(nh - lastH) < H_IGNORE_PX) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        lastW = window.innerWidth;
        lastH = window.innerHeight;
        resize();
      }, RESIZE_DEBOUNCE_MS);
    }

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });

    function scheduleNextFrame() {
      if (destroyed || !isVisible) return;
      animId = requestAnimationFrame(render);
    }

    function onVisibilityChange() {
      isVisible = !document.hidden;
      if (!isVisible) {
        cancelAnimationFrame(animId);
        animId = 0;
        return;
      }
      lastFrameTime = 0;
      scheduleNextFrame();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    function logoRect(t: number): [number, number, number, number] {
      const mobile = w < MOBILE_BP;
      const viewMin = Math.min(w, h);
      const sz = viewMin * (mobile ? logoCoverMobile : logoCoverDesktop);
      const driftX = Math.sin(t * 0.16) * DRIFT_AMP_X + Math.sin(t * 0.32) * 4.6;
      const driftY = Math.cos(t * 0.13) * DRIFT_AMP_Y + Math.cos(t * 0.27) * 3.2;
      const centerX = (mobile ? 0.82 : 0.76) * w + driftX;
      const centerY = (mobile ? 0.16 : 0.48) * h + driftY;
      const left = (centerX - sz * 0.5) / w;
      const bottom = 1 - (centerY + sz * 0.5) / h;
      const right = left + sz / w;
      const top = bottom + sz / h;
      return [left, bottom, right, top];
    }

    const MOBILE_FRAME_MS = 1000 / targetFpsMobile;
    let lastFrameTime = 0;

    function render(time: number) {
      if (destroyed) return;
      const frameBudget = isMobile ? MOBILE_FRAME_MS : 0;
      const deltaMs = time - lastFrameTime;
      if (frameBudget > 0 && deltaMs < frameBudget) {
        scheduleNextFrame();
        return;
      }
      if (lastFrameTime > 0) {
        avgFrameMs = avgFrameMs * 0.92 + deltaMs * 0.08;
      }
      lastFrameTime = time;

      if (time - lastScaleAdjustAt > 1200) {
        const baseScale = getBaseTrailScale();
        const minScale = getMinTrailScale();
        if (avgFrameMs > 21 && scale > minScale + 0.01) {
          resizeTrailBuffers(scale - 0.03);
          avgFrameMs = 1000 / 60;
          lastScaleAdjustAt = time;
        } else if (avgFrameMs < 16.9 && scale < baseScale - 0.01) {
          resizeTrailBuffers(scale + 0.03);
          avgFrameMs = 1000 / 60;
          lastScaleAdjustAt = time;
        }
      }

      const t = time * 0.001;
      const mx = mouseX / 100;
      const my = 1 - mouseY / 100;
      const dx = mx - prevMx;
      const dy = my - prevMy;
      const speed = Math.sqrt(dx * dx + dy * dy);
      const targetSize = Math.min(speed * 35, 1);
      const response = targetSize > smoothedSize ? 0.14 : 0.09;
      smoothedSize += (targetSize - smoothedSize) * response;

      gl.bindVertexArray(quad);

      gl.bindFramebuffer(gl.FRAMEBUFFER, trail.write.fb);
      gl.viewport(0, 0, tw, th);
      gl.useProgram(paintProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, trail.read.tex);
      gl.uniform1i(uPaint.prev, 0);
      gl.uniform2f(uPaint.mouse, mx, my);
      gl.uniform2f(uPaint.mousePrev, prevMx, prevMy);
      gl.uniform2f(uPaint.res, tw, th);
      gl.uniform1f(uPaint.size, smoothedSize);
      gl.uniform1f(uPaint.time, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      trail.swap();

      gl.bindFramebuffer(gl.FRAMEBUFFER, trail.write.fb);
      gl.useProgram(growProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, trail.read.tex);
      gl.uniform1i(uGrow.prev, 0);
      gl.uniform2f(uGrow.res, tw, th);
      gl.uniform1f(uGrow.time, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      trail.swap();

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, targetCanvas.width, targetCanvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(compProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, trail.read.tex);
      gl.uniform1i(uComp.trail, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, logoTex ?? blankTex);
      gl.uniform1i(uComp.logo, 1);
      gl.uniform2f(uComp.res, targetCanvas.width, targetCanvas.height);
      gl.uniform2f(uComp.mouse, mx, my);
      gl.uniform1f(uComp.time, t);
      const lr = logoRect(t);
      gl.uniform4f(uComp.logoRect, lr[0], lr[1], lr[2], lr[3]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);

      prevMx = mx;
      prevMy = my;
      scheduleNextFrame();
    }

    scheduleNextFrame();

    return () => {
      destroyed = true;
      cancelAnimationFrame(animId);
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      trail.destroy();
      gl.deleteTexture(blankTex);
      if (logoTex) gl.deleteTexture(logoTex);
      gl.deleteProgram(paintProg);
      gl.deleteProgram(growProg);
      gl.deleteProgram(compProg);
    };
  });
</script>

{#if $viewportTier.tier !== 'MOBILE'}
  <canvas bind:this={canvas} class="ascii-bg" aria-hidden="true"></canvas>
{/if}

<style>
  .ascii-bg {
    position: fixed;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    width: 100vw;
    height: 100dvh;
    display: block;
    opacity: 0.9;
    filter: saturate(1.3) brightness(1.02) contrast(1.16);
  }

  @supports not (height: 100dvh) {
    .ascii-bg {
      height: 100vh;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ascii-bg {
      display: none;
    }
  }

  @media (max-width: 768px) {
    .ascii-bg {
      opacity: 0.76;
      filter: saturate(1.18) brightness(0.98) contrast(1.08);
    }
  }
</style>
