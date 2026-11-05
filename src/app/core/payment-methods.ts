/** Métodos de pago que puede aceptar un negocio (mismo orden que app/core/payment_methods.py). */
export const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo', icon: 'payments' },
  { value: 'transferencia', label: 'Transferencia', icon: 'account_balance' },
  { value: 'tarjeta', label: 'Tarjeta', icon: 'credit_card' },
] as const;

export const ALL_METHODS: string[] = PAYMENT_METHODS.map((item) => item.value);

/** Etiquetas también para lo que no se elige en Configuración (paquete, cobros sin método). */
export const METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  paquete: 'Paquete',
  sin_registrar: 'Sin registrar',
};

/** "efectivo, transferencia y tarjeta" para la página de reservas. */
export function methodsSentence(methods: readonly string[] | null | undefined): string {
  const names = PAYMENT_METHODS.filter((item) => (methods?.length ? methods : ALL_METHODS).includes(item.value)).map((item) => item.label.toLowerCase());
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : (names[0] ?? '');
}
