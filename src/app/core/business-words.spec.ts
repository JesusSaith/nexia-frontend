import { describe, expect, it } from 'vitest';
import { businessWords } from './business-words';

describe('businessWords', () => {
  it('cada giro habla con sus palabras', () => {
    expect(businessWords('Dentista')).toMatchObject({ person: 'Dentista', people: 'Dentistas', client: 'Paciente' });
    expect(businessWords('Barbero')).toMatchObject({ person: 'Barbero', people: 'Barberos', client: 'Cliente' });
    expect(businessWords('Veterinario')).toMatchObject({ client: 'Tutor', pet: true });
  });

  it('las uñas tienen su propio plural (antes salía "Colaboradores")', () => {
    expect(businessWords('Manicurista')).toMatchObject({ person: 'Manicurista', people: 'Manicuristas' });
  });

  it('sin giro, o con un nombre propio, se usa un lenguaje neutro', () => {
    expect(businessWords(null)).toMatchObject({ person: 'Colaborador', people: 'Colaboradores', client: 'Cliente' });
    expect(businessWords('  ')).toMatchObject({ person: 'Colaborador' });
    expect(businessWords('Tatuador')).toMatchObject({ person: 'Tatuador', people: 'Colaboradores' });
  });
});
