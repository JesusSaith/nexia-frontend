const WITH_CENTS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const WHOLE = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

/** "$250" si es entero y "$250.50" si trae centavos: el mismo formato en la página pública y en el panel. */
export function pesos(amount: number): string {
  return Number.isInteger(amount) ? WHOLE.format(amount) : WITH_CENTS.format(amount);
}
