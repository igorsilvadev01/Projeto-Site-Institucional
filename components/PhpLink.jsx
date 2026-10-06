"use client";

// Páginas exportadas são atendidas pelo Apache; relatórios têm IDs criados pelo PHP.
export default function PhpLink({ href, prefetch, replace, scroll, ...props }) {
  return <a href={href} {...props} />;
}
