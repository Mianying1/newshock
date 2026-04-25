-- Tighten crypto_institutional_adoption archetype to keep BTC price/treasury
-- noise out of company-specific themes (e.g. Coinbase Payment License).
--
-- Audit (2026-04-24) found 6+ pure BTC price/treasury/ETF-flow events leaked
-- into "Coinbase Payment License · Stablecoin Infrastructure" theme:
--   - "Bitcoin trades above a make-or-break level..."
--   - "Strategy overtakes BlackRock IBIT in bitcoin holdings..."
--   - "U.S. crypto adoption is rebounding, bitcoin still dominates..."
--   - "Bitmine buys 101,627 ether worth over $230 million..."
--
-- Root cause: archetype shared between two themes (Coinbase-specific + BTC
-- Price Swings). Sonnet matches by name proximity, ignoring whether the
-- event is actually company-specific.
--
-- Fix: add scope-aware exclusion rules (rules reference target theme name).
-- Combined with the strengthen-existing exclusion check (98f3772), pure BTC
-- price events will bypass the Coinbase theme but still attach to BTC Price
-- Swings theme. Existing 6 events left in place — only future routing affected.

update theme_archetypes
set
  exclusion_rules = array[
    'Exclude routine altcoin volatility',
    'Exclude small crypto scams or exchange failures',
    'Exclude NFT-specific news',
    'GATING — The next 3 rules apply ONLY when the target theme name contains one of: "Coinbase", "COIN", "payment license", "stablecoin issuer", "stablecoin infrastructure", or names a specific exchange/issuer/payment-rail company. If the target theme name describes broad price action (e.g. contains "Price Swings", "Volatility", "BTC", "crypto market"), DO NOT apply rules 5-7 below — let the event through.',
    'When the gating clause above matches: pure BTC/ETH price-action news (above/below technical level, daily moves, ETF flow snapshot) without a company-specific or new-policy event do NOT trigger — those belong on a price-action theme instead.',
    'When the gating clause above matches: generic crypto adoption surveys, institutional-flow polls, or aggregate market-share reports without naming a specific issuer or rule change do NOT trigger.',
    'When the gating clause above matches: pure mining-pool or treasury-holding accumulation reports (BTC/ETH purchases by Strategy / Bitmine / corporate holders) do NOT trigger — route to a price-action or mining theme instead.'
  ],
  notes = coalesce(notes, '') || E'\n[2026-04-24] Tightened: scope-aware exclusion rules added so pure BTC price/treasury/ETF-flow events bypass company-specific themes (e.g. Coinbase Payment License) but still attach to BTC-price-action themes. Enforced via strengthen-existing archetype check (commit 98f3772).'
where id = 'crypto_institutional_adoption';
