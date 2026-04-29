export function PlayerShell() {
  return (
    <main className="page">
      <section aria-labelledby="player-title">
        <p>FakeRadio</p>
        <h1 id="player-title">本地个人音乐电台</h1>
        <p>播放器通过 HTTP 和 WebSocket 连接本地 server；外部能力由 server 的 adapter 统一编排。</p>
        <audio controls preload="none" />
      </section>
      <nav aria-label="FakeRadio views">
        <a href="/profile">Profile</a>
        <span> / </span>
        <a href="/settings">Settings</a>
      </nav>
    </main>
  );
}
