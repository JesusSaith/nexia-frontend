import { BetaRequestItem } from '@core/models/platform-business.model';

import { weekOneMessages, whatsappUrl } from './beta-messages';

const item = { id: 1, name: 'Rosa Pérez', email: 'rosa@example.com', phone: '5512345678', business_name: 'Estudio Rosa', kind: 'belleza', message: null, people: null, source: null, status: 'registrada', created_at: '2026-11-01T10:00:00' } as BetaRequestItem;

describe('beta-messages', () => {
  it('arma los tres mensajes de la primera semana con el nombre', () => {
    const messages = weekOneMessages(item);
    expect(messages.map((m) => m.day)).toEqual([1, 3, 7]);
    expect(messages.every((m) => m.text.includes('Rosa'))).toBe(true);
  });

  it('el enlace de WhatsApp lleva la clave de México y el texto codificado', () => {
    expect(whatsappUrl('5512345678', 'Hola ¿qué tal?')).toBe('https://wa.me/525512345678?text=Hola%20%C2%BFqu%C3%A9%20tal%3F');
  });
});
