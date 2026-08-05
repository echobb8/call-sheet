/// <reference types="vite/client" />
import type { CallSheetApi } from '../../shared/types'

declare global {
  interface Window {
    callsheet: CallSheetApi
  }
}

export {}
