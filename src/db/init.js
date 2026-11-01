import bcrypt from 'bcryptjs';
import { getPool } from './pool.js';

const schema = `
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS product_sizes (
  id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL, price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(product_id, name)
);
CREATE TABLE IF NOT EXISTS options (
  id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, category VARCHAR(30) NOT NULL CHECK(category IN ('topping','syrup','extra','mousse')),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK(price_cents >= 0), active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(name, category)
);
CREATE TABLE IF NOT EXISTS delivery_zones (
  id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, fee_cents INTEGER NOT NULL CHECK(fee_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(80) PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, phone VARCHAR(15) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY, customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL, order_code VARCHAR(20) NOT NULL UNIQUE, customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(30) NOT NULL, address TEXT NOT NULL, neighborhood VARCHAR(120) NOT NULL,
  notes TEXT NOT NULL DEFAULT '', scheduled_for TIMESTAMPTZ, fulfillment VARCHAR(20) NOT NULL DEFAULT 'delivery' CHECK(fulfillment='delivery'),
  items JSONB NOT NULL, subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents >= 0), delivery_fee_cents INTEGER NOT NULL CHECK(delivery_fee_cents >= 0),
  total_cents INTEGER NOT NULL CHECK(total_cents >= 0), status VARCHAR(30) NOT NULL DEFAULT 'new' CHECK(status IN ('new','preparing','out_for_delivery','delivered','cancelled')),
  whatsapp_opened BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY, customer_name VARCHAR(100) NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL, approved BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE,
  discount_type VARCHAR(10) NOT NULL CHECK(discount_type IN ('percent','fixed')),
  discount_value INTEGER NOT NULL CHECK(discount_value > 0),
  min_subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK(min_subtotal_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS reviews_approved_idx ON reviews(approved, created_at DESC);
CREATE TABLE IF NOT EXISTS loyalty_points (id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE, customer_phone VARCHAR(30) NOT NULL, points INTEGER NOT NULL CHECK(points >= 0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS loyalty_phone_idx ON loyalty_points(customer_phone);
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY, admin_id INTEGER, admin_email VARCHAR(255) NOT NULL,
  action VARCHAR(20) NOT NULL, route TEXT NOT NULL, status_code INTEGER NOT NULL,
  ip_address VARCHAR(120), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_logs(created_at DESC);
CREATE TABLE IF NOT EXISTS customer_favorites (
  id BIGSERIAL PRIMARY KEY, customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL, size_id INTEGER NOT NULL, option_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_favorites_customer_idx ON customer_favorites(customer_id, created_at DESC);
`;

const products = [
  { name: 'Açaí tradicional', description: 'Monte do seu jeito com acompanhamentos e caldas.', sizes: [['300 ml',1200],['400 ml',1600],['500 ml',1900],['700 ml',2300],['Pote de 1 litro',3800],['1 copo especial',3500]] }
];
const options = [
  ...['Paçoca','Granola','Amendoim','Granulado','Flocos de arroz','Chocobool','Sucrilhos','Leite em pó','Aveia','Jujuba'].map((name,i)=>({name,category:'topping',price:0,sort:i})),
  ...['Morango','Chocolate','Menta','Uva','Banana caramelizada','Maracujá'].map((name,i)=>({name,category:'syrup',price:0,sort:i})),
  ...[['Nutella',600],['Creme de paçoca',600],['Creme de avelã',500],['Creme de beijinho',600],['Ovomaltine',500],['Doce de leite',400]].map(([name,price],i)=>({name,category:'extra',price,sort:i})),
  ...[['Mousse de maracujá',500],['Mousse de morango',500],['Mousse de limão',500]].map(([name,price],i)=>({name,category:'mousse',price,sort:i}))
];
// Taxas provisórias por faixas de distância a partir do Cruzeiro (Vale do Paquequer).
// A lista foi reduzida para bairros próximos; confirme a distância pela rota antes de ativar vendas.
const zones = [
  ['Cruzeiro',500],
  ['Pessegueiros',1000], ['Andradas',1000], ['Santa Rita',1000], ['Campo Limpo',1000],
  ['Providência',1500], ['Ponte Nova',1500], ['Granja Mafra',1500]
];

export async function initializeDatabase() {
  const db = getPool();
  await db.query(schema);
  await db.query('DROP TABLE IF EXISTS admin_login_attempts');
  // Consolida produtos duplicados criados por inicializações anteriores.
  // Mantém o produto mais antigo e transfere tamanhos que ainda não existam nele.
  await db.query(`
    WITH ranked_products AS (
      SELECT id,
             FIRST_VALUE(id) OVER (PARTITION BY LOWER(TRIM(name)) ORDER BY id) AS keeper_id
      FROM products
    )
    INSERT INTO product_sizes(product_id, name, price_cents, active, sort_order)
    SELECT rp.keeper_id, ps.name, ps.price_cents, ps.active, ps.sort_order
    FROM product_sizes ps
    JOIN ranked_products rp ON rp.id = ps.product_id
    WHERE rp.id <> rp.keeper_id
    ON CONFLICT(product_id, name) DO NOTHING
  `);
  await db.query(`
    WITH ranked_products AS (
      SELECT id,
             FIRST_VALUE(id) OVER (PARTITION BY LOWER(TRIM(name)) ORDER BY id) AS keeper_id
      FROM products
    )
    DELETE FROM products p
    USING ranked_products rp
    WHERE p.id = rp.id AND rp.id <> rp.keeper_id
  `);
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS products_name_normalized_uidx ON products (LOWER(TRIM(name)))');
  // Compatibilidade com bancos já existentes: adiciona a forma de pagamento sem apagar pedidos.
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL");
  await db.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
  await db.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40) NOT NULL DEFAULT 'A combinar'");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_for VARCHAR(30)");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(40)");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS combo_discount_cents INTEGER NOT NULL DEFAULT 0");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_minutes_min INTEGER NOT NULL DEFAULT 35");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_minutes_max INTEGER NOT NULL DEFAULT 55");
  for (const [key,value] of Object.entries({
    manual_closed:'false', store_name:'Açaí da Roça', whatsapp_number: process.env.WHATSAPP_NUMBER || '5521969081157',
    timezone:'America/Sao_Paulo', opening_days:'2,3,4,5,6,0', opening_time:'13:30', closing_time:'22:00',
    minimum_schedule_minutes:'30', max_free_toppings:'5', combo_min_items:'2', combo_discount_percent:'5', estimated_minutes_min:'35', estimated_minutes_max:'55'
  })) await db.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',[key,value]);
  for (const product of products) {
    let productId = (await db.query('SELECT id FROM products WHERE LOWER(TRIM(name))=LOWER(TRIM($1)) ORDER BY id LIMIT 1',[product.name])).rows[0]?.id;
    if (!productId) productId = (await db.query('INSERT INTO products(name,description,sort_order) VALUES($1,$2,0) RETURNING id',[product.name,product.description])).rows[0].id;
    for (const [name,price] of product.sizes) await db.query('INSERT INTO product_sizes(product_id,name,price_cents) VALUES($1,$2,$3) ON CONFLICT(product_id,name) DO NOTHING',[productId,name,price]);
  }
  for (const item of options) await db.query('INSERT INTO options(name,category,price_cents,sort_order) VALUES($1,$2,$3,$4) ON CONFLICT(name,category) DO NOTHING',[item.name,item.category,item.price,item.sort]);
  // Desativa zonas antigas de demonstração que não pertencem à área de entrega solicitada.
  await db.query("UPDATE delivery_zones SET active=FALSE WHERE name = ANY($1::text[])", [['Centro','Alto','Várzea','Agriões','Barra do Imbuí']]);
  for (const [name,fee] of zones) await db.query('INSERT INTO delivery_zones(name,fee_cents) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET fee_cents=EXCLUDED.fee_cents, active=TRUE',[name,fee]);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await db.query('INSERT INTO admins(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO NOTHING',[process.env.ADMIN_EMAIL.toLowerCase(),hash]);
  }
  console.log('Banco de dados inicializado.');
}
