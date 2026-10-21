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

/** Ejemplos para placeholders y vistas previas, según el giro: nada de un negocio en particular. */
export interface KindExamples {
  name: string;
  description: string;
  service: string;
  bio: string;
}

const EXAMPLES: Record<string, KindExamples> = {
  belleza: { name: 'Estudio Ana', description: 'Cortes, color y peinados para toda la familia.', service: 'Corte y peinado', bio: 'Especialista en color, 5 años de experiencia.' },
  unas: { name: 'Nails Luna', description: 'Uñas acrílicas, gelish y diseños a mano.', service: 'Gelish en manos', bio: 'Especialista en uñas acrílicas, 5 años de experiencia.' },
  barberia: { name: 'Barbería Centro', description: 'Cortes clásicos, fade y arreglo de barba.', service: 'Corte y barba', bio: 'Barbero con 5 años de experiencia en fade.' },
  spa: { name: 'Spa Brisa', description: 'Masajes, faciales y tratamientos para relajarte.', service: 'Masaje relajante', bio: 'Terapeuta en masaje relajante y descontracturante.' },
  consultorio: { name: 'Consultorio Dra. Ruiz', description: 'Consulta general y seguimiento para toda la familia.', service: 'Consulta general', bio: 'Médica general con 10 años de experiencia.' },
  dental: { name: 'Clínica Sonrisa', description: 'Limpieza, resinas y ortodoncia.', service: 'Limpieza dental', bio: 'Odontóloga especialista en ortodoncia.' },
  veterinaria: { name: 'Veterinaria Patitas', description: 'Consulta, vacunas y estética para tu mascota.', service: 'Consulta veterinaria', bio: 'Médico veterinario con 8 años de experiencia.' },
  estudio: { name: 'Estudio Norte', description: 'Sesiones y clases con cita.', service: 'Sesión individual', bio: '5 años de experiencia.' },
  otro: { name: 'Mi Negocio', description: 'Qué haces y para quién.', service: 'Servicio principal', bio: '5 años de experiencia.' },
};

export function examplesFor(kind: string | null | undefined): KindExamples {
  return EXAMPLES[kind ?? ''] ?? EXAMPLES['otro'];
}
