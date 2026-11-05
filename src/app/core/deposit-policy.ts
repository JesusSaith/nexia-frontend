/** Qué pasa con el anticipo si el cliente cancela: lo que dice la dueña en Configuración, en una frase clara. */
export type DepositCancelPolicy = 'refund' | 'keep';

/** "1 día", "2 días", "12 horas": el plazo para cancelar, dicho como lo diría una persona. */
export function cancelWindow(hours: number | null | undefined): string {
  if (!hours) {
    return '';
  }
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '1 día' : `${days} días`;
  }
  return hours === 1 ? '1 hora' : `${hours} horas`;
}

export function depositPolicyText(policy: DepositCancelPolicy | null | undefined, cancelHours: number | null | undefined): string {
  const window = cancelWindow(cancelHours);
  if (policy === 'keep') {
    return 'Si cancelas, el anticipo no se devuelve.';
  }
  const early = window ? `con al menos ${window} de anticipación` : 'antes de que empiece';
  return `Si cancelas ${early}, te devolvemos el anticipo. Si no llegas, no se devuelve.`;
}

/** Por qué se pidió un anticipo que el servicio no lleva. */
export function depositReasonText(reason: string | null | undefined): string {
  return reason === 'repeat_no_show' ? 'Te pedimos este anticipo porque en citas anteriores no pudiste asistir.' : '';
}
