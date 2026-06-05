import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  BunyanApi,
  SessionCreateRequest,
  SessionCreateResult,
  SessionWriteRequest,
  SessionResizeRequest,
  SessionKillRequest,
  GitBranchRequest,
  GitBranchResult,
  OpenedProject,
  SessionDataEvent,
  SessionStatusEvent,
  SessionExitEvent,
  FocusRequestEvent,
  Unsubscribe,
} from '@shared/ipc'
import type { Workspace } from '@shared/types'

// Subscribe to a streamed channel, stripping the IpcRendererEvent so the
// renderer only sees its payload. Returns an unsubscribe function.
function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: BunyanApi = {
  session: {
    create: (req: SessionCreateRequest): Promise<SessionCreateResult> =>
      ipcRenderer.invoke(IPC.sessionCreate, req),
    write: (req: SessionWriteRequest): void => ipcRenderer.send(IPC.sessionWrite, req),
    resize: (req: SessionResizeRequest): void => ipcRenderer.send(IPC.sessionResize, req),
    kill: (req: SessionKillRequest): Promise<void> => ipcRenderer.invoke(IPC.sessionKill, req),
    onData: (cb: (e: SessionDataEvent) => void): Unsubscribe =>
      subscribe(IPC.sessionData, cb),
    onStatus: (cb: (e: SessionStatusEvent) => void): Unsubscribe =>
      subscribe(IPC.sessionStatus, cb),
    onExit: (cb: (e: SessionExitEvent) => void): Unsubscribe =>
      subscribe(IPC.sessionExit, cb),
  },
  project: {
    openDialog: (): Promise<OpenedProject | null> => ipcRenderer.invoke(IPC.projectOpenDialog),
    gitBranch: (req: GitBranchRequest): Promise<GitBranchResult | null> =>
      ipcRenderer.invoke(IPC.projectGitBranch, req),
  },
  store: {
    load: (): Promise<Workspace | null> => ipcRenderer.invoke(IPC.storeLoad),
    save: (workspace: Workspace): Promise<void> => ipcRenderer.invoke(IPC.storeSave, workspace),
  },
  app: {
    setActiveSession: (sessionId: string | null): void =>
      ipcRenderer.send(IPC.appActiveSession, sessionId),
    onFocusRequest: (cb: (e: FocusRequestEvent) => void): Unsubscribe =>
      subscribe(IPC.appFocusRequest, cb),
  },
}

contextBridge.exposeInMainWorld('bunyan', api)
