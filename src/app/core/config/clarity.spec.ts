import { loadClarity } from './clarity';

describe('loadClarity', () => {
  afterEach(() => document.getElementById('clarity-script')?.remove());

  it('no carga nada sin ID o con un ID inválido', () => {
    loadClarity('');
    loadClarity('<script>');
    expect(document.getElementById('clarity-script')).toBeNull();
  });

  it('carga el script una sola vez', () => {
    loadClarity('abcd123456');
    loadClarity('abcd123456');
    expect(document.querySelectorAll('#clarity-script').length).toBe(1);
    expect(document.getElementById('clarity-script')?.getAttribute('src')).toBe('https://www.clarity.ms/tag/abcd123456');
  });
});
