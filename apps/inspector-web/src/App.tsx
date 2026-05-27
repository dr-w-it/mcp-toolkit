import { useState, type FormEvent } from "react";
import type { ConnectionProfile, ConnectionTransport } from "@dr-w/core";
import { capabilitySummary, connectionProfiles, traceEntries } from "./mockData";

const selectedTool = capabilitySummary.tools[0];

interface KeyValueRow {
  id: string;
  key: string;
  value: string;
}

const transportOptions: { label: string; value: ConnectionTransport }[] = [
  { label: "stdio", value: "stdio" },
  { label: "HTTP", value: "http" },
  { label: "SSE", value: "sse" },
];

function createBlankRow(prefix: string): KeyValueRow {
  return {
    id: `${prefix}-${crypto.randomUUID()}`,
    key: "",
    value: "",
  };
}

function rowsToRecord(rows: KeyValueRow[]) {
  const entries = rows
    .map((row) => [row.key.trim(), row.value] as const)
    .filter(([key]) => key.length > 0);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function App() {
  const [draftConnections, setDraftConnections] =
    useState<ConnectionProfile[]>(connectionProfiles);
  const [selectedConnectionId, setSelectedConnectionId] = useState(
    connectionProfiles[0]?.id ?? "",
  );
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<ConnectionTransport>("stdio");
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");
  const [envRows, setEnvRows] = useState<KeyValueRow[]>([createBlankRow("env")]);
  const [headerRows, setHeaderRows] = useState<KeyValueRow[]>([
    createBlankRow("header"),
  ]);

  const selectedConnection =
    draftConnections.find((connection) => connection.id === selectedConnectionId) ??
    draftConnections[0];
  const isRemoteTransport = transport === "http" || transport === "sse";
  const canCreateDraft =
    name.trim().length > 0 &&
    ((transport === "stdio" && command.trim().length > 0) ||
      (isRemoteTransport && url.trim().length > 0));

  function resetForm() {
    setName("");
    setTransport("stdio");
    setCommand("");
    setUrl("");
    setEnvRows([createBlankRow("env")]);
    setHeaderRows([createBlankRow("header")]);
  }

  function updateRow(
    rows: KeyValueRow[],
    rowId: string,
    field: "key" | "value",
    value: string,
  ) {
    return rows.map((row) =>
      row.id === rowId
        ? {
            ...row,
            [field]: value,
          }
        : row,
    );
  }

  function removeRow(rows: KeyValueRow[], rowId: string, prefix: string) {
    const nextRows = rows.filter((row) => row.id !== rowId);

    return nextRows.length > 0 ? nextRows : [createBlankRow(prefix)];
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const now = new Date().toISOString();
    const profile: ConnectionProfile = {
      id: `draft-${Date.now()}`,
      name: name.trim(),
      transport,
      command: transport === "stdio" ? command.trim() : undefined,
      url: isRemoteTransport ? url.trim() : undefined,
      env: rowsToRecord(envRows),
      headers: isRemoteTransport ? rowsToRecord(headerRows) : undefined,
      createdAt: now,
      updatedAt: now,
    };

    setDraftConnections((connections) => [profile, ...connections]);
    setSelectedConnectionId(profile.id);
    resetForm();
  }

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
            {draftConnections.map((connection) => (
              <button
                className={`connection-item ${
                  connection.id === selectedConnection?.id ? "active" : ""
                }`}
                key={connection.id}
                onClick={() => setSelectedConnectionId(connection.id)}
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
          <section className="surface connection-setup">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Connection setup</p>
                <h2>Draft local profile</h2>
              </div>
            </div>

            <form className="connection-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Name</span>
                <input
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Local filesystem"
                  type="text"
                  value={name}
                />
              </label>

              <fieldset className="field transport-field">
                <legend>Transport</legend>
                <div className="transport-options">
                  {transportOptions.map((option) => (
                    <button
                      className={option.value === transport ? "selected" : ""}
                      key={option.value}
                      onClick={() => setTransport(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {transport === "stdio" ? (
                <label className="field">
                  <span>Command</span>
                  <input
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder="npx @modelcontextprotocol/server-filesystem ./"
                    type="text"
                    value={command}
                  />
                </label>
              ) : (
                <label className="field">
                  <span>Remote URL</span>
                  <input
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder={
                      transport === "http"
                        ? "https://mcp.example.test"
                        : "https://mcp.example.test/sse"
                    }
                    type="url"
                    value={url}
                  />
                </label>
              )}

              <div className="key-value-section">
                <div className="key-value-header">
                  <h3>Environment</h3>
                  <button
                    onClick={() =>
                      setEnvRows((rows) => [...rows, createBlankRow("env")])
                    }
                    type="button"
                  >
                    Add env
                  </button>
                </div>
                {envRows.map((row) => (
                  <div className="key-value-row" key={row.id}>
                    <input
                      aria-label="Environment variable name"
                      onChange={(event) =>
                        setEnvRows((rows) =>
                          updateRow(rows, row.id, "key", event.target.value),
                        )
                      }
                      placeholder="NAME"
                      type="text"
                      value={row.key}
                    />
                    <input
                      aria-label="Environment variable value"
                      onChange={(event) =>
                        setEnvRows((rows) =>
                          updateRow(rows, row.id, "value", event.target.value),
                        )
                      }
                      placeholder="value"
                      type="password"
                      value={row.value}
                    />
                    <button
                      aria-label="Remove environment variable"
                      onClick={() =>
                        setEnvRows((rows) => removeRow(rows, row.id, "env"))
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              {isRemoteTransport ? (
                <div className="key-value-section">
                  <div className="key-value-header">
                    <h3>Headers</h3>
                    <button
                      onClick={() =>
                        setHeaderRows((rows) => [
                          ...rows,
                          createBlankRow("header"),
                        ])
                      }
                      type="button"
                    >
                      Add header
                    </button>
                  </div>
                  {headerRows.map((row) => (
                    <div className="key-value-row" key={row.id}>
                      <input
                        aria-label="Header name"
                        onChange={(event) =>
                          setHeaderRows((rows) =>
                            updateRow(rows, row.id, "key", event.target.value),
                          )
                        }
                        placeholder="Authorization"
                        type="text"
                        value={row.key}
                      />
                      <input
                        aria-label="Header value"
                        onChange={(event) =>
                          setHeaderRows((rows) =>
                            updateRow(rows, row.id, "value", event.target.value),
                          )
                        }
                        placeholder="Bearer token"
                        type="password"
                        value={row.value}
                      />
                      <button
                        aria-label="Remove header"
                        onClick={() =>
                          setHeaderRows((rows) =>
                            removeRow(rows, row.id, "header"),
                          )
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="form-actions">
                <button onClick={resetForm} type="button">
                  Reset
                </button>
                <button className="primary" disabled={!canCreateDraft} type="submit">
                  Create draft
                </button>
              </div>
            </form>

            {selectedConnection ? (
              <div className="draft-preview">
                <h3>Selected profile</h3>
                <pre>
                  {JSON.stringify(
                    {
                      name: selectedConnection.name,
                      transport: selectedConnection.transport,
                      command: selectedConnection.command,
                      url: selectedConnection.url,
                      env: selectedConnection.env
                        ? Object.keys(selectedConnection.env)
                        : undefined,
                      headers: selectedConnection.headers
                        ? Object.keys(selectedConnection.headers)
                        : undefined,
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>
            ) : null}
          </section>

          <div className="inspector-grid">
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
                        content:
                          "MCP Toolkit is a developer-focused repository...",
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
