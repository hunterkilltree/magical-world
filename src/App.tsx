import React, { useEffect, useRef } from 'react';
import { initGame } from './game/main.js';

export const App: React.FC = () => {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const cleanup = initGame();
    return () => {
      if (cleanup) cleanup();
      initializedRef.current = false;
    };
  }, []);

  return (
    <>
      <canvas id="game" tabIndex={0}></canvas>
      <canvas id="overlay"></canvas>
      <div id="vignette"></div>

      <div className="hud">
        <div className="top glass">
          <div className="stat"><span className="k">Wave</span><b id="h-wave">–</b></div>
          <div className="stat"><span className="k">Left</span><b id="h-left">–</b></div>
          <div className="stat"><span className="k">Kills</span><b id="h-kills">0</b></div>
          <div className="stat"><span className="k">Score</span><b id="h-score">0</b></div>
        </div>
        <div className="tr">
          <button className="pausebtn glass" id="h-mute">Sound on <span>M</span></button>
          <button className="pausebtn glass" id="h-pause">Pause <span>Esc</span></button>
        </div>

        <div className="vitals glass">
          <div className="who">
            <span className="sw" id="h-sw"></span>
            <div>
              <div className="k" id="h-role">Ember Pyromancer</div>
              <b id="h-name">Brann Cinderhand</b>
              <div className="cls" id="h-cls"></div>
            </div>
          </div>
          <div>
            <div className="mrow"><span className="k">Health</span><span id="h-hpv">100</span></div>
            <div className="bar"><i id="h-hp" style={{ background: '#ef4444' }}></i></div>
          </div>
          <div>
            <div className="mrow"><span className="k">Energy</span><span id="h-env">100</span></div>
            <div className="bar" id="h-enbar"><i id="h-en" style={{ background: 'var(--accent-frontend)' }}></i></div>
          </div>
          <div className="statuses" id="h-status"></div>
        </div>

        <div className="spell glass">
          <div id="h-queue">
            <div className="slot"></div>
            <div className="slot"></div>
            <div className="slot"></div>
            <div className="spellinfo">
              <span className="k" id="h-shape">Queue elements · 1–0</span>
              <b id="h-spell">—</b>
              <span id="h-cost"></span>
            </div>
          </div>
          <div id="h-elements"></div>
        </div>

        <div className="abilities glass">
          <div className="tile" id="t-cast"><b>Cast</b><span>Left click</span></div>
          <div className="tile" id="t-nova"><b>Area</b><span>Right · E</span></div>
          <div className="tile" id="t-self"><b>Self</b><span>F</span></div>
          <div className="tile" id="t-dodge"><b>Dodge</b><span>Space</span></div>
        </div>

        <div id="banner"></div>
        <div id="toast" className="glass"></div>
      </div>

      <div className="screen on" id="menu">
        <div className="panel card">
          <div className="col">
            <div className="kicker">Grauhold Keep · Inner court</div>
            <h1>Court of Waves</h1>
            <p className="lede">
              Hold the court against thralls, bulwarks and hexcallers. Queue up to three elements, then cast — the mix decides the spell, and careless mixes hurt you too.
            </p>
            <div className="label">Choose your wizard</div>
            <div className="roster" id="m-roster"></div>
            <div className="label"><span>Casting role · Role archetype</span></div>
            <div className="roles" id="m-roles"></div>
            <div className="rolecard" id="m-rolecard"></div>
            <div className="label"><span>Arena · Đấu trường</span></div>
            <div className="roles arenas" id="m-arenas"></div>
            <div className="label"><span>Graphics · Đồ họa</span><span className="qnote"></span></div>
            <div className="roles quality" id="m-quality"></div>
            <div className="actions">
              <button className="btn btn-primary" id="m-start">Enter the court</button>
              <button className="btn btn-ghost" id="m-full" hidden>Full screen</button>
            </div>
            <div className="label"><span>Play together · up to four</span><span id="m-net-status"></span></div>
            <div className="coop" id="m-coop">
              <div className="coop-join" id="m-coop-join">
                <div className="coop-row">
                  <input id="m-name" className="field" maxLength={16} placeholder="Your name" autoComplete="off" />
                  <button className="btn btn-ghost" id="m-create">Create room</button>
                </div>
                <div className="coop-row">
                  <input id="m-code" className="field code" maxLength={4} placeholder="CODE" autoComplete="off" />
                  <button className="btn btn-ghost" id="m-join">Join room</button>
                </div>
              </div>
              <div className="lobby" id="m-lobby" hidden>
                <div className="lobby-head"><span className="k">Room</span><b id="m-room">----</b><button className="btn btn-ghost sm" id="m-leave">Leave</button></div>
                <div className="party" id="m-party"></div>
                <p className="lobby-hint" id="m-lobby-hint">Share the code. Pick your wizard and role above, then ready up.</p>
                <div className="actions">
                  <button className="btn btn-ghost" id="m-ready">Ready</button>
                  <button className="btn btn-primary" id="m-go" hidden>Start the run</button>
                </div>
              </div>
            </div>
            <div className="label">Controls</div>
            <div className="controls"></div>
            <div className="label">Elements react</div>
            <ul className="rules">
              <li>Your role decides what every pair becomes. Fire + Water is Steam Detonation for a Destroyer, Scalding Fog for a Controller, Warm Mist for a Guardian, Mirage Vapor for a Trickster and Mana Supernova for an Arcanist.</li>
              <li>Wet targets take double lightning and freeze instantly under ice. Casting lightning while wet shocks you.</li>
              <li>Fire dries and thaws; water and ice put fires out. Opposites (fire/ice, light/dark) no longer cancel — your role turns the clash into its own spell.</li>
              <li>Earth shatters frozen enemies for double damage; fire on ice is a Thermal Shock crit.</li>
              <li>Nature roots — on wet ground it entangles. Fire on roots burns hotter. Wind fans flames to the next enemy and chills the wet.</li>
              <li>Light blinds and purges curses for ×1.5; dark curses (+25% damage taken) and drains life to you. Light and dark cancel.</li>
              <li>Water + Ice draws a piercing Ice Spear that freezes what it runs through. Three different elements hit a tier harder than two.</li>
              <li>Lightning charges puddles, ice freezes them, fire lights dry brush. Rune barrels explode.</li>
              <li>Bulwarks block bolts from the front — flank them, or strike while the maul is raised.</li>
            </ul>
          </div>
        </div>
      </div>

      <div id="rotate" aria-hidden="true">
        <div>
          <b>Turn your phone sideways</b>
          <span>Court of Waves plays in landscape.</span>
        </div>
      </div>

      <div className="screen" id="pause">
        <div className="panel card">
          <div className="col">
            <div className="kicker">Paused</div>
            <h1>Catch your breath</h1>
            <div className="actions">
              <button className="btn btn-primary" id="p-resume">Resume</button>
              <button className="btn btn-ghost" id="p-restart">Restart</button>
              <button className="btn btn-ghost" id="p-menu">Change wizard</button>
            </div>
            <div className="label"><span>Graphics</span><span className="qnote"></span></div>
            <div className="roles quality" id="p-quality"></div>
            <div className="label">Controls</div>
            <div className="controls"></div>
          </div>
          <div className="col">
            <div className="label"><span>Grimoire</span><span id="p-found"></span></div>
            <div className="grimoire" id="p-grim"></div>
          </div>
        </div>
      </div>

      <div className="screen" id="dead">
        <div className="panel card">
          <div className="col">
            <div className="kicker" id="d-kick">Fallen</div>
            <h1>The court holds</h1>
            <div className="dstats" id="d-stats"></div>
            <div className="actions">
              <button className="btn btn-primary" id="d-restart">Try again · R</button>
              <button className="btn btn-ghost" id="d-menu">Change wizard</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default App;
