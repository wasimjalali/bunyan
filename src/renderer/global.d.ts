import type { BunyanApi } from '@shared/ipc'

declare global {
  interface Window {
    bunyan: BunyanApi
  }
}

export {}
