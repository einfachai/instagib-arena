import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { SessionEnded } from '../game/net';
import { returnToCodex } from '../codex-integration';
import { DeckButton } from '../deck';
import type { ProgressionResp } from '../app-types';
import './visit-results.css';
import { BrandLogo } from './BrandLogo';

const duration = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const REASONS = { manual: 'Visit finished', disconnected: 'Connection ended', idle: 'Visit ended for inactivity',
  completion: 'Your Codex task is complete. Back to work.', 'approval-required': 'Codex needs your approval.',
  'input-required': 'Codex needs your input.', 'terminal-error': 'Codex needs your attention.' };

export function VisitResults({ session, rewards, onMenu, reducedEffects = false }: { session: SessionEnded; rewards?: ProgressionResp | null; onMenu: () => void; reducedEffects?: boolean }) {
  const [seconds, setSeconds] = useState(5);
  const [handoffFailed, setHandoffFailed] = useState(false);
  const onMenuRef = useRef(onMenu); onMenuRef.current = onMenu;
  const overlayRef = useRef<HTMLDivElement>(null);
  const taskExit = !!session.event;
  useEffect(() => { overlayRef.current?.focus(); }, []);
  useEffect(() => {
    if (!taskExit) return;
    let active = true;
    const start = performance.now();
    const interval = setInterval(() => setSeconds(Math.max(0, Math.ceil((5000 - (performance.now() - start)) / 1000))), 100);
    const timeout = setTimeout(() => {
      void returnToCodex(session.stats.visitId).then(() => {
        if (active) onMenuRef.current();
      }).catch(() => { if (active) setHandoffFailed(true); });
    }, 5000);
    return () => { active = false; clearInterval(interval); clearTimeout(timeout); };
  }, [taskExit, session.stats.visitId]);
  const s = session.stats;
  const reward = rewards ?? session.rewards;
  const accuracy = s.shots ? Math.round(s.hits * 100 / s.shots) : 0;
  return (
    <div className='visit-debrief' data-task={taskExit ? '1' : '0'} data-reduced={reducedEffects ? '1' : '0'} ref={overlayRef}
      role='dialog' aria-modal='true' aria-label='Your arena visit' tabIndex={-1}
      onKeyDown={e => {
        if (e.key !== 'Tab') return;
        const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button, a[href]'));
        const first = controls[0], last = controls.at(-1);
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }}>
      <div className='visit-debrief__grid' aria-hidden='true' />
      <div className='visit-debrief__shell'>
        <header className='visit-debrief__header'>
          <div className='visit-debrief__eyebrow'><BrandLogo className='brand-debrief-logo' /><span className='brand-debrief-label'>Session debrief</span></div>
          <div className='visit-debrief__time'><span>Time in arena</span><strong>{duration(s.durationMs)}</strong></div>
        </header>
        <div className='visit-debrief__title'>
          <p className='visit-debrief__kicker'>Your run. Your results.</p>
          <h1>{taskExit ? 'Back to work' : 'Visit complete'}<span aria-hidden='true'>//</span></h1>
          <p className='visit-debrief__reason'>{REASONS[session.reason]}</p>
        </div>
        <section className='visit-debrief__primary' aria-label='Visit performance'>
          <div className='visit-debrief__frag'><span>Kills</span><strong>{s.kills}</strong><span>Confirmed frags</span></div>
          <div className='visit-debrief__death'><span>Deaths</span><strong>{s.deaths}</strong><span>{s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills.toFixed(2)} K/D</span></div>
          <div className='visit-debrief__accuracy'>
            <div className='visit-debrief__dial' style={{ '--accuracy': `${Math.min(100, accuracy)}%` } as CSSProperties}><strong>{accuracy}<small>%</small></strong></div>
            <div><span>Accuracy</span><p>{s.hits} hits / {s.shots} shots</p></div>
          </div>
          <div className='visit-debrief__secondary'>
            {([['Headshots', s.headshots], ['Best streak', s.bestStreak], ['Final streak', s.currentStreak]] as const).map(([label, value]) =>
              <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </section>
        <div className='visit-debrief__details'>
          <section className='visit-debrief__combat' aria-label='Human and bot combat'>
            <h2><span>01</span> Combat breakdown <small>{duration(s.humanDurationMs)} with humans</small></h2>
            <table>
              <thead><tr><th>Opponent</th><th>Kills</th><th>Deaths</th><th>Hits / shots</th><th><abbr title='Headshots'>HS</abbr></th></tr></thead>
              <tbody>{(['human', 'bot'] as const).map(kind => <tr key={kind} data-kind={kind}>
                <th><span className='visit-debrief__actor' aria-hidden='true' />{kind === 'human' ? 'Humans' : 'Bots'}</th>
                <td>{s[kind].kills}</td><td>{s[kind].deaths}</td><td>{s[kind].hits} <span>/ {s[kind].shots}</span></td><td>{s[kind].headshots}</td>
              </tr>)}</tbody>
            </table>
          </section>
          <section className='visit-debrief__rewards' aria-label='Visit rewards'>
            <h2><span>02</span> Rewards <small>{reward ? reward.saved ? 'Saved' : 'Guest preview' : session.rewardsPending ? 'Settling' : 'Settled'}</small></h2>
            {reward ? <><div className='visit-debrief__payout'><strong>+{reward.xpGained}<span> XP</span></strong><p>+{reward.creditsGained} <span>credits</span></p></div>
              <ul>{reward.xpLines?.map((line, i) => <li key={i}><span>{line.label}</span><strong>{line.xp > 0 ? '+' : ''}{line.xp}</strong></li>)}</ul></>
              : <p className='visit-debrief__empty'>{session.rewardsPending ? 'Rewards are being settled.' : 'No combat rewards for this visit.'}</p>}
          </section>
        </div>
        <footer className='visit-debrief__footer'>
          {taskExit ? <div className='visit-debrief__return' aria-live='polite'>
            <strong>{handoffFailed ? '!' : String(seconds).padStart(2, '0')}</strong>
            <div><span>{handoffFailed ? 'Desktop return unavailable' : seconds > 0 ? 'Returning to Codex' : 'Switching to Codex…'}</span>
              <p>{handoffFailed ? 'Switch back to Codex when ready.' : 'Your agent is ready for you.'}</p></div>
            {!handoffFailed && <div className='visit-debrief__countdown' aria-hidden='true' style={{ '--remaining': seconds / 5 } as CSSProperties} />}
          </div> : <p className='visit-debrief__ready'><span aria-hidden='true'>●</span> Visit ended <span>/</span> Re-enter when you’re ready</p>}
          <div className='visit-debrief__actions'>
            {session.event?.taskLink && <a href={session.event.taskLink}>Open task ↗</a>}
            {(!taskExit || handoffFailed) && <DeckButton onClick={onMenu}>Return to menu <span aria-hidden='true'>↗</span></DeckButton>}
          </div>
        </footer>
      </div>
    </div>
  );
}
