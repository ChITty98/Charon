import { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Toggle } from '../components/ui/Toggle';
import { Slider } from '../components/ui/Slider';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';
import { useNavigate } from 'react-router-dom';

/* ---- Types ---- */

interface HueLight {
  id: string;
  name: string;
  on: boolean;
  brightness: number;
  reachable: boolean;
  type: string;
}

interface HueGroupRaw {
  id: string;
  name: string;
  on: boolean;
  brightness: number;
  lights: string[]; // light IDs
  type: string;
}

interface HueGroup {
  id: string;
  name: string;
  on: boolean;
  brightness: number;
  lights: HueLight[];
  type: string;
}

interface NanoleafState {
  on: boolean;
  brightness: number;
  effect: string;
  effects: string[];
}

/* ---- Icons ---- */

const bulbIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z" />
  </svg>
);

const sunIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const leafIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 8C8 10 5.9 16.17 3.82 21.34L2 21l.73-2.64C4.4 13.05 6.13 7.64 17 6V3l4 5-4 5v-5z" />
  </svg>
);

const chevronDown = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const chevronUp = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 15l-6-6-6 6" />
  </svg>
);

/* ---- Component ---- */

export function Lights() {
  const navigate = useNavigate();
  const [allLights, setAllLights] = useState<HueLight[]>([]);
  const [groups, setGroups] = useState<HueGroup[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [hueConfigured, setHueConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [allOn, setAllOn] = useState(false);
  const [allBrightness, setAllBrightness] = useState(100);

  // Nanoleaf
  const [nanoleaf, setNanoleaf] = useState<NanoleafState | null>(null);

  useEffect(() => {
    async function loadHue() {
      try {
        // Fetch lights, groups, and zone mappings in parallel
        const [lightsData, groupsData, zoneMappings] = await Promise.all([
          api.get<HueLight[]>('/hue/lights'),
          api.get<HueGroupRaw[]>('/hue/groups'),
          api.get<Record<string, string>>('/zones'),
        ]);

        if (lightsData.length === 0 && groupsData.length === 0) {
          setHueConfigured(false);
          setLoading(false);
          return;
        }

        setAllLights(lightsData);

        // Build a lookup of lights by ID
        const lightMap = new Map<string, HueLight>();
        for (const l of lightsData) {
          lightMap.set(l.id, l);
        }

        // Only show groups that are assigned to a zone (keeps the house lights out)
        const assignedGroupIds = new Set(Object.values(zoneMappings).filter(Boolean));

        const rooms: HueGroup[] = groupsData
          .filter((g) => assignedGroupIds.has(g.id))
          .map((g) => ({
            ...g,
            lights: g.lights
              .map((id) => lightMap.get(id))
              .filter((l): l is HueLight => l != null),
          }));

        setGroups(rooms);
        setAllOn(rooms.some((g) => g.on));
        setAllBrightness(
          rooms.length > 0
            ? Math.round(rooms.reduce((s, g) => s + g.brightness, 0) / rooms.length)
            : 100,
        );

        // If no zones mapped yet, show setup prompt
        if (assignedGroupIds.size === 0) {
          setHueConfigured(false);
        }
      } catch {
        setHueConfigured(false);
      }
      setLoading(false);
    }

    loadHue();

    api
      .get<NanoleafState>('/nanoleaf/info')
      .then((info) => {
        if (info) {
          setNanoleaf({
            on: info.on,
            brightness: info.brightness,
            effect: '',
            effects: [],
          });
          // Fetch effects list
          api.get<string[]>('/nanoleaf/effects').then((effects) => {
            setNanoleaf((prev) => prev && { ...prev, effects });
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  useSocket<{ type: string }>('device-update', () => {
    // Refresh on device updates
  });

  const toggleGroup = async (groupId: string, on: boolean) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, on } : g)),
    );
    await api.put(`/hue/groups/${groupId}`, { on }).catch(() => {});
  };

  const setGroupBrightness = async (groupId: string, brightness: number) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, brightness } : g)),
    );
    await api.put(`/hue/groups/${groupId}`, { brightness }).catch(() => {});
  };

  const toggleLight = async (groupId: string, lightId: string, on: boolean) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              lights: g.lights.map((l) =>
                l.id === lightId ? { ...l, on } : l,
              ),
            }
          : g,
      ),
    );
    await api.put(`/hue/lights/${lightId}`, { on }).catch(() => {});
  };

  const setLightBrightness = async (lightId: string, brightness: number) => {
    await api.put(`/hue/lights/${lightId}`, { brightness }).catch(() => {});
  };

  const setLightColor = async (lightId: string, color: string) => {
    await api.put(`/hue/lights/${lightId}`, { color }).catch(() => {});
  };

  const setGroupColor = async (groupId: string, color: string) => {
    await api.put(`/hue/groups/${groupId}`, { color }).catch(() => {});
  };

  const toggleAllLights = async (on: boolean) => {
    setAllOn(on);
    // Control only assigned zone groups, NOT group 0 (all house lights)
    for (const g of groups) {
      api.put(`/hue/groups/${g.id}`, { on }).catch(() => {});
    }
  };

  const setMasterBrightness = async (brightness: number) => {
    setAllBrightness(brightness);
    for (const g of groups) {
      api.put(`/hue/groups/${g.id}`, { brightness }).catch(() => {});
    }
  };

  if (loading) {
    return (
      <div className="p-5 pb-2 animate-fade-in">
        <h1 className="text-[28px] font-bold text-text-primary mb-5">Lights</h1>
        <p className="text-text-muted text-center py-10">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-5 pb-2 animate-fade-in">
      <h1 className="text-[28px] font-bold text-text-primary mb-5">Lights</h1>

      {!hueConfigured ? (
        <Card className="text-center py-10 mb-6">
          <div className="text-text-muted mb-3 flex justify-center">{bulbIcon}</div>
          <h3 className="text-[20px] font-bold text-text-primary mb-2">
            Set up your lights
          </h3>
          <p className="text-text-secondary text-[16px] mb-5">
            Connect your Hue Bridge and assign rooms to zones in Settings
          </p>
          <Button variant="primary" size="sm" onClick={() => navigate('/settings')}>
            Go to Settings
          </Button>
        </Card>
      ) : (
        <>
          {/* Master control */}
          <Card className="mb-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[20px] font-bold text-text-primary">
                All Lower Level
              </h2>
              <Toggle checked={allOn} onChange={toggleAllLights} size="md" />
            </div>
            <Slider
              value={allBrightness}
              onChange={setMasterBrightness}
              label="Brightness"
              icon={sunIcon}
              color="#f59e0b"
            />
          </Card>

          {/* Room cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            {groups.map((group) => {
              const isExpanded = expandedGroup === group.id;
              return (
                <Card
                  key={group.id}
                  onClick={() =>
                    setExpandedGroup(isExpanded ? null : group.id)
                  }
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <span className="text-text-muted">
                        {isExpanded ? chevronUp : chevronDown}
                      </span>
                      <div>
                        <h3 className="text-[18px] font-bold text-text-primary">
                          {group.name}
                        </h3>
                        <p className="text-[14px] text-text-muted">
                          {group.lights.length} light
                          {group.lights.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-3"
                    >
                      <Toggle
                        checked={group.on}
                        onChange={(on) => toggleGroup(group.id, on)}
                        size="md"
                      />
                    </div>
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    <Slider
                      value={group.brightness}
                      onChange={(v) => setGroupBrightness(group.id, v)}
                      icon={sunIcon}
                      color="#3b82f6"
                      disabled={!group.on}
                    />
                    {/* Quick color swatches for the whole room */}
                    {group.on && (
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {['#ffffff','#ff8c00','#ff4444','#ff00ff','#8b5cf6','#3b82f6','#06b6d4','#22c55e','#f59e0b'].map(c => (
                          <button
                            key={c}
                            onClick={() => setGroupColor(group.id, c)}
                            className="w-[40px] h-[40px] rounded-full border-2 border-surface-500 active:scale-90 transition-transform"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Expanded: individual lights */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-surface-600 space-y-4 animate-fade-in">
                      {group.lights.map((light) => (
                        <div key={light.id}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${light.reachable ? (light.on ? 'bg-accent-green' : 'bg-surface-500') : 'bg-accent-red'}`} />
                              <span className="text-[16px] text-text-secondary">
                                {light.name}
                              </span>
                            </div>
                            <Toggle
                              checked={light.on}
                              onChange={(on) =>
                                toggleLight(group.id, light.id, on)
                              }
                              size="md"
                            />
                          </div>
                          <Slider
                            value={light.brightness}
                            onChange={(v) => setLightBrightness(light.id, v)}
                            icon={sunIcon}
                            color="#3b82f6"
                            disabled={!light.on}
                            showValue={false}
                          />
                          {light.on && (
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {['#ffffff','#ff8c00','#ff4444','#ff00ff','#8b5cf6','#3b82f6','#06b6d4','#22c55e','#f59e0b'].map(c => (
                                <button
                                  key={c}
                                  onClick={() => setLightColor(light.id, c)}
                                  className="w-[32px] h-[32px] rounded-full border-2 border-surface-500 active:scale-90 transition-transform"
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {groups.length === 0 && allLights.length > 0 && (
            <Card className="text-center py-6 mb-6">
              <p className="text-text-secondary text-[16px]">
                {allLights.length} lights found but no rooms configured on the Hue Bridge.
                <br />
                <span className="text-text-muted text-[14px]">
                  Set up rooms in the Philips Hue app to organize your lights here.
                </span>
              </p>
            </Card>
          )}
        </>
      )}

      {/* Nanoleaf section */}
      {nanoleaf && (
        <>
          <h2 className="text-[22px] font-bold text-text-primary mb-4 flex items-center gap-2">
            {leafIcon} Nanoleaf
          </h2>
          <Card>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[18px] font-semibold text-text-primary">
                Power
              </span>
              <Toggle
                checked={nanoleaf.on}
                onChange={async (on) => {
                  setNanoleaf((prev) => prev && { ...prev, on });
                  await api.put('/nanoleaf/state', { power: on }).catch(() => {});
                }}
                size="md"
              />
            </div>
            <Slider
              value={nanoleaf.brightness}
              onChange={async (brightness) => {
                setNanoleaf((prev) => prev && { ...prev, brightness });
                await api
                  .put('/nanoleaf/state', { brightness })
                  .catch(() => {});
              }}
              label="Brightness"
              icon={sunIcon}
              color="#22c55e"
              disabled={!nanoleaf.on}
            />
            {/* Effect picker */}
            {nanoleaf.effects.length > 0 && (
              <div className="mt-4">
                <label className="block text-text-secondary text-[16px] mb-2">
                  Effect
                </label>
                <select
                  value={nanoleaf.effect}
                  onChange={async (e) => {
                    const effect = e.target.value;
                    setNanoleaf((prev) => prev && { ...prev, effect });
                    await api
                      .put('/nanoleaf/state', { effect })
                      .catch(() => {});
                  }}
                  className="w-full h-[48px] bg-surface-600 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] appearance-none"
                >
                  {nanoleaf.effects.map((fx) => (
                    <option key={fx} value={fx}>
                      {fx}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
