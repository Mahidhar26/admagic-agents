// One live call to admagic_analyze_creative (costs 1 AdMagic analysis): prints the raw response and what toAnalysis() makes of it.
// Run: node --env-file=.env.local --import tsx scripts/check-admagic.ts [image_url]
import { callTool, toAnalysis } from '../lib/admagic';

const url = process.argv[2] ?? 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800';
async function main() {
  if (!process.env.ADMAGIC_API_KEY) throw new Error('Set ADMAGIC_API_KEY in .env.local');
  const raw = await callTool('admagic_analyze_creative', { image_url: url, objective: 'engagement' });
  console.log('RAW:\n' + JSON.stringify(raw, null, 2));
  console.log('\nMAPPED:\n' + JSON.stringify(toAnalysis(raw), null, 2));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
