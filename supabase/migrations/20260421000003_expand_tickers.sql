-- Expand tickers DB: Agriculture, Pharma/Biotech, Defense, EV/Battery,
-- Crypto, REITs, Shipping, Consumer, Cannabis, Gold/Miners, Clean Energy

INSERT INTO tickers (symbol, company_name, sector, industry, market_cap_usd_b)
VALUES
  -- ─── Agriculture / Fertilizer / Food ─────────────────────────────────────
  ('NTR',   'Nutrien Ltd',                   'agriculture',    'agri-chemicals',          25),
  ('MOS',   'Mosaic Co',                     'agriculture',    'fertilizers',             12),
  ('CF',    'CF Industries Holdings',        'agriculture',    'nitrogen fertilizers',    17),
  ('ADM',   'Archer-Daniels-Midland',        'agriculture',    'agri-commodities',        28),
  ('BG',    'Bunge Global',                  'agriculture',    'agri-commodities',        14),
  ('DE',    'Deere & Company',               'agriculture',    'farm equipment',         110),
  ('AGCO',  'AGCO Corp',                     'agriculture',    'farm equipment',           8),
  ('FMC',   'FMC Corp',                      'agriculture',    'agri-chemicals',           6),
  ('CTVA',  'Corteva Inc',                   'agriculture',    'seeds/crop protection',   40),
  ('SMG',   'Scotts Miracle-Gro',            'agriculture',    'consumer agri',            3),

  -- ─── Pharma / Biotech / GLP-1 ────────────────────────────────────────────
  ('LLY',   'Eli Lilly and Co',              'pharma',         'GLP-1 leader',           700),
  ('NVO',   'Novo Nordisk AS',               'pharma',         'GLP-1 leader',           500),
  ('PFE',   'Pfizer Inc',                    'pharma',         'big pharma',             180),
  ('MRK',   'Merck & Co',                    'pharma',         'big pharma',             290),
  ('JNJ',   'Johnson & Johnson',             'pharma',         'big pharma',             390),
  ('ABBV',  'AbbVie Inc',                    'pharma',         'big pharma',             310),
  ('AMGN',  'Amgen Inc',                     'biotech',        'biotech',                170),
  ('BMY',   'Bristol-Myers Squibb',          'pharma',         'big pharma',             100),
  ('GILD',  'Gilead Sciences',               'biotech',        'biotech',                100),
  ('REGN',  'Regeneron Pharmaceuticals',     'biotech',        'biotech',                105),
  ('VRTX',  'Vertex Pharmaceuticals',        'biotech',        'biotech',                120),
  ('MRNA',  'Moderna Inc',                   'biotech',        'mRNA platform',           15),
  ('BIIB',  'Biogen Inc',                    'biotech',        'neuroscience',            30),
  ('XBI',   'SPDR Biotech ETF',              'etf',            'biotech ETF',              0),
  ('IBB',   'iShares Biotech ETF',           'etf',            'biotech ETF',              0),

  -- ─── Defense / Aerospace ─────────────────────────────────────────────────
  ('LMT',   'Lockheed Martin Corp',          'defense',        'defense prime',          105),
  ('RTX',   'RTX Corp',                      'defense',        'defense prime',          140),
  ('NOC',   'Northrop Grumman Corp',         'defense',        'defense prime',           75),
  ('GD',    'General Dynamics Corp',         'defense',        'defense prime',           75),
  ('LHX',   'L3Harris Technologies',         'defense',        'defense tech',            40),
  ('HII',   'Huntington Ingalls Industries', 'defense',        'shipbuilding',            10),
  ('BA',    'Boeing Co',                     'aerospace',      'aerospace',              130),
  ('TXT',   'Textron Inc',                   'defense',        'aviation/defense',        15),
  ('KTOS',  'Kratos Defense & Security',     'defense',        'defense tech/drones',      3),
  ('LDOS',  'Leidos Holdings',               'defense',        'defense IT',              20),

  -- ─── EV / Battery / Lithium ──────────────────────────────────────────────
  ('TSLA',  'Tesla Inc',                     'ev',             'EV leader',              600),
  ('RIVN',  'Rivian Automotive',             'ev',             'EV',                      15),
  ('LCID',  'Lucid Group',                   'ev',             'EV',                       8),
  ('F',     'Ford Motor Co',                 'auto',           'legacy auto',             45),
  ('GM',    'General Motors Co',             'auto',           'legacy auto',             55),
  ('ALB',   'Albemarle Corp',                'materials',      'lithium',                 20),
  ('SQM',   'Sociedad Quimica y Minera',     'materials',      'lithium',                 15),
  ('LTHM',  'Livent Corp',                   'materials',      'lithium',                  5),
  ('BYDDY', 'BYD Co ADR',                    'ev',             'China EV ADR',            90),

  -- ─── Crypto / Digital Assets ─────────────────────────────────────────────
  ('COIN',  'Coinbase Global',               'fintech',        'crypto exchange',         60),
  ('MSTR',  'MicroStrategy Inc',             'fintech',        'BTC proxy',               30),
  ('MARA',  'Marathon Digital Holdings',     'fintech',        'BTC miner',                5),
  ('RIOT',  'Riot Platforms',                'fintech',        'BTC miner',                3),
  ('CLSK',  'CleanSpark Inc',                'fintech',        'BTC miner',                3),
  ('HOOD',  'Robinhood Markets',             'fintech',        'retail broker',           30),
  ('SQ',    'Block Inc',                     'fintech',        'fintech/crypto',          50),
  ('IBIT',  'iShares Bitcoin Trust',         'etf',            'BTC ETF',                  0),

  -- ─── REITs / Real Estate ─────────────────────────────────────────────────
  ('AVB',   'AvalonBay Communities',         'reit',           'apartment REIT',          30),
  ('EQR',   'Equity Residential',            'reit',           'apartment REIT',          25),
  ('MAA',   'Mid-America Apartment',         'reit',           'apartment REIT',          17),
  ('ESS',   'Essex Property Trust',          'reit',           'apartment REIT',          18),
  ('PLD',   'Prologis Inc',                  'reit',           'logistics REIT',         110),
  ('AMT',   'American Tower Corp',           'reit',           'cell tower REIT',        100),
  ('CCI',   'Crown Castle Inc',              'reit',           'cell tower REIT',         45),
  ('O',     'Realty Income Corp',            'reit',           'net lease REIT',          45),
  ('SPG',   'Simon Property Group',          'reit',           'mall REIT',               50),
  ('WELL',  'Welltower Inc',                 'reit',           'healthcare REIT',         80),
  ('PSA',   'Public Storage',                'reit',           'self-storage',            55),
  ('VNQ',   'Vanguard Real Estate ETF',      'etf',            'real estate ETF',          0),

  -- ─── Shipping / Logistics ────────────────────────────────────────────────
  ('ZIM',   'ZIM Integrated Shipping',       'shipping',       'container shipping',       3),
  ('MATX',  'Matson Inc',                    'shipping',       'container shipping',       5),
  ('KEX',   'Kirby Corp',                    'shipping',       'inland barges',            7),
  ('FDX',   'FedEx Corp',                    'logistics',      'logistics',               70),
  ('UPS',   'United Parcel Service',         'logistics',      'logistics',              130),
  ('XPO',   'XPO Inc',                       'logistics',      'trucking',                12),
  ('EXPD',  'Expeditors International',      'logistics',      'freight forwarding',      18),
  ('HUBG',  'Hub Group Inc',                 'logistics',      'intermodal',               3),

  -- ─── Consumer Discretionary ──────────────────────────────────────────────
  ('LVMUY', 'LVMH Moet Hennessy ADR',        'consumer',       'luxury',                 400),
  ('RH',    'RH (Restoration Hardware)',     'consumer',       'furniture',                5),
  ('WMT',   'Walmart Inc',                   'consumer',       'retail',                 500),
  ('COST',  'Costco Wholesale',              'consumer',       'warehouse retail',       380),
  ('DLTR',  'Dollar Tree Inc',               'consumer',       'discount retail',         28),
  ('DG',    'Dollar General Corp',           'consumer',       'discount retail',         30),
  ('TGT',   'Target Corp',                   'consumer',       'retail',                  70),
  ('CMG',   'Chipotle Mexican Grill',        'consumer',       'restaurant',              90),
  ('MCD',   'McDonald''s Corp',              'consumer',       'restaurant',             210),
  ('SBUX',  'Starbucks Corp',               'consumer',       'coffee',                  110),

  -- ─── Cannabis ────────────────────────────────────────────────────────────
  ('MSOS',  'AdvisorShares Pure Cannabis ETF','etf',           'cannabis ETF',             0),
  ('CGC',   'Canopy Growth Corp',            'cannabis',       'cannabis',                 1),
  ('TLRY',  'Tilray Brands',                 'cannabis',       'cannabis',                 1),
  ('CRON',  'Cronos Group',                  'cannabis',       'cannabis',                 1),
  ('GTBIF', 'Green Thumb Industries',        'cannabis',       'cannabis',                 3),

  -- ─── Gold / Precious Metals / Miners ─────────────────────────────────────
  ('GLD',   'SPDR Gold Shares ETF',          'etf',            'gold ETF',                 0),
  ('IAU',   'iShares Gold Trust',            'etf',            'gold ETF',                 0),
  ('NEM',   'Newmont Corp',                  'materials',      'gold miner',              55),
  ('GOLD',  'Barrick Gold Corp',             'materials',      'gold miner',              30),
  ('AEM',   'Agnico Eagle Mines',            'materials',      'gold miner',              45),
  ('FCX',   'Freeport-McMoRan Inc',          'materials',      'copper/gold',             60),
  ('SLV',   'iShares Silver Trust',          'etf',            'silver ETF',               0),
  ('PAAS',  'Pan American Silver',           'materials',      'silver miner',             8),

  -- ─── Clean Energy / Solar ────────────────────────────────────────────────
  ('ENPH',  'Enphase Energy',                'clean_energy',   'solar inverters',         10),
  ('FSLR',  'First Solar Inc',               'clean_energy',   'solar panels',            25),
  ('SEDG',  'SolarEdge Technologies',        'clean_energy',   'solar inverters',          3),
  ('RUN',   'Sunrun Inc',                    'clean_energy',   'residential solar',        3),
  ('ICLN',  'iShares Global Clean Energy',   'etf',            'clean energy ETF',         0),
  ('TAN',   'Invesco Solar ETF',             'etf',            'solar ETF',                0),
  ('LIT',   'Global X Lithium & Battery ETF','etf',            'lithium ETF',              0)

ON CONFLICT (symbol) DO NOTHING;
