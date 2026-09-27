export function cropStyles(crop) {
  if (!crop || ![crop.x, crop.y, crop.width, crop.height, crop.naturalWidth, crop.naturalHeight].every(Number.isFinite) || crop.x < 0 || crop.y < 0 || crop.width < 1 || crop.height < 1 || crop.x + crop.width > 100.01 || crop.y + crop.height > 100.01 || crop.naturalWidth <= 0 || crop.naturalHeight <= 0) return null
  return {
    frame: { display: 'block', position: 'relative', overflow: 'hidden', aspectRatio: `${crop.naturalWidth * crop.width} / ${crop.naturalHeight * crop.height}`, borderRadius: 'inherit' },
    image: { position: 'absolute', width: `${10000 / crop.width}%`, height: `${10000 / crop.height}%`, maxWidth: 'none', maxHeight: 'none', left: `${-100 * crop.x / crop.width}%`, top: `${-100 * crop.y / crop.height}%`, objectFit: 'fill', margin: 0 },
  }
}
