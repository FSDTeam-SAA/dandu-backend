/**
 * One-time migration: Normalize FBA-suffixed SKUs to base SKUs.
 *
 * Strips USFBA/CAFBA/USFBM/CAFBM/FBA/FBM/MFN suffixes from Product.sku,
 * then merges any duplicate product data (channels, stock, sales metrics).
 *
 * Usage: npx ts-node scripts/normalize-fba-skus.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizeSku(sku: string): string {
  if (!sku) return sku;
  return sku.replace(/(USFBA|CAFBA|USFBM|CAFBM|FBA|FBM|MFN)$/i, '').trim();
}

async function main() {
  console.log('Starting FBA SKU normalization migration...');

  // 1. Find all products
  const allProducts = await prisma.product.findMany({
    select: { id: true, sku: true },
  });

  console.log(`Found ${allProducts.length} total products`);

  // 2. Identify products that need normalization
  const needsNormalization = allProducts.filter((p) => {
    const normalized = normalizeSku(p.sku);
    return normalized !== p.sku;
  });

  console.log(
    `Found ${needsNormalization.length} products with FBA suffixes to normalize`,
  );

  if (needsNormalization.length === 0) {
    console.log('No products need normalization. Done.');
    return;
  }

  // 3. Group by base SKU to find duplicates
  const baseSkuMap = new Map<string, string[]>(); // baseSku → [suffixedSku, ...]
  for (const p of needsNormalization) {
    const base = normalizeSku(p.sku);
    const existing = baseSkuMap.get(base) ?? [];
    existing.push(p.sku);
    baseSkuMap.set(base, existing);
  }

  console.log(
    `Found ${baseSkuMap.size} unique base SKUs that have FBA variants`,
  );

  // 4. For each suffixed product, check if the base product already exists
  const allProductsMap = new Map(allProducts.map((p) => [p.sku, p.id]));

  let renamed = 0;
  let merged = 0;
  let deleted = 0;

  for (const [baseSku, suffixedSkus] of baseSkuMap) {
    const baseProductId = allProductsMap.get(baseSku);

    for (const suffixedSku of suffixedSkus) {
      const suffixedProductId = allProductsMap.get(suffixedSku);
      if (!suffixedProductId) continue;

      if (baseProductId) {
        // Base product exists — merge suffixed product's data into it, then delete suffixed product
        console.log(
          `Merging ${suffixedSku} → ${baseSku} (base already exists)`,
        );

        // Update channels to point to base product
        await prisma.productChannel.updateMany({
          where: { productId: suffixedProductId },
          data: { productId: baseProductId },
        });

        // Update stock to point to base product
        await prisma.productStock.updateMany({
          where: { productId: suffixedProductId },
          data: { productId: baseProductId },
        });

        // Update sales metrics to point to base product
        await prisma.productSalesMetric.updateMany({
          where: { productId: suffixedProductId },
          data: { productId: baseProductId },
        });

        // Delete the suffixed product
        await prisma.product.delete({
          where: { id: suffixedProductId },
        });

        merged++;
        deleted++;
      } else {
        // No base product exists — just rename the suffixed product
        console.log(`Renaming ${suffixedSku} → ${baseSku}`);
        await prisma.product.update({
          where: { id: suffixedProductId },
          data: { sku: baseSku },
        });
        renamed++;
      }
    }
  }

  console.log(`Migration complete:`);
  console.log(`  Renamed: ${renamed} products`);
  console.log(`  Merged: ${merged} products`);
  console.log(`  Deleted: ${deleted} duplicate products`);

  // 5. Verify no duplicate SKUs remain
  const finalProducts = await prisma.product.findMany({
    select: { sku: true },
  });
  const skuSet = new Set(finalProducts.map((p) => p.sku));
  if (skuSet.size !== finalProducts.length) {
    console.warn(
      `WARNING: ${finalProducts.length - skuSet.size} duplicate SKUs detected after migration!`,
    );
  } else {
    console.log(`All ${finalProducts.length} SKUs are unique. Migration successful.`);
  }
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
