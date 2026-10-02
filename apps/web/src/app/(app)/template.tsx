// Re-mounted on every navigation between app pages: a short fade-rise so the page change reads as a transition
// (CSS only; switched off by prefers-reduced-motion).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-enter space-y-6">{children}</div>;
}
