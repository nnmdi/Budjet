import React, { useState } from "react";
import { 
  Users, 
  PlusCircle, 
  DoorOpen, 
  Copy, 
  Check, 
  Activity, 
  ArrowLeftRight, 
  HeartHandshake 
} from "lucide-react";
import { Room, Collaborator } from "../types";

interface CollaborationHubProps {
  onJoinRoom: (code: string) => void;
  onCreateRoom: () => void;
  online: boolean;
  roomId: string | null;
  roomDetails: Room | null;
  activeUsers: Collaborator[];
  onDisconnectRoom: () => void;
  onClose: () => void;
}

export default function CollaborationHub({
  onJoinRoom,
  onCreateRoom,
  online,
  roomId,
  roomDetails,
  activeUsers,
  onDisconnectRoom,
  onClose
}: CollaborationHubProps) {
  
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorText, setErrorText] = useState("");

  const handleCopyCode = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCodeInput.trim();
    if (cleanCode.length !== 6 || isNaN(Number(cleanCode))) {
      setErrorText("Please enter a valid 6-digit collaboration code.");
      return;
    }
    setErrorText("");
    onJoinRoom(cleanCode);
    setRoomCodeInput("");
  };

  return (
    <div id="collaboration-modal-backdrop" className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div 
        id="collaboration-modal" 
        className="bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl max-w-lg w-full overflow-hidden font-sans flex flex-col h-[520px] transition-all animate-fade-in"
      >
        {/* Modal Header */}
        <div className="bg-slate-950 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-rose-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-snug text-white">Share My App</h3>
              <p className="text-[9px] text-rose-400 uppercase tracking-widest font-sans mt-0.5 font-bold">Work Together with Friends</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white font-bold text-xs tracking-tight border border-slate-800 px-3 py-1.5 rounded-xl hover:bg-slate-900 transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6 font-sans">
          
          {/* Section 1: Connection & Room Configuration */}
          {!roomId ? (
            <div className="flex flex-col gap-4 font-sans">
              <div className="text-center p-5 bg-slate-950/50 rounded-xl border border-slate-800 mb-2 font-sans">
                <HeartHandshake className="w-8 h-8 text-rose-400 mx-auto mb-2 animate-bounce" />
                <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto font-medium font-sans">
                  Invite friends or family to see your budgets and use the money tools together in real time!
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch font-sans">
                {/* Option A: Create Room */}
                <button
                  type="button"
                  onClick={onCreateRoom}
                  className="p-5 rounded-xl bg-rose-950/30 hover:bg-rose-950/40 border border-rose-500/20 text-left flex flex-col justify-between transition-all group cursor-pointer font-sans"
                >
                  <PlusCircle className="w-6 h-6 text-rose-400 group-hover:scale-105 transition-transform" />
                  <div className="mt-4 font-sans">
                    <h4 className="font-bold text-xs text-white font-sans">Start a New Room</h4>
                    <p className="text-[10px] text-slate-450 mt-1 leading-normal font-medium font-sans">Get a new 6-digit room code to share.</p>
                  </div>
                </button>

                {/* Option B: Join Room Area form */}
                <form 
                  onSubmit={handleJoin}
                  className="p-5 rounded-xl bg-slate-950 border border-slate-800 text-left flex flex-col justify-between transition-all font-sans"
                >
                  <div className="space-y-1 w-full font-sans">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1 font-sans">Enter Code</label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 581290"
                      value={roomCodeInput}
                      onChange={(e) => {
                        setRoomCodeInput(e.target.value.replace(/\D/g, ""));
                        if (errorText) setErrorText("");
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-center text-sm font-mono tracking-widest font-black text-white outline-none focus:border-rose-500 transition-all font-sans"
                    />
                    {errorText && (
                      <p className="text-[10px] text-rose-455 font-semibold mt-1.5 leading-tight font-sans">
                        ⚠ {errorText}
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="w-full mt-4 py-2 bg-rose-700 text-white hover:bg-rose-605 text-[10px] uppercase font-bold tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-rose-700/30"
                  >
                    <DoorOpen className="w-3.5 h-3.5" />
                    <span>Join Room</span>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            // Swapped Collaborative details panel if already active
            <div className="space-y-4">
              <div className="p-4.5 rounded-xl border border-slate-800 bg-slate-950/50 flex items-center justify-between gap-4">
                <div>
                  <span className="text-[9px] font-bold text-slate-450 uppercase tracking-widest font-semibold">Active Hub ID</span>
                  <div className="flex items-center gap-2 mt-1">
                    <h5 className="text-xl font-bold font-mono tracking-widest text-white">{roomId}</h5>
                    <button
                      onClick={handleCopyCode}
                      className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white cursor-pointer"
                      title="Copy join link"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onDisconnectRoom}
                  className="px-4 py-2 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400 text-xs font-bold rounded-xl transition-all cursor-pointer font-sans"
                >
                  Leave Room
                </button>
              </div>

              {/* Server Activity Log Tracker */}
              <div className="border border-slate-800 rounded-xl overflow-hidden flex flex-col h-48 bg-slate-950/30">
                <div className="bg-slate-950 px-4 py-2 text-[9px] font-bold text-slate-455 uppercase tracking-widest border-b border-slate-800 flex items-center gap-2 font-sans">
                  <Activity className="w-3.5 h-3.5 text-rose-450 animate-pulse" />
                  <span>Live Updates</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5 font-sans">
                  {roomDetails?.history && roomDetails.history.map((log) => (
                    <div key={log.id} className="text-[10.5px] leading-relaxed border-b border-slate-850 pb-2 last:border-0 last:pb-0 font-sans">
                      <div className="flex justify-between items-center text-slate-400 mb-0.5">
                        <span className="font-bold text-slate-300">{log.userName} ({log.userEmail.split("@")[0]})</span>
                        <span className="font-mono text-[9px] text-rose-400">{log.timestamp.slice(11, 16)}</span>
                      </div>
                      <p className="text-slate-400 font-medium font-sans">{log.action}</p>
                    </div>
                  ))}

                  {(!roomDetails?.history || roomDetails.history.length === 0) && (
                    <div className="h-full flex items-center justify-center text-slate-500 italic text-[11px] font-medium font-sans">
                      No updates yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
