import { config } from 'dotenv'
config({ path: '.env.local' })

import { generateTheme } from '@/lib/theme-generator'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function main() {
  console.log('=== 量子模拟测试开始 ===\n')

  // Step 1: 注入一条假新闻到 events 表
  const { data: fakeEvent, error: insertErr } = await supabaseAdmin
    .from('events')
    .insert({
      event_date: new Date().toISOString().split('T')[0],
      headline: 'NVIDIA Announces $1B Strategic Investment in IonQ for Quantum Computing Acceleration',
      source_name: 'Test · Quantum Scenario',
      source_url: 'https://test.example.com/quantum-' + Date.now(),
      raw_content: 'NVIDIA today announced a strategic $1 billion investment in IonQ Inc. (NYSE: IONQ), a leading quantum computing company. The deal includes joint development of hybrid quantum-classical AI systems, with NVIDIA providing GPU acceleration for IonQ\'s quantum simulation workflows. The investment also covers expanded use of NVIDIA CUDA Quantum platform across IonQ\'s commercial deployments. Other major quantum players including Rigetti Computing (NASDAQ: RGTI), D-Wave Quantum (NYSE: QBTS), and IBM Quantum are expected to face renewed competitive pressure as the quantum-AI integration race accelerates. Specialty foundries supporting quantum chip production may also see incremental demand.',
    })
    .select()
    .single()

  if (insertErr) {
    console.error('Insert failed:', insertErr)
    process.exit(1)
  }

  console.log('1. 注入假事件 ID:', fakeEvent.id)
  console.log('   Headline:', fakeEvent.headline, '\n')

  // Step 2: 跑 theme generator
  console.log('2. Running theme generator...')
  const result = await generateTheme(fakeEvent)
  console.log('   Result action:', result.action)
  console.log('   Theme ID:', result.theme_id || 'N/A')
  console.log('   Reasoning:', result.reasoning, '\n')

  // Step 3: 查生成的 theme + recommendations
  if (result.theme_id) {
    const { data: theme } = await supabaseAdmin
      .from('themes')
      .select('name, archetype_id, summary, classification_confidence')
      .eq('id', result.theme_id)
      .single()

    console.log('3. Generated theme:')
    console.log('   Name:', theme?.name)
    console.log('   Archetype:', theme?.archetype_id)
    console.log('   Summary:', theme?.summary)
    console.log('   Confidence:', theme?.classification_confidence, '\n')

    const { data: recs } = await supabaseAdmin
      .from('theme_recommendations')
      .select('ticker_symbol, tier, role_reasoning')
      .eq('theme_id', result.theme_id)
      .order('tier')

    console.log('4. Recommendations (in DB):')
    recs?.forEach((r) => {
      console.log(`   tier${r.tier}: ${r.ticker_symbol} - ${r.role_reasoning}`)
    })
    console.log('')
  }

  // Step 4: 检查 ticker_candidates (核心验证)
  const { data: candidates } = await supabaseAdmin
    .from('ticker_candidates')
    .select('symbol, mention_count, contexts, status')
    .order('first_seen_at', { ascending: false })

  console.log('5. Ticker candidates after run:')
  console.log('   Total candidates in table:', candidates?.length || 0)
  candidates?.forEach((c) => {
    const latestCtx = c.contexts?.[c.contexts.length - 1]
    console.log(`   - ${c.symbol} (mentions: ${c.mention_count}, status: ${c.status})`)
    console.log(`     latest reasoning: ${latestCtx?.role_reasoning || 'N/A'}`)
  })
  console.log('')

  // Step 5: 清理 - 删除假事件 + 它创建的 theme/recs (避免污染数据)
  console.log('6. Cleanup...')
  if (result.theme_id) {
    await supabaseAdmin.from('theme_recommendations').delete().eq('theme_id', result.theme_id)
    await supabaseAdmin.from('themes').delete().eq('id', result.theme_id)
  }
  await supabaseAdmin.from('events').delete().eq('id', fakeEvent.id)

  // 注意: 不清理 ticker_candidates, 因为这是真实捕获的有价值数据
  // 即使从假新闻来, IONQ/RGTI/QBTS 也是真实存在的票, 留着供 review 用

  console.log('   假事件 + theme + recs 已清理')
  console.log('   ticker_candidates 保留 (真实价值数据)\n')

  console.log('=== 测试结束 ===')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
