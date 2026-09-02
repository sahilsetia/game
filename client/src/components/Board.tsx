import { SEQ, STATES, BANKS, GROUPS, BANK_STYLE, type Game } from '@game/shared';

/** tile index → [row, col] on the 10×10 grid.
 *  START bottom-left, movement up the left column → top row → right column → bottom row. */
function pos(i: number): [number, number] {
  if (i === 0) return [10, 1];
  if (i <= 8) return [10 - i, 1]; // left column, upward
  if (i === 9) return [1, 1]; // JAIL top-left
  if (i <= 17) return [1, 1 + (i - 9)]; // top row, rightward
  if (i === 18) return [1, 10]; // RESORT top-right
  if (i <= 26) return [1 + (i - 18), 10]; // right column, downward
  if (i === 27) return [10, 10]; // REST HOUSE bottom-right
  return [10, 10 - (i - 27)]; // bottom row, leftward
}

interface BoardProps {
  game: Game;
  displayPos?: Record<number, number>;
  currentId?: number | null;
  compact?: boolean;
  onTile?: (idx: number) => void;
  onRules?: () => void;
}

/** short labels for small screens */
const SHORT: Record<string, string> = {
  'Madhya Pradesh': 'MP',
  'Uttar Pradesh': 'UP',
  'Himachal Pradesh': 'HP',
  'Jammu & Kashmir': 'J&K',
  'West Bengal': 'West Bengal',
  'Andhra Pradesh': 'AP',
  'Tamil Nadu': 'TN',
  'Narendra Modi Stadium': 'Stadium',
  'IPL Team (RCB)': 'RCB',
  'IndiGo Airlines': 'IndiGo',
  'Adani Ports': 'Adani',
  'SBI Bank': 'SBI',
  'RBL Bank': 'RBL',
  'JAIL PUNISHMENT': 'JAIL',
  'RESORT PICNIC ENJOYMENT': 'PICNIC',
  'REST HOUSE': 'REST',
  'Chance · Play try': 'Chance',
  'Community chest': 'Chest',
};

export function Board({ game, displayPos, currentId, compact, onTile, onRules }: BoardProps) {
  const posOf = (pid: number) => displayPos?.[pid] ?? game.players[pid].pos;
  const label = (full: string) => (compact ? SHORT[full] ?? full : full);
  return (
    <div className={`board ${compact ? 'compact' : ''}`}>
      {SEQ.map((tile, idx) => {
        const [r, c] = pos(idx);
        const style: React.CSSProperties = { gridRow: r, gridColumn: c };
        const own = game.own[idx];
        const tokens = game.players.filter((p) => !p.bankrupt && posOf(p.id) === idx);
        let cls = 'tile';
        let inner: React.ReactNode;
        if (tile.t === 'state') {
          const s = STATES[tile.name];
          const g = GROUPS[s.group];
          style.background = g.fill;
          style.border = `2.5px solid ${g.strong}`;
          style.color = g.dark;
          inner = (
            <>
              <div className="nm">{label(tile.name)}</div>
              <i className={`ti ${s.icon}`} aria-hidden />
              <div className="pr">₹{s.price}</div>
            </>
          );
        } else if (tile.t === 'bank') {
          const b = BANKS[tile.name];
          style.background = BANK_STYLE.fill;
          style.border = `2.5px solid ${BANK_STYLE.strong}`;
          style.color = BANK_STYLE.dark;
          inner = (
            <>
              <div className="nm">{label(tile.name)}</div>
              <i className={`ti ${b.icon}`} aria-hidden />
              <div className="pr">₹{b.price}</div>
            </>
          );
        } else if (tile.t === 'start' || tile.t === 'jail' || tile.t === 'rest' || tile.t === 'resort') {
          cls += ' corner';
          inner = (
            <>
              <i className={`ti ${tile.icon}`} aria-hidden />
              <div className="nm">{label(tile.label)}</div>
              {tile.t === 'start' && !compact && <div style={{ fontWeight: 400, color: '#41586b' }}>Collect ₹3000</div>}
            </>
          );
        } else {
          cls += ' plain';
          inner = (
            <>
              <i className={`ti ${tile.icon}`} aria-hidden />
              <div>{label(tile.label)}</div>
            </>
          );
        }
        return (
          <div key={idx} id={`tile-${idx}`} className={cls} style={style} onClick={() => onTile?.(idx)}>
            {inner}
            {own && (
              <>
                <div className="owner-strip" style={{ background: game.players[own.owner].color }} />
                <div className="sold" style={{ borderColor: game.players[own.owner].color, color: game.players[own.owner].color }}>
                  SOLD
                </div>
                {own.level > 0 && (
                  <div className="builds" title={own.level === 4 ? 'Hotel' : `${own.level} house${own.level > 1 ? 's' : ''}`}>
                    {own.level === 4 ? '🏨' : '🏠'}
                    {own.level > 1 && own.level < 4 && <sup>×{own.level}</sup>}
                  </div>
                )}
              </>
            )}
            {tokens.length > 0 && (
              <div className="tokens">
                {tokens.map((p) => (
                  <div
                    key={`${p.id}-${idx}`}
                    className={`token ${p.id === currentId ? 'current' : ''}`}
                    style={{ background: p.color }}
                    title={p.name}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="center">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 30, fontWeight: 700, fontStyle: 'italic' }}>
            Business <span style={{ color: '#F2C200' }}>india</span>
          </div>
          <div style={{ fontSize: 10, letterSpacing: 2, color: '#bcd2e2' }}>AMAZING ENTERTAINMENT FOR WHOLE FAMILY</div>
        </div>
        {currentId != null && (
          <div className="center-turn">
            <span className="dot" style={{ background: game.players[currentId].color }} />
            {game.players[currentId].name}'s turn
          </div>
        )}
        {game.dice && (
          <div className="center-dice">
            <span>{game.dice[0]}</span>
            <span>{game.dice[1]}</span>
          </div>
        )}
        <div className="rules" onClick={() => onRules?.()} style={{ cursor: 'pointer' }} title="Tap to read full rules">
          <div className="rulebox">
            <b>CHANCE — odd (receive)</b>
            {['3. Lottery prize ₹2500', '5. Crossword prize ₹1000', '7. Jackpot ₹2000', '9. You have won ₹5000', '11. Export prize ₹3000'].map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
          <div className="rulebox">
            <b>CHANCE — even (pay)</b>
            {['2. Share market loss ₹2000', '4. Accident fine ₹1000', '6. House repairs ₹1500', '8. Fire in godown ₹3000', '10. Go to jail', '12. Rest house, skip next turn'].map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
          <div className="rulebox">
            <b>CHEST — even (receive)</b>
            {['2. Birthday ₹500 from each player', '4. Reality TV prize ₹2500', '6. Tax refund ₹2000', '8. Rest house, skip next turn', '10. Share interest ₹1500', '12. Stocks sale ₹3000'].map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
          <div className="rulebox">
            <b>CHEST — odd (pay)</b>
            {['3. Go to jail', '5. School and medical fees ₹1000', '7. Marriage celebration ₹2000', '9. Repairs: house ₹50, hotel ₹100', '11. Insurance premium ₹1500'].map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
