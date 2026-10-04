/** The supplied artwork is kept intact and shared by every branded surface. */
export function BrandLogo({ className = '', decorative = false, priority = false }: {
  className?: string;
  decorative?: boolean;
  priority?: boolean;
}) {
  return <img
    className={`brand-logo ${className}`}
    src='/brand/agent-deathmatch-logo.png'
    alt={decorative ? '' : 'Agent Deathmatch'}
    aria-hidden={decorative || undefined}
    width={2172}
    height={724}
    fetchPriority={priority ? 'high' : undefined}
    draggable={false}
  />;
}
