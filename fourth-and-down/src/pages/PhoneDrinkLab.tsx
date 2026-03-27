import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';

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
}

interface Build {
  id: number;
  spirit_name: string;
  spirit_brand?: string;
  sweetener_name: string;
  sweetener_brand?: string;
  bitters: { id: number; name: string; brand?: string }[];
  rating: number | null;
  timestamp: string;
  player_name?: string;
  player_color?: string;
}

type FilterType = 'all' | 'spirit' | 'bitters' | 'sweetener' | 'mixer' | 'garnish';

const STATUS_COLORS: Record<string, string> = {
  full: '#22c55e',
  open: '#3b82f6',
  low: '#f59e0b',
  empty: '#ef4444',
};

const TYPE_LABELS: Record<string, string> = {
  spirit: 'Spirits',
  bitters: 'Bitters',
  sweetener: 'Sweeteners',
  mixer: 'Mixers',
  garnish: 'Garnishes',
  premixed: 'Premixed',
  other: 'Other',
};

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function PhoneDrinkLab() {
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'cabinet' | 'recipes'>('cabinet');
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [expandedBuild, setExpandedBuild] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [inv, blds] = await Promise.all([
        api.get<InventoryItem[]>('/bar/inventory').catch(() => [] as InventoryItem[]),
        api.get<Build[]>('/bar/builds').catch(() => [] as Build[]),
      ]);
      setInventory(Array.isArray(inv) ? inv : []);
      setBuilds(Array.isArray(blds) ? blds : []);
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useSocket('bar:update', fetchAll);

  /* ---- Filtered/searched inventory ---- */

  const filteredInventory = useMemo(() => {
    let items = inventory;

    if (filter !== 'all') {
      items = items.filter((i) => i.type === filter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.brand || '').toLowerCase().includes(q) ||
          (i.subtype || '').toLowerCase().includes(q)
      );
    }

    return items;
  }, [inventory, filter, search]);

  /* ---- Group inventory by type ---- */

  const groupedInventory = useMemo(() => {
    const groups: Record<string, InventoryItem[]> = {};
    for (const item of filteredInventory) {
      if (!groups[item.type]) groups[item.type] = [];
      groups[item.type].push(item);
    }
    return groups;
  }, [filteredInventory]);

  /* ---- Filtered builds (recipes) ---- */

  const filteredBuilds = useMemo(() => {
    if (!search.trim()) return builds;
    const q = search.toLowerCase();
    return builds.filter(
      (b) =>
        (b.spirit_name || '').toLowerCase().includes(q) ||
        (b.spirit_brand || '').toLowerCase().includes(q) ||
        (b.sweetener_name || '').toLowerCase().includes(q) ||
        b.bitters.some((bi) => bi.name.toLowerCase().includes(q))
    );
  }, [builds, search]);

  /* ---- Ingredient availability check ---- */

  const availableIds = useMemo(() => {
    return new Set(
      inventory.filter((i) => i.status !== 'empty').map((i) => i.id)
    );
  }, [inventory]);

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-[20px] animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate('/join')}
            className="w-[40px] h-[40px] rounded-xl bg-gray-800 flex items-center justify-center text-gray-400 active:bg-gray-700 active:scale-95 transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div>
            <h1 className="text-[24px] font-black text-white leading-tight">Drink Lab</h1>
            <p className="text-gray-500 text-[14px]">Browse the bar</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setTab('cabinet')}
            className={[
              'flex-1 h-[44px] rounded-xl text-[16px] font-semibold transition-all active:scale-95',
              tab === 'cabinet'
                ? 'bg-amber-600 text-white'
                : 'bg-gray-800 text-gray-400',
            ].join(' ')}
          >
            Cabinet
          </button>
          <button
            onClick={() => setTab('recipes')}
            className={[
              'flex-1 h-[44px] rounded-xl text-[16px] font-semibold transition-all active:scale-95',
              tab === 'recipes'
                ? 'bg-amber-600 text-white'
                : 'bg-gray-800 text-gray-400',
            ].join(' ')}
          >
            Recipes ({builds.length})
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder={tab === 'cabinet' ? 'Search ingredients...' : 'Search recipes...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-[44px] rounded-xl bg-gray-800 border border-gray-700 text-white text-[16px] pl-10 pr-4 placeholder-gray-500 focus:outline-none focus:border-amber-600"
          />
        </div>

        {/* Filter chips (cabinet only) */}
        {tab === 'cabinet' && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-1 px-1">
            {(['all', 'spirit', 'bitters', 'sweetener', 'mixer', 'garnish'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={[
                  'shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all active:scale-95',
                  filter === f
                    ? 'bg-amber-600 text-white'
                    : 'bg-gray-800 text-gray-400',
                ].join(' ')}
              >
                {f === 'all' ? 'All' : TYPE_LABELS[f] || f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {tab === 'cabinet' ? (
          /* ============ CABINET ============ */
          <div className="space-y-5">
            {Object.keys(groupedInventory).length === 0 ? (
              <div className="text-center text-gray-500 text-[16px] py-10">
                {search ? 'No matching items' : 'Cabinet is empty'}
              </div>
            ) : (
              Object.entries(groupedInventory).map(([type, items]) => (
                <section key={type}>
                  <h2 className="text-[14px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {TYPE_LABELS[type] || type}
                  </h2>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-[16px] font-medium truncate">
                            {item.brand ? `${item.brand} ` : ''}{item.name}
                          </div>
                          {item.subtype && (
                            <div className="text-gray-500 text-[13px] capitalize">{item.subtype}</div>
                          )}
                        </div>
                        <span
                          className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            color: STATUS_COLORS[item.status],
                            backgroundColor: STATUS_COLORS[item.status] + '20',
                          }}
                        >
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        ) : (
          /* ============ RECIPES ============ */
          <div className="space-y-3">
            {filteredBuilds.length === 0 ? (
              <div className="text-center text-gray-500 text-[16px] py-10">
                {search ? 'No matching recipes' : 'No recipes yet'}
              </div>
            ) : (
              filteredBuilds.map((build) => {
                const isExpanded = expandedBuild === build.id;

                // Check ingredient availability
                const allBittersAvailable = build.bitters.every((b) => availableIds.has(b.id));
                // We can't directly check spirit/sweetener IDs from the build response shape,
                // so we check by name match
                const spiritAvailable = inventory.some(
                  (i) => i.type === 'spirit' && i.name === build.spirit_name && i.status !== 'empty'
                );
                const sweetenerAvailable = inventory.some(
                  (i) => i.type === 'sweetener' && i.name === build.sweetener_name && i.status !== 'empty'
                );

                return (
                  <button
                    key={build.id}
                    onClick={() => setExpandedBuild(isExpanded ? null : build.id)}
                    className="w-full text-left rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden transition-all active:scale-[0.98]"
                  >
                    {/* Card header */}
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white text-[18px] font-bold">
                          {build.spirit_brand ? `${build.spirit_brand} ` : ''}{build.spirit_name}
                        </span>
                        {build.rating && (
                          <span className="text-amber-400 text-[14px]">
                            {'\u2605'.repeat(build.rating)}
                          </span>
                        )}
                      </div>
                      <div className="text-gray-400 text-[14px]">
                        {build.bitters.map((b) => b.name).join(' + ')} &middot; {build.sweetener_name}
                      </div>
                      {build.player_name && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <div
                            className="w-[14px] h-[14px] rounded-full"
                            style={{ backgroundColor: build.player_color || '#666' }}
                          />
                          <span className="text-gray-500 text-[12px]">{build.player_name}</span>
                        </div>
                      )}

                      {/* Missing ingredients indicator */}
                      {(!spiritAvailable || !allBittersAvailable || !sweetenerAvailable) && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="text-[12px] text-red-400 font-medium">Missing:</span>
                          <div className="flex gap-1 flex-wrap">
                            {!spiritAvailable && (
                              <span className="text-[11px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded">
                                {build.spirit_name}
                              </span>
                            )}
                            {build.bitters.filter((b) => !availableIds.has(b.id)).map((b) => (
                              <span key={b.id} className="text-[11px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded">
                                {b.name}
                              </span>
                            ))}
                            {!sweetenerAvailable && (
                              <span className="text-[11px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded">
                                {build.sweetener_name}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Expanded: step-by-step recipe */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-gray-800">
                        <div className="text-[14px] font-semibold text-amber-500 mb-2">How to Make</div>
                        <div className="space-y-2 text-[16px] text-gray-300">
                          <div className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold shrink-0">1.</span>
                            <span>Add 2oz {build.spirit_brand ? `${build.spirit_brand} ` : ''}{build.spirit_name} to mixing glass</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold shrink-0">2.</span>
                            <span>
                              Add {build.bitters.length > 1
                                ? `2 dashes ${build.bitters[0].name} + 1 dash ${build.bitters[1].name}`
                                : `2-3 dashes ${build.bitters[0]?.name || 'bitters'}`}
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold shrink-0">3.</span>
                            <span>Add 1 barspoon {build.sweetener_name}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold shrink-0">4.</span>
                            <span>Stir with ice for 30 seconds</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold shrink-0">5.</span>
                            <span>Strain into rocks glass over a large cube</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold shrink-0">6.</span>
                            <span>Express orange peel, garnish</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
