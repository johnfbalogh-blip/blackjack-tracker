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
import { AnimatePresence, motion } from "framer-motion";

type SessionStatus = "active" | "completed";

type Session = {
  freeplayUsed?: boolean;
  freeplayAmount?: number;
  pointTotal?: number;
  pointsEarned?: number;
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

function toLocalInputValue(date = new Date(), includeSeconds = true) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, includeSeconds ? 19 : 16);
}

function fmtElapsed(ms: number) {
  if (!ms || ms < 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

const MIN_COUNTED_SESSION_HOURS = 5 / 60;

function countedHours(hours: number) {
  return hours >= MIN_COUNTED_SESSION_HOURS ? hours : 0;
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

function withAccuratePointChain(rows: Session[]): Session[] {
  const completedAscending = [...rows]
    .filter((row) => row.status === "completed")
    .sort((a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime());

  let previousTotal = 0;
  const completedMap = new Map<string, Session>();

  for (const row of completedAscending) {
    const hasPointTotal = typeof row.pointTotal === "number" && !Number.isNaN(row.pointTotal);

    if (hasPointTotal) {
      const currentTotal = Number(row.pointTotal);
      completedMap.set(row.id, {
        ...row,
        pointsEarned: currentTotal - previousTotal,
      });
      previousTotal = currentTotal;
    } else {
      completedMap.set(row.id, {
        ...row,
        pointsEarned: undefined,
      });
    }
  }

  return rows.map((row) => completedMap.get(row.id) || row);
}

function downloadCSV(rows: Session[]) {
  const preparedRows = withRunningPerceived(withAccuratePointChain(rows));
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
    "Casino Point Total",
    "Points Earned",
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
        r.pointTotal ?? "",
        r.pointsEarned ?? "",
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
      className={`h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 ${props.className || ""}`}
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
    <motion.div
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.15 }}
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
    </motion.div>
  );
}

// 🔒 HARD SAVED VERSION 2.1 - STABLE RELEASE
// Do not modify core logic without version bump
export default function App() {
  const [globalSettings, setGlobalSettings] = useState({
    location: "",
    game: "Blackjack",
  });

  const [startForm, setStartForm] = useState({
    buyIn: "",
    freeplayUsed: false,
    freeplayAmount: "",
  });
  const [lastBuyIn, setLastBuyIn] = useState("");
  const [finishForm, setFinishForm] = useState({
    cashOut: "",
    pocket: "",
    pointTotal: "",
  });
  const [editForm, setEditForm] = useState({
    location: "",
    game: "Blackjack",
    initialBuyIn: "",
    cashOut: "",
    pocket: "",
    freeplayUsed: false,
    freeplayAmount: "",
    pointTotal: "",
    pointsEarned: "",
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
  
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [manualHours, setManualHours] = useState("");
  const [editingOriginalPrevPoints, setEditingOriginalPrevPoints] = useState(0);
  const [startingBankroll, setStartingBankroll] = useState(() => {
    if (typeof window === "undefined") return "";
    const saved = window.localStorage.getItem("starting-bankroll");
    return saved ? saved : "";
  });
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [lastClearedData, setLastClearedData] = useState<{
    sessions: Session[];
    startingBankroll: string;
  } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
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
      pointTotal: activeSession.pointTotal !== undefined ? String(activeSession.pointTotal) : "",
    });
  }, [activeSession, editingSessionId]);

  const sessionsWithAccuratePoints = useMemo(() => withAccuratePointChain(sessions), [sessions]);

  const completedSessions = useMemo(
    () => sessionsWithAccuratePoints.filter((session) => session.status === "completed"),
    [sessionsWithAccuratePoints]
  );

  const sessionsWithRunningTotals = useMemo(
    () => withRunningPerceived(completedSessions),
    [completedSessions]
  );

  const summary = useMemo(() => {
    const totalActual = completedSessions.reduce((sum, s) => sum + s.actual, 0);
    const totalHours = completedSessions.reduce((sum, s) => sum + countedHours(s.hours), 0);
    const hourly = totalHours >= 1 ? totalActual / totalHours : 0;
    const needsPocketCount = openSessionCount;
    const bankroll = Number(startingBankroll || 0) + totalActual;
    return { totalActual, totalHours, hourly, needsPocketCount, bankroll };
  }, [completedSessions, startingBankroll, openSessionCount]);

  const recentLocations = useMemo(() => {
    const unique = Array.from(
      new Set(
        sessions
          .map((s) => s.location?.trim())
          .filter((location): location is string => !!location)
          .reverse()
      )
    ).reverse();
    return unique.slice(-4).reverse();
  }, [sessions]);

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

  const previousPointTotal = useMemo(() => {
    const completedWithPointTotals = completedSessions.filter(
      (session) => typeof session.pointTotal === "number" && !Number.isNaN(session.pointTotal)
    );
    if (completedWithPointTotals.length === 0) return 0;
    const sorted = [...completedWithPointTotals].sort(
      (a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime()
    );
    return sorted[0]?.pointTotal ?? 0;
  }, [completedSessions]);

  const previousPointTotalBySession = useMemo(() => {
    const map: Record<string, number> = {};
    const sorted = [...sessionsWithAccuratePoints]
      .filter((session) => session.status === "completed")
      .sort((a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime());

    let previous = 0;
    for (const session of sorted) {
      map[session.id] = previous;
      if (typeof session.pointTotal === "number" && !Number.isNaN(session.pointTotal)) {
        previous = Number(session.pointTotal);
      }
    }

    return map;
  }, [sessionsWithAccuratePoints]);

  const editingPreviousPointTotal = editingSessionId
    ? editingOriginalPrevPoints
    : previousPointTotal;

  const finishPointsEarned = useMemo(() => {
    if (finishForm.pointTotal === "") return undefined;
    const current = Number(finishForm.pointTotal);
    return current - previousPointTotal;
  }, [finishForm.pointTotal, previousPointTotal]);

  const resetStartForm = () => {
    setStartForm({
      buyIn: "",
      freeplayUsed: false,
      freeplayAmount: "",
    });
  };

  const resetFinishForm = () => {
    setFinishForm({
      cashOut: "",
      pocket: "",
      pointTotal: "",
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
      freeplayUsed: false,
      freeplayAmount: "",
      pointTotal: "",
      pointsEarned: "",
      startTime: toLocalInputValue(),
      endTime: toLocalInputValue(),
      notes: "",
    });
    setManualHours("");
  };

  const startSession = () => {
    setLastBuyIn(startForm.buyIn);
    if (activeSession) return;
    const now = toLocalInputValue(new Date(), true);
    const freeplayUsed = startForm.freeplayUsed;
    const freeplayAmount = Number(startForm.freeplayAmount || 0);
    const initialBuyIn = freeplayUsed ? 0 : Number(startForm.buyIn || 0);

    const lastSessionLocation = sessions.find(s => s.location)?.location || "";

    const newSession: Session = {
      id: crypto.randomUUID(),
      status: "active",
      location: globalSettings.location.trim() || lastSessionLocation,
      game: globalSettings.game.trim() || "Blackjack",
      initialBuyIn,
      rebuyTotal: 0,
      rebuys: [],
      buyIn: initialBuyIn,
      cashOut: 0,
      pocket: 0,
      actual: 0,
      perceived: 0,
      freeplayUsed,
      freeplayAmount,
      pointTotal: 0,
      pointsEarned: 0,
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
    const pointTotal = finishForm.pointTotal === "" ? undefined : Number(finishForm.pointTotal);
    const endTime = toLocalInputValue(new Date(), true);
    const rebuyTotal = activeSession.rebuys.reduce((sum, value) => sum + value, 0);
    const buyIn = activeSession.initialBuyIn + rebuyTotal;
    const actual = cashOut + pocket - buyIn;
    const perceived = cashOut - buyIn;
    const pointsEarned = pointTotal === undefined ? undefined : pointTotal - previousPointTotal;
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
              pointTotal,
              pointsEarned,
              endTime,
              hours,
            }
          : session
      )
    );
    resetFinishForm();
  };


  const editSession = (session: Session) => {
    const prevPoints = previousPointTotalBySession[session.id] || 0;
    setEditingOriginalPrevPoints(prevPoints);
    setEditingSessionId(session.id);
    setEditForm({
      location: session.location,
      game: session.game,
      initialBuyIn: String(session.initialBuyIn || ""),
      cashOut: String(session.cashOut || ""),
      pocket: String(session.pocket || ""),
      freeplayUsed: !!session.freeplayUsed,
      freeplayAmount: String(session.freeplayAmount || ""),
      pointTotal: session.pointTotal !== undefined ? String(session.pointTotal) : "",
      pointsEarned: session.pointsEarned !== undefined ? String(session.pointsEarned) : "",
      startTime: session.startTime,
      endTime: session.endTime,
      notes: session.notes,
    });
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
        const buyIn = editForm.freeplayUsed ? 0 : Number(editForm.initialBuyIn || 0);
        const cashOut = Number(editForm.cashOut || 0);
        const pocket = Number(editForm.pocket || 0);
        const pointTotal = editForm.pointTotal === "" ? undefined : Number(editForm.pointTotal);
        const rebuys: number[] = [];
        const rebuyTotal = 0;
        const initialBuyIn = buyIn;
        const pointsEarned = pointTotal === undefined ? undefined : pointTotal - editingPreviousPointTotal;
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
          freeplayUsed: editForm.freeplayUsed,
          freeplayAmount: Number(editForm.freeplayAmount || 0),
          pointTotal,
          pointsEarned,
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
  const editActual = useMemo(() => {
    const buyIn = Number(editForm.initialBuyIn || 0);
    const cashOut = Number(editForm.cashOut || 0);
    const pocket = Number(editForm.pocket || 0);
    return cashOut + pocket - buyIn;
  }, [editForm.initialBuyIn, editForm.cashOut, editForm.pocket]);

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
    setConfirmClearAll(false);
    resetStartForm();
    resetFinishForm();
    resetEditForm();
  };

  const restoreLastCleared = () => {
    if (!lastClearedData) return;

    setSessions(lastClearedData.sessions);
    setStartingBankroll(lastClearedData.startingBankroll);
    setConfirmClearAll(false);
    setLastClearedData(null);
    resetStartForm();
    resetFinishForm();
    resetEditForm();
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <AnimatePresence>
      {showHelp && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 sm:items-center"
          onClick={() => setShowHelp(false)}
        >
          <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">How to Use Session Edge</div>
                <div className="text-sm text-slate-500">Instructions and definitions for quick reference.</div>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Top Section · Bankroll + Defaults</div>
                <div className="mt-2 text-sm text-slate-600">Set the items that usually stay the same while you are playing.</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div><span className="font-semibold text-slate-800">Starting Bankroll:</span> Your money base before session results are applied.</div>
                  <div><span className="font-semibold text-slate-800">Current Bankroll:</span> Starting Bankroll plus total completed Win/Loss.</div>
                  <div><span className="font-semibold text-slate-800">Casino / Location:</span> Your current casino or playing location. Leave it blank and Session Edge can reuse your most recent session location.</div>
                  <div><span className="font-semibold text-slate-800">Session Type:</span> The game you are playing now, such as Blackjack, Slots, Poker, or Other.</div>
                  <div><span className="font-semibold text-slate-800">Bankroll Buttons:</span> Quick add buttons increase your starting bankroll input.</div>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Step 1 · Start Session</div>
                <div className="mt-2 text-sm text-slate-600">Enter only the money needed to begin the session.</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div><span className="font-semibold text-slate-800">Initial Buy-In:</span> The first money put into action for this session.</div>
                  <div><span className="font-semibold text-slate-800">Shortcut Buttons:</span> Tap to add to the buy-in. Press and hold to replace the amount.</div>
                  <div><span className="font-semibold text-slate-800">Same Buy-In:</span> Reuses your most recent buy-in amount.</div>
                  <div><span className="font-semibold text-slate-800">Start Session:</span> Opens the session and starts the timer.</div>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Step 2 · Finish Session</div>
                <div className="mt-2 text-sm text-slate-600">Add rebuys during play, then enter final numbers when you finish the session.</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div><span className="font-semibold text-slate-800">Rebuys:</span> Extra money added during the session (tracked live in Step 2).</div>
                  <div><span className="font-semibold text-slate-800">Cash-Out:</span> What you leave the table with at the end of play.</div>
                  <div><span className="font-semibold text-slate-800">REMOVED:</span> Money taken off the table during play (chips pocketed, tips, drinks, etc).</div>
                  <div><span className="font-semibold text-slate-800">Point Total:</span> Enter your total casino points after this session.</div>
                  <div><span className="font-semibold text-slate-800">Finish Session:</span> Closes the session and locks in results.</div>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Step 3 · Edit Session</div>
                <div className="mt-2 text-sm text-slate-600">Clean up or adjust saved sessions quickly.</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div>Edit total buy-in, cash-out, REMOVED, points, time, and notes.</div>
                  <div>Updating a Point Total will automatically adjust the point chain for later sessions.</div>
                  <div>Click <span className="font-semibold text-slate-800">Completed</span> or the pencil icon to edit a session.</div>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4 lg:col-span-2">
                <div className="text-sm font-semibold text-slate-900">Definitions + Point Tracking</div>
                <div className="mt-3 grid gap-4 lg:grid-cols-2 text-sm text-slate-600">
                  <div className="space-y-2">
                    <div><span className="font-semibold text-slate-800">Buy-In:</span> The total amount in action for the session.</div>
                    <div><span className="font-semibold text-slate-800">Win/Loss:</span> Cash-Out + REMOVED - Total Buy-In (your real result).</div>
                    <div><span className="font-semibold text-slate-800">Total Win/Loss:</span> Cash-Out - Total Buy-In (table result only).</div>
                    <div><span className="font-semibold text-slate-800">Running Total:</span> Rolling total of Total Win/Loss across completed sessions.</div>
                    <div><span className="font-semibold text-slate-800">Hours:</span> Session time from start to finish. Sessions under 5 minutes are ignored in summary totals.</div>
                    <div><span className="font-semibold text-slate-800">Status:</span> Active means open. Completed means finished and saved.</div>
                  </div>
                  <div className="space-y-2">
                    <div><span className="font-semibold text-slate-800">How points work:</span> Enter your total casino points after each session. Session Edge allocates the increase to that session.</div>
                    <div><span className="font-semibold text-slate-800">Example:</span></div>
                    <div>Session 1 total: 1,000 → Points Earned: 1,000</div>
                    <div>Session 2 total: 1,400 → Points Earned: 400</div>
                    <div>Session 3 total: 1,900 → Points Earned: 500</div>
                    <div>Blank point totals do not break the chain. Only entered totals affect later sessions.</div>
                    <div><span className="font-semibold text-slate-800">Point Total:</span> The cumulative total shown by the casino after the session.</div>
                    <div><span className="font-semibold text-slate-800">Points Earned:</span> This session's share of the increase from the previous entered total.</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight leading-tight">Session Edge</h1>
              <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800">
                V2.1
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500 max-w-xl">
              Track your real edge — not just results.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <motion.button
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.12 }}
              type="button"
              onClick={() => setShowHelp(true)}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition"
            >
              ? Help
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.12 }}
              type="button"
              onClick={() => downloadCSV(completedSessions)}
              disabled={completedSessions.length === 0}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </motion.button>
          </div>
        </motion.div>

        <div className="mb-4 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Field label="Casino / Location">
              <Input
                value={globalSettings.location}
                onChange={(e) => setGlobalSettings((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="Hard Rock Tampa"
                className="h-10 text-sm"
              />
            </Field>
            <Field label="Session Type">
              <div className="flex flex-wrap gap-2">
                {["Blackjack", "Slots", "Poker", "Other"].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setGlobalSettings((prev) => ({ ...prev, game: type }))}
                    className={`px-3 py-1.5 rounded-xl text-sm font-semibold border ${globalSettings.game === type ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-700"}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Bankroll</div>
                <div className="text-xl font-bold text-slate-900">Starting Bankroll</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Current</div>
                <div className="text-lg font-semibold text-emerald-600">{fmtCurrency(summary.bankroll)}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="number"
                inputMode="decimal"
                value={startingBankroll}
                onChange={(e) => setStartingBankroll(e.target.value)}
                placeholder="e.g. 500"
                className="h-10 w-20 sm:w-24 text-base font-semibold text-left flex-shrink-0"
              />

              {[100,200,500,1000].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setStartingBankroll((prev) => String(Number(prev || 0) + amount))}
                  className="rounded-xl bg-slate-900 text-white px-3 py-2 text-sm font-semibold shadow hover:bg-slate-800 transition"
                >
                  +{amount}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-500">
              Bankroll updates automatically based on completed session results.
            </div>
          </div>
        </div>

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
                <div className="text-sm text-slate-500">Enter buy-in and start the timer.</div>
              </div>

              <div className="space-y-4">
                

                <Field label="Initial Buy-In">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={startForm.buyIn}
                      onChange={(e) => setStartForm((prev) => ({ ...prev, buyIn: e.target.value }))}
                      placeholder="e.g. 500"
                      className="h-10 w-20 sm:w-24 text-base font-semibold text-left flex-shrink-0"
                      disabled={!!activeSession}
                    />

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
                          className="rounded-xl bg-slate-900 text-white px-3 py-2 text-sm font-semibold shadow hover:bg-slate-800 transition disabled:opacity-50"
                        >
                          +{amount}
                        </button>
                      ));
                    })()}
                  </div>
                </Field>

                <div className="flex flex-wrap gap-2">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    type="button"
                    onClick={startSession}
                    disabled={!!activeSession || !startForm.buyIn}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" />
                    Start Session
                  </motion.button>
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
                  {activeSession ? "Add rebuys, enter cash-out, finish." : "Start a session first to unlock this step."}
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

                  <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                    <div className="mb-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Session Entry</div>
                      <div className="text-lg font-bold text-slate-900">Cash-Out · REMOVED · Points</div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <Field label="Cash-Out">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={finishForm.cashOut}
                          onChange={(e) => setFinishForm((p) => ({ ...p, cashOut: e.target.value }))}
                          placeholder="0"
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-right flex-shrink-0"
                        />
                      </Field>

                      <Field label="REMOVED">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={finishForm.pocket}
                          onChange={(e) => setFinishForm((p) => ({ ...p, pocket: e.target.value }))}
                          placeholder="0"
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-right flex-shrink-0"
                        />
                      </Field>

                      <Field label="Point Total">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={finishForm.pointTotal}
                          onChange={(e) => setFinishForm((p) => ({ ...p, pointTotal: e.target.value }))}
                          placeholder={String(previousPointTotal)}
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-right flex-shrink-0"
                        />
                      </Field>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">Based on previous total: {previousPointTotal}</div>
                    
                  </div>

                  <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm ring-1 ring-slate-800">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Win/Loss</div>
                    <div className={`text-4xl font-bold tracking-tight ${finishActual >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtCurrency(finishActual)}
                    </div>
                    <div className="mt-2 text-sm text-slate-300">Cash-Out + REMOVED - Total Buy-In</div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Finalize</div>
                        <div className="text-lg font-bold text-slate-900">Save Session</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.12 }}
                      type="button"
                      onClick={finishSession}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm"
                    >
                      <Square className="h-4 w-4" />
                      Finish Session
                    </motion.button>
                    <button
                      type="button"
                      onClick={resetFinishForm}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset Finish
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Saves and closes session.</div>
                  </div>
                </div>
                )}
            </motion.div>

            <motion.div id="edit-session-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Step 3 · Edit Session</div>
                  <div className="text-sm text-slate-500">Adjust a saved session.</div>
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
                  <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                    <div className="mb-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Edit Entry</div>
                      <div className="text-lg font-bold text-slate-900">Session Totals</div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <Field label="Total Buy-In">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={editForm.initialBuyIn}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, initialBuyIn: e.target.value }))}
                          placeholder="e.g. 500"
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-right flex-shrink-0"
                        />
                      </Field>

                      <Field label="Cash-Out">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={editForm.cashOut}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, cashOut: e.target.value }))}
                          placeholder="0"
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-right flex-shrink-0"
                        />
                      </Field>

                      <Field label="REMOVED">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={editForm.pocket}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, pocket: e.target.value }))}
                          placeholder="0"
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-right flex-shrink-0"
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                    <div className="mb-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Casino Tracking</div>
                      <div className="text-lg font-bold text-slate-900">Point Total</div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <Field label="Current Total">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={editForm.pointTotal}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              pointTotal: e.target.value,
                              pointsEarned:
                                e.target.value === ""
                                  ? ""
                                  : String(Number(e.target.value) - editingPreviousPointTotal),
                            }))
                          }
                          placeholder={String(editingSessionId ? editingPreviousPointTotal : previousPointTotal)}
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-right flex-shrink-0"
                        />
                      </Field>

                      <div className="text-sm font-semibold text-slate-700">
                        {editForm.pointsEarned === "" ? "—" : `Points: ${editForm.pointsEarned}`}
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      Based on previous total: {editingPreviousPointTotal}
                    </div>
                  </div>

                  <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-sm ring-1 ring-slate-800">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Win/Loss</div>
                    <div className={`text-4xl font-bold tracking-tight ${editActual >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtCurrency(editActual)}
                    </div>
                    <div className="mt-2 text-sm text-slate-300">Based on edited total buy-in, cash-out, and REMOVED.</div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <Field label="Start Time">
                      <Input
                        type="datetime-local"
                        step={1}
                        value={editForm.startTime}
                        onChange={(e) => {
                          setEditForm((prev) => ({ ...prev, startTime: e.target.value }));
                          setManualHours("");
                        }}
                        className="h-10 w-auto min-w-[210px] text-sm"
                      />
                    </Field>
                    <Field label="End Time">
                      <Input
                        type="datetime-local"
                        step={1}
                        value={editForm.endTime}
                        onChange={(e) => {
                          setEditForm((prev) => ({ ...prev, endTime: e.target.value }));
                          setManualHours("");
                        }}
                        className="h-10 w-auto min-w-[210px] text-sm"
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
                      placeholder="Optional manual override"
                      className="h-10 w-24 sm:w-28 text-base font-semibold text-right flex-shrink-0"
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
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Optional notes"
                      className="min-h-[84px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />
                  </Field>

                  <div className="flex flex-wrap gap-2">
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.12 }}
                      type="button"
                      onClick={updateEditedSession}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm"
                    >
                      <Pencil className="h-4 w-4" />
                      Update Session
                    </motion.button>
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
                <div className="text-sm text-slate-500">Tap Completed to edit.</div>
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
              <div className="px-5 py-12 text-center text-slate-500">No sessions yet. Start Session to begin.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border-separate border-spacing-y-1">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5 font-semibold">Status</th>
                      <th className="px-4 py-3.5 font-semibold">Date</th>
                      <th className="px-4 py-3.5 font-semibold">Session</th>
                      <th className="px-4 py-3.5 font-semibold">Buy-In</th>
                      <th className="px-4 py-3.5 font-semibold">Cash-Out</th>
                      <th className="px-4 py-3.5 font-semibold">REMOVED</th>
                      <th className="px-4 py-3.5 font-semibold">Win/Loss</th>
                      <th className="px-4 py-3.5 font-semibold">Total Win/Loss</th>
                      <th className="px-4 py-3.5 font-semibold">Running Total</th>
                      <th className="px-4 py-3.5 font-semibold">Hours</th>
                      <th className="px-4 py-3.5 font-semibold">Point Total</th>
                      <th className="px-4 py-3.5 font-semibold">Points Earned</th>
                      <th className="px-4 py-3.5 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionsWithAccuratePoints.map((session) => {
                      const completedMatch = sessionsWithRunningTotals.find((row) => row.id === session.id);
                      const runningPerceived = completedMatch?.runningPerceived ?? 0;

                      return (
                        <tr key={session.id} className="bg-white rounded-xl shadow-sm hover:shadow-md transition align-top">
                          <td className="px-4 py-3.5">
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
                          <td className="px-4 py-3.5 text-slate-600">
                            {session.startTime ? new Date(session.startTime).toLocaleDateString() : ""}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-slate-900">{session.location || "—"}</div>
                            <div className="text-slate-500">{session.game}</div>
                            {session.rebuyTotal > 0 && <div className="text-slate-500">Rebuys: {fmtCurrency(session.rebuyTotal)}</div>}
                            {session.notes && <div className="mt-1 max-w-xs truncate text-xs text-slate-500" title={session.notes}>Notes: {session.notes}</div>}
                            
                          </td>
                          <td className="px-4 py-3.5 font-medium">{fmtCurrency(session.buyIn)}</td>
                          <td className="px-4 py-3.5">
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
                                className="w-24 rounded-xl border border-slate-200 px-2.5 py-1.5 text-right text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                              />
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3.5">
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
                                className="w-24 rounded-xl border border-slate-200 px-2.5 py-1.5 text-right text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                              />
                            ) : "—"}
                          </td>
                          <td className={`px-4 py-3 font-semibold ${session.actual >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {session.status === "completed" ? fmtCurrency(session.actual) : "—"}
                          </td>
                          <td className="px-4 py-3.5">{session.status === "completed" ? fmtCurrency(session.perceived) : "—"}</td>
                          <td className={`px-4 py-3 font-semibold ${runningPerceived >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {session.status === "completed" ? fmtCurrency(runningPerceived) : "—"}
                          </td>
                          <td className="px-4 py-3.5">{session.status === "completed" ? session.hours.toFixed(2) : activeSession?.id === session.id ? activeHours.toFixed(2) : "—"}</td>
                          <td className="px-4 py-3.5">
                            {session.status === "completed" ? (
                              <input
                                type="number"
                                value={session.pointTotal ?? ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSessions((prev) =>
                                    prev.map((s) =>
                                      s.id === session.id
                                        ? {
                                            ...s,
                                            pointTotal: value === "" ? undefined : Number(value),
                                          }
                                        : s
                                    )
                                  );
                                }}
                                placeholder="—"
                                className="w-24 rounded-xl border border-slate-200 px-2.5 py-1.5 text-right text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                              />
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3.5">{session.status === "completed" ? (session.pointsEarned ?? "—") : "—"}</td>
                          <td className="px-4 py-3.5">
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
