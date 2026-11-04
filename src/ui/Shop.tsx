import { useState } from 'react';
import type { GameState, GameStore } from '../state/store';
import { CATEGORIES, itemsByCategory, type CatalogItem, type Category } from '../state/catalog';
import { ownsItem } from '../state/economy';

interface ShopProps {
  store: GameStore;
  state: GameState;
  onBack: () => void;
}

function effectText(item: CatalogItem): string {
  const parts: string[] = [];
  if (item.power) parts.push(`Potencia +${item.power}`);
  if (item.reach) parts.push(`Alcance +${item.reach.toFixed(2).replace('.', ',')} m`);
  if (item.glow) parts.push(`Brillo ×${item.glow.toFixed(1).replace('.', ',')}`);
  return parts.join(' · ');
}

/** Tienda: comprar y equipar contra la cartera del store, con persistencia. */
export function Shop({ store, state, onBack }: ShopProps) {
  const [category, setCategory] = useState<Category>('racket');
  const [feedback, setFeedback] = useState<string>('');
  const { wallet } = state;

  const handleBuy = (item: CatalogItem) => {
    const result = store.buy(item.id);
    if (result.ok) {
      setFeedback(`Has comprado «${item.name}» por ${item.price} 🪙. Ya puedes equiparlo.`);
    } else if (result.reason === 'insufficient-funds') {
      setFeedback(`Te faltan ${item.price - wallet.coins} 🪙 para «${item.name}».`);
    } else if (result.reason === 'already-owned') {
      setFeedback(`«${item.name}» ya es tuyo.`);
    }
  };

  const handleEquip = (item: CatalogItem) => {
    const result = store.equip(item.id);
    if (result.ok) setFeedback(`«${item.name}» equipado.`);
    else setFeedback(`No puedes equipar «${item.name}» sin comprarlo antes.`);
  };

  return (
    <section className="panel" aria-label="Tienda">
      <div className="topbar">
        <span className="wallet" aria-label="Monedas">🪙 {wallet.coins}</span>
        <span className="screen-note" style={{ margin: 0 }}>Tienda</span>
      </div>

      <h2 className="screen-title">🛒 Tienda</h2>
      <p className="screen-note">Compra con las monedas ganadas en los partidos y equipa tu material.</p>

      <div className="shop-tabs" role="tablist" aria-label="Categorías">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={category === cat.id}
            className={category === cat.id ? 'seg-btn active' : 'seg-btn'}
            style={{ flex: '0 1 auto' }}
            onClick={() => setCategory(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="shop-grid">
        {itemsByCategory(category).map((item) => {
          const owned = ownsItem(wallet, item.id);
          const equipped = wallet.equipped[item.category] === item.id;
          const canAfford = wallet.coins >= item.price;
          return (
            <article key={item.id} className={equipped ? 'shop-card equipped' : 'shop-card'}>
              <span className="swatch" style={{ background: item.color }} aria-hidden="true" />
              <h4>{item.name}</h4>
              <span className="item-effect">{effectText(item) || 'Cosmético'}</span>
              <span className="item-price">
                {item.price === 0 ? <span className="free">Gratis</span> : `🪙 ${item.price}`}
              </span>
              {equipped ? (
                <button type="button" className="btn btn-small" disabled>
                  ✓ Equipado
                </button>
              ) : owned ? (
                <button type="button" className="btn btn-small" onClick={() => handleEquip(item)}>
                  Equipar
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!canAfford}
                    onClick={() => handleBuy(item)}
                  >
                    Comprar · 🪙 {item.price}
                  </button>
                  {!canAfford && <span className="cant-afford">Te faltan {item.price - wallet.coins} 🪙</span>}
                </>
              )}
            </article>
          );
        })}
      </div>

      <p className="shop-feedback" role="status">{feedback}</p>

      <button type="button" className="btn btn-primary" onClick={onBack}>
        ← Volver al menú
      </button>
    </section>
  );
}
