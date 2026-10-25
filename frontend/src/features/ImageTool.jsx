import { useEffect, useState } from "react";
import { Button, Empty, ErrorBox, Field, Panel, ResultMeta, Spinner, Textarea, useRequest } from "../ui";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

/** Shared upload form for the two image features. `render(data)` draws the feature-specific result. */
export default function ImageTool({ endpoint, buttonLabel, descriptionLabel, descriptionHint, disclaimer, render }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState("");
  const [localError, setLocalError] = useState(null);
  const [inputKey, setInputKey] = useState(0);   // remounting the <input> lets the same file be chosen again
  const { run, reset, loading, error, result } = useRequest();

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    setLocalError(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) { setLocalError("Please choose a JPG, PNG or WebP image."); setFile(null); setPreview(null); return; }
    if (f.size > MAX_BYTES) { setLocalError(`That image is ${kb(f.size)}. The limit is 8 MB; please choose a smaller one.`); setFile(null); setPreview(null); return; }
    reset();
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const submit = (e) => {
    e.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    if (description.trim()) form.append("description", description.trim());
    run(endpoint, { form });
  };
  const another = () => {
    reset(); setFile(null); setPreview(null); setDescription(""); setLocalError(null); setInputKey((k) => k + 1);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <Panel title="Upload photo">
        <form onSubmit={submit} className="space-y-3">
          <input key={inputKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick}
            aria-label="Choose an image" className="block w-full text-sm" />
          <ErrorBox message={localError} />
          {preview && (
            <figure>
              <img src={preview} alt="Selected upload" className="max-h-56 rounded border border-line" />
              <figcaption className="mt-1 text-sm text-mute">{file.name} ({kb(file.size)})</figcaption>
            </figure>)}
          <Field label={descriptionLabel} hint={descriptionHint}>
            <Textarea rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!file} loading={loading}>{buttonLabel}</Button>
            {(file || result || error) && <Button type="button" secondary onClick={another}>Analyse a different image</Button>}
          </div>
        </form>
        <p className="mt-4 text-sm text-mute">{disclaimer}</p>
      </Panel>
      <div className="space-y-4">
        <ErrorBox message={error} />
        {loading && <Panel><span className="flex items-center gap-3"><Spinner /> Analysing the image with AI. This can take up to a minute…</span></Panel>}
        {!loading && !result && !error && <Empty>Choose a JPG, PNG or WebP photo (up to 8 MB), optionally add a description, then run the analysis.</Empty>}
        {result && <Panel><ResultMeta result={result} />{render(result.data || {})}</Panel>}
      </div>
    </div>
  );
}
