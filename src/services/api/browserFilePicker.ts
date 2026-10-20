/** A cancelled picker is a completed operation, just like an empty selection. */
export function pickBrowserFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.hidden = true;
    let finished = false;
    const finish = (files: File[], error?: unknown) => {
      if (finished) return;
      finished = true;
      input.onchange = null;
      input.oncancel = null;
      input.remove();
      if (error) reject(error); else resolve(files);
    };
    input.onchange = () => finish(Array.from(input.files ?? []));
    input.oncancel = () => finish([]);
    document.body.append(input);
    try { input.click(); } catch (error) { finish([], error); }
  });
}
