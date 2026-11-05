export interface TourStep {
  /** Qué elemento se resalta (`data-tour="…"` en la pantalla). Si no está a la vista, el globo sale sin resaltar nada. */
  target: string;
  title: string;
  text: string;
}

/** Los tres globos de la Agenda; en celular se habla del botón + y de deslizar, en escritorio de los huecos y las flechas. */
export function agendaTourSteps(handset: boolean, visit: string): TourStep[] {
  const lower = visit.toLowerCase();
  return [
    handset
      ? { target: 'nueva', title: `Agendar una ${lower}`, text: `Toca el botón + para agendar a mano, por ejemplo cuando alguien te escribe por WhatsApp.` }
      : { target: 'nueva', title: `Agendar una ${lower}`, text: `Toca "Nueva ${lower}" o cualquier hueco libre de la agenda para agendar a mano.` },
    { target: 'cita', title: 'Cobrar y cambiar', text: `Toca una ${lower} para ver su ficha: cobrarla, moverla, cancelarla o escribirle por WhatsApp.` },
    handset
      ? { target: 'dia', title: 'Cambiar de día', text: 'Desliza a los lados para ir al día anterior o al siguiente.' }
      : { target: 'navegar', title: 'Cambiar de día', text: 'Usa las flechas y "Hoy" para moverte. Arriba eliges Mes, Semana o Día.' },
  ];
}

export function tourStorageKey(id: string): string {
  return `nexia-tour-${id}`;
}

/** Siguiente paso, o null si ya era el último. */
export function nextTourStep(index: number, total: number): number | null {
  return index + 1 < total ? index + 1 : null;
}
