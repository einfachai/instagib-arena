import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CONTROLS } from '../controls';
import { useLiveCount } from '../live';
import { FeedbackModal } from '../FeedbackModal';
import { BrandLogo } from '../ui/BrandLogo';
import { DISCORD_URL, GITHUB_URL, TWITTER_URL } from '../links';
import './landing.css';

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return coarse;
}

const PLAY_FLOW = [
  { number: '01', title: 'Give your agent a job.', copy: 'Start a task in Codex. Let your agent handle the heavy lifting.', tag: 'TASK RUNNING', icon: '>_' },
  { number: '02', title: 'Make the wait a game.', copy: 'Drop into continuous deathmatch. Find a target. Make your one shot count.', tag: 'YOU’RE IN', icon: '↗' },
  { number: '03', title: 'Get back in the zone.', copy: 'Task done? See your score, then return to Codex after five seconds.', tag: 'TASK COMPLETE', icon: '✓' },
];

export default function Landing() {
  const coarse = useCoarsePointer();
  const live = useLiveCount();
  const [showFeedback, setShowFeedback] = useState(false);
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (coarse || showFeedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('a, button, input, textarea, select, summary, [contenteditable], [role="dialog"]')) return;
      e.preventDefault();
      navigate('/play');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [coarse, showFeedback, navigate]);

  const jumpTo = (id: string) => {
    const section = pageRef.current?.querySelector<HTMLElement>(`#${id}`);
    section?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    section?.focus({ preventScroll: true });
  };

  return (
    <div className='deathmatch-home' ref={pageRef}>
      <a href='#home-main' className='deck-skip-link'>Skip to content</a>
      <header className='dm-header'>
        <a href='/' className='dm-home-link' aria-label='Agent Deathmatch home'><BrandLogo decorative /></a>
        <nav aria-label='Main navigation'>
          <button onClick={() => jumpTo('how-it-works')}>How it works</button>
          <button onClick={() => jumpTo('controls')}>Field manual</button>
          <a className='dm-source-link' href={GITHUB_URL} target='_blank' rel='noreferrer'>Open source <span aria-hidden='true'>↗</span></a>
        </nav>
      </header>

      <main id='home-main' tabIndex={-1}>
        <section className='dm-hero' aria-labelledby='hero-heading'>
          <div className='dm-hero-grid' aria-hidden='true' />
          <div className='dm-hero-topline dm-mono'>
            <span><i /> Built for the in-between</span>
            <span>Browser FPS <b>/</b> No download</span>
          </div>
          <div className='dm-hero-art' aria-hidden='true'>
            <div className='dm-target'><span /><span /></div>
            <span className='dm-art-type'>NO IDLE<br />TIME.</span>
            <img className='dm-agent' src='/brand/agent-hero.png' alt='' width={1280} height={1600} fetchPriority='high' />
            <span className='dm-agent-label dm-mono'>Codex unit <b>001</b><i /></span>
          </div>
          <div className='dm-hero-content'>
            <h1 id='hero-heading'><BrandLogo className='dm-hero-logo' priority /></h1>
            <p className='dm-hero-statement'>Your agent works.<br /><em>You play.</em></p>
            <p className='dm-hero-copy'>Turn “working on it” into one more frag.<br className='dm-desktop-break' /> A robot arena shooter for the time between prompt and done.</p>
            <div className='dm-hero-actions'>
              <Link to='/play' className='dm-play'><span>{coarse ? 'Explore the lobby' : 'Enter the arena'}</span><span aria-hidden='true'>↗</span></Link>
              {!coarse && <span className='dm-key-hint dm-mono'>or press <kbd>Enter ↵</kbd></span>}
            </div>
            {coarse ? <p className='dm-device-note'>Bring a mouse and keyboard to play. You can explore the lobby here.</p> : <p className='dm-play-note dm-mono'>Free to play <span>·</span> No account needed <span>·</span> Desktop</p>}
          </div>
          <div className='dm-hero-bottom dm-mono'>
            <span className='dm-live'><i className={live && live.online > 0 ? 'is-live' : ''} />{live && live.online > 0 ? <><strong>{live.online}</strong> {live.online === 1 ? 'player' : 'players'} online</> : 'Jump in. Bots are ready.'}</span>
            <button onClick={() => jumpTo('how-it-works')}>Less waiting. More playing. <span aria-hidden='true'>↓</span></button>
            <span className='dm-hero-index'>[ AD / 001 ]</span>
          </div>
        </section>

        <div className='dm-manifesto' aria-label='One railgun. One shot. One kill.'><span>One railgun.</span><i aria-hidden='true'>✳</i><span>One shot.</span><i aria-hidden='true'>✳</i><span>One kill.</span><i aria-hidden='true'>✳</i></div>

        <section id='how-it-works' className='dm-flow dm-section' tabIndex={-1} aria-labelledby='flow-heading'>
          <div className='dm-section-heading'>
            <p className='dm-eyebrow dm-mono'><span>01 /</span> The loop</p>
            <h2 id='flow-heading'>A better way<br />to <em>kill time.</em></h2>
            <div className='dm-section-intro'><p>Your next break starts with a prompt.<br />Your next frag is a click away.</p><a href={`${GITHUB_URL}#install-in-codex`} target='_blank' rel='noreferrer'>Install the Codex plugin <span aria-hidden='true'>↗</span></a></div>
          </div>
          <div className='dm-flow-steps'>
            {PLAY_FLOW.map(step => <article key={step.number}>
              <div className='dm-step-top'><span className='dm-mono'>{step.number}</span><span className='dm-step-icon' aria-hidden='true'>{step.icon}</span></div>
              <h3>{step.title}</h3><p>{step.copy}</p><span className='dm-step-tag dm-mono'><i />{step.tag}</span>
            </article>)}
          </div>
          <p className='dm-integration-note dm-mono'>Works with Codex. Automatic return requires the paired plugin. Just here to play? Jump right in.</p>
        </section>

        <section className='dm-combat' aria-labelledby='combat-heading'>
          <img src='/brand/arena-gameplay.png' alt='First-person railgun combat inside an Agent Deathmatch arena' width={2530} height={1424} loading='lazy' />
          <div className='dm-combat-shade' aria-hidden='true' />
          <div className='dm-combat-caption dm-mono'><span><i /> Inside the arena</span><span>Actual gameplay</span></div>
          <div className='dm-combat-copy'><p className='dm-eyebrow dm-mono'>All aim. No excuses.</p><h2 id='combat-heading'>Small break.<br /><em>Big energy.</em></h2><p>Dash. Double-jump. Find your angle.<br />One clean rail is all it takes.</p><Link to='/play'>Take your shot <span aria-hidden='true'>↗</span></Link></div>
          <div className='dm-combat-stamp dm-mono'>100%<span>one-shot kills</span></div>
        </section>

        <section id='controls' className='dm-controls dm-section' tabIndex={-1} aria-labelledby='controls-heading'>
          <div><p className='dm-eyebrow dm-mono'><span>02 /</span> Field manual</p><h2 id='controls-heading'>Learn the keys.<br /><em>Own the arena.</em></h2><p>Mouse. Keyboard. Instinct.<br />These are your default controls.</p><Link to='/play' className='dm-text-link'>Ready when you are <span aria-hidden='true'>↗</span></Link></div>
          <dl>{CONTROLS.map(([key, action]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{action}</dd></div>)}</dl>
        </section>

        <section className='dm-final-cta' aria-labelledby='final-heading'><p className='dm-mono'>Your agent’s got this.</p><h2 id='final-heading'>Go get a frag.</h2><Link to='/play' className='dm-play dm-play-light'><span>{coarse ? 'Explore the lobby' : 'Enter the arena'}</span><span aria-hidden='true'>↗</span></Link></section>
      </main>

      <footer className='dm-footer'>
        <BrandLogo />
        <p className='dm-mono'>Made for the wait.<br /><span>Open source · AGPL</span></p>
        <nav aria-label='Community links'>
          {DISCORD_URL && <a href={DISCORD_URL} target='_blank' rel='noreferrer'>Discord ↗</a>}
          <a href={TWITTER_URL} target='_blank' rel='noreferrer'>X / Twitter ↗</a>
          <button onClick={() => setShowFeedback(true)}>Feedback</button>
        </nav>
      </footer>
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </div>
  );
}
