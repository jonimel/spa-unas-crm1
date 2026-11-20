import type { IconName } from '@/components/Icon'

// Las dos puertas de entrada del equipo. El rol real lo decide la cuenta: si un barbero entra
// por "Dueño", igual llega a su propia agenda (no hay nada que ganar ni que perder).
export const STAFF_ROLES = {
  dueno: {
    title: 'Dueño / Administrador',
    short: 'dueño',
    desc: 'Toda la barbería: agenda del equipo, cobros, pagos y análisis',
    icon: 'chart',
  },
  barbero: {
    title: 'Barbero',
    short: 'barbero',
    desc: 'Tu agenda, aprobar tus citas y cobrar',
    icon: 'sc',
  },
} as const satisfies Record<string, { title: string; short: string; desc: string; icon: IconName }>

export type StaffRole = keyof typeof STAFF_ROLES
export const isStaffRole = (r: string): r is StaffRole => Object.hasOwn(STAFF_ROLES, r)
