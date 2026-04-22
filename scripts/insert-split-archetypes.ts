import { config } from 'dotenv'
config({ path: '.env.local' })

interface NewArch {
  id: string
  name: string
  category: string
  description: string
  trigger_keywords: string[]
  typical_duration_days_min: number
  typical_duration_days_max: number
  confidence_level: string
}

const NEW_ARCHETYPES: NewArch[] = [
  {
    id: 'crypto_etf_products',
    name: 'Crypto ETF & Investment Products',
    category: 'macro_monetary',
    description:
      'Bitcoin and crypto spot ETFs, institutional investment vehicle approvals, and their associated fund flows drive revaluation of crypto infrastructure and custody plays.',
    trigger_keywords: ['Bitcoin ETF', 'crypto ETF', 'spot ETF', 'ETF flows', 'ETF approval'],
    typical_duration_days_min: 180,
    typical_duration_days_max: 540,
    confidence_level: 'high',
  },
  {
    id: 'stablecoin_regulation',
    name: 'Stablecoin Regulation & Infrastructure',
    category: 'macro_monetary',
    description:
      'Regulatory frameworks, payment licenses, and infrastructure development specific to stablecoins and payment tokens revalue issuers, rails, and payment processors.',
    trigger_keywords: ['stablecoin', 'payment license', 'stablecoin regulation', 'USDC', 'digital dollar'],
    typical_duration_days_min: 180,
    typical_duration_days_max: 540,
    confidence_level: 'high',
  },
  {
    id: 'corporate_btc_treasury',
    name: 'Corporate Bitcoin Treasury Adoption',
    category: 'macro_monetary',
    description:
      'Public companies adding Bitcoin to balance sheets as treasury reserve asset; waves of adoption revalue crypto-native firms and BTC-proxy equities.',
    trigger_keywords: ['BTC treasury', 'corporate Bitcoin', 'balance sheet BTC', 'treasury reserve', 'MicroStrategy'],
    typical_duration_days_min: 180,
    typical_duration_days_max: 540,
    confidence_level: 'medium',
  },
  {
    id: 'crypto_exchange_custody',
    name: 'Crypto Exchange & Custody Infrastructure',
    category: 'macro_monetary',
    description:
      'Institutional crypto custody solutions, exchange licensing, and digital asset infrastructure buildout drive multi-year revaluation of exchanges, custodians, and prime brokers.',
    trigger_keywords: ['crypto custody', 'exchange license', 'digital asset infrastructure', 'qualified custody', 'institutional custody'],
    typical_duration_days_min: 365,
    typical_duration_days_max: 1095,
    confidence_level: 'medium',
  },
  {
    id: 'crypto_policy_framework',
    name: 'Crypto Regulatory Policy & SEC Actions',
    category: 'macro_monetary',
    description:
      'Broad SEC regulatory decisions, crypto asset classification frameworks, and federal crypto policy developments set the rules that drive crypto-sector revaluation.',
    trigger_keywords: ['SEC crypto', 'crypto regulation', 'digital asset policy', 'crypto framework', 'SEC approval'],
    typical_duration_days_min: 180,
    typical_duration_days_max: 540,
    confidence_level: 'high',
  },
  {
    id: 'us_china_semiconductor_controls',
    name: 'U.S. Semiconductor Export Controls · China',
    category: 'geopolitical',
    description:
      'U.S. restrictions on advanced chip exports, semiconductor manufacturing equipment, and related technology transfers to China drive localization efforts in Chinese semiconductor supply chain.',
    trigger_keywords: ['chip ban', 'semiconductor export control', 'ASML restriction', 'EUV ban', 'advanced node restriction'],
    typical_duration_days_min: 730,
    typical_duration_days_max: 1825,
    confidence_level: 'high',
  },
  {
    id: 'us_china_tariff_import_costs',
    name: 'U.S.-China Tariff Imposition · Import Cost',
    category: 'geopolitical',
    description:
      'Direct impact of U.S. tariff increases on Chinese goods raising import costs, reducing demand for Chinese exports, or triggering retaliatory tariffs.',
    trigger_keywords: ['tariff increase', 'Section 301', 'customs duty', 'tariff rate hike', 'import tax'],
    typical_duration_days_min: 180,
    typical_duration_days_max: 540,
    confidence_level: 'high',
  },
  {
    id: 'china_critical_materials_substitution',
    name: 'China Critical Materials Localization',
    category: 'geopolitical',
    description:
      'Chinese domestic substitution demand for rare earths, strategic minerals, and upstream materials due to supply chain security concerns drives multi-year revaluation of local suppliers.',
    trigger_keywords: ['rare earth substitution', 'critical mineral localization', 'strategic material stockpile', 'domestic sourcing priority', 'mineral self-sufficiency'],
    typical_duration_days_min: 730,
    typical_duration_days_max: 1825,
    confidence_level: 'medium',
  },
  {
    id: 'us_entity_list_technology_access',
    name: 'U.S. Entity List · Technology Access Restriction',
    category: 'geopolitical',
    description:
      'Addition of Chinese firms to U.S. Entity List or similar restricted parties lists curtails their access to U.S. technology, components, and software.',
    trigger_keywords: ['entity list', 'BIS blacklist', 'restricted parties', 'denied persons', 'export privilege denial'],
    typical_duration_days_min: 180,
    typical_duration_days_max: 540,
    confidence_level: 'high',
  },
  {
    id: 'us_china_technology_decoupling',
    name: 'U.S.-China Technology Decoupling · Supply Chain',
    category: 'geopolitical',
    description:
      'Broad strategic decoupling initiatives forcing bifurcation of technology supply chains, standards, and ecosystems between U.S. and Chinese spheres drive multi-year structural capex cycles.',
    trigger_keywords: ['technology decoupling', 'supply chain bifurcation', 'tech cold war', 'dual ecosystem', 'strategic competition'],
    typical_duration_days_min: 1095,
    typical_duration_days_max: 1825,
    confidence_level: 'medium',
  },
  {
    id: 'ai_datacenter_power_demand',
    name: 'AI Data Center Power Demand',
    category: 'tech_breakthrough',
    description:
      'Explosive electricity consumption from AI compute infrastructure driving power purchase agreements, grid capacity investments, and utility revaluations over a multi-year buildout.',
    trigger_keywords: ['data center power', 'AI power consumption', 'hyperscaler PPA', 'compute power demand', 'data center electricity'],
    typical_duration_days_min: 730,
    typical_duration_days_max: 1825,
    confidence_level: 'high',
  },
  {
    id: 'nuclear_renaissance_smr',
    name: 'Nuclear Renaissance · SMR Commercialization',
    category: 'tech_breakthrough',
    description:
      'Small modular reactor deployment, nuclear supply chain expansion, and regulatory approvals revitalizing nuclear energy as clean baseload power over a multi-year commercialization cycle.',
    trigger_keywords: ['SMR contract', 'nuclear power deal', 'nuclear revival', 'reactor approval', 'nuclear supply chain'],
    typical_duration_days_min: 730,
    typical_duration_days_max: 1825,
    confidence_level: 'medium',
  },
  {
    id: 'grid_modernization_storage',
    name: 'Grid Modernization · Energy Storage',
    category: 'tech_breakthrough',
    description:
      'Large-scale battery storage deployment, transmission infrastructure upgrades, and grid capacity expansion enabling renewable integration and reliability over a multi-year capex cycle.',
    trigger_keywords: ['energy storage deployment', 'grid capacity', 'transmission investment', 'battery storage', 'grid modernization'],
    typical_duration_days_min: 730,
    typical_duration_days_max: 1825,
    confidence_level: 'medium',
  },
  {
    id: 'clean_energy_offtake',
    name: 'Clean Energy Corporate Offtake',
    category: 'tech_breakthrough',
    description:
      'Long-term power purchase agreements from corporations driving renewable project financing and clean energy infrastructure build-out over multi-year horizons.',
    trigger_keywords: ['power purchase agreement', 'clean energy demand', 'corporate PPA', 'renewable offtake', 'clean power contract'],
    typical_duration_days_min: 365,
    typical_duration_days_max: 1095,
    confidence_level: 'medium',
  },
]

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const ids = NEW_ARCHETYPES.map((a) => a.id)
  const { data: existing } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id')
    .in('id', ids)
  const existingSet = new Set((existing ?? []).map((r) => r.id))

  const toInsert = NEW_ARCHETYPES.filter((a) => !existingSet.has(a.id)).map((a) => ({
    ...a,
    is_active: true,
    pipeline_status: 'pending' as const,
    created_by: 'split-2026-04-21',
    notes: `Created from split of broad parent archetype on 2026-04-21.`,
  }))

  if (toInsert.length === 0) {
    console.log('All 14 archetypes already exist. Skipping insert.')
  } else {
    console.log(`Inserting ${toInsert.length} new archetypes...`)
    const { error } = await supabaseAdmin.from('theme_archetypes').insert(toInsert)
    if (error) {
      console.error('Insert error:', error.message)
      process.exit(1)
    }
  }

  const { data: finalRows } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, category, pipeline_status, typical_duration_days_min, typical_duration_days_max')
    .in('id', ids)
    .order('id')

  console.log(`\n=== 14 sub-archetypes present ===`)
  for (const r of finalRows ?? []) {
    console.log(`  ${r.id.padEnd(42)} [${r.category}] ${r.typical_duration_days_min}-${r.typical_duration_days_max}d  status=${r.pipeline_status}`)
  }
}

main().catch(console.error)
