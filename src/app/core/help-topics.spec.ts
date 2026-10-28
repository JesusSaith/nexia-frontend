import { describe, expect, it } from 'vitest';

import { businessWords } from './business-words';
import { helpTopics, topicForRoute } from './help-topics';

describe('helpTopics', () => {
  const topics = helpTopics(businessWords('Barbero'));

  it('encuentra el tema de la pantalla, ignorando parámetros', () => {
    expect(topicForRoute(topics, '/admin/agenda?cita=4')?.id).toBe('agenda');
    expect(topicForRoute(topics, '/admin/clientes')?.id).toBe('clientes');
  });

  it('no inventa un tema donde no hay', () => {
    expect(topicForRoute(topics, '/admin/bienvenida')).toBeNull();
    expect(topicForRoute(topics, '/admin/agendaextra')).toBeNull();
  });

  it('usa las palabras del giro', () => {
    const vet = helpTopics(businessWords('Veterinario')).find((topic) => topic.id === 'clientes');
    expect(vet?.title).toBe('Tutores');
  });

  it('cada tema tiene al menos un consejo y ninguno baja de 2 caracteres de título', () => {
    for (const topic of topics) {
      expect(topic.tips.length).toBeGreaterThan(0);
      expect(topic.title.length).toBeGreaterThan(1);
    }
  });
});
