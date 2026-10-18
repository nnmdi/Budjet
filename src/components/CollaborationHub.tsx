import { useEffect, useRef, useState } from "react";
import { request } from "../hooks/useWorkspace";
import type { Room, Collaborator } from "../types";
interface Props {
  invitation?: string;
  onJoinRoom: (code: string) => void;
  onCreateRoom: () => void;
  onDisconnectRoom: () => void;
  roomId: string | null;
  roomDetails: Room | null;
  activeUsers: Collaborator[];
  online: boolean;
  onClose: () => void;
}
export default function CollaborationHub({
  invitation = "",
  onJoinRoom,
  onCreateRoom,
  onDisconnectRoom,
  roomId,
  online,
  onClose,
}: Props) {
  const [code, setCode] = useState(""),
    [invite, setInvite] = useState(invitation),
    [error, setError] = useState("");
  const [rooms, setRooms] = useState<{ id: string; owner: boolean }[]>([]);
  useEffect(() => {
    request("/api/rooms")
      .then((data) => setRooms(data.rooms))
      .catch(() => setRooms([]));
  }, [roomId]);
  const [members, setMembers] = useState<
    { id: string; name: string; email: string }[]
  >([]);
  useEffect(() => {
    if (roomId)
      request(`/api/rooms/${roomId}/members`)
        .then((data) => setMembers(data.members))
        .catch(() => setMembers([]));
  }, [roomId]);
  const revoke = async (id: string) => {
    try {
      await request(`/api/rooms/${roomId}/members/${id}`, {
        method: "DELETE",
        body: "{}",
      });
      setMembers((prev) => prev.filter((m) => m.id !== id));
      setInvite("");
      setError(
        "Member removed and previous invitations invalidated. Issue a new invitation if needed.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => setInvite(invitation), [invitation]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items =
          dialog.current?.querySelectorAll<HTMLElement>("button,input");
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  const rotate = async () => {
    try {
      const data = await request(`/api/rooms/${roomId}/invite`, {
        method: "POST",
        body: "{}",
      });
      setInvite(data.invitation);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-heading"
        className="bg-slate-900 border border-slate-700 text-white rounded-2xl p-6 w-full max-w-lg space-y-5"
      >
        <div className="flex justify-between">
          <h2 id="room-heading" className="font-bold">
            Shared workspace
          </h2>
          <button aria-label="Close shared workspace" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="text-sm text-slate-300">
          Shared rooms require server accounts. Invite people you trust to edit
          a shared copy of your budgets. Your personal workspace stays separate.
          Use Reload latest to fetch other editors’ changes.
        </p>
        {!online && (
          <p role="status" className="text-amber-300">
            You are offline. Server changes cannot be saved.
          </p>
        )}
        {roomId ? (
          <>
            <p className="break-all text-xs text-slate-400">Room: {roomId}</p>
            {invite && (
              <label className="block text-sm">
                Private invitation
                <input
                  readOnly
                  value={invite}
                  onFocus={(e) => e.target.select()}
                  className="block w-full bg-slate-950 rounded p-3 mt-2"
                />
              </label>
            )}
            {invite && (
              <button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(invite)
                    .catch(() =>
                      setError("Select and copy the invitation above."),
                    )
                }
                className="block text-sm text-rose-300"
              >
                Copy invitation
              </button>
            )}
            <button
              onClick={() => void rotate()}
              className="text-sm text-rose-300"
            >
              Issue a new invitation (owner only)
            </button>
            <p className="text-xs text-slate-400">
              Issuing a new invitation invalidates the previous invitation for
              new members. Existing members keep access.
            </p>
            {members.map((m) => (
              <div key={m.id} className="flex justify-between text-xs gap-3">
                <span>
                  {m.name} ({m.email})
                </span>
                <button onClick={() => void revoke(m.id)}>Remove member</button>
              </div>
            ))}
            <button
              onClick={onDisconnectRoom}
              className="block border border-slate-700 rounded p-2"
            >
              Return to personal workspace
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onCreateRoom}
              className="w-full bg-rose-700 rounded-xl p-3"
            >
              Create a shared copy
            </button>
            {rooms.map((r) => (
              <button
                key={r.id}
                onClick={() => onJoinRoom(r.id)}
                className="block w-full text-left text-xs text-slate-300 p-2 rounded border border-slate-700"
              >
                Open saved workspace {r.id.slice(0, 8)}{" "}
                {r.owner ? "(owner)" : ""}
              </button>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!/^[-a-f0-9]{36}\.[a-f0-9]{64}$/.test(code.trim())) {
                  setError("Paste the complete private invitation.");
                  return;
                }
                onJoinRoom(code.trim());
              }}
              className="space-y-3"
            >
              <label className="block text-sm">
                Private invitation
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={101}
                  className="block w-full bg-slate-950 rounded p-3 mt-2"
                />
              </label>
              <button className="w-full border border-slate-700 rounded p-3">
                Join shared workspace
              </button>
            </form>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
