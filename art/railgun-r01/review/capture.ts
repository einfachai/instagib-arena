// Authoring-only compositing: include the live SVG and the same masked peripheral
// blur in captures (canvas.captureStream alone omits DOM overlays).
export async function compositeScope(canvas: HTMLCanvasElement, scope: HTMLElement, capture: HTMLCanvasElement) {
  capture.width = canvas.width; capture.height = canvas.height;
  const ctx = capture.getContext('2d')!; ctx.drawImage(canvas, 0, 0);
  if (scope.hidden) return;
  const peripheral = scope.querySelector<HTMLElement>('.r01-scope-peripheral')!;
  const px = canvas.width / canvas.clientWidth;
  const blur = Number.parseFloat(peripheral.style.backdropFilter.replace('blur(', ''));
  const dimensions = peripheral.style.maskImage.match(/([\d.-]+)px/g)?.map(v => Number.parseFloat(v) * px);
  if (!peripheral.hidden && blur > 0 && dimensions?.length === 4) {
    const [rx, ry, x, y] = dimensions;
    const layer = document.createElement('canvas'); layer.width = canvas.width; layer.height = canvas.height;
    const c = layer.getContext('2d')!; c.filter = `blur(${blur * px}px)`; c.drawImage(canvas, 0, 0); c.filter = 'none';
    c.globalCompositeOperation = 'destination-in'; c.translate(x, y); c.scale(rx, ry);
    const mask = c.createRadialGradient(0, 0, .8, 0, 0, 1.1); mask.addColorStop(0, 'transparent'); mask.addColorStop(1, '#000');
    c.fillStyle = mask; c.fillRect(-canvas.width / rx, -canvas.height / ry, 2 * canvas.width / rx, 2 * canvas.height / ry);
    ctx.drawImage(layer, 0, 0);
  }
  const svg = scope.querySelector('svg')!.cloneNode(true) as SVGSVGElement;
  svg.setAttribute('width', String(canvas.width)); svg.setAttribute('height', String(canvas.height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], {type: 'image/svg+xml'}));
  try { const img = new Image(); img.src = url; await img.decode(); ctx.drawImage(img, 0, 0); }
  finally { URL.revokeObjectURL(url); }
}
export function png(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas capture failed'))));
}
