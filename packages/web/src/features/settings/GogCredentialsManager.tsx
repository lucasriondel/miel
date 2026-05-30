import { useState } from "react";
import { Button } from "../../components/Button";
import { ApiError } from "../../api/client";
import { useUploadGogCredentials } from "../../api/mutations";

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const GogCredentialsManager = () => {
  const [json, setJson] = useState("");
  const upload = useUploadGogCredentials();

  const handleSubmit = () => {
    if (!json.trim()) return;
    upload.mutate(json.trim());
  };

  return (
    <div className="rounded border border-miel-line bg-miel-panel p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-miel-ink">Google OAuth client credentials</h3>
        <p className="text-xs text-miel-muted">
          Paste the contents of your <code>client_secret_*.json</code> file from Google Cloud Console.
          Required once to allow <code>gog</code> to authenticate Gmail accounts.
        </p>
      </div>

      <textarea
        className="w-full rounded border border-miel-line bg-miel-bg p-2 font-mono text-xs text-miel-ink placeholder:text-miel-muted resize-y min-h-[120px]"
        placeholder={'{\n  "installed": {\n    "client_id": "...",\n    ...\n  }\n}'}
        value={json}
        onChange={(e) => {
          setJson(e.target.value);
          upload.reset();
        }}
        spellCheck={false}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!json.trim() || upload.isPending}
        >
          {upload.isPending ? "Setting…" : "Set credentials"}
        </Button>
        {upload.isSuccess && (
          <span className="text-xs text-miel-ink">Credentials applied.</span>
        )}
        {upload.isError && (
          <span className="text-xs text-miel-high">{describeError(upload.error)}</span>
        )}
      </div>
    </div>
  );
};
