import { 
  LayoutDashboard, 
  Wallet, 
  History, 
  Calculator, 
  Settings, 
  HelpCircle, 
  LogOut, 
  Radio, 
  Users, 
  Globe, 
  Wifi, 
  WifiOff, 
  TrendingUp 
} from "lucide-react";
import { Collaborator } from "../types";

interface SidebarProps {
  currentTab: string;
  onChangeTab: (tab: string) => void;
  online: boolean;
  roomId: string | null;
  activeUsers: Collaborator[];
  onTriggerNewScenario: () => void;
  userEmail?: string;
  userName?: string;
  onShowJoinModal: () => void;
  onDisconnectRoom: () => void;
  onLogout?: () => void;
}

export default function Sidebar({
  currentTab,
  onChangeTab,
  online,
  roomId,
  activeUsers,
  onTriggerNewScenario,
  userEmail = "guest@example.com",
  userName = "Guest User",
  onShowJoinModal,
  onDisconnectRoom,
  onLogout
}: SidebarProps) {
  
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "budgets", label: "Budgets", icon: Wallet },
    { id: "transactions", label: "Transactions", icon: History },
    { id: "projections", label: "Smart Projections", icon: TrendingUp },
    { id: "calculator", label: "Calculator", icon: Calculator },
  ];

  return (
    <aside 
      id="app-sidebar" 
      className="w-64 bg-slate-950/80 border-r border-slate-800 flex flex-col justify-between h-screen fixed top-0 left-0 z-30 font-sans p-6 text-slate-255 backdrop-blur-md"
    >
      <div>
        {/* Brand Header */}
        <div id="brand-header" className="mb-8 flex items-center gap-3 px-2">
          <div className="w-8 h-8 bg-rose-700 rounded-lg flex items-center justify-center font-bold text-lg text-white shadow-md shadow-rose-700/35">✈️</div>
          <div>
            <h1 id="brand-title" className="text-lg font-bold tracking-tight text-white leading-tight">BUDJET</h1>
            <p id="brand-subtitle" className="text-[9px] font-semibold tracking-widest text-rose-400 uppercase">The Reliable Advisor</p>
          </div>
        </div>

        {/* Dynamic Synchronization State Unit (styled as Bento item) */}
        <div 
          id="sync-status-capsule" 
          className="mb-6 p-4 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-900/80 transition-all text-xs"
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="font-semibold text-slate-400 uppercase tracking-wider text-[9px]">Sync Engine</span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-bold text-[9px] ${
              online ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`}></span>
              {online ? "Online" : "Offline Ready"}
            </span>
          </div>

          {!roomId ? (
            <button
              onClick={onShowJoinModal}
              className="w-full py-2 px-3 bg-rose-700 hover:bg-rose-600 text-xs font-semibold text-white rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-rose-700/30"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              Go Collaborative
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] bg-slate-850 p-2 rounded-lg border border-slate-700">
                <span className="font-mono text-rose-400 font-bold">Room: {roomId}</span>
                <button 
                  onClick={onDisconnectRoom}
                  className="text-rose-400 hover:text-rose-300 font-bold hover:underline cursor-pointer"
                >
                  Leave
                </button>
              </div>
              
              {activeUsers.length > 0 && (
                <div className="mt-2">
                   <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-1 font-semibold">
                    <Users className="w-3 h-3" />
                    <span>Peer Presence ({activeUsers.length + 1})</span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pt-1">
                    {/* Logged in self */}
                    <span 
                      title={userEmail}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-950 text-rose-300 border border-rose-900 max-w-[100px] truncate"
                    >
                      Me ({userName ? userName.slice(0, 8) : "Me"})
                    </span>
                    {/* Other connected users */}
                    {activeUsers.slice(0, 3).map((u, i) => (
                      <span 
                        key={i}
                        title={u.email}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium border text-white max-w-[100px] truncate"
                        style={{ backgroundColor: u.color, borderColor: u.color }}
                      >
                        {u.name.split(" ")[0] || "Peer"}
                      </span>
                    ))}
                    {activeUsers.length > 3 && (
                      <span className="text-[10px] self-center text-slate-400 font-bold">+{activeUsers.length - 3}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Primary Navigation Hub */}
        <nav id="sidebar-nav" className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => onChangeTab(item.id)}
                className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  active 
                    ? "bg-slate-800 text-rose-400 border border-slate-700/50 shadow-md font-semibold" 
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <Icon className={`w-4.5 h-4.5 ${active ? "text-rose-400" : "text-slate-400"}`} />
                <span>{item.label}</span>
                {active && <span className="ml-auto w-1.5 h-1.5 bg-rose-400 rounded-full animate-ping" />}
              </button>
            );
          })}
        </nav>

        {/* New Scenario Sidebar Shortcut */}
        <div id="new-scenario-box" className="mt-8 pt-4 border-t border-slate-800">
          <button
            onClick={onTriggerNewScenario}
            id="btn-sidebar-new-scenario"
            className="w-full py-2.5 px-4 bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold tracking-wider uppercase rounded-xl transition-all shadow-sm shadow-rose-700/30 text-center cursor-pointer"
          >
            New Scenario
          </button>
        </div>
      </div>

      {/* Footer Utilities */}
      <div id="sidebar-footer" className="space-y-4">
        {/* User profile (The Reliable Advisor profile metadata at bottom) */}
        <div id="advisor-profile-card" className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200 overflow-hidden shrink-0">
            <img 
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${userEmail}`} 
              alt="avatar" 
              className="w-full h-full object-cover" 
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-200 truncate">{userName}</p>
            <p className="text-[10px] text-slate-400 truncate">{userEmail}</p>
          </div>
        </div>

        <div className="flex flex-col gap-1 text-slate-400 text-xs font-medium">
          <button id="btn-sidebar-help" onClick={() => alert("BUDJET support: Please refer to our Precision Wealth user manual. Real-Time and local action logs enable persistent offline budgeting.")} className="flex items-center gap-2 px-3 py-1.5 hover:text-rose-400 text-slate-400 transition-colors cursor-pointer">
            <HelpCircle className="w-4 h-4" />
            <span>Help</span>
          </button>
          <button 
            id="btn-sidebar-logout" 
            onClick={() => {
              if (onLogout) {
                onLogout();
              } else {
                alert("Logout simulated successfully. Workspace remains synced to server.");
              }
            }} 
            className="flex items-center gap-2 px-3 py-1.5 hover:text-rose-400 text-slate-400 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
