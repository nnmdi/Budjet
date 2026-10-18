import { useEffect, useRef, useState } from "react";
import { apiAvailable, apiUrl } from "../api";
import {
  emptyLedger,
  Ledger,
  migrateLedger,
  normalizeLedger,
} from "../domain/ledger";

export async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(apiUrl(path), {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return body;
}
const keyFor = (email: string) => `cashdiet:ledger:v1:${email}`;
export function readLocal(email: string): Ledger {
  const key = keyFor(email),
    saved = localStorage.getItem(key);
  if (saved) return normalizeLedger(JSON.parse(saved));
  const read = (key: string, fallback: unknown) =>
    JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  return migrateLedger(
    read(`budgetmanager_v3_budgets_${email}`, {}),
    read(`budgetmanager_v3_transactions_${email}`, []),
    read(`budgetmanager_v4_due_bills_${email}`, []),
  );
}
export function saveLocal(email: string, state: Ledger) {
  const key = keyFor(email),
    before = localStorage.getItem(key);
  if (before) localStorage.setItem(key + ":previous", before);
  localStorage.setItem(key, JSON.stringify(state));
}
export default function useWorkspace(
  email: string,
  guest: boolean,
  onError: (message: string) => void,
  hosted = apiAvailable,
) {
  const [ledger, setLedger] = useState<Ledger>(emptyLedger),
    [ready, setReady] = useState(false),
    [roomId, setRoomId] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [canUndo, setCanUndo] = useState(false),
    [canRedo, setCanRedo] = useState(false);
  const ref = useRef(ledger),
    version = useRef(0),
    generation = useRef(0),
    chain = useRef<Promise<unknown>>(Promise.resolve());
  const undo = useRef<Ledger[]>([]),
    redo = useRef<Ledger[]>([]);
  const transitioning = useRef(false);
  const locked = useRef(true),
    room = useRef<string | null>(null);
  const publish = (value: Ledger) => {
    ref.current = value;
    setLedger(value);
    setCanUndo(undo.current.length > 0);
    setCanRedo(redo.current.length > 0);
  };
  const historyReset = () => {
    undo.current = [];
    redo.current = [];
    setCanUndo(false);
    setCanRedo(false);
  };
  useEffect(() => {
    const token = ++generation.current;
    locked.current = true;
    setReady(false);
    setBusy(false);
    transitioning.current = false;
    room.current = null;
    setRoomId(null);
    historyReset();
    publish(emptyLedger());
    (async () => {
      try {
        let value = emptyLedger();
        if (email && hosted) {
          const data = await request("/api/workspace");
          value = normalizeLedger(data.ledger);
          if (token !== generation.current) return;
          version.current = data.version;
        } else if (email) value = readLocal(email);
        if (token !== generation.current) return;
        if (email && !hosted) saveLocal(email, value);
        publish(value);
        locked.current = false;
        setReady(true);
      } catch (e) {
        if (token === generation.current)
          onError(
            `${(e as Error).message} Your stored data was not overwritten. Restore a backup or retry.`,
          );
      }
    })();
    return () => {
      generation.current++;
      locked.current = true;
    };
  }, [email, guest]);
  const perform = (
    transform: (current: Ledger) => Ledger,
    kind: "edit" | "undo" | "redo" | "refresh" = "edit",
  ) => {
    if (transitioning.current) {
      onError("Wait for the workspace switch to finish.");
      return Promise.resolve();
    }
    const token = generation.current;
    const job = async () => {
      if (token !== generation.current || locked.current) return;
      setBusy(true);
      try {
        const before = normalizeLedger(ref.current);
        let after: Ledger;
        if (kind === "undo") {
          if (!undo.current.length) return;
          after = normalizeLedger(undo.current.at(-1)!);
        } else if (kind === "redo") {
          if (!redo.current.length) return;
          after = normalizeLedger(redo.current.at(-1)!);
        } else after = normalizeLedger(transform(before));
        if (JSON.stringify(after) === JSON.stringify(ref.current)) return;
        if (email && hosted) {
          const data = await request(
            room.current ? `/api/rooms/${room.current}` : "/api/workspace",
            {
              method: "PUT",
              body: JSON.stringify({ ledger: after, version: version.current }),
            },
          );
          if (token !== generation.current) return;
          version.current = data.version;
          after = normalizeLedger(data.ledger);
        } else if (email) saveLocal(email, after);
        if (token !== generation.current) return;
        if (kind === "undo") {
          undo.current.pop();
          redo.current.push(before);
        } else if (kind === "redo") {
          redo.current.pop();
          undo.current.push(before);
        } else if (kind === "edit") {
          undo.current.push(before);
          undo.current = undo.current.slice(-100);
          redo.current = [];
        }
        publish(after);
      } catch (e) {
        if (token === generation.current)
          onError(
            (e as Error).message +
              (hosted
                ? " Save not confirmed. Reload latest before retrying."
                : " The change was not applied."),
          );
      } finally {
        if (token === generation.current) setBusy(false);
      }
    };
    chain.current = chain.current.then(job, job);
    return chain.current;
  };
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      void perform((current) => normalizeLedger(current), "refresh");
    };
    const timer = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [ready, email, guest, roomId]);
  const switchRoom = async (id: string | null, token?: string) => {
    if (transitioning.current)
      throw new Error("A workspace switch is already in progress.");
    const epoch = generation.current;
    transitioning.current = true;
    setBusy(true);
    try {
      if (!hosted || !email)
        throw new Error("Shared rooms require a signed-in server account.");
      // Finish every queued write before changing its destination.
      await chain.current;
      if (id) {
        const data = await request(`/api/rooms/${id}/join`, {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (epoch !== generation.current) return;
        room.current = id;
        setRoomId(id);
        version.current = data.version;
        historyReset();
        publish(normalizeLedger(data.ledger));
      } else {
        const data = await request("/api/workspace");
        if (epoch !== generation.current) return;
        room.current = null;
        setRoomId(null);
        version.current = data.version;
        historyReset();
        publish(normalizeLedger(data.ledger));
      }
    } finally {
      if (epoch === generation.current) {
        transitioning.current = false;
        setBusy(false);
      }
    }
  };
  const createRoom = async () => {
    if (transitioning.current)
      throw new Error("A workspace switch is already in progress.");
    const epoch = generation.current;
    transitioning.current = true;
    setBusy(true);
    try {
      if (!hosted || !email)
        throw new Error("Shared rooms require a signed-in server account.");
      await chain.current;
      const data = await request("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ ledger: ref.current }),
      });
      if (epoch !== generation.current) return;
      room.current = data.roomId;
      setRoomId(data.roomId);
      version.current = data.version;
      historyReset();
      publish(normalizeLedger(data.ledger));
      return data;
    } finally {
      if (epoch === generation.current) {
        transitioning.current = false;
        setBusy(false);
      }
    }
  };
  const reload = async () => {
    if (transitioning.current)
      throw new Error("A workspace switch is already in progress.");
    const epoch = generation.current;
    transitioning.current = true;
    setBusy(true);
    try {
      if (!hosted || !email) return;
      await chain.current;
      const data = await request(
        room.current ? `/api/rooms/${room.current}` : "/api/workspace",
      );
      if (epoch !== generation.current) return;
      version.current = data.version;
      historyReset();
      publish(normalizeLedger(data.ledger));
    } finally {
      if (epoch === generation.current) {
        transitioning.current = false;
        setBusy(false);
      }
    }
  };
  const recover = (value: Ledger) => {
    if (hosted || !email)
      throw new Error(
        "Wait until the server workspace loads before restoring.",
      );
    const clean = normalizeLedger(value);
    saveLocal(email, clean);
    historyReset();
    publish(clean);
    locked.current = false;
    setReady(true);
  };
  return {
    ledger,
    ready,
    busy,
    roomId,
    recover,
    canUndo,
    canRedo,
    edit: perform,
    undo: () => perform((x) => x, "undo"),
    redo: () => perform((x) => x, "redo"),
    switchRoom,
    createRoom,
    reload,
  };
}
