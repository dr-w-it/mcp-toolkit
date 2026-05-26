import { capabilitySummary, connectionProfiles, traceEntries } from "./mockData";

const selectedConnection = connectionProfiles[0];
const selectedTool = capabilitySummary.tools[0];

export function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">dr-w</span>
          <div>
            <h1>MCP Inspector</h1>
            <p>Local runtime</p>
          </div>
        </div>

        <section className="panel">
          <div className="panel-header">
            <h2>Connections</h2>
            <button type="button">New</button>
          </div>
          <div className="connection-list">
            {connectionProfiles.map((connection) => (
              <button
                className={`connection-item ${
                  connection.id === selectedConnection?.id ? "active" : ""
                }`}
                key={connection.id}
                type="button"
              >
                <span>{connection.name}</span>
                <small>{connection.transport}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Timeline</h2>
          </div>
          <div className="timeline">
            {traceEntries.map((entry) => (
              <button className="timeline-item" key={entry.id} type="button">
                <span className={`status-dot ${entry.status}`} />
                <span>{entry.operation}</span>
                <small>{entry.durationMs}ms</small>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Connected target</p>
            <h2>{selectedConnection?.name}</h2>
          </div>
          <div className="topbar-actions">
            <button type="button">Replay</button>
            <button className="primary" type="button">
              Connect
            </button>
          </div>
        </header>

        <div className="content-grid">
          <section className="surface explorer">
            <div className="tabs">
              <button className="selected" type="button">
                Tools
              </button>
              <button type="button">Resources</button>
              <button type="button">Prompts</button>
              <button type="button">Schemas</button>
            </div>

            <div className="capability-list">
              {capabilitySummary.tools.map((tool) => (
                <article
                  className={`capability-card ${
                    tool.name === selectedTool?.name ? "selected" : ""
                  }`}
                  key={tool.name}
                >
                  <h3>{tool.name}</h3>
                  <p>{tool.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="surface request-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Tool call</p>
                <h2>{selectedTool?.name}</h2>
              </div>
              <button className="primary" type="button">
                Execute
              </button>
            </div>

            <div className="editor-grid">
              <div>
                <h3>Request</h3>
                <pre>{JSON.stringify({ path: "./README.md" }, null, 2)}</pre>
              </div>
              <div>
                <h3>Response</h3>
                <pre>
                  {JSON.stringify(
                    {
                      status: "ok",
                      content: "MCP Toolkit is a developer-focused repository...",
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
