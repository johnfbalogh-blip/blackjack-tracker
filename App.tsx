import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  DollarSign,
  Download,
  Flag,
  Pencil,
  PlusCircle,
  RotateCcw,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";

type Session = {
  id: string;
  location: string;
  game: string;
  initialBuyIn: number;
  rebuyTotal: number;
  rebuys: number[];
  buyIn: number;
  cashOut: number;
  pocket: number;
  actual: number;
  perceived: number;
  startTime: string;
  endTime: string;
  hours: number;
  notes: string;
};

function fmtCurrency(value: number | string) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(num);
}

function fmtHours(start: string, end: string) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  const ms = e.getTime() - s.getTime();
  if (Number.isNaN(ms) || ms <= 0) return 0;
  return ms / (1000 * 60 * 60);
}

function toLocalInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fmtElapsed(ms: number) {
  if (!ms || ms < 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function withRunningPerceived(rows: Session[]) {
  let running = 0;
  const chronological = [...rows].reverse().map((row) => {
    running += row.perceived;
    return { ...row, runningPerceived: running };
  });
  return chronological.reverse();
}

function downloadCSV(rows: Session[]) {
  const preparedRows = withRunningPerceived(rows);
  const headers = [
    "Date",
    "Location",
    "Game",
    "Initial Buy In",
    "Rebuy Total",
    "Total Buy In",
    "Cash Out",
    "In Pocket",
    "Needs Pocket",
    "Actual Win Loss",
    "Perceived Win Loss",
    "Running Perceived Total",
    "Start Time",
    "End Time",
    "Hours",
    "Notes",
  ];

  const csv = [
    headers.join(","),
    ...preparedRows.map((r: Session & { runningPerceived: number }) => [
      r.startTime ? new Date(r.startTime).toLocaleDateString() : "",
      `"${(r.location || "").replace(/"/g, '""')}"`,
      `"${(r.game || "").replace(/"/g, '""')}"`,
      r.initialBuyIn,
      r.rebuyTotal,
      r.buyIn,
      r.cashOut,
      r.pocket,
      r.pocket === 0 ? "YES" : "",
      r.actual,
      r.perceived,
      r.runningPerceived,
      `"${r.startTime || ""}"`,
      `"${r.endTime || ""}"`,
      r.hours.toFixed(2),
      `"${(r.notes || "").replace(/"/g, '""')}"`,
    ].join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "blackjack_sessions.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function StatCard({ title, value, icon: Icon }: { title: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="card stat-card">
      <div>
        <div className="stat-title">{title}</div>
        <div className="stat-value">{value}</div>
      </div>
      <div className="icon-badge">
        <Icon className="icon" />
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="label" id={htmlFor ? `${htmlFor}-label` : undefined}>{label}</span>
      {children}
    </label>
  );
}

export default function App() {
  const [form, setForm] = useState({
    location: "",
    game: "Blackjack",
    buyIn: "",
    cashOut: "",
    pocket: "",
    startTime: toLocalInputValue(),
    endTime: toLocalInputValue(),
    notes: "",
  });

  const [sessions, setSessions] = useState<Session[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [timerNow, setTimerNow] = useState(Date.now());
  const [manualHours, setManualHours] = useState("");
  const [quickEntry, setQuickEntry] = useState(false);
  const [rebuyAmount, setRebuyAmount] = useState("");
  const [rebuys, setRebuys] = useState<number[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [startingBankroll, setStartingBankroll] = useState("");

  useEffect(() => {
    if (!isRunning) return undefined;
    const interval = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const rebuyTotal = useMemo(() => rebuys.reduce((sum, value) => sum + value, 0), [rebuys]);

  const totalBuyIn = useMemo(() => Number(form.buyIn || 0) + rebuyTotal, [form.buyIn, rebuyTotal]);

  const actual = useMemo(() => {
    const cashOut = Number(form.cashOut || 0);
    const pocket = Number(form.pocket || 0);
    return cashOut + pocket - totalBuyIn;
  }, [form.cashOut, form.pocket, totalBuyIn]);

  const hours = useMemo(() => {
    if (manualHours !== "" && !Number.isNaN(Number(manualHours))) return Number(manualHours);
    return fmtHours(form.startTime, form.endTime);
  }, [form.startTime, form.endTime, manualHours]);

  const liveElapsed = useMemo(() => {
    if (!form.startTime) return "00:00:00";
    const start = new Date(form.startTime).getTime();
    const end = isRunning ? timerNow : new Date(form.endTime).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "00:00:00";
    return fmtElapsed(end - start);
  }, [form.startTime, form.endTime, isRunning, timerNow]);

  const summary = useMemo(() => {
    const totalActual = sessions.reduce((sum, s) => sum + s.actual, 0);
    const totalHours = sessions.reduce((sum, s) => sum + s.hours, 0);
    const hourly = totalHours > 0 ? totalActual / totalHours : 0;
    const needsPocketCount = sessions.filter((s) => s.pocket === 0).length;
    const bankroll = Number(startingBankroll || 0) + totalActual;
    return { totalActual, totalHours, hourly, needsPocketCount, bankroll };
  }, [sessions, startingBankroll]);

  const sessionsWithRunningTotals = useMemo(() => withRunningPerceived(sessions), [sessions]);

  const resetCurrentSession = () => {
    setEditingSessionId(null);
    setForm((prev) => ({
      ...prev,
      buyIn: "",
      cashOut: "",
      pocket: "",
      startTime: toLocalInputValue(),
      endTime: toLocalInputValue(),
      notes: "",
    }));
    setManualHours("");
    setRebuyAmount("");
    setRebuys([]);
    setIsRunning(false);
  };

  const addRebuy = (amountOverride?: number) => {
    const amount = Number(amountOverride ?? rebuyAmount);
    if (!amount || amount <= 0) return;
    setRebuys((prev) => [...prev, amount]);
    setRebuyAmount("");
  };

  const removeRebuy = (index: number) => {
    setRebuys((prev) => prev.filter((_, i) => i !== index));
  };

  const getQuickEntryStartTime = () => {
    const mostRecent = sessions[0];
    if (quickEntry && mostRecent?.endTime) return mostRecent.endTime;
    return form.startTime || toLocalInputValue();
  };

  const saveSession = () => {
    const initialBuyIn = Number(form.buyIn || 0);
    const buyIn = initialBuyIn + rebuyTotal;
    const cashOut = Number(form.cashOut || 0);
    const pocket = Number(form.pocket || 0);

    const resolvedStartTime = quickEntry && !editingSessionId ? getQuickEntryStartTime() : form.startTime;
    const resolvedEndTime = quickEntry && !editingSessionId ? toLocalInputValue() : form.endTime;

    const sessionHours = manualHours !== "" && !Number.isNaN(Number(manualHours))
      ? Number(manualHours)
      : fmtHours(resolvedStartTime, resolvedEndTime);

    const sessionData: Session = {
      id: editingSessionId ?? crypto.randomUUID(),
      location: form.location.trim(),
      game: form.game.trim() || "Blackjack",
      initialBuyIn,
      rebuyTotal,
      rebuys: [...rebuys],
      buyIn,
      cashOut,
      pocket,
      actual: cashOut + pocket - buyIn,
      perceived: cashOut - buyIn,
      startTime: resolvedStartTime,
      endTime: resolvedEndTime,
      hours: sessionHours,
      notes: form.notes.trim(),
    };

    if (editingSessionId) {
      setSessions((prev) => prev.map((session) => (session.id === editingSessionId ? sessionData : session)));
    } else {
      setSessions((prev) => [sessionData, ...prev]);
    }

    resetCurrentSession();
  };

  const editSession = (session: Session) => {
    setEditingSessionId(session.id);
    setForm({
      location: session.location,
      game: session.game,
      buyIn: String(session.initialBuyIn || ""),
      cashOut: String(session.cashOut || ""),
      pocket: String(session.pocket || ""),
      startTime: session.startTime,
      endTime: session.endTime,
      notes: session.notes,
    });
    setManualHours(String(session.hours || ""));
    setRebuyAmount("");
    setRebuys(session.rebuys || []);
    setIsRunning(false);
  };

  const removeSession = (id: string) => setSessions((prev) => prev.filter((s) => s.id !== id));
  const clearAll = () => setSessions([]);

  const startTimer = () => {
    const now = new Date();
    const localNow = toLocalInputValue(now);
    setForm((prev) => ({ ...prev, startTime: localNow, endTime: localNow }));
    setManualHours("");
    setTimerNow(now.getTime());
    setIsRunning(true);
  };

  const stopTimer = () => {
    const now = new Date();
    setForm((prev) => ({ ...prev, endTime: toLocalInputValue(now) }));
    setTimerNow(now.getTime());
    setIsRunning(false);
  };

  const endSessionNow = () => {
    const now = new Date();
    setForm((prev) => ({ ...prev, endTime: toLocalInputValue(now) }));
    setTimerNow(now.getTime());
    setIsRunning(false);
    setManualHours("");
  };

  const statCards = [
    { title: "Bankroll", value: fmtCurrency(summary.bankroll), icon: Wallet },
    { title: "Actual Win/Loss", value: fmtCurrency(summary.totalActual), icon: summary.totalActual >= 0 ? TrendingUp : TrendingDown },
    { title: "Time at Table", value: `${summary.totalHours.toFixed(2)} hrs`, icon: Clock3 },
    { title: "Hourly Rate", value: fmtCurrency(summary.hourly), icon: DollarSign },
    { title: "Needs Pocket", value: String(summary.needsPocketCount), icon: Flag },
  ];

  return (
    <div className="app-shell">
      <div className="container">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="title-row">
            <div>
              <h1 className="title">Blackjack Session Tracker TES123</h1>
              <p className="subtitle">
                Track buy-ins, rebuys, cash-out, money left in your pocket, actual result, bankroll, and time at the table.
              </p>
            </div>
            <button type="button" className={`btn ${quickEntry ? "btn-primary" : "btn-outline"}`} onClick={() => setQuickEntry((prev) => !prev)}>
              <Zap className="btn-icon" />
              {quickEntry ? "Quick Entry On" : "Quick Entry Off"}
            </button>
          </div>
        </motion.div>

        <div className="card">
          <div className="bankroll-grid">
            <Field label="Starting Bankroll" htmlFor="startingBankroll">
              <input id="startingBankroll" className="input" type="number" inputMode="decimal" value={startingBankroll} onChange={(e) => setStartingBankroll(e.target.value)} placeholder="0" />
            </Field>
            <div className="helper">Current bankroll = starting bankroll + total actual win/loss.</div>
          </div>
        </div>

        <div className="stats-grid">
          {statCards.map((card, i) => (
            <motion.div key={card.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}>
              <StatCard title={card.title} value={card.value} icon={card.icon} />
            </motion.div>
          ))}
        </div>

        <div className="main-grid">
          <div className="card">
            <div className="card-header">{editingSessionId ? "Edit Session" : quickEntry ? "Quick Entry" : "Add Session"}</div>
            <div className="stack">
              {!quickEntry && (
                <div className="grid-2">
                  <Field label="Casino / Location" htmlFor="location">
                    <input id="location" className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Example: Hard Rock Tampa" />
                  </Field>
                  <Field label="Game" htmlFor="game">
                    <input id="game" className="input" value={form.game} onChange={(e) => setForm({ ...form, game: e.target.value })} placeholder="Blackjack" />
                  </Field>
                </div>
              )}

              <div className={quickEntry ? "grid-2" : "grid-3"}>
                <Field label="Initial Buy-In" htmlFor="buyIn">
                  <input id="buyIn" className="input" type="number" inputMode="decimal" value={form.buyIn} onChange={(e) => setForm({ ...form, buyIn: e.target.value })} placeholder="1000" />
                </Field>
                <Field label="Cash-Out" htmlFor="cashOut">
                  <input id="cashOut" className="input" type="number" inputMode="decimal" value={form.cashOut} onChange={(e) => setForm({ ...form, cashOut: e.target.value })} placeholder="200" />
                </Field>
                {!quickEntry && (
                  <Field label="In Pocket" htmlFor="pocket">
                    <input id="pocket" className="input" type="number" inputMode="decimal" value={form.pocket} onChange={(e) => setForm({ ...form, pocket: e.target.value })} placeholder="1200" />
                  </Field>
                )}
              </div>

              <div className="subcard">
                <div className="stack">
                  <div className="rebuy-row">
                    <Field label="Rebuy Amount" htmlFor="rebuyAmount">
                      <input id="rebuyAmount" className="input" type="number" inputMode="decimal" value={rebuyAmount} onChange={(e) => setRebuyAmount(e.target.value)} placeholder="500" />
                    </Field>
                    <div className="button-wrap">
                      <button type="button" className="btn btn-primary" onClick={() => addRebuy()}><PlusCircle className="btn-icon" />Add Rebuy</button>
                      <button type="button" className="btn btn-outline" onClick={() => addRebuy(100)}>+100</button>
                      <button type="button" className="btn btn-outline" onClick={() => addRebuy(500)}>+500</button>
                      <button type="button" className="btn btn-outline" onClick={() => addRebuy(1000)}>+1000</button>
                    </div>
                  </div>
                  <div className="helper inline-helper">
                    <span><strong>Rebuy Total:</strong> {fmtCurrency(rebuyTotal)}</span>
                    <span className="dot">•</span>
                    <span><strong>Total Buy-In:</strong> {fmtCurrency(totalBuyIn)}</span>
                  </div>
                  {rebuys.length > 0 && (
                    <div className="chip-wrap">
                      {rebuys.map((amount, index) => (
                        <button key={`${amount}-${index}`} type="button" className="chip" onClick={() => removeRebuy(index)}>
                          {fmtCurrency(amount)} ×
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {!quickEntry && (
                <>
                  <div className="grid-2">
                    <Field label="Start Time" htmlFor="startTime">
                      <input id="startTime" className="input" type="datetime-local" value={form.startTime} onChange={(e) => { setForm({ ...form, startTime: e.target.value }); setManualHours(""); }} />
                    </Field>
                    <Field label="End Time" htmlFor="endTime">
                      <input id="endTime" className="input" type="datetime-local" value={form.endTime} onChange={(e) => { setForm({ ...form, endTime: e.target.value }); setManualHours(""); }} />
                    </Field>
                  </div>

                  <div className="subcard timer-row">
                    <div>
                      <div className="stat-title">Live Timer</div>
                      <div className="timer-value">{liveElapsed}</div>
                    </div>
                    <div className="button-wrap">
                      <button type="button" className={`btn ${isRunning ? "btn-secondary" : "btn-primary"}`} onClick={startTimer} disabled={isRunning}>Start</button>
                      <button type="button" className="btn btn-outline" onClick={stopTimer} disabled={!isRunning}>Stop</button>
                      <button type="button" className="btn btn-outline" onClick={endSessionNow}><Square className="btn-icon" />End Session</button>
                    </div>
                  </div>
                </>
              )}

              <div className={quickEntry ? "grid-2" : "grid-3"}>
                <div className="subcard">
                  <div className="stat-title">Actual Win/Loss</div>
                  <div className="stat-value medium">{fmtCurrency(actual)}</div>
                  <div className="helper">{quickEntry ? "Quick entry saves now and uses last session end as the next start time." : "Cash-Out + In Pocket - Total Buy-In"}</div>
                </div>
                <div className="subcard">
                  <div className="stat-title">Hours</div>
                  <div className="stat-value medium">{hours.toFixed(2)}</div>
                  <div className="helper">Live timer: {liveElapsed}</div>
                </div>
                {!quickEntry && (
                  <div className="subcard">
                    <div className="stat-title">Override Hours</div>
                    <input className="input" type="number" inputMode="decimal" step="0.01" value={manualHours} onChange={(e) => setManualHours(e.target.value)} placeholder="Optional" />
                    <div className="helper">Leave blank to use start and end time.</div>
                  </div>
                )}
              </div>

              {!quickEntry && (
                <Field label="Notes" htmlFor="notes">
                  <input id="notes" className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional: table conditions, mistakes, fatigue, heat check, dealer changes" />
                </Field>
              )}

              <div className="button-wrap">
                <button type="button" className="btn btn-primary" onClick={saveSession}><PlusCircle className="btn-icon" />{editingSessionId ? "Update Session" : "Save Session"}</button>
                <button type="button" className="btn btn-outline" onClick={resetCurrentSession}><RotateCcw className="btn-icon" />Reset Current</button>
                <button type="button" className="btn btn-outline" onClick={() => downloadCSV(sessions)} disabled={sessions.length === 0}><Download className="btn-icon" />Export CSV</button>
                <button type="button" className="btn btn-outline" onClick={clearAll} disabled={sessions.length === 0}>Clear All</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">Saved Sessions</div>
            {sessions.length === 0 ? (
              <div className="empty-state">No sessions yet. Add your first blackjack session on the left.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Location</th>
                      <th>Total Buy-In</th>
                      <th>Cash-Out</th>
                      <th>In Pocket</th>
                      <th>Flag</th>
                      <th>Actual</th>
                      <th>Perceived</th>
                      <th>Running Perceived</th>
                      <th>Hours</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionsWithRunningTotals.map((s: Session & { runningPerceived: number }) => (
                      <tr key={s.id}>
                        <td>{s.startTime ? new Date(s.startTime).toLocaleDateString() : ""}</td>
                        <td>
                          <div className="cell-title">{s.location || "—"}</div>
                          <div className="cell-subtitle">{s.game}</div>
                          {s.rebuyTotal > 0 && <div className="cell-subtitle">Rebuys: {fmtCurrency(s.rebuyTotal)}</div>}
                        </td>
                        <td>{fmtCurrency(s.buyIn)}</td>
                        <td>{fmtCurrency(s.cashOut)}</td>
                        <td>{fmtCurrency(s.pocket)}</td>
                        <td>
                          {s.pocket === 0 ? <span className="pill">Needs Pocket</span> : <span className="muted">—</span>}
                        </td>
                        <td className={s.actual >= 0 ? "positive" : "negative"}>{fmtCurrency(s.actual)}</td>
                        <td>{fmtCurrency(s.perceived)}</td>
                        <td className={s.runningPerceived >= 0 ? "positive" : "negative"}>{fmtCurrency(s.runningPerceived)}</td>
                        <td>{s.hours.toFixed(2)}</td>
                        <td>
                          <div className="action-buttons">
                            <button type="button" className="icon-button" onClick={() => editSession(s)} aria-label="Edit session"><Pencil className="icon" /></button>
                            <button type="button" className="icon-button" onClick={() => removeSession(s.id)} aria-label="Delete session"><Trash2 className="icon" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
