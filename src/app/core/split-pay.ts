/** Texto de un campo de dinero a número; vacío o inválido es null. */
export function toAmount(value: string | number | null | undefined): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const amount = Number(raw);
  return Number.isNaN(amount) || amount < 0 ? null : amount;
}

/** Formas de pago con las que se puede dividir: el resto de la cita va en una de estas y una parte en tarjeta. */
const SPLIT_BASE = ['efectivo', 'transferencia'];

/** ¿Se puede dividir el pago? Solo si el negocio acepta tarjeta y el resto va en efectivo o transferencia. */
export function canSplitPay(method: string, cardAccepted: boolean): boolean {
  return cardAccepted && SPLIT_BASE.includes(method);
}

/** Lo que se pagó con tarjeta de la cita (0 si no se divide). */
export function splitCardAmount(on: boolean, text: string, method: string, cardAccepted: boolean): number {
  return on && canSplitPay(method, cardAccepted) ? toAmount(text) ?? 0 : 0;
}

/** La parte con tarjeta debe ser positiva y menor a lo que falta de la cita (si no, es un cobro normal con tarjeta). */
export function splitProblem(on: boolean, text: string, method: string, cardAccepted: boolean, due: number): boolean {
  if (!on || !canSplitPay(method, cardAccepted)) {
    return false;
  }
  const card = splitCardAmount(on, text, method, cardAccepted);
  return card <= 0 || card >= Math.max(due, 0);
}

/** La propina con tarjeta solo aplica cuando la cita no fue ya con tarjeta y hubo propina. */
export function tipOnCard(on: boolean, tip: number, method: string, cardAccepted: boolean): boolean {
  return on && tip > 0 && canSplitPay(method, cardAccepted);
}
