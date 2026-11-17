import { describe, expect, it } from 'vitest';
import { NewsItem, WHATS_NEW, newsText, unseenNews } from './whats-new';

const item = (id: string): NewsItem => ({ id, date: '2026-11-17', title: id, text: 'Tus {clientes} lo ven.', icon: 'campaign' });
const items = [item('c'), item('b'), item('a')];

describe('unseenNews', () => {
  it('si nunca marcó nada, muestra las más recientes', () => {
    expect(unseenNews(null, items).map((n) => n.id)).toEqual(['c', 'b', 'a']);
    expect(unseenNews(undefined, items)).toHaveLength(3);
  });

  it('solo las posteriores a la última que vio', () => {
    expect(unseenNews('b', items).map((n) => n.id)).toEqual(['c']);
    expect(unseenNews('c', items)).toEqual([]);
  });

  it('una clave que ya no existe muestra todo, con tope', () => {
    expect(unseenNews('zzz', [...items, item('d')])).toHaveLength(3);
  });

  it('las novedades reales tienen claves únicas', () => {
    expect(new Set(WHATS_NEW.map((n) => n.id)).size).toBe(WHATS_NEW.length);
  });
});

describe('newsText', () => {
  it('nombra a quien reserva según el giro', () => {
    expect(newsText(item('a'), 'Pacientes')).toBe('Tus pacientes lo ven.');
  });
});
