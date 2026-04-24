import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  // Pull one example of each headline format
  const { data: oldFmt } = await supabaseAdmin
    .from('events')
    .select('id, headline, source_url, raw_content, event_date')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .ilike('headline', '8-K -%')
    .limit(2)
  const { data: newFmt } = await supabaseAdmin
    .from('events')
    .select('id, headline, source_url, raw_content, event_date')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .ilike('headline', '%files 8-K%')
    .limit(2)

  const { count: oldCount } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .ilike('headline', '8-K -%')
  const { count: newCount } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .ilike('headline', '%files 8-K%')

  console.log(`headline format distribution:`)
  console.log(`  "8-K - COMPANY (CIK) (Filer)" :  ${oldCount}`)
  console.log(`  "<company> files 8-K:"        :  ${newCount}`)

  const data = [...(oldFmt ?? []), ...(newFmt ?? [])]
  for (const e of data) {
    console.log(`\nid: ${e.id}  event_date=${e.event_date}`)
    console.log(`headline:   ${e.headline}`)
    console.log(`source_url: ${e.source_url}`)
    const rc = e.raw_content ?? ''
    console.log(`raw_content: ${rc.slice(0, 400)}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
