/** Foto cuadrada lista para guardar (JPG de 160 px, recortada al centro) a partir de un archivo que la persona eligió. */
export const MAX_PHOTO_CHARS = 180000;

export class PhotoError extends Error {}

export function squarePhotoFromFile(file: File, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new PhotoError('Elige una imagen (JPG o PNG).'));
      return;
    }
    const preview = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(preview);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new PhotoError('No pudimos preparar la foto. Prueba con otra.'));
        return;
      }
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      const data = canvas.toDataURL('image/jpeg', 0.72);
      if (data.length > MAX_PHOTO_CHARS) {
        reject(new PhotoError('Esa foto es demasiado pesada. Prueba con otra.'));
        return;
      }
      resolve(data);
    };
    image.onerror = () => {
      URL.revokeObjectURL(preview);
      reject(new PhotoError('No pudimos leer esa foto. Prueba con otra (JPG o PNG).'));
    };
    image.src = preview;
  });
}
