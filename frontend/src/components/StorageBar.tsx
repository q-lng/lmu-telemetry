interface Props {
  usedBytes: number;
  quotaBytes: number;
}

/** Shared with SessionPickerModal's storage footer — same bar, same fill/
 * full-state classes, just dropped into wherever usage needs a quick visual
 * (no wrapping label/text here, callers add their own). */
export function StorageBar({ usedBytes, quotaBytes }: Props) {
  const pct = Math.min(100, (usedBytes / quotaBytes) * 100);
  const full = usedBytes >= quotaBytes;
  return (
    <div className="modal-storage-bar">
      <div className={`modal-storage-bar-fill${full ? ' modal-storage-bar-full' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
