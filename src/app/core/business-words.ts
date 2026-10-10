export interface BusinessWords {
  person: string;
  people: string;
  client: string;
  clients: string;
  visit: string;
  pet: boolean;
}

const BY_LABEL: Record<string, BusinessWords> = {
  Estilista: words('Estilista', 'Estilistas', 'Cliente', 'Clientes', 'Cita', false),
  Barbero: words('Barbero', 'Barberos', 'Cliente', 'Clientes', 'Cita', false),
  Terapeuta: words('Terapeuta', 'Terapeutas', 'Cliente', 'Clientes', 'Cita', false),
  Veterinario: words('Veterinario', 'Veterinarios', 'Tutor', 'Tutores', 'Cita', true),
  Especialista: words('Especialista', 'Especialistas', 'Paciente', 'Pacientes', 'Cita', false),
  Dentista: words('Dentista', 'Dentistas', 'Paciente', 'Pacientes', 'Cita', false),
  Profesional: words('Profesional', 'Profesionales', 'Cliente', 'Clientes', 'Cita', false),
  Instructor: words('Instructor', 'Instructores', 'Alumno', 'Alumnos', 'Clase', false),
};

export function businessWords(label: string | null | undefined): BusinessWords {
  return BY_LABEL[label?.trim() ?? ''] ?? words(label?.trim() || 'Colaborador', 'Colaboradores', 'Cliente', 'Clientes', 'Cita', false);
}

function words(person: string, people: string, client: string, clients: string, visit: string, pet: boolean): BusinessWords {
  return { person, people, client, clients, visit, pet };
}
