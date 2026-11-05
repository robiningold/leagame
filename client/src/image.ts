/** Bild verkleinern (max. 1600px, JPEG), damit es in die Datenbank passt */
export async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error('Bild konnte nicht gelesen werden.'));
      i.src = url;
    });
    let max = 1600;
    let q = 0.82;
    for (let attempt = 0; attempt < 6; attempt++) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * k);
      cv.height = Math.round(img.naturalHeight * k);
      cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
      const data = cv.toDataURL('image/jpeg', q);
      if (data.length < 900_000) return data;
      max = Math.round(max * 0.8);
      q = Math.max(0.6, q - 0.06);
    }
    throw new Error('Bild ist zu gross.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

