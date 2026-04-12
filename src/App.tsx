import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock3,
  Download,
  Pencil,
  Play,
  PlusCircle,
  RotateCcw,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { motion } from "framer-motion";

type SessionStatus = "active" | "completed";

type Session = {
  runningPerceived?: number;
  id: string;
  status: SessionStatus;
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

function withRunningPerceived(rows: Session[]): Array<Session & { runningPerceived: number }> {
  let running = 0;
  const chronological = [...rows]
    .filter((row) => row.status === "completed")
    .reverse()
    .map((row) => {
      running += row.perceived;
      return { ...row, runningPerceived: running };
    });
  return chronological.reverse();
}

function downloadCSV(rows: Session[]) {
  const preparedRows = withRunningPerceived(rows);
  const headers = [
    "Status",
    "Date",
    "Location",
    "Game",
    "Initial Buy In",
    "Rebuy Total",
    "Total Buy In",
    "Cash Out",
    "REMOVED",
    "Open Session",
    "Win Loss",
    "Total Win/Loss",
    "Running Total Win/Loss",
    "Start Time",
    "End Time",
    "Hours",
    "Notes",
  ];

  const csv = [
    headers.join(","),
    ...preparedRows.map((r: Session & { runningPerceived: number }) =>
      [
        r.status,
        r.startTime ? new Date(r.startTime).toLocaleDateString() : "",
        `"${(r.location || "").replace(/"/g, '""')}"`,
        `"${(r.game || "").replace(/"/g, '""')}"`,
        r.initialBuyIn,
        r.rebuyTotal,
        r.buyIn,
        r.cashOut,
        r.pocket,
        r.status === "active" ? "YES" : "",
        r.actual,
        r.perceived,
        r.runningPerceived,
        `"${r.startTime || ""}"`,
        `"${r.endTime || ""}"`,
        r.hours.toFixed(2),
        `"${(r.notes || "").replace(/"/g, '""')}"`,
      ].join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `session_tracker_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 ${props.className || ""}`}
    />
  );
}

function SmallStat({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
      ? "text-red-600"
      : "text-slate-900";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

export default function App() {
  const [startForm, setStartForm] = useState({
    location: "",
    game: "Blackjack",
    buyIn: "",
  });
  const [lastBuyIn, setLastBuyIn] = useState("");
  const [finishForm, setFinishForm] = useState({
    cashOut: "",
    pocket: "",
  });
  const [editForm, setEditForm] = useState({
    location: "",
    game: "Blackjack",
    initialBuyIn: "",
    cashOut: "",
    pocket: "",
    startTime: toLocalInputValue(),
    endTime: toLocalInputValue(),
    notes: "",
  });

  const [sessions, setSessions] = useState<Session[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = window.localStorage.getItem("blackjack-sessions");
    return saved ? JSON.parse(saved) : [];
  });
  const [timerNow, setTimerNow] = useState(Date.now());
  const [rebuyAmount, setRebuyAmount] = useState("");
  const [editRebuyAmount, setEditRebuyAmount] = useState("");
  const [editRebuys, setEditRebuys] = useState<number[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [manualHours, setManualHours] = useState("");
  const [startingBankroll, setStartingBankroll] = useState(() => {
    if (typeof window === "undefined") return "";
    const saved = window.localStorage.getItem("starting-bankroll");
    return saved ? saved : "";
  });
  const [bankrollAdd, setBankrollAdd] = useState("");
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [lastClearedData, setLastClearedData] = useState<{
    sessions: Session[];
    startingBankroll: string;
  } | null>(null);
  const buyInHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("blackjack-sessions", JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("starting-bankroll", startingBankroll);
  }, [startingBankroll]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.status === "active") || null,
    [sessions]
  );

  const openSessionCount = useMemo(
    () => sessions.filter((s) => s.status === "active").length,
    [sessions]
  );

  const openSessionWarning = useMemo(
    () => sessions.find((s) => s.status === "active") || null,
    [sessions]
  );

  useEffect(() => {
    if (!activeSession) return undefined;
    const interval = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession || editingSessionId) return;
    setFinishForm({
      cashOut: activeSession.cashOut ? String(activeSession.cashOut) : "",
      pocket: activeSession.pocket ? String(activeSession.pocket) : "",
    });
  }, [activeSession, editingSessionId]);

  const completedSessions = useMemo(
    () => sessions.filter((session) => session.status === "completed"),
    [sessions]
  );

  const sessionsWithRunningTotals = useMemo(
    () => withRunningPerceived(completedSessions),
    [completedSessions]
  );

  const summary = useMemo(() => {
    const totalActual = completedSessions.reduce((sum, s) => sum + s.actual, 0);
    const totalHours = completedSessions.reduce((sum, s) => sum + s.hours, 0);
    const hourly = totalHours > 0 ? totalActual / totalHours : 0;
    const needsPocketCount = openSessionCount;
    const bankroll = Number(startingBankroll || 0) + totalActual;
    return { totalActual, totalHours, hourly, needsPocketCount, bankroll };
  }, [completedSessions, startingBankroll, openSessionCount]);

  const activeElapsed = useMemo(() => {
    if (!activeSession?.startTime) return "00:00:00";
    const start = new Date(activeSession.startTime).getTime();
    if (Number.isNaN(start)) return "00:00:00";
    return fmtElapsed(timerNow - start);
  }, [activeSession, timerNow]);

  const activeHours = useMemo(() => {
    if (!activeSession?.startTime) return 0;
    const start = new Date(activeSession.startTime).getTime();
    if (Number.isNaN(start)) return 0;
    return Math.max(0, (timerNow - start) / (1000 * 60 * 60));
  }, [activeSession, timerNow]);

  const finishRebuyTotal = useMemo(
    () => (activeSession?.rebuys || []).reduce((sum, value) => sum + value, 0),
    [activeSession]
  );

  const finishTotalBuyIn = useMemo(
    () => Number(activeSession?.initialBuyIn || 0) + finishRebuyTotal,
    [activeSession, finishRebuyTotal]
  );

  const finishActual = useMemo(() => {
    const cashOut = Number(finishForm.cashOut || 0);
    const pocket = Number(finishForm.pocket || 0);
    return cashOut + pocket - finishTotalBuyIn;
  }, [finishForm.cashOut, finishForm.pocket, finishTotalBuyIn]);

  const resetStartForm = () => {
    setStartForm({
      location: "",
      game: "Blackjack",
      buyIn: "",
    });
  };

  const resetFinishForm = () => {
    setFinishForm({
      cashOut: "",
      pocket: "",
    });
    setRebuyAmount("");
  };

  const resetEditForm = () => {
    setEditingSessionId(null);
    setEditForm({
      location: "",
      game: "Blackjack",
      initialBuyIn: "",
      cashOut: "",
      pocket: "",
      startTime: toLocalInputValue(),
      endTime: toLocalInputValue(),
      notes: "",
    });
    setEditRebuyAmount("");
    setEditRebuys([]);
    setManualHours("");
  };

  const startSession = () => {
    setLastBuyIn(startForm.buyIn);
    if (activeSession) return;
    const now = toLocalInputValue();
    const initialBuyIn = Number(startForm.buyIn || 0);

    const newSession: Session = {
      id: crypto.randomUUID(),
      status: "active",
      location: startForm.location.trim(),
      game: startForm.game.trim() || "Blackjack",
      initialBuyIn,
      rebuyTotal: 0,
      rebuys: [],
      buyIn: initialBuyIn,
      cashOut: 0,
      pocket: 0,
      actual: 0,
      perceived: 0,
      startTime: now,
      endTime: now,
      hours: 0,
      notes: "",
    };

    setSessions((prev) => [newSession, ...prev]);
    resetStartForm();
    resetFinishForm();
    setTimerNow(Date.now());
  };

  const addRebuyToActive = (amountOverride?: number) => {
    if (!activeSession) return;
    const amount = Number(amountOverride ?? rebuyAmount);
    if (!amount || amount <= 0) return;

    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== activeSession.id) return session;
        const rebuys = [...session.rebuys, amount];
        const rebuyTotal = rebuys.reduce((sum, value) => sum + value, 0);
        return {
          ...session,
          rebuys,
          rebuyTotal,
          buyIn: session.initialBuyIn + rebuyTotal,
        };
      })
    );
    setRebuyAmount("");
  };

  const removeRebuyFromActive = (index: number) => {
    if (!activeSession) return;

    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== activeSession.id) return session;
        const rebuys = session.rebuys.filter((_, i) => i !== index);
        const rebuyTotal = rebuys.reduce((sum, value) => sum + value, 0);
        return {
          ...session,
          rebuys,
          rebuyTotal,
          buyIn: session.initialBuyIn + rebuyTotal,
        };
      })
    );
  };

  const finishSession = () => {
    if (!activeSession) return;
    const cashOut = Number(finishForm.cashOut || 0);
    const pocket = Number(finishForm.pocket || 0);
    const endTime = toLocalInputValue();
    const rebuyTotal = activeSession.rebuys.reduce((sum, value) => sum + value, 0);
    const buyIn = activeSession.initialBuyIn + rebuyTotal;
    const actual = cashOut + pocket - buyIn;
    const perceived = cashOut - buyIn;
    const hours = fmtHours(activeSession.startTime, endTime);

    setSessions((prev) =>
      prev.map((session) =>
        session.id === activeSession.id
          ? {
              ...session,
              status: "completed",
              rebuyTotal,
              buyIn,
              cashOut,
              pocket,
              actual,
              perceived,
              endTime,
              hours,
            }
          : session
      )
    );
    resetFinishForm();
  };


  const editSession = (session: Session) => {
    setEditingSessionId(session.id);
    setEditForm({
      location: session.location,
      game: session.game,
      initialBuyIn: String(session.initialBuyIn || ""),
      cashOut: String(session.cashOut || ""),
      pocket: String(session.pocket || ""),
      startTime: session.startTime,
      endTime: session.endTime,
      notes: session.notes,
    });
    setEditRebuyAmount("");
    setEditRebuys(session.rebuys || []);
    setManualHours(String(session.hours || ""));
    window.setTimeout(() => {
      const el = document.getElementById("edit-session-panel");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const updateEditedSession = () => {
    if (!editingSessionId) return;

    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== editingSessionId) return session;

        const startTime = editForm.startTime;
        const endTime = session.status === "active" ? session.endTime : editForm.endTime;
        const initialBuyIn = Number(editForm.initialBuyIn || 0);
        const cashOut = Number(editForm.cashOut || 0);
        const pocket = Number(editForm.pocket || 0);
        const rebuys = [...editRebuys];
        const rebuyTotal = rebuys.reduce((sum, value) => sum + value, 0);
        const buyIn = initialBuyIn + rebuyTotal;
        const hours =
          manualHours !== "" && !Number.isNaN(Number(manualHours))
            ? Number(manualHours)
            : fmtHours(startTime, endTime);

        return {
          ...session,
          rebuys,
          location: editForm.location.trim(),
          game: editForm.game.trim() || "Blackjack",
          initialBuyIn,
          cashOut,
          pocket,
          startTime,
          endTime,
          rebuyTotal,
          buyIn,
          actual: cashOut + pocket - buyIn,
          perceived: cashOut - buyIn,
          hours,
          notes: editForm.notes.trim(),
        };
      })
    );

    resetEditForm();
  };

  const addEditRebuy = (amountOverride?: number) => {
    const amount = Number(amountOverride ?? editRebuyAmount);
    if (!amount || amount <= 0) return;
    setEditRebuys((prev) => [...prev, amount]);
    setEditRebuyAmount("");
  };

  const removeEditRebuy = (index: number) => {
    setEditRebuys((prev) => prev.filter((_, i) => i !== index));
  };

  const editRebuyTotal = useMemo(
    () => editRebuys.reduce((sum, value) => sum + value, 0),
    [editRebuys]
  );

  const editTotalBuyIn = useMemo(
    () => Number(editForm.initialBuyIn || 0) + editRebuyTotal,
    [editForm.initialBuyIn, editRebuyTotal]
  );

  const editActual = useMemo(() => {
    const cashOut = Number(editForm.cashOut || 0);
    const pocket = Number(editForm.pocket || 0);
    return cashOut + pocket - editTotalBuyIn;
  }, [editForm.cashOut, editForm.pocket, editTotalBuyIn]);

  const removeSession = (id: string) => {
    setSessions((prev) => prev.filter((session) => session.id !== id));
    if (editingSessionId === id) {
      resetEditForm();
    }
  };

  const handleBuyInShortcutAdd = (amount: number) => {
    setStartForm((p) => ({
      ...p,
      buyIn: String(Number(p.buyIn || 0) + amount),
    }));
  };

  const handleBuyInShortcutReplace = (amount: number) => {
    setStartForm((p) => ({
      ...p,
      buyIn: String(amount),
    }));
  };

  const handleBuyInPointerDown = (amount: number) => {
    if (!!activeSession) return;
    longPressTriggered.current = false;
    if (buyInHoldTimer.current) clearTimeout(buyInHoldTimer.current);
    buyInHoldTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      handleBuyInShortcutReplace(amount);
    }, 500);
  };

  const handleBuyInPointerUp = (amount: number) => {
    if (!!activeSession) return;
    if (buyInHoldTimer.current) {
      clearTimeout(buyInHoldTimer.current);
      buyInHoldTimer.current = null;
    }
    if (!longPressTriggered.current) {
      handleBuyInShortcutAdd(amount);
    }
    longPressTriggered.current = false;
  };

  const handleBuyInPointerLeave = () => {
    if (buyInHoldTimer.current) {
      clearTimeout(buyInHoldTimer.current);
      buyInHoldTimer.current = null;
    }
  };

  const addToBankroll = (amountOverride?: number) => {
    const amt = Number(amountOverride ?? bankrollAdd);
    if (!amt || amt <= 0) return;
    const current = Number(startingBankroll || 0);
    const next = current + amt;
    setStartingBankroll(String(next));
    setBankrollAdd("");
  };

  const clearAll = () => {
    setLastClearedData({
      sessions: [...sessions],
      startingBankroll,
    });

    if (typeof window !== "undefined") {
      localStorage.removeItem("blackjack-sessions");
      localStorage.removeItem("starting-bankroll");
    }

    setSessions([]);
    setStartingBankroll("");
    setBankrollAdd("");
    setConfirmClearAll(false);
    resetStartForm();
    resetFinishForm();
    resetEditForm();
  };

  const restoreLastCleared = () => {
    if (!lastClearedData) return;

    setSessions(lastClearedData.sessions);
    setStartingBankroll(lastClearedData.startingBankroll);
    setBankrollAdd("");
    setConfirmClearAll(false);
    setLastClearedData(null);
    resetStartForm();
    resetFinishForm();
    resetEditForm();
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight leading-tight">Session Edge</h1>
              <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800">
                V2
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500 max-w-xl">
              Track your real edge — not just your results.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadCSV(completedSessions)}
              disabled={completedSessions.length === 0}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </motion.div>

        {openSessionWarning && (
          <div className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">Active Session in Progress</div>
                <div className="text-sm text-amber-900">
                  You have an open session in progress{openSessionWarning.location ? ` at ${openSessionWarning.location}` : ""}. Finish it in Step 2 or edit it below.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById("finish-session-panel");
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="inline-flex h-10 items-center gap-2 rounded-2xl bg-amber-100 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-200"
              >
                Go to Open Session
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SmallStat icon={Wallet} label="Bankroll" value={fmtCurrency(summary.bankroll)} />
          <SmallStat
            icon={summary.totalActual >= 0 ? TrendingUp : TrendingDown}
            label="Win/Loss"
            value={fmtCurrency(summary.totalActual)}
            tone={summary.totalActual >= 0 ? "positive" : "negative"}
          />
          <SmallStat icon={Clock3} label="Hours" value={`${summary.totalHours.toFixed(2)} hrs`} />
          <SmallStat
            icon={TrendingUp}
            label="Hourly"
            value={fmtCurrency(summary.hourly)}
            tone={summary.hourly >= 0 ? "positive" : "negative"}
          />
          
        </div>

        <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-5">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
              <div className="mb-4">
                <div className="text-lg font-semibold">Step 1 · Start Session</div>
                <div className="text-sm text-slate-500">Enter what you know now and start the timer.</div>
              </div>

              <div className="space-y-4">
                <Field label="Starting Bankroll">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={startingBankroll}
                    onChange={(e) => setStartingBankroll(e.target.value)}
                    placeholder="0"
                    className="h-12 text-base"
                  />
                </Field>

                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Add to Bankroll</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={bankrollAdd}
                      onChange={(e) => setBankrollAdd(e.target.value)}
                      placeholder="Amount to add"
                      className="h-12 text-base"
                    />
                    <button
                      type="button"
                      onClick={() => addToBankroll()}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-4 text-sm font-semibold text-white"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Add
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[100, 500, 1000].map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => addToBankroll(amount)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                      >
                        +{amount}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Casino / Location">
                    <Input
                      value={startForm.location}
                      onChange={(e) => setStartForm((prev) => ({ ...prev, location: e.target.value }))}
                      placeholder="Example: Hard Rock Tampa"
                      className="h-12 text-base"
                      disabled={!!activeSession}
                    />
                  </Field>
                  <Field label="Session Type">
                    <Input
                      value={startForm.game}
                      onChange={(e) => setStartForm((prev) => ({ ...prev, game: e.target.value }))}
                      placeholder="Blackjack / Slots / Poker"
                      className="h-12 text-base"
                      disabled={!!activeSession}
                    />
                  </Field>
                </div>

                <Field label="Initial Buy-In">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={startForm.buyIn}
                    onChange={(e) => setStartForm((prev) => ({ ...prev, buyIn: e.target.value }))}
                    placeholder="1000"
                    className="h-16 text-2xl font-semibold"
                    disabled={!!activeSession}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(() => {
                      const recent = [
                        ...new Set([
                          Number(lastBuyIn || 0),
                          ...sessions.map((s) => s.initialBuyIn).filter((n) => !!n),
                        ]),
                      ].filter((n) => n > 0);
                      const defaults = [100, 200, 500, 1000];
                      const combined = [...recent, ...defaults];
                      const unique = Array.from(new Set(combined));
                      const sorted = unique.sort((a, b) => a - b);
                      const top = sorted.slice(0, 4);

                      return top.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onPointerDown={() => handleBuyInPointerDown(amount)}
                          onPointerUp={() => handleBuyInPointerUp(amount)}
                          onPointerLeave={handleBuyInPointerLeave}
                          onContextMenu={(e) => e.preventDefault()}
                          disabled={!!activeSession}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {fmtCurrency(amount)}
                        </button>
                      ));
                    })()}
                  </div>
                </Field>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={startSession}
                    disabled={!!activeSession || !startForm.buyIn}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" />
                    Start Session
                  </button>
                  {lastBuyIn && !activeSession && (
                    <button
                      type="button"
                      onClick={() => setStartForm((p)=>({...p,buyIn:lastBuyIn}))}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
                    >
                      Same Buy-In ({fmtCurrency(lastBuyIn)})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={resetStartForm}
                    disabled={!!activeSession}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Clear Form
                  </button>
                </div>
              </div>
            </motion.div>

            <motion.div id="finish-session-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
              <div className="mb-4">
                <div className="text-lg font-semibold">Step 2 · Finish Session</div>
                <div className="text-sm text-slate-500">
                  {activeSession ? "Add rebuys, enter cash-out, then finish the session." : "Start a session first to unlock this step."}
                </div>
              </div>

              {!activeSession ? (
                <div className="rounded-3xl bg-slate-50 px-4 py-8 text-center text-slate-500">
                  No active session right now.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm ring-1 ring-slate-800">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Active Session</div>
                        <div className="text-xl font-bold">{activeSession?.location || "—"}</div>
                        <div className="text-sm text-slate-300">{activeSession.game}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-300">Live Timer</div>
                        <div className="text-2xl font-bold tracking-wide">{activeElapsed}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Initial</div>
                        <div className="text-lg font-semibold">{fmtCurrency(activeSession.initialBuyIn)}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Rebuys</div>
                        <div className="text-lg font-semibold">{fmtCurrency(finishRebuyTotal)}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Total Buy-In</div>
                        <div className="text-lg font-semibold">{fmtCurrency(finishTotalBuyIn)}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Hours</div>
                        <div className="text-lg font-semibold">{activeHours.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-700">Rebuys</div>
                        <div className="text-xs text-slate-500">Add money to the session as it happens.</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={rebuyAmount}
                        onChange={(e) => setRebuyAmount(e.target.value)}
                        placeholder="Rebuy amount"
                        className="h-12 text-base"
                      />
                      <button
                        type="button"
                        onClick={() => addRebuyToActive()}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white"
                      >
                        <PlusCircle className="h-4 w-4" />
                        Add Rebuy
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {[100, 500, 1000].map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => addRebuyToActive(amount)}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                        >
                          +{amount}
                        </button>
                      ))}
                    </div>

                    {activeSession.rebuys.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {activeSession.rebuys.map((amount, index) => (
                          <button
                            key={`${amount}-${index}`}
                            type="button"
                            onClick={() => removeRebuyFromActive(index)}
                            className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
                          >
                            {fmtCurrency(amount)} ×
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Cash-Out">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={finishForm.cashOut}
                        onChange={(e) => setFinishForm((prev) => ({ ...prev, cashOut: e.target.value }))}
                        placeholder="200"
                        className="h-16 text-2xl font-semibold"
                      />
                    </Field>
                    <Field label="REMOVED">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={finishForm.pocket}
                        onChange={(e) => setFinishForm((prev) => ({ ...prev, pocket: e.target.value }))}
                        placeholder="0"
                        className="h-16 text-2xl font-semibold"
                      />
                    </Field>
                  </div>

                  <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm ring-1 ring-slate-800">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Projected Win/Loss</div>
                    <div className={`text-4xl font-bold tracking-tight ${finishActual >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtCurrency(finishActual)}
                    </div>
                    <div className="mt-2 text-sm text-slate-300">Cash-Out + REMOVED - Total Buy-In</div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={finishSession}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm"
                    >
                      <Square className="h-4 w-4" />
                      Finish Session
                    </button>
                    <button
                      type="button"
                      onClick={resetFinishForm}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset Finish
                    </button>
                  </div>
                </div>
              )}
            </motion.div>

            <motion.div id="edit-session-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Step 3 · Edit Session</div>
                  <div className="text-sm text-slate-500">Use this only when you need to clean up or adjust a saved session.</div>
                </div>
                {editingSessionId && (
                  <button
                    type="button"
                    onClick={resetEditForm}
                    className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              {!editingSessionId ? (
                <div className="rounded-3xl bg-slate-50 px-4 py-8 text-center text-slate-500">
                  Choose a session from the table to edit it.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Casino / Location">
                      <Input
                        value={editForm.location}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, location: e.target.value }))}
                        placeholder="Example: Hard Rock Tampa"
                        className="h-12 text-base"
                      />
                    </Field>
                    <Field label="Session Type">
                      <Input
                        value={editForm.game}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, game: e.target.value }))}
                        placeholder="Blackjack / Slots / Poker"
                        className="h-12 text-base"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label="Initial Buy-In">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={editForm.initialBuyIn}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, initialBuyIn: e.target.value }))}
                        placeholder="1000"
                        className="h-12 text-base"
                      />
                    </Field>
                    <Field label="Cash-Out">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={editForm.cashOut}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, cashOut: e.target.value }))}
                        placeholder="0"
                        className="h-12 text-base"
                      />
                    </Field>
                    <Field label="REMOVED">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={editForm.pocket}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, pocket: e.target.value }))}
                        placeholder="0"
                        className="h-12 text-base"
                      />
                    </Field>
                  </div>

                  <div className="rounded-3xl bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-700">Edit Rebuys</div>
                        <div className="text-xs text-slate-500">Add or remove rebuys for this saved session.</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Rebuy Total</div>
                        <div className="text-lg font-bold">{fmtCurrency(editRebuyTotal)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={editRebuyAmount}
                        onChange={(e) => setEditRebuyAmount(e.target.value)}
                        placeholder="Rebuy amount"
                        className="h-12 text-base"
                      />
                      <button
                        type="button"
                        onClick={() => addEditRebuy()}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white"
                      >
                        <PlusCircle className="h-4 w-4" />
                        Add Rebuy
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {[100, 500, 1000].map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => addEditRebuy(amount)}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                        >
                          +{amount}
                        </button>
                      ))}
                    </div>

                    {editRebuys.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {editRebuys.map((amount, index) => (
                          <button
                            key={`${amount}-${index}`}
                            type="button"
                            onClick={() => removeEditRebuy(index)}
                            className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
                          >
                            {fmtCurrency(amount)} ×
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm ring-1 ring-slate-800">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Updated Win/Loss</div>
                    <div className={`text-4xl font-bold tracking-tight ${editActual >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtCurrency(editActual)}
                    </div>
                    <div className="mt-2 text-sm text-slate-300">Based on edited buy-in, rebuys, cash-out, and pocket.</div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Start Time">
                      <Input
                        type="datetime-local"
                        value={editForm.startTime}
                        onChange={(e) => {
                          setEditForm((prev) => ({ ...prev, startTime: e.target.value }));
                          setManualHours("");
                        }}
                        className="h-12 text-base"
                      />
                    </Field>
                    <Field label="End Time">
                      <Input
                        type="datetime-local"
                        value={editForm.endTime}
                        onChange={(e) => {
                          setEditForm((prev) => ({ ...prev, endTime: e.target.value }));
                          setManualHours("");
                        }}
                        className="h-12 text-base"
                      />
                    </Field>
                  </div>

                  <Field label="Override Hours">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={manualHours}
                      onChange={(e) => setManualHours(e.target.value)}
                      placeholder="Optional"
                      className="h-12 text-base"
                    />
                  </Field>

                  <Field label="Notes">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {["Good run","Tired","Drinks","Mistakes"].map(tag=> (
                        <button key={tag} type="button" onClick={()=> setEditForm(p=>({...p,notes: p.notes ? p.notes+", "+tag : tag}))} className="px-3 py-1 rounded-full bg-slate-200 text-xs font-semibold">
                          {tag}
                        </button>
                      ))}
                    </div>
                    <Input
                      value={editForm.notes}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Optional notes"
                      className="h-12 text-base"
                    />
                  </Field>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={updateEditedSession}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm"
                    >
                      <Pencil className="h-4 w-4" />
                      Update Session
                    </button>
                    <button
                      type="button"
                      onClick={resetEditForm}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset Edit
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }} className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
              <div>
                <div className="text-lg font-semibold">Sessions</div>
                <div className="text-sm text-slate-500">One active session at a time. Finished sessions stay below.</div>
                {lastClearedData && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-amber-700">Last clear is available to restore.</span>
                    <button
                      type="button"
                      onClick={restoreLastCleared}
                      className="inline-flex h-9 items-center gap-2 rounded-2xl bg-amber-100 px-3 text-sm font-semibold text-amber-800"
                    >
                      Restore Last Clear
                    </button>
                  </div>
                )}
              </div>
              {confirmClearAll ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearAll}
                    className="inline-flex h-10 items-center gap-2 rounded-2xl bg-red-600 px-4 text-sm font-semibold text-white"
                  >
                    Confirm Delete All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  disabled={sessions.length === 0}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Clear All
                </button>
              )}
            </div>

            {sessions.length === 0 ? (
              <div className="px-5 py-12 text-center text-slate-500">No sessions yet. Start your first session on the left → Enter bankroll, buy-in, then press Start Session.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border-separate border-spacing-y-1">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Session</th>
                      <th className="px-4 py-3 font-semibold">Buy-In</th>
                      <th className="px-4 py-3 font-semibold">Cash-Out</th>
                      <th className="px-4 py-3 font-semibold">REMOVED</th>
                      <th className="px-4 py-3 font-semibold">Win/Loss</th>
                      <th className="px-4 py-3 font-semibold">Total Win/Loss</th>
                      <th className="px-4 py-3 font-semibold">Running Total</th>
                      <th className="px-4 py-3 font-semibold">Hours</th>
                      <th className="px-4 py-3 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => {
                      const completedMatch = sessionsWithRunningTotals.find((row) => row.id === session.id);
                      const runningPerceived = completedMatch?.runningPerceived ?? 0;

                      return (
                        <tr key={session.id} className="bg-white rounded-xl shadow-sm hover:shadow-md transition align-top">
                          <td className="px-4 py-3">
                            {session.status === "active" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const el = document.getElementById("finish-session-panel");
                                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                                }}
                                className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-200"
                              >
                                Active
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => editSession(session)}
                                className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200"
                              >
                                Completed
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {session.startTime ? new Date(session.startTime).toLocaleDateString() : ""}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{session.location || "—"}</div>
                            <div className="text-slate-500">{session.game}</div>
                            {session.rebuyTotal > 0 && <div className="text-slate-500">Rebuys: {fmtCurrency(session.rebuyTotal)}</div>}
                            {session.notes && <div className="mt-1 max-w-xs truncate text-xs text-slate-500" title={session.notes}>Notes: {session.notes}</div>}
                            
                          </td>
                          <td className="px-4 py-3 font-medium">{fmtCurrency(session.buyIn)}</td>
                          <td className="px-4 py-3">
                            {session.status === "completed" ? (
                              <input
                                type="number"
                                value={session.cashOut}
                                onChange={(e) => {
                                  const val = Number(e.target.value || 0);
                                  setSessions((prev) =>
                                    prev.map((s) =>
                                      s.id === session.id
                                        ? { ...s, cashOut: val, actual: val + s.pocket - s.buyIn, perceived: val - s.buyIn }
                                        : s
                                    )
                                  );
                                }}
                                className="w-24 rounded-lg border px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-200"
                              />
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {session.status === "completed" ? (
                              <input
                                type="number"
                                value={session.pocket}
                                onChange={(e) => {
                                  const val = Number(e.target.value || 0);
                                  setSessions((prev) =>
                                    prev.map((s) =>
                                      s.id === session.id
                                        ? { ...s, pocket: val, actual: s.cashOut + val - s.buyIn, perceived: s.cashOut - s.buyIn }
                                        : s
                                    )
                                  );
                                }}
                                className="w-24 rounded-lg border px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-200"
                              />
                            ) : "—"}
                          </td>
                          <td className={`px-4 py-3 font-semibold ${session.actual >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {session.status === "completed" ? fmtCurrency(session.actual) : "—"}
                          </td>
                          <td className="px-4 py-3">{session.status === "completed" ? fmtCurrency(session.perceived) : "—"}</td>
                          <td className={`px-4 py-3 font-semibold ${runningPerceived >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {session.status === "completed" ? fmtCurrency(runningPerceived) : "—"}
                          </td>
                          <td className="px-4 py-3">{session.status === "completed" ? session.hours.toFixed(2) : activeSession?.id === session.id ? activeHours.toFixed(2) : "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => editSession(session)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                                aria-label="Edit session"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeSession(session.id)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                                aria-label="Delete session"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
