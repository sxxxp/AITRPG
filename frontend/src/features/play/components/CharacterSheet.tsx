import type { GameView } from '../types';

function Bar({ value, max, label, danger }: { value: number; max: number; label: string; danger?: boolean }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="hp-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className={`hp-bar__fill ${danger ? 'is-enemy' : pct <= 30 ? 'is-low' : ''}`} style={{ width: `${pct}%` }} />
      <span className="hp-bar__text">
        {value} / {max}
      </span>
    </div>
  );
}

export function CharacterSheet({ view }: { view: GameView }) {
  const c = view.character;
  return (
    <div className="stack">
      <section className="card stack-sm">
        <div className="row-between">
          <h2>{c.name}</h2>
          {c.down && <span className="badge badge--danger">쓰러짐</span>}
        </div>
        <Bar value={c.hp} max={c.maxHp} label="HP" />
        <dl className="stat-grid">
          {Object.entries(c.stats).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {c.statuses.length > 0 && (
          <div className="row">
            {c.statuses.map((s) => (
              <span key={s.id} className="badge badge--warning">
                {s.name}
                {s.remaining !== null && ` (${s.remaining})`}
              </span>
            ))}
          </div>
        )}
      </section>

      {view.combat && (
        <section className="card stack-sm" aria-labelledby="combat-title">
          <h2 id="combat-title">전투</h2>
          {view.combat.enemies.map((e) => (
            <div key={e.uid} className="stack-sm">
              <span className="small">{e.name}</span>
              <Bar value={e.hp} max={e.maxHp} label={`${e.name} HP`} danger />
            </div>
          ))}
        </section>
      )}

      <section className="card stack-sm" aria-labelledby="inventory-title">
        <h2 id="inventory-title">소지품</h2>
        {view.inventory.length === 0 ? (
          <p className="muted small">비어 있음</p>
        ) : (
          <ul className="inventory">
            {view.inventory.map((item) => (
              <li key={item.id} title={item.description}>
                <strong>{item.name}</strong>
                {item.qty > 1 && <span className="muted"> ×{item.qty}</span>}
                <p className="muted small">{item.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
