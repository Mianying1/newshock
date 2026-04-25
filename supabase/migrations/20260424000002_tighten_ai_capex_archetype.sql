-- Tighten ai_capex_infrastructure archetype routing.
--
-- Audit (2026-04-24) found 45% of events on this theme were mis-attached:
--   - DeepSeek V4 (model release · belongs to ai_model_breakthrough)
--   - SK Hynix Q1 profit (earnings · not capex)
--   - NEC Anthropic tie-up (software partnership · not capex)
--   - Bloom Energy 23% (power · belongs to ai_datacenter_power_demand)
--   - Nuclear's AI Moment (power · belongs to ai_datacenter_power_demand)
--
-- Root cause: 6 broad keywords ("AI power", "optical interconnect",
-- "hyperscaler spending", etc.) + ZERO exclusion_rules made this the
-- catchall sink for everything AI-adjacent.
--
-- Fix: tighten keywords to capex-spend signals only; add exclusion rules
-- that explicitly route to siblings (ai_datacenter_power_demand,
-- cpo_photonics_rotation, ai_model_breakthrough, ai_inference_chip_race,
-- hyperscaler_mega_capex). Existing 37 events untouched.

update theme_archetypes
set
  description = 'Mid-tier AI infrastructure capex: neocloud / contractor / supply-chain capital spending on datacenter buildout, server orders, and facility construction. Bounded BELOW by sub-$5B scale (above that, use hyperscaler_mega_capex) and bounded LATERALLY by topic siblings (power → ai_datacenter_power_demand; CPO → cpo_photonics_rotation; model release → ai_model_breakthrough; inference ASIC → ai_inference_chip_race).',
  trigger_keywords = array[
    'AI server orders',
    'datacenter construction',
    'neocloud capex',
    'AI infrastructure spend',
    'GPU procurement',
    'AI facility build',
    'datacenter contract win',
    'AI capex commitment'
  ],
  exclusion_rules = array[
    'Pure power / electricity / PPA / nuclear / fuel-cell / utility-grid events do NOT trigger — use ai_datacenter_power_demand instead.',
    'CPO / silicon photonics / 800G / 1.6T / transceiver-specific events do NOT trigger — use cpo_photonics_rotation instead.',
    'AI model releases, foundation-model launches, API price changes, AI software partnerships do NOT trigger — use ai_model_breakthrough or mark exploratory.',
    '$5B+ hyperscaler gigawatt-scale single-project announcements do NOT trigger — use hyperscaler_mega_capex instead.',
    'Custom inference ASIC / hyperscaler in-house silicon / EDA-IP capex events do NOT trigger — use ai_inference_chip_race instead.',
    'Pure quarterly earnings reports without an explicit forward capex commitment do NOT trigger.',
    'Single-supplier order wins under $100M do NOT trigger (sub-scale, single-issuer noise).'
  ],
  notes = coalesce(notes, '') || E'\n[2026-04-24] Tightened: scope narrowed to mid-tier supply-chain capex; sibling routing enforced via exclusion_rules to reduce 45% noise rate observed in audit.'
where id = 'ai_capex_infrastructure';
