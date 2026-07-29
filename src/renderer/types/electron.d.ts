import type { ElectronAPI } from '../../shared/ipc-contract'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
