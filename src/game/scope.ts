import './scope.css';
import type { ScopeFrame } from './scope-transition';
import type { ScopeProjection } from './scope-pose';

// Authored vector optic: no texture download, extra render pass, or resolution
// dependence. The clear aperture and aim point remain exactly viewport-centred.
export const SCOPE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-800 -450 1600 900" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="r01-bezel" x1="0" y1="-390" x2="0" y2="390" gradientUnits="userSpaceOnUse">
      <stop stop-color="#667480"/><stop offset=".12" stop-color="#202b34"/><stop offset=".52" stop-color="#080e14"/><stop offset="1" stop-color="#3e505d"/>
    </linearGradient>
    <radialGradient id="r01-glass">
      <stop offset=".6" stop-color="#001523" stop-opacity="0"/><stop offset=".92" stop-color="#002334" stop-opacity=".08"/><stop offset="1" stop-color="#001019" stop-opacity=".6"/>
    </radialGradient>
  </defs>
  <g data-scope-aperture="">
  <path data-scope-mask="" fill="#03070b" fill-rule="evenodd" d="M-100000-100000H100000V100000H-100000Z M-320-370H320L465-225V225L320 370H-320L-465 225V-225Z"/>
  <g data-scope-rim="">
  <path d="M-320-370H320L465-225V225L320 370H-320L-465 225V-225Z" fill="url(#r01-glass)" stroke="url(#r01-bezel)" stroke-width="22"/>
  <path d="M-313-355H313L450-218V218L313 355H-313L-450 218V-218Z" stroke="#142732" stroke-width="5"/>
  <path d="M-312-354H312L449-217V217L312 354H-312L-449 217V-217Z" stroke="#91d6ed" stroke-opacity=".5"/>
  <g stroke="#1594ff" stroke-width="3">
    <path d="M-235-367H-90 M90-367H235 M-235 367H-90 M90 367H235"/>
    <path d="M-461-150V-60 M-461 60V150 M461-150V-60 M461 60V150"/>
  </g>
  <g stroke="#b5c2cc" stroke-opacity=".45">
    <path d="M-367-320l-12 12m12 0l-12-12 M367-320l12 12m-12 0l12-12 M-367 320l-12-12m12 0l-12 12 M367 320l12-12m-12 0l12 12"/>
    <path d="M-482-190v380 M482-190v380 M-285-394h570 M-285 394h570"/>
  </g>
  </g>
  </g>
  <g data-scope-reticle="">
  <g stroke="#09151b" stroke-width="4" opacity=".7">
    <path d="M-350 0H-22 M22 0H350 M0-255V-22 M0 22V255"/>
  </g>
  <g stroke="#b5e8f5" stroke-width="1.2" opacity=".8">
    <path d="M-350 0H-22 M22 0H350 M0-255V-22 M0 22V255"/>
    <path d="M-240-8v16m60-13v10m60-13v16m60-13v10 M60-5v10m60-13v16m60-13v10m60-13v16 M-5-60h10m-13-60h16m-13-60h10 M-5 60h10m-13 60h16m-13 60h10"/>
  </g>
  <g stroke="#65d9ff" stroke-width="1.6">
    <path d="M-12-6v-6h6 M6-12h6v6 M12 6v6H6 M-6 12h-6V6"/>
    <path d="M-330-275h28m-14-5v10 M302-275h28m-14-5v10" opacity=".5"/>
  </g>
  <circle r="2.2" fill="#adf1ff" stroke="#062130" stroke-width="1"/>
  <g fill="#a3c9da" font-family="monospace" text-anchor="middle" font-size="12" letter-spacing="3">
    <text y="-303">R-01 <tspan fill="#548496"> / </tspan> OPTICAL LINK</text>
    <text data-scope-magnification="" y="-279" font-size="17" letter-spacing="2">1.0×</text>
    <text data-scope-status="" y="292" font-size="11">READY</text>
    <text x="-137" y="22" font-size="9" opacity=".6">2</text>
    <text x="137" y="22" font-size="9" opacity=".6">2</text>
    <text x="-257" y="22" font-size="9" opacity=".6">4</text>
    <text x="257" y="22" font-size="9" opacity=".6">4</text>
  </g>
  <path d="M-80 310H80 M-80 315H80" stroke="#173f53" stroke-width="2"/>
  <path data-scope-charge="" d="M-80 310H80 M-80 315H80" stroke="#50c9ff" stroke-width="2"/>
</g>
</svg>`;

export function scopeMagnification(baseFov: number, currentFov: number): number {
  return Math.tan(baseFov * Math.PI / 360) / Math.tan(currentFov * Math.PI / 360);
}

export class ScopeOverlay {
  readonly element = document.createElement('div');
  private readonly parent: HTMLElement | null;
  private readonly magnification: SVGTextElement;
  private readonly status: SVGTextElement;
  private readonly charge: SVGPathElement;
  private readonly aperture: SVGGElement;
  private readonly mask: SVGPathElement;
  private readonly rim: SVGGElement;
  private readonly reticle: SVGGElement;
  private readonly blur: HTMLDivElement;
  private readonly resize: ResizeObserver;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.element.className = 'r01-scope';
    this.element.hidden = true;
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = '<div class="r01-scope-peripheral"></div>' + SCOPE_SVG;
    this.parent = canvas.parentElement;
    canvas.insertAdjacentElement('afterend', this.element);
    this.magnification = this.element.querySelector('[data-scope-magnification]')!;
    this.status = this.element.querySelector('[data-scope-status]')!;
    this.charge = this.element.querySelector('[data-scope-charge]')!;
    this.aperture = this.element.querySelector('[data-scope-aperture]')!;
    this.mask = this.element.querySelector('[data-scope-mask]')!;
    this.rim = this.element.querySelector('[data-scope-rim]')!;
    this.reticle = this.element.querySelector('[data-scope-reticle]')!;
    this.blur = this.element.querySelector('.r01-scope-peripheral')!;
    this.width = canvas.clientWidth; this.height = canvas.clientHeight;
    this.resize = new ResizeObserver(([entry]) => {
      this.width = entry.contentRect.width; this.height = entry.contentRect.height;
    });
    this.resize.observe(canvas);
  }

  update(frame: ScopeFrame, baseFov: number, currentFov: number, charge: number,
    projection: ScopeProjection = { x: 0, y: 0, scale: 0.1 }, calm = false) {
    const active = frame.progress > 0;
    this.element.hidden = !active;
    // Keep the hip reticle until its scoped replacement is legible; neither
    // moves away from the authoritative centre of aim during the handoff.
    this.parent?.classList.toggle('r01-scoped', frame.reticle > 0.1);
    if (!active) return;
    const blend = frame.handoff;
    const x = projection.x * (1 - blend), y = projection.y * (1 - blend);
    const scale = projection.scale + (1 - projection.scale) * blend;
    this.aperture.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
    this.mask.setAttribute('opacity', String(frame.darkness));
    this.rim.setAttribute('opacity', String(frame.rim));
    this.reticle.setAttribute('opacity', String(frame.reticle));
    const unit = Math.min(this.width / 1600, this.height / 900);
    const style = this.blur.style;
    const blur = calm ? 0 : frame.blur;
    this.blur.hidden = blur < 0.01;
    if (blur >= 0.01) {
      style.backdropFilter = `blur(${blur.toFixed(2)}px)`;
      style.setProperty('-webkit-backdrop-filter', style.backdropFilter);
      // While the sight is still off-centre, keep the authoritative aim point
      // inside the sharp region too. The focus area contracts onto the optic
      // as it centres, then expands with the scope handoff.
      const rx = 465 * scale, ry = 370 * scale;
      const focus = Math.max(1, (Math.hypot(x / rx, y / ry) + 32 / ry) / 0.8);
      style.maskImage = `radial-gradient(ellipse ${rx * focus * unit}px ${ry * focus * unit}px at ${this.width / 2 + x * unit}px ${this.height / 2 + y * unit}px, transparent 80%, black 110%)`;
    }
    const ready = Math.max(0, Math.min(1, charge));
    const magnification = `${scopeMagnification(baseFov, currentFov).toFixed(1)}×`;
    const status = ready >= 1 ? 'READY' : `RECHARGING  ${Math.floor(ready * 100)}%`;
    if (this.magnification.textContent !== magnification) this.magnification.textContent = magnification;
    if (this.status.textContent !== status) this.status.textContent = status;
    this.charge.setAttribute('transform', `translate(-80 0) scale(${ready} 1) translate(80 0)`);
  }

  dispose() {
    this.resize.disconnect();
    this.element.remove();
    this.parent?.classList.remove('r01-scoped');
  }
}
