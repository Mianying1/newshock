import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'
import { type IndustryBucket } from '@/lib/industry-buckets'

interface ManualOverride {
  ticker: string
  industry_buckets: IndustryBucket[]
  primary_bucket: IndustryBucket
  reason: string
}

const MANUAL_OVERRIDES: ManualOverride[] = [
  {
    ticker: 'AMZN',
    industry_buckets: ['consumer/retail', 'tech/cloud'],
    primary_bucket: 'tech/cloud',
    reason: 'AWS 是核心利润源 · 必须挂 cloud bucket',
  },
  {
    ticker: 'GOOGL',
    industry_buckets: ['tech/internet', 'tech/cloud'],
    primary_bucket: 'tech/internet',
    reason: 'Google Cloud 是第二增长曲线',
  },
  {
    ticker: 'GOOG',
    industry_buckets: ['tech/internet', 'tech/cloud'],
    primary_bucket: 'tech/internet',
    reason: 'GOOGL/GOOG 双类股 · 同一公司',
  },
  {
    ticker: 'MSFT',
    industry_buckets: ['tech/software', 'tech/cloud'],
    primary_bucket: 'tech/cloud',
    reason: 'Azure 是核心增长',
  },
  {
    ticker: 'BRK.B',
    industry_buckets: ['financials/insurance', 'financials/asset_mgmt'],
    primary_bucket: 'financials/asset_mgmt',
    reason: 'Conglomerate · 但本质是 capital allocator',
  },
  {
    ticker: 'BRK-B',
    industry_buckets: ['financials/insurance', 'financials/asset_mgmt'],
    primary_bucket: 'financials/asset_mgmt',
    reason: 'BRK.B 别名',
  },
  {
    ticker: 'STNG',
    industry_buckets: ['energy/shipping', 'energy/oil_gas'],
    primary_bucket: 'energy/shipping',
    reason: 'Product tanker · 同时受航运运价和油价驱动',
  },
  {
    ticker: 'XOM',
    industry_buckets: ['energy/oil_gas', 'energy/refining'],
    primary_bucket: 'energy/oil_gas',
    reason: 'Integrated major · 上下游全产业链',
  },
  {
    ticker: 'CVX',
    industry_buckets: ['energy/oil_gas', 'energy/refining'],
    primary_bucket: 'energy/oil_gas',
    reason: 'Integrated major',
  },
  {
    ticker: 'COIN',
    industry_buckets: ['financials/exchanges', 'crypto/exchange'],
    primary_bucket: 'crypto/exchange',
    reason: 'Crypto exchange 主业',
  },
  {
    ticker: 'MSTR',
    industry_buckets: ['tech/software', 'crypto/treasury'],
    primary_bucket: 'crypto/treasury',
    reason: 'Bitcoin treasury 主导估值',
  },
  {
    ticker: 'TSLA',
    industry_buckets: ['consumer/discretionary', 'industrials/electrical', 'tech/hardware'],
    primary_bucket: 'consumer/discretionary',
    reason: 'EV + 能源 + AI · 多业务',
  },
  {
    ticker: 'VRT',
    industry_buckets: ['industrials/electrical', 'tech/cloud'],
    primary_bucket: 'industrials/electrical',
    reason: 'Vertiv 数据中心电力/散热 · 是 AI Capex 直接受益方',
  },
]

async function main() {
  let applied = 0
  let missing = 0
  for (const ov of MANUAL_OVERRIDES) {
    const { data: existing, error: selErr } = await supabaseAdmin
      .from('ticker_industry_map')
      .select('ticker')
      .eq('ticker', ov.ticker)
      .maybeSingle()
    if (selErr) {
      console.error(`  ${ov.ticker}: select error: ${selErr.message}`)
      continue
    }
    if (!existing) {
      console.warn(`  ${ov.ticker}: not in main table — skipping override`)
      missing++
      continue
    }
    const { error: updErr } = await supabaseAdmin
      .from('ticker_industry_map')
      .update({
        industry_buckets: ov.industry_buckets,
        primary_bucket: ov.primary_bucket,
        manual_override_reason: ov.reason,
        source: 'manual_override',
        updated_at: new Date().toISOString(),
      })
      .eq('ticker', ov.ticker)
    if (updErr) {
      console.error(`  ${ov.ticker}: update error: ${updErr.message}`)
      continue
    }
    console.log(`  ${ov.ticker}: → primary=${ov.primary_bucket} · buckets=[${ov.industry_buckets.join(',')}]`)
    applied++
  }
  console.log(`\napplied ${applied}/${MANUAL_OVERRIDES.length} (missing ${missing})`)
}

main().catch(e => { console.error(e); process.exit(1) })
