import type { IconName } from '@/components/Icon'

// Las dos puertas de entrada del equipo. El rol real lo decide la cuenta: si una manicurista entra
// por "Dueño", igual llega a su propia agenda (no hay nada que ganar ni que perder).
export const STAFF_ROLES = {
  dueno: {
    title: 'Dueño / Administrador',
    short: 'dueño',
    desc: 'Todo el spa: agenda del equipo, cobros, pagos y análisis',
    icon: 'chart',
  },
  manicurista: {
    title: 'Manicurista',
    short: 'manicurista',
    desc: 'Tu agenda, aprobar tus citas y cobrar',
    icon: 'polish',
  },
} as const satisfies Record<string, { title: string; short: string; desc: string; icon: IconName }>

export type StaffRole = keyof typeof STAFF_ROLES
export const isStaffRole = (r: string): r is StaffRole => Object.hasOwn(STAFF_ROLES, r)
