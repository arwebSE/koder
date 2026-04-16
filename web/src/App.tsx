const highlights = [
  "PWA-ready shell",
  "Hosted and self-hosted modes",
  "Remote code sessions, logs, and handoff"
];

const activity = [
  {
    label: "Live session",
    value: "Connected",
    tone: "good"
  },
  {
    label: "Workspace",
    value: "remodex / web",
    tone: "neutral"
  },
  {
    label: "Target",
    value: "Hosted relay",
    tone: "warn"
  }
];

const threads = [
  {
    title: "Koder shell",
    meta: "UI scaffold",
    active: true
  },
  {
    title: "Relay bridge",
    meta: "Connection ready",
    active: false
  },
  {
    title: "Deployment mode",
    meta: "Self-host free",
    active: false
  },
  {
    title: "Billing layer",
    meta: "Hosted only",
    active: false
  }
];

function App() {
  return (
    <div className="app-shell">
      <div className="app-shell__glow app-shell__glow--one" />
      <div className="app-shell__glow app-shell__glow--two" />

      <header className="topbar">
        <div className="brand">
          <div className="brand__mark">K</div>
          <div>
            <p className="eyebrow">Remote coding client</p>
            <h1>Koder</h1>
          </div>
        </div>

        <div className="topbar__status">
          <span className="status-dot status-dot--live" />
          <span>Ready for hosted or self-hosted runs</span>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar card">
          <div className="card__header">
            <div>
              <p className="eyebrow">Threads</p>
              <h2>Session rail</h2>
            </div>
            <button type="button" className="chip chip--ghost">
              New
            </button>
          </div>

          <div className="thread-list">
            {threads.map((thread) => (
              <button
                key={thread.title}
                type="button"
                className={`thread ${thread.active ? "thread--active" : ""}`}
              >
                <div>
                  <strong>{thread.title}</strong>
                  <span>{thread.meta}</span>
                </div>
                <span className="thread__arrow">↗</span>
              </button>
            ))}
          </div>

          <div className="mini-panel">
            <p className="eyebrow">Mode</p>
            <div className="mode-switch" role="group" aria-label="Deployment mode">
              <button type="button" className="mode-switch__button mode-switch__button--active">
                Self-hosted
              </button>
              <button type="button" className="mode-switch__button">
                Hosted
              </button>
            </div>
          </div>
        </aside>

        <section className="hero card">
          <div className="hero__header">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2>Ship code from one browser surface.</h2>
            </div>
            <div className="pill">PWA ready</div>
          </div>

          <p className="hero__lede">
            Koder is the web-first shell for remote coding sessions, relay state, and hosted
            infrastructure when you want it.
          </p>

          <div className="highlight-row">
            {highlights.map((item) => (
              <div key={item} className="highlight-card">
                <span className="highlight-card__dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="composer">
            <div className="composer__chrome">
              <span className="composer__label">Command</span>
              <span className="composer__hint">/subagents, /plan, /git, /handoff</span>
            </div>
            <textarea
              aria-label="Command composer"
              defaultValue="Refactor the current session flow and keep the local bridge protocol stable."
            />
            <div className="composer__actions">
              <button type="button" className="chip">
                Plan
              </button>
              <button type="button" className="chip">
                Attach files
              </button>
              <button type="button" className="chip chip--primary">
                Send to runtime
              </button>
            </div>
          </div>

          <div className="terminal card card--inner">
            <div className="terminal__header">
              <span>Runtime preview</span>
              <span className="terminal__tag">web / relay / session</span>
            </div>
            <pre>{`$ koder session watch
[relay] connected
[hosted] monetization off for self-hosted mode
[ui] shell loaded with PWA manifest
[status] ready for the real app flow`}</pre>
          </div>
        </section>

        <aside className="rail">
          <div className="card rail__panel">
            <div className="card__header">
              <div>
                <p className="eyebrow">Health</p>
                <h2>Session state</h2>
              </div>
            </div>

            <div className="stats">
              {activity.map((item) => (
                <div key={item.label} className={`stat stat--${item.tone}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="card rail__panel">
            <div className="card__header">
              <div>
                <p className="eyebrow">Flow</p>
                <h2>Product split</h2>
              </div>
            </div>
            <ul className="bullet-list">
              <li>Self-hosted bridge stays free.</li>
              <li>Hosted app carries the paid layer.</li>
              <li>UI is ready for relay, auth, and billing hooks.</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
