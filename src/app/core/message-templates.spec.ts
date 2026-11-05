import { describe, expect, it } from 'vitest';

import { defaultText, fillTemplate, firstName, whatsappLink } from './message-templates';

describe('fillTemplate', () => {
  it('llena las variables', () => {
    expect(fillTemplate('Hola {nombre}, tu cita de {servicio} es a las {hora}.', { nombre: 'Ana', servicio: 'Corte', hora: '10:00' }))
      .toBe('Hola Ana, tu cita de Corte es a las 10:00.');
  });

  it('quita la línea de un dato que falta', () => {
    expect(fillTemplate('Listo.\nAquí puedes verla: {enlace}\n¡Te esperamos!', {})).toBe('Listo.\n¡Te esperamos!');
  });

  it('sin nombre acomoda la puntuación en vez de quitar el saludo', () => {
    expect(fillTemplate('¡Hola {nombre}! Se liberó un horario.', {})).toBe('¡Hola! Se liberó un horario.');
    expect(fillTemplate('Hola {nombre}, mañana hay lugar.', {})).toBe('Hola, mañana hay lugar.');
  });

  it('no deja más de una línea en blanco seguida', () => {
    expect(fillTemplate('Uno\n\n{enlace}\n\nDos', {})).toBe('Uno\n\nDos');
  });

  it('el recordatorio de fábrica sin enlace sigue completo', () => {
    const text = fillTemplate(defaultText('reminder'), { nombre: 'Ana', cuando: 'mañana', negocio: 'Salón', servicio: 'Corte', dia: 'jueves', hora: '10:00', equipo: 'Bety' });
    expect(text).toContain('Hola Ana 👋 Te recordamos tu cita de mañana en Salón:');
    expect(text).not.toContain('{');
    expect(text.endsWith('¡Te esperamos!')).toBe(true);
  });
});

describe('recibo de pago', () => {
  it('muestra anticipo y propina cuando los hay', () => {
    const text = fillTemplate(defaultText('receipt'), { nombre: 'Ana', negocio: 'Salón', servicio: 'Corte', dia: 'jueves 29 de octubre', precio: '$450', anticipo: '$150', propina: '$50', total: '$500', metodo: 'Efectivo' });
    expect(text).toContain('Anticipo que ya habías pagado: $150');
    expect(text).toContain('Propina: $50');
    expect(text).toContain('Total pagado: $500');
    expect(text).not.toContain('{');
  });

  it('sin anticipo ni propina quita esas líneas en lugar de dejarlas vacías', () => {
    const text = fillTemplate(defaultText('receipt'), { nombre: 'Ana', negocio: 'Salón', servicio: 'Corte', dia: 'jueves', precio: '$450', total: '$450', metodo: 'Tarjeta' });
    expect(text).not.toContain('Anticipo');
    expect(text).not.toContain('Propina');
    expect(text).toContain('Total pagado: $450');
  });
});

describe('whatsappLink', () => {
  it('antepone 52 a números de 10 dígitos', () => {
    expect(whatsappLink('55 1234 5678', 'Hola')).toBe('https://wa.me/525512345678?text=Hola');
    expect(whatsappLink('525512345678', 'Hola')).toBe('https://wa.me/525512345678?text=Hola');
    expect(whatsappLink(null, 'Hola')).toBe('https://wa.me/?text=Hola');
  });
});

describe('firstName', () => {
  it('toma el nombre de pila', () => {
    expect(firstName('  María José López ')).toBe('María');
  });
});

describe('MESSAGE_MOMENTS', () => {
  it('cada mensaje está en un solo momento', async () => {
    const { MESSAGE_MOMENTS, MESSAGE_TEMPLATES } = await import('./message-templates');
    const keys = MESSAGE_MOMENTS.flatMap((moment) => [...moment.keys]);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(MESSAGE_TEMPLATES.map((template) => template.key).sort());
  });
});
