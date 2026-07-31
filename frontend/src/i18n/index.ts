import { en } from './en';

type Dict = typeof en;
type ParamsFor<K extends keyof Dict> = Dict[K] extends (p: infer P) => string ? P : undefined;

/** Ties each key to its required interpolation params at the type level — a call
 * like t('lap.number') without {n} is a compile error, not a runtime crash. */
export function t<K extends keyof Dict>(
  key: K,
  ...args: ParamsFor<K> extends undefined ? [] : [ParamsFor<K>]
): string {
  const entry = en[key];
  return typeof entry === 'function' ? (entry as (p: unknown) => string)(args[0]) : (entry as string);
}

/** Translates a stable error code from the backend (e.g. "EMAIL_ALREADY_USED") into
 * English UI text. Unknown/undefined codes (including native browser/WASM error
 * messages, which never match a code) fall back to a generic message rather than
 * ever showing a raw code or leaking implementation detail to the user. */
export function tError(code: string | undefined): string {
  if (!code) return en['errors.UNKNOWN'];
  const key = `errors.${code}` as keyof Dict;
  const entry = en[key] as string | undefined;
  return entry ?? en['errors.UNKNOWN'];
}
