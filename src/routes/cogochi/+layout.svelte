<script lang="ts">
  // Cogochi 전용 레이아웃 — 기존 Header/BottomBar 대신 자체 NavBar 사용.
  let { children } = $props();
</script>

<div class="cogochi-layout">
  <!-- Cogochi NavBar -->
  <nav class="cogochi-nav">
    <div class="nav-left">
      <a href="/cogochi/terminal" class="nav-brand">
        <span class="brand-icon">🐦</span>
        <span class="brand-text">Cogochi</span>
      </a>
    </div>
    <div class="nav-center">
      <a href="/cogochi/terminal" class="nav-link active">Terminal</a>
      <a href="/cogochi/terminal" class="nav-link">Scanner</a>
      <a href="/cogochi/terminal" class="nav-link">Lab</a>
    </div>
    <div class="nav-right">
      <button class="nav-btn settings">⚙️</button>
      <button class="nav-btn connect">Connect</button>
    </div>
  </nav>

  <!-- Page Content -->
  <div class="cogochi-content">
    {@render children()}
  </div>
</div>

<style>
  .cogochi-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #06060a;
    color: #d0d0f0;
    overflow: hidden;
  }

  /* NavBar */
  .cogochi-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    padding: 0 16px;
    background: #0a0a12;
    border-bottom: 1px solid #1a1a2e;
    flex-shrink: 0;
  }
  .nav-left {
    display: flex;
    align-items: center;
  }
  .nav-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    color: #e0e0ff;
    font-weight: 800;
    font-size: 15px;
    letter-spacing: 0.5px;
  }
  .brand-icon {
    font-size: 20px;
  }
  .nav-center {
    display: flex;
    gap: 4px;
  }
  .nav-link {
    padding: 6px 16px;
    color: #5858a0;
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
    border-radius: 6px;
    transition: all 0.15s;
  }
  .nav-link:hover {
    color: #a0a0d0;
    background: #12121e;
  }
  .nav-link.active {
    color: #e0e0ff;
    background: #1a1a3e;
  }
  .nav-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nav-btn {
    padding: 6px 12px;
    background: transparent;
    border: 1px solid #2a2a4e;
    color: #7878a0;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .nav-btn:hover {
    background: #1a1a2e;
    color: #d0d0f0;
  }
  .nav-btn.connect {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
    font-weight: 700;
  }
  .nav-btn.settings {
    border: none;
    font-size: 16px;
  }

  /* Content */
  .cogochi-content {
    flex: 1;
    overflow: hidden;
  }
</style>
