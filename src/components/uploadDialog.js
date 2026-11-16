// Every "Upload dataset" button ([data-open-upload], optionally with a job ID) and the `acurion:open-upload`
// event open the upload flow, which grows out of the header pill (src/islands/upload-panel.tsx).
import { requestUpload } from '../lib/uploadFlow.js';

export function installUploadDialog() {
  document.addEventListener('click', event => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-open-upload]') : null;
    if (trigger) { event.preventDefault(); requestUpload(trigger.dataset.openUpload || undefined); }
  });
  document.addEventListener('acurion:open-upload', event => requestUpload(event.detail?.jobId));
}
