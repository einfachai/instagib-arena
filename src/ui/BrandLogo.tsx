import { pluginAgent } from '../agent-session';

/** The supplied artwork is kept intact and shared by every branded surface. */
export function BrandLogo({ className = '', decorative = false, priority = false }: {
  className?: string;
  decorative?: boolean;
  priority?: boolean;
}) {
  return <img
    className={`brand-logo ${pluginAgent ? 'brand-agent-logo ' : ''}${className}`}
    src={pluginAgent ? `/brand/agent-deathmatch-${pluginAgent}.png` : '/brand/agent-deathmatch-logo.png'}
    alt={decorative ? '' : 'Agent Deathmatch'}
    aria-hidden={decorative || undefined}
    width={pluginAgent ? 1254 : 2172}
    height={pluginAgent ? 1254 : 724}
    fetchPriority={priority ? 'high' : undefined}
    draggable={false}
  />;
}
