// 30-bucket industry taxonomy (Phase 1).
// Keys are stable IDs (path-style); values are display labels.

export const INDUSTRY_BUCKETS = {
  // Energy
  'energy/oil_gas': 'Oil & Gas E&P',
  'energy/refining': 'Refining',
  'energy/midstream': 'Pipelines & Midstream',
  'energy/lng': 'LNG & Natural Gas',
  'energy/shipping': 'Marine Shipping',
  'energy/services': 'Oil & Gas Services',

  // Materials
  'materials/mining': 'Mining',
  'materials/chemicals': 'Chemicals',
  'materials/metals': 'Industrial Metals',
  'materials/agriculture': 'Agriculture & Fertilizers',

  // Industrials
  'industrials/defense': 'Defense Primes',
  'industrials/aerospace': 'Aerospace',
  'industrials/machinery': 'Industrial Machinery',
  'industrials/electrical': 'Electrical Equipment',
  'industrials/transportation': 'Rail / Trucking / Logistics',

  // Tech
  'tech/semiconductors': 'Semiconductors',
  'tech/software': 'Software',
  'tech/hardware': 'Hardware',
  'tech/cloud': 'Cloud & Internet Infrastructure',
  'tech/internet': 'Internet Services',

  // Financials
  'financials/banks': 'Banks',
  'financials/insurance': 'Insurance',
  'financials/asset_mgmt': 'Asset Management',
  'financials/exchanges': 'Exchanges',

  // Healthcare
  'healthcare/biotech': 'Biotech',
  'healthcare/pharma': 'Pharma',
  'healthcare/devices': 'Medical Devices',

  // Consumer
  'consumer/retail': 'Retail',
  'consumer/staples': 'Consumer Staples',
  'consumer/discretionary': 'Consumer Discretionary',

  // Utilities
  'utilities/power': 'Electric Utilities',
  'utilities/renewables': 'Renewable Energy',

  // Real Estate
  'real_estate/reits': 'REITs',

  // Crypto / Specialty
  'crypto/mining': 'Crypto Mining',
  'crypto/exchange': 'Crypto Exchange',
  'crypto/treasury': 'Crypto Treasury Companies',
} as const

export type IndustryBucket = keyof typeof INDUSTRY_BUCKETS

export function isIndustryBucket(s: string): s is IndustryBucket {
  return s in INDUSTRY_BUCKETS
}
