import disposableDomains from "disposable-email-domains";
import wildcardDisposableDomains from "disposable-email-domains/wildcard.json";

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/^@+/, "");
}

export function getEmailDomain(email?: string | null) {
  const value = email?.trim().toLowerCase();
  const atIndex = value?.lastIndexOf("@") ?? -1;
  if (!value || atIndex <= 0 || atIndex === value.length - 1) return null;
  return normalizeDomain(value.slice(atIndex + 1));
}

export function getBlockedEmailDomains() {
  const configured = (process.env.BLOCKED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map(normalizeDomain)
    .filter(Boolean);
  return new Set([...(disposableDomains as string[]).map(normalizeDomain), ...configured]);
}

function isWildcardBlocked(domain: string) {
  return (wildcardDisposableDomains as string[])
    .map(normalizeDomain)
    .some((blockedDomain) => domain === blockedDomain || domain.endsWith(`.${blockedDomain}`));
}

export function isBlockedEmailDomain(email?: string | null) {
  const domain = getEmailDomain(email);
  if (!domain) return false;
  return getBlockedEmailDomains().has(domain) || isWildcardBlocked(domain);
}

export function getBlockedEmailMessage(email?: string | null) {
  const domain = getEmailDomain(email);
  return domain
    ? `Temporary email addresses are not allowed. Please use a permanent email instead of ${domain}.`
    : "Temporary email addresses are not allowed. Please use a permanent email.";
}
