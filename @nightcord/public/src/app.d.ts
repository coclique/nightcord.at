import type { Database } from '@nightcord/shared/db'
import type { ServiceEvent } from '@nightcord/shared/events'

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      db: Database
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {}
