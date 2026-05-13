export function getWhitelabelSlug() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const match = hostname.match(/^([a-z0-9-]+)\.tourit\.ca$/i);
  if (match && match[1].toLowerCase() !== "www") {
    return match[1].toLowerCase();
  }
  // Dev testing override: localStorage.setItem('__wl_slug', 'julieli')
  try {
    return localStorage.getItem("__wl_slug") || null;
  } catch {
    return null;
  }
}
