import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface InventoryItem {
  id: number;
  name: string;
  type: 'spirit' | 'bitters' | 'sweetener' | 'mixer' | 'garnish' | 'premixed' | 'other';
  brand?: string;
  subtype?: string;
  status: 'full' | 'open' | 'low' | 'empty';
  notes?: string;
}

interface CocktailBuild {
  id: number;
  spirit_id: number;
  spirit_name: string;
  bitters1_id: number;
  bitters1_name: string;
  bitters2_id: number | null;
  bitters2_name: string | null;
  sweetener_id: number;
  sweetener_name: string;
  rating: number | null;
  notes: string | null;
  built_at: string;
  built_by?: string;
}

interface Suggestion {
  spirit: InventoryItem;
  bitters1: InventoryItem;
  bitters2: InventoryItem | null;
  sweetener: InventoryItem;
}

type TabView = 'builder' | 'discovery' | 'stats' | 'inventory';

const STATUS_COLORS: Record<string, string> = {
  full: '#22c55e',
  open: '#3b82f6',
  low: '#f59e0b',
  empty: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  full: 'Full',
  open: 'Open',
  low: 'Low',
  empty: 'Empty',
};

const MOOD_MAP: Record<string, string[]> = {
  bold: ['rye', 'bourbon', 'scotch'],
  smooth: ['bourbon', 'cognac', 'brandy', 'irish'],
  sweet: ['bourbon', 'rum', 'cognac'],
  smoky: ['scotch', 'mezcal', 'islay'],
};

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function OldFashionedLab() {
  const [tab, setTab] = useState<TabView>('builder');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [builds, setBuilds] = useState<CocktailBuild[]>([]);
  const [loading, setLoading] = useState(true);

  // Builder state
  const [selectedSpirit, setSelectedSpirit] = useState<InventoryItem | null>(null);
  const [selectedBitters1, setSelectedBitters1] = useState<InventoryItem | null>(null);
  const [selectedBitters2, setSelectedBitters2] = useState<InventoryItem | null>(null);
  const [selectedSweetener, setSelectedSweetener] = useState<InventoryItem | null>(null);
  const [builderStep, setBuilderStep] = useState(1);
  const [showRecipe, setShowRecipe] = useState(false);
  const [saving, setSaving] = useState(false);

  // Rating modal
  const [ratingBuild, setRatingBuild] = useState<CocktailBuild | null>(null);
  const [pendingRating, setPendingRating] = useState(0);

  // Inventory add modal
  const [showAddItem, setShowAddItem] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editSubtype, setEditSubtype] = useState('');
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [newItemType, setNewItemType] = useState<InventoryItem['type']>('spirit');
  const [newItemBrand, setNewItemBrand] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemSubtype, setNewItemSubtype] = useState('');
  const [addingItem, setAddingItem] = useState(false);

  /* ---- Data fetching ---- */

  const fetchAll = useCallback(async () => {
    try {
      const [inv, blds] = await Promise.all([
        api.get<InventoryItem[]>('/bar/inventory').catch(() => [] as InventoryItem[]),
        api.get<CocktailBuild[]>('/bar/builds').catch(() => [] as CocktailBuild[]),
      ]);
      setInventory(Array.isArray(inv) ? inv : []);
      setBuilds(Array.isArray(blds) ? blds : []);
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useSocket('bar:update', fetchAll);

  /* ---- Filtered inventory ---- */

  const spirits = inventory.filter(i => i.type === 'spirit' && i.status !== 'empty');
  const bitters = inventory.filter(i => i.type === 'bitters' && i.status !== 'empty');
  const sweeteners = inventory.filter(i => i.type === 'sweetener' && i.status !== 'empty');

  /* ---- Builder actions ---- */

  const makeIt = async () => {
    if (!selectedSpirit || !selectedBitters1 || !selectedSweetener) return;
    setSaving(true);
    try {
      const build = await api.post<CocktailBuild>('/bar/builds', {
        spiritId: selectedSpirit.id,
        bitters1Id: selectedBitters1.id,
        bitters2Id: selectedBitters2?.id ?? null,
        sweetenerId: selectedSweetener.id,
      });
      setBuilds(prev => [build, ...prev]);
      setShowRecipe(true);
    } catch {
      // noop
    } finally {
      setSaving(false);
    }
  };

  const resetBuilder = () => {
    setSelectedSpirit(null);
    setSelectedBitters1(null);
    setSelectedBitters2(null);
    setSelectedSweetener(null);
    setBuilderStep(1);
    setShowRecipe(false);
  };

  /* ---- Rate a build ---- */

  const rateBuild = async () => {
    if (!ratingBuild || pendingRating === 0) return;
    try {
      await api.put(`/bar/builds/${ratingBuild.id}/rate`, { rating: pendingRating });
      setBuilds(prev => prev.map(b =>
        b.id === ratingBuild.id ? { ...b, rating: pendingRating } : b
      ));
    } catch {
      // noop
    }
    setRatingBuild(null);
    setPendingRating(0);
  };

  /* ---- Update inventory status ---- */

  const cycleStatus = async (item: InventoryItem) => {
    const order: InventoryItem['status'][] = ['full', 'open', 'low', 'empty'];
    const nextIndex = (order.indexOf(item.status) + 1) % order.length;
    const newStatus = order[nextIndex];

    // Optimistic update
    setInventory(prev => prev.map(i =>
      i.id === item.id ? { ...i, status: newStatus } : i
    ));

    try {
      await api.put(`/bar/inventory/${item.id}/status`, { status: newStatus });
    } catch {
      // Revert on error
      setInventory(prev => prev.map(i =>
        i.id === item.id ? { ...i, status: item.status } : i
      ));
    }
  };

  /* ---- Add inventory item ---- */

  const addInventoryItem = async () => {
    if (!newItemName.trim()) return;
    setAddingItem(true);
    try {
      await api.post('/bar/inventory', {
        item_type: newItemType,
        name: newItemName.trim(),
        brand: newItemBrand.trim() || undefined,
        subtype: newItemSubtype.trim() || undefined,
      });
      // Refresh inventory
      const inv = await api.get<InventoryItem[]>('/bar/inventory').catch(() => [] as InventoryItem[]);
      setInventory(Array.isArray(inv) ? inv : []);
      // Reset form and close
      setNewItemName('');
      setNewItemBrand('');
      setNewItemSubtype('');
      setNewItemType('spirit');
      setShowAddItem(false);
    } catch { /* noop */ }
    setAddingItem(false);
  };

  /* ---- Edit/delete inventory ---- */
  const saveEditItem = async () => {
    if (!editItem || !editName.trim()) return;
    try {
      await api.put(`/bar/inventory/${editItem.id}`, {
        name: editName.trim(),
        brand: editBrand.trim() || undefined,
        subtype: editSubtype.trim() || undefined,
      });
      const inv = await api.get<InventoryItem[]>('/bar/inventory').catch(() => [] as InventoryItem[]);
      setInventory(Array.isArray(inv) ? inv : []);
      setEditItem(null);
    } catch { /* noop */ }
  };

  const confirmDeleteItem = async () => {
    if (!deleteItem) return;
    try {
      await api.delete(`/bar/inventory/${deleteItem.id}`);
      setInventory(prev => prev.filter(i => i.id !== deleteItem.id));
      setDeleteItem(null);
    } catch { /* noop */ }
  };

  /* ---- Discovery helpers ---- */

  const getComboKey = (sId: number, b1Id: number, b2Id: number | null, swId: number) =>
    `${sId}-${b1Id}-${b2Id ?? 0}-${swId}`;

  const triedCombos = new Set(builds.map(b =>
    getComboKey(b.spirit_id, b.bitters1_id, b.bitters2_id, b.sweetener_id)
  ));

  const allCombos = spirits.flatMap(s =>
    bitters.flatMap(b1 =>
      sweeteners.map(sw => ({
        spirit: s,
        bitters1: b1,
        bitters2: null as InventoryItem | null,
        sweetener: sw,
        key: getComboKey(s.id, b1.id, null, sw.id),
      }))
    )
  );

  const untriedCombos = allCombos.filter(c => !triedCombos.has(c.key));
  const totalCombos = allCombos.length;
  const triedCount = totalCombos - untriedCombos.length;

  const randomUntried = (): Suggestion | null => {
    if (untriedCombos.length === 0) return null;
    const pick = untriedCombos[Math.floor(Math.random() * untriedCombos.length)];
    return pick;
  };

  const moodSuggestion = (mood: string): Suggestion | null => {
    const keywords = MOOD_MAP[mood] ?? [];
    const filtered = untriedCombos.filter(c =>
      keywords.some(kw =>
        (c.spirit.subtype || '').toLowerCase().includes(kw) ||
        (c.spirit.name || '').toLowerCase().includes(kw) ||
        (c.spirit as any).brand?.toLowerCase().includes(kw)
      )
    );
    if (filtered.length === 0) return randomUntried();
    return filtered[Math.floor(Math.random() * filtered.length)];
  };

  const applySuggestion = (s: Suggestion | null) => {
    if (!s) return;
    setSelectedSpirit(s.spirit);
    setSelectedBitters1(s.bitters1);
    setSelectedBitters2(s.bitters2);
    setSelectedSweetener(s.sweetener);
    setBuilderStep(3);
    setTab('builder');
  };

  /* ---- Stars display ---- */

  const Stars = ({ rating, onRate }: { rating: number; onRate?: (n: number) => void }) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => onRate?.(n)}
          className={`text-[24px] ${onRate ? 'active:scale-110 transition-transform' : ''}`}
          disabled={!onRate}
        >
          <span style={{ color: n <= rating ? '#f59e0b' : '#555577' }}>
            {'\u2605'}
          </span>
        </button>
      ))}
    </div>
  );

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-secondary text-[20px] animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-5 pb-8 animate-fade-in max-w-2xl mx-auto">
      {/* Header */}
      <h1 className="text-[28px] font-black text-text-primary mb-1">Drink Lab</h1>
      <p className="text-text-muted text-[14px] mb-4">Build, discover, perfect.</p>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {([
          { key: 'builder', label: 'Builder' },
          { key: 'discovery', label: 'Discovery' },
          { key: 'stats', label: 'Stats' },
          { key: 'inventory', label: 'Inventory' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'px-4 py-2 rounded-xl text-[16px] font-medium transition-all active:scale-95 shrink-0',
              tab === t.key
                ? 'bg-accent-amber text-white'
                : 'bg-surface-700 text-text-secondary',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ BUILDER ============ */}
      {tab === 'builder' && (
        <div className="space-y-6">
          {showRecipe ? (
            // Recipe display
            <div className="space-y-4">
              <Card glow="#f59e0b" className="text-center">
                <div className="text-[20px] font-bold text-accent-amber mb-3">Your Old Fashioned</div>
                <div className="space-y-2 text-left text-[16px] text-text-primary">
                  <div className="flex items-center gap-2">
                    <span className="text-accent-amber font-bold">1.</span>
                    <span>Add 2oz {selectedSpirit?.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-accent-amber font-bold">2.</span>
                    <span>
                      Add 2 dashes {selectedBitters1?.name}
                      {selectedBitters2 && ` + 1 dash ${selectedBitters2.name}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-accent-amber font-bold">3.</span>
                    <span>Add 1 barspoon {selectedSweetener?.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-accent-amber font-bold">4.</span>
                    <span>Stir with ice for 30 seconds</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-accent-amber font-bold">5.</span>
                    <span>Strain into rocks glass over a large cube</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-accent-amber font-bold">6.</span>
                    <span>Express orange peel, garnish</span>
                  </div>
                </div>
              </Card>

              {/* Rate the most recent build */}
              {builds.length > 0 && !builds[0].rating && (
                <Card className="text-center">
                  <div className="text-text-secondary text-[14px] mb-2">Rate this build</div>
                  <Stars
                    rating={pendingRating}
                    onRate={(n) => {
                      setPendingRating(n);
                      setRatingBuild(builds[0]);
                    }}
                  />
                </Card>
              )}

              <Button size="lg" fullWidth variant="secondary" onClick={resetBuilder}>
                Make Another
              </Button>
            </div>
          ) : (
            // Step builder
            <div className="space-y-4">
              {/* Progress dots */}
              <div className="flex items-center justify-center gap-3 mb-2">
                {[1, 2, 3].map(s => (
                  <div
                    key={s}
                    className={`w-[12px] h-[12px] rounded-full transition-colors ${
                      s <= builderStep ? 'bg-accent-amber' : 'bg-surface-600'
                    }`}
                  />
                ))}
              </div>

              {/* Step 1: Spirit */}
              {builderStep === 1 && (
                <section>
                  <h2 className="text-[20px] font-bold text-text-primary mb-3">Pick Your Spirit</h2>
                  {spirits.length === 0 ? (
                    <Card className="text-center py-6">
                      <div className="text-text-muted text-[16px]">No spirits in inventory</div>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {spirits.map(s => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSelectedSpirit(s);
                            setBuilderStep(2);
                          }}
                          className={[
                            'h-[70px] rounded-2xl text-[16px] font-bold transition-all active:scale-95 px-3',
                            selectedSpirit?.id === s.id
                              ? 'bg-accent-amber/30 border-2 border-accent-amber text-text-primary'
                              : 'bg-surface-700 border-2 border-transparent text-text-primary',
                          ].join(' ')}
                        >
                          <div>{s.name}</div>
                          <div className="flex items-center justify-center gap-2 text-[12px] font-normal mt-0.5">
                            {s.subtype && (
                              <span className="text-text-muted capitalize">{s.subtype}</span>
                            )}
                            <span style={{ color: STATUS_COLORS[s.status] }}>
                              {STATUS_LABELS[s.status]}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Step 2: Bitters */}
              {builderStep === 2 && (
                <section>
                  <h2 className="text-[20px] font-bold text-text-primary mb-1">Pick Bitters</h2>
                  <p className="text-text-muted text-[14px] mb-3">Select 1-2 bitters</p>
                  {bitters.length === 0 ? (
                    <Card className="text-center py-6">
                      <div className="text-text-muted text-[16px]">No bitters in inventory</div>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {bitters.map(b => {
                        const isSelected = selectedBitters1?.id === b.id || selectedBitters2?.id === b.id;
                        return (
                          <button
                            key={b.id}
                            onClick={() => {
                              if (selectedBitters1?.id === b.id) {
                                setSelectedBitters1(selectedBitters2);
                                setSelectedBitters2(null);
                              } else if (selectedBitters2?.id === b.id) {
                                setSelectedBitters2(null);
                              } else if (!selectedBitters1) {
                                setSelectedBitters1(b);
                              } else if (!selectedBitters2) {
                                setSelectedBitters2(b);
                              } else {
                                // Replace second
                                setSelectedBitters2(b);
                              }
                            }}
                            className={[
                              'h-[70px] rounded-2xl text-[16px] font-bold transition-all active:scale-95 px-3',
                              isSelected
                                ? 'bg-accent-purple/30 border-2 border-accent-purple text-text-primary'
                                : 'bg-surface-700 border-2 border-transparent text-text-primary',
                            ].join(' ')}
                          >
                            {b.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => setBuilderStep(1)}
                      className="flex-1 h-[56px] rounded-xl bg-surface-700 text-text-muted text-[16px] active:scale-95"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => selectedBitters1 && setBuilderStep(3)}
                      disabled={!selectedBitters1}
                      className="flex-1 h-[56px] rounded-xl bg-accent-purple text-white text-[16px] font-bold active:scale-95 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </section>
              )}

              {/* Step 3: Sweetener */}
              {builderStep === 3 && (
                <section>
                  <h2 className="text-[20px] font-bold text-text-primary mb-3">Pick Sweetener</h2>
                  {sweeteners.length === 0 ? (
                    <Card className="text-center py-6">
                      <div className="text-text-muted text-[16px]">No sweeteners in inventory</div>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {sweeteners.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedSweetener(s)}
                          className={[
                            'h-[70px] rounded-2xl text-[16px] font-bold transition-all active:scale-95 px-3',
                            selectedSweetener?.id === s.id
                              ? 'bg-accent-green/30 border-2 border-accent-green text-text-primary'
                              : 'bg-surface-700 border-2 border-transparent text-text-primary',
                          ].join(' ')}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Summary */}
                  {selectedSpirit && selectedBitters1 && selectedSweetener && (
                    <Card className="mt-4">
                      <div className="text-[14px] text-text-muted mb-2">Your Build</div>
                      <div className="text-[16px] text-text-primary">
                        <span className="font-bold">{selectedSpirit.name}</span>
                        {' + '}
                        <span className="font-bold">{selectedBitters1.name}</span>
                        {selectedBitters2 && <> + <span className="font-bold">{selectedBitters2.name}</span></>}
                        {' + '}
                        <span className="font-bold">{selectedSweetener.name}</span>
                      </div>
                    </Card>
                  )}

                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => setBuilderStep(2)}
                      className="flex-1 h-[56px] rounded-xl bg-surface-700 text-text-muted text-[16px] active:scale-95"
                    >
                      Back
                    </button>
                    <button
                      onClick={makeIt}
                      disabled={!selectedSweetener || saving}
                      className="flex-1 h-[56px] rounded-xl bg-accent-amber text-white text-[18px] font-bold active:scale-95 disabled:opacity-40"
                    >
                      {saving ? 'Making...' : 'Make It'}
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============ DISCOVERY ============ */}
      {tab === 'discovery' && (
        <div className="space-y-6">
          {/* Progress */}
          <Card className="text-center">
            <div className="text-text-muted text-[14px] mb-1">Exploration Progress</div>
            <div className="text-[36px] font-black text-accent-amber">
              {triedCount} <span className="text-text-muted text-[20px]">of</span> {totalCombos}
            </div>
            <div className="w-full h-3 bg-surface-700 rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-accent-amber rounded-full transition-all"
                style={{ width: `${totalCombos > 0 ? (triedCount / totalCombos) * 100 : 0}%` }}
              />
            </div>
            <div className="text-text-muted text-[13px] mt-2">
              {totalCombos - triedCount} combinations left to try
            </div>
          </Card>

          {/* Random untried */}
          <Button
            size="lg"
            fullWidth
            color="#f59e0b"
            onClick={() => applySuggestion(randomUntried())}
            disabled={untriedCombos.length === 0}
          >
            Make Me Something New
          </Button>

          {/* Mood suggestions */}
          <section>
            <h2 className="text-[18px] font-bold text-text-primary mb-3">I'm Feeling...</h2>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries({
                bold: { emoji: '\uD83D\uDD25', color: '#ef4444' },
                smooth: { emoji: '\uD83C\uDF0A', color: '#3b82f6' },
                sweet: { emoji: '\uD83C\uDF6F', color: '#f59e0b' },
                smoky: { emoji: '\uD83C\uDF2B\uFE0F', color: '#8b5cf6' },
              }).map(([mood, { emoji, color }]) => (
                <button
                  key={mood}
                  onClick={() => applySuggestion(moodSuggestion(mood))}
                  className="h-[70px] rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
                  style={{ backgroundColor: color + '20', border: `2px solid ${color}` }}
                >
                  <span className="text-[24px]">{emoji}</span>
                  <span className="text-text-primary text-[18px] font-bold capitalize">{mood}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Recent untried combos */}
          {untriedCombos.length > 0 && (
            <section>
              <h2 className="text-[18px] font-bold text-text-primary mb-3">Untried Combos</h2>
              <div className="space-y-2 max-h-[300px] overflow-y-auto scroll-area">
                {untriedCombos.slice(0, 20).map(c => (
                  <button
                    key={c.key}
                    onClick={() => applySuggestion(c)}
                    className="w-full text-left px-4 py-3 rounded-xl bg-surface-800 transition-all active:scale-[0.98]"
                  >
                    <span className="text-text-primary text-[15px]">
                      {c.spirit.name} + {c.bitters1.name} + {c.sweetener.name}
                    </span>
                  </button>
                ))}
                {untriedCombos.length > 20 && (
                  <div className="text-center text-text-muted text-[14px] py-2">
                    +{untriedCombos.length - 20} more
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ============ STATS ============ */}
      {tab === 'stats' && (
        <div className="space-y-6">
          {/* Top rated builds */}
          <section>
            <h2 className="text-[20px] font-bold text-text-primary mb-3">Top Rated Builds</h2>
            {builds.filter(b => b.rating).length === 0 ? (
              <Card className="text-center py-6">
                <div className="text-text-muted text-[16px]">No rated builds yet</div>
              </Card>
            ) : (
              <div className="space-y-3">
                {builds
                  .filter(b => b.rating)
                  .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
                  .slice(0, 10)
                  .map((b, i) => (
                    <Card key={b.id}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-text-primary text-[16px] font-semibold">
                            {b.spirit_name} + {b.bitters1_name}
                            {b.bitters2_name && ` + ${b.bitters2_name}`}
                            {' + '}{b.sweetener_name}
                          </div>
                          <Stars rating={b.rating ?? 0} />
                        </div>
                        {i === 0 && (
                          <span className="text-[24px]">{'\uD83C\uDFC6'}</span>
                        )}
                      </div>
                    </Card>
                  ))}
              </div>
            )}
          </section>

          {/* Most popular spirit */}
          <section>
            <h2 className="text-[20px] font-bold text-text-primary mb-3">Most Used Spirit</h2>
            {builds.length === 0 ? (
              <Card className="text-center py-4">
                <div className="text-text-muted text-[16px]">No builds yet</div>
              </Card>
            ) : (() => {
              const counts = new Map<string, number>();
              builds.forEach(b => counts.set(b.spirit_name, (counts.get(b.spirit_name) ?? 0) + 1));
              const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
              return (
                <div className="space-y-2">
                  {sorted.slice(0, 5).map(([name, count], i) => (
                    <div key={name} className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-800">
                      <div className="flex items-center gap-3">
                        <span className="text-text-muted text-[16px] font-bold w-[24px]">#{i + 1}</span>
                        <span className="text-text-primary text-[16px] font-semibold">{name}</span>
                      </div>
                      <span className="text-accent-amber text-[16px] font-bold">{count}x</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </section>

          {/* Exploration progress */}
          <section>
            <h2 className="text-[20px] font-bold text-text-primary mb-3">Exploration</h2>
            <Card className="text-center">
              <div className="text-[48px] font-black text-accent-amber">
                {totalCombos > 0 ? Math.round((triedCount / totalCombos) * 100) : 0}%
              </div>
              <div className="text-text-muted text-[14px]">
                {triedCount} of {totalCombos} combinations tried
              </div>
            </Card>
          </section>

          {/* Cross-reference placeholder */}
          <section>
            <h2 className="text-[20px] font-bold text-text-primary mb-3">Performance Insights</h2>
            <Card className="text-center py-6">
              <div className="text-text-muted text-[16px]">
                Cross-reference with dart accuracy coming soon...
              </div>
              <div className="text-text-muted/50 text-[14px] mt-1">
                "Your dart accuracy on Knob Creek nights"
              </div>
            </Card>
          </section>
        </div>
      )}

      {/* ============ INVENTORY ============ */}
      {tab === 'inventory' && (
        <div className="space-y-6">
          {/* Add Item button */}
          <Button
            variant="secondary"
            fullWidth
            onClick={() => setShowAddItem(true)}
          >
            + Add Item
          </Button>

          {(['spirit', 'bitters', 'sweetener', 'premixed', 'mixer', 'garnish', 'other'] as const).map(type => {
            const items = inventory.filter(i => i.type === type);
            if (items.length === 0) return null;
            return (
              <section key={type}>
                <h2 className="text-[20px] font-bold text-text-primary mb-3 capitalize">
                  {type === 'spirit' ? 'Spirits' : type === 'bitters' ? 'Bitters' : type === 'sweetener' ? 'Sweeteners' : type === 'premixed' ? 'Premixed' : type === 'mixer' ? 'Mixers' : type === 'garnish' ? 'Garnishes' : 'Other'}
                </h2>
                <div className="space-y-2">
                  {items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-800 gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-text-primary text-[16px] font-semibold truncate">{item.name}</div>
                        <div className="flex items-center gap-2 text-[13px]">
                          {item.subtype && <span className="text-text-muted capitalize">{item.subtype}</span>}
                          {(item as any).brand && <span className="text-text-muted/50">{(item as any).brand}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => cycleStatus(item)}
                          className="px-3 py-1.5 rounded-lg text-[14px] font-bold transition-all active:scale-95 min-w-[70px] text-center"
                          style={{
                            backgroundColor: STATUS_COLORS[item.status] + '20',
                            color: STATUS_COLORS[item.status],
                            border: `1px solid ${STATUS_COLORS[item.status]}40`,
                          }}
                        >
                          {STATUS_LABELS[item.status]}
                        </button>
                        <button
                          onClick={() => { setEditItem(item); setEditName(item.name); setEditBrand((item as any).brand || ''); setEditSubtype(item.subtype || ''); }}
                          className="w-[36px] h-[36px] rounded-lg bg-surface-700 flex items-center justify-center text-text-muted hover:text-accent-blue active:scale-95 transition-all"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button
                          onClick={() => setDeleteItem(item)}
                          className="w-[36px] h-[36px] rounded-lg bg-surface-700 flex items-center justify-center text-text-muted hover:text-accent-red active:scale-95 transition-all"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {inventory.length === 0 && (
            <Card className="text-center py-8">
              <div className="text-text-muted text-[18px]">
                No items in inventory yet
              </div>
              <div className="text-text-muted/50 text-[14px] mt-1">
                Tap "Add Item" to stock your bar
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ============ RATING MODAL ============ */}
      <Modal
        open={ratingBuild !== null}
        onClose={() => { setRatingBuild(null); setPendingRating(0); }}
        title="Rate This Build"
        size="sm"
      >
        <div className="text-center space-y-4">
          {ratingBuild && (
            <div className="text-text-primary text-[16px]">
              {ratingBuild.spirit_name} + {ratingBuild.bitters1_name}
              {ratingBuild.bitters2_name && ` + ${ratingBuild.bitters2_name}`}
              {' + '}{ratingBuild.sweetener_name}
            </div>
          )}
          <div className="flex justify-center">
            <Stars rating={pendingRating} onRate={setPendingRating} />
          </div>
          <Button
            size="lg"
            fullWidth
            disabled={pendingRating === 0}
            onClick={rateBuild}
          >
            Save Rating
          </Button>
        </div>
      </Modal>

      {/* ============ ADD INVENTORY ITEM MODAL ============ */}
      <Modal
        open={showAddItem}
        onClose={() => setShowAddItem(false)}
        title="Add Inventory Item"
        size="sm"
      >
        <div className="space-y-4">
          {/* Type picker */}
          <div>
            <label className="block text-text-secondary text-[14px] font-semibold mb-2">Type</label>
            <div className="flex flex-wrap gap-2">
              {(['spirit', 'bitters', 'sweetener', 'premixed', 'garnish'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setNewItemType(t)}
                  className={[
                    'px-4 py-2 rounded-xl text-[14px] font-semibold transition-all capitalize',
                    newItemType === t
                      ? 'bg-accent-amber/20 border border-accent-amber text-accent-amber'
                      : 'bg-surface-600 border border-transparent text-text-secondary',
                  ].join(' ')}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Brand (optional) */}
          <div>
            <label className="block text-text-secondary text-[14px] font-semibold mb-2">Brand (optional)</label>
            <input
              type="text"
              value={newItemBrand}
              onChange={(e) => setNewItemBrand(e.target.value)}
              placeholder="e.g. Woodford Reserve"
              className="w-full h-[48px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] placeholder:text-text-muted"
            />
          </div>

          {/* Subtype — spirits & bitters */}
          {(newItemType === 'spirit' || newItemType === 'bitters') && (
            <div>
              <label className="block text-text-secondary text-[14px] font-semibold mb-2">
                {newItemType === 'spirit' ? 'Spirit Type' : 'Bitters Type'}
              </label>
              <div className="flex flex-wrap gap-2">
                {(newItemType === 'spirit'
                  ? ['bourbon', 'rye', 'irish', 'scotch', 'vodka', 'rum', 'gin', 'tequila', 'mezcal', 'cognac']
                  : ['aromatic', 'orange', 'old-fashioned']
                ).map(st => (
                  <button
                    key={st}
                    onClick={() => setNewItemSubtype(st)}
                    className={[
                      'px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all capitalize',
                      newItemSubtype === st
                        ? 'bg-accent-amber/20 border border-accent-amber text-accent-amber'
                        : 'bg-surface-600 border border-transparent text-text-secondary',
                    ].join(' ')}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name (required) */}
          <div>
            <label className="block text-text-secondary text-[14px] font-semibold mb-2">Name</label>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="e.g. Double Oaked Bourbon"
              className="w-full h-[48px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] placeholder:text-text-muted"
            />
          </div>

          {/* Add button */}
          <Button
            variant="primary"
            fullWidth
            size="lg"
            disabled={!newItemName.trim() || addingItem}
            onClick={addInventoryItem}
          >
            {addingItem ? 'Adding...' : 'Add'}
          </Button>
        </div>
      </Modal>

      {/* ============ EDIT ITEM MODAL ============ */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Item" size="sm">
        {editItem && (
          <div className="space-y-4">
            <div>
              <label className="block text-text-secondary text-[14px] font-semibold mb-2">Name</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full h-[48px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px]"
              />
            </div>
            <div>
              <label className="block text-text-secondary text-[14px] font-semibold mb-2">Brand (optional)</label>
              <input
                type="text"
                value={editBrand}
                onChange={e => setEditBrand(e.target.value)}
                className="w-full h-[48px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px]"
              />
            </div>
            <div>
              <label className="block text-text-secondary text-[14px] font-semibold mb-2">Subtype</label>
              <input
                type="text"
                value={editSubtype}
                onChange={e => setEditSubtype(e.target.value)}
                placeholder="e.g. bourbon, aromatic"
                className="w-full h-[48px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] placeholder:text-text-muted"
              />
            </div>
            <Button variant="primary" fullWidth size="lg" onClick={saveEditItem} disabled={!editName.trim()}>
              Save Changes
            </Button>
          </div>
        )}
      </Modal>

      {/* ============ DELETE ITEM MODAL ============ */}
      <Modal open={!!deleteItem} onClose={() => setDeleteItem(null)} title="Delete Item" size="sm">
        {deleteItem && (
          <div className="space-y-5">
            <p className="text-text-secondary text-[16px] text-center">
              Delete <strong className="text-text-primary">{deleteItem.name}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setDeleteItem(null)}>Cancel</Button>
              <Button variant="danger" fullWidth onClick={confirmDeleteItem}>Delete</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
