import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock3,
  Download,
  Pencil,
  Play,
  RotateCcw,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type SessionStatus = "active" | "completed";

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error("Failed to parse saved Session Edge data:", error);
    return fallback;
  }
}

type Session = {
  tripId?: string; // NEW: allows grouping sessions into trips
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
    "Buy In",
    "Cash Out",
    "Out of Play",
    "Open Session",
    "Win Loss",
    "Total Win/Loss",
    "Running Total Win/Loss",
    "Start Time",
    "End Time",
    "Hours",
    "Casino Point Total",
    "Session Points",
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
      className="h-16 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm flex flex-col justify-center"
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </div>
      <div className={`text-base font-semibold ${toneClass}`}>{value}</div>
    </motion.div>
  );
}

// 🔒 HARD SAVED VERSION 2.4 - FINAL LOCKED (WIDTH + RHYTHM + POLISH COMPLETE)
// Do not modify core logic without version bump
export default function App() {
  // 🔹 NEW: Trip tracking
  const [tripName, setTripName] = useState(() => {
    if (typeof window === "undefined") return "Default Trip";

    const savedTrip = window.localStorage.getItem("session-edge-trip-name");
    if (savedTrip) return savedTrip;

    const savedSessionsRaw = safeJsonParse<Session[]>(window.localStorage.getItem("blackjack-sessions"), []);
    const firstTrip = savedSessionsRaw.find((s) => s.tripId)?.tripId;
    if (firstTrip) return firstTrip;

    return "Default Trip";
  });

  // 🔹 Per-location session type
  const [locationGames, setLocationGames] = useState<Record<string,string>>(() => {
    if (typeof window === "undefined") return {};
    return safeJsonParse<Record<string, string>>(window.localStorage.getItem("location-games"), {});
  });

  const [globalSettings, setGlobalSettings] = useState({
    location: "",
    game: locationGames[tripName] || "Blackjack",
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
    return safeJsonParse<Session[]>(window.localStorage.getItem("blackjack-sessions"), []);
  });
  const [timerNow, setTimerNow] = useState(Date.now());
  
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [manualHours, setManualHours] = useState("");
  const [editingOriginalPrevPoints, setEditingOriginalPrevPoints] = useState(0);
  // 🔹 Per-trip bankroll storage
  const [tripBankrolls, setTripBankrolls] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    return safeJsonParse<Record<string, string>>(window.localStorage.getItem("trip-bankrolls"), {});
  });

  const startingBankroll = tripBankrolls[tripName] || "";

  const setStartingBankroll = (value: string) => {
    setTripBankrolls((prev) => ({
      ...prev,
      [tripName]: value,
    }));
  };
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [lastClearedData, setLastClearedData] = useState<{
    sessions: Session[];
    startingBankroll: string;
  } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isRenamingTrip, setIsRenamingTrip] = useState(false);
  const [renameTripValue, setRenameTripValue] = useState("");
  const buyInHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("blackjack-sessions", JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("trip-bankrolls", JSON.stringify(tripBankrolls));
  }, [tripBankrolls]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("session-edge-trip-name", tripName);
  }, [tripName]);

  // 🔹 persist session type per location
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("location-games", JSON.stringify(locationGames));
  }, [locationGames]);

  // 🔹 when switching location, load its session type
  useEffect(() => {
    setGlobalSettings((prev) => ({
      ...prev,
      game: locationGames[tripName] || "Blackjack",
    }));
  }, [tripName]);

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

  // 🔹 Filter sessions by trip
  // 🔹 Get all unique trip names
  const availableTrips = useMemo(() => {
    const trips = sessions.map(s => s.tripId || "Default Trip");
    return Array.from(new Set(trips));
  }, [sessions]);

  const filteredSessions = useMemo(
    () => sessions.filter((s) => (s.tripId || "Default Trip") === tripName),
    [sessions, tripName]
  );

  const sessionsWithAccuratePoints = useMemo(() => {
    try {
      return withAccuratePointChain(filteredSessions);
    } catch (error) {
      console.error("Point chain error:", error);
      return filteredSessions;
    }
  }, [filteredSessions]);

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

    // total session points across all completed sessions
    const sessionPoints = completedSessions.reduce(
      (sum, s) => sum + (s.pointsEarned || 0),
      0
    );

    return { totalActual, totalHours, hourly, needsPocketCount, bankroll, sessionPoints };
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

  const finishTotalBuyIn = useMemo(
    () => Number(activeSession?.initialBuyIn || 0),
    [activeSession]
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
      tripId: tripName,
      id: crypto.randomUUID(),
      status: "active",
      location: globalSettings.location.trim() || lastSessionLocation,
      game: globalSettings.game.trim() || "Blackjack",
      initialBuyIn,
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

  
  const finishSession = () => {
    if (!activeSession) return;
    const cashOut = Number(finishForm.cashOut || 0);
    const pocket = Number(finishForm.pocket || 0);
    let pointTotal = finishForm.pointTotal === "" ? undefined : Number(finishForm.pointTotal);
    if (pointTotal === 0) pointTotal = previousPointTotal;
    const endTime = toLocalInputValue(new Date(), true);
    const buyIn = activeSession.initialBuyIn;
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
        let pointTotal = editForm.pointTotal === "" ? undefined : Number(editForm.pointTotal);
        if (pointTotal === 0) pointTotal = editingPreviousPointTotal;
        const initialBuyIn = buyIn;
        const pointsEarned = pointTotal === undefined ? undefined : pointTotal - editingPreviousPointTotal;
        const hours =
          manualHours !== "" && !Number.isNaN(Number(manualHours))
            ? Number(manualHours)
            : fmtHours(startTime, endTime);

        return {
          ...session,
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

  // 🔹 Rename Trip (global)
  const beginRenameTrip = () => {
    setRenameTripValue(tripName);
    setIsRenamingTrip(true);
  };

  const cancelRenameTrip = () => {
    setRenameTripValue("");
    setIsRenamingTrip(false);
  };

  const confirmRenameTrip = () => {
    const trimmed = renameTripValue.trim();
    if (!trimmed || trimmed === tripName) {
      cancelRenameTrip();
      return;
    }

    setSessions((prev) =>
      prev.map((s) =>
        (s.tripId || "Default Trip") === tripName
          ? { ...s, tripId: trimmed }
          : s
      )
    );

    setTripName(trimmed);
    setRenameTripValue("");
    setIsRenamingTrip(false);
  };

  
  const clearAll = () => {
    // 🔹 Only clear sessions (preserve locations/trips and bankrolls)
    setLastClearedData({
      sessions: [...sessions],
      startingBankroll,
    });

    if (typeof window !== "undefined") {
      // Only remove sessions, keep trip names, bankrolls, and location settings
      localStorage.removeItem("blackjack-sessions");
    }

    setSessions([]);
    setConfirmClearAll(false);
    resetStartForm();
    resetFinishForm();
    resetEditForm();
  };

  const clearCurrentLocation = () => {
    setLastClearedData({
      sessions: [...sessions],
      startingBankroll,
    });

    setSessions((prev) => prev.filter((session) => (session.tripId || "Default Trip") !== tripName));
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

  const discardLastCleared = () => {
    setLastClearedData(null);
    setConfirmClearAll(false);
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
                <div className="text-base font-semibold">Quick Guide · Session Edge</div>
                <div className="text-sm text-slate-500">Fast reference to get in, play, and track correctly.</div>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Top Section · Location &amp; Bankroll</div>
                <div className="mt-2 text-sm text-slate-600">Set your location, choose a game, and enter bankroll.</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600 leading-relaxed">
                  <div><span className="font-semibold text-slate-800">Casino / Location:</span> Your active place of play. All sessions are grouped here.</div>
                  <div><span className="font-semibold text-slate-800">Type:</span> Game played for this location (Blackjack, Ultimate, 3 Card, Slots, Other).</div>
                  <div><span className="font-semibold text-slate-800">Out of Pocket Bankroll:</span> Your personal money used for this location.</div>
                  <div><span className="font-semibold text-slate-800">Current Bankroll:</span> Starting bankroll + completed session results.</div>
                  <div><span className="font-semibold text-slate-800">Rename:</span> Updates the location name across all sessions.</div>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Step 1 · Start</div>
                <div className="mt-2 text-sm text-slate-600">Enter what you bring to the table.</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600 leading-relaxed">
                  <div><span className="font-semibold text-slate-800">Buy-In:</span> Money you put into play at the start of the session.</div>
                  <div><span className="font-semibold text-slate-800">Shortcuts:</span> Tap = add amount, Hold = replace amount.</div>
                  <div><span className="font-semibold text-slate-800">Same Buy-In:</span> Reuse the most recent buy-in instantly.</div>
                  <div><span className="font-semibold text-slate-800">One Buy-In:</span> This version does not track rebuys separately.</div>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Step 2 · Finish</div>
                <div className="mt-2 text-sm text-slate-600">Enter final results and close the session.</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600 leading-relaxed">
                  <div><span className="font-semibold text-slate-800">Cash Out:</span> What you walk away with.</div>
                  <div><span className="font-semibold text-slate-800">Out of Play:</span> Chips taken off the table during play.</div>
                  <div><span className="font-semibold text-slate-800">Point Total:</span> Your casino total after session. The app uses the change from the previous total to calculate Session Points.</div>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Step 3 · Edit</div>
                <div className="mt-2 text-sm text-slate-600">Edit or correct any session.</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600 leading-relaxed">
                  <div>Edit numbers, time, and notes.</div>
                  <div>Point totals automatically update forward.</div>
                  <div>You can edit Cash Out, Out of Play, and Points directly in the table.</div>
                  <div>Changes update instantly.</div>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4 lg:col-span-2">
                <div className="text-sm font-semibold text-slate-900">Key Concepts</div>
                <div className="mt-3 grid gap-4 lg:grid-cols-2 text-sm text-slate-600 leading-relaxed">
                  <div className="space-y-2">
                    <div><span className="font-semibold text-slate-800">Win/Loss:</span> Cash Out + Out of Play - Buy-In.</div>
                    <div><span className="font-semibold text-slate-800">Total:</span> Table-only result (excludes pocket).</div>
                    <div><span className="font-semibold text-slate-800">Running:</span> Cumulative total over time.</div>
                    <div><span className="font-semibold text-slate-800">Hours:</span> Actual play time.</div>
                  </div>
                  <div className="space-y-2">
                    <div><span className="font-semibold text-slate-800">Points:</span> Enter your casino total, the app calculates session points automatically.</div>
                    <div>Example: 1000 → 1400 = 400 session points earned.</div>
                    <div><span className="font-semibold text-slate-800">Per Location:</span> Bankroll and game type are saved.</div>
                    <div><span className="font-semibold text-slate-800">Clear This Location:</span> Removes only sessions for the active location.</div>
                    <div><span className="font-semibold text-slate-800">Clear All:</span> Removes all sessions \(keeps locations & bankrolls\).</div>
                    <div><span className="font-semibold text-slate-800">Restore:</span> After clearing, you can restore the last cleared sessions or permanently discard that backup.</div>
                    <div><span className="font-semibold text-slate-800">Sessions Table:</span> Header shows location; Type column shows the game.</div>
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
              <h1 className="text-3xl font-bold tracking-tight">Session Edge</h1>
              <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800">
                V2.4
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500 max-w-xl">
              Track your real edge — not just results. Fast, clean, built for real play.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 sm:gap-1.5">
            <motion.button
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.12 }}
              type="button"
              onClick={() => setShowHelp(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition"
            >
              ? Help
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.12 }}
              type="button"
              onClick={() => downloadCSV(completedSessions)}
              disabled={completedSessions.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </motion.button>
          </div>
        </motion.div>

        <div className="mb-5 grid w-full max-w-md gap-4 sm:gap-5 lg:max-w-none lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-base font-semibold text-slate-900">Casino / Location</div>
              <div className="text-xs text-slate-400">Active</div>
            </div>

            <div className="space-y-2.5">
              <div>
                <Input
                  value={tripName}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.trim() === "") setTripName("Default Trip");
                    else setTripName(val);
                  }}
                  placeholder="Hard Rock Tampa / Vegas / Cruise"
                  className="h-10 text-sm mt-0.5"
                />
              </div>

              {availableTrips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-1.5">
                  {availableTrips.map((trip) => (
                    <button
                      key={trip}
                      type="button"
                      onClick={() => setTripName(trip)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold border ${tripName === trip ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-600"}`}
                    >
                      {trip}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={beginRenameTrip}
                    className="px-3 py-1 rounded-xl text-xs font-semibold border bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200"
                  >
                    Rename
                  </button>
                </div>
              )}

              {isRenamingTrip && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">Rename Location</div>
                  <div className="mb-2 text-sm text-amber-900">
                    Renaming <span className="font-semibold">{tripName}</span>. This will update all sessions for this location.
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Input
                      value={renameTripValue}
                      onChange={(e) => setRenameTripValue(e.target.value)}
                      placeholder="Enter new location name"
                      className="h-10 min-w-[220px] flex-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={confirmRenameTrip}
                      disabled={!renameTripValue.trim() || renameTripValue.trim() === tripName}
                      className="inline-flex h-10 items-center rounded-2xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save Name
                    </button>
                    <button
                      type="button"
                      onClick={cancelRenameTrip}
                      className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Type</div>
                <div className="flex flex-wrap gap-1.5 sm:gap-1.5">
                  {["Blackjack", "Ultimate", "3 Card", "Slots", "Other"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setGlobalSettings((prev) => ({ ...prev, game: type }));
                        setLocationGames((prev) => ({
                          ...prev,
                          [tripName]: type,
                        }));
                      }}
                      className={`px-3 py-1.5 rounded-xl text-sm font-semibold border ${globalSettings.game === type ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-700"}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Bankroll</div>
                <div className="text-xs text-slate-400">Per Location</div>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-right ring-1 ring-emerald-100">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Current</div>
                <div className="text-base font-semibold text-emerald-600">{fmtCurrency(summary.bankroll)}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                Out of Pocket Bankroll
                <span className="relative group cursor-pointer">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">?</span>
                  <span className="absolute left-1/2 top-7 z-10 hidden w-56 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block">
                    Your personal money invested into play
                  </span>
                </span>
              </div>
              <div className="mb-3 text-xs text-slate-500">Stored per location.</div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={startingBankroll}
                  onChange={(e) => setStartingBankroll(e.target.value)}
                  placeholder="e.g. 500"
                  className="h-10 w-20 sm:w-24 text-base font-semibold text-left flex-shrink-0"
                />

                {[100, 200, 500, 1000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setStartingBankroll(String(Number(startingBankroll || 0) + amt))}
                    className="rounded-xl bg-slate-900 text-white px-3 py-2 text-sm font-semibold shadow hover:bg-slate-800 transition"
                  >
                    +{amt}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-500">Starting bankroll + session results.</div>
          </div>
        </div>

        {openSessionWarning && (
          <div className="mb-5 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">Active Session</div>
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
                className="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-amber-100 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-200"
              >
                Open Session
              </button>
            </div>
          </div>
        )}

        <div className="w-full max-w-md grid gap-4 lg:max-w-none lg:gap-5 xl:grid-cols-1">
          <div className="grid w-full gap-4 lg:grid-cols-3">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
              <div className="mb-3">
                <div className="text-base font-semibold">Step 1 · Start Session</div>
                <div className="text-sm text-slate-500">Enter your buy-in and start the session timer.</div>
              </div>

              <div className="space-y-4">
                <Field label="Buy-In">
                  <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
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

                <div className="flex flex-wrap gap-1.5 sm:gap-1.5">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    type="button"
                    onClick={startSession}
                    disabled={!!activeSession || !startForm.buyIn}
                    className="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" />
                    Start Session
                  </motion.button>
                  {lastBuyIn && !activeSession && (
                    <button
                      type="button"
                      onClick={() => setStartForm((p) => ({ ...p, buyIn: lastBuyIn }))}
                      className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
                    >
                      Same Buy-In ({fmtCurrency(lastBuyIn)})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={resetStartForm}
                    disabled={!!activeSession}
                    className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Clear Form
                  </button>
                </div>
              </div>
            </motion.div>

            <motion.div id="finish-session-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
              <div className="mb-3">
                <div className="text-base font-semibold">Step 2 · Finish Session</div>
                <div className="text-sm text-slate-500">
                  {activeSession ? "Enter your results and finish the session." : "Start a session first to unlock this section."}
                </div>
              </div>

              {!activeSession ? (
                <div className="rounded-3xl bg-slate-50 px-4 py-8 text-left text-slate-500">No active session right now.</div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-md ring-1 ring-slate-800">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Active Session</div>
                        <div className="text-xl font-bold">{activeSession?.location || "—"}</div>
                        <div className="text-sm text-slate-300">{activeSession.game}</div>
                      </div>
                      <div className="text-left">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-300">Live Timer</div>
                        <div className="text-2xl font-bold tracking-wide">{activeElapsed}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Buy</div>
                        <div className="text-base font-semibold">{fmtCurrency(finishTotalBuyIn)}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Type</div>
                        <div className="text-base font-semibold">{activeSession.game}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Hours</div>
                        <div className="text-base font-semibold">{activeHours.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                    <div className="mb-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Session Entry</div>
                      <div className="text-lg font-bold text-slate-900">Cash Out · Out of Play · Points</div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <Field label="Cash Out">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={finishForm.cashOut}
                          onChange={(e) => setFinishForm((p) => ({ ...p, cashOut: e.target.value }))}
                          placeholder="0"
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-left flex-shrink-0"
                        />
                      </Field>

                      <Field label="Out of Play">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={finishForm.pocket}
                          onChange={(e) => setFinishForm((p) => ({ ...p, pocket: e.target.value }))}
                          placeholder="0"
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-left flex-shrink-0"
                        />
                      </Field>

                      <Field label="Point Total">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={finishForm.pointTotal}
                          onChange={(e) => setFinishForm((p) => ({ ...p, pointTotal: e.target.value }))}
                          placeholder={String(previousPointTotal)}
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-left flex-shrink-0"
                        />
                      </Field>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">Based on previous total: {previousPointTotal}</div>
                  </div>

                  <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-md ring-1 ring-slate-800">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Win</div>
                    <div className={`text-3xl font-bold tracking-tight ${finishActual >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtCurrency(finishActual)}
                    </div>
                    <div className="mt-2 text-sm text-slate-300">Cash Out + Out of Play - Buy-In</div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Finalize</div>
                        <div className="text-lg font-bold text-slate-900">Save Session</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 sm:gap-1.5">
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                        type="button"
                        onClick={finishSession}
                        className="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-5 text-sm font-semibold text-white shadow transition hover:shadow-md"
                      >
                        <Square className="h-4 w-4" />
                        Finish Session
                      </motion.button>
                      <button
                        type="button"
                        onClick={resetFinishForm}
                        className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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

            <motion.div id="edit-session-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">Step 3 · Edit Session</div>
                  <div className="text-sm text-slate-500">Adjust or correct a saved session.</div>
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
                <div className="rounded-3xl bg-slate-50 px-4 py-8 text-left text-slate-500">Select a session from the table to edit.</div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                    <div className="mb-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Edit Entry</div>
                      <div className="text-lg font-bold text-slate-900">Session Totals</div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <Field label="Buy-In">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={editForm.initialBuyIn}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, initialBuyIn: e.target.value }))}
                          placeholder="e.g. 500"
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-left flex-shrink-0"
                        />
                      </Field>

                      <Field label="Cash Out">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={editForm.cashOut}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, cashOut: e.target.value }))}
                          placeholder="0"
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-left flex-shrink-0"
                        />
                      </Field>

                      <Field label="Out of Play">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={editForm.pocket}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, pocket: e.target.value }))}
                          placeholder="0"
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-left flex-shrink-0"
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
                          className="h-10 w-24 sm:w-28 text-base font-semibold text-left flex-shrink-0"
                        />
                      </Field>

                      <div className="text-sm font-semibold text-slate-700">
                        {editForm.pointsEarned === "" ? "—" : `Session Points: ${editForm.pointsEarned}`}
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">Based on previous total: {editingPreviousPointTotal}</div>
                  </div>

                  <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-md ring-1 ring-slate-800">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Win/Loss</div>
                    <div className={`text-3xl font-bold tracking-tight ${editActual >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtCurrency(editActual)}
                    </div>
                    <div className="mt-2 text-sm text-slate-300">Based on edited buy-in, cash-out, and Out of Play.</div>
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
                      className="h-10 w-24 sm:w-28 text-base font-semibold text-left flex-shrink-0"
                    />
                  </Field>

                  <Field label="Notes">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {["Good run", "Tired", "Drinks", "Mistakes"].map((tag) => (
                        <button key={tag} type="button" onClick={() => setEditForm((p) => ({ ...p, notes: p.notes ? p.notes + ", " + tag : tag }))} className="px-3 py-1 rounded-full bg-slate-200 text-xs font-semibold">
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

                  <div className="flex flex-wrap gap-1.5 sm:gap-1.5">
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.12 }}
                      type="button"
                      onClick={updateEditedSession}
                      className="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-5 text-sm font-semibold text-white shadow transition hover:shadow-md"
                    >
                      <Pencil className="h-4 w-4" />
                      Update Session
                    </motion.button>
                    <button
                      type="button"
                      onClick={resetEditForm}
                      className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset Edit
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          <div className="mb-5 w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">Results Tracker</div>
                <div className="text-sm text-slate-500">Your current performance for {tripName}.</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
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
              <SmallStat icon={TrendingUp} label="Points" value={String(summary.sessionPoints)} />
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }} className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
              <div>
                <div className="flex items-center gap-1.5">
                  <div className="text-lg font-semibold">Sessions</div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-100 to-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200 shadow-sm">
                    <span className="text-sm">🎰</span>
                    {tripName}
                  </span>
                </div>
                <div className="text-sm text-slate-500">Tap Completed or use the edit icon to modify a session.</div>
                {lastClearedData && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-amber-700">Last clear is available to restore.</span>
                    <button
                      type="button"
                      onClick={restoreLastCleared}
                      className="inline-flex h-9 items-center gap-1.5 rounded-2xl bg-amber-100 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-200"
                    >
                      Restore Last Clear
                    </button>
                    <button
                      type="button"
                      onClick={discardLastCleared}
                      className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Permanently Clear
                    </button>
                  </div>
                )}
              </div>
              {confirmClearAll ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={clearAll}
                    className="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-red-600 px-4 text-sm font-semibold text-white"
                  >
                    Confirm Delete All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={clearCurrentLocation}
                    disabled={filteredSessions.length === 0}
                    className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Clear This Location
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(true)}
                    disabled={sessions.length === 0}
                    className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {filteredSessions.length === 0 ? (
              <div className="px-5 py-12 text-left text-slate-500">No sessions yet. Start your first session to begin tracking.</div>
            ) : (
              <div className="overflow-x-auto rounded-b-3xl">
                <div className="text-[10px] text-slate-400 px-2 pb-1 sm:hidden">Swipe to view →</div>
                <table className="min-w-full text-xs border-separate border-spacing-y-1 [font-variant-numeric:tabular-nums]">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-semibold w-24">Status</th>
                      <th className="px-2 py-2 font-semibold w-28">Date</th>
                      <th className="px-2 py-2 font-semibold text-right w-20">Buy</th>
                      <th className="px-2 py-2 font-semibold text-right w-20">Cash Out</th>
                      <th className="px-2 py-2 font-semibold text-right w-20">Out of Play</th>
                      <th className="px-2 py-2 font-semibold text-right w-24">Win</th>
                      <th className="px-2 py-2 font-semibold text-right w-28">Total</th>
                      <th className="px-2 py-2 font-semibold text-right w-28">Running</th>
                      <th className="px-2 py-2 font-semibold text-right w-20">Hours</th>
                      <th className="px-2 py-2 font-semibold text-right w-20">Points</th>
                      <th className="px-2 py-2 font-semibold text-right w-20">Session</th>
                      <th className="px-2 py-2 font-semibold w-20"></th>
                      <th className="px-2 py-2 font-semibold text-left w-[90px] whitespace-normal leading-tight">Type</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr]:align-middle">
                    {sessionsWithAccuratePoints.map((session) => {
                      const completedMatch = sessionsWithRunningTotals.find((row) => row.id === session.id);
                      const runningPerceived = completedMatch?.runningPerceived ?? 0;

                      return (
                        <tr key={session.id} className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 hover:shadow-md hover:ring-slate-200 hover:bg-slate-50 transition duration-150">
                          <td className="px-2 py-2 align-middle text-left">
                            {session.status === "active" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const el = document.getElementById("finish-session-panel");
                                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                                }}
                                className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-200"
                              >
                                Active
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => editSession(session)}
                                className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-200"
                              >
                                Completed
                              </button>
                            )}
                          </td>
                          <td className="px-2 py-2 text-slate-600 align-middle text-left whitespace-nowrap">
                            {session.startTime ? new Date(session.startTime).toLocaleDateString() : ""}
                          </td>
                          <td className="px-2 py-2 font-medium align-middle text-right whitespace-nowrap tabular-nums">{fmtCurrency(session.buyIn)}</td>
                          <td className="px-2 py-2 align-middle text-right whitespace-nowrap tabular-nums">
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
                                className="h-9 w-[72px] rounded-xl border border-slate-200 bg-white px-2 py-1 text-right text-xs tabular-nums outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
                              />
                            ) : "—"}
                          </td>
                          <td className="px-2 py-2 align-middle text-right whitespace-nowrap tabular-nums">
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
                                className="h-9 w-[72px] rounded-xl border border-slate-200 bg-white px-2 py-1 text-right text-xs tabular-nums outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
                              />
                            ) : "—"}
                          </td>
                          <td className={`px-2 py-2 font-bold align-middle text-right whitespace-nowrap tabular-nums ${session.actual >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {session.status === "completed" ? fmtCurrency(session.actual) : "—"}
                          </td>
                          <td className={`px-2 py-2 font-bold align-middle text-right whitespace-nowrap tabular-nums ${session.perceived >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {session.status === "completed" ? fmtCurrency(session.perceived) : "—"}
                          </td>
                          <td className={`px-2 py-2 font-bold align-middle text-right whitespace-nowrap tabular-nums ${runningPerceived >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {session.status === "completed" ? fmtCurrency(runningPerceived) : "—"}
                          </td>
                          <td className="px-2 py-2 align-middle text-right whitespace-nowrap tabular-nums">{session.status === "completed" ? session.hours.toFixed(2) : activeSession?.id === session.id ? activeHours.toFixed(2) : "—"}</td>
                          <td className="px-2 py-2 align-middle text-right whitespace-nowrap tabular-nums">
                            {session.status === "completed" ? (
                              <input
                                type="number"
                                value={session.pointTotal ?? ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSessions((prev) =>
                                    prev.map((s) =>
                                      s.id === session.id
                                        ? { ...s, pointTotal: value === "" ? undefined : (Number(value) === 0 ? undefined : Number(value)) }
                                        : s
                                    )
                                  );
                                }}
                                placeholder="—"
                                className="h-9 w-[72px] rounded-xl border border-slate-200 bg-white px-2 py-1 text-right text-xs tabular-nums outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
                              />
                            ) : "—"}
                          </td>
                          <td className="px-2 py-2 align-middle text-right whitespace-nowrap tabular-nums">{session.status === "completed" ? (session.pointsEarned ?? "—") : "—"}</td>
                          <td className="px-2 py-2 align-middle text-left">
                            <div className="flex justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => editSession(session)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                                aria-label="Edit session"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeSession(session.id)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                                aria-label="Delete session"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-2 align-middle text-left min-w-[90px]">
                            <div className="font-semibold text-slate-900">{session.game}</div>
                            {session.notes && <div className="mt-1 max-w-xs truncate text-xs text-slate-500" title={session.notes}>Notes: {session.notes}</div>}
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
