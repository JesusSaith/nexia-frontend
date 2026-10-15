/** Giros que se pueden elegir al registrarse y en Configuración; el backend deduce cómo se llama al personal. */
export const BUSINESS_KINDS = [
  { value: 'belleza', label: 'Salón de belleza', icon: 'content_cut' },
  { value: 'unas', label: 'Salón de uñas', icon: 'back_hand' },
  { value: 'barberia', label: 'Barbería', icon: 'face' },
  { value: 'spa', label: 'Spa', icon: 'spa' },
  { value: 'consultorio', label: 'Consultorio', icon: 'stethoscope' },
  { value: 'dental', label: 'Clínica dental', icon: 'dentistry' },
  { value: 'veterinaria', label: 'Veterinaria', icon: 'pets' },
  { value: 'estudio', label: 'Estudio', icon: 'brush' },
  { value: 'otro', label: 'Otro', icon: 'more_horiz' },
] as const;

/** Negocios creados antes de guardar el giro: se deduce de la etiqueta del personal. */
const KIND_BY_STAFF_LABEL: Record<string, string> = {
  Estilista: 'belleza',
  Manicurista: 'unas',
  Barbero: 'barberia',
  Terapeuta: 'spa',
  Veterinario: 'veterinaria',
  Especialista: 'consultorio',
  Dentista: 'dental',
  Profesional: 'estudio',
};

export function kindOf(businessKind: string | null | undefined, staffLabel: string | null | undefined): string {
  if (businessKind) {
    return businessKind;
  }
  return KIND_BY_STAFF_LABEL[staffLabel ?? ''] ?? 'otro';
}
