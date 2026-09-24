// Disposable PostgreSQL WASM SQL test; no environment file or production connection.
// Install @electric-sql/pglite in a temporary directory, pass its dist/index.js path.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const root = new URL('../prisma/migrations/', import.meta.url);
const names = (await readdir(root)).filter(name => /^\d/.test(name)).sort();
const target = names.pop();
try {
  for (const name of names) await db.exec(await readFile(new URL(`${name}/migration.sql`, root), 'utf8'));
  await db.exec(`
    INSERT INTO "Restaurant" (id,name,slug,"updatedAt") VALUES ('fixture-r','Fixture','fixture',NOW());
    INSERT INTO "OrderSession" (id,label,"updatedAt") VALUES ('fixture-s','Fixture',NOW());
    INSERT INTO "Coupon" (id,code,"discountPercent","maxUses","usedCount","updatedAt")
      VALUES ('fixture-c','FIXTURE',10,1,0,NOW());
    INSERT INTO "Order" (id,"trackingCode","customerName","customerPhone","deliveryType",source,"paymentStatus",
      "subtotalPaise","platformFeePaise","totalPaise","restaurantId","sessionId","couponCode","updatedAt")
      SELECT 'order-'||n,'TRACK-'||n,'Fixture','9000000001','GATE','CUSTOMER_ONLINE','PENDING',100,0,90,'fixture-r','fixture-s','FIXTURE',NOW()
      FROM generate_series(1,2) n;
    INSERT INTO "Payment" (id,"orderId","razorpayOrderId","amountPaise","updatedAt")
      SELECT 'payment-'||n,'order-'||n,'provider-'||n,90,NOW() FROM generate_series(1,2) n;
  `);
  const sql = await readFile(new URL(`${target}/migration.sql`, root), 'utf8');
  // Duplicate historical gateway identifiers must abort the entire migration.
  await db.exec(`UPDATE "Payment" SET "razorpayOrderId"='provider-1' WHERE id='payment-2'`);
  await assert.rejects(db.exec(sql), /duplicate|unique/i);
  await db.exec('ROLLBACK');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='Coupon' AND column_name='heldCount'`)).rows[0].n, 0);
  await db.exec(`UPDATE "Payment" SET "razorpayOrderId"='provider-2' WHERE id='payment-2'`);
  await db.exec(sql);
  assert.equal((await db.query(`SELECT "heldCount" FROM "Coupon" WHERE id='fixture-c'`)).rows[0].heldCount, 1);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM "CouponReservation"`)).rows[0].n, 1);
  // The same conditional capacity SQL used by checkout cannot allocate twice.
  const result = await db.query(`UPDATE "Coupon" SET "heldCount"="heldCount"+1 WHERE id='fixture-c' AND ("maxUses" IS NULL OR "usedCount"+"heldCount"<"maxUses")`);
  assert.equal(result.affectedRows, 0);
  await assert.rejects(db.exec(`DELETE FROM "Order" WHERE id='order-2'`), /foreign key/i);
  console.log('PASS: migration chain, duplicate-ID rollback, legacy capacity backfill, conditional reservation and payment retention.');
} finally { await db.close(); }
