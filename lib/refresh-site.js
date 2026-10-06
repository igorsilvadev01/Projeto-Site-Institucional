export function refreshSite(router) {
  if (process.env.NEXT_PUBLIC_HOSTGATOR === "true") window.dispatchEvent(new Event("portfolio:refresh"));
  else router.refresh();
}
