/** Trigger a browser file download from a Blob, then revoke the object URL. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Defer revoke so the browser has time to queue the download before the URL is freed.
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
