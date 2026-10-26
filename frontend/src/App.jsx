import React, { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000")
  .replace(/\/+$/, "");
const STATUSES = ["pending", "in-progress", "completed"];
const EMPTY_FORM = { title: "", description: "", status: "pending", dueDate: "" };

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Could not connect to the server. Check that the backend is running.");
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
  if (!response.ok) throw new Error(result.message || "The request could not be completed.");
  return result;
}

function dateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function readableDate(value) {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Invalid due date"
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function statusLabel(status) {
  return status.replace("-", " ");
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [plannerDescription, setPlannerDescription] = useState("");
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerError, setPlannerError] = useState("");
  const [plan, setPlan] = useState(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest("/api/tasks");
      setTasks(result.data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const counts = useMemo(() => ({
    total: tasks.length,
    active: tasks.filter((task) => task.status !== "completed").length,
    completed: tasks.filter((task) => task.status === "completed").length,
  }), [tasks]);

  const changeForm = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setNotice("");
  };

  const submitTask = async (event) => {
    event.preventDefault();
    setNotice("");
    setError("");
    setSaving(true);
    const payload = { ...form, dueDate: form.dueDate || null };
    try {
      await apiRequest(editingId ? `/api/tasks/${editingId}` : "/api/tasks", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setNotice(editingId ? "Task updated." : "Task created.");
      resetForm();
      await loadTasks();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (task) => {
    setEditingId(task._id);
    setForm({
      title: task.title || "",
      description: task.description || "",
      status: task.status || "pending",
      dueDate: dateInputValue(task.dueDate),
    });
    setNotice("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeTask = async (task) => {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/tasks/${task._id}`, { method: "DELETE" });
      setNotice("Task deleted.");
      await loadTasks();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const updateStatus = async (task, status) => {
    setError("");
    try {
      await apiRequest(`/api/tasks/${task._id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: task.title,
          description: task.description || "",
          status,
          dueDate: dateInputValue(task.dueDate) || null,
        }),
      });
      await loadTasks();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const submitPlan = async (event) => {
    event.preventDefault();
    setPlannerError("");
    setPlan(null);
    setPlannerLoading(true);
    try {
      const result = await apiRequest("/api/ai/plan-task", {
        method: "POST",
        body: JSON.stringify({ description: plannerDescription }),
      });
      setPlan(result.plan);
    } catch (requestError) {
      setPlannerError(requestError.message);
    } finally {
      setPlannerLoading(false);
    }
  };

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Taskflow home">
          <span className="brand-mark">T</span>
          <span>taskflow</span>
        </a>
        <span className="topbar-note"><span className="live-dot" /> Your personal workspace</span>
      </header>

      <section className="welcome">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Make space for<br className="mobile-break" /> what matters.</h1>
          <p className="welcome-copy">A little progress each day adds up to big results.</p>
        </div>
        <div className="date-chip">
          <span className="date-icon" aria-hidden="true">◷</span>
          <span>{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</span>
        </div>
      </section>

      <section className="stats-grid" aria-label="Task overview">
        <article className="stat-card">
          <span className="stat-icon icon-total">▤</span>
          <div><p>Total tasks</p><strong>{counts.total}</strong></div>
        </article>
        <article className="stat-card">
          <span className="stat-icon icon-active">◷</span>
          <div><p>In progress</p><strong>{counts.active}</strong></div>
        </article>
        <article className="stat-card">
          <span className="stat-icon icon-completed">✓</span>
          <div><p>Completed</p><strong>{counts.completed}</strong></div>
        </article>
      </section>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <div className="content-grid">
        <section className="panel task-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">STAY ON TRACK</p>
              <h2>Your tasks <span className="count-pill">{tasks.length}</span></h2>
            </div>
            <button className="button button-quiet" type="button" onClick={loadTasks} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {loading ? (
            <div className="loading-state"><span className="spinner" /> Loading your tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">✳</span>
              <h3>Nothing on your list yet</h3>
              <p>Add your first task and give your day some direction.</p>
            </div>
          ) : (
            <div className="task-list">
              {tasks.map((task) => (
                <article className="task-card" key={task._id}>
                  <span className={`task-marker marker-${task.status}`} aria-hidden="true">
                    {task.status === "completed" ? "✓" : ""}
                  </span>
                  <div className="task-main">
                    <div className="task-title-row">
                      <h3 className={task.status === "completed" ? "task-title completed-title" : "task-title"}>{task.title}</h3>
                      <span className={`status-badge status-${task.status}`}>{statusLabel(task.status)}</span>
                    </div>
                    {task.description && <p className="task-description">{task.description}</p>}
                    <p className="task-due"><span aria-hidden="true">◷</span> {readableDate(task.dueDate)}</p>
                  </div>
                  <div className="task-actions">
                    <label className="sr-only" htmlFor={`status-${task._id}`}>Change status for {task.title}</label>
                    <select
                      id={`status-${task._id}`}
                      className="status-select"
                      value={task.status}
                      onChange={(event) => updateStatus(task, event.target.value)}
                      aria-label={`Change status for ${task.title}`}
                    >
                      {STATUSES.map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}
                    </select>
                    <button className="icon-button" type="button" onClick={() => beginEdit(task)} aria-label={`Edit ${task.title}`}>Edit</button>
                    <button className="icon-button delete-button" type="button" onClick={() => removeTask(task)} aria-label={`Delete ${task.title}`}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="side-column">
          <section className="panel form-panel">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">{editingId ? "MAKE A CHANGE" : "GET IT OUT OF YOUR HEAD"}</p>
                <h2>{editingId ? "Edit task" : "Add a task"}</h2>
              </div>
              {editingId && <button className="text-button" type="button" onClick={resetForm}>Cancel</button>}
            </div>
            <form onSubmit={submitTask} className="task-form">
              <label htmlFor="task-title">Task name</label>
              <input
                id="task-title"
                name="title"
                value={form.title}
                onChange={changeForm}
                placeholder="What needs to get done?"
                maxLength={160}
                required
              />
              <label htmlFor="task-description">Description <span className="optional">Optional</span></label>
              <textarea
                id="task-description"
                name="description"
                value={form.description}
                onChange={changeForm}
                placeholder="Add a few details..."
                rows={3}
              />
              <div className="form-row">
                <div>
                  <label htmlFor="task-status">Status</label>
                  <select id="task-status" name="status" value={form.status} onChange={changeForm}>
                    {STATUSES.map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="task-due-date">Due date</label>
                  <input id="task-due-date" name="dueDate" type="date" value={form.dueDate} onChange={changeForm} />
                </div>
              </div>
              <button className="button button-primary submit-button" type="submit" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Add task"}
              </button>
            </form>
          </section>

          <section className="planner-card">
            <div className="planner-heading">
              <span className="planner-spark" aria-hidden="true">✳</span>
              <div><p className="eyebrow">A LITTLE HELP FROM AI</p><h2>Plan your next move</h2></div>
            </div>
            <p className="planner-copy">Turn a big idea into a clear, doable plan.</p>
            <form onSubmit={submitPlan} className="planner-form">
              <label className="sr-only" htmlFor="planner-description">Describe what you need to do</label>
              <textarea
                id="planner-description"
                value={plannerDescription}
                onChange={(event) => setPlannerDescription(event.target.value)}
                placeholder="What are you trying to accomplish?"
                rows={3}
                maxLength={5000}
                required
              />
              <button className="button button-dark" type="submit" disabled={plannerLoading}>
                {plannerLoading ? <><span className="button-spinner" /> Making a plan...</> : "Create a plan"}
              </button>
            </form>
            {plannerError && <p className="planner-error" role="alert">{plannerError}</p>}
            {plan && (
              <div className="plan-result" aria-live="polite">
                <p className="plan-summary">{plan.summary}</p>
                <div className="plan-facts">
                  <span className={`priority priority-${plan.priority}`}>{plan.priority} priority</span>
                  <span>{plan.estimatedHours} {plan.estimatedHours === 1 ? "hour" : "hours"}</span>
                </div>
                <ol>{plan.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol>
              </div>
            )}
          </section>
        </aside>
      </div>
      <footer className="footer"><span>One thing at a time.</span><span>Taskflow</span></footer>
    </main>
  );
}

export default App;
