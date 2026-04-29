import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  SshQuickCommand,
  SshQuickCommandForm,
  SshSessionMeta,
  SshTerminalSessionInfo,
} from "@/plugins/ssh-client/types";

interface SessionsState {
  sessions: SshSessionMeta[];
  activeSessionId: string | null;
  outputBySession: Record<string, string[]>;
  quickCommands: SshQuickCommand[];
  ensureListeners: () => Promise<void>;
  loadQuickCommands: (connectionId?: string) => Promise<void>;
  saveQuickCommand: (form: SshQuickCommandForm) => Promise<void>;
  deleteQuickCommand: (id: string) => Promise<void>;
  openSession: (connId: string, tabLabel: string) => Promise<string>;
  closeSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, tabLabel: string) => void;
  setActive: (sessionId: string | null) => void;
  sendInput: (sessionId: string, data: string) => Promise<void>;
  resizeSession: (sessionId: string, cols: number, rows: number) => Promise<void>;
  appendOutput: (sessionId: string, chunk: string) => void;
  markClosed: (sessionId: string) => void;
}

let initialized = false;
const outputUnlisten = new Map<string, UnlistenFn>();
const exitUnlisten = new Map<string, UnlistenFn>();

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((item) => {
    binary += String.fromCharCode(item);
  });
  return btoa(binary);
}

function decodeBase64(text: string): string {
  const binary = atob(text);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export const useSshSessionsStore = create<SessionsState>()((set, get) => ({
  sessions: [],
  activeSessionId: null,
  outputBySession: {},
  quickCommands: [],
  ensureListeners: async () => {
    if (initialized) {
      return;
    }
    initialized = true;
    await listen<string>("ssh://session-closed", (event) => {
      const connId = event.payload;
      set((state) => ({
        sessions: state.sessions.map((item) =>
          item.connId === connId ? { ...item, status: "closed" } : item,
        ),
      }));
    });
  },
  loadQuickCommands: async (connectionId) => {
    const commands = await invoke<SshQuickCommand[]>("cmd_ssh_list_quick_commands", {
      connectionId: connectionId ?? null,
    });
    set({ quickCommands: commands });
  },
  saveQuickCommand: async (form) => {
    await invoke("cmd_ssh_save_quick_command", { form });
    await get().loadQuickCommands(form.connectionId);
  },
  deleteQuickCommand: async (id) => {
    await invoke("cmd_ssh_delete_quick_command", { id });
    set((state) => ({
      quickCommands: state.quickCommands.filter((item) => item.id !== id),
    }));
  },
  openSession: async (connId, tabLabel) => {
    await get().ensureListeners();
    const info = await invoke<SshTerminalSessionInfo>("cmd_ssh_open_terminal", { connId });
    const sessionId = info.sessionId;
    set((state) => ({
      sessions: [
        ...state.sessions,
        {
          sessionId,
          connId,
          tabLabel,
          status: "active",
        },
      ],
      activeSessionId: sessionId,
      outputBySession: {
        ...state.outputBySession,
        [sessionId]: [],
      },
    }));

    const outputEvent = `ssh://terminal-output/${sessionId}`;
    const exitEvent = `ssh://terminal-exit/${sessionId}`;
    const unlistenOut = await listen<string>(outputEvent, (event) => {
      try {
        const chunk = decodeBase64(event.payload);
        get().appendOutput(sessionId, chunk);
      } catch {
        get().appendOutput(sessionId, event.payload);
      }
    });
    const unlistenExit = await listen<number>(exitEvent, (event) => {
      get().appendOutput(sessionId, `\r\n[Session exited: ${event.payload}]`);
      get().markClosed(sessionId);
    });
    outputUnlisten.set(sessionId, unlistenOut);
    exitUnlisten.set(sessionId, unlistenExit);

    try {
      const buffered = await invoke<string>("cmd_ssh_terminal_drain_output", { sessionId });
      if (buffered) {
        try {
          const chunk = decodeBase64(buffered);
          if (chunk) {
            get().appendOutput(sessionId, chunk);
          }
        } catch {
          // Ignore decode error for fallback.
        }
      }
    } catch {
      // Ignore drain errors; event stream still works.
    }
    return sessionId;
  },
  closeSession: async (sessionId) => {
    try {
      await invoke("cmd_ssh_close_terminal", { sessionId });
    } catch {
      // Ignore backend close errors; local state must still be cleaned up.
    }
    outputUnlisten.get(sessionId)?.();
    exitUnlisten.get(sessionId)?.();
    outputUnlisten.delete(sessionId);
    exitUnlisten.delete(sessionId);
    set((state) => {
      const sessions = state.sessions.filter((item) => item.sessionId !== sessionId);
      const activeSessionId =
        state.activeSessionId === sessionId
          ? sessions.length > 0
            ? sessions[sessions.length - 1].sessionId
            : null
          : state.activeSessionId;
      const { [sessionId]: _removed, ...restOutput } = state.outputBySession;
      return { sessions, activeSessionId, outputBySession: restOutput };
    });
  },
  renameSession: (sessionId, tabLabel) =>
    set((state) => ({
      sessions: state.sessions.map((item) =>
        item.sessionId === sessionId ? { ...item, tabLabel } : item,
      ),
    })),
  setActive: (activeSessionId) => set({ activeSessionId }),
  sendInput: async (sessionId, data) => {
    await invoke("cmd_ssh_terminal_input", {
      sessionId,
      dataBase64: encodeBase64(data),
    });
  },
  resizeSession: async (sessionId, cols, rows) => {
    await invoke("cmd_ssh_terminal_resize", { sessionId, cols, rows });
  },
  appendOutput: (sessionId, chunk) =>
    set((state) => ({
      outputBySession: {
        ...state.outputBySession,
        [sessionId]: [...(state.outputBySession[sessionId] ?? []), chunk],
      },
    })),
  markClosed: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.map((item) =>
        item.sessionId === sessionId ? { ...item, status: "closed" } : item,
      ),
    })),
}));
