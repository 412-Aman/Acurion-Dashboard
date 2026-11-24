// The Acurion logo as inline SVG: the mark (navy peak, navy stroke, teal flow) and the ACURION wordmark.
// Navy parts use currentColor, so the logo turns light on navy backgrounds; the teal stays the brand teal.
const TEAL = '#17998c';

const MARK_PATHS = `<g stroke-linejoin="round" stroke-width="6">`
  + `<path fill="currentColor" stroke="currentColor" d="M65 255 178 96h66l71 91h-51l-43-58L96 300Z"/>`
  + `<path fill="currentColor" stroke="currentColor" d="M123 298 193 201h54l-69 97Z"/>`
  + `<path fill="${TEAL}" stroke="${TEAL}" d="M172 312h46l74-108h40l35 46h-49l-64 90h-64Z"/></g>`;

const WORD_PATHS = `<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round">`
  + `<path d="M420 252 482 156h11l62 96h-25l-42.5-66L445 252Z"/>`
  + `<path d="M672.7 178A52.5 48.5 0 1 0 672.7 229H642.5A32.5 28.5 0 1 1 642.5 178Z"/>`
  + `<path d="M700 155h20v48a30 29 0 0 0 60 0v-48h20v48a50 49 0 0 1-100 0Z"/>`
  + `<path d="M835 155h53a32.5 32.5 0 0 1 9 63.7L923 252h-25l-24.5-32H855v32h-20Zm20 20v25h33a12.5 12.5 0 0 0 0-25Z"/>`
  + `<path d="M955 155h20v97h-20Z"/>`
  + `<path fill-rule="evenodd" d="M1057.5 155a52.5 48.5 0 1 1 0 97a52.5 48.5 0 1 1 0-97Zm0 20a32.5 28.5 0 1 0 0 57a32.5 28.5 0 1 0 0-57Z"/>`
  + `<path d="M1135 252V155h23l44 61v-61h20v97h-23l-44-61v61Z"/></g>`;

/** The mark alone. `size` is its height in px. */
export function brandMark(size = 28) {
  const width = Math.round(size * 316 / 258);
  return `<svg class="brand-mark" viewBox="60 90 316 258" width="${width}" height="${size}" aria-hidden="true" focusable="false">${MARK_PATHS}</svg>`;
}

/** The wordmark alone, sized to sit beside a mark of height `size`. */
export function brandWord(size = 28) {
  const height = Math.round(size * 0.4 * 100) / 100;
  const width = Math.round(height * 806 / 101 * 100) / 100;
  return `<svg class="brand-word" viewBox="418 153 806 101" width="${width}" height="${height}" role="img" aria-label="Acurion" focusable="false">${WORD_PATHS}</svg>`;
}

/** Mark and wordmark side by side, as in the logo. */
export function brandLockup(size = 28) {
  return `<span class="brand-lockup" style="--brand-size:${size}px">${brandMark(size)}${brandWord(size)}</span>`;
}
