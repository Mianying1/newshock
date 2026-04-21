import { config } from 'dotenv'
config({ path: '.env.localc' })

const NEW_ARCHETYPES = [
  {
    id: 'agriculture_supply_shock',
    name: 'Agricultural Supply Shock',
    category: 'supply_chain',
    description: 'Disruptions to fertilizer, grain, or crop supply that drive commodity prices and benefit agri-commodity producers',
    trigger_keywords: ['fertilizer supply','potash shortage','phosphate','nitrogen prices','grain supply','crop yield','agri-commodity','wheat export ban','Ukraine grain'],
    typical_tickers: { tier1: ['NTR','MOS','CF'], tier2: ['ADM','BG','CTVA'], tier3: ['FMC','DE','AGCO'] },
    exclusion_rules: ['Exclude large-cap diversified conglomerates not specific to agri-commodity supply','Exclude single-farm news without sector implications','Exclude consumer food brands (not raw commodity exposure)'],
    typical_duration_days_min: 60,
    typical_duration_days_max: 120,
    is_active: true,
    created_by: 'manual_v1',
    confidence_level: 'high',
  },
  {
    id: 'obesity_drug_breakthrough',
    name: 'GLP-1 / Obesity Drug Breakthrough',
    category: 'tech_breakthrough',
    description: 'New clinical trial results, FDA approvals, or expanded indications for GLP-1 and obesity drugs',
    trigger_keywords: ['GLP-1','obesity drug','Wegovy','Zepbound','Mounjaro','weight loss drug','semaglutide','tirzepatide','anti-obesity'],
    typical_tickers: { tier1: ['LLY','NVO'], tier2: ['VKTX','MRK','AMGN'], tier3: ['PFE','REGN'] },
    exclusion_rules: ['Exclude unrelated biotech not in metabolic/obesity space','Exclude diet/nutrition consumer products','Exclude generic drug manufacturer news'],
    typical_duration_days_min: 90,
    typical_duration_days_max: 180,
    is_active: true,
    created_by: 'manual_v1',
    confidence_level: 'high',
  },
  {
    id: 'defense_buildup',
    name: 'Defense Buildup & Military Contracts',
    category: 'geopolitical',
    description: 'Increased defense spending, major weapons contracts, or NATO frontier buildup',
    trigger_keywords: ['defense budget','military contract','Patriot missile','F-35','arms deal','NATO spending','defense procurement','weapons system','foreign military sale'],
    typical_tickers: { tier1: ['LMT','RTX','NOC','GD'], tier2: ['LHX','HII','KTOS'], tier3: ['LDOS','TXT'] },
    exclusion_rules: ['Exclude one-time small contracts under $100M','Distinguish from civilian aerospace (Boeing commercial)','Exclude defense-related cyber/software unless major'],
    typical_duration_days_min: 90,
    typical_duration_days_max: 240,
    is_active: true,
    created_by: 'manual_v1',
    confidence_level: 'high',
  },
  {
    id: 'ev_supply_chain_shift',
    name: 'EV Supply Chain Shift',
    category: 'supply_chain',
    description: 'Shifts in EV battery supply chain, lithium dynamics, or tariff/policy changes affecting EV producers',
    trigger_keywords: ['EV battery','lithium supply','cathode material','EV tariff','Chinese EV','battery manufacturing','charging infrastructure','battery recycling'],
    typical_tickers: { tier1: ['ALB','SQM','LTHM'], tier2: ['F','GM','RIVN','LCID'], tier3: ['TSLA','BYDDY'] },
    exclusion_rules: ['Exclude Tesla-specific news unless sector implications','Exclude auto recalls without strategic impact','Exclude consumer-level EV reviews'],
    typical_duration_days_min: 60,
    typical_duration_days_max: 180,
    is_active: true,
    created_by: 'manual_v1',
    confidence_level: 'high',
  },
  {
    id: 'crypto_institutional_adoption',
    name: 'Crypto Institutional Adoption',
    category: 'macro_monetary',
    description: 'Bitcoin ETF flows, stablecoin regulation, corporate BTC treasury moves, or major institutional crypto adoption',
    trigger_keywords: ['Bitcoin ETF','crypto regulation','stablecoin','institutional crypto','SEC crypto approval','BTC treasury','digital asset','crypto custody'],
    typical_tickers: { tier1: ['COIN','MSTR','IBIT'], tier2: ['MARA','RIOT','CLSK'], tier3: ['HOOD','SQ'] },
    exclusion_rules: ['Exclude routine altcoin volatility','Exclude small crypto scams or exchange failures','Exclude NFT-specific news'],
    typical_duration_days_min: 60,
    typical_duration_days_max: 120,
    is_active: true,
    created_by: 'manual_v1',
    confidence_level: 'high',
  },
  {
    id: 'consumer_polarization',
    name: 'Consumer Spending Polarization',
    category: 'macro_monetary',
    description: 'K-shaped consumer divergence: luxury demand strength coexisting with discount retail growth',
    trigger_keywords: ['consumer spending divergence','luxury demand','dollar store growth','discount retail','premium pricing','trade-down behavior','K-shaped consumer','middle-class squeeze'],
    typical_tickers: { tier1: ['LVMUY','RH','DLTR','DG'], tier2: ['CMG','TJX','WMT','COST'], tier3: ['TGT','MCD'] },
    exclusion_rules: ['Exclude single-company sales updates','Require macro-level data or sector trend','Exclude e-commerce-specific news'],
    typical_duration_days_min: 90,
    typical_duration_days_max: 180,
    is_active: true,
    created_by: 'manual_v1',
    confidence_level: 'high',
  },
]

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { error } = await supabase.from('theme_archetypes').upsert(NEW_ARCHETYPES, { onConflict: 'id', ignoreDuplicates: false })
  if (error) { console.error('Insert error:', error); process.exit(1) }
  console.log(`Inserted/updated ${NEW_ARCHETYPES.length} archetypes`)

  const { count } = await supabase.from('theme_archetypes').select('*', { count: 'exact', head: true }).eq('is_active', true)
  console.log(`Total active archetypes: ${count}`)
}

main().catch(e => { console.error(e); process.exit(1) })
