/**
 * Microsoft Clarity (grabaciones y mapas de calor gratis) solo para la landing.
 * Para activarlo, crea el proyecto en clarity.microsoft.com, copia su ID (10 letras y números) aquí y,
 * en Clarity > Settings > Masking, elige "Strict" para que nunca grabe lo que se escribe en el formulario.
 * Mientras el ID esté vacío no se carga nada.
 */
export const CLARITY_ID = '';

/** Carga el script de Clarity una sola vez; no hace nada sin ID ni fuera del navegador. */
export function loadClarity(id: string = CLARITY_ID): void {
  if (!id || !/^[a-z0-9]{8,12}$/i.test(id) || typeof document === 'undefined' || document.getElementById('clarity-script')) {
    return;
  }
  const script = document.createElement('script');
  script.id = 'clarity-script';
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${id}`;
  document.head.appendChild(script);
}
